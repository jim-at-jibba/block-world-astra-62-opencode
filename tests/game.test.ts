import { afterEach, describe, expect, it, vi } from "vitest";
import { Game, type Input } from "../src/game";
import { World, type Hit, type Vec } from "../src/world";
import { load, save } from "../src/store";

const idle: Input = {
  forward: 0,
  side: 0,
  jump: false,
  sprint: false,
  breaking: false,
};
const mining = { ...idle, breaking: true };
const up = { x: 0, y: 1, z: 0 };
const grass: Hit = { x: 0, y: 67, z: -1, id: 1, normal: up };
const arena = (): Game => {
  const world = new World(17);
  for (let x = -3; x <= 3; x++)
    for (let z = -5; z <= 3; z++) world.set(x, 67, z, 1);
  const game = new Game(world);
  game.player.pos = { x: 0.5, y: 68, z: 0.5 };
  return game;
};
function roundTrip(game: Game): Game {
  const db = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    setItem: (k: string, v: string) => db.set(k, v),
    getItem: (k: string) => db.get(k) ?? null,
  });
  const id = "c50db685-ff1d-47ca-bdee-54c1b240e85a";
  game.normalize();
  save({
    id,
    name: "Test",
    seed: game.world.seed,
    created: 100,
    lastPlayed: 100,
    schemaVersion: 1,
    genVersion: 1,
    gameVersion: "1",
    spawn: game.world.spawn,
    edits: game.world.edits,
    player: game.player,
  });
  const result = load(id);
  return new Game(new World(result.seed, result.edits), result.player);
}
afterEach(() => vi.unstubAllGlobals());

describe("controller", () => {
  it("sweeps into floor, perpendicular walls and corner, even across long frames", () => {
    const g = arena();
    g.world.set(1, 68, 0, 5);
    g.world.set(0, 68, -1, 3);
    g.player.pos.y += 1;
    g.step(1, idle, null);
    expect(g.grounded).toBe(true);
    g.step(1, { ...idle, forward: 1, side: 1 }, null);
    expect(g.player.pos).toEqual({ x: 0.7, y: 68, z: 0.3 });
  });
  it("jump is edge triggered, stops at ceilings and cannot restart midair", () => {
    const g = arena();
    g.world.set(0, 70, 0, 2);
    const jump = { ...idle, jump: true };
    g.step(1 / 30, jump, null);
    expect(g.player.pos.y).toBeCloseTo(68.2);
    expect(g.velocity.y).toBe(0);
    g.step(1 / 60, idle, null);
    g.step(1 / 60, jump, null);
    expect(g.velocity.y).toBeLessThan(0);
    g.step(1, jump, null);
    expect(g.player.pos.y).toBe(68);
    expect(g.player.exhaustion).toBeCloseTo(0.2);
  });
  it.each([
    [3, 20],
    [3.01, 19],
    [5, 18],
  ])("fall distance %d leaves %d health", (height, health) => {
    const g = arena();
    g.player.pos.y += height;
    g.step(2, idle, null);
    expect(g.player.health).toBe(health);
  });
  it("caps terminal velocity and respawns after a fatal fall without losing inventory or edits", () => {
    const g = arena();
    g.player.inventory[9] = { id: 4, count: 17 };
    g.player.pos.y = 200;
    g.step(2, idle, null);
    expect(g.velocity.y).toBe(-40);
    g.step(4, idle, null);
    expect(g.cause).toBe("Fell from a high place");
    expect(g.player.health).toBe(0);
    g.respawn();
    expect(g.player).toMatchObject({
      health: 20,
      hunger: 18,
      pos: g.world.spawn,
    });
    expect(g.velocity.y).toBe(0);
    expect(g.player.inventory[9]).toEqual({ id: 4, count: 17 });
    expect(g.world.get(0, 67, 0)).toBe(1);
  });
  it("recovers intersecting saved feet upwards", () => {
    const g = arena();
    g.player.pos.y = 67;
    expect(new Game(g.world, g.player).player.pos.y).toBe(68);
  });
  it("stops the entire body at the horizontal world boundary", () => {
    const g = arena();
    g.player.pos = { x: 2047.5, y: 68, z: 0.5 };
    g.world.set(2047, 67, 0, 3);
    g.notify = vi.fn();
    g.step(0.5, { ...idle, side: 1 }, null);
    expect(g.player.pos.x).toBeCloseTo(2047.7);
    expect(g.notify).toHaveBeenCalledWith("World boundary reached");
  });
});

