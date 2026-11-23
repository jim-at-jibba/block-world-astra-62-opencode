# Blockworld — Field Edition

A first-person, single-player voxel sandbox for desktop browsers. Create a seed, explore a temperate forest, mine and place blocks, gather apples, and save your expedition locally.

## Run

Use **Node.js 24 LTS**, npm, and current desktop Chrome or Edge with WebGL 2 enabled.

```sh
npm install && npm run dev
```

Open the local URL printed by Vite. Select **New World → Create World**. The mouse controls your view; Escape releases it. Select **Controls** on the title or pause screen for all bindings. Audio starts after a gesture.

## Developer commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Reproduce the locked dependency installation |
| `npm run dev` | Start the development server |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run format` | Format TypeScript, CSS and configuration |
| `npm test` | Domain, integration, repository and state-machine suite |
| `npm run test:integration` | Focused session integration check |
| `npx playwright install chromium` | Install the full Chromium browser for browser tests |
| `npm run test:e2e` | Exercise the UI, real WebGL, pointer lock, edits, saves, settings and deletion |
| `npm run build` / `npm run preview` | Produce and locally serve `dist/` |
| `npm run benchmark` | Benchmark the production optimizer's output at 1920×1080 |

On minimal Linux CI images, use `npx playwright install --with-deps chromium`. Serve the static `dist/` directory over localhost or HTTPS. No backend, environment variables, accounts, remote fonts or asset CDN required.

## Playing

- **WASD** moves, **Space** jumps, **Left Shift + W** sprints. Hold the primary mouse button to mine; use the secondary button to place the selected block or eat an apple.
- **1–9** or the wheel selects a hotbar slot. **E** opens inventory. Left-click moves a stack; right-click splits or deposits one; Shift-click transfers between storage and hotbar. Nothing drops on the ground.
- **Escape** pauses. **F3** displays coordinates, seed, FPS, facing and chunk diagnostics.
- Falls over three blocks hurt. Movement spends hunger; eating an apple restores four points. High hunger allows regeneration. Respawning preserves inventory and edits.

## Worlds and saves

Seed text is trimmed, then hashed using FNV-1a over UTF-8; signed 32-bit integer inputs are used directly. A blank seed uses browser cryptographic randomness. `benchmark-001` resolves to **−2104347378**. Generation v1 uses coordinate-hashed coherent value noise at two frequencies. Constants, interpolation, spawn search and cross-chunk tree generation are in `src/world.ts`.

The world is 4096×4096 blocks, y=0–95, split into 16×16 columns. Only edits are stored. Each UUID has a single atomic `localStorage.setItem` snapshot. Autosave runs every 30 seconds of play and after respawn; the pause menu supports manual save. Saves are browser-, profile- and origin-specific. Quota errors leave the previous snapshot intact and display a warning.

Schema 1 and generation 1 are supported. Runtime validation rejects unsupported versions and malformed data. Damaged worlds remain deletable. In **Load World**, delete an individual world by name. To reset all worlds and settings, clear this site's browser storage (keys `blockworld.world.*` and `blockworld.settings`). Deletion cannot be undone.

## Source map

| Area | Source |
| --- | --- |
| Voxel generation, chunk cache, edit overlay, DDA raycast | `src/world.ts` |
| Visible-face mesher, streaming budget, atlas, camera, lighting | `src/render.ts` |
| Swept AABB controller, survival, transactional inventory, mining and placement | `src/game.ts` |
| Save repository, migration boundary, settings | `src/store.ts` |
| Screen transitions, mouse and keyboard adapter | `src/state.ts`, `src/input.ts` |
| Browser lifecycle, fixed-step loop and UI composition | `src/main.ts`, `src/ui.ts` |
| Audio and original art | `src/audio.ts`, `src/icons.ts`, `tools/cover.py` |

## Verification

The browser journey uses developer-only `?test` hooks to aim precisely and invoke the same mining and placement rules used by the mouse. Hooks are excluded from a normal production build. Full Chromium is used because its headless shell can refuse pointer lock.

`npm run benchmark` builds a separate instrumented bundle, opens seed `0`, waits for default-distance meshes to finish, and walks across an actual chunk boundary 50 times. It prints GPU identity, spawn latency, median and 1st-percentile FPS (after the first 10 seconds), longest sampled frame, and GC-controlled retained JS heap growth. Use `HEADED=1 npm run benchmark` for an on-screen run. Results depend on GPU, browser and system load; a software-rendered run is not a reference-hardware certification.

See [manual QA](docs/qa.md) and [asset credits](ATTRIBUTION.md). Source and original assets are MIT-licensed.
