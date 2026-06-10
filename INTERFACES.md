# CALEUCHE — Mitos de Chiloé · Module Contracts

A Three.js night-exploration game (Vite, plain ES modules, only runtime dep: `three`).
You play a fisher on a foggy Chiloé island seeking the favor of six mythological
beings; with all six favors, the ghost ship El Caleuche appears and you board it
at the old dock to win.

Global conventions
- y-up, sea level y = 0, units ≈ meters. Player eye height 1.7.
- Island centered at origin; coast ≈ radius 190–210; max hill ≈ 30–38 m near center.
- Aesthetic: low-poly procedural, `MeshStandardMaterial`, dark moonlit palette,
  emissive accents for magic. NO external assets, NO new dependencies, NO TypeScript.
- Every module: `import * as THREE from 'three'` only (plus the imports each
  contract explicitly allows).
- Renderer (main.js) uses ACESFilmic tone mapping. Glow recipe:
  `new THREE.PointLight(color, 20–40, 25–40, 1.8)` + emissive material accents.
- `update(t)` receives elapsed seconds; keep animations subtle and cheap.

## src/world/terrain.js
- `export function terrainHeight(x, z): number` — PURE and DETERMINISTIC
  (seeded value/simplex noise implemented inline — no deps, no Math.random at
  module scope without a fixed seed). ≈ 30–38 at center, smoothly falls below 0
  past radius ~200, sea floor −4…−8 offshore.
- `export function createTerrain(): THREE.Group` — island mesh sampled FROM
  `terrainHeight` so visuals match it exactly (PlaneGeometry ≥ 196×196 segments
  over a ~1000×1000 area, vertex colors: sand near y 0–1.5, grass/moss mid,
  rock high). Scatter low-poly trees (cypress-like cones, InstancedMesh, ≤ 500,
  only where 2 < height < 22) and some rocks. No lights here.

## src/world/water.js
- `export function createWater(): { object3d, update(t) }` — dark green-blue sea
  plane (~2000×2000) at y ≈ 0, transparent (opacity ~0.85), subtle vertex ripple
  or shimmer in `update(t)`. Cheap.

