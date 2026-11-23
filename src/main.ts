import "./style.css";
import { World, raycast, inBounds, type Hit } from "./world";
import { Game } from "./game";
import type { Renderer } from "./render";
import { StateMachine, type State } from "./state";
import {
  list,
  save,
  makeSave,
  load,
  remove,
  getSettings,
  putSettings,
  resolveSeed,
  type Save,
} from "./store";
import {
  btn,
  controlsView,
  esc,
  itemIcon,
  names,
  panel,
  settingsView,
  title,
} from "./ui";
import { icon } from "./icons";
import { AudioService } from "./audio";
import { capturePointer, Controls } from "./input";

const root = document.querySelector<HTMLDivElement>("#app")!;
root.innerHTML =
  '<div id="scene"></div><div id="screen"></div><div id="alerts" aria-live="polite"></div>';
const scene = document.querySelector<HTMLDivElement>("#scene")!,
  screen = document.querySelector<HTMLDivElement>("#screen")!,
  alerts = document.querySelector<HTMLDivElement>("#alerts")!;
const machine = new StateMachine(),
  settings = getSettings(),
  audio = new AudioService(() => settings),
  events = new AbortController(),
  signal = events.signal;
let game: Game | undefined,
  renderer: Renderer | undefined,
  meta: Save | undefined,
  controls: Controls | undefined,
  canvas: HTMLCanvasElement | undefined;
let raf = 0,
  last = 0,
  elapsed = 0,
  accum = 0,
  fps = 60,
  lastHud = 0,
  generation = 0,
  debug = false,
  deleteId = "",
  fatalText = "",
  feedback = "",
  feedbackUntil = 0,
  savedUntil = 0,
  hudSignature = "",
  flashUntil = 0,
  loadText = "",
  loadPercent = 0,
  loadSlow = false;
