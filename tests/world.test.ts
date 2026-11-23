import { describe, expect, it } from "vitest";
import { meshData, visibleFace } from "../src/render";
import { World, raycast, sample, surface, type Vec } from "../src/world";

describe("generation v1", () => {
  it("pins coordinate randomness, terrain layers, trunk height and canopy", () => {
    expect(sample(1201, 3, -7)).toBe(0.5167492744512856);
    expect(surface(1201, 3, -7)).toBe(37);
    const world = new World(1201);
    expect([0, 33, 34, 35, 36, 37].map((y) => world.get(3, y, -7))).toEqual([
      6, 3, 2, 2, 2, 1,
    ]);
    expect(
      Array.from({ length: 8 }, (_, i) => world.get(6, 37 + i, 0)),
    ).toEqual([1, 4, 4, 4, 4, 4, 5, 0]);
    expect(world.get(6, 41, -1)).toBe(5);
    world.trim(90, 90, 2);
    expect(world.get(6, 41, -1)).toBe(5);
    expect(world.get(6, 41, 0)).toBe(4);
  });

  it("produces a supported, level-enough spawn and tree-free clearing", () => {
    for (const seed of [-2147483648, -99, 0, 7137, 2147483647]) {
      const w = new World(seed);
      const x = Math.floor(w.spawn.x),
        z = Math.floor(w.spawn.z),
        y = Math.floor(w.spawn.y);
      expect(w.spawn).toEqual({ x: x + 0.5, y: y + 0.01, z: z + 0.5 });
      expect([w.get(x, y - 1, z), w.get(x, y, z), w.get(x, y + 1, z)]).toEqual([
        1, 0, 0,
      ]);
      for (const [dx, dz] of [
        [1, 0],
        [0, -1],
        [-1, 0],
        [0, 1],
      ])
        expect(
          Math.abs(surface(seed, x + dx, z + dz) - y + 1),
        ).toBeLessThanOrEqual(1);
      for (let dx = -4; dx <= 4; dx++)
        for (let dz = -4; dz <= 4; dz++)
          expect(
            w.get(x + dx, surface(seed, x + dx, z + dz) + 1, z + dz),
          ).not.toBe(4);
    }
  });
});

it("maps negative coordinates, keeps only current differences and dirties adjacent chunks", () => {
  const world = new World(-73);
  expect(world.chunkKey(-17, -16)).toBe("-2,-1");
  expect(world.chunkKey(-0.01, 16)).toBe("-1,1");
  world.set(-1, 80, -16, 2);
  expect(world.dirty).toEqual(new Set(["-1,-1", "0,-1", "-1,-2"]));
  const copy = new World(-73, JSON.parse(JSON.stringify(world.edits)));
  expect(copy.get(-1, 80, -16)).toBe(2);
  copy.set(-1, 80, -16, 0);
  expect(copy.edits).toEqual({});
  world.trim(60, 60, 1);
  expect(world.get(-1, 80, -16)).toBe(2);
});

it("provides solid horizontal and lower limits and empty sky", () => {
  const w = new World(17);
  for (const [x, y, z] of [
    [2048, 80, 0],
    [0, 80, -2049],
    [0, 0, 0],
    [12, -1, 2],
  ]) {
    expect(w.get(x, y, z)).toBe(6);
    expect(w.set(x, y, z, 0)).toBe(false);
  }
  expect(w.get(0, 96, 0)).toBe(0);
  expect(w.set(0, 96, 0, 2)).toBe(false);
});

it("culls the two touching opaque faces across a chunk seam", () => {
  const w = new World(1);
  const indices = (cx: number): number => meshData(w, cx, 0)[0].idx.length;
  const left = indices(0),
    right = indices(1);
  w.set(15, 88, 4, 2);
  expect(indices(0) - left).toBe(36);
  w.set(16, 88, 4, 3);
  expect(indices(0) - left).toBe(30);
  expect(indices(1) - right).toBe(30);
  expect(visibleFace(2, 5)).toBe(true);
  expect(visibleFace(5, 2)).toBe(false);
});

it("returns an outward normal on each face regardless of direction magnitude", () => {
  const w = new World(91);
  w.set(-2, 80, 1, 3);
  for (const axis of ["x", "y", "z"] as const)
    for (const sign of [-1, 1]) {
      const origin: Vec = { x: -1.5, y: 80.5, z: 1.5 };
      origin[axis] += sign * 3;
      const normal: Vec = { x: 0, y: 0, z: 0 },
        dir = { ...normal };
      normal[axis] = sign;
      dir[axis] = -sign * 7;
      expect(raycast(w, origin, dir)).toEqual({
        x: -2,
        y: 80,
        z: 1,
        id: 3,
        normal,
      });
    }
  expect(raycast(w, { x: -7, y: 80.5, z: 1.5 }, { x: 1, y: 0, z: 0 })?.x).toBe(
    -2,
  );
  expect(
    raycast(w, { x: -7.001, y: 80.5, z: 1.5 }, { x: 1, y: 0, z: 0 }, 10),
  ).toBeNull();
});
