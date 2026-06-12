// ============================================================================
// LA CIUDAD DE LOS CÉSARES — La que no quiere ser vista · Mitos de Chiloé
// Monument-Valley-style isometric perspective-illusion puzzle (three.js,
// OrthographicCamera fixed on the (1,1,1) diagonal: azimuth 45°, elevation
// ≈35.264°). Three handcrafted levels. Each level is static geometry plus
// 1–2 ROTATING SECTIONS that snap to 90°, and a node graph: static edges are
// always walkable, conditional edges only at one rotor index — including
// ILLUSION edges whose endpoints are far apart in 3D but project to the SAME
// pixel at the right rotation (endpoints differ by t·(1,1,1); verified at
// load in levels.js). Click a node to walk (BFS over currently-valid edges);
// drag a mechanism or use its ⟲ ⟳ buttons to rotate; the pilgrim rides a
// section he is standing on. Reach the glowing puerta (it hums when a path
// exists). Win after level 3: la ciudad se deja ver
// (localStorage 'chiloe-cesares-done' = '1').
//
// TEST API — window.__game (sim is a pure frame(dt); rAF drives it live and
// is throttled in hidden tabs; step() drives it deterministically):
//   begin()                 — same as clicking COMENZAR (unlocks audio)
//   step(dt=1/60, steps=1)  — advance the sim, then draw once. dt clamped to
//                             0.05. The sim pauses under overlays (phases
//                             'title' | 'won' | 'lost'); 'transition' (the
//                             between-level assembly) advances with step().
//   getState()              — { phase:'title'|'playing'|'transition'|'won'
//                               |'lost', level:1..3, pilgrimNode:id,
//                               rotors:[index 0..3 per rotor],
//                               pathExists:bool (BFS pilgrim→door over
//                               currently valid edges) }
//   forceWin()              — runs the real win handler (sets localStorage
//                             'chiloe-cesares-done'='1', shows the win card)
//   forceLose()             — real lose handler: 'la ciudad volvió a
//                             esconderse' card; its button restarts the
//                             current level
//   setLevel(n)             — build level n (1..3) and play it at once
//   rotate(rotorIdx, steps) — turn a rotor by steps×90° (signed). Starts the
//                             eased snap animation; returns false while that
//                             rotor is busy / the pilgrim is walking /
//                             phase !== 'playing'. Drive with step().
//   clickNode(nodeId)       — same as tapping a node: walk if reachable,
//                             denied flash otherwise. Returns 'ok'|'denied'
//                             |'busy'.
//   nodes()                 — [{ id, screen:[px,py], world:[x,y,z] }]
//   solve()                 — play the current level's scripted solution
//                             synchronously (steps the sim internally,
//                             including the level transition); returns
//                             getState()
// dt is clamped at 0.05 s; no allocations inside frame(dt).
// ============================================================================

import * as THREE from 'three'
import { LEVELS } from './levels.js'
import {
  createRenderer, createCamera, applyFrame, createLights,
  createPilgrim, buildLevel, disposeLevel, createPuffs,
} from './world.js'
import { createAudio } from './audio.js'

const HALF_PI = Math.PI / 2
const UP = new THREE.Vector3(0, 1, 0)
const EDGE_T = 0.45 // s per normal edge
const ILL_T = 0.32 // s per illusion edge (the screen-still step)
const LS_DONE = 'chiloe-cesares-done'

const TEXTS = {
  title: 'LA CIUDAD DE LOS CÉSARES',
  epithet: 'La que no quiere ser vista',
  // card bodies match the voice clips (assets/voice/cesares/*.mp3) word for
  // word, in the collection's Neruda register.
  intro: 'Hay una ciudad que nadie encuentra dos veces. Se esconde en el ángulo de la luz, y solo se deja ver cuando el camino la mira <i>como ella quiere ser mirada</i>.',
  win: 'La ciudad se deja ver. Torre por torre despierta su oro, campana por campana recuerda tu nombre. Guárdala en los ojos, peregrino: mañana volverá a ser niebla.',
  lose: 'La ciudad volvió a esconderse, como se esconde el agua dentro del agua. Busca otra vez el ángulo justo: ella espera a quien sabe mirar.',
  controls: 'CLIC un punto del camino: caminar &nbsp;·&nbsp; ARRASTRA un mecanismo o usa ⟲ ⟳: girar &nbsp;·&nbsp; M sonido',
  doorToast: ['', 'la primera puerta cede — la ciudad se reordena', 'la segunda puerta cede — ya casi te deja verla'],
}