let sessionEvents = new AbortController();
let retry: () => void = backTitle;
function active(): boolean {
  return machine.state === "PLAYING";
}
function go(next: State): void {
  const prior = machine.state;
  if (prior === "INVENTORY" && next !== "INVENTORY") game?.normalize();
  machine.go(next);
  controls?.clear();
  game?.cancelBreak();
  accum = 0;
  last = performance.now();
  if (next !== "PLAYING" && document.pointerLockElement)
    document.exitPointerLock();
  draw();
}
function warn(message: string): void {
  alerts.innerHTML = `<div class="warning" role="alert">${esc(message)}</div>`;
}
function message(text: string): void {
  feedback = text;
  feedbackUntil = performance.now() + 2200;
}
function snapshot(): boolean {
  if (!game || !meta) return false;
  try {
    meta.player = game.checkpoint();
    if (machine.state === "INVENTORY") draw();
    meta.edits = game.world.edits;
    save(meta);
    const { name, seed, id } = meta;
    retry = () => void start(name, seed, id);
    savedUntil = performance.now() + 2200;
    alerts.textContent = "";
    return true;
  } catch (e) {
    warn(`Save failed: ${String(e)}. Progress remains in this session.`);
    return false;
  }
}
function disposeSession(): void {
  generation++;
  sessionEvents.abort();
  sessionEvents = new AbortController();
  cancelAnimationFrame(raf);
  controls?.dispose();
  controls = undefined;
  renderer?.dispose();
  renderer = undefined;
  canvas?.remove();
  canvas = undefined;
  game = undefined;
  meta = undefined;
  elapsed = 0;
  accum = 0;
  debug = false;
  feedback = "";
  feedbackUntil = savedUntil = flashUntil = 0;
  hudSignature = "";
}
function backTitle(): void {
  disposeSession();
  deleteId = "";
  go("TITLE");
}
function fatal(e: unknown): void {
  console.error(e);
  fatalText = e instanceof Error ? e.message : String(e);
  disposeSession();
  go("FATAL_ERROR");
}
function cell(i: number, interactive: boolean): string {
  if (!game) return "";
  const p = game.player,
    s = p.inventory[i],
    label = `Slot ${i + 1}: ${s ? `${names[s.id]} × ${s.count}` : "Empty"}`,
    inside = `${i < 9 ? `<small>${i + 1}</small>` : ""}${s ? `${itemIcon(s.id)}<b>${s.count}</b>` : ""}`;
  const tag = interactive ? "button" : "span";
  return `<${tag} class="cell ${p.selected === i ? "selected" : ""}" data-slot="${i}" aria-label="${label}" title="${label}">${inside}</${tag}>`;
}
function draw(): void {
  const state = machine.state,
    inGame = Boolean(game && renderer);
  if (state === "TITLE") {
    const rows = list();
    screen.innerHTML = title(
      rows.some((r) => !r.error),
      rows.length > 0,
    );
  }
  if (state === "WORLD_CREATE")
    screen.innerHTML = panel(
      "WORLD MENU / NEW EXPEDITION",
      "New World",
      `<form id="create"><label class="field">World name<input name="name" value="New World" required maxlength="32" autocomplete="off"></label><label class="field">Seed <small>Optional · Use the same seed to revisit the same terrain.</small><input name="seed" maxlength="64" placeholder="Random seed" autocomplete="off"></label><p class="error" id="formerror"></p><div class="footactions"><button class="btn accent" type="submit">Create World</button><button type="button" class="btn" data-act="back">Back</button></div></form>`,
    );
  if (state === "WORLD_LOAD") {
    const rows = list(),
      pending = rows.find((r) => r.id === deleteId);
    screen.innerHTML = pending
      ? panel(
          "WORLD ARCHIVE / DELETE",
          "Delete world?",
          `<p>Permanently delete <strong>${esc(pending.name)}</strong> and all its progress?</p><div class="footactions">${btn("confirmdelete", "Delete World", true)}${btn("canceldelete", "Cancel")}</div>`,
        )
      : panel(
          "WORLD MENU / ARCHIVE",
          "Load World",
          `${rows.map((r) => `<article class="save-row"><strong>${esc(r.name)}</strong><p>Seed ${r.seed} · v${esc(r.gameVersion)}</p><p>${r.lastPlayed ? esc(new Date(r.lastPlayed).toLocaleString()) : "Unknown date"}</p>${r.error ? `<p class="error">${esc(r.error)}</p>` : btn(`open:${esc(r.id)}`, "Play", true)}${btn(`delete:${esc(r.id)}`, "Delete")}</article>`).join("") || "<p>No saved worlds yet.</p>"}${btn("back", "Back")}`,
        );
  }
  if (state === "SETTINGS" || state === "CONTROLS")
    screen.innerHTML = panel(
      "FIELD MANUAL / " + (state === "SETTINGS" ? "CONFIGURATION" : "BINDINGS"),
      state === "SETTINGS" ? "Settings" : "Controls",
      state === "SETTINGS" ? settingsView(settings) : controlsView(),
      inGame,
    );
  if (state === "LOADING")
    screen.innerHTML = panel(
      "WORLD GENERATOR / INITIALIZING",
      "Loading world",
      `<p>${esc(loadText)}</p><div class="progressbar"><i style="width:${loadPercent}%"></i></div>${loadSlow ? `<div class="footactions">${btn("retry", "Retry")}${btn("title", "Return to Title")}</div>` : ""}`,
    );
  if (state === "FATAL_ERROR")
    screen.innerHTML = panel(
      "FIELD SYSTEM / ERROR",
      "Session error",
      `<p>${esc(fatalText)}</p><div class="footactions">${btn("title", "Return to Title", true)}${btn("retry", "Retry")}</div>`,
    );
  if (state === "PAUSED")
    screen.innerHTML = panel(
      "EXPEDITION / " + esc(meta?.name).toUpperCase(),
      "Paused",
      `<p>Seed ${meta?.seed} · Simulation paused</p><div class="stack">${btn("resume", "Resume", true)}${btn("save", "Save World")}${btn("settings", "Settings")}${btn("controls", "Controls")}${btn("quit", "Save and Quit to Title")}</div><p id="save-status" role="status"></p>`,
      true,
    );
  if (state === "DEAD")
    screen.innerHTML = panel(
      "EXPEDITION / ENDED",
      "You died",
      `<p>${esc(game?.cause)}</p><div class="footactions">${btn("respawn", "Respawn", true)}${btn("quit", "Quit to Title")}</div>`,
      true,
    );
  if (state === "INVENTORY" && game)
    screen.innerHTML = panel(
      "PACK / ITEM STORAGE",
      "Inventory",
      `<p>Click to move stacks. Right-click to split or place one. Shift-click to transfer.</p><div class="invlabel">STORAGE · 27 SLOTS</div><div class="slots">${Array.from({ length: 27 }, (_, i) => cell(i + 9, true)).join("")}</div><div class="invlabel">HOTBAR</div><div class="slots">${Array.from({ length: 9 }, (_, i) => cell(i, true)).join("")}</div><p>Holding: ${game.cursor ? `${names[game.cursor.id]} × ${game.cursor.count}` : "Nothing"}</p>${btn("resume", "Return to World", true)}`,
      true,
    );
  if (state === "PLAYING") {
    screen.innerHTML =
      '<div class="hud"><div class="cross"></div><div class="breakmeter" hidden><span></span></div><pre class="debug"></pre><div class="saved"></div><div class="hudfps"></div><div class="hudbottom"><div class="msg"></div><div class="target"></div><div class="meters"></div><div class="hotbar"></div></div><div id="flash"></div></div>';
    hudSignature = "";
    updateHud(aim(), performance.now());
  }
  if (!["LOADING", "PLAYING", "TITLE"].includes(state))
    screen
      .querySelector<HTMLElement>(
        "input:not([type=range]), button:not(:disabled)",
      )
      ?.focus({ preventScroll: true });
}
function aim(): Hit | null {
  if (!game) return null;
  const { pos, yaw, pitch } = game.player,
    c = Math.cos(pitch);
  return raycast(
    game.world,
    { ...pos, y: pos.y + 1.62 },
    { x: -Math.sin(yaw) * c, y: Math.sin(pitch), z: -Math.cos(yaw) * c },
  );
}
function text(selector: string, value: string): void {
  const el = screen.querySelector(selector);
  if (el && el.textContent !== value) el.textContent = value;
}
function units(id: string, value: number): string {
  return `<span class="units ${id === "heart" ? "hp" : "food"}" aria-label="${id === "heart" ? "Health" : "Hunger"}: ${value} of 20">${Array.from({ length: 10 }, (_, i) => `<span class="${2 * i >= value ? "dim" : ""}" style="${2 * i + 1 === value ? "opacity:.6" : ""}">${icon(id, 16)}</span>`).join("")}</span>`;
}
function updateHud(hit: Hit | null, now: number): void {
  if (!game || !meta || !renderer) return;
  const p = game.player,
    sig = JSON.stringify([
      p.inventory.slice(0, 9),
      p.selected,
      p.health,
      p.hunger,
    ]);
  if (sig !== hudSignature) {
    hudSignature = sig;
    screen.querySelector(".meters")!.innerHTML =
      units("heart", p.health) + units("apple", p.hunger);
    screen.querySelector(".hotbar")!.innerHTML = Array.from(
      { length: 9 },
      (_, i) => cell(i, false),
    ).join("");
  }
  text(
    ".target",
    hit
      ? inBounds(hit.x, hit.z)
        ? names[hit.id]
        : "World boundary reached"
      : "",
  );
  text(".msg", now < feedbackUntil ? feedback : "");
  text(".saved", now < savedUntil ? "World saved" : "");
  text(".hudfps", settings.fps ? `${Math.round(fps)} FPS` : "");
  const pos = p.pos,
    degree = (p.yaw * 180) / Math.PI,
    card = ["N", "W", "S", "E"][((Math.round(degree / 90) % 4) + 4) % 4];
  text(
    ".debug",
    debug
      ? `${meta.name} · Seed ${meta.seed}\n${fps.toFixed(0)} FPS / ${(1000 / fps).toFixed(1)} ms\nXYZ ${pos.x.toFixed(2)} / ${pos.y.toFixed(2)} / ${pos.z.toFixed(2)}\nBlock ${Math.floor(pos.x)},${Math.floor(pos.y)},${Math.floor(pos.z)} · Chunk ${Math.floor(pos.x / 16)},${Math.floor(pos.z / 16)}\nFacing ${card} · Yaw ${degree.toFixed(1)}° / Pitch ${((p.pitch * 180) / Math.PI).toFixed(1)}°\nChunks ${renderer.loaded} · Queue ${renderer.queued}\nTarget ${hit ? `${hit.id} ${names[hit.id]} ${hit.x},${hit.y},${hit.z}` : "—"}`
      : "",
  );
  const bar = screen.querySelector<HTMLElement>(".breakmeter")!;
  bar.hidden = !game.progress;
  bar.firstElementChild?.setAttribute("style", `width:${game.progress * 100}%`);
  screen.querySelector("#flash")!.className =
    now < flashUntil && !settings.reducedFlash ? "damage" : "";
}
function frame(now: number): void {
  if (!game || !renderer || !controls) return;
  const raw = Math.max(0.001, (now - last) / 1000),
    dt = Math.min(raw, 0.25);
  last = now;
  if (active()) {
    fps = fps * 0.93 + Math.min(240, 1 / raw) * 0.07;
    accum += dt;
    const input = controls.sample();
    while (accum >= 1 / 60) {
      game.step(1 / 60, input, aim());
      accum -= 1 / 60;
    }
    const hit = aim(),
      p = game.player;
    renderer.frame(p.pos, p.yaw, p.pitch, settings.fov, settings.distance, hit);
    if (now - lastHud > 60) {
      updateHud(hit, now);
      lastHud = now;
    }
    if (!p.health) go("DEAD");
    elapsed += dt;
    if (elapsed >= 30) {
      elapsed = 0;
      snapshot();
    }
  }
  raf = requestAnimationFrame(frame);
}
async function resume(): Promise<void> {
  if (!canvas) return;
  const token = generation,
    prior = machine.state;
  const locked = await capturePointer(canvas, sessionEvents.signal);
  if (token !== generation || machine.state !== prior) return;
  if (locked && !document.hidden) {
    go("PLAYING");
    canvas.focus();
  } else {
    if (prior !== "PAUSED") go("PAUSED");
    text(
      "#save-status",
      "Mouse capture was unavailable. Click Resume to try again.",
    );
  }
}
const nextFrame = (): Promise<number> =>
  new Promise((resolve) => requestAnimationFrame(resolve));
