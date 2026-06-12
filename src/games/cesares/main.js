// ============================================================================
// LA CIUDAD DE LOS CÉSARES — La que no quiere ser vista · Mitos de Chiloé
// Isometric perspective puzzle, canvas2d. The enchanted city only exists from
// the right angle: a broken pilgrim's path floats in night fog, and sections
// of it sit on circular stone ROTORS. TAP a rotor to grind it 90° clockwise
// (hold ~0.35 s or right-click for counter-clockwise — never required); when
// tile edges align the path reconnects and the pilgrim AUTO-WALKS toward the
// glowing gate, waiting at every break. A rotor turns WITH the pilgrim if he
// stands on it. As the path connects, the city fades in on the horizon
// (alpha = connected fraction). Six hand-authored levels under a per-level
// moon timer; reach the gate of level vi and la ciudad se deja ver.
//
// TEST API — window.__game (sim is a pure frame(dt), driven by both rAF and
// manual stepping; rAF is throttled in hidden tabs — tests drive step()):
//   begin()                 — same as clicking COMENZAR (unlocks audio)
//   step(dt=1/60, steps=1)  — advance the sim deterministically, then draw
//                             once. dt clamped to 0.05.
//   getState()              — { phase:'title'|'playing'|'won'|'lost', level,
//                               levelName, rotorAngles:[deg 0|90|180|270],
//                               pathConnected:0..1 (fraction of tiles in the
//                               pilgrim's connected component; 1 once he has
//                               reached the gate), pilgrimTile:[x,y],
//                               walking, carried, timeLeft, taps, steps,
//                               gateReachable, muted }
//   forceWin()              — runs the real win handler (incl. localStorage
//                             'chiloe-cesares-done' = '1')
//   forceLose()             — runs the real lose handler (moon ran out)
//   level()                 — current level 1..6
//   setLevel(n)             — load level n and play it at once (works from
//                             any phase; removes overlays)
//   rotors()                — array of rotor angles in degrees (rot * 90)
//   rotate(i, dir=1)        — rotate rotor i as if tapped (dir 1 = CW,
//                             -1 = CCW). Queues if grinding or if the pilgrim
//                             is mid-step on that rotor; returns true if
//                             accepted. Drive the 0.35 s grind with step().
//   pilgrim()               — { tile:[x,y], walking, carried }
//   setTime(s)              — set the current level's remaining seconds
//   pressKey(code, down, shift) — drive keyboard input ('Digit1'..'Digit6'
//                             rotate CW / +shift CCW, 'KeyR' retry level,
//                             'KeyM' mute)
// ============================================================================

import { createRenderer, isoX, isoY, rotOff, HW, HH } from './render.js'
import { createAudio } from './audio.js'

const STEP_T = 0.34 // s per tile walked
const ROT_T = 0.35 // s per 90° grind
const HOLD_T = 0.35 // s press-and-hold => counter-clockwise
const LS_DONE = 'chiloe-cesares-done'
const HALF_PI = Math.PI / 2

// tile masks: E=1 S=2 W=4 N=8 — a bit per open edge (grid +x +y -x -y)
const rotM = (m, k) => {
  let r = m
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) r = ((r << 1) | (r >>> 3)) & 15
  return r
}
const rotO = (dx, dy, k, out) => {
  let x = dx
  let y = dy
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) {
    const t = x
    x = -y
    y = t
  }
  out[0] = x
  out[1] = y
  return out
}