// --- dom ---------------------------------------------------------------------
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

const hud = el('div', '', '', ui)
hud.id = 'hud'
const toastEl = el('div', '', '', ui)
toastEl.id = 'toast'
const hint = el('div', '', TEXTS.controls.replace(/&nbsp;/g, ' '), ui)
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
  TEXTS.title, TEXTS.epithet, TEXTS.intro, TEXTS.controls, 'COMENZAR', () => begin()
)
let endCard = null

// --- three ------------------------------------------------------------------
const renderer = createRenderer(canvas)
const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0x14253f, 30, 60)
const camera = createCamera()
const lights = createLights(scene)
const puffs = createPuffs(14)
scene.add(puffs.group)
const pilgrim = createPilgrim()
scene.add(pilgrim.group)
const audio = createAudio()

// --- game state ---------------------------------------------------------------
const game = { phase: 'title', level: 1 } // title | playing | transition | won | lost
const stats = { rot: 0, steps: 0 }
let visT = 0 // visual clock — always advances
let pathOK = false
let pathK = 0 // eased 0..1 door-hum/glow level
let glowK = 0 // final-win city glow
let firstRotation = false

let L = null // current level runtime (see buildLevelState)

const frameC = { c: new THREE.Vector3(), v: 5 } // current camera frame
const trans = {
  active: false, t: 0, built: false, next: 1,
  c0: new THREE.Vector3(), v0: 5, c1: new THREE.Vector3(), v1: 5,
}

const pil = {
  node: 0, walking: false, path: null, pathLen: 0, pathPos: 0,
  from: 0, to: 0, t: 0, dur: EDGE_T, ill: false, stepBits: 0,
  yaw: 0, scaleK: 1,
}

const denied = { mat: null, t: 1 }

// scratch (frame loop is allocation-free)
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()

// --- level runtime ------------------------------------------------------------
const ctls = [] // floating ⟲ ⟳ controls, one per rotor
function clearCtls() {
  for (const c of ctls) c.root.remove()
  ctls.length = 0
}
let rotorHintEl = null

