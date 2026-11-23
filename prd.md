# Product Requirements Document: Blockworld

**Document status:** Implementation-ready  
**Version:** 1.0  
**Target release:** MVP  
**Primary purpose:** A deterministic, end-to-end benchmark project for testing coding models and agent harnesses  
**Reference genre:** Voxel sandbox inspired by the basic interaction loop of Minecraft; no original Minecraft assets, names, sounds, code, or proprietary content may be copied.

## 1. Product summary

Blockworld is a small, complete, single-player voxel sandbox game that runs in a desktop web browser. The player explores one procedurally generated temperate world, breaks and places blocks, collects resources, manages health and hunger, and can save and resume the world.

The game deliberately favors a narrow, fully working loop over breadth. It contains one biome, a limited block set, no enemies, no crafting, no multiplayer, and no infinite catalog of items. The build should nonetheless feel like a coherent game rather than a rendering demo: it must have a title screen, world creation, terrain, movement, collision, interaction, inventory, survival state, pause behavior, persistence, audio feedback, settings, death and respawn, and automated tests.

## 2. Product goals

1. Deliver a playable voxel sandbox from a clean checkout with one documented command.
2. Exercise a model or harness across rendering, procedural generation, state management, physics, UI, persistence, performance, and testing.
3. Specify behavior precisely enough that independent implementations converge on the same user-visible result.
4. Keep the asset and systems scope small enough for one implementation project.
5. Preserve deterministic behavior where practical so automated evaluation is reliable.

### 2.1 Success criteria

The MVP is successful when all of the following are true:

- A new user can create a world, move, jump, break blocks, collect blocks, place blocks, eat food, take fall damage, die, respawn, save, quit, and resume without instructions beyond the controls screen.
- The world is deterministic for a given seed and saved edits are restored exactly.
- No critical path produces uncaught errors in a supported browser.
- The game maintains the performance targets in section 15 on the reference test scene.
- The required automated test suite passes from a clean checkout.
- All P0 acceptance criteria are met.

## 3. Non-goals

The MVP must not include the following unless all required behavior is already complete:

- Multiple biomes, weather, seasons, dimensions, caves, liquids, lava, farming, redstone-like logic, or generated structures.
- Hostile or passive creatures, combat, armor, tools, durability, enchantments, experience, or quests.
- Crafting, furnaces, recipes, chests, equipment slots, or item stacking rules beyond the inventory described here.
- Multiplayer, accounts, cloud saves, server authority, chat, moderation, or leaderboards.
- Mobile, touch, gamepad, console, native desktop, or VR support.
- Modding, user-generated textures, scripting, or a public plugin API.
- Infinite world storage. Terrain may be generated beyond the initial area while playing, but implementation limits must be explicit.
- Photorealism, advanced lighting, dynamic shadows, ambient occlusion, or high-resolution art.

## 4. Assumptions and technical constraints

- **Platform:** Desktop web browser using WebGL 2. Chrome and Edge are required; current Firefox and Safari are best-effort.
- **Input:** Keyboard and mouse.
- **Session type:** Offline, single player.
- **Camera:** First person.
- **World model:** Axis-aligned cubic blocks on an integer 3D grid. One block equals one world unit.
- **Recommended stack:** TypeScript, a modern browser build tool, and Three.js or an equivalent WebGL abstraction. An implementation may choose another stack if all requirements and commands remain equivalent.
- **Assets:** Original procedural or repository-owned textures and sounds only. Placeholder assets must be redistributable and documented.
- **Persistence:** Browser-local storage, preferably IndexedDB. The game must not require a backend.
- **Determinism:** World generation must use a documented seeded pseudo-random number generator and must never use `Math.random()` in generation logic.
- **Coordinate convention:** `x` east/west, `y` up/down, `z` north/south. Block coordinates are integers. The player position is a floating-point world coordinate.
- **World seed:** A signed 32-bit integer. Text entered in the seed field is deterministically hashed to a signed 32-bit integer.

