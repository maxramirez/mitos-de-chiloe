#!/usr/bin/env python3
"""Generate painted PNG assets for MITOS DE CHILOÉ via gpt-image-1.
Usage: OPENAI_API_KEY=sk-... python3 scripts/gen_assets.py
Skips files that already exist, retries once, 4 workers."""
import base64
import json
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor

KEY = os.environ["OPENAI_API_KEY"]
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "assets")

STYLE = (
    "dark storybook folk-horror illustration, night, Chiloé archipelago in southern Chile, "
    "deep ink-blue and black palette with parchment-cream and pale spectral green-teal accents, "
    "painterly textured brushwork, heavy fog, moonlight, ominous and restrained, no text, no border, no frame"
)

CARDS = {
    "caleuche": "A ghost galleon with tattered glowing pale-green square sails emerging from a wall of fog on black water, tiny lanterns along the hull",
    "pincoya": "A beautiful golden-haired woman in a dress of dark seaweed dancing barefoot on a moonlit beach, arms raised toward the black sea, footprints glowing faintly in wet sand",
    "trauco": "A squat ugly gnome in a conical hat and ragged fiber poncho leaning on a small stone hatchet between huge cypress trunks, sickly green glow, eyes in shadow",
    "camahueto": "A silver calf with a single glowing golden horn charging down a freshly torn earthen gully toward the distant sea, soil flying",
    "sirena": "A mermaid with a pearl-bright tail combing her long hair on a black rock in a moonlit channel, a single tiny green ship-light far across the water",
    "invunche": "A twisted hunched figure whose head faces backward guarding the mouth of a dark cave, lit by one guttering candle, wet stone",
    "basilisco": "A pale rooster-headed serpent slithering out from between wooden floorboards inside a dark stilt-house, ember light from a dying brazier",
    "tenten": "Two vast serpents coiling in confrontation, one of earth and forest and one of sea and foam, around a tiny island where villagers climb a hill with torches",
    "brujo": "A warlock in a wide-brimmed hat flying through night sky on a glowing skin cloak spread like wings, over moonlit islets with one lit window far below",
    "cuchivilu": "A pig-snouted serpent breaking through a semicircular stone fish corral on dark tidal flats at low tide, scattered silver fish, moon path on wet mud",
    "fiura": "A tiny wild red-clad hag with long arms crouched on a mossy fallen log in a foggy swamp, surrounded by faint firefly lights, twisted trees",
    "quicavi": "A dark forest of standing stones and twisted trunks, a single cream parchment page nailed to a tree glowing faintly, a tall thin dark figure standing far between the trees barely visible",
    "piuchen": "A winged serpent silhouette diving out of a starry night sky toward a huddle of sheep in a moonlit meadow, a lone shepherd raising a sling",
}

FIURA = {
    "bg0": "Vast night sky over a swamp horizon, huge low moon with halo, thin layered clouds, stars, darkest ink blue, very simple silhouette horizon line at the bottom edge",
    "bg1": "Distant silhouette layer of dead twisted swamp trees and reeds against night sky fog, almost flat dark shapes, bottom third solid black",
    "bg2": "Mid-distance foggy swamp trees with hanging moss, slightly more detail, dark teal-grey silhouettes, bottom quarter solid black",
    "bg3": "Close foreground layer of swamp reeds and grasses and a few firefly glows, dark shapes with subtle rim light, bottom edge solid black",
}


def gen(path, prompt):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return f"skip {os.path.basename(path)}"
    body = json.dumps(
        {"model": "gpt-image-1", "prompt": prompt, "size": "1536x1024", "quality": "medium", "n": 1}
    ).encode()
    for attempt in (1, 2):
        try:
            req = urllib.request.Request(
                "https://api.openai.com/v1/images/generations",
                data=body,
                headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req, timeout=300) as r:
                data = json.load(r)
            b64 = data["data"][0]["b64_json"]
            with open(path, "wb") as f:
                f.write(base64.b64decode(b64))
            return f"ok   {os.path.basename(path)}"
        except Exception as e:  # noqa: BLE001
            err = str(e)
            if attempt == 2:
                return f"FAIL {os.path.basename(path)}: {err[:160]}"
    return None


def main():
    os.makedirs(os.path.join(ROOT, "cards"), exist_ok=True)
    os.makedirs(os.path.join(ROOT, "fiura"), exist_ok=True)
    jobs = [(os.path.join(ROOT, "cards", f"{k}.png"), f"{v} — {STYLE}") for k, v in CARDS.items()]
    jobs += [
        (
            os.path.join(ROOT, "fiura", f"{k}.png"),
            f"{v} — {STYLE}, wide landscape composition for a side-scrolling game background layer",
        )
        for k, v in FIURA.items()
    ]
    with ThreadPoolExecutor(max_workers=4) as ex:
        for result in ex.map(lambda j: gen(*j), jobs):
            print(result, flush=True)
    print("ALL DONE")


if __name__ == "__main__":
    sys.exit(main())