function buildLevelState(n) {
  if (L) {
    scene.remove(L.handle.group)
    disposeLevel(L.handle)
  }
  clearCtls()
  if (rotorHintEl) { rotorHintEl.remove(); rotorHintEl = null }

  const def = LEVELS[n - 1]
  const handle = buildLevel(def)
  scene.add(handle.group)
  game.level = n

  const ids = []
  const idToIdx = {}
  const nodeStatic = []
  const nodeLocal = []
  const nodeRotor = []
  def.nodes.forEach((nd, i) => {
    ids.push(nd.id)
    idToIdx[nd.id] = i
    if (nd.l) {
      nodeStatic.push(null)
      nodeLocal.push(new THREE.Vector3(nd.l[0], nd.l[1], nd.l[2]))
      nodeRotor.push(nd.r)
    } else {
      nodeStatic.push(new THREE.Vector3(nd.p[0], nd.p[1], nd.p[2]))
      nodeLocal.push(null)
      nodeRotor.push(-1)
    }
  })
  const edges = def.edges.map((e) => ({
    a: idToIdx[e.a], b: idToIdx[e.b],
    r: e.r === undefined ? -1 : e.r, at: e.at === undefined ? 0 : e.at,
    ill: !!e.ill,
  }))
  const adj = ids.map(() => [])
  edges.forEach((e, i) => {
    adj[e.a].push(i)
    adj[e.b].push(i)
  })

  const rotors = def.rotors.map((rd, i) => {
    const rb = handle.rotors[i]
    const angle = rd.start * HALF_PI
    rb.group.rotation.y = angle
    return {
      def: rd, group: rb.group, ringMat: rb.ringMat,
      pivotV: new THREE.Vector3(rd.pivot[0], rd.pivot[1], rd.pivot[2]),
      angle, index: rd.start, busy: false, dragging: false,
      from: 0, to: 0, t: 0, dur: 0.4, lastQ: rd.start, prevAngle: angle,
      lastX: -1, lastY: -1,
    }
  })

  L = {
    def, handle, ids, idToIdx, nodeStatic, nodeLocal, nodeRotor, edges, adj, rotors,
    door: idToIdx[def.door], start: idToIdx[def.start],
    visited: new Uint8Array(ids.length),
    prev: new Int16Array(ids.length),
    queue: new Int16Array(ids.length),
  }

  // pilgrim to the start node
  pil.node = L.start
  pil.walking = false
  pil.path = new Int16Array(ids.length)
  pil.yaw = Math.PI
  nodeWorld(pil.node, _a)
  pilgrim.group.position.copy(_a)
  pilgrim.group.visible = true
  pil.scaleK = 1
  pilgrim.group.scale.setScalar(1)

  // camera frame + light rig
  frameC.c.set(def.center[0], def.center[1], def.center[2])
  frameC.v = def.view
  lights.center(frameC.c)
  refreshFrame()

  // HUD + floating rotor controls
  hud.innerHTML = '<b>' + def.name + '</b>'
  rotors.forEach((r, i) => {
    const root = el('div', 'rotor-ctl', '', ui)
    const bl = el('button', '', '⟲', root)
    const br = el('button', '', '⟳', root)
    bl.addEventListener('click', () => rotate(i, -1))
    br.addEventListener('click', () => rotate(i, 1))
    ctls.push({ root, r })
  })
  if (n === 1) rotorHintEl = el('div', 'rotor-hint', 'gira el mecanismo', ui)

  recomputePath()
  return L
}

// --- node / edge math -----------------------------------------------------------
function nodeWorld(i, out) {
  const st = L.nodeStatic[i]
  if (st) return out.copy(st)
  const r = L.rotors[L.nodeRotor[i]]
  return out.copy(L.nodeLocal[i]).applyAxisAngle(UP, r.angle).add(r.pivotV)
}

function rotorSettled(ri) {
  const r = L.rotors[ri]
  return !r.busy && !r.dragging
}

function edgeValid(e) {
  const ra = L.nodeRotor[e.a]
  const rb = L.nodeRotor[e.b]
  if (ra >= 0 && !rotorSettled(ra)) return false
  if (rb >= 0 && !rotorSettled(rb)) return false
  if (e.r < 0) return true
  if (!rotorSettled(e.r)) return false
  return L.rotors[e.r].index === e.at
}

// BFS from pil.node to `target`; fills pil.path when found. Returns length or -1.
function findPath(target, write) {
  const vis = L.visited
  const prev = L.prev
  const q = L.queue
  vis.fill(0)
  let head = 0
  let tail = 0
  q[tail++] = pil.node
  vis[pil.node] = 1
  prev[pil.node] = -1
  while (head < tail) {
    const cur = q[head++]
    if (cur === target) {
      let len = 0
      let n = cur
      while (n !== -1) {
        len++
        n = prev[n]
      }
      if (write) {
        let k = len - 1
        n = cur
        while (n !== -1) {
          pil.path[k--] = n
          n = prev[n]
        }
        pil.pathLen = len
      }
      return len
    }
    const list = L.adj[cur]
    for (let i = 0; i < list.length; i++) {
      const e = L.edges[list[i]]
      if (!edgeValid(e)) continue
      const nxt = e.a === cur ? e.b : e.a
      if (vis[nxt]) continue
      vis[nxt] = 1
      prev[nxt] = cur
      q[tail++] = nxt
    }
  }
  return -1
}

function recomputePath() {
  pathOK = findPath(L.door, false) >= 0
  audio.setHum(pathOK ? 1 : 0)
}

