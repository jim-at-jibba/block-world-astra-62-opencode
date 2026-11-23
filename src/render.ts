import * as THREE from "three";
import {
  CHUNK_MAX,
  CHUNK_MIN,
  WORLD_HEIGHT,
  World,
  sample,
  type Hit,
  type Vec,
} from "./world";

type RGB = readonly [number, number, number];
const COLORS: readonly RGB[] = [
  [126, 173, 76],
  [140, 99, 65],
  [139, 103, 70],
  [151, 153, 148],
  [114, 83, 54],
  [178, 137, 86],
  [76, 135, 64],
  [79, 81, 86],
];
const GRASS: RGB = [115, 163, 68];

function atlas(): THREE.DataTexture {
  const width = 16 * COLORS.length,
    pixels = new Uint8Array(width * 16 * 4);
  for (let tile = 0; tile < COLORS.length; tile++)
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = sample(91 + tile, x, y),
          coarse = sample(77 + tile, x >> 1, y >> 1);
        let base = COLORS[tile],
          v = (n - 0.5) * 14 + (coarse - 0.5) * 19,
          alpha = 255;
        if (tile === 0) v += sample(329, x >> 1, y) > 0.8 ? 12 : 0;
        if (tile === 1 && y >= 12 - Math.floor(sample(332, x, 1) * 3))
          base = GRASS;
        if ((tile === 1 || tile === 2) && coarse < 0.1) v -= 16;
        if (tile === 3 || tile === 7)
          v +=
            (sample(39, (x + (y >> 2)) >> 2, y >> 1) - 0.5) *
            (tile === 7 ? 58 : 20);
        if (tile === 4)
          v += (sample(131, x, y >> 3) - 0.5) * 42 + (x % 5 === 0 ? -16 : 0);
        if (tile === 5) {
          const ring = Math.max(Math.abs(x - 7.5), Math.abs(y - 8));
          v += Math.floor(ring) % 3 === 1 ? -25 : 8;
          if (ring > 6.8) base = COLORS[4];
        }
        if (tile === 6) {
          v += coarse < 0.4 ? -18 : 12;
          alpha = n < 0.12 || coarse < 0.04 ? 0 : 255;
        }
        const i = (y * width + tile * 16 + x) * 4;
        pixels[i] = base[0] + v;
        pixels[i + 1] = base[1] + v;
        pixels[i + 2] = base[2] + v;
        pixels[i + 3] = alpha;
      }
  const texture = new THREE.DataTexture(pixels, width, 16, THREE.RGBAFormat);
  texture.magFilter = texture.minFilter = THREE.NearestFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