## src/world/sky.js
- `export function createSky(scene): { update(t) }` — sets
  `scene.fog = new THREE.FogExp2(…)` (#0d1b26-ish, density ~0.011) and a matching
  `scene.background`; adds HemisphereLight (~0.5), bluish moon DirectionalLight
  (~0.7) from high in the sky, a visible emissive moon disc far away toward
  (-400, 350, -300), and ~1500 star Points on a ~900-radius dome (slight twinkle
  in update). ALL global scene lighting lives here.

## src/beings/<id>.js — six files
`pincoya.js, trauco.js, camahueto.js, invunche.js, millalobo.js, sirena.js`
- Each: `export function createPincoya(): { group: THREE.Group, update(t) }`
  (same pattern, capitalized name: createTrauco, createCamahueto, createInvunche,
  createMillalobo, createSirena).
- Group origin = feet/base at local y = 0, facing local +Z. Humanoids 1.8–2.6 m
  tall. Built ONLY from three.js primitives (sphere/cone/cylinder/box/torus/
  lathe), MeshStandardMaterial, at least one emissive accent + one PointLight
  (recipe above) so each is findable in fog. Gentle idle motion in `update(t)`
  (sway/bob/light flicker). Optional small `THREE.Points` particles (≤ 60).
- Character notes (faithful to Chilote mythology):
  - **Pincoya** — beautiful dancer, long golden hair, seaweed dress, arms raised
    toward the sea, warm golden glow.
  - **Trauco** — ugly ~0.9 m forest dwarf, conical hat, ragged poncho, stone
    hatchet, sickly green glow.
  - **Camahueto** — silver calf/bull (~2 m tall quadruped), single GOLDEN
    emissive horn, pale blue glow.
  - **Invunche** — twisted cave guardian: head turned 180°, hunched, one leg
    folded against its back; include a small rock cave arch behind it in the
    group; dim red glow.
  - **Millalobo** — golden-furred sea-lion man, regal, ~2.8 m, seated on a small
    rock base (he is placed in shallow water), amber glow.
  - **Sirena** — mermaid on a rock (include the rock), pearly tail, combing her
    hair, cool aqua glow.

## src/caleuche.js
- `export function createCaleuche(): { group, update(t) }` — ghost galleon
  ~45 m long, bow facing LOCAL +Z, waterline at local y = 0. Dark hull, 3 masts,
  large square sails with pale spectral green-white emissive
  (0x9fffd0-ish), 2–4 ghostly green lantern PointLights, optional faint particle
  mist. `update(t)`: gentle bob/roll and sail shimmer ONLY — main.js owns world
  position/rotation; do not translate the group in update.

## src/beings/registry.js
- Imports: `terrainHeight` from `../world/terrain.js`, the six factories, and
  `LORE` from `../lore.js`.
- `export const BEINGS = [...]` — entries `{ id, factory, radius, position,
  name, title, lore, blessing }` (the last four spread from `LORE[id]`).
  `position = new THREE.Vector3(x, Math.max(terrainHeight(x, z), -0.3), z)`.
  Exact order/coords:
  | id | x | z | radius |
  |---|---|---|---|
  | pincoya | 30 | -170 | 7 |
  | trauco | 120 | 60 | 7 |
  | camahueto | -40 | 115 | 7 |
  | invunche | -30 | -35 | 7 |
  | millalobo | 140 | 140 | 9 |
  | sirena | -180 | 20 | 8 |

## src/lore.js
- `export const LORE = { [id]: { name, title, lore, blessing } }` — `name`:
  Spanish (e.g. "La Pincoya"); `title`: short English epithet; `lore`: 60–110
  words, English with Spanish flavor, faithful to Chilote mythology, atmospheric
  second person ("You find…"); `blessing`: one line, the favor granted.
- `export const STRINGS = { title, subtitle, intro, help, beginLabel,
  continueLabel, hudLabel, hint, banner, winTitle, winText }` — title "CALEUCHE",
  subtitle "Mitos de Chiloé", intro: 2–3 sentence premise (fisher seeks the
  favor of six beings to earn one night aboard the ghost ship), help: one line
  of controls (WASD move · mouse or arrow keys look · Shift run), hudLabel
  "Favores", hint "Algo se mueve cerca…", banner/winTitle/winText for the
  Caleuche arrival and victory.

## src/ui.js (+ src/style.css)
- `import { STRINGS } from './lore.js'`
- `export const ui = { init, showTitle, showEncounter, showBanner, updateHUD,
  showWin, closeModal, isModalOpen }`
  - `init()` — build all DOM inside the existing `#ui` div.
  - `showTitle(onStart)` — full-screen title card (title, subtitle, intro, help,
    Begin button → fades out, calls `onStart`).
  - `showEncounter(being, onClose)` — centered card: `being.name`, `being.title`,
    `being.lore`, `being.blessing`, a charm icon (✦), Continue button → `onClose`.
  - `showBanner(text)` — top banner, auto-hides after ~6 s.
  - `updateHUD(found, total, compassDeg, hint)` — bottom-left "Favores ✦
    found/total", a compass arrow div rotated `rotate(${compassDeg}deg)`
    (0 = target dead ahead, positive = clockwise/right), and a hint line
    (empty string hides it). Called every frame — must be cheap; only touch the
    DOM when values change.
  - `showWin()` — full-screen victory card (winTitle, winText, "✦ 6/6").
  - `closeModal()` — if the title or an encounter card is open, behave exactly
    as if its primary button was clicked (used by tests).
  - `isModalOpen(): boolean`
- `src/style.css` — dark maritime palette (deep blue-green, parchment text
  #e8dcc0, glow #9fffd0), serif display (Georgia fallback fine), subtle fade
  animations. Overlays use `pointer-events: auto` only on interactive elements;
  HUD is `pointer-events: none`. `#app canvas { display:block; position:fixed;
  inset:0 }`. `#ui` children positioned fixed above the canvas.

## src/player.js
- `export function createPlayer(camera, domElement, opts)` where
  `opts = { groundHeight(x,z): number, isWalkable(x,z): boolean }`.
- Returns `{ update(dt), position, get yaw(), setPosition(x, z, yaw?),
  get/set enabled, requestLock() }`.
  - `position` — a live THREE.Vector3 (may be camera.position itself).
  - WASD move at 12 m/s (Shift: 20) relative to yaw; mouse-look via Pointer Lock
    (request on domElement click and via `requestLock()`, wrapped in try/catch —
    it may be unavailable); pitch clamped ±1.45 rad; Arrow keys ALSO rotate the
    view (~2.2 rad/s) as a no-pointer-lock fallback.
  - Each frame: tentative move; if `!isWalkable(nx, nz)`, try axis-separated
    slide (x-only, then z-only). Camera y = `groundHeight(x,z) + 1.7` plus a
    slight walk bob. When `enabled` is false: ignore movement/look input.
  - No imports besides `three`. Guard all pointer-lock calls.