// --- walking ----------------------------------------------------------------------
function clickNode(idOrIdx) {
  if (game.phase !== 'playing') return 'busy'
  if (pil.walking) return 'busy'
  const idx = typeof idOrIdx === 'number' ? idOrIdx : L.idToIdx[idOrIdx]
  if (idx === undefined || idx === pil.node) return 'busy'
  const len = findPath(idx, true)
  if (len < 0) {
    const mat = L.handle.markers[L.ids[idx]]
    if (mat) {
      denied.mat = mat
      denied.t = 0
    }
    if (visT - lastDeniedAt > 0.25) {
      audio.sfx.denied()
      lastDeniedAt = visT
    }
    return 'denied'
  }
  pil.pathPos = 0
  startEdge()
  return 'ok'
}
let lastDeniedAt = -1

function startEdge() {
  if (pil.pathPos >= pil.pathLen - 1) {
    pil.walking = false
    arrive()
    return
  }
  pil.from = pil.path[pil.pathPos]
  pil.to = pil.path[pil.pathPos + 1]
  // the edge being crossed (for illusion detection)
  pil.ill = false
  const list = L.adj[pil.from]
  for (let i = 0; i < list.length; i++) {
    const e = L.edges[list[i]]
    if ((e.a === pil.from && e.b === pil.to) || (e.b === pil.from && e.a === pil.to)) {
      pil.ill = e.ill
      break
    }
  }
  pil.t = 0
  pil.dur = pil.ill ? ILL_T : EDGE_T
  pil.stepBits = 0
  pil.walking = true
  if (pil.ill) {
    audio.sfx.illusion()
    nodeWorld(pil.from, _a)
    puffs.spawn(_a.x, _a.y + 0.3, _a.z, 0.9)
  }
}

function arrive() {
  recomputePath()
  if (pil.node === L.door) {
    if (game.level >= 3) win()
    else levelComplete()
  }
}

function smooth(t) { return t * t * (3 - 2 * t) }

function updateWalk(dt) {
  if (!pil.walking) return
  pil.t += dt
  const k = smooth(Math.min(1, pil.t / pil.dur))
  nodeWorld(pil.from, _a)
  nodeWorld(pil.to, _b)
  pilgrim.group.position.lerpVectors(_a, _b, k)
  // face the travel direction (screen-still on illusion edges — keep yaw)
  if (!pil.ill) {
    const dx = _b.x - _a.x
    const dz = _b.z - _a.z
    if (Math.abs(dx) + Math.abs(dz) > 0.001) {
      const target = Math.atan2(dx, dz)
      let d = target - pil.yaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      pil.yaw += d * Math.min(1, dt * 12)
    }
    if (k > 0.25 && !(pil.stepBits & 1)) {
      pil.stepBits |= 1
      audio.sfx.step()
    }
    if (k > 0.7 && !(pil.stepBits & 2)) {
      pil.stepBits |= 2
      audio.sfx.step()
    }
  }
  if (pil.t >= pil.dur) {
    pil.node = pil.to
    pil.pathPos++
    stats.steps++
    startEdge()
  }
}

// --- rotors ------------------------------------------------------------------------
function rotate(ri, steps) {
  if (game.phase !== 'playing') return false
  if (pil.walking) return false
  const r = L.rotors[ri]
  if (!r || r.busy || r.dragging) return false
  const s = steps | 0
  if (s === 0) return false
  r.from = r.angle
  r.to = r.angle + s * HALF_PI
  r.t = 0
  r.dur = 0.38 * Math.min(3, Math.abs(s))
  r.busy = true
  r.lastQ = Math.round(r.angle / HALF_PI)
  audio.sfx.grindStart()
  markRotated()
  return true
}

function markRotated() {
  stats.rot++
  if (!firstRotation) {
    firstRotation = true
    if (rotorHintEl) {
      rotorHintEl.remove()
      rotorHintEl = null
    }
  }
}

