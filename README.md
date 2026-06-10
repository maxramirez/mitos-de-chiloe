# CALEUCHE — Mitos de Chiloé

A first-person 3D night-exploration web game built on the mythology of the
Chiloé archipelago (Chile). You are a fisher whose nets have come up empty for
a month. Walk the foggy island in the dark, earn the favor of its six hidden
beings, and El Caleuche — the ghost ship of the brujos — will come for you at
the old dock.

## The beings

| Being | Where to look |
|---|---|
| **La Pincoya** | dancing on the southern beach |
| **El Trauco** | the eastern forest |
| **El Camahueto** | the northern tree line |
| **El Invunche** | a cave near the summit |
| **El Millalobo** | the north-eastern waterline |
| **La Sirena Chilota** | a rock above the western shore |

Walk close to a being to receive its lore and its favor (✦). The HUD compass
always points to the nearest being you have not yet found — and, once all six
favors are yours, to the dock where the Caleuche will berth.

## Run it

```bash
npm install
npm run dev      # vite, http://localhost:5173
```

## Controls

- **WASD** — move (hold **Shift** to run)
- **Mouse** — look (click once to capture the pointer)
- **Arrow keys** — look, when pointer lock is unavailable
- Walk into a glow to meet a being; click **Continue** to keep exploring

## Tech

- [Three.js](https://threejs.org/) + Vite, plain ES modules, zero other
  runtime dependencies — every model is procedural three.js primitives.
- Deterministic seeded terrain (`terrainHeight(x, z)` is pure), so physics and
  visuals sample the same island.
- `window.__game` exposes a small test API (teleport, deterministic `step(dt,
  n)` simulation, state inspection) used by the automated end-to-end tests.
