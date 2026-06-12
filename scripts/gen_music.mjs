// Generate looping music beds for MITOS DE CHILOÉ via Gemini Lyria RealTime.
// Usage: GEMINI_API_KEY=... node scripts/gen_music.mjs [gameId ...]
// Streams ~52 s of 48 kHz stereo PCM per game, then encodes a seam-crossfaded
// mp3 loop into public/assets/music/<id>.mp3 (requires ffmpeg).
import { GoogleGenAI } from '@google/genai'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'public', 'assets', 'music')
fs.mkdirSync(OUT, { recursive: true })

const BASE = 'dark Chilote folk, southern Chile archipelago at night, foggy, restrained and ominous, lo-fi intimate recording'

const GAMES = {
  caleuche: { bpm: 60, prompts: [`${BASE}, deep sea drone, sparse bowed strings, very slow, almost ambient, dread`] },
  pincoya: { bpm: 84, prompts: [`${BASE}, gentle melancholic waltz, soft accordion and harp, moonlit water, longing`] },
  trauco: { bpm: 70, prompts: [`${BASE}, sparse tense forest music, low pizzicato strings, long silences, watchful`] },
  camahueto: { bpm: 112, prompts: [`${BASE}, driving low percussion and cello ostinato, downhill momentum, urgent but dark`] },
  sirena: { bpm: 66, prompts: [`${BASE}, ethereal wordless female voice, watery echoes, siren song, sad and beautiful`] },
  invunche: { bpm: 50, prompts: [`${BASE}, cavernous dark ambient, sub bass drone, distant stone scrapes, claustrophobic`] },
  basilisco: { bpm: 76, prompts: [`${BASE}, quiet tense pulse, rain on wooden roof, woody percussion ticks, held breath`] },
  tenten: { bpm: 72, prompts: [`${BASE}, mythic slow build, deep ceremonial drums, low strings, two ancient forces, flood`] },
  brujo: { bpm: 80, prompts: [`${BASE}, wind-swept night flight, airy strings and low flute, soaring yet ominous`] },
  cuchivilu: { bpm: 96, prompts: [`${BASE}, tidal swaying rhythm, plucked strings, playful but sinister, mud and moonlight`] },
  fiura: { bpm: 78, prompts: [`${BASE}, swampy eerie folk, detuned plucked strings, frog-pond night textures, mischief and threat`] },
  quicavi: { bpm: 48, prompts: [`${BASE}, near-silence dread, faint dissonant drone, rare sparse piano notes, something behind you`] },
  cesares: { bpm: 70, prompts: [`${BASE}, weightless music-box puzzle garden, soft bells and harp, slow wonder with melancholy, enchanted hidden city`] },
  piuchen: { bpm: 108, prompts: [`${BASE}, tense arcade pulse on folk instruments, staccato strings, swooping danger, starry night`] },
}

const SECONDS = 52
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY, apiVersion: 'v1alpha' })

async function generate(id) {
  const mp3Path = path.join(OUT, `${id}.mp3`)
  if (fs.existsSync(mp3Path) && fs.statSync(mp3Path).size > 0) {
    console.log(`skip ${id}`)
    return
  }
  const cfg = GAMES[id]
  const chunks = []
  let bytes = 0
  const target = 48000 * 2 * 2 * SECONDS
  let resolveDone
  const done = new Promise((r) => (resolveDone = r))

  const session = await ai.live.music.connect({
    model: 'models/lyria-realtime-exp',
    callbacks: {
      onmessage: (msg) => {
        const parts = msg?.serverContent?.audioChunks
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p?.data) {
              const buf = Buffer.from(p.data, 'base64')
              chunks.push(buf)
              bytes += buf.length
            }
          }
          if (bytes >= target) resolveDone()
        }
      },
      onerror: (e) => {
        console.error(`${id} ws error:`, e?.message || e)
        resolveDone()
      },
      onclose: () => resolveDone(),
    },
  })

  await session.setWeightedPrompts({ weightedPrompts: cfg.prompts.map((text) => ({ text, weight: 1.0 })) })
  await session.setMusicGenerationConfig({ musicGenerationConfig: { bpm: cfg.bpm, temperature: 1.0 } })
  await session.play()
  const timeout = setTimeout(resolveDone, 150000)
  await done
  clearTimeout(timeout)
  try { session.stop() } catch {}
  try { session.close() } catch {}

  if (bytes < target * 0.5) {
    console.error(`FAIL ${id}: only ${(bytes / 1e6).toFixed(1)} MB of PCM received`)
    return
  }
  const raw = path.join(OUT, `${id}.raw`)
  fs.writeFileSync(raw, Buffer.concat(chunks).subarray(0, target))
  // seam crossfade: last 2 s blended over the first 2 s -> clean loop
  execFileSync('ffmpeg', [
    '-y', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', raw,
    '-filter_complex',
    `[0:a]asplit=2[a][b];[a]atrim=0:${SECONDS - 2},asetpts=PTS-STARTPTS[main];` +
      `[b]atrim=${SECONDS - 2},asetpts=PTS-STARTPTS[tail];[tail][main]acrossfade=d=2:c1=tri:c2=tri[out]`,
    '-map', '[out]', '-codec:a', 'libmp3lame', '-q:a', '5', mp3Path,
  ], { stdio: 'pipe' })
  fs.unlinkSync(raw)
  const kb = Math.round(fs.statSync(mp3Path).size / 1024)
  console.log(`ok   ${id}.mp3 (${kb} KB)`)
}

const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAMES)
for (const id of ids) {
  try {
    await generate(id)
  } catch (e) {
    console.error(`FAIL ${id}: ${e?.message || e}`)
  }
}
console.log('ALL DONE')
process.exit(0)
