import type { World, Vec, Hit } from "./world";
import { inBounds, WORLD_HEIGHT } from "./world";

export type Stack = { id: number; count: number };
type Inventory = (Stack | null)[];
export interface Player {
  pos: Vec;
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  exhaustion: number;
  inventory: Inventory;
  selected: number;
  deathCause?: string;
  motion?: { velocity: Vec; apex: number; regen: number; starvation: number };
}
export interface Input {
  forward: number;
  side: number;
  jump: boolean;
  sprint: boolean;
  breaking: boolean;
}
const EPS = 1e-8;
const LOW: Vec = { x: -0.3, y: 0, z: -0.3 };
const HIGH: Vec = { x: 0.3, y: 1.8, z: 0.3 };
const durations = [0, 0.45, 0.4, 1.2, 0.8, 0.25];
type Axis = keyof Vec;
const otherAxes: Record<Axis, [Axis, Axis]> = {
  x: ["y", "z"],
  y: ["x", "z"],
  z: ["x", "y"],
};

function clone(inventory: Inventory): Inventory {
  return inventory.map((stack) => stack && { ...stack });
}

function insert(
  inventory: Inventory,
  incoming: Stack,
  start = 0,
  end = 36,
): number {
  let left = incoming.count;
  for (let i = start; i < end && left; i++) {
    const stack = inventory[i];
    if (stack?.id !== incoming.id) continue;
    const n = Math.min(left, 64 - stack.count);
    stack.count += n;
    left -= n;
  }
  for (let i = start; i < end && left; i++) {
    if (inventory[i]) continue;
    const n = Math.min(left, 64);
    inventory[i] = { id: incoming.id, count: n };
    left -= n;
  }
  return left;
}

function appleDrop(seed: number, hit: Hit): boolean {
  let n =
    seed ^
    Math.imul(hit.x, 73856093) ^
    Math.imul(hit.y, 19349663) ^
    Math.imul(hit.z, 83492791);
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return (n ^ (n >>> 16)) >>> 0 < 0x100000000 * 0.05;
}

function outside(x: number, z: number): boolean {
  return !inBounds(x, z);
}

function intersects(pos: Vec, cell: Vec): boolean {
  return (["x", "y", "z"] as const).every(
    (a) =>
      pos[a] + HIGH[a] > cell[a] + EPS && pos[a] + LOW[a] < cell[a] + 1 - EPS,
  );
}

export class Game {
  readonly world: World;
  readonly player: Player;
  velocity: Vec = { x: 0, y: 0, z: 0 };
  grounded = false;
  cause = "";
  progress = 0;
  cursor: Stack | null = null;
  notify: (msg: string) => void = () => {};
  sound: (event: string) => void = () => {};
  private rollback: Inventory | null = null;
  private source = 0;
  private target: Hit | null = null;
  private cooldown = 0;
  private apex: number;
  private regen = 0;
  private starvation = 0;
  private stride = 0;
  private heldJump = false;

  constructor(world: World, player?: Player) {
    this.world = world;
    this.player = player ?? {
      pos: { ...world.spawn },
      yaw: 0,
      pitch: 0,
      health: 20,
      hunger: 20,
      exhaustion: 0,
      inventory: Array<Stack | null>(36).fill(null),
      selected: 0,
    };
    const original = { ...this.player.pos };
    this.recover();
    this.apex = this.player.pos.y;
    const motion = this.player.motion;
    if (
      motion &&
      original.y === this.player.pos.y &&
      original.x === this.player.pos.x &&
      original.z === this.player.pos.z
    ) {
      this.velocity = { ...motion.velocity };
      this.apex = Math.max(motion.apex, this.player.pos.y);
      this.regen = motion.regen;
      this.starvation = motion.starvation;
    }
    delete this.player.motion;
    if (!this.player.health)
      this.cause =
        this.player.deathCause === "Fell from a high place" ||
        this.player.deathCause === "Starved"
          ? this.player.deathCause
          : this.player.hunger
            ? "Fell from a high place"
            : "Starved";
  }