function finishRotor(r) {
  r.angle = Math.round(r.angle / HALF_PI) * HALF_PI
  r.index = ((Math.round(r.angle / HALF_PI) % 4) + 4) % 4
  r.group.rotation.y = r.angle
  r.busy = false
  audio.sfx.grindStop()
  audio.sfx.snap()
  recomputePath()
}

function updateRotors(dt) {
  for (let i = 0; i < L.rotors.length; i++) {
    const r = L.rotors[i]
    if (r.busy) {
      r.t += dt
      const k = smooth(Math.min(1, r.t / r.dur))
      r.angle = r.from + (r.to - r.from) * k
      r.group.rotation.y = r.angle
      const q = Math.round(r.angle / HALF_PI)
      if (q !== r.lastQ) {
        r.lastQ = q
        audio.sfx.tick()
      }
      if (r.t >= r.dur) {
        r.angle = r.to
        finishRotor(r)
      }
    }
    // carry: the pilgrim rides a section he is standing on
    const dA = r.angle - r.prevAngle
    r.prevAngle = r.angle
    if (dA !== 0 && !pil.walking && L.nodeRotor[pil.node] === i) {
      nodeWorld(pil.node, _a)
      pilgrim.group.position.copy(_a)
      pil.yaw += dA
    }
    r.ringMat.emissiveIntensity = 0.22 + (r.busy || r.dragging ? 0.5 : 0) + 0.08 * Math.sin(visT * 2.4 + i)
  }
}

// --- win / lose / level flow -----------------------------------------------------------
function levelComplete() {
  game.phase = 'transition'
  audio.sfx.levelBell()
  toast(TEXTS.doorToast[game.level], true)
  trans.active = true
  trans.t = 0
  trans.built = false
  trans.next = game.level + 1
  trans.c0.copy(frameC.c)
  trans.v0 = frameC.v
  const nd = LEVELS[trans.next - 1]
  trans.c1.set(nd.center[0], nd.center[1], nd.center[2])
  trans.v1 = nd.view
}

function updateTransition(dt) {
  if (!trans.active) return
  trans.t += dt
  const t = trans.t
  // old level fades and sinks
  if (!trans.built) {
    const f = Math.min(1, t / 0.7)
    const mats = L.handle.mats
    for (let i = 0; i < mats.length; i++) {
      mats[i].transparent = true
      mats[i].opacity = 1 - f
    }
    L.handle.group.position.y -= dt * 0.9
    pilgrim.group.visible = false
    if (t >= 0.7) {
      trans.built = true
      buildLevelState(trans.next)
      // restore the camera lerp origin (buildLevelState jumped the frame)
      frameC.c.copy(trans.c0)
      frameC.v = trans.v0
      pilgrim.group.visible = false
      // pieces start folded into the fog
      const as = L.handle.assemble
      for (let i = 0; i < as.length; i++) {
        as[i].delay = (i % 12) * 0.07
        as[i].spawned = false
        as[i].obj.scale.setScalar(0.001)
      }
    }
  } else {
    const as = L.handle.assemble
    for (let i = 0; i < as.length; i++) {
      const p = as[i]
      const k = Math.min(1, Math.max(0, (t - 0.75 - p.delay) / 0.55))
      if (k > 0 && !p.spawned) {
        p.spawned = true
        puffs.spawn(p.obj.position.x, p.y0 + 0.6, p.obj.position.z, 1.6)
      }
      const c1 = 1.70158
      const c3 = c1 + 1
      const e = k >= 1 ? 1 : 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2)
      p.obj.scale.setScalar(Math.max(0.001, e))
      p.obj.position.y = p.y0 - (1 - k) * 1.1
    }
    if (t > 1.9 && !pilgrim.group.visible) {
      pilgrim.group.visible = true
      pil.scaleK = 0
    }
  }
  // slow camera drift across the whole transition
  const ck = smooth(Math.min(1, t / 2.4))
  frameC.c.lerpVectors(trans.c0, trans.c1, ck)
  frameC.v = trans.v0 + (trans.v1 - trans.v0) * ck
  lights.center(frameC.c)
  refreshFrame()
  if (t >= 2.6) {
    trans.active = false
    game.phase = 'playing'
    toast(L.def.toast, true)
  }
}

