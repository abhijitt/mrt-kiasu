#!/usr/bin/env python3
"""
Collects per-station trivia from Wikipedia.

Two things per station, both quoted from a citable source rather than written
by us:
  * the lead summary, which usually covers what the station serves and the
    neighbourhood around it;
  * selected infobox facts (depth, platform count, structure type).

Results are cached per station so re-runs are cheap and converge if Wikipedia
rate-limits a burst.

Usage: python3 scripts/import_trivia.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIONS = ROOT / "src" / "data" / "stations.json"
OUT = ROOT / "src" / "data" / "trivia.json"
CACHE = ROOT / ".cache" / "wikipedia-trivia.json"

UA = {"User-Agent": "mrt-kiasu/0.1 (station trivia import)"}


def fetch_json(url: str) -> dict | None:
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=UA)
            return json.loads(urllib.request.urlopen(req, timeout=60).read())
        except Exception as exc:  # noqa: BLE001
            if "429" in str(exc):
                time.sleep(5 * (attempt + 1))
                continue
            return None
    return None


def clean(text: str) -> str:
    text = re.sub(r"\([^)]*\)", "", text)          # pronunciation glosses
    text = re.sub(r"\s+", " ", text).strip()
    return text


def first_sentences(text: str, count: int = 2) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text)
    return " ".join(parts[:count]).strip()


def infobox_facts(title: str) -> dict[str, str]:
    url = (
        "https://en.wikipedia.org/w/api.php?action=parse&page="
        + urllib.parse.quote(title.replace(" ", "_"))
        + "&prop=wikitext&format=json&formatversion=2"
    )
    payload = fetch_json(url)
    if not payload or "parse" not in payload:
        return {}
    wt = payload["parse"]["wikitext"]

    facts: dict[str, str] = {}

    depth = re.search(r"\|\s*depth\s*=\s*([^\n]+)", wt, re.I)
    if depth:
        m = re.search(r"(\d+(?:\.\d+)?)\s*\|?\s*m\b", depth.group(1))
        if m:
            facts["depth"] = f"{m.group(1)} m below ground"

    platforms = re.search(r"\|\s*platform(?:s)?\s*=\s*([^\n|]+)", wt, re.I)
    if platforms:
        val = re.sub(r"\{\{|\}\}|\[\[|\]\]|<[^>]+>", " ", platforms.group(1)).strip()
        if re.fullmatch(r"\d+", val):
            facts["platforms"] = val

    structure = re.search(r"\|\s*structure\s*=\s*([^\n|]+)", wt, re.I)
    if structure:
        val = re.sub(r"\{\{|\}\}|\[\[|\]\]|<[^>]+>", " ", structure.group(1)).strip()
        if val and len(val) < 40:
            facts["structure"] = val

    return facts


def main() -> None:
    stations = json.loads(STATIONS.read_text())["stations"]
    try:
        cache = json.loads(CACHE.read_text())
    except Exception:  # noqa: BLE001
        cache = {}

    names_done = 0
    for s in stations:
        name = s["name"]
        if name in cache:
            continue

        kind = "LRT" if s["line"].endswith("LRT") else "MRT"
        for title in (f"{name} {kind} station", f"{name} MRT/LRT station", f"{name} station"):
            summary_url = (
                "https://en.wikipedia.org/api/rest_v1/page/summary/"
                + urllib.parse.quote(title.replace(" ", "_"))
            )
            payload = fetch_json(summary_url)
            if not payload or payload.get("type", "").endswith("not_found"):
                continue
            extract = clean(payload.get("extract", ""))
            if not extract:
                continue

            entry = {
                "summary": first_sentences(extract, 2),
                "url": payload.get("content_urls", {})
                .get("desktop", {})
                .get("page", f"https://en.wikipedia.org/wiki/{title.replace(' ', '_')}"),
                "title": title,
            }
            entry.update(infobox_facts(title))
            cache[name] = entry
            names_done += 1
            print(f"  {s['code']:<6} {name}: {entry['summary'][:70]}…")
            break
        else:
            print(f"  {s['code']:<6} {name}: no article found")
            cache[name] = {}

        CACHE.parent.mkdir(exist_ok=True)
        CACHE.write_text(json.dumps(cache, indent=2, ensure_ascii=False))
        time.sleep(0.6)

    payload = {
        "_source": {
            "summaries": "English Wikipedia page summaries (REST API)",
            "facts": "English Wikipedia infobox fields (depth, platforms, structure)",
            "note": "Every entry links to the article it came from; nothing is paraphrased by us.",
            "importedAt": __import__("datetime").date.today().isoformat(),
        },
        "stations": {k: v for k, v in sorted(cache.items()) if v},
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    print(f"\nWrote trivia for {len(payload['stations'])} stations ({names_done} new)")


if __name__ == "__main__":
    main()