  checkpoint(): Player {
    this.normalize();
    return structuredClone({
      ...this.player,
      motion: {
        velocity: this.velocity,
        apex: this.apex,
        regen: this.regen,
        starvation: this.starvation,
      },
    });
  }

  private solid(cell: Vec): boolean {
    return (
      outside(cell.x, cell.z) ||
      cell.y < 0 ||
      this.world.get(cell.x, cell.y, cell.z) !== 0
    );
  }

  private clear(pos: Vec): boolean {
    for (let x = Math.floor(pos.x - 0.3 + EPS); x < pos.x + 0.3 - EPS; x++)
      for (let z = Math.floor(pos.z - 0.3 + EPS); z < pos.z + 0.3 - EPS; z++)
        for (let y = Math.floor(pos.y + EPS); y < pos.y + 1.8 - EPS; y++)
          if (this.solid({ x, y, z })) return false;
    return true;
  }

  private recover(): void {
    const pos = this.player.pos;
    for (let i = 0; i <= 16; i++, pos.y++) if (this.clear(pos)) return;
    this.player.pos = { ...this.world.spawn };
    while (this.player.pos.y < WORLD_HEIGHT && !this.clear(this.player.pos))
      this.player.pos.y++;
  }

  // Sweep only the voxel slabs crossed by the leading face of the body.
  private travel(axis: Axis, distance: number): boolean {
    if (!distance) return false;
    const pos = this.player.pos;
    const [u, v] = otherAxes[axis];
    const sign = Math.sign(distance);
    const extent = sign > 0 ? HIGH[axis] : LOW[axis];
    const face = pos[axis] + extent;
    const first =
      sign > 0 ? Math.floor(face - EPS) + 1 : Math.ceil(face + EPS) - 2;
    const last = Math.floor(face + distance + sign * EPS);
    const cell = { x: 0, y: 0, z: 0 };
    for (let n = first; sign * n <= sign * last; n += sign) {
      cell[axis] = n;
      for (
        cell[u] = Math.floor(pos[u] + LOW[u] + EPS);
        cell[u] < pos[u] + HIGH[u] - EPS;
        cell[u]++
      )
        for (
          cell[v] = Math.floor(pos[v] + LOW[v] + EPS);
          cell[v] < pos[v] + HIGH[v] - EPS;
          cell[v]++
        )
          if (this.solid(cell)) {
            pos[axis] = n + (sign < 0 ? 1 : 0) - extent;
            this.velocity[axis] = 0;
            if (outside(cell.x, cell.z)) this.notify("World boundary reached");
            return true;
          }
    }
    pos[axis] += distance;
    return false;
  }

  step(dt: number, input: Input, hit: Hit | null): void {
    if (!Number.isFinite(dt) || dt <= 0 || !this.player.health) return;
    const ticks = Math.ceil(dt * 30);
    const time = dt / ticks;
    for (let i = 0; i < ticks && this.player.health; i++) {
      if (this.player.pos.y < -10) {
        this.damage(20, "Fell from a high place");
        break;
      }
      this.motion(time, input);
      if (!this.player.health) break;
      this.survive(time);
      this.cooldown = Math.max(0, this.cooldown - time);
      if (this.player.health && input.breaking && hit) this.mine(time, hit);
      else this.cancelBreak();
    }
  }

