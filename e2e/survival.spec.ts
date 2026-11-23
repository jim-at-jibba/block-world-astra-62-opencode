import { test, expect } from "@playwright/test";
import type { Save } from "../src/store";
import { World } from "../src/world";
import { Game } from "../src/game";

test("fatal fall, respawn autosave, and eating preserve the expedition", async ({
  page,
}) => {
  const world = new World(0),
    game = new Game(world);
  game.player.inventory[0] = { id: 7, count: 2 };
  game.player.pos.y = 90;
  const snapshot: Save = {
    id: "dd79cf10-c973-43b5-98de-c97ebeba00d8",
    name: "Ridge",
    seed: 0,
    created: 1,
    lastPlayed: 1,
    gameVersion: "1.0.0",
    schemaVersion: 1,
    genVersion: 1,
    spawn: world.spawn,
    edits: {},
    player: game.player,
  };
  await page.goto("/?test");
  await page.evaluate(
    (s) => localStorage.setItem("blockworld.world." + s.id, JSON.stringify(s)),
    snapshot,
  );
  await page.reload();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "You died" })).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText("Fell from a high place")).toBeVisible();
  await page.getByRole("button", { name: "Respawn" }).click();
  await expect(page.locator(".hotbar .cell").first()).toHaveAttribute(
    "aria-label",
    /Apple × 2/,
  );
  const restored: Save = await page.evaluate(
    (id) => JSON.parse(localStorage.getItem("blockworld.world." + id)!),
    snapshot.id,
  );
  expect(restored.player.health).toBe(20);
  expect(restored.player.hunger).toBe(18);
  expect(restored.player.pos).toEqual(world.spawn);
  await page.mouse.click(640, 400, { button: "right" });
  await expect(page.locator(".hotbar .cell").first()).toHaveAttribute(
    "aria-label",
    /Apple × 1/,
  );
  await page.mouse.click(640, 400, { button: "right" });
  await expect(page.getByText("Not hungry")).toBeVisible();
});

test("corrupt saves remain deletable and do not enable Continue", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("blockworld.world.broken", "{"),
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await page.getByRole("button", { name: /Load World/ }).click();
  await expect(page.getByText("World data is not valid JSON.")).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Damaged world", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete World", exact: true }).click();
  await expect(page.getByText("No saved worlds yet.")).toBeVisible();
});