## 5. Target user and primary use cases

### 5.1 Primary user

A player or evaluator who wants a short, recognizable sandbox experience and needs to verify that the implementation is complete.

### 5.2 Core use cases

- Create a world with a random or supplied seed.
- Explore terrain and identify block types.
- Break blocks and receive them as inventory items.
- Select an owned block and place it into the world.
- Find and eat apples to restore hunger.
- Avoid or recover from fall damage.
- Save, reload, and verify that world edits and player state persist.
- Delete a save and start again.

## 6. Core game loop

1. The player enters a generated world at a safe spawn location.
2. The player explores using first-person controls.
3. The player targets and breaks blocks within reach.
4. Broken blocks enter the inventory, subject to stack capacity.
5. The player selects a block in the hotbar and places it on an exposed face.
6. Movement drains hunger slowly; sprinting and jumping drain it faster.
7. Apples, obtained as occasional drops from leaf blocks, restore hunger.
8. Falls can reduce health. At zero health the player dies and respawns.
9. Autosave and manual save preserve progress for the next session.

## 7. User experience and screens

### 7.1 Title screen — P0

Display the game title and these actions:

- **Continue:** Loads the most recently played save. Disabled if no valid save exists.
- **New World:** Opens world creation.
- **Load World:** Opens the saved-world list. Disabled if no saves exist.
- **Settings:** Opens global settings.
- **Controls:** Shows all bindings.

The title screen must not start or continue simulation in the background.

### 7.2 New World screen — P0

Fields and behavior:

- **World name:** Required after trimming; 1–32 visible characters; default `New World`. Duplicate names are allowed because saves use internal IDs.
- **Seed:** Optional string up to 64 characters. Blank generates a random signed 32-bit seed using browser cryptographic randomness. The resolved numeric seed is shown after world creation.
- **Create World:** Validates input, creates save metadata, generates spawn chunks, then enters play.
- **Back:** Returns without creating a save.

World creation shows progress and remains responsive. If generation fails, show a human-readable error and allow retry or return.

### 7.3 Load World screen — P0

Each row shows world name, seed, last-played local date/time, and game version. Actions:

- **Play** loads the save.
- **Delete** opens a confirmation naming the world. Deletion is permanent.
- Corrupt or incompatible saves remain listed with an error state and a delete option; the app must not crash.

Sort worlds by most recently played first. Support at least 10 saves.

### 7.4 Gameplay HUD — P0

The HUD contains:

- A fixed center crosshair.
- Ten red heart units representing 20 health points; half-heart display is permitted but damage values are integral.
- Ten hunger units representing 20 hunger points.
- A nine-slot hotbar centered at the bottom. Each slot shows icon, count, and selected state. Keys `1`–`9` select slots.
- A small target label above the hotbar showing the targeted block name; hide when nothing is targeted.
- A transient autosave indicator.
- A transient message area for errors such as `Cannot place block here` or `Inventory full`.

The HUD must remain legible at viewport widths of 1024 pixels and above.

### 7.5 Inventory screen — P0

Press `E` to open or close. Opening inventory pauses the simulation and releases pointer lock.

- Inventory has 27 storage slots plus the same nine hotbar slots, for 36 total.
- A slot holds one item type and a count from 1 to 64.
- Left click picks up or places an entire stack.
- Right click while holding a stack places one item into an empty or matching slot.
- Right click an occupied slot while holding nothing picks up half the stack, rounded up.
- Shift-click moves a stack between hotbar and storage, filling matching stacks before empty slots.
- Items may be rearranged but not discarded in the MVP.
- Pressing `Escape` closes the inventory and returns to pause behavior; clicking **Resume** reacquires pointer lock.

### 7.6 Pause menu — P0

`Escape` pauses simulation, releases pointer lock, and displays:

- Resume
- Save World
- Settings
- Controls
- Save and Quit to Title

If pointer lock is lost for any other reason, the game must pause and show the menu. No health, hunger, physics, or world changes occur while paused.