  private motion(dt: number, input: Input): void {
    const p = this.player;
    const { pos, yaw } = p;
    const v = this.velocity;
    const supportY = pos.y;
    const grounded = v.y <= 0 && this.travel("y", -0.015);
    if (!grounded) pos.y = supportY;
    const sprint = input.sprint && input.forward > 0;
    const speed =
      (sprint ? 6 : 4.3) / Math.max(1, Math.hypot(input.forward, input.side));
    const dx =
      speed * (Math.cos(yaw) * input.side - Math.sin(yaw) * input.forward) -
      v.x;
    const dz =
      speed * (-Math.cos(yaw) * input.forward - Math.sin(yaw) * input.side) -
      v.z;
    const gain = Math.min(
      1,
      ((grounded ? 40 : 10) * dt) / (Math.hypot(dx, dz) || 1),
    );
    v.x += dx * gain;
    v.z += dz * gain;
    if (grounded && input.jump && !this.heldJump) {
      v.y = 8;
      p.exhaustion += 0.2;
      this.sound("jump");
    }
    this.heldJump = input.jump;
    const { x, z } = pos;
    this.travel("x", dt * v.x);
    this.travel("z", dt * v.z);
    const nextV = Math.max(-40, v.y - dt * 24);
    const dy = (dt * (nextV + v.y)) / 2;
    v.y = nextV;
    this.apex = Math.max(this.apex, pos.y);
    this.grounded = this.travel("y", dy) && dy < 0;
    const distance = Math.hypot(pos.x - x, pos.z - z);
    p.exhaustion += distance * (sprint ? 0.1 : 0.01);
    if (this.grounded) {
      const fall = this.apex - pos.y;
      if (fall > 0.2) this.sound("land");
      if (fall > 3 + EPS)
        this.damage(
          Math.min(20, Math.ceil(fall - 3 - EPS)),
          "Fell from a high place",
        );
      this.apex = pos.y;
      this.stride += distance;
      if (this.stride >= 1.8) {
        this.stride %= 1.8;
        const floor = this.world.get(
          Math.floor(pos.x),
          Math.floor(pos.y - 0.01),
          Math.floor(pos.z),
        );
        this.sound(floor === 3 || floor === 6 ? "step-stone" : "step-soft");
      }
    }
  }

  private survive(dt: number): void {
    const p = this.player;
    if (p.exhaustion >= 4) {
      p.hunger = Math.max(0, p.hunger - Math.floor(p.exhaustion / 4));
      p.exhaustion %= 4;
    }
    this.regen = p.hunger >= 18 && p.health < 20 ? this.regen + dt : 0;
    this.starvation = p.hunger === 0 ? this.starvation + dt : 0;
    if (this.regen >= 4 - EPS) {
      this.regen = 0;
      p.health++;
      p.hunger--;
    }
    if (this.starvation >= 4 - EPS) {
      this.starvation = 0;
      this.damage(1, "Starved");
    }
  }

  private damage(amount: number, cause: string): void {
    this.player.health = Math.max(0, this.player.health - amount);
    this.sound("damage");
    if (!this.player.health) {
      this.cause = cause;
      this.player.deathCause = cause;
      this.sound("death");
      this.cancelBreak();
    }
  }

  respawn(): void {
    this.player.pos = { ...this.world.spawn };
    this.recover();
    const pos = this.player.pos;
    while (pos.y > 1 && this.clear({ ...pos, y: pos.y - 1 })) pos.y--;
    Object.assign(this.player, { health: 20, hunger: 18, exhaustion: 0 });
    this.velocity = { x: 0, y: 0, z: 0 };
    this.grounded = false;
    this.apex = this.player.pos.y;
    this.regen = this.starvation = this.stride = this.cooldown = 0;
    this.heldJump = false;
    this.cause = "";
    delete this.player.deathCause;
    this.cancelBreak();
  }

  private reachable(hit: Hit): boolean {
    const pos = this.player.pos;
    const delta = (eye: number, cell: number, normal: number): number =>
      normal === 0
        ? Math.max(cell - eye, eye - cell - 1, 0)
        : cell + (normal > 0 ? 1 : 0) - eye;
    return (
      Math.hypot(
        delta(pos.x, hit.x, hit.normal.x),
        delta(pos.y + 1.62, hit.y, hit.normal.y),
        delta(pos.z, hit.z, hit.normal.z),
      ) <=
      5 + EPS
    );
  }