async function start(name: string, seed: number, id?: string): Promise<void> {
  disposeSession();
  const token = generation;
  retry = () => void start(name, seed, id);
  loadSlow = false;
  loadPercent = 5;
  loadText = "Preparing terrain generator…";
  go("LOADING");
  canvas = document.createElement("canvas");
  canvas.id = "view";
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "First-person world");
  scene.append(canvas);
  canvas.addEventListener(
    "webglcontextlost",
    () =>
      fatal(
        new Error("Graphics context lost. Retry to reopen your last save."),
      ),
    { signal: sessionEvents.signal },
  );
  const locking = capturePointer(canvas, sessionEvents.signal);
  const timeout = window.setTimeout(() => {
    if (generation === token && machine.state === "LOADING") {
      loadSlow = true;
      if (document.pointerLockElement) document.exitPointerLock();
      draw();
    }
  }, 15000);
  try {
    const [{ Renderer: View }] = await Promise.all([
      import("./render"),
      nextFrame(),
    ]);
    if (generation !== token) return;
    const previous = id ? load(id) : undefined,
      world = new World(previous?.seed ?? seed, previous?.edits);
    if (previous) Object.assign(world.spawn, previous.spawn);
    game = new Game(world, previous?.player);
    meta = previous ?? makeSave(name, seed, world, game);
    await locking;
    if (token !== generation || !canvas) return;
    renderer = new View(canvas, world);
    game.notify = message;
    game.sound = (key) => {
      audio.play(key);
      if (key === "damage") flashUntil = performance.now() + 280;
    };
    controls = new Controls(
      canvas,
      active,
      (dx, dy) => {
        if (!game) return;
        const p = game.player,
          gain = settings.sensitivity * 0.00004;
        p.yaw -= dx * gain;
        p.pitch = Math.max(
          (-89 * Math.PI) / 180,
          Math.min(
            (89 * Math.PI) / 180,
            p.pitch - dy * gain * (settings.invert ? -1 : 1),
          ),
        );
      },
      () => game?.use(aim()),
      (delta) => {
        if (game) game.player.selected = (game.player.selected + delta + 9) % 9;
      },
      () => game?.cancelBreak(),
      () => go("PAUSED"),
    );
    while (renderer.loaded < 9) {
      const p = game.player;
      renderer.frame(
        p.pos,
        p.yaw,
        p.pitch,
        settings.fov,
        settings.distance,
        null,
      );
      loadText = `Generating spawn chunks · Seed ${world.seed}`;
      loadPercent = 15 + Math.min(9, renderer.loaded) * 9;
      draw();
      await nextFrame();
      if (token !== generation) return;
    }
    snapshot();
    message(`${meta.name} · Seed ${world.seed}`);
    feedbackUntil = performance.now() + 5500;
    if (game.player.health) {
      resume();
    } else {
      go("DEAD");
    }
    last = performance.now();
    raf = requestAnimationFrame(frame);
  } catch (e) {
    if (token === generation) fatal(e);
  } finally {
    clearTimeout(timeout);
  }
}
function act(id: string): void {
  audio.unlock();
  if (id === "new") go("WORLD_CREATE");
  else if (id === "load") {
    deleteId = "";
    go("WORLD_LOAD");
  } else if (id === "continue") {
    const row = list().find((r) => !r.error);
    if (row) void start(row.name, row.seed, row.id);
  } else if (id.startsWith("open:")) void start("", 0, id.slice(5));
  else if (id.startsWith("delete:")) {
    deleteId = id.slice(7);
    draw();
  } else if (id === "confirmdelete") {
    try {
      remove(deleteId);
      deleteId = "";
      draw();
    } catch (e) {
      warn(String(e));
    }
  } else if (id === "canceldelete") {
    deleteId = "";
    draw();
  } else if (id === "settings" || id === "controls")
    go(id === "settings" ? "SETTINGS" : "CONTROLS");
  else if (id === "back") {
    if (game) go("PAUSED");
    else backTitle();
  } else if (id === "title") backTitle();
  else if (id === "retry") retry();
  else if (id === "save" && snapshot()) text("#save-status", "World saved.");
  else if (id === "quit" && snapshot()) backTitle();
  else if (id === "resume") resume();
  else if (id === "respawn" && game) {
    game.respawn();
    snapshot();
    resume();
  }
}
screen.addEventListener(
  "click",
  (e) => {
    if (!(e.target instanceof Element)) return;
    const b = e.target.closest<HTMLButtonElement>("button");
    if (!b) return;
    if (b.dataset.act) act(b.dataset.act);
    else if (b.dataset.slot !== undefined && game) {
      game.slot(Number(b.dataset.slot), false, e.shiftKey);
      draw();
    }
  },
  { signal },
);
screen.addEventListener(
  "contextmenu",
  (e) => {
    if (!(e.target instanceof Element)) return;
    const b = e.target.closest<HTMLElement>("[data-slot]");
    if (b && game && machine.state === "INVENTORY") {
      e.preventDefault();
      game.slot(Number(b.dataset.slot), true, false);
      draw();
    }
  },
  { signal },
);
screen.addEventListener(
  "submit",
  (e) => {
    e.preventDefault();
    const f = e.target;
    if (!(f instanceof HTMLFormElement)) return;
    audio.unlock();
    const data = new FormData(f),
      name = String(data.get("name")).trim();
    if (!name || !/[^\s\p{Cf}]/u.test(name)) {
      text("#formerror", "Enter a visible world name.");
      return;
    }
    void start(name, resolveSeed(String(data.get("seed"))));
  },
  { signal },
);
screen.addEventListener(
  "input",
  (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.setting) return;
    const key = el.dataset.setting;
    if (key === "invert" || key === "fps" || key === "reducedFlash")
      settings[key] = el.checked;
    else if (
      key === "distance" ||
      key === "master" ||
      key === "effects" ||
      key === "fov" ||
      key === "sensitivity"
    ) {
      settings[key] = Number(el.value);
      text(`output[for="${key}"]`, el.value + (el.dataset.suffix ?? ""));
    }
    try {
      putSettings(settings);
    } catch (e) {
      warn(`Settings could not be saved: ${String(e)}`);
    }
  },
  { signal },
);
window.addEventListener(
  "keydown",
  (e) => {
    if (e.repeat) return;
    if (active()) {
      if (e.code === "Escape") go("PAUSED");
      else if (e.code === "KeyE") go("INVENTORY");
      else if (e.code === "F3") {
        e.preventDefault();
        debug = !debug;
      } else if (/^Digit[1-9]$/.test(e.code) && game)
        game.player.selected = Number(e.code.slice(-1)) - 1;
    } else if (machine.state === "INVENTORY") {
      if (e.code === "KeyE") resume();
      else if (e.code === "Escape") go("PAUSED");
    } else if (
      e.code === "Escape" &&
      ["SETTINGS", "CONTROLS", "WORLD_CREATE", "WORLD_LOAD"].includes(
        machine.state,
      )
    )
      act("back");
  },
  { signal },
);
window.addEventListener(
  "blur",
  () => {
    if (active()) go("PAUSED");
  },
  { signal },
);
document.addEventListener(
  "visibilitychange",
  () => {
    if (document.hidden) {
      if (active()) go("PAUSED");
      if (game) snapshot();
    }
  },
  { signal },
);
window.addEventListener(
  "pagehide",
  () => {
    if (game) snapshot();
  },
  { signal },
);
window.addEventListener("error", (e) => fatal(e.error ?? e.message), {
  signal,
});
window.addEventListener(
  "unhandledrejection",
  (e) => {
    e.preventDefault();
    fatal(e.reason);
  },
  { signal },
);
if (import.meta.hot)
  import.meta.hot.dispose(() => {
    events.abort();
    disposeSession();
    audio.dispose();
  });
if (
  (import.meta.env.DEV || import.meta.env.MODE === "benchmark") &&
  new URLSearchParams(location.search).has("test")
) {
  Object.defineProperty(window, "blockworldTest", {
    configurable: true,
    value: {
      state: () => machine.state,
      metrics: () => ({ loaded: renderer?.loaded, queued: renderer?.queued }),
      player: () => structuredClone(game?.player),
      aim: (yaw: number, pitch: number) => {
        if (active() && game) {
          game.player.yaw = yaw;
          game.player.pitch = pitch;
        }
      },
      hit: aim,
      mine: () => {
        if (active() && game) {
          const hit = aim();
          for (
            let i = 0;
            i < 73 && hit && game.world.get(hit.x, hit.y, hit.z) === hit.id;
            i++
          )
            game.step(
              1 / 60,
              {
                forward: 0,
                side: 0,
                sprint: false,
                jump: false,
                breaking: true,
              },
              hit,
            );
        }
      },
      use: () => {
        if (active()) game?.use(aim());
      },
    },
  });
}
draw();
