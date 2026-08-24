#!/usr/bin/env python3
"""
Translates the English source content into Chinese, Malay and Tamil via OpenRouter.

Two kinds of content need machine translation, both too large to hand-write:

  * Station summaries from Wikipedia (175 stations)
  * Infobox facts such as "Underground", "Elevated"

UI strings are NOT translated here — those live in src/i18n/messages/*.json and
are written by hand, because they are few, they carry the app's voice, and a
wrong one is visible on every screen.

Requires OPENROUTER_API_KEY in .env.local or the environment. Results are cached
per (station, locale) in .cache/, so a rerun after a failure resumes rather than
paying for everything again.

Usage:
  python3 scripts/translate_content.py            # translate what is missing
  python3 scripts/translate_content.py --dry-run  # show what would be sent
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TRIVIA = ROOT / "src" / "data" / "trivia.json"
OUT = ROOT / "src" / "data" / "trivia.translated.json"
CACHE = ROOT / ".cache" / "translations.json"

ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"

# Claude via OpenRouter. Override with OPENROUTER_MODEL if you prefer another.
DEFAULT_MODEL = "anthropic/claude-opus-5"

TARGETS = {
    "zh": "Simplified Chinese as written in Singapore",
    "ms": "Malay as written in Singapore (Bahasa Melayu)",
    "ta": "Tamil as written in Singapore",
}

# Small enough that a failure costs little, large enough to amortise overhead.
BATCH_SIZE = 12

SYSTEM_PROMPT = """You translate short factual descriptions of Singapore MRT \
stations for a public transport app.

Rules:
- Translate into {target}.
- Keep station names, line names and place names in their conventional local \
form. Where a well-known local rendering exists, use it; otherwise keep the \
English proper noun rather than inventing a transliteration.
- Keep numbers, dates and units exactly as given.
- Preserve the factual content precisely. Do not add, omit, or embellish.
- Match the register of the original: plain, encyclopaedic, no marketing tone.
- Return ONLY a JSON array of translated strings, in the same order as the \
input array, with the same number of elements. No commentary."""


def load_env() -> None:
    """Reads .env.local so the script works the same way the app does."""
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        sys.exit(
            "OPENROUTER_API_KEY is not set.\n"
            "Add it to .env.local:\n"
            "  OPENROUTER_API_KEY=sk-or-...\n"
            "Get one at https://openrouter.ai/keys"
        )
    return key


def cache_load() -> dict:
    try:
        return json.loads(CACHE.read_text())
    except Exception:  # noqa: BLE001
        return {}


def cache_save(cache: dict) -> None:
    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=2, sort_keys=True))


def translate_batch(texts: list[str], locale: str, model: str) -> list[str] | None:
    """Returns translations in input order, or None if the call failed."""
    body = json.dumps({
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT.format(target=TARGETS[locale])},
            {"role": "user", "content": json.dumps(texts, ensure_ascii=False)},
        ],
        # Deterministic-ish: this is translation, not creative writing.
        "temperature": 0.2,
    }).encode()

    req = urllib.request.Request(
        ENDPOINT,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key()}",
            "Content-Type": "application/json",
            # OpenRouter asks for these for attribution; harmless if unused.
            "HTTP-Referer": "https://github.com/mrt-kiasu",
            "X-Title": "MRT Kiasu",
        },
    )

    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=180) as resp:
                payload = json.loads(resp.read())
            # A refusal or reasoning-only response leaves content null.
            raw = (payload.get("choices") or [{}])[0].get("message", {}).get("content")
            if not raw:
                print(f"    attempt {attempt + 1}: empty response, retrying")
                time.sleep(3 * (attempt + 1))
                continue
            content = raw.strip()
            # Models sometimes wrap JSON in a fenced block.
            content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content)
            out = json.loads(content)
            if not isinstance(out, list) or len(out) != len(texts):
                print(f"    got {len(out) if isinstance(out, list) else '?'} items, "
                      f"expected {len(texts)} — retrying")
                continue
            return [str(x) for x in out]
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", "replace")[:200]
            print(f"    attempt {attempt + 1}: HTTP {exc.code} {detail}")
            if exc.code in (401, 403):
                sys.exit("OpenRouter rejected the key — check OPENROUTER_API_KEY.")
            time.sleep(5 * (attempt + 1))
        except Exception as exc:  # noqa: BLE001
            print(f"    attempt {attempt + 1}: {exc}")
            time.sleep(5 * (attempt + 1))
    return None


def main() -> None:
    load_env()
    dry_run = "--dry-run" in sys.argv
    model = os.environ.get("OPENROUTER_MODEL", DEFAULT_MODEL)

    trivia = json.loads(TRIVIA.read_text())["stations"]
    cache = cache_load()

    # Collect the distinct strings needing translation. Infobox values like
    # "Underground" repeat across dozens of stations, so translating unique
    # strings rather than per-station cuts the work by more than half.
    fields = ("summary", "structure")
    unique: set[str] = set()
    for entry in trivia.values():
        for field in fields:
            value = entry.get(field)
            if value:
                unique.add(value)

    print(f"{len(trivia)} stations, {len(unique)} distinct strings")
    print(f"model: {model}")

    for locale in TARGETS:
        pending = sorted(s for s in unique if f"{locale}|{s}" not in cache)
        print(f"\n{locale}: {len(pending)} to translate, "
              f"{len(unique) - len(pending)} cached")
        if dry_run or not pending:
            continue

        for i in range(0, len(pending), BATCH_SIZE):
            batch = pending[i:i + BATCH_SIZE]
            print(f"  batch {i // BATCH_SIZE + 1}/"
                  f"{(len(pending) + BATCH_SIZE - 1) // BATCH_SIZE} ({len(batch)})")
            result = translate_batch(batch, locale, model)
            if result is None:
                print("    giving up on this batch; rerun to retry")
                continue
            for src, dst in zip(batch, result):
                cache[f"{locale}|{src}"] = dst
            cache_save(cache)
            time.sleep(1)

    if dry_run:
        print("\nDry run — nothing sent.")
        return

    # Reassemble into per-locale, per-station records the app can import.
    out: dict[str, dict] = {}
    missing = 0
    for locale in TARGETS:
        per_station: dict[str, dict] = {}
        for name, entry in trivia.items():
            record = {}
            for field in fields:
                value = entry.get(field)
                if not value:
                    continue
                translated = cache.get(f"{locale}|{value}")
                if translated:
                    record[field] = translated
                else:
                    missing += 1
            if record:
                per_station[name] = record
        out[locale] = per_station

    payload = {
        "_source": {
            "method": f"Machine translation via OpenRouter ({model})",
            "sourceContent": "English Wikipedia summaries and infobox values",
            "caveat": (
                "Machine translated and not reviewed by native speakers. The "
                "English original remains the source of truth; each station page "
                "links to the Wikipedia article it came from."
            ),
            "generatedAt": __import__("datetime").date.today().isoformat(),
        },
        "locales": out,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    print(f"\nWrote {OUT.relative_to(ROOT)}")
    for locale, per_station in out.items():
        print(f"  {locale}: {len(per_station)} stations")
    if missing:
        print(f"  {missing} field(s) still untranslated — rerun to fill")


if __name__ == "__main__":
    main()