function win() {
  if (game.phase === 'won') return
  game.phase = 'won'
  try { localStorage.setItem(LS_DONE, '1') } catch (e) { /* storage may be unavailable */ }
  titleCard.remove()
  audio.sfx.winBells()
  setTimeout(() => {
    audio.voice('win')
    if (endCard) endCard.remove()
    endCard = card(
      'LA CIUDAD SE DEJA VER', 'Por una sola noche',
      TEXTS.win + '<span class="tally">giros ' + stats.rot + ' · pasos ' + stats.steps + ' · ✦ seña guardada</span>',
      '', 'VOLVER A BUSCARLA', () => location.reload()
    )
  }, 2200)
}

function lose() {
  if (game.phase === 'won' || game.phase === 'lost') return
  game.phase = 'lost'
  titleCard.remove()
  audio.sfx.lose()
  const lvl = game.level
  setTimeout(() => {
    audio.voice('lose')
    if (endCard) endCard.remove()
    endCard = card(
      'LA CIUDAD SE ESCONDE', 'la ciudad volvió a esconderse', TEXTS.lose,
      '', 'BUSCAR DE NUEVO',
      () => {
        if (endCard) {
          endCard.remove()
          endCard = null
        }
        setLevel(lvl)
      }
    )
  }, 800)
}

function setLevel(n) {
  const lvl = Math.max(1, Math.min(3, n | 0))
  trans.active = false
  if (endCard) {
    endCard.remove()
    endCard = null
  }
  buildLevelState(lvl)
  game.phase = 'playing'
  toast(L.def.toast, true)
}

function begin() {
  if (game.phase !== 'title') return
  audio.unlock()
  speakIntro()
  titleCard.remove()
  game.phase = 'playing'
  toast(L.def.toast, true)
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

// --- camera / projection ------------------------------------------------------------
let cw = 1
let ch = 1
function refreshFrame() {
  applyFrame(camera, frameC.c, frameC.v, cw / ch)
}
function resize() {
  cw = window.innerWidth
  ch = window.innerHeight
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(cw, ch)
  refreshFrame()
}
window.addEventListener('resize', resize)
resize()

// world → screen px (no allocations; writes into out {x,y})
function toScreen(v3, out) {
  _c.copy(v3).project(camera)
  out.x = (_c.x * 0.5 + 0.5) * cw
  out.y = (-_c.y * 0.5 + 0.5) * ch
}
const _s = { x: 0, y: 0 }

// --- input ----------------------------------------------------------------------------
const drag = { rotor: -1, moved: false, x0: 0, y0: 0, a0: 0 }

function rotorAt(px, py) {
  const pxPerWorld = ch / (2 * frameC.v)
  for (let i = 0; i < L.rotors.length; i++) {
    toScreen(L.rotors[i].pivotV, _s)
    const dx = _s.x - px
    const dy = _s.y - py
    if (Math.hypot(dx, dy) < 1.55 * pxPerWorld) return i
  }
  return -1
}

function nodeAt(px, py) {
  let best = -1
  let bestD = 38
  for (let i = 0; i < L.ids.length; i++) {
    nodeWorld(i, _a)
    toScreen(_a, _s)
    const d = Math.hypot(_s.x - px, _s.y - py)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

canvas.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'playing' || !L) return
  drag.rotor = -1
  drag.moved = false
  drag.x0 = e.clientX
  drag.y0 = e.clientY
  const ri = rotorAt(e.clientX, e.clientY)
  if (ri >= 0 && !L.rotors[ri].busy && !pil.walking) {
    drag.rotor = ri
    drag.a0 = L.rotors[ri].angle
  }
})

