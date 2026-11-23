import { cube, icon } from "./icons";
import type { Settings } from "./store";

export const names = [
  "Air",
  "Grass",
  "Dirt",
  "Stone",
  "Wood",
  "Leaves",
  "Bedrock",
  "Apple",
];
export function esc(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? "",
  );
}
export function header(): string {
  return `<header class="mast"><div class="mastinner"><span class="brand">${cube(30)} BLOCKWORLD</span><span class="mast-right"><i></i> SYSTEM ONLINE <b></b> V1.0.0</span></div></header>`;
}
export function footer(): string {
  return `<footer><span>${cube(16)} BLOCKWORLD <b>/</b> FIELD EDITION</span><span>OFFLINE READY <i></i></span></footer>`;
}
export function action(
  id: string,
  label: string,
  ic: string,
  desc = "",
  disabled = false,
  accent = false,
): string {
  return `<button data-act="${id}" class="action ${accent ? "accent" : ""}" ${disabled ? "disabled" : ""}><span class="act-icon">${icon(ic)}</span><span class="act-copy"><strong>${label}</strong>${desc ? `<small>${desc}</small>` : ""}</span><span class="act-end">${icon("chevron", 15)}</span></button>`;
}
export function title(valid: boolean, anySaves: boolean): string {
  return `${header()}<main class="home"><div class="overline"><span><em></em> FIELD EDITION <b>/</b> SERIES 01</span><span>DESKTOP SANDBOX</span></div><section class="cover"><div class="plate"><i></i> OVERWORLD &nbsp;/&nbsp; PLATE 001</div><div class="covertext"><span class="coverkicker">A PROCEDURAL VOXEL SANDBOX</span><h1>BLOCKWORLD</h1><p>Explore, build, and survive in a world of your own.</p></div><span class="crop tl"></span><span class="crop tr"></span><span class="crop bl"></span><span class="crop br"></span></section><div class="menus"><section><h2><label>01</label> World Menu<span></span></h2><div class="stack">${action("new", "New World", "plus", "Start a fresh world", false, true)}${action("continue", "Continue", "play", "Resume your last session", !valid)}${action("load", "Load World", "folder", "Browse your saved worlds", !anySaves)}</div></section><section><h2><label>02</label> Field Manual<span></span></h2><div class="stack">${action("settings", "Settings", "settings", "Adjust your experience")}${action("controls", "Controls", "controls", "View keyboard and mouse bindings")}</div><div class="tip"><span class="tip-ico">${icon("bulb", 20)}</span><div><strong>FIELD TIP</strong><p>Break leaves to find apples. Eat them to restore hunger.</p></div></div></section></div>${footer()}</main>`;
}
export function panel(
  kicker: string,
  heading: string,
  inside: string,
  inGame = false,
): string {
  return `${inGame ? "" : header()}<main class="${inGame ? "shade" : "paperPage"}"><section class="panel"><div class="kicker"><em></em> ${kicker}</div><h1>${heading}</h1>${inside}</section></main>`;
}
export function btn(id: string, text: string, primary = false): string {
  return `<button class="btn ${primary ? "accent" : ""}" data-act="${id}">${text}</button>`;
}
export function settingsView(s: Settings): string {
  const rows = (
    [
      ["sensitivity", "Mouse sensitivity", 10, 200, "%"],
      ["fov", "Field of view", 60, 100, "°"],
      ["distance", "Render distance", 3, 10, " chunks"],
      ["master", "Master volume", 0, 100, "%"],
      ["effects", "Effects volume", 0, 100, "%"],
    ] as const
  )
    .map(
      ([key, name, min, max, suffix]) =>
        `<label class="slider"><span>${name} <output for="${key}">${s[key]}${suffix}</output></span><input type="range" id="${key}" data-setting="${key}" data-suffix="${suffix}" min="${min}" max="${max}" value="${s[key]}"></label>`,
    )
    .join("");
  return `${rows}${(
    [
      ["invert", "Invert vertical look"],
      ["fps", "Show FPS"],
      ["reducedFlash", "Reduce damage flash"],
    ] as const
  )
    .map(
      ([key, name]) =>
        `<label class="toggle">${name}<input type="checkbox" data-setting="${key}" ${s[key] ? "checked" : ""}></label>`,
    )
    .join("")}<div class="footactions">${btn("back", "Back", true)}</div>`;
}
export function controlsView(): string {
  return `<div class="bindings">${[
    ["Move", "W A S D"],
    ["Look", "Mouse"],
    ["Jump", "Space"],
    ["Sprint while moving forward", "Left Shift"],
    ["Break block", "Hold left click"],
    ["Place block / eat apple", "Right click"],
    ["Select hotbar slot", "1–9 / Wheel"],
    ["Inventory", "E"],
    ["Pause", "Esc"],
    ["Debug overlay", "F3"],
  ]
    .map(([a, b]) => `<div>${a}<kbd>${b}</kbd></div>`)
    .join(
      "",
    )}</div><div class="footactions">${btn("back", "Back", true)}</div>`;
}
export function itemIcon(id: number): string {
  if (id === 7) return `<span class="fruit">${icon("apple", 26)}</span>`;
  const colors =
    [
      [],
      ["#90b95a", "#88683f", "#6c5036"],
      ["#b68a5e", "#97704b", "#775238"],
      ["#bcc1b8", "#94998e", "#6f796e"],
      ["#d2ab76", "#926841", "#765035"],
      ["#91ba67", "#649450", "#427344"],
      ["#7b807a", "#565c55", "#454d46"],
    ][id] ?? [];
  return `<svg width="29" height="29" viewBox="0 0 24 24" aria-hidden="true"><path fill="${colors[0]}" d="m12 1 11 5-11 6L1 6z"/><path fill="${colors[1]}" d="m1 6 11 6v11L1 17z"/><path fill="${colors[2]}" d="m12 12 11-6v11l-11 6z"/></svg>`;
}