// --- the six pilgrimages ------------------------------------------------------
// tiles: [x, y, mask, z] static stones. rotors: cx/cy pivot, rot = starting
// quarter-turns CW, cells: [dx, dy, mask, z] at rot 0. Every level is solvable
// with CW taps only (the rotation group is a 4-cycle, so always recoverable).
const LEVELS = [
  {
    name: 'la primera torre', time: 45,
    toast: 'toca el disco de piedra: el camino se acuerda de sí mismo',
    start: [0, 0], gate: [4, 0],
    tiles: [[0, 0, 1, 0], [1, 0, 5, 0], [3, 0, 5, 0], [4, 0, 4, 0]],
    rotors: [{ cx: 2, cy: 0, rot: 1, cells: [[0, 0, 5, 0]] }],
  },
  {
    name: 'el codo del agua', time: 55,
    toast: 'dos discos, un solo camino',
    start: [0, 0], gate: [2, 3],
    tiles: [[0, 0, 1, 0], [2, 0, 6, 0], [2, 2, 10, 0], [2, 3, 8, 0]],
    rotors: [
      { cx: 1, cy: 0, rot: 1, cells: [[0, 0, 5, 0]] },
      { cx: 2, cy: 1, rot: 1, cells: [[0, 0, 10, 0]] },
    ],
  },
  {
    name: 'la balsa de piedra', time: 65,
    toast: 'la piedra también puede llevarte — gira con él encima',
    start: [0, 0], gate: [4, 3],
    tiles: [[0, 0, 1, 0], [1, 0, 5, 0], [4, 2, 10, 0], [4, 3, 8, 0]],
    rotors: [{ cx: 3, cy: 1, rot: 0, cells: [[0, -1, 5, 0], [-1, -1, 5, 0]] }],
  },
  {
    name: 'los puentes gemelos', time: 75,
    toast: 'deja que cruce primero, y vuelve a girar',
    start: [0, 2], gate: [6, 4],
    tiles: [[0, 2, 1, 0], [1, 2, 5, 0], [3, 2, 6, 0], [3, 4, 9, 0], [4, 4, 5, 0], [6, 4, 4, 0]],
    rotors: [
      { cx: 2, cy: 2, rot: 1, cells: [[0, 0, 5, 0]] },
      { cx: 4, cy: 3, rot: 0, cells: [[-1, 0, 10, 0], [1, -1, 10, 0]] },
    ],
  },
  {
    name: 'la escalera del agua', time: 95,
    toast: 'la piedra errante busca su lugar — y luego te lleva',
    start: [0, 0], gate: [9, 3],
    tiles: [
      [0, 0, 1, 0], [1, 0, 5, 0], [3, 0, 6, 0], [3, 2, 9, 0],
      [4, 2, 5, 0], [5, 2, 5, 0], [8, 3, 5, 0], [9, 3, 4, 0],
    ],
    rotors: [
      { cx: 2, cy: 0, rot: 1, cells: [[0, 0, 5, 0]] },
      { cx: 4, cy: 1, rot: 2, cells: [[-1, 0, 10, 0]] },
      { cx: 6, cy: 3, rot: 3, cells: [[0, -1, 12, 0]] },
    ],
  },
  {
    name: 'el puente imposible', time: 110,
    toast: 'tres discos: un puente que no debería existir',
    start: [0, 4], gate: [8, 4],
    tiles: [[0, 4, 1, 0], [1, 4, 5, 0], [2, 4, 5, 0], [8, 4, 4, 3]],
    rotors: [
      { cx: 3, cy: 3, rot: 2, cells: [[0, 1, 5, 1]] },
      { cx: 5, cy: 4, rot: 3, cells: [[-1, 0, 5, 1], [0, 0, 5, 1], [1, 0, 5, 2]] },
      { cx: 7, cy: 3, rot: 2, cells: [[0, 1, 5, 3]] },
    ],
  },
]
const ROMAN = ['i', 'ii', 'iii', 'iv', 'v', 'vi']
const DOOR_TOAST = [
  'la primera puerta cede — la ciudad se reordena',
  'la segunda puerta cede — algo brilla a lo lejos',
  'la tercera puerta cede — ya conoce tus pasos',
  'la cuarta puerta cede — las torres te esperan',
  'la quinta puerta cede — solo falta el ángulo justo',
]

const TEXTS = {
  // card bodies match the voice clips (assets/voice/cesares/*.mp3) word for
  // word, in the collection's Neruda register.
  intro: 'Hay una ciudad que nadie encuentra dos veces. Se esconde en el ángulo de la luz, y solo se deja ver cuando el camino la mira <i>como ella quiere ser mirada</i>.',
  win: 'La ciudad se deja ver. Torre por torre despierta su oro, campana por campana recuerda tu nombre. Guárdala en los ojos, peregrino: mañana volverá a ser niebla.',
  lose: 'La ciudad volvió a esconderse, como se esconde el agua dentro del agua. Busca otra vez el ángulo justo: ella espera a quien sabe mirar.',
  controls: 'TOCA un disco de piedra: girar &nbsp;·&nbsp; MANTÉN o CLIC DERECHO: girar al revés &nbsp;·&nbsp; 1–6 teclas &nbsp;·&nbsp; M sonido',
}

// --- dom -----------------------------------------------------------------------
const canvas = document.getElementById('game')
const ui = document.getElementById('ui')
const vignette = document.createElement('div')
vignette.className = 'vignette'
document.body.appendChild(vignette)

function el(tag, cls, html, parent) {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html) e.innerHTML = html
  ;(parent || ui).appendChild(e)
  return e
}