describe("inventory transactions", () => {
  it("splits rounded up, places singles, merges, shift fills matches before empties", () => {
    const g = arena(),
      bag = g.player.inventory;
    bag[0] = { id: 2, count: 9 };
    bag[12] = { id: 2, count: 60 };
    g.slot(0, true, false);
    expect(g.cursor?.count).toBe(5);
    g.slot(8, true, false);
    g.slot(0, false, false);
    expect(bag[0]?.count).toBe(8);
    expect(bag[8]?.count).toBe(1);
    g.slot(0, false, true);
    expect(bag[12]?.count).toBe(64);
    expect(bag[9]?.count).toBe(4);
    g.slot(9, false, true);
    expect(bag[8]?.count).toBe(5);
    expect(bag[9]).toBeNull();
  });
  it("rolls back a full-inventory split/swap if the held type cannot fit", () => {
    const g = arena();
    g.player.inventory = Array.from({ length: 36 }, () => ({
      id: 2,
      count: 64,
    }));
    g.player.inventory[1] = { id: 3, count: 64 };
    const before = structuredClone(g.player.inventory);
    g.slot(0, true, false);
    g.slot(1, false, false);
    expect(g.cursor?.id).toBe(3);
    g.normalize();
    expect(g.player.inventory).toEqual(before);
    expect(g.cursor).toBeNull();
  });
  it("returns a partial cursor to source while retaining distributed singles", () => {
    const g = arena();
    g.player.inventory[4] = { id: 5, count: 12 };
    g.slot(4, true, false);
    g.slot(5, true, false);
    g.normalize();
    expect(g.player.inventory[4]?.count).toBe(11);
    expect(g.player.inventory[5]?.count).toBe(1);
  });
});

