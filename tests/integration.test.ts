import { expect, it } from "vitest";
import { StateMachine } from "../src/state";
import { Game } from "../src/game";
import { World, raycast } from "../src/world";
import { resolveSeed } from "../src/store";

it("preserves a fatal fall through a checkpoint and finds footing in an excavated spawn", () => {
  const world = new World(0),
    game = new Game(world),
    idle = { forward: 0, side: 0, jump: false, sprint: false, breaking: false };
  for (let y = 1; y < Math.floor(world.spawn.y); y++) world.set(0, y, 0, 0);
  while (game.player.pos.y > 6) game.step(1 / 60, idle, null);
  const restored = new Game(world, game.checkpoint());
  restored.step(1, idle, null);
  expect(restored.cause).toBe("Fell from a high place");
  restored.respawn();
  restored.step(1, idle, null);
  expect(restored.grounded).toBe(true);
  expect(restored.player.health).toBe(20);
  expect(restored.player.pos.y).toBe(1);
});

it("pauses an active world after capture loss, without advancing starvation or movement", () => {
  const machine = new StateMachine();
  machine.go("WORLD_CREATE");
  machine.go("LOADING");
  const world = new World(resolveSeed("benchmark-001")),
    game = new Game(world);
  machine.go("PLAYING");
  game.player.hunger = 0;
  const tick = (): void => {
    if (machine.state === "PLAYING")
      game.step(
        1 / 60,
        { forward: 1, side: 0, jump: false, breaking: false, sprint: false },
        null,
      );
  };
  tick();
  machine.go("PAUSED");
  const paused = structuredClone(game.player);
  for (let i = 0; i < 300; i++) tick();
  expect(game.player).toEqual(paused);
  expect(
    raycast(
      world,
      { ...world.spawn, y: world.spawn.y + 1.62 },
      { x: 0, y: -1, z: 0 },
    )?.id,
  ).toBe(1);
});