### 7.7 Death screen — P0

At zero health, pause normal controls and display `You died`, the cause (`Fell from a high place` or `Starved`), and:

- **Respawn:** Places the player at world spawn with full health, 18 hunger, zero vertical velocity, and unchanged inventory/world.
- **Quit to Title:** Saves, then returns to title.

## 8. World generation

### 8.1 World shape — P0

- Block coordinates use `y = 0` through `y = 95` inclusive.
- `y < 0` is solid/unbreakable void boundary behavior; `y > 95` is empty sky.
- Sea level is not needed because there is no water.
- The terrain surface should generally range from `y = 28` to `y = 52`, with gentle hills and occasional steeper slopes.
- Generation combines seeded 2D coherent noise at two frequencies. The exact library may vary, but the algorithm, constants, and PRNG must be documented in code so a seed is stable across sessions of the same game version.
- The bottom layer at `y = 0` is bedrock.
- From `y = 1` to three blocks below the surface, use stone.
- The three blocks below the surface are dirt.
- The surface block is grass.
- Air fills space above the surface.

### 8.2 Trees — P0

- Attempt a tree on approximately 1.5% of suitable grass columns, using seeded generation.
- Trees require enough vertical space and may not overlap another tree trunk.
- Trunk height is 4–6 wood blocks.
- Leaves form a compact roughly spherical/cuboid canopy 5 blocks wide and 3–4 blocks tall.
- Leaf blocks do not decay in the MVP.
- Do not generate a tree within four horizontal blocks of the selected spawn point.

### 8.3 Spawn selection — P0

Start search at world `(0, 0)` and inspect columns in expanding square rings up to a 32-block radius. Select the first column that:

- Has grass as its surface.
- Has two air blocks above it.
- Has a local slope no greater than one block across each of its four cardinal neighbors.
- Is not inside or immediately adjacent to a trunk.

Spawn the player's feet centered above that surface at `(x + 0.5, surfaceY + 1.01, z + 0.5)`. If no valid location exists, clear a 3×3 flat grass platform at the best candidate near the origin and remove blocks in the two-block headspace.

### 8.4 Chunks and streaming — P0

- Chunk footprint is 16×16 blocks in `x/z`; height covers the complete world.
- The chunk containing the player and chunks within the configured render distance are loaded.
- Default render distance is 6 chunks; settings allow 3–10.
- Generate missing chunks asynchronously or in bounded work units so no single normal frame is blocked for more than 50 ms after initial load.
- Unload render and collision resources outside render distance plus a two-chunk margin. Saved modifications must remain available.
- Faces shared by two opaque blocks must not be emitted.
- A chunk mesh must be rebuilt when a changed block can affect it. Editing an edge block also marks the neighboring chunk dirty.
- Greedy meshing is recommended but not required if performance targets are met.

### 8.5 World boundary — P0

The playable world is limited to chunk coordinates `-128` through `127` on each horizontal axis, or 4096×4096 blocks. Attempts to move or place beyond it are blocked by an invisible boundary. Display `World boundary reached` when targeted or touched. This limit must be represented as a named constant.

## 9. Block and item catalog

| ID | Name | Opaque | Solid | Break time | Drops | Placeable | Notes |
|---:|---|---|---|---:|---|---|---|
| 0 | Air | No | No | — | — | No | Never stored in inventory |
| 1 | Grass | Yes | Yes | 0.45 s | Dirt ×1 | Yes | Placed item becomes dirt, not grass |
| 2 | Dirt | Yes | Yes | 0.40 s | Dirt ×1 | Yes | — |
| 3 | Stone | Yes | Yes | 1.20 s | Stone ×1 | Yes | No tool requirement |
| 4 | Wood | Yes | Yes | 0.80 s | Wood ×1 | Yes | Distinct top/bottom texture |
| 5 | Leaves | No | Yes | 0.25 s | Leaves ×1 and possible apple | Yes | Alpha-tested texture; still collidable |
| 6 | Bedrock | Yes | Yes | Unbreakable | Nothing | No | Bottom layer |
| 7 | Apple | No | No | — | — | No | Inventory item only; consumable |

