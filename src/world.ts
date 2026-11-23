export type Vec = { x: number; y: number; z: number };
export type Hit = Vec & { id: number; normal: Vec };
export type Edits = Record<string, Record<string, number>>;
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 96;
export const CHUNK_MIN = -128;
export const CHUNK_MAX = 127;
export const inBounds = (x: number, z: number): boolean =>
  x >= CHUNK_MIN * 16 &&
  x < (CHUNK_MAX + 1) * 16 &&
  z >= CHUNK_MIN * 16 &&
  z < (CHUNK_MAX + 1) * 16;

// Generation v1: coordinate-addressed 32-bit PRNG with two avalanche multiply/xor rounds.
// Independent coordinate samples make generation insensitive to streaming order.
export function sample(seed: number, x: number, z: number): number {
  let h = seed ^ Math.imul(x, 0x1f1f1f1f) ^ Math.imul(z, 0x6c8e9cf5);
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(seed: number, x: number, z: number): number {
  const i = Math.floor(x),
    j = Math.floor(z);
  const u = x - i,
    v = z - j;
  const s = u * u * (3 - 2 * u),
    t = v * v * (3 - 2 * v);
  const a = sample(seed, i, j),
    b = sample(seed, i + 1, j);
  const c = sample(seed, i, j + 1),
    d = sample(seed, i + 1, j + 1);
  return (a + (b - a) * s) * (1 - t) + (c + (d - c) * s) * t;
}

export function surface(seed: number, x: number, z: number): number {
  return Math.round(
    28 +
      noise(seed ^ 72651, x / 36, z / 36) * 17 +
      noise(seed ^ 3982, x / 9, z / 9) * 7,
  );
}

function findSpawn(seed: number): { spawn: Vec; platform: boolean } {
  for (let r = 0; r <= 32; r++) {
    for (let z = -r; z <= r; z++)
      for (let x = -r; x <= r; x++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== r) continue;
        const y = surface(seed, x, z);
        if (
          [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ].every(
            ([dx, dz]) => Math.abs(surface(seed, x + dx, z + dz) - y) <= 1,
          )
        )
          return {
            spawn: { x: x + 0.5, y: y + 1.01, z: z + 0.5 },
            platform: false,
          };
      }
  }
  return {
    spawn: { x: 0.5, y: surface(seed, 0, 0) + 1.01, z: 0.5 },
    platform: true,
  };
}

export const cell = (x: number, y: number, z: number): number =>
  y * 256 + (z & 15) * 16 + (x & 15);
type Chunk = { base: Uint8Array; blocks: Uint8Array };

export class World {
  readonly seed: number;
  readonly spawn: Vec;
  readonly edits: Edits;
  readonly dirty = new Set<string>();
  private readonly cache = new Map<string, Chunk>();
  private readonly platform: boolean;

  constructor(seed: number, edits: Edits = {}) {
    this.seed = seed | 0;
    const start = findSpawn(this.seed);
    this.spawn = start.spawn;
    this.platform = start.platform;
    this.edits = structuredClone(edits);
  }

  chunkKey(x: number, z: number): string {
    return `${Math.floor(x / 16)},${Math.floor(z / 16)}`;
  }

  private generate(cx: number, cz: number): Uint8Array {
    const data = new Uint8Array(256 * WORLD_HEIGHT),
      ox = cx * 16,
      oz = cz * 16;
    for (let z = oz; z < oz + 16; z++)
      for (let x = ox; x < ox + 16; x++) {
        const yTop =
          this.platform && Math.abs(x) <= 1 && Math.abs(z) <= 1
            ? Math.floor(this.spawn.y) - 1
            : surface(this.seed, x, z);
        for (let y = 0; y <= yTop; y++)
          data[cell(x, y, z)] =
            y === 0 ? 6 : y === yTop ? 1 : y >= yTop - 3 ? 2 : 3;
      }
    // Scan a two-cell halo so each canopy is identical from either side of a seam.
    for (let z = oz - 2; z < oz + 18; z++)
      for (let x = ox - 2; x < ox + 18; x++) {
        if (
          !inBounds(x, z) ||
          sample(this.seed ^ 59420, x, z) >= 0.015 ||
          Math.max(
            Math.abs(x - Math.floor(this.spawn.x)),
            Math.abs(z - Math.floor(this.spawn.z)),
          ) <= 4
        )
          continue;
        const base = surface(this.seed, x, z),
          tip = base + 4 + Math.floor(sample(this.seed ^ 82012, x, z) * 3);
        if (x >= ox && x < ox + 16 && z >= oz && z < oz + 16) {
          for (let y = base + 1; y <= tip; y++) data[cell(x, y, z)] = 4;
        }
        for (let dy = -2; dy <= 1; dy++)
          for (let dz = -2; dz <= 2; dz++)
            for (let dx = -2; dx <= 2; dx++) {
              const tx = x + dx,
                tz = z + dz;
              if (
                tx < ox ||
                tx >= ox + 16 ||
                tz < oz ||
                tz >= oz + 16 ||
                dx * dx + dz * dz > (dy === 1 ? 2 : dy === -2 ? 5 : 6)
              )
                continue;
              const index = cell(tx, tip + dy, tz);
              if (!data[index]) data[index] = 5;
            }
      }
    return data;
  }