const moonBar = el('div', '', '', ui)
moonBar.id = 'moon'
const moonFill = el('div', '', '', moonBar)
moonFill.id = 'moon-fill'
const hud = el('div', '', '', ui)
hud.id = 'hud'
const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', 'toca un disco: gira · mantén: al revés · M sonido', ui)
hint.id = 'hint'

let toastTimer = null
function toast(msg, long) {
  toastEl.textContent = msg
  toastEl.classList.add('show')
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), long ? 4200 : 2400)
}

function card(title, epithet, body, controls, btnLabel, onClick) {
  const ov = el('div', 'overlay', '', ui)
  const c = el('div', 'card', '', ov)
  el('div', 'charm', '✦', c)
  el('h1', '', title, c)
  el('div', 'epithet', epithet, c)
  el('p', 'myth', body, c)
  if (controls) el('div', 'controls', controls, c)
  const b = el('button', '', btnLabel, c)
  b.addEventListener('click', onClick)
  return ov
}

const titleCard = card(
  'LA CIUDAD DE LOS CÉSARES', 'La que no quiere ser vista', TEXTS.intro,
  TEXTS.controls, 'COMENZAR', () => begin()
)
let endCard = null
let endAction = null
function showEnd(title, epithet, body, btn, action) {
  if (endCard) endCard.remove()
  endAction = action
  endCard = card(title, epithet, body, '', btn, () => {
    if (endAction) endAction()
  })
}

// --- state -----------------------------------------------------------------------
const renderer = createRenderer(canvas)
const audio = createAudio()

const game = {
  phase: 'title', // title | playing | won | lost
  level: 1,
  visT: 0,
  time: 0, // moon seconds left in this level
  inter: 0, // gate-reached intermission countdown
  connFrac: 0,
  cityFloor: 0, // the city remembers solved levels
  pathK: 0, // eased 0..1 gate glow (gate reachable)
  lvl: null, // runtime level (set by loadLevel)
  rotors: [],
  drawList: [],
  pil: null,
}
const stats = { taps: 0, steps: 0, totalT: 0 }

const pil = {
  tile: [0, 0], from: [0, 0], to: [0, 0],
  gx: 0, gy: 0, gz: 0, fromZ: 0, toZ: 0,
  t: 0, walking: false, face: 1, bobT: 0,
  carriedBy: -1, carryOff: [0, 0], carryZ: 0,
}
game.pil = pil

let gateReach = false
let connSet = new Set()
const _o = [0, 0] // scratch offset
const _o2 = [0, 0]

// --- map + connectivity ------------------------------------------------------------
// settled positions of rotor r's cells (current rot); cb(x, y, mask, z, cellIdx)
function eachCell(r, cb) {
  for (let j = 0; j < r.def.cells.length; j++) {
    const c = r.def.cells[j]
    rotO(c[0], c[1], r.rot, _o)
    cb(r.cx + _o[0], r.cy + _o[1], rotM(c[2], r.rot), c[3], j)
  }
}

// tile map at the current settled state. Animating rotors contribute nothing
// (their stones are mid-air). Rotor cells override statics on the same coords.
function buildMap() {
  const map = new Map()
  const ts = game.lvl.def.tiles
  for (let i = 0; i < ts.length; i++) {
    map.set(ts[i][0] + ',' + ts[i][1], { m: ts[i][2], z: ts[i][3] })
  }
  for (let i = 0; i < game.rotors.length; i++) {
    const r = game.rotors[i]
    if (r.anim) continue
    eachCell(r, (x, y, m, z) => map.set(x + ',' + y, { m, z }))
  }
  return map
}

const DX = [1, 0, -1, 0]
const DY = [0, 1, 0, -1]

// BFS over mutually-open edges from `fromKey`. Returns { set, parent, order }.
function bfs(map, fromKey) {
  const set = new Set()
  const parent = new Map()
  const order = []
  if (!map.has(fromKey)) return { set, parent, order }
  set.add(fromKey)
  order.push(fromKey)
  parent.set(fromKey, null)
  let head = 0
  while (head < order.length) {
    const key = order[head++]
    const ix = key.indexOf(',')
    const x = +key.slice(0, ix)
    const y = +key.slice(ix + 1)
    const t = map.get(key)
    for (let d = 0; d < 4; d++) {
      if (!(t.m & (1 << d))) continue
      const nk = (x + DX[d]) + ',' + (y + DY[d])
      if (set.has(nk)) continue
      const nt = map.get(nk)
      if (!nt) continue
      if (!(nt.m & (1 << ((d + 2) % 4)))) continue // mutual edge
      set.add(nk)
      parent.set(nk, key)
      order.push(nk)
    }
  }
  return { set, parent, order }
}