All block texture filtering must use nearest-neighbor sampling. Textures should be 16×16 or 32×32 pixels and visually distinct. Transparent pixels on leaves use alpha testing rather than blended sorting.

When a leaf block breaks, it always drops one Leaves item and has a deterministic 5% chance to also add one Apple. The outcome must be derived from the world seed and broken block coordinate so save/reload cannot reroll it.

## 10. Player controller and physics

### 10.1 Player body — P0

- Collision body: axis-aligned box 0.6 blocks wide, 0.6 deep, and 1.8 high.
- Camera eye height: 1.62 blocks above feet.
- The camera rotates with mouse movement; vertical pitch clamps to `-89°` through `+89°`.
- Mouse sensitivity is configurable.
- Collision resolves independently per axis or using swept AABB. The player must not tunnel through ordinary blocks at supported velocities.
- A grounded check uses a small tolerance and must not allow air jumps.

### 10.2 Controls — P0

| Action | Binding |
|---|---|
| Move | `W`, `A`, `S`, `D` |
| Look | Mouse |
| Jump | `Space` |
| Sprint | Hold `Left Shift` while moving forward |
| Break block | Hold primary mouse button |
| Place/use | Secondary mouse button |
| Hotbar select | `1`–`9` or mouse wheel |
| Inventory | `E` |
| Pause | `Escape` |
| Toggle debug overlay | `F3` |

Prevent browser context menus and page scrolling only while the game canvas is active.

### 10.3 Movement constants — P0

- Walk speed: 4.3 blocks/second.
- Sprint speed: 6.0 blocks/second.
- Ground acceleration: reach target speed in no more than 0.15 seconds.
- Air control: 25% of ground acceleration.
- Gravity: 24 blocks/second² downward.
- Jump vertical velocity: 8.0 blocks/second.
- Terminal downward velocity: 40 blocks/second.
- Maximum simulation step: 1/30 second; subdivide larger frame deltas to maintain collision stability.
- No crouching, flying, swimming, step assist, ladders, or auto-jump.

### 10.4 Fall damage — P0

Track the highest downward distance accumulated from leaving grounded state until landing. Falls of 3 blocks or less deal no damage. Longer falls deal `ceil(fallDistance - 3)` health points, capped at 20. Reset fall tracking when respawning. Walking down ordinary one-block terrain must not deal damage.

### 10.5 Recovery from invalid positions — P0

If loading places the player intersecting a block, search upward up to 16 blocks for the first safe two-block-high space. If none exists, use world spawn. If the player falls below `y = -10`, deal lethal damage with the fall death cause.

## 11. Block interaction

### 11.1 Targeting — P0

- Cast a ray from the camera center each simulation frame.
- Maximum reach is 5.0 blocks from camera origin.
- Use voxel grid traversal or equivalent exact block raycasting.
- Highlight the targeted block with a thin, high-contrast wireframe box slightly larger than the block to avoid z-fighting.
- Return both the hit block coordinate and the face normal.

### 11.2 Breaking — P0

- Hold primary mouse button while targeting a breakable block.
- Progress accumulates only while targeting the same block and button remains held.
- Show a visible cracking/progress overlay or a circular HUD progress indicator.
- Looking away, releasing the button, opening a menu, or moving out of range resets progress to zero.
- On completion, replace the block with air, play feedback, and add drops to inventory.
- If every applicable inventory stack is full and no slot is empty, do not break the block; show `Inventory full` and reset progress.
- Bedrock shows `Unbreakable` and never accumulates progress.

### 11.3 Placing — P0

On secondary click with a placeable block selected:

1. Determine the empty cell adjacent to the hit face.
2. Reject if out of reach, out of bounds, occupied, or intersecting the player's collision body.
3. Place exactly one block and decrement the selected stack.
4. If the selected stack reaches zero, clear the slot.
5. Rebuild affected chunk meshes and collision data.

Apply a 150 ms placement cooldown to prevent accidental rapid placement. Placement must work on top, bottom, and all four side faces.

### 11.4 Eating — P0

With an Apple selected, secondary click consumes one apple if hunger is below 20 and restores 4 hunger points, capped at 20. If hunger is full, do not consume it and show `Not hungry`. Eating is instantaneous for MVP.

## 12. Inventory and item acquisition

- New players start with an empty 36-slot inventory.
- Hotbar slots are inventory slots 0–8; storage slots are 9–35.
- Items automatically enter the first non-full matching stack, then the first empty slot, scanning hotbar before storage.
- Maximum stack size is 64 for every item.
- Breaking grass adds Dirt, as specified by the catalog.
- No floating item entities exist. Drops go directly to the inventory.
- Inventory state, selected hotbar slot, and any stack held by the cursor must be normalized before saving. If a menu closes while holding a cursor stack, return it to its source or the first valid slot; the game must not lose it.

## 13. Health and hunger

### 13.1 Health — P0

- Maximum health is 20; new and respawned players begin with 20.
- Health never exceeds 20 or drops below zero.
- Damage causes a brief red screen vignette and sound.
- With hunger at 18 or above, regenerate 1 health every 4 seconds until full, consuming 1 hunger for each health restored.

### 13.2 Hunger — P0

- Maximum hunger is 20; a new player begins with 20 and respawns with 18.
- Maintain a hidden exhaustion value starting at zero.
- Add exhaustion at these rates: walking 0.01 per block, sprinting 0.10 per block, and jumping 0.20 per jump.
- When exhaustion reaches 4.0, subtract 4.0 and reduce hunger by 1, to a minimum of zero.
- At zero hunger, deal 1 starvation damage every 4 seconds until health reaches zero.
- Hunger, exhaustion, and starvation/regeneration timers do not advance while paused.

## 14. Save data and persistence

### 14.1 Required saved state — P0

Each world save contains:

- Schema version and game version.
- Internal world UUID, display name, numeric seed, creation time, and last-played time.
- World generation version.
- Player position, yaw, pitch, health, hunger, exhaustion, inventory, and selected hotbar slot.
- World spawn position.
- Block modifications represented as coordinate plus current block ID, grouped by chunk. Store only differences from generated terrain.
- Settings that are world-specific, if any.

### 14.2 Save behavior — P0

- Autosave every 30 seconds of unpaused play and immediately after respawn.
- Manual save from the pause menu.
- Save before returning to title or on `visibilitychange`/`pagehide` when feasible.
- Saving must be atomic from the application's perspective: write a new snapshot/transaction and mark it current only after success.
- A save failure shows a persistent warning and never claims success.
- Loading regenerates base terrain from seed, then applies modifications.
- A block changed back to its generated value is removed from the modifications set.

### 14.3 Versioning and corruption — P0

- Validate all loaded data at runtime; TypeScript types alone are insufficient.
- Reject unknown newer schema versions with a clear message.
- Provide migration functions between supported schema versions beginning with version 1.
- Malformed inventory entries, invalid block IDs, non-finite coordinates, and out-of-range stats must not enter live state.
- A corrupt save must not prevent the title screen or other saves from working.

## 15. Performance and quality requirements

### 15.1 Reference environment

A current stable Chrome browser at 1920×1080 on a four-core laptop-class CPU with integrated graphics, using default settings and a six-chunk render distance.

### 15.2 Targets — P0 unless noted

