# MITOS DE CHILOÉ — Diez juegos del archipiélago

Ten small web games built on the mythology of the Chiloé archipelago
(Chile). One hub, ten myths, no assets — everything is procedural
(three.js, canvas2d, WebAudio).

```bash
npm install
npm run dev      # vite → http://localhost:5173
```

The hub at `/` tracks your señas: each game sets a completion badge
(`localStorage`) when you win it.

## The games

| # | Game | Myth | Genre |
|---|---|---|---|
| 1 | **CALEUCHE** *(flagship)* | the ghost ship of the brujos | horror exploration |
| 2 | **LA PINCOYA** | her dance fills or empties the nets | fishing / timing |
| 3 | **EL TRAUCO** | the forest dwarf whose gaze bends will | stealth |
| 4 | **EL CAMAHUETO** | the one-horned calf that tears gullies to the sea | downhill runner |
| 5 | **LA SIRENA** | herder of the drowned | melody memory |
| 6 | **EL INVUNCHE** | guardian of the cave of Quicaví | candle-lit maze horror |
| 7 | **EL BASILISCO** | the rooster-serpent that drinks sleepers' breath | top-down defense |
| 8 | **TENTEN Y CAICAI** | the flood serpents of the great myth | turn-based puzzle |
| 9 | **EL VUELO DEL BRUJO** | night flight on the macuñ | checkpoint flying |
| 10 | **EL CUCHIVILU** | the pig-snake that ruins fish corrals | arcade herding |

The flagship is a full horror game: six beings to find on a foggy island,
a stalker (El Brujo) that hunts you when unobserved, a dread system that
bleeds into the lantern, the audio and the lens, and the Caleuche itself
at the end of it. WASD + mouse, Tab for the bestiary, M for sound.

## Tech notes

- Vite multi-page: the hub plus each game is its own entry
  (`games/<id>.html` + `src/games/<id>/`).
- Zero runtime deps beyond `three`; no textures, models, fonts or audio
  files anywhere — geometry, paint and sound are all generated.
- Every game exposes a deterministic test API on `window.__game`
  (`step(dt, n)` drives the sim with rAF throttled; `getState()`,
  `forceWin()`/`forceLose()`, plus per-game hooks documented in each
  `main.js` header). The whole collection is end-to-end tested through it.
- The flagship's module contracts live in `INTERFACES.md`.