// recompute the pilgrim's connected component, the city fraction, gate reach,
// and the per-tile glow flags. Called on events only (never per frame).
function recompute() {
  const map = buildMap()
  const pk = pil.tile[0] + ',' + pil.tile[1]
  const res = bfs(map, pk)
  connSet = res.set
  const gateKey = game.lvl.def.gate[0] + ',' + game.lvl.def.gate[1]
  gateReach = connSet.has(gateKey)
  game.connFrac = Math.min(1, connSet.size / game.lvl.total)
  if (game.inter > 0 || pk === gateKey) game.connFrac = 1
  const items = game.drawList
  for (let i = 0; i < items.length; i++) {
    if (items[i].kind !== 2) items[i].conn = connSet.has(items[i].key)
  }
  audio.setHum(game.connFrac * (gateReach ? 1 : 0.55))
  return res
}

// where should the pilgrim walk? BFS from his tile; target = the reachable
// tile nearest the gate (manhattan, then BFS depth). Returns the first step
// [x,y] toward it, or null if he is already as far as the path goes.
function planStep() {
  const res = recompute()
  const gx = game.lvl.def.gate[0]
  const gy = game.lvl.def.gate[1]
  let best = null
  let bestM = Infinity
  let bestD = Infinity
  const depth = new Map()
  for (let i = 0; i < res.order.length; i++) {
    const key = res.order[i]
    const par = res.parent.get(key)
    depth.set(key, par === null ? 0 : depth.get(par) + 1)
    const ix = key.indexOf(',')
    const x = +key.slice(0, ix)
    const y = +key.slice(ix + 1)
    const m = Math.abs(x - gx) + Math.abs(y - gy)
    const d = depth.get(key)
    if (m < bestM || (m === bestM && d < bestD)) {
      bestM = m
      bestD = d
      best = key
    }
  }
  const pk = pil.tile[0] + ',' + pil.tile[1]
  if (!best || best === pk) return null
  let cur = best
  while (res.parent.get(cur) !== pk) cur = res.parent.get(cur)
  const ix = cur.indexOf(',')
  return [+cur.slice(0, ix), +cur.slice(ix + 1)]
}

function tileZ(x, y) {
  const t = buildMap().get(x + ',' + y)
  return t ? t.z : 0
}

// --- pilgrim ------------------------------------------------------------------------
let planDirty = true // re-plan only on events (no per-frame BFS allocations)

function anyAnim() {
  for (let i = 0; i < game.rotors.length; i++) if (game.rotors[i].anim) return true
  return false
}

function startStep(next) {
  pil.from[0] = pil.tile[0]
  pil.from[1] = pil.tile[1]
  pil.to[0] = next[0]
  pil.to[1] = next[1]
  pil.fromZ = tileZ(pil.from[0], pil.from[1])
  pil.toZ = tileZ(pil.to[0], pil.to[1])
  pil.t = 0
  pil.walking = true
  const sdx = isoX(pil.to[0], pil.to[1]) - isoX(pil.from[0], pil.from[1])
  if (Math.abs(sdx) > 0.5) pil.face = sdx > 0 ? 1 : -1
  audio.sfx.step()
}

function smooth(t) { return t * t * (3 - 2 * t) }

function updatePilgrim(dt) {
  if (pil.carriedBy >= 0) return // the rotor moves him
  if (pil.walking) {
    pil.t += dt / STEP_T
    pil.bobT += dt
    const k = smooth(Math.min(1, pil.t))
    pil.gx = pil.from[0] + (pil.to[0] - pil.from[0]) * k
    pil.gy = pil.from[1] + (pil.to[1] - pil.from[1]) * k
    pil.gz = pil.fromZ + (pil.toZ - pil.fromZ) * k
    if (pil.t >= 1) {
      pil.walking = false
      pil.tile[0] = pil.to[0]
      pil.tile[1] = pil.to[1]
      stats.steps++
      audio.sfx.step()
      arrive()
    }
    return
  }
  // idle: walk on when something changed (planning waits for grinding stones)
  if (planDirty && !anyAnim() && game.inter <= 0) {
    planDirty = false
    const next = planStep()
    if (next) startStep(next)
  }
}

function arrive() {
  const g = game.lvl.def.gate
  if (pil.tile[0] === g[0] && pil.tile[1] === g[1]) {
    gateReached()
    return
  }
  if (!anyAnim()) {
    const next = planStep()
    if (next) startStep(next)
    else {
      planDirty = false
      recompute()
    }
  } else planDirty = true
}