- Median frame rate at least 55 FPS while walking through fully generated terrain.
- 1st-percentile frame rate at least 30 FPS after the first 10 seconds of a session.
- Initial title screen interactive within 3 seconds on a warm local load.
- New-world spawn playable within 8 seconds.
- Returning to a previously generated nearby chunk causes no pause longer than 100 ms.
- No sustained increase greater than 20 MB in heap usage after walking back and forth across the same chunk boundary 50 times.
- No more than one WebGL draw call per opaque chunk mesh and one per leaf chunk mesh, excluding UI and selection highlight.
- Audio starts only after a user gesture.
- Window resize and device-pixel-ratio changes update rendering without stretching. Cap effective pixel ratio at 2.

## 16. Visual and audio direction

### 16.1 Visuals — P1 except functional clarity

- Bright, stylized pixel art with a clear blue sky and mild distance fog.
- One directional light plus ambient/hemisphere light; no dynamic shadows required.
- Grass, dirt, stone, wood, leaves, bedrock, and apple must be identifiable by color and pattern without reading labels.
- Use a fixed-color sky; no day/night cycle.
- Chunk boundaries must not show cracks.
- UI can use CSS/HTML overlay or canvas, but text must remain crisp.

### 16.2 Audio — P1

- Distinct short sounds for dirt/grass, stone, wood, and leaves when breaking or placing.
- Footstep sounds vary at least between stone and soft ground.
- Sounds for jump/land, damage, eat, inventory action, and death.
- Master and effects volume sliders from 0–100%, persisted globally.
- No music required.

The game remains fully playable if audio files fail to load.

## 17. Settings and accessibility

### 17.1 Settings — P0

- Mouse sensitivity, default 50%, range 10–200%.
- Field of view, default 75°, range 60–100°.
- Render distance, default 6 chunks, range 3–10.
- Master volume and effects volume, default 70%.
- Invert vertical look, default off.
- Show FPS, default off.

Settings persist globally and apply immediately where safe. Render-distance changes may show a loading indicator.

### 17.2 Accessibility — P1

- All menus are keyboard navigable with visible focus states.
- UI contrast meets WCAG AA for text and interactive elements.
- Do not communicate selected, damaged, or disabled state using color alone.
- Provide an option to reduce screen damage flash.
- Provide text labels/tooltips for item icons.
- Respect reduced-motion preference for menu animation.

## 18. Debuggability and observability

### 18.1 Debug overlay — P0

`F3` toggles a non-interactive overlay containing:

- FPS and frame time.
- Player position rounded to two decimals.
- Current block coordinate and chunk coordinate.
- Facing cardinal direction plus yaw/pitch.
- Loaded chunk count and dirty mesh queue length.
- World name and numeric seed.
- Targeted block ID/name and coordinate, if present.

Do not expose private browser or user data.

### 18.2 Error handling — P0

- Register top-level error and unhandled rejection handlers in production builds.
- Show a recoverable in-game error panel with a concise message and `Return to Title` action for fatal session errors.
- Log technical detail to the developer console.
- Asset failures use fallback visuals/silence where possible.
- Never leave the player on an indefinite loading screen; after 15 seconds, show progress detail and retry/return actions.

## 19. Architecture requirements

The implementation should separate these responsibilities behind explicit interfaces:

- Application/screen state machine.
- Input collection and pointer-lock handling.
- Fixed-step player simulation and collision.
- Seeded terrain generation.
- Chunk repository, streaming, and lifecycle.
- Block storage and world modification overlay.
- Meshing and rendering.
- Raycast interaction.
- Inventory domain logic.
- Health/hunger simulation.
- Persistence repository and schema migration.
- UI presentation and settings.
- Audio service.

Rules that affect gameplay must be testable without WebGL. Rendering must consume world state rather than own it. Global mutable singletons should be limited to platform adapters. Every recurring loop, event listener, worker, mesh, geometry, material, and texture must have an explicit disposal path.

Recommended main states are `TITLE`, `WORLD_CREATE`, `WORLD_LOAD`, `LOADING`, `PLAYING`, `INVENTORY`, `PAUSED`, `DEAD`, and `FATAL_ERROR`. Legal transitions should be enumerated and tested.

## 20. Required repository and developer experience

The repository must include:

- A README with prerequisites, install, run, test, build, preview, and save-reset instructions.
- A license and asset attribution file.
- `.env.example` only if environment variables are genuinely needed; the MVP should need none.
- Formatting, linting, unit-test, integration-test, and production-build scripts.
- No committed secrets, generated dependency folders, or externally hosted runtime dependencies.

Expected commands (names may match the chosen package manager):

```text
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run preview
```

`npm run build` must produce a static deployable bundle. A clean install followed by lint, typecheck, test, and build must complete without manual configuration.

## 21. Testing requirements

### 21.1 Unit tests — P0

Cover at minimum:

- Seed hashing and PRNG repeatability.
- Terrain height and tree determinism for known seed/coordinates.
- World-to-chunk conversion, including negative coordinates.
- Block modification overlay and removal when restored to generated value.
- Visible-face decisions at chunk edges.
- Voxel raycast hit coordinate and face normal in all six directions.
- AABB collision against floor, wall, ceiling, and corner.
- Grounding, jump gating, terminal velocity, and fall damage thresholds.
- Inventory stacking, capacity, split, merge, shift-click, and rollback behavior.
- Placement rejection inside player body.
- Hunger exhaustion, regeneration, starvation, eating, death, and respawn.
- Save serialization, validation, migration, corruption rejection, and round trip.
- State-machine legal and illegal transitions.

### 21.2 Integration tests — P0

Use platform adapters or an in-memory persistence implementation to test:

- Create world → generate → enter play.
- Break block → inventory receives drop → save → load → block remains broken and item remains.
- Place block across a chunk edge → both chunk meshes become dirty → save/load retains block.
- Die from fall → respawn safely with inventory unchanged.
- Fill inventory → attempted break is rejected and world remains unchanged.
- Pointer-lock loss → simulation pauses.

### 21.3 End-to-end tests — P0

Automate in a supported browser where possible. Provide test hooks that simulate deterministic actions without relying on fragile raw mouse movement. Required scenarios:

1. Title screen loads with Continue disabled on empty storage.
2. Create a named world with seed `benchmark-001` and reach the gameplay HUD.
3. Confirm debug overlay reports the expected numeric seed and finite position.
4. Break a known reachable block and observe the hotbar count increase.
5. Place the selected block and observe the count decrease.
6. Save and quit; Continue loads the same world and position within tolerance.
7. Change FOV and render distance; reload the page and verify persistence.
8. Delete the save and verify Continue is disabled again.

### 21.4 Manual QA checklist — P0

- No seams, missing faces, or inverted textures at chunk boundaries.
- Player cannot pass through corners, jump in air, stand inside placed blocks, or escape the world boundary.
- All six placement faces behave correctly.
- Breaking progress cancels in every required case.
- Inventory operations never duplicate or lose items.
- Pausing truly freezes survival and physics timers.
- Repeated new/load/delete cycles do not leak active render loops or event listeners.
- Resize, tab hide/show, and pointer-lock denial recover gracefully.
- Gameplay remains possible with audio disabled and after an individual texture failure.

## 22. Acceptance criteria by feature

The following are release-blocking P0 criteria:

### World

- The same seed and generation version produce the same block ID at every unmodified coordinate.
- The spawn algorithm always yields a non-intersecting, supported position.
- Chunk streaming loads and unloads around the player without losing modifications.
- Edits on chunk boundaries update both visible sides correctly.

### Player

- Movement values match section 10 within normal floating-point tolerance.
- Collision prevents entry into every solid block type.
- Jump is available only while grounded.
- Fall and starvation damage can cause the correct death screen and respawn.

### Interaction and inventory

- Target reach never exceeds 5.0 blocks.
- Every breakable block respects its specified break time within one simulation tick.
- Breaking and placement update rendering, collision, inventory, and persistence as one logical action.
- Invalid placement never decrements inventory.
- Full inventory never destroys a world block or its drops.

### Persistence

