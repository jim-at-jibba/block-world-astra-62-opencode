import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StateMachine } from "../src/state";
import {
  getSettings,
  list,
  load,
  makeSave,
  putSettings,
  remove,
  resolveSeed,
  save,
} from "../src/store";
import { World } from "../src/world";
import { Game } from "../src/game";

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();
  get length(): number {
    return this.data.size;
  }
  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
  clear(): void {
    this.data.clear();
  }
}

beforeEach(() => {
  vi.stubGlobal("localStorage", new MemoryStorage());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fixture() {
  const seed = resolveSeed("benchmark-001");
  const world = new World(seed);
  const game = new Game(world);
  const snapshot = makeSave(" Field ", seed, world, game);
  return { seed, world, game, snapshot };
}

describe("world repository", () => {
  it("round-trips independent snapshots, trims names, and orders duplicate names by last play", () => {
    vi.useFakeTimers();
    const ids: string[] = [];
    for (let i = 0; i < 10; i++) {
      vi.setSystemTime(1000 + i);
      const { snapshot } = fixture();
      save(snapshot);
      expect(load(snapshot.id)).toEqual(snapshot);
      expect(snapshot.name).toBe("Field");
      ids.unshift(snapshot.id);
    }
    expect(list().map((row) => row.id)).toEqual(ids);
    remove(ids[0]);
    expect(() => load(ids[0])).toThrow("no longer exists");
    expect(list().length).toBe(9);
  });

  it("keeps damaged saves deletable without hiding valid worlds", () => {
    const { snapshot } = fixture();
    save(snapshot);
    const key = localStorage.key(0)!;
    const good = fixture().snapshot;
    save(good);
    for (const invalid of [
      "{",
      JSON.stringify({ ...snapshot, schemaVersion: 99 }),
      JSON.stringify({ ...snapshot, edits: { "999,0": {} } }),
    ]) {
      localStorage.setItem(key, invalid);
      expect(() => load(snapshot.id)).toThrow();
      expect(list().find((row) => row.id === snapshot.id)?.error).toBeTruthy();
      expect(load(good.id)).toEqual(good);
    }
    remove(snapshot.id);
    expect(list().map((row) => row.id)).toEqual([good.id]);
  });

  it("retains the complete previous snapshot when storage fills", () => {
    const { snapshot } = fixture();
    save(snapshot);
    const original = load(snapshot.id);
    snapshot.name = "Changed";
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });
    expect(() => save(snapshot)).toThrow("quota");
    expect(load(snapshot.id)).toEqual(original);
  });

  it("rejects invalid input before overwriting a valid snapshot", () => {
    const { snapshot } = fixture();
    save(snapshot);
    for (const invalid of [
      { name: " " },
      { name: "x".repeat(33) },
      { seed: 2 ** 31 },
      { spawn: null },
      { genVersion: 2 },
      { edits: [] },
      { player: { ...snapshot.player, health: -1 } },
    ]) {
      expect(() => save(Object.assign({}, snapshot, invalid))).toThrow();
      expect(load(snapshot.id)).toEqual(snapshot);
    }
  });

  it("rejects malformed chunk membership, block ids, slot data, and player coordinates on load", () => {
    const { snapshot } = fixture();
    save(snapshot);
    const key = localStorage.key(0)!;
    for (const edits of [
      { "0,0": { "16,30,0": 2 } },
      { "0,0": { "0,0,0": 0 } },
      { "0,0": { "0,96,0": 2 } },
      { "0,0": { "0,30,0": 6 } },
      { "0,0": { "0,30,0": 7 } },
      { "00,0": { "0,30,0": 2 } },
    ]) {
      localStorage.setItem(key, JSON.stringify({ ...snapshot, edits }));
      expect(() => load(snapshot.id)).toThrow("terrain");
    }
    const inventory = snapshot.player.inventory;
    for (const change of [
      { inventory: inventory.slice(1) },
      { inventory: [{ id: 6, count: 1 }, ...inventory.slice(1)] },
      { inventory: [{ id: 2, count: 65 }, ...inventory.slice(1)] },
      { pos: { ...snapshot.player.pos, z: Infinity } },
      { yaw: null },
      { pitch: 2 },
      { hunger: 21 },
      { exhaustion: -0.1 },
      { selected: 9 },
    ]) {
      localStorage.setItem(
        key,
        JSON.stringify({
          ...snapshot,
          player: { ...snapshot.player, ...change },
        }),
      );
      expect(() => load(snapshot.id)).toThrow("player");
    }
  });

  it("restores mined terrain and normalizes cursor-held drops before saving", () => {
    const { world, game, seed } = fixture();
    const x = Math.floor(world.spawn.x),
      y = Math.floor(world.spawn.y) - 1,
      z = Math.floor(world.spawn.z);
    const hit = {
      x,
      y,
      z,
      id: world.get(x, y, z),
      normal: { x: 0, y: 1, z: 0 },
    };
    game.step(
      0.46,
      { forward: 0, side: 0, jump: false, sprint: false, breaking: true },
      hit,
    );
    game.slot(0, false, false);
    expect(game.cursor).toEqual({ id: 2, count: 1 });
    const snapshot = makeSave("Field", seed, world, game);
    save(snapshot);
    const restored = load(snapshot.id);
    const regenerated = new World(restored.seed, restored.edits);
    expect(regenerated.get(x, y, z)).toBe(0);
    expect(new Game(regenerated, restored.player).player.inventory[0]).toEqual({
      id: 2,
      count: 1,
    });
  });

  it("persists a placement on an adjoining chunk and its inventory decrement", () => {
    const { world, game, seed } = fixture();
    game.player.pos = { x: 14.5, y: 74, z: 1.5 };
    world.set(15, 75, 0, 3);
    world.dirty.clear();
    game.player.inventory[0] = { id: 4, count: 1 };
    game.use({ x: 15, y: 75, z: 0, id: 3, normal: { x: 1, y: 0, z: 0 } });
    expect(world.dirty.has("0,0") && world.dirty.has("1,0")).toBe(true);
    const snapshot = makeSave("Edge", seed, world, game);
    save(snapshot);
    const restored = load(snapshot.id);
    expect(new World(seed, restored.edits).get(16, 75, 0)).toBe(4);
    expect(restored.player.inventory[0]).toBeNull();
  });
});