  private chunk(cx: number, cz: number): Chunk {
    const key = `${cx},${cz}`;
    let chunk = this.cache.get(key);
    if (chunk) return chunk;
    const base = this.generate(cx, cz),
      overlay = this.edits[key];
    const blocks = overlay ? base.slice() : base;
    if (overlay)
      for (const [coord, id] of Object.entries(overlay)) {
        const [x, y, z] = coord.split(",").map(Number);
        blocks[cell(x, y, z)] = id;
      }
    chunk = { base, blocks };
    this.cache.set(key, chunk);
    return chunk;
  }

  blocks(cx: number, cz: number): Uint8Array {
    return this.chunk(cx, cz).blocks;
  }

  trim(cx: number, cz: number, radius: number): void {
    for (const key of this.cache.keys()) {
      const [x, z] = key.split(",").map(Number);
      if (Math.max(Math.abs(cx - x), Math.abs(cz - z)) > radius)
        this.cache.delete(key);
    }
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || !inBounds(x, z)) return 6;
    if (y >= WORLD_HEIGHT) return 0;
    return this.blocks(Math.floor(x / 16), Math.floor(z / 16))[
      cell(Math.floor(x), Math.floor(y), Math.floor(z))
    ];
  }

  set(x: number, y: number, z: number, id: number): boolean {
    if (
      ![x, y, z, id].every(Number.isInteger) ||
      !inBounds(x, z) ||
      y <= 0 ||
      y >= WORLD_HEIGHT ||
      id < 0 ||
      id > 5
    )
      return false;
    const key = this.chunkKey(x, z),
      coord = `${x},${y},${z}`,
      i = cell(x, y, z);
    const chunk = this.chunk(Math.floor(x / 16), Math.floor(z / 16));
    if (chunk.blocks[i] === id) return false;
    if (chunk.blocks === chunk.base) chunk.blocks = chunk.base.slice();
    chunk.blocks[i] = id;
    if (chunk.base[i] === id) {
      delete this.edits[key][coord];
      if (!Object.keys(this.edits[key]).length) {
        delete this.edits[key];
        chunk.blocks = chunk.base;
      }
    } else (this.edits[key] ??= {})[coord] = id;
    for (const [dx, dz] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ]) {
      if (inBounds(x + dx, z + dz))
        this.dirty.add(this.chunkKey(x + dx, z + dz));
    }
    return true;
  }
}

export function raycast(
  world: Pick<World, "get">,
  origin: Vec,
  dir: Vec,
  reach = 5,
): Hit | null {
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (!len || !Number.isFinite(len)) return null;
  const p = [origin.x, origin.y, origin.z],
    voxel = p.map(Math.floor);
  const d = [dir.x / len, dir.y / len, dir.z / len],
    step = d.map(Math.sign);
  const delta = d.map((v) => (v === 0 ? Infinity : Math.abs(1 / v)));
  const next = d.map((v, i) =>
    v === 0 ? Infinity : (voxel[i] + (v > 0 ? 1 : 0) - p[i]) / v,
  );
  let normal: Vec = { x: 0, y: 0, z: 0 };
  for (let dist = 0; dist <= Math.min(5, reach);) {
    const [x, y, z] = voxel,
      id = world.get(x, y, z);
    if (id) return { x, y, z, id, normal };
    const axis =
      next[0] <= next[1] && next[0] <= next[2] ? 0 : next[1] <= next[2] ? 1 : 2;
    dist = next[axis];
    voxel[axis] += step[axis];
    next[axis] += delta[axis];
    normal = {
      x: axis === 0 ? -step[0] : 0,
      y: axis === 1 ? -step[1] : 0,
      z: axis === 2 ? -step[2] : 0,
    };
  }
  return null;
}