- Reload restores all state listed in section 14 within position tolerance of 0.001 blocks and angle tolerance of 0.1°.
- Base generated chunks without modifications are not redundantly stored as complete block arrays.
- Save corruption is isolated to the affected save and communicated to the user.

### Product completeness

- Every screen and control listed as P0 is reachable and functional.
- No P0 feature depends on opening developer tools.
- Lint, typecheck, unit, integration, E2E, and production build commands succeed.

## 23. Delivery phases

### Phase 1: Foundation

Set up build, TypeScript strictness, lint/test tooling, screen state machine, canvas lifecycle, input abstraction, and placeholder title/game screens.

**Exit:** Clean build; title can create a deterministic empty test world and enter/leave a stable render loop.

### Phase 2: World and rendering

Implement blocks, seeded terrain, trees, chunk storage, meshing, streaming, textures, camera, lighting, fog, and debug overlay.

**Exit:** The player can spectate a deterministic, performant world with no chunk seams.

### Phase 3: Play mechanics

Implement player physics, collision, targeting, breaking, placement, inventory, hotbar, block feedback, and boundary behavior.

**Exit:** The core explore/break/collect/place loop works and has domain-level automated tests.

### Phase 4: Game state

Implement health, hunger, apples, fall damage, regeneration, starvation, death, respawn, pause, inventory UI, settings, and controls screen.

**Exit:** A complete play session from spawn through death and respawn works.

### Phase 5: Persistence and shell

Implement save schema, IndexedDB repository, autosave, manual save, world list, continue, deletion, validation, migration framework, and error flows.

**Exit:** The complete loop survives page reload and corrupt-save tests.

### Phase 6: Quality and release

Add audio, polish, accessibility, performance profiling, disposal/leak checks, E2E coverage, documentation, attribution, and final acceptance pass.

**Exit:** All P0 acceptance criteria pass in a clean production build; unresolved P1 items are documented.

## 24. Evaluation rubric for model and harness testing

Score each category from 0–4. A release candidate requires no zero, at least 3 in every P0 category, and at least 28/36 total.

| Category | Weight guidance | 4-point standard |
|---|---:|---|
| Setup and build | P0 | Clean documented commands; no warnings/errors; static production bundle |
| World determinism | P0 | Known seeds, trees, chunks, and edits are repeatable across reloads |
| Rendering and streaming | P0 | Correct faces/edges, bounded lifecycle, meets performance targets |
| Player physics | P0 | Stable movement, collision, jump, fall behavior at variable frame rates |
| Interaction and inventory | P0 | All valid/invalid cases preserve atomic state and exact counts |
| Survival and lifecycle | P0 | Hunger, health, death, pause, and respawn match the spec |
| Persistence | P0 | Complete, validated, versioned, corruption-tolerant round trips |
| UI and usability | P0 | Complete navigation, understandable feedback, no dead ends |
| Tests and maintainability | P0 | Required coverage, separable domain logic, disposal, useful documentation |

Interpretation: `0` absent or unusable; `1` partially present with major defects; `2` works on the happy path but misses specified cases; `3` meets the PRD with minor non-blocking defects; `4` meets the PRD cleanly with strong tests and polish.

## 25. Definition of done

The product is done when:

1. All P0 requirements and acceptance criteria in this document are implemented.
2. The game completes the full user journey without console errors: create → explore → break → place → eat → take damage → die → respawn → save → quit → load.
3. Automated tests cover the required cases and pass in a clean environment.
4. The production build meets performance targets on the reference environment.
5. Save compatibility, asset ownership, known limitations, and exact setup commands are documented.
6. No out-of-scope system is required to make the core loop coherent.

## 26. Optional post-MVP backlog

Only begin these after the definition of done is met:

- Block breaking particles and improved sound variation.
- Configurable key bindings.
- Screenshot mode and world export/import.
- Simple crafting and tools.
- Passive creatures.
- Day/night cycle.
- Additional biome types.
- Multiplayer architecture exploration.


