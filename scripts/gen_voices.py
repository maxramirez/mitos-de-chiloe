#!/usr/bin/env python3
"""Generate the flagship's Spanish voice narration via gpt-4o-mini-tts.
Usage: OPENAI_API_KEY=sk-... python3 scripts/gen_voices.py
Reads texts from src/lore.js (via node), writes public/assets/voice/caleuche/*.mp3.
Skips existing files; 4 workers; one retry each."""
import json
import os
import subprocess
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "public", "assets", "voice", "caleuche")
KEY = os.environ["OPENAI_API_KEY"]

INSTRUCTIONS = (
    "Recita como Pablo Neruda leyendo sus propios versos: voz grave y profunda, muy "
    "lenta, casi salmodiada, con cadencia de oleaje — cada frase cae y se retira como "
    "una ola. Tono fúnebre, íntimo y levemente siniestro, como un poema dicho junto al "
    "fuego para que nadie se duerma. Español chileno, pausas largas entre frases, "
    "alargando las vocales finales."
)

dump = subprocess.run(
    [
        "node",
        "--input-type=module",
        "-e",
        "import('file://" + os.path.join(ROOT, "src", "lore.js").replace("'", "") + "')"
        ".then(m => console.log(JSON.stringify({LORE: m.LORE, STRINGS: m.STRINGS})))",
    ],
    capture_output=True,
    text=True,
    check=True,
)
data = json.loads(dump.stdout)
LORE, STRINGS = data["LORE"], data["STRINGS"]

clips = {}
for being_id, entry in LORE.items():
    clips[f"lore-{being_id}"] = entry["lore"] + " … " + entry["blessing"]
clips["intro"] = STRINGS["intro"]
clips["win"] = STRINGS["winText"]
clips["blackout"] = STRINGS["blackoutText"]
clips["banner"] = STRINGS["banner"]


def gen(name, text):
    path = os.path.join(OUT, f"{name}.mp3")
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return f"skip {name}"
    body = json.dumps(
        {
            "model": "gpt-4o-mini-tts",
            "voice": "onyx",
            "response_format": "mp3",
            "input": text,
            "instructions": INSTRUCTIONS,
        }
    ).encode()
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/audio/speech",
                data=body,
                headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=300) as r:
                audio = r.read()
            if len(audio) < 1000:
                raise ValueError("suspiciously small response")
            with open(path, "wb") as f:
                f.write(audio)
            return f"ok   {name} ({len(audio) // 1024} KB)"
        except Exception as e:  # noqa: BLE001
            if attempt == 2:
                return f"FAIL {name}: {str(e)[:140]}"
    return None


def main():
    os.makedirs(OUT, exist_ok=True)
    with ThreadPoolExecutor(max_workers=4) as ex:
        for result in ex.map(lambda kv: gen(*kv), clips.items()):
            print(result, flush=True)
    print("ALL DONE")


if __name__ == "__main__":
    sys.exit(main())
