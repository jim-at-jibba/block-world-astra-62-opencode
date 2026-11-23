import { test, expect } from "@playwright/test";
import type { Player } from "../src/game";
import type { Hit } from "../src/world";
declare global {
  interface Window {
    blockworldTest: {
      state(): string;
      player(): Player;
      aim(yaw: number, pitch: number): void;
      hit(): Hit | null;
      mine(): void;
      use(): void;
    };
  }
}
test("create, mine, build, save, resume, configure and delete", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/?test");
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  await page.getByRole("button", { name: /New World/ }).click();
  await page.getByLabel("World name").fill("Test Expedition");
  await page.getByLabel("Seed").fill("benchmark-001");
  await button("Create World").click();
  await expect(page.locator(".hotbar")).toBeVisible();
  await page.keyboard.press("F3");
  const seed =
    [..."benchmark-001"].reduce(
      (hash, c) => Math.imul(hash ^ c.charCodeAt(0), 16777619),
      2166136261,
    ) | 0;
  await expect(page.locator(".debug")).toContainText(`Seed ${seed}`);
  await expect(page.locator(".debug")).not.toContainText("NaN");
  const hit = await page.evaluate(() => {
    window.blockworldTest.aim(0, -0.93);
    return window.blockworldTest.hit();
  });
  expect(hit?.id).toBe(1);
  await page.evaluate(() => window.blockworldTest.mine());
  await expect(page.locator(".hotbar .cell").first()).toHaveAttribute(
    "aria-label",
    /Dirt × 1/,
  );
  await page.evaluate(() => window.blockworldTest.use());
  await expect(page.locator(".hotbar .cell").first()).toHaveAttribute(
    "aria-label",
    /Empty/,
  );
  const position = await page.evaluate(
    () => window.blockworldTest.player().pos,
  );
  await page.keyboard.press("KeyE");
  await expect(page.getByRole("heading", { name: "Inventory" })).toBeVisible();
  await page.keyboard.press("Escape");
  await button("Save and Quit to Title").click();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.locator(".hotbar")).toBeVisible();
  const restored = await page.evaluate(
    () => window.blockworldTest.player().pos,
  );
  for (const key of ["x", "y", "z"] as const)
    expect(restored[key]).toBeCloseTo(position[key], 3);
  await page.evaluate(() => document.exitPointerLock());
  await expect(page.getByRole("heading", { name: "Paused" })).toBeVisible();
  await button("Settings").click();
  await page.locator("#fov").fill("83");
  await page.locator("#distance").fill("4");
  await page.reload();
  await page.getByRole("button", { name: /Settings/ }).click();
  await expect(page.locator("#fov")).toHaveValue("83");
  await expect(page.locator("#distance")).toHaveValue("4");
  await button("Back").click();
  await page.getByRole("button", { name: /Load World/ }).click();
  await expect(page.locator(".save-row")).toContainText("Test Expedition");
  await button("Delete").click();
  await button("Delete World").click();
  await button("Back").click();
  await expect(page.getByRole("button", { name: /Continue/ })).toBeDisabled();
  expect(errors).toEqual([]);
});
