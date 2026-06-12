// case.js — LA RECTA PROVINCIA · seeded case generator + brute-force verifier.
//
// World model: n islanders sit at the tribunal's table; exactly one is the
// brujo. The brujo spent dusk ALONE in the cave below Quicaví — so any claim
// that places a person elsewhere at dusk is a claim of innocence. Every
// character speaks exactly TWO statements. Non-brujos only tell the truth;
// the brujo lies in EXACTLY ONE of his two statements (the other is true).
// Each character also carries three VISIBLE attributes (wet boots, a whole
// shadow, salt on the wool) that attribute-statements refer to.
//
// Statement kinds (predicate of the hypothesis b = brujo index):
//   alibi_self        — "yo estaba en X al anochecer"      ⇒ b ≠ speaker
//   alibi_with (j)    — "estuve en X con j"                ⇒ b ≠ speaker ∧ b ≠ j
//   saw_away  (j)     — "vi a j en X al anochecer"         ⇒ b ≠ j
//   saw_near  (j)     — "vi a j subir hacia la cueva"      ⇒ b = j
//   attr (k, v)       — "el brujo <attribute phrase>"      ⇒ chars[b].attrs[k] = v
//
// genCase(seed, n) deterministically searches attempt-mixed sub-seeds until
// the constraint set has a UNIQUE consistent brujo (verified by brute force
// over all n hypotheses) and passes fairness filters (2–4 attribute clues,
// no innocent attribute clue that pinpoints a single islander, at most one
// true direct accusation).