window.addEventListener('pointermove', (e) => {
  if (drag.rotor < 0 || game.phase !== 'playing') return
  const r = L.rotors[drag.rotor]
  const dx = e.clientX - drag.x0
  const dy = e.clientY - drag.y0
  if (!drag.moved && Math.hypot(dx, dy) > 6) {
    drag.moved = true
    r.dragging = true
    r.lastQ = Math.round(r.angle / HALF_PI)
    audio.sfx.grindStart()
    markRotated()
    recomputePath()
  }
  if (drag.moved) {
    r.angle = drag.a0 + dx * 0.012
    r.group.rotation.y = r.angle
    const q = Math.round(r.angle / HALF_PI)
    if (q !== r.lastQ) {
      r.lastQ = q
      audio.sfx.tick()
    }
  }
})

window.addEventListener('pointerup', (e) => {
  if (game.phase !== 'playing' || !L) return
  if (drag.rotor >= 0 && drag.moved) {
    const r = L.rotors[drag.rotor]
    r.dragging = false
    // snap to the nearest 90°
    r.from = r.angle
    r.to = Math.round(r.angle / HALF_PI) * HALF_PI
    r.t = 0
    r.dur = Math.max(0.12, Math.abs(r.to - r.from) / HALF_PI * 0.38)
    r.busy = true
    r.lastQ = Math.round(r.from / HALF_PI)
    drag.rotor = -1
    return
  }
  drag.rotor = -1
  if (e.target !== canvas) return
  const ni = nodeAt(e.clientX, e.clientY)
  if (ni >= 0) clickNode(ni)
})

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    const m = audio.toggleMute()
    toast(m ? 'silencio' : 'sonido')
  }
})

// --- frame ------------------------------------------------------------------------------
function frame(dt) {
  visT += dt
  puffs.update(dt)

  // pilgrim idle dressing (always, so the title scene breathes)
  const bobA = pil.walking ? 0.018 : 0.028
  const bobF = pil.walking ? 11 : 2.1
  pilgrim.group.rotation.y = pil.yaw
  pilgrim.group.rotation.z = pil.walking ? Math.sin(visT * 10) * 0.04 : Math.sin(visT * 1.3) * 0.02
  pilgrim.lanternMat.emissiveIntensity = 1.5 + Math.sin(visT * 7.3) * 0.25
  pilgrim.light.intensity = 0.75 + Math.sin(visT * 6.1) * 0.12
  if (pil.scaleK < 1) {
    pil.scaleK = Math.min(1, pil.scaleK + dt * 2.5)
    pilgrim.group.scale.setScalar(Math.max(0.001, smooth(pil.scaleK)))
  }

  // door glow follows pathExists (and the final win floods the city)
  const pathTarget = pathOK ? 1 : 0
  pathK += (pathTarget - pathK) * Math.min(1, dt * 3)
  const dg = L.handle.doorGlow
  dg.emissiveIntensity = 0.35 + pathK * (0.6 + 0.3 * Math.sin(visT * 3.1)) + glowK * 1.2
  dg.opacity = 0.7 + pathK * 0.15 + 0.1 * Math.sin(visT * 2.2)
  L.handle.doorLight.intensity = 0.4 + pathK * (0.9 + 0.25 * Math.sin(visT * 3.1)) + glowK * 2
  const wins = L.handle.windows
  for (let i = 0; i < wins.length; i++) {
    wins[i].emissiveIntensity = 0.45 + 0.12 * Math.sin(visT * 1.7 + i * 2.1) + glowK * 1.3
  }
  if (denied.t < 1) {
    denied.t = Math.min(1, denied.t + dt * 2.2)
    if (denied.mat) denied.mat.emissiveIntensity = 0.3 + (1 - denied.t) * 1.5
  }

  if (game.phase === 'playing') {
    updateRotors(dt)
    updateWalk(dt)
    if (!pil.walking && L.nodeRotor[pil.node] < 0) {
      // gentle settle onto the node (covers post-carry and post-walk)
      nodeWorld(pil.node, _a)
      pilgrim.group.position.x = _a.x
      pilgrim.group.position.z = _a.z
      pilgrim.group.position.y = _a.y + Math.sin(visT * bobF) * bobA
    } else if (!pil.walking) {
      nodeWorld(pil.node, _a)
      pilgrim.group.position.copy(_a)
      pilgrim.group.position.y += Math.sin(visT * bobF) * bobA
    }
    positionCtls()
  } else if (game.phase === 'transition') {
    updateTransition(dt)
    positionCtls()
  } else if (game.phase === 'won') {
    glowK = Math.min(1, glowK + dt * 0.4)
    frameC.v = Math.min(L.def.view + 1.6, frameC.v + dt * 0.35 * (1 - glowK * 0.6))
    refreshFrame()
    if (Math.random() < dt * 2.5) {
      puffs.spawn(
        frameC.c.x + (Math.random() - 0.5) * 8,
        frameC.c.y + Math.random() * 3,
        frameC.c.z + (Math.random() - 0.5) * 8, 1.4
      )
    }
  }

  audio.update(dt)
}