const FACES = [
  {
    n: [1, 0, 0],
    p: [
      [1, 0, 1],
      [1, 0, 0],
      [1, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    n: [-1, 0, 0],
    p: [
      [0, 0, 0],
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
  },
  {
    n: [0, 1, 0],
    p: [
      [0, 1, 1],
      [1, 1, 1],
      [1, 1, 0],
      [0, 1, 0],
    ],
  },
  {
    n: [0, -1, 0],
    p: [
      [0, 0, 0],
      [1, 0, 0],
      [1, 0, 1],
      [0, 0, 1],
    ],
  },
  {
    n: [0, 0, 1],
    p: [
      [0, 0, 1],
      [1, 0, 1],
      [1, 1, 1],
      [0, 1, 1],
    ],
  },
  {
    n: [0, 0, -1],
    p: [
      [1, 0, 0],
      [0, 0, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  },
] as const;

type Buffers = {
  pos: number[];
  normals: number[];
  uv: number[];
  idx: number[];
};
const empty = (): Buffers => ({ pos: [], normals: [], uv: [], idx: [] });

export function visibleFace(block: number, neighbor: number): boolean {
  return block !== 0 && (neighbor === 0 || (neighbor === 5 && block !== 5));
}

function face(
  b: Buffers,
  x: number,
  y: number,
  z: number,
  id: number,
  side: number,
): void {
  const f = FACES[side],
    start = b.pos.length / 3;
  const tile =
    id === 1
      ? side === 2
        ? 0
        : side === 3
          ? 2
          : 1
      : id === 4
        ? side === 2 || side === 3
          ? 5
          : 4
        : id === 5
          ? 6
          : id === 6
            ? 7
            : id;
  for (let k = 0; k < 4; k++) {
    b.pos.push(x + f.p[k][0], y + f.p[k][1], z + f.p[k][2]);
    b.normals.push(...f.n);
    b.uv.push(
      (tile + (k === 1 || k === 2 ? 0.9999 : 0.0001)) / COLORS.length,
      k >= 2 ? 0.9999 : 0.0001,
    );
  }
  b.idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

export function meshData(world: World, cx: number, cz: number): Buffers[] {
  const blocks = world.blocks(cx, cz);
  const xp = cx < CHUNK_MAX ? world.blocks(cx + 1, cz) : null;
  const xm = cx > CHUNK_MIN ? world.blocks(cx - 1, cz) : null;
  const zp = cz < CHUNK_MAX ? world.blocks(cx, cz + 1) : null;
  const zm = cz > CHUNK_MIN ? world.blocks(cx, cz - 1) : null;
  const opaque = empty(),
    leaves = empty();
  for (let i = 0; i < blocks.length; i++) {
    const id = blocks[i];
    if (!id) continue;
    const x = i & 15,
      z = (i >> 4) & 15,
      y = i >> 8,
      b = id === 5 ? leaves : opaque;
    if (visibleFace(id, x < 15 ? blocks[i + 1] : (xp?.[i - 15] ?? 6)))
      face(b, x, y, z, id, 0);
    if (visibleFace(id, x > 0 ? blocks[i - 1] : (xm?.[i + 15] ?? 6)))
      face(b, x, y, z, id, 1);
    if (visibleFace(id, y < WORLD_HEIGHT - 1 ? blocks[i + 256] : 0))
      face(b, x, y, z, id, 2);
    if (visibleFace(id, y > 0 ? blocks[i - 256] : 6)) face(b, x, y, z, id, 3);
    if (visibleFace(id, z < 15 ? blocks[i + 16] : (zp?.[i - 240] ?? 6)))
      face(b, x, y, z, id, 4);
    if (visibleFace(id, z > 0 ? blocks[i - 16] : (zm?.[i + 240] ?? 6)))
      face(b, x, y, z, id, 5);
  }
  return [opaque, leaves];
}

type Tile = { cx: number; cz: number; key: string };
type ChunkMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const SKY = 0x9bd8ed;

export class Renderer {
  private readonly gl: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(75, 1, 0.035, 280);
  private readonly fog = new THREE.Fog(SKY, 68, 100);
  private readonly texture = atlas();
  private readonly materials = [
    new THREE.MeshLambertMaterial({ map: this.texture }),
    new THREE.MeshLambertMaterial({ map: this.texture, alphaTest: 0.5 }),
  ];
  private readonly outline: THREE.LineSegments<
    THREE.EdgesGeometry,
    THREE.LineBasicMaterial
  >;
  private readonly chunks = new Map<string, ChunkMesh[]>();
  private queue: Tile[] = [];
  private region = "";
  private size = "";
  private readonly canvas: HTMLCanvasElement;
  private readonly world: World;

  constructor(canvas: HTMLCanvasElement, world: World) {
    this.canvas = canvas;
    this.world = world;
    this.gl = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = this.fog;
    this.scene.add(new THREE.HemisphereLight(0xfffcf1, 0xb4bdaf, 1.85));
    const sun = new THREE.DirectionalLight(0xffefc9, 1.25);
    sun.position.set(-40, 70, 32);
    this.scene.add(sun);
    const box = new THREE.BoxGeometry(1.008, 1.008, 1.008);
    this.outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(box),
      new THREE.LineBasicMaterial({ color: 0x263b2a }),
    );
    box.dispose();
    this.scene.add(this.outline);
  }

  get loaded(): number {
    return this.chunks.size;
  }
  get queued(): number {
    return this.queue.length;
  }

  private remove(key: string): void {
    for (const mesh of this.chunks.get(key) ?? []) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    this.chunks.delete(key);
  }

  private build(tile: Tile): void {
    this.remove(tile.key);
    const meshes: ChunkMesh[] = [];
    meshData(this.world, tile.cx, tile.cz).forEach((b, i) => {
      if (!b.idx.length) return;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(b.normals, 3),
      );
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx);
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, this.materials[i]);
      mesh.position.set(tile.cx * 16, 0, tile.cz * 16);
      mesh.updateMatrix();
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
      meshes.push(mesh);
    });
    this.chunks.set(tile.key, meshes);
    this.world.dirty.delete(tile.key);
  }

  private stream(cx: number, cz: number, distance: number): void {
    const region = `${cx},${cz},${distance}`;
    if (region !== this.region) {
      this.region = region;
      this.queue = [];
      for (const key of this.chunks.keys()) {
        const [x, z] = key.split(",").map(Number);
        if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) > distance + 2)
          this.remove(key);
      }
      this.world.trim(cx, cz, distance + 2);
      for (
        let x = Math.max(CHUNK_MIN, cx - distance);
        x <= Math.min(CHUNK_MAX, cx + distance);
        x++
      )
        for (
          let z = Math.max(CHUNK_MIN, cz - distance);
          z <= Math.min(CHUNK_MAX, cz + distance);
          z++
        ) {
          const key = `${x},${z}`;
          if (!this.chunks.has(key)) this.queue.push({ cx: x, cz: z, key });
        }
      this.queue.sort(
        (a, b) =>
          (a.cx - cx) ** 2 +
          (a.cz - cz) ** 2 -
          (b.cx - cx) ** 2 -
          (b.cz - cz) ** 2,
      );
    }
    for (const key of this.world.dirty) {
      const [x, z] = key.split(",").map(Number);
      if (!this.chunks.has(key)) {
        this.world.dirty.delete(key);
      } else if (!this.queue.some((t) => t.key === key))
        this.queue.unshift({ cx: x, cz: z, key });
    }
    const deadline = performance.now() + 5;
    do {
      const next = this.queue.shift();
      if (!next) break;
      this.build(next);
    } while (performance.now() < deadline);
  }

  frame(
    pos: Vec,
    yaw: number,
    pitch: number,
    fov: number,
    distance: number,
    target: Hit | null,
  ): void {
    const w = Math.max(1, this.canvas.clientWidth),
      h = Math.max(1, this.canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2),
      size = `${w}/${h}/${dpr}/${fov}`;
    if (size !== this.size) {
      this.size = size;
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.fog.near = distance * 9;
    this.fog.far = distance * 16;
    this.camera.position.set(pos.x, pos.y + 1.62, pos.z);
    this.camera.rotation.set(pitch, yaw, 0, "YXZ");
    this.stream(Math.floor(pos.x / 16), Math.floor(pos.z / 16), distance);
    this.outline.visible = target !== null;
    if (target)
      this.outline.position.set(target.x + 0.5, target.y + 0.5, target.z + 0.5);
    this.gl.render(this.scene, this.camera);
  }

  dispose(): void {
    for (const key of this.chunks.keys()) this.remove(key);
    this.queue = [];
    this.scene.clear();
    this.outline.geometry.dispose();
    this.outline.material.dispose();
    this.materials.forEach((m) => m.dispose());
    this.texture.dispose();
    this.gl.forceContextLoss();
    this.gl.dispose();
  }
}