// --- rotors -------------------------------------------------------------------------
function makeRotors(def) {
  game.rotors = def.rotors.map((rd) => {
    let maxd = 0
    let dz = Infinity
    for (const c of rd.cells) {
      maxd = Math.max(maxd, Math.hypot(c[0], c[1]))
      dz = Math.min(dz, c[3])
    }
    return {
      def: rd, cx: rd.cx, cy: rd.cy, rot: rd.rot,
      maxd, dz: dz === Infinity ? 0 : dz,
      anim: false, animT: ROT_T, dur: ROT_T, dir: 1, angVis: rd.rot * HALF_PI,
      queue: [],
    }
  })
}

// is the pilgrim's current step touching rotor r's settled cells?
function stepTouches(r) {
  let hit = false
  eachCell(r, (x, y) => {
    if ((x === pil.from[0] && y === pil.from[1]) || (x === pil.to[0] && y === pil.to[1])) hit = true
  })
  return hit
}

function tapRotor(i, dir) {
  if (game.phase !== 'playing' || game.inter > 0) return false
  const r = game.rotors[i]
  if (!r) return false
  const d = dir < 0 ? -1 : 1
  if (r.anim || (pil.walking && stepTouches(r))) {
    if (r.queue.length >= 2) {
      audio.sfx.denied()
      return false
    }
    r.queue.push(d)
    return true
  }
  startRotation(r, d)
  return true
}

function startRotation(r, dir) {
  r.anim = true
  r.animT = 0
  r.dur = ROT_T
  r.dir = dir
  stats.taps++
  audio.sfx.grindStart()
  // carry: standing on one of this rotor's stones
  if (!pil.walking && pil.carriedBy < 0) {
    eachCell(r, (x, y, m, z, j) => {
      if (x === pil.tile[0] && y === pil.tile[1]) {
        pil.carriedBy = game.rotors.indexOf(r)
        rotO(r.def.cells[j][0], r.def.cells[j][1], r.rot, _o2)
        pil.carryOff[0] = _o2[0]
        pil.carryOff[1] = _o2[1]
        pil.carryZ = z
        audio.sfx.illusion()
      }
    })
  }
  recompute() // this rotor's stones leave the map while grinding
}

function finishRotation(r) {
  r.rot = ((r.rot + r.dir) % 4 + 4) % 4
  r.anim = false
  r.angVis = r.rot * HALF_PI
  audio.sfx.grindStop()
  audio.sfx.snap()
  renderer.shake(1.4)
  syncCells(r)
  // dust where the stones land
  eachCell(r, (x, y, m, z) => renderer.burst(x, y, z, '#8fa3b5', 3, 40, 8, 0.5))
  if (pil.carriedBy === game.rotors.indexOf(r)) {
    rotO(pil.carryOff[0], pil.carryOff[1], r.dir, _o2)
    pil.tile[0] = r.cx + _o2[0]
    pil.tile[1] = r.cy + _o2[1]
    pil.gx = pil.tile[0]
    pil.gy = pil.tile[1]
    pil.gz = pil.carryZ
    pil.carriedBy = -1
  }
  const wasGate = gateReach
  const wasFrac = game.connFrac
  recompute()
  planDirty = true
  if (!wasGate && gateReach) {
    audio.sfx.illusion()
    renderer.pulse('#ffd9a0')
    const g = game.lvl.def.gate
    renderer.popup(g[0], g[1], tileZ(g[0], g[1]), 'el camino existe', '#ffd9a0')
  } else if (game.connFrac > wasFrac + 0.01) {
    audio.sfx.tick()
  }
}

function updateRotors(dt) {
  for (let i = 0; i < game.rotors.length; i++) {
    const r = game.rotors[i]
    if (r.anim) {
      r.animT += dt
      const k = smooth(Math.min(1, r.animT / r.dur))
      r.angVis = r.rot * HALF_PI + k * r.dir * HALF_PI
      if (pil.carriedBy === i) {
        const th = k * r.dir * HALF_PI
        rotOff(pil.carryOff[0], pil.carryOff[1], th, _o2)
        pil.gx = r.cx + _o2[0]
        pil.gy = r.cy + _o2[1]
        pil.gz = pil.carryZ
      }
      if (r.animT >= r.dur) finishRotation(r)
    } else if (r.queue.length && !(pil.walking && stepTouches(r))) {
      startRotation(r, r.queue.shift())
    }
  }
}