describe("global settings and seed input", () => {
  it("persists valid settings and recovers from corruption", () => {
    const defaults = getSettings();
    const changed = {
      ...defaults,
      distance: 10,
      fov: 100,
      effects: 0,
      reducedFlash: true,
    };
    putSettings(changed);
    expect(getSettings()).toEqual(changed);
    expect(() => putSettings({ ...changed, distance: 10.1 })).toThrow();
    expect(getSettings()).toEqual(changed);
    localStorage.setItem(localStorage.key(0)!, "{}");
    expect(getSettings()).toEqual(defaults);
  });

  it("uses signed numeric seeds directly and hashes text reproducibly", () => {
    expect(resolveSeed("-2147483648")).toBe(-2147483648);
    expect(resolveSeed("2147483647")).toBe(2147483647);
    expect(resolveSeed("hello")).toBe(1335831723);
    expect(resolveSeed("benchmark-001")).toBe(resolveSeed("benchmark-001"));
    const random = resolveSeed("  ");
    expect(random).toBe(random | 0);
    expect(() => resolveSeed("x".repeat(65))).toThrow();
  });
});

describe("screen navigation", () => {
  it("allows play, inventory, pause, options, death, and retry in sequence", () => {
    const machine = new StateMachine();
    expect(machine.state).toBe("TITLE");
    for (const next of [
      "WORLD_CREATE",
      "LOADING",
      "PLAYING",
      "INVENTORY",
      "PAUSED",
      "SETTINGS",
      "PAUSED",
      "CONTROLS",
      "PAUSED",
      "PLAYING",
      "DEAD",
      "PLAYING",
      "FATAL_ERROR",
      "LOADING",
      "TITLE",
      "WORLD_LOAD",
      "LOADING",
      "LOADING",
      "DEAD",
      "TITLE",
    ] as const) {
      machine.go(next);
      expect(machine.state).toBe(next);
    }
  });

  it("rejects illegal transitions without mutating the active screen", () => {
    const machine = new StateMachine();
    expect(() => machine.go("PLAYING")).toThrow();
    expect(machine.state).toBe("TITLE");
    machine.go("SETTINGS");
    expect(() => machine.go("PAUSED")).toThrow();
    machine.go("TITLE");
    machine.go("LOADING");
    machine.go("PLAYING");
    expect(() => machine.go("WORLD_CREATE")).toThrow();
    expect(machine.state).toBe("PLAYING");
  });
});