export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashSeed(base, k) {
  let h = (base ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ k, 2654435761) >>> 0
  h = Math.imul(h ^ (h >>> 13), 1597334677) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

// 9 archetypes; each case draws n of them (silhouette `kind` drives the art).
export const POOL = [
  { name: 'Doña Carmen', refA: 'a Doña Carmen', refCon: 'con Doña Carmen', kind: 'shawl' },
  { name: 'El Chico Millán', refA: 'al Chico Millán', refCon: 'con el Chico Millán', kind: 'cap' },
  { name: 'Don Anselmo', refA: 'a Don Anselmo', refCon: 'con Don Anselmo', kind: 'hat' },
  { name: 'La Tía Rosario', refA: 'a la Tía Rosario', refCon: 'con la Tía Rosario', kind: 'scarf' },
  { name: 'Pedro Nahuel', refA: 'a Pedro Nahuel', refCon: 'con Pedro Nahuel', kind: 'fisher' },
  { name: 'La Viuda Quintana', refA: 'a la Viuda Quintana', refCon: 'con la Viuda Quintana', kind: 'veil' },
  { name: 'El Mocho Barría', refA: 'al Mocho Barría', refCon: 'con el Mocho Barría', kind: 'beard' },
  { name: 'Doña Clorinda', refA: 'a Doña Clorinda', refCon: 'con Doña Clorinda', kind: 'bun' },
  { name: 'Remigio Vera', refA: 'a Remigio Vera', refCon: 'con Remigio Vera', kind: 'coat' },
]

const PLACES = [
  'la playa de Curaco',
  'el muelle de Dalcahue',
  'la feria de Achao',
  'el bosque de arrayanes',
  'la capilla vieja',
  'el secadero de redes',
]

const ATTRS = ['wet', 'shadow', 'salt']

const ATTR_TEXT = {
  wet: {
    true: 'El brujo volvió del agua: lleva las botas empapadas.',
    false: 'El brujo no moja los pies: sus botas están secas.',
  },
  shadow: {
    true: 'El brujo arrastra su sombra entera, como cualquier cristiano.',
    false: 'Al brujo le falta la sombra; el suelo no lo recuerda.',
  },
  salt: {
    true: 'El brujo lleva sal en la lana, como escarcha que no se derrite.',
    false: 'La ropa del brujo no conoce la sal.',
  },
}

export function traitWords(c) {
  return (
    (c.attrs.wet ? 'botas mojadas' : 'botas secas') +
    ' · ' +
    (c.attrs.shadow ? 'sombra entera' : 'sin sombra') +
    ' · ' +
    (c.attrs.salt ? 'sal en la lana' : 'lana sin sal')
  )
}

function buildText(s, chars, rng) {
  const place = PLACES[(rng() * PLACES.length) | 0]
  const t = chars[s.j] // may be undefined for self/attr kinds
  switch (s.kind) {
    case 'alibi_self':
      return rng() < 0.5
        ? 'Cuando cayó la noche, yo estaba en ' + place + '.'
        : 'Yo pasé el anochecer en ' + place + ', lejos de toda cueva.'
    case 'alibi_with':
      return rng() < 0.5
        ? 'Pasé el anochecer en ' + place + ' ' + t.refCon + '.'
        : 'Estuve en ' + place + ' ' + t.refCon + ' hasta que cerró la noche.'
    case 'saw_away':
      return rng() < 0.5
        ? 'Vi ' + t.refA + ' en ' + place + ', al anochecer.'
        : 'Al caer la noche vi ' + t.refA + ' por ' + place + '.'
    case 'saw_near':
      return rng() < 0.5
        ? 'Vi ' + t.refA + ' subir hacia la cueva cuando oscurecía.'
        : 'Vi ' + t.refA + ' por el sendero de Quicaví, donde nadie va de noche.'
    case 'attr':
      return ATTR_TEXT[s.attr][String(s.val)]
  }
  return ''
}

export function evalStatement(s, b, chars) {
  switch (s.kind) {
    case 'alibi_self': return b !== s.sp
    case 'alibi_with': return b !== s.sp && b !== s.j
    case 'saw_away': return b !== s.j
    case 'saw_near': return b === s.j
    case 'attr': return chars[b].attrs[s.attr] === s.val
  }
  return true
}

// all hypotheses b consistent with "innocents always true, brujo lies once"
export function solve(stmts, chars) {
  const out = []
  for (let b = 0; b < chars.length; b++) {
    let ok = true
    for (let i = 0; i < chars.length && ok; i++) {
      let lies = 0
      for (let k = 0; k < stmts.length; k++) {
        if (stmts[k].sp === i && !evalStatement(stmts[k], b, chars)) lies++
      }
      if (i === b ? lies !== 1 : lies !== 0) ok = false
    }
    if (ok) out.push(b)
  }
  return out
}

function matchCount(chars, attr, val) {
  let m = 0
  for (let i = 0; i < chars.length; i++) if (chars[i].attrs[attr] === val) m++
  return m
}

function pickOther(rng, n, not1, not2) {
  let j = (rng() * n) | 0
  let guard = 0
  while ((j === not1 || j === not2) && guard++ < 64) j = (rng() * n) | 0
  return j === not1 || j === not2 ? -1 : j
}

// One construction attempt; returns null on any dead end / failed filter.
function tryCase(rng, n) {
  // characters: seeded draw of n archetypes + random visible attributes
  const idxs = []
  for (let i = 0; i < POOL.length; i++) idxs.push(i)
  for (let i = idxs.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0
    const t = idxs[i]
    idxs[i] = idxs[j]
    idxs[j] = t
  }
  const chars = []
  for (let i = 0; i < n; i++) {
    const p = POOL[idxs[i]]
    chars.push({
      name: p.name, refA: p.refA, refCon: p.refCon, kind: p.kind, pool: idxs[i],
      attrs: { wet: rng() < 0.5, shadow: rng() < 0.5, salt: rng() < 0.5 },
    })
  }
  const b = (rng() * n) | 0

  const stmts = []
  let attrCount = 0
  let sawNearTrue = 0
  const attrMax = n <= 5 ? 3 : 4

  // ---- innocents: two TRUE statements each --------------------------------
  for (let i = 0; i < n; i++) {
    if (i === b) continue
    const usedKinds = {}
    const usedTargets = {}
    const usedAttrs = {}
    let made = 0
    let guard = 0
    while (made < 2 && guard++ < 80) {
      const r = rng()
      let s = null
      if (r < 0.18 && !usedKinds.alibi_self) {
        s = { sp: i, kind: 'alibi_self', j: -1 }
      } else if (r < 0.40) {
        const j = pickOther(rng, n, i, b)
        if (j >= 0 && !usedTargets[j]) s = { sp: i, kind: 'alibi_with', j }
      } else if (r < 0.68) {
        const j = pickOther(rng, n, i, b)
        if (j >= 0 && !usedTargets[j]) s = { sp: i, kind: 'saw_away', j }
      } else if (r < 0.74) {
        if (sawNearTrue === 0 && !usedTargets[b]) {
          s = { sp: i, kind: 'saw_near', j: b }
          sawNearTrue++
        }
      } else {
        if (attrCount < attrMax) {
          const attr = ATTRS[(rng() * 3) | 0]
          const val = chars[b].attrs[attr]
          if (!usedAttrs[attr] && matchCount(chars, attr, val) >= 2) {
            s = { sp: i, kind: 'attr', j: -1, attr, val }
            attrCount++
          }
        }
      }
      if (!s) continue
      usedKinds[s.kind] = true
      if (s.j >= 0) usedTargets[s.j] = true
      if (s.attr) usedAttrs[s.attr] = true
      s.text = buildText(s, chars, rng)
      stmts.push(s)
      made++
    }
    if (made < 2) return null
  }

  // ---- the brujo: one TRUE + one FALSE, order shuffled ---------------------
  let bTrue = null
  let guard = 0
  while (!bTrue && guard++ < 60) {
    if (rng() < 0.55) {
      const j = pickOther(rng, n, b, -1)
      if (j >= 0) bTrue = { sp: b, kind: 'saw_away', j }
    } else if (attrCount < attrMax + 1) {
      const attr = ATTRS[(rng() * 3) | 0]
      const val = chars[b].attrs[attr] // truth — bold misdirection
      if (matchCount(chars, attr, val) >= 2) {
        bTrue = { sp: b, kind: 'attr', j: -1, attr, val }
        attrCount++
      }
    }
  }
  if (!bTrue) return null

  let bFalse = null
  guard = 0
  while (!bFalse && guard++ < 60) {
    const r = rng()
    if (r < 0.34) {
      bFalse = { sp: b, kind: 'alibi_self', j: -1 }
    } else if (r < 0.58) {
      const j = pickOther(rng, n, b, bTrue.j)
      if (j >= 0) bFalse = { sp: b, kind: 'alibi_with', j }
    } else if (r < 0.78) {
      const j = pickOther(rng, n, b, bTrue.j)
      if (j >= 0) bFalse = { sp: b, kind: 'saw_near', j } // false accusation
    } else {
      const attr = ATTRS[(rng() * 3) | 0]
      if (!(bTrue.kind === 'attr' && bTrue.attr === attr)) {
        bFalse = { sp: b, kind: 'attr', j: -1, attr, val: !chars[b].attrs[attr] }
      }
    }
  }
  if (!bFalse) return null
  bTrue.text = buildText(bTrue, chars, rng)
  bFalse.text = buildText(bFalse, chars, rng)
  if (rng() < 0.5) stmts.push(bTrue, bFalse)
  else stmts.push(bFalse, bTrue)

  // ---- fairness + uniqueness ----------------------------------------------
  if (attrCount < 2) return null
  const sols = solve(stmts, chars)
  if (sols.length !== 1 || sols[0] !== b) return null
  return { chars, stmts, brujo: b }
}

export function genCase(seed, n) {
  for (let attempt = 0; attempt < 4000; attempt++) {
    const rng = mulberry32(hashSeed(seed, attempt))
    const c = tryCase(rng, n)
    if (c) {
      c.seed = seed
      c.attempt = attempt
      c.n = n
      return c
    }
  }
  // statistically unreachable (acceptance rate is far above 1/4000)
  throw new Error('recta: no unique case found for seed ' + seed)
}

// grouped, readable view (used by the testimony panel and the test API)
export function testimonyList(data) {
  const out = []
  for (let i = 0; i < data.chars.length; i++) {
    const lines = []
    for (let k = 0; k < data.stmts.length; k++) {
      if (data.stmts[k].sp === i) lines.push(data.stmts[k].text)
    }
    out.push({ speaker: i, name: data.chars[i].name, traits: traitWords(data.chars[i]), lines })
  }
  return out
}