// --- draw list (renderer consumes; cells re-synced on every snap) ----------------
function buildDrawList() {
  const items = []
  const def = game.lvl.def
  for (const t of def.tiles) {
    items.push({
      kind: 0, gx: t[0], gy: t[1], gz: t[3], mask: t[2], ang: 0,
      conn: false, shade: (t[0] * 3 + t[1] * 7) % 2, sort: 0,
      key: t[0] + ',' + t[1],
      gate: t[0] === def.gate[0] && t[1] === def.gate[1],
      start: t[0] === def.start[0] && t[1] === def.start[1],
    })
  }
  game.rotors.forEach((r, ri) => {
    r.def.cells.forEach((c, ci) => {
      items.push({
        kind: 1, rotor: ri, cell: ci, gx: 0, gy: 0, gz: c[3], mask: 0, ang: 0,
        conn: false, shade: (ri + ci) % 2, sort: 0, key: '', gate: false, start: false,
      })
    })
  })
  items.push({ kind: 2, sort: 0 })
  game.drawList = items
  for (const r of game.rotors) syncCells(r)
}

function syncCells(r) {
  const ri = game.rotors.indexOf(r)
  const items = game.drawList
  eachCell(r, (x, y, m, z, j) => {
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (it.kind === 1 && it.rotor === ri && it.cell === j) {
        it.gx = x
        it.gy = y
        it.gz = z
        it.mask = m
        it.ang = 0
        it.key = x + ',' + y
      }
    }
  })
}

// while grinding, cells sweep around the pivot (visual only)
function animateCells() {
  const items = game.drawList
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.kind !== 1) continue
    const r = game.rotors[it.rotor]
    if (!r.anim) continue
    const k = smooth(Math.min(1, r.animT / r.dur))
    const th = k * r.dir * HALF_PI
    const c = r.def.cells[it.cell]
    rotO(c[0], c[1], r.rot, _o)
    rotOff(_o[0], _o[1], th, _o2)
    it.gx = r.cx + _o2[0]
    it.gy = r.cy + _o2[1]
    it.mask = rotM(c[2], r.rot)
    it.ang = th
    it.conn = false
  }
}

// --- level flow ----------------------------------------------------------------------
function computeBounds(def) {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  const acc = (gx, gy, z) => {
    const wx = isoX(gx, gy)
    x0 = Math.min(x0, wx - HW - 8)
    x1 = Math.max(x1, wx + HW + 8)
    y0 = Math.min(y0, isoY(gx, gy, z) - HH - 14)
    y1 = Math.max(y1, isoY(gx, gy, 0) + HH + 26)
  }
  for (const t of def.tiles) acc(t[0], t[1], t[3])
  for (const rd of def.rotors) {
    let maxd = 0
    for (const c of rd.cells) maxd = Math.max(maxd, Math.hypot(c[0], c[1]))
    const R = (maxd + 0.95) * HW
    const cx = isoX(rd.cx, rd.cy)
    let dz = Infinity
    for (const c of rd.cells) dz = Math.min(dz, c[3])
    const cy = isoY(rd.cx, rd.cy, dz === Infinity ? 0 : dz) + HH * 0.9
    x0 = Math.min(x0, cx - R - 6)
    x1 = Math.max(x1, cx + R + 6)
    y0 = Math.min(y0, cy - R * HH / HW - 6)
    y1 = Math.max(y1, cy + R * HH / HW + 10)
    for (const c of rd.cells) {
      for (let k = 0; k < 4; k++) {
        rotO(c[0], c[1], k, _o)
        acc(rd.cx + _o[0], rd.cy + _o[1], c[3])
      }
    }
  }
  return { x0, x1, y0, y1 }
}

function loadLevel(n) {
  const num = Math.max(1, Math.min(LEVELS.length, n | 0))
  const def = LEVELS[num - 1]
  game.level = num
  game.lvl = { def, total: 0, bounds: computeBounds(def) }
  let total = def.tiles.length
  for (const rd of def.rotors) total += rd.cells.length
  game.lvl.total = total
  game.time = def.time
  game.inter = 0
  game.cityFloor = ((num - 1) / 6) * 0.30
  makeRotors(def)
  pil.tile[0] = def.start[0]
  pil.tile[1] = def.start[1]
  pil.gx = def.start[0]
  pil.gy = def.start[1]
  pil.gz = tileZ(def.start[0], def.start[1])
  pil.walking = false
  pil.carriedBy = -1
  pil.face = 1
  pil.t = 0
  planDirty = true
  renderer.clearFx()
  buildDrawList()
  recompute()
  hud.innerHTML = 'nivel <b>' + ROMAN[num - 1] + '/vi</b> — ' + def.name
  lastPct = -1
  if (game.phase === 'playing') toast(def.toast, true)
}