describe("block interactions", () => {
  it("breaks grass into dirt, stacking hotbar before storage, and persists both changes", () => {
    const g = arena();
    g.player.inventory[5] = { id: 2, count: 63 };
    g.player.inventory[9] = { id: 2, count: 10 };
    g.step(0.44, mining, grass);
    expect(g.world.get(0, 67, -1)).toBe(1);
    g.step(0.01, mining, grass);
    const restored = roundTrip(g);
    expect(restored.world.get(0, 67, -1)).toBe(0);
    expect(restored.player.inventory[5]?.count).toBe(64);
    expect(restored.player.inventory[9]?.count).toBe(10);
  });
  it("resets on release, target change, looking away and out-of-range hits", () => {
    const g = arena();
    g.step(0.2, mining, grass);
    g.step(0.1, mining, { ...grass, x: 1 });
    expect(g.progress).toBeCloseTo(0.1 / 0.45);
    g.step(0.1, idle, grass);
    expect(g.progress).toBe(0);
    g.step(0.2, mining, grass);
    g.step(0.01, mining, null);
    expect(g.progress).toBe(0);
    g.world.set(6, 67, 0, 1);
    g.step(1, mining, { ...grass, x: 6, z: 0 });
    expect(g.world.get(6, 67, 0)).toBe(1);
    expect(g.progress).toBe(0);
  });
  it("rejects a break atomically if inventory is full", () => {
    const g = arena();
    g.notify = vi.fn();
    g.player.inventory = Array.from({ length: 36 }, () => ({
      id: 2,
      count: 64,
    }));
    g.step(0.45, mining, grass);
    expect(g.notify).toHaveBeenCalledWith("Inventory full");
    expect(g.progress).toBe(0);
    expect(g.world.get(0, 67, -1)).toBe(1);
  });
  it("requires room for both deterministic leaf drops after reloading", () => {
    const g = arena();
    const hit = { x: -2, y: 69, z: 0, id: 5, normal: { x: 1, y: 0, z: 0 } };
    g.world.set(hit.x, hit.y, hit.z, hit.id);
    g.player.inventory = Array.from({ length: 36 }, () => ({
      id: 5,
      count: 64,
    }));
    g.player.inventory[6] = { id: 5, count: 63 };
    g.step(0.25, mining, hit);
    expect(g.world.get(hit.x, hit.y, hit.z)).toBe(5);
    expect(g.player.inventory[6]?.count).toBe(63);
    const restored = roundTrip(g);
    restored.player.inventory[30] = null;
    restored.step(0.25, mining, hit);
    expect(restored.world.get(hit.x, hit.y, hit.z)).toBe(0);
    expect(restored.player.inventory[6]?.count).toBe(64);
    expect(restored.player.inventory[30]).toEqual({ id: 7, count: 1 });
  });
  it("blocks placement inside player, on occupied cells and on cooldown", () => {
    const g = arena();
    g.player.inventory[0] = { id: 3, count: 2 };
    g.use({ ...grass, z: 0 });
    expect(g.player.inventory[0]?.count).toBe(2);
    g.use(grass);
    g.use({ ...grass, x: 1 });
    expect(g.world.get(1, 68, -1)).toBe(0);
    g.step(0.15, idle, null);
    g.use(grass);
    expect(g.player.inventory[0]?.count).toBe(1);
    g.use({ ...grass, x: 1 });
    expect(g.player.inventory[0]).toBeNull();
  });
  it.each<Vec>([
    up,
    { x: 0, y: -1, z: 0 },
    { x: 1, y: 0, z: 0 },
    { x: -1, y: 0, z: 0 },
    { x: 0, y: 0, z: 1 },
    { x: 0, y: 0, z: -1 },
  ])("places against face %j", (normal) => {
    const g = arena();
    g.world.set(0, 69, -2, 3);
    g.player.inventory[0] = { id: 4, count: 1 };
    g.use({ x: 0, y: 69, z: -2, normal, id: 3 });
    expect(g.world.get(normal.x, 69 + normal.y, -2 + normal.z)).toBe(4);
  });
  it("places across chunk edge, invalidates both meshes and persists", () => {
    const g = arena();
    g.player.pos = { x: 15.5, y: 68, z: 2.5 };
    g.world.set(15, 68, 2, 4);
    g.player.pos.z = 4;
    g.world.dirty.clear();
    g.player.inventory[0] = { id: 3, count: 1 };
    g.use({ x: 15, y: 68, z: 2, id: 4, normal: { x: 1, y: 0, z: 0 } });
    expect(g.world.dirty).toEqual(new Set(["0,0", "1,0"]));
    const restored = roundTrip(g);
    expect(restored.world.get(16, 68, 2)).toBe(3);
    expect(restored.player.inventory[0]).toBeNull();
  });
});

describe("survival", () => {
  it("drains hunger based on distance traveled and sprint multiplier", () => {
    const g = arena();
    g.player.exhaustion = 3.99;
    g.step(0.3, { ...idle, forward: 1, sprint: true }, null);
    expect(g.player.hunger).toBe(19);
    expect(g.player.exhaustion).toBeCloseTo(
      3.99 + (0.5 - g.player.pos.z) * 0.1 - 4,
    );
  });
  it("regenerates with hunger cost, then stops below 18", () => {
    const g = arena();
    g.player.health = 12;
    g.player.hunger = 18;
    g.step(3.99, idle, null);
    expect(g.player.health).toBe(12);
    g.step(4.1, idle, null);
    expect([g.player.health, g.player.hunger]).toEqual([13, 17]);
  });
  it("starves every four seconds; eating resets the starvation timer and caps hunger", () => {
    const g = arena();
    const p = g.player;
    p.hunger = 0;
    p.health = 2;
    p.inventory[0] = { id: 7, count: 2 };
    g.step(7.99, idle, null);
    expect(p.health).toBe(1);
    g.use(null);
    expect(p.hunger).toBe(4);
    p.hunger = 19;
    g.use(null);
    expect(p.hunger).toBe(20);
    expect(p.inventory[0]).toBeNull();
    p.inventory[0] = { id: 7, count: 1 };
    g.use(null);
    expect(p.inventory[0].count).toBe(1);
    p.hunger = 0;
    g.step(3.99, idle, null);
    expect(p.health).toBe(1);
    g.step(0.01, idle, null);
    expect(g.cause).toBe("Starved");
  });
});