function positionCtls() {
  const hidden = game.phase !== 'playing'
  for (let i = 0; i < ctls.length; i++) {
    const c = ctls[i]
    toScreen(c.r.pivotV, _s)
    const x = Math.round(_s.x)
    const y = Math.round(_s.y + 40)
    if (x !== c.r.lastX || y !== c.r.lastY) {
      c.r.lastX = x
      c.r.lastY = y
      c.root.style.left = x + 'px'
      c.root.style.top = y + 'px'
    }
    c.root.style.opacity = hidden ? '0' : '1'
    const busy = c.r.busy || c.r.dragging || pil.walking
    if (busy !== c.busyState) {
      c.busyState = busy
      c.root.classList.toggle('busy', busy)
    }
  }
  if (rotorHintEl && L.rotors.length) {
    toScreen(L.rotors[0].pivotV, _s)
    rotorHintEl.style.left = Math.round(_s.x) + 'px'
    rotorHintEl.style.top = Math.round(_s.y - 46) + 'px'
  }
}

// --- boot + loop ---------------------------------------------------------------------------
buildLevelState(1)

let lastT = performance.now()
function tick(now) {
  const dt = Math.min((now - lastT) / 1000, 0.05)
  lastT = now
  frame(dt)
  renderer.render(scene, camera)
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

// --- test api --------------------------------------------------------------------------------
function anyRotorBusy() {
  for (let i = 0; i < L.rotors.length; i++) {
    if (L.rotors[i].busy || L.rotors[i].dragging) return true
  }
  return false
}

window.__game = {
  begin,
  step(dt = 1 / 60, steps = 1) {
    for (let i = 0; i < steps; i++) frame(Math.min(dt, 0.05))
    renderer.render(scene, camera)
  },
  getState() {
    const rotors = []
    for (let i = 0; i < L.rotors.length; i++) rotors.push(L.rotors[i].index)
    return {
      phase: game.phase,
      level: game.level,
      pilgrimNode: L.ids[pil.node],
      rotors,
      pathExists: findPath(L.door, false) >= 0,
    }
  },
  forceWin: () => win(),
  forceLose: () => lose(),
  setLevel: (n) => setLevel(n),
  rotate: (ri, steps) => rotate(ri, steps),
  clickNode: (id) => clickNode(id),
  nodes() {
    const out = []
    for (let i = 0; i < L.ids.length; i++) {
      nodeWorld(i, _a)
      toScreen(_a, _s)
      out.push({ id: L.ids[i], screen: [Math.round(_s.x), Math.round(_s.y)], world: [_a.x, _a.y, _a.z] })
    }
    return out
  },
  solve() {
    if (game.phase === 'title') begin()
    const script = L.def.solve
    let guard = 0
    const settle = () => {
      while (guard < 30000 && (game.phase === 'transition' || pil.walking || anyRotorBusy())) {
        frame(1 / 60)
        guard++
      }
    }
    for (let i = 0; i < script.length; i++) {
      settle()
      const act = script[i]
      if (act[0] === 'rotate') rotate(act[1], act[2])
      else clickNode(act[1])
      settle()
    }
    settle()
    renderer.render(scene, camera)
    return this.getState()
  },
}