function gateReached() {
  game.inter = 2.1
  game.connFrac = 1
  audio.sfx.levelBell()
  renderer.pulse('#ffd9a0')
  const g = game.lvl.def.gate
  const z = tileZ(g[0], g[1])
  renderer.burst(g[0], g[1], z, '#ffd9a0', 22, 60, 30, 1.1)
  renderer.popup(g[0], g[1], z, '✦', '#ffe6b0')
  if (game.level < 6) toast(DOOR_TOAST[game.level - 1], true)
}

function win() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'won'
  titleCard.remove()
  try { localStorage.setItem(LS_DONE, '1') } catch (e) { /* storage may be off */ }
  audio.sfx.winBells()
  audio.musicOut()
  renderer.pulse('#ffe6b0')
  const m = Math.floor(stats.totalT / 60)
  const s = Math.floor(stats.totalT % 60)
  const tally = 'giros ' + stats.taps + ' · pasos ' + stats.steps +
    ' · luna ' + m + ':' + (s < 10 ? '0' : '') + s + ' · ✦ seña guardada'
  setTimeout(() => {
    audio.voice('win')
    showEnd(
      'LA CIUDAD SE DEJA VER', 'Por una sola noche',
      TEXTS.win + '<span class="tally">' + tally + '</span>',
      'REINTENTAR', () => restartAll()
    )
  }, 1600)
}

function lose() {
  if (game.phase !== 'playing' && game.phase !== 'title') return
  game.phase = 'lost'
  titleCard.remove()
  audio.sfx.lose()
  const lvl = game.level
  setTimeout(() => {
    audio.voice('lose')
    showEnd('LA CIUDAD SE ESCONDE', 'La luna se movió', TEXTS.lose, 'REINTENTAR', () => {
      if (endCard) {
        endCard.remove()
        endCard = null
      }
      game.phase = 'playing'
      loadLevel(lvl)
    })
  }, 800)
}

function restartAll() {
  if (endCard) {
    endCard.remove()
    endCard = null
  }
  stats.taps = 0
  stats.steps = 0
  stats.totalT = 0
  game.phase = 'playing'
  loadLevel(1)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  speakIntro()
  titleCard.remove()
  game.phase = 'playing'
  toast(game.lvl.def.toast, true)
}

// --- title narration (best-effort before BEGIN; every path silent-safe) --------
let introSpoken = false
function speakIntro() {
  if (introSpoken) return
  introSpoken = true
  untapIntro()
  audio.voice('title')
}
function untapIntro() {
  window.removeEventListener('pointerdown', introTap, true)
  window.removeEventListener('keydown', introTap, true)
  window.removeEventListener('touchstart', introTap, true)
}
function introTap() {
  untapIntro()
  if (introSpoken || game.phase !== 'title') return
  try {
    audio.unlock()
    speakIntro()
  } catch (e) { /* narration is flavor */ }
}
try {
  audio.unlock()
  if (audio.state.running) speakIntro()
} catch (e) { /* the gesture taps cover it */ }
if (!introSpoken) {
  window.addEventListener('pointerdown', introTap, true)
  window.addEventListener('keydown', introTap, true)
  window.addEventListener('touchstart', introTap, true)
}

// --- input -------------------------------------------------------------------------
// one thumb: tap a disc = CW. Hold 0.35 s (or right-click) = CCW.
const press = { on: false, rotor: -1, t: 0, fired: false, x: 0, y: 0 }

function rotorAtCss(cssX, cssY) {
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < game.rotors.length; i++) {
    const r = game.rotors[i]
    const p = renderer.project(r.cx, r.cy, r.dz)
    const py = p.y + HH * 0.9 * renderer.scale / (canvas.width / window.innerWidth)
    const rx = Math.max((r.maxd + 0.95) * HW * renderer.scale / (canvas.width / window.innerWidth), 46)
    const ry = Math.max(rx * HH / HW, 34)
    const nx = (cssX - p.x) / rx
    const ny = (cssY - py) / ry
    const d = nx * nx + ny * ny
    if (d <= 1.25 && d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'playing') return
  e.preventDefault()
  renderer.ripple(e.clientX, e.clientY)
  const ri = rotorAtCss(e.clientX, e.clientY)
  press.on = true
  press.rotor = ri
  press.t = 0
  press.fired = false
  press.x = e.clientX
  press.y = e.clientY
  if (e.button === 2 && ri >= 0) {
    press.fired = true
    tapRotor(ri, -1)
  }
})
window.addEventListener('pointermove', (e) => {
  if (!press.on) return
  if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 16) press.on = false
})
window.addEventListener('pointerup', () => {
  if (!press.on) return
  press.on = false
  if (!press.fired && press.rotor >= 0) tapRotor(press.rotor, 1)
})
window.addEventListener('pointercancel', () => { press.on = false })
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false })
canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })

function keyEvent(code, down, shift) {
  if (!down) return
  if (code === 'KeyM') {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  } else if (code === 'KeyR' && game.phase === 'playing') {
    loadLevel(game.level)
    toast('el ángulo se busca de nuevo')
  } else if ((code === 'Enter' || code === 'Space') && game.phase === 'title') {
    begin()
  } else if (code.indexOf('Digit') === 0) {
    const i = +code.slice(5) - 1
    if (i >= 0 && i < game.rotors.length) tapRotor(i, shift ? -1 : 1)
  }
}
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') e.preventDefault()
  keyEvent(e.code, true, e.shiftKey)
})

// --- frame -----------------------------------------------------------------------------
let lastPct = -1
function updateHud() {
  const pct = Math.max(0, Math.floor((game.time / game.lvl.def.time) * 200) / 2)
  if (pct !== lastPct) {
    lastPct = pct
    moonFill.style.width = pct + '%'
    moonBar.classList.toggle('low', game.time < 10 && game.phase === 'playing')
  }
}

function frame(dt) {
  game.visT += dt
  if (game.phase === 'playing') {
    if (press.on && !press.fired && press.rotor >= 0) {
      press.t += dt
      if (press.t >= HOLD_T) {
        press.fired = true
        tapRotor(press.rotor, -1)
      }
    }
    if (game.inter > 0) {
      game.inter -= dt
      if (Math.random() < dt * 8) {
        const g = game.lvl.def.gate
        renderer.burst(g[0], g[1], tileZ(g[0], g[1]), '#ffe6b0', 2, 40, 26, 0.9)
      }
      if (game.inter <= 0) {
        if (game.level >= 6) win()
        else loadLevel(game.level + 1)
      }
    } else {
      stats.totalT += dt
      game.time -= dt
      if (game.time <= 0) {
        game.time = 0
        lose()
      }
    }
    updateRotors(dt)
    updatePilgrim(dt)
    updateHud()
  }
  game.pathK += ((gateReach || game.inter > 0 ? 1 : 0) - game.pathK) * Math.min(1, dt * 3)
  animateCells()
  audio.update(dt)
}

// --- loop -------------------------------------------------------------------------------
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  canvas.width = window.innerWidth * dpr
  canvas.height = window.innerHeight * dpr
}
window.addEventListener('resize', resize)
window.addEventListener('orientationchange', resize)
resize()
loadLevel(1)

let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  frame(dt)
  renderer.draw(game, dt)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api --------------------------------------------------------------------------------
window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(Math.min(dt, 0.05))
    renderer.draw(game, Math.min(dt, 0.05))
  },
  getState() {
    const angles = []
    for (let i = 0; i < game.rotors.length; i++) angles.push(game.rotors[i].rot * 90)
    return {
      phase: game.phase,
      level: game.level,
      levelName: game.lvl.def.name,
      rotorAngles: angles,
      pathConnected: game.connFrac,
      pilgrimTile: [pil.tile[0], pil.tile[1]],
      walking: pil.walking,
      carried: pil.carriedBy >= 0,
      timeLeft: game.time,
      taps: stats.taps,
      steps: stats.steps,
      gateReachable: gateReach,
      muted: audio.state.muted,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  level: () => game.level,
  setLevel(n) {
    if (endCard) {
      endCard.remove()
      endCard = null
    }
    if (game.phase === 'title') titleCard.remove()
    game.phase = 'playing'
    loadLevel(n)
  },
  rotors() {
    const out = []
    for (let i = 0; i < game.rotors.length; i++) out.push(game.rotors[i].rot * 90)
    return out
  },
  rotate: (i, dir = 1) => tapRotor(i | 0, dir),
  pilgrim: () => ({ tile: [pil.tile[0], pil.tile[1]], walking: pil.walking, carried: pil.carriedBy >= 0 }),
  setTime(s) { game.time = Math.max(0.01, Math.min(game.lvl.def.time, s)) },
  pressKey(code, down = true, shift = false) { keyEvent(code, down, shift) },
}
