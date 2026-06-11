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
  or shimmer in `update(t)`. Cheap. Horror grade: color toward 0x0a2226,
  emissive floor 0x031014 — the sea reads as ink.

## HORROR shadow flags (terrain.js edit)
- `terrainHeight` MUST NOT CHANGE (saves, registry, physics depend on it).
- ground mesh: `receiveShadow = true`. Tree/rock InstancedMeshes:
  `castShadow = true` (crowns + trunks; receiveShadow false is fine).
- Palette: pull grass/moss saturation down ~20% and a touch colder; sand
  slightly grey. Add ~18 seeded DEAD trees (bare trunk + 2–3 branch
  cylinders, near-black bark, slight lean, castShadow) scattered where
  2 < h < 24, avoiding the CLEARINGS list.

## src/world/sky.js — HORROR relight + shadows
- `export function createSky(scene): { update(t, focus?) }` — sets
  `scene.fog = new THREE.FogExp2(…)` and a matching `scene.background`; adds
  HemisphereLight, a moon DirectionalLight, a visible emissive moon disc far
  away toward (-400, 350, -300), and ~1500 star Points on a ~900-radius dome
  (slight twinkle in update). ALL global scene lighting lives here.
- Horror palette: fog #0a161a-ish (colder, faintly green), density ~0.0125;
  hemisphere ~(sky 0x4a6280, ground 0x1c2620, 2.4); moon light 0xb8c8e8 at
  ~2.0. Keep the island READABLE — horror comes from contrast and the fx
  pass, not mud.
- SHADOWS: the moon DirectionalLight has castShadow = true, 2048×2048 map,
  OrthographicCamera frustum ±75 m, bias ≈ -0.0008, normalBias ≈ 0.6. In
  `update(t, focus)` (focus = player position Vector3, may be undefined on
  early frames) move the light and its target so the shadow frustum stays
  centered on the player (light offset along its fixed direction; call
  light.target.updateMatrixWorld()).
- Add 4–6 vast slow cloud silhouettes (dark, transparent planes high up,
  drifting barely) so the sky is not empty.

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

## src/audio.js — HORROR soundscape
- `export function createAudio(): { unlock(), update(dt, ctx), stinger(name),
  toggleMute(): boolean, get state() }`
- 100% procedural WebAudio — no assets. Lazy AudioContext created inside
  `unlock()` (first user gesture); every method is a safe no-op before unlock
  or if WebAudio is unavailable. Master gain ~0.3 with a gentle compressor.
  All level changes via setTargetAtTime (no clicks). CPU-light: one shared
  noise buffer, few persistent nodes.
- `update(dt, ctx)` with `ctx = { moving: boolean, run: boolean,
  playerHeight: number, nearestDist: number, caleucheDist: number|null,
  dread: number (0..1), stalker: null|'hidden'|'lurk'|'stalk'|'rush',
  stalkerDist: number|null, won: boolean }`. Layers:
  - wind — filtered noise, slow LFO wander, always on; thins out (high-passes,
    quietens) as `nearestDist` drops under ~25 m — the island holds its breath
    near a being.
  - surf — low rumbling noise swells (8–12 s period), louder as playerHeight
    drops toward the waterline (full below ~2 m, faded out above ~10 m).
  - footsteps — soft noise taps when moving, cadence ~2.2 Hz walking / 3.2 Hz
    running, randomized pitch/level.
  - dread drone — detuned dark cluster (2–3 saw/sine osc, heavy lowpass),
    gain ≈ dread² × 0.22; barely there under 0.4, oppressive near 1.
  - heartbeat — soft sub thumps, starts when dread > 0.55 OR stalker is
    'rush', rate 60→110 bpm with dread.
  - the Caleuche's ghost waltz — when `caleucheDist` is non-null: a faint 3/4
    loop (triangle melody + root-fifth bass, ~96 bpm, minor), heavily
    low-passed through a feedback delay, and ALWAYS slightly detuned/warbling
    (±8 cents LFO) — festive music that is wrong. Volume scales with distance
    (audible < ~250 m). After `won` it grows louder but MORE detuned.
- `stinger(name)`: 'encounter' (low bell toll + airy whisper-noise swell),
  'summon' (deep horn + distant bell), 'stalker' (sub thump + close breath),
  'blackout' (reversed cymbal-like noise swell into silence),
  'win' (hollow unresolved chord that decays into the waltz).
- `get state()` returns { unlocked, muted, contextState } for tests.

## src/world/wisps.js
- `export function createWisps(): { group, update(t, guideTarget) }` — ~24
  faint blue-green motes (additive Points, depthWrite false, no lights)
  drifting 0.5–3 m above `terrainHeight` across the island (import it).
  When `guideTarget` (Vector3 or null) is set, the few wisps nearest the
  camera drift with a gentle bias toward it — a suggestion, not a beeline.
  Wisps far below sea level or outside radius ~230 respawn near the player.