  private mine(dt: number, hit: Hit): void {
    if (outside(hit.x, hit.z)) {
      this.notify("World boundary reached");
      this.cancelBreak();
      return;
    }
    if (
      !this.reachable(hit) ||
      this.world.get(hit.x, hit.y, hit.z) !== hit.id ||
      !durations[hit.id]
    ) {
      if (hit.id === 6 && this.reachable(hit)) this.notify("Unbreakable");
      this.cancelBreak();
      return;
    }
    const t = this.target;
    if (
      !t ||
      t.x !== hit.x ||
      t.y !== hit.y ||
      t.z !== hit.z ||
      t.id !== hit.id
    ) {
      this.progress = 0;
      this.target = { ...hit };
    }
    this.progress += dt / durations[hit.id];
    if (this.progress < 1 - EPS) return;
    const bag = clone(this.player.inventory);
    const full =
      insert(bag, { id: hit.id === 1 ? 2 : hit.id, count: 1 }) ||
      (hit.id === 5 &&
        appleDrop(this.world.seed, hit) &&
        insert(bag, { id: 7, count: 1 }));
    if (full) this.notify("Inventory full");
    else if (this.world.set(hit.x, hit.y, hit.z, 0)) {
      this.player.inventory = bag;
      this.sound(`break-${hit.id}`);
    }
    this.cancelBreak();
  }

  cancelBreak(): void {
    this.progress = 0;
    this.target = null;
  }

  use(hit: Hit | null): void {
    const p = this.player;
    const stack = p.inventory[p.selected];
    if (!p.health || !stack) return;
    if (stack.id === 7) {
      if (p.hunger === 20) {
        this.notify("Not hungry");
        return;
      }
      p.hunger = Math.min(20, p.hunger + 4);
      this.starvation = 0;
      this.sound("eat");
    } else {
      if (!hit || this.cooldown > EPS || !durations[stack.id]) return;
      const x = hit.x + hit.normal.x,
        y = hit.y + hit.normal.y,
        z = hit.z + hit.normal.z;
      if (outside(x, z) || outside(hit.x, hit.z)) {
        this.notify("World boundary reached");
        return;
      }
      if (
        !hit.id ||
        this.world.get(hit.x, hit.y, hit.z) !== hit.id ||
        !this.reachable(hit) ||
        y < 1 ||
        y >= WORLD_HEIGHT ||
        this.world.get(x, y, z) ||
        intersects(p.pos, { x, y, z })
      ) {
        this.notify("Cannot place block here");
        return;
      }
      if (!this.world.set(x, y, z, stack.id === 1 ? 2 : stack.id)) return;
      this.sound(`place-${stack.id}`);
      this.cooldown = 0.15;
    }
    if (!--stack.count) p.inventory[p.selected] = null;
  }

  slot(index: number, right: boolean, shift: boolean): void {
    if (!Number.isInteger(index) || index < 0 || index >= 36) return;
    const bag = this.player.inventory;
    const stack = bag[index];
    if (shift) {
      if (this.cursor || !stack) return;
      stack.count = insert(bag, stack, index < 9 ? 9 : 0, index < 9 ? 36 : 9);
      if (!stack.count) bag[index] = null;
    } else if (!this.cursor) {
      if (!stack) return;
      this.rollback = clone(bag);
      this.source = index;
      const count = right ? Math.ceil(stack.count / 2) : stack.count;
      this.cursor = { id: stack.id, count };
      stack.count -= count;
      if (!stack.count) bag[index] = null;
    } else if (!stack || stack.id === this.cursor.id) {
      const count = Math.min(
        right ? 1 : this.cursor.count,
        64 - (stack?.count ?? 0),
      );
      bag[index] = { id: this.cursor.id, count: (stack?.count ?? 0) + count };
      this.cursor.count -= count;
      if (!this.cursor.count) {
        this.cursor = null;
        this.rollback = null;
      }
    } else if (!right) {
      bag[index] = this.cursor;
      this.cursor = stack;
    }
    this.sound("inventory");
  }

  normalize(): void {
    if (!this.cursor) return;
    const bag = clone(this.player.inventory);
    const left = insert(bag, this.cursor, this.source, this.source + 1);
    const overflow = left && insert(bag, { id: this.cursor.id, count: left });
    // A swap following a split can leave no room for the displaced type.
    this.player.inventory = overflow && this.rollback ? this.rollback : bag;
    this.cursor = null;
    this.rollback = null;
  }
}
