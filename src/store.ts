import type { Edits, Vec, World } from "./world";
import { CHUNK_MAX, CHUNK_MIN, CHUNK_SIZE, WORLD_HEIGHT } from "./world";
import type { Game, Player } from "./game";

export interface Save {
  id: string;
  name: string;
  seed: number;
  created: number;
  lastPlayed: number;
  schemaVersion: number;
  gameVersion: string;
  genVersion: number;
  spawn: Vec;
  edits: Edits;
  player: Player;
}

type Summary = Pick<
  Save,
  "id" | "name" | "seed" | "lastPlayed" | "gameVersion"
> & { error?: string };

export interface Settings {
  sensitivity: number;
  fov: number;
  distance: number;
  master: number;
  effects: number;
  invert: boolean;
  fps: boolean;
  reducedFlash: boolean;
}

const defaults: Settings = {
  sensitivity: 50,
  fov: 75,
  distance: 6,
  master: 70,
  effects: 70,
  invert: false,
  fps: false,
  reducedFlash: false,
};
const prefix = "blockworld.world.";
const settingsKey = "blockworld.settings";
const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const schemaVersion = 1;
const genVersion = 1;
const gameVersion = "1.0.0";

function object(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function range(x: unknown, min: number, max: number): x is number {
  return typeof x === "number" && Number.isFinite(x) && x >= min && x <= max;
}

function integer(x: unknown, min: number, max: number): x is number {
  return range(x, min, max) && Number.isInteger(x);
}

function seedValue(x: unknown): x is number {
  return integer(x, -2147483648, 2147483647);
}

function worldId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validName(x: unknown): x is string {
  return (
    typeof x === "string" &&
    x.length > 0 &&
    x.trim() === x &&
    Array.from(x).length <= 32 &&
    !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(x) &&
    /[^\s\p{Cf}]/u.test(x)
  );
}

export function resolveSeed(text: string): number {
  if (Array.from(text).length > 64)
    throw new Error("Seed must be 64 characters or fewer.");
  const trimmed = text.trim();
  if (!trimmed) return crypto.getRandomValues(new Int32Array(1))[0]!;
  if (/^[+-]?\d+$/.test(trimmed) && seedValue(Number(trimmed)))
    return Number(trimmed) | 0;
  let hash = 2166136261;
  for (const byte of new TextEncoder().encode(trimmed))
    hash = Math.imul(hash ^ byte, 16777619);
  return hash | 0;
}

function validSettings(x: unknown): x is Settings {
  return (
    object(x) &&
    range(x.sensitivity, 10, 200) &&
    range(x.fov, 60, 100) &&
    integer(x.distance, 3, 10) &&
    range(x.master, 0, 100) &&
    range(x.effects, 0, 100) &&
    typeof x.invert === "boolean" &&
    typeof x.fps === "boolean" &&
    typeof x.reducedFlash === "boolean"
  );
}

export function getSettings(): Settings {
  try {
    const raw: unknown = JSON.parse(
      localStorage.getItem(settingsKey) ?? "null",
    );
    if (validSettings(raw)) return raw;
  } catch {
    /* Storage may be unavailable or contain invalid JSON. */
  }
  return { ...defaults };
}

export function putSettings(settings: Settings): void {
  if (!validSettings(settings)) throw new Error("Invalid settings.");
  localStorage.setItem(settingsKey, JSON.stringify(settings));
}

function position(x: unknown): x is Vec {
  const min = CHUNK_MIN * CHUNK_SIZE,
    max = (CHUNK_MAX + 1) * CHUNK_SIZE;
  return (
    object(x) &&
    range(x.x, min, max) &&
    x.x < max &&
    range(x.z, min, max) &&
    x.z < max &&
    range(x.y, -64, WORLD_HEIGHT + 32)
  );
}

function validSpawn(x: unknown): x is Vec {
  return position(x) && range(x.y, 1, WORLD_HEIGHT);
}

function validPlayer(x: unknown): x is Player {
  const pitchLimit = (89 * Math.PI) / 180 + 1e-10;
  return (
    object(x) &&
    position(x.pos) &&
    Number.isFinite(x.yaw) &&
    range(x.pitch, -pitchLimit, pitchLimit) &&
    integer(x.health, 0, 20) &&
    integer(x.hunger, 0, 20) &&
    range(x.exhaustion, 0, 4) &&
    x.exhaustion < 4 &&
    integer(x.selected, 0, 8) &&
    (x.deathCause === undefined ||
      x.deathCause === "Starved" ||
      x.deathCause === "Fell from a high place") &&
    (x.motion === undefined ||
      (object(x.motion) &&
        object(x.motion.velocity) &&
        range(x.motion.velocity.x, -6, 6) &&
        range(x.motion.velocity.y, -40, 8) &&
        range(x.motion.velocity.z, -6, 6) &&
        range(x.motion.apex, -64, 128) &&
        range(x.motion.regen, 0, 4) &&
        range(x.motion.starvation, 0, 4))) &&
    Array.isArray(x.inventory) &&
    x.inventory.length === 36 &&
    Array.from(x.inventory).every(
      (s: unknown) =>
        s === null ||
        (object(s) &&
          (integer(s.id, 1, 5) || s.id === 7) &&
          integer(s.count, 1, 64)),
    )
  );
}

function validEdits(x: unknown): x is Edits {
  if (!object(x)) return false;
  for (const [chunk, group] of Object.entries(x)) {
    const [cx, cz] = chunk.split(",").map(Number);
    if (
      chunk !== `${cx},${cz}` ||
      !integer(cx, CHUNK_MIN, CHUNK_MAX) ||
      !integer(cz, CHUNK_MIN, CHUNK_MAX) ||
      !object(group)
    )
      return false;
    for (const [cell, block] of Object.entries(group)) {
      const [bx, by, bz] = cell.split(",").map(Number);
      if (
        cell !== `${bx},${by},${bz}` ||
        !Number.isInteger(bx) ||
        !Number.isInteger(bz) ||
        Math.floor(bx / CHUNK_SIZE) !== cx ||
        Math.floor(bz / CHUNK_SIZE) !== cz ||
        !integer(by, 1, WORLD_HEIGHT - 1) ||
        !integer(block, 0, 5)
      )
        return false;
    }
  }
  return true;
}

export function makeSave(
  name: string,
  seed: number,
  world: World,
  game: Game,
): Save {
  const trimmed = name.trim();
  if (!validName(trimmed))
    throw new Error("World name must contain 1–32 visible characters.");
  if (!seedValue(seed) || seed !== world.seed || game.world !== world)
    throw new Error("World seed or session does not match.");
  const now = Date.now();
  const id = worldId();
  return migrate(
    structuredClone({
      id,
      name: trimmed,
      seed,
      created: now,
      lastPlayed: now,
      schemaVersion,
      gameVersion,
      genVersion,
      spawn: world.spawn,
      edits: world.edits,
      player: game.checkpoint(),
    }),
    id,
  );
}

function migrate(raw: unknown, id: string): Save {
  if (!object(raw)) throw new Error("World data is malformed.");
  if (raw.schemaVersion !== schemaVersion)
    throw new Error(
      `Unsupported save schema version: ${String(raw.schemaVersion)}.`,
    );
  if (raw.genVersion !== genVersion)
    throw new Error(
      `Unsupported terrain generation version: ${String(raw.genVersion)}.`,
    );
  if (
    raw.id !== id ||
    !uuid.test(id) ||
    !validName(raw.name) ||
    !seedValue(raw.seed) ||
    typeof raw.gameVersion !== "string" ||
    !raw.gameVersion.trim() ||
    !integer(raw.created, 0, 8640000000000000) ||
    !integer(raw.lastPlayed, raw.created, 8640000000000000)
  ) {
    throw new Error("Invalid world metadata.");
  }
  if (!validSpawn(raw.spawn)) throw new Error("Invalid world spawn.");
  if (!validEdits(raw.edits)) throw new Error("Invalid terrain edits.");
  if (!validPlayer(raw.player)) throw new Error("Invalid player data.");
  return {
    id,
    name: raw.name,
    seed: raw.seed,
    created: raw.created,
    lastPlayed: raw.lastPlayed,
    schemaVersion,
    genVersion,
    gameVersion: raw.gameVersion,
    spawn: raw.spawn,
    edits: raw.edits,
    player: raw.player,
  };
}

export function save(s: Save): void {
  const snapshot = migrate(s, s.id);
  snapshot.lastPlayed = Math.max(snapshot.created, Date.now());
  localStorage.setItem(prefix + s.id, JSON.stringify(snapshot));
  s.lastPlayed = snapshot.lastPlayed;
}

export function load(id: string): Save {
  const stored = localStorage.getItem(prefix + id);
  if (stored === null) throw new Error("World no longer exists.");
  let raw: unknown;
  try {
    raw = JSON.parse(stored);
  } catch {
    throw new Error("World data is not valid JSON.");
  }
  return migrate(raw, id);
}

export function remove(id: string): void {
  localStorage.removeItem(prefix + id);
}

export function list(): Summary[] {
  const rows: Summary[] = [];
  let storage: Storage;
  try {
    storage = localStorage;
    void storage.length;
  } catch {
    return rows;
  }
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const id = key.slice(prefix.length);
    let raw: unknown;
    try {
      raw = JSON.parse(storage.getItem(key) ?? "null");
      const { name, seed, lastPlayed, gameVersion: version } = migrate(raw, id);
      rows.push({ id, name, seed, lastPlayed, gameVersion: version });
    } catch (error) {
      const meta = object(raw) ? raw : {};
      rows.push({
        id,
        name: validName(meta.name) ? meta.name : "Damaged world",
        seed: seedValue(meta.seed) ? meta.seed : 0,
        lastPlayed: integer(meta.lastPlayed, 0, 8640000000000000)
          ? meta.lastPlayed
          : 0,
        gameVersion:
          typeof meta.gameVersion === "string" ? meta.gameVersion : "Unknown",
        error:
          error instanceof SyntaxError
            ? "World data is not valid JSON."
            : error instanceof Error
              ? error.message
              : "Unreadable world.",
      });
    }
  }
  return rows.sort(
    (a, b) => b.lastPlayed - a.lastPlayed || a.id.localeCompare(b.id),
  );
}