- Chilote flavor: these are luces — keep them dim (they must never compete
  with the beings' glows).

## src/world/mist.js
- `export function createMist(): { group, update(t) }` — 10–14 large
  (30–80 m) very faint additive quads at y 1–4, slowly drifting/rotating,
  opacity 0.03–0.08, `fog: false`, `depthWrite: false`, double-sided,
  concentrated over the coast ring (radius 150–230). Subtle; never blooms.

## src/fx.js — post-processing ("HD" pipeline)
- `export function createFX(renderer, scene, camera): { render(dt),
  resize(width, height), set dread(v), get dread() }`
- Uses the postprocessing addons shipped inside the installed `three` package
  (`import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'`
  etc. — verify the path against node_modules). Chain:
  1. RenderPass
  2. UnrealBloomPass — strength ~0.5, radius ~0.55, threshold ~0.6 (tuned so
     being-glows/lanterns/sails bloom but the dark scene does not milk out)
  3. Final custom ShaderPass: vignette (base 0.35, +0.35×dread), animated film
     grain (base 0.035, +0.05×dread), subtle chromatic aberration at screen
     edges (scaled by dread), slight desaturation + cold green-teal grade as
     dread rises, and at dread > 0.7 a slow ~1 Hz darkening pulse.
- Create the composer with a multisampled render target (samples: 4) so MSAA
  is not lost. `resize` must handle size AND pixel ratio (cap 2). `render(dt)`
  advances the grain/time uniform and renders the chain (replaces
  renderer.render in main).

## src/stalker.js — El Brujo (the stalker)
- `export function createStalker(): { group, update(dt, ctx), get state(),
  get position(), set active(v), reset(), forceSpawn(distance?),
  consumeStrike(): boolean }`
- `import { terrainHeight } from './world/terrain.js'`. ctx = { playerPos:
  Vector3, playerForward: Vector3 (unit, XZ) }.
- A gaunt ~2.6 m pitch-dark figure (procedural primitives, near-black
  MeshStandardMaterial, long limbs, wide-brim hat silhouette — a brujo de
  Chiloé), two small pale-green emissive eyes. NO PointLight (light-count
  rule). Optional ≤40-point dark particle drip. castShadow on its meshes.
- State machine (timers randomized within ranges):
  - 'hidden' — group invisible BY POSITION (parked at y −60 under the island
    center, NOT visible=false — it has no lights but keep the pattern
    consistent); cooldown 25–50 s while `active`.
  - 'lurk' — rises/appears 55–85 m from the player, biased to the side or
    behind; stands swaying. If the player's forward vector points within ~18°
    of it for a cumulative ~1.4 s → it freezes 3–4 s, then sinks away →
    'hidden'. If not observed within 6–10 s → 'stalk'.
  - 'stalk' — glides toward the player at ~2.3 m/s following terrain. Being
    observed freezes it (it does not advance while watched). Within 11 m →
    'rush'.
  - 'rush' — 6.5 m/s straight in, ignores observation. Within 1.8 m →
    'strike': records a pending strike (consumeStrike() returns true once),
    then immediately sinks → 'hidden' + cooldown.
  - reset() → 'hidden' + fresh cooldown. forceSpawn(d) → immediate 'lurk' at
    distance d (default 60) in front of the player (for tests).
- update is allocation-free; sway/glide bob in-place; eye emissive flickers.

## ui.js / lore.js additions (bestiary + continue + blackout)
- `ui.showTitle(onStart, resume?)` — backward compatible; when
  `resume = { label, onResume }` is provided render a second button under
  Begin that calls onResume.
- `ui.showBestiary(entries, onClose)` — entries: all six in registry order,
  `{ name, title, lore, blessing, found }`. Found entries render their full
  card text (compact list/grid); unfound render as locked silhouettes using
  STRINGS.bestiaryLockedName / STRINGS.bestiaryLockedText. One Close button
  (STRINGS.closeLabel) → onClose. `closeModal()` must also close an open
  bestiary. `isModalOpen()` true while open.
- `ui.setBestiaryHint(visible: boolean)` — toggles a small fixed hint
  (STRINGS.bestiaryHint) at the bottom-right of the HUD.
- `ui.showBlackout(text, onDone)` — full-screen black overlay that cuts in
  fast (~0.15 s), holds ~1.6 s showing `text` as a faint centered whisper,
  fades out ~1 s, removes itself, then calls onDone. NOT a modal (closeModal
  must ignore it); it must sit visually ABOVE every other overlay.
- New STRINGS keys (exact names): `resumeLabel: 'Return to the Night'`,
  `bestiaryTitle: 'Señas de la Isla'`, `bestiaryLockedName: '— ¿…? —'`,
  `bestiaryLockedText: 'Aún no hallado… not yet found.'`,
  `bestiaryHint: 'Tab · Señas'`, `closeLabel: 'Close'`,
  `blackoutText: 'La niebla te tomó. You wake on cold sand, and something
  has your scent.'`; update STRINGS.help to
  'WASD move · mouse or arrow keys look · Shift run · Tab señas · M sound'.

## lore.js — HORROR REWRITE
The game is now a horror experience. Rewrite ALL user-facing prose in
lore.js (every LORE entry and most STRINGS) to match, while staying
mythologically faithful. The new premise: your brother's boat came back
empty last month. The old people will not say his name. Tonight you walked
into the fog to look for him — and the island is awake. The six beings do
not bless you: they MARK you (each `blessing` line becomes a mark/seña,
e.g. 'La Pincoya has seen you. The sea will not refuse you now.'). The
HUD label STRINGS.hudLabel becomes 'Señas'. STRINGS.subtitle becomes
'La niebla no devuelve lo que toma'. The win is dark and quiet: you board
the Caleuche because by then there is nowhere else left to go — among the
crew of the drowned stands your brother, and the text leaves whether this
is rescue or surrender deliberately unresolved (STRINGS.winTitle/winText).
Lore entries: keep each being's canonical attributes but let them be
frightening (the Invunche's making, the Trauco's gaze you must not hold,
the Sirena counting the drowned, the Camahueto tearing the hillside, the
Millalobo as a king who owns you the moment you wade into his water, the
Pincoya dancing a tally of boats). Second person, present tense, restrained
— dread over gore. 60–110 words per lore entry. Keep banner/sailHint/
boardHint/hint keys but rewrite them in the new register.

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
