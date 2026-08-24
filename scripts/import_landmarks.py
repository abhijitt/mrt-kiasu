#!/usr/bin/env python3
"""
Finds the named landmarks nearest each station exit.

There is no official "which exit for which landmark" dataset — LTA publishes
exit codes and coordinates only. But landmark positions and exit positions are
both real data, so the pairing is COMPUTED rather than asserted: for each exit,
the nearest named places within walking distance, sorted by distance.

Landmarks come from OpenStreetMap (ODbL): malls, hospitals, schools, places of
worship, parks, hawker centres, attractions and civic buildings. Exit
coordinates come from LTA via data.gov.sg.

Distances are straight-line, not walking routes, and are shown as such.

Usage: python3 scripts/import_landmarks.py
"""

from __future__ import annotations

import json
import math
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIONS = ROOT / "src" / "data" / "stations.json"
OUT = ROOT / "src" / "data" / "landmarks.json"
CACHE = ROOT / ".cache" / "osm-landmarks.json"

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
UA = {"User-Agent": "mrt-kiasu/0.1 (landmark import)"}

# How far from an exit is still worth mentioning. 350 m was too tight: it hid
# destinations like the MOE campus on Evans Road (~600 m from Botanic Gardens),
# which is exactly the sort of place someone rides there for. Distance is shown
# on every entry, so the reader judges whether it is a walk they want.
MAX_DISTANCE_M = 700
# Stored per STATION, not per exit, deduplicated by name.
#
# Storing a separate top-N for each exit wasted most of the budget on the same
# handful of nearby places repeated under every exit, which pushed genuine
# destinations off the list — the MOE campus on Evans Road (~600 m from Botanic
# Gardens) lost its slot to eight garden features tagged as "attractions".
# One deduplicated list per station, each entry carrying its nearest exit, goes
# much further on the same budget and makes the picker's search useful.
MAX_PER_STATION = 40

# Bounding box beats an area lookup here: the whole-island area query with this
# many tag groups times out on the public Overpass instances.
BBOX = "1.20,103.59,1.48,104.10"

# Split into small batches — one big union query exceeds the 180 s limit.
TAG_BATCHES = [
    [("shop", "mall"), ("amenity", "marketplace"), ("amenity", "food_court")],
    [("amenity", "hospital"), ("amenity", "clinic"), ("amenity", "library")],
    [("amenity", "community_centre"), ("amenity", "theatre"), ("amenity", "cinema")],
    [("amenity", "university"), ("amenity", "college"), ("amenity", "school")],
    [("tourism", "attraction"), ("tourism", "museum"), ("tourism", "hotel")],
    [("leisure", "stadium"), ("leisure", "sports_centre"), ("leisure", "park")],
    [("amenity", "place_of_worship"), ("amenity", "courthouse"), ("amenity", "police")],
    [("office", "government"), ("amenity", "townhall"), ("amenity", "embassy")],
]


def batch_query(tags: list[tuple[str, str]]) -> str:
    clauses = "\n  ".join(
        f'nwr["{k}"="{v}"]["name"]({BBOX});' for k, v in tags
    )
    return f"[out:json][timeout:170];\n(\n  {clauses}\n);\nout tags center;"

# Category KEYS, not labels: the UI translates these, so no English leaks into
# generated data. Each must have a matching landmark.<key> message.
KIND_KEYS = [
    (("shop", "mall"), "mall"),
    (("amenity", "clinic"), "clinic"),
    (("amenity", "theatre"), "theatre"),
    (("amenity", "cinema"), "cinema"),
    (("tourism", "hotel"), "hotel"),
    (("leisure", "sports_centre"), "sports"),
    (("amenity", "courthouse"), "courthouse"),
    (("amenity", "police"), "police"),
    (("office", "government"), "government"),
    (("amenity", "townhall"), "government"),
    (("amenity", "embassy"), "embassy"),
    (("amenity", "hospital"), "hospital"),
    (("amenity", "place_of_worship"), "worship"),
    (("amenity", "marketplace"), "market"),
    (("amenity", "food_court"), "hawker"),
    (("amenity", "community_centre"), "communityClub"),
    (("amenity", "library"), "library"),
    (("amenity", "university"), "university"),
    (("amenity", "college"), "college"),
    (("amenity", "school"), "school"),
    (("tourism", "attraction"), "attraction"),
    (("tourism", "museum"), "museum"),
    (("leisure", "park"), "park"),
    (("leisure", "stadium"), "stadium"),
]


def run_query(query: str) -> list:
    body = urllib.parse.urlencode({"data": query}).encode()
    last = None
    for endpoint in ENDPOINTS:
        for attempt in range(3):
            try:
                req = urllib.request.Request(endpoint, body, headers=UA)
                payload = json.loads(urllib.request.urlopen(req, timeout=300).read())
                if payload.get("remark", "").startswith("runtime error"):
                    raise RuntimeError(payload["remark"])
                return payload.get("elements", [])
            except Exception as exc:  # noqa: BLE001
                last = exc
                print(f"    {endpoint.split('/')[2]} attempt {attempt + 1}: {exc}")
                time.sleep(8)
    raise SystemExit(f"Overpass unavailable: {last}")


def fetch_landmarks() -> list:
    if CACHE.exists():
        print("Using cached Overpass response.")
        return json.loads(CACHE.read_text())

    elements = []
    for i, batch in enumerate(TAG_BATCHES, 1):
        names = ", ".join(f"{k}={v}" for k, v in batch)
        print(f"  batch {i}/{len(TAG_BATCHES)}: {names}")
        got = run_query(batch_query(batch))
        print(f"    {len(got)} elements")
        elements.extend(got)
        time.sleep(3)

    CACHE.parent.mkdir(exist_ok=True)
    CACHE.write_text(json.dumps(elements))
    return elements


# Words too common in Singapore place names to be worth indexing on their own.
_STOPWORDS = {"the", "of", "and", "at", "in", "singapore", "pte", "ltd", "club"}


def acronyms(text: str) -> list[str]:
    """
    Acronym forms for a name, so searching one works.

    Emits both the full-initials form and the form without linking words,
    because local usage keeps them inconsistently: MOE is Ministry *Of*
    Education, while NUS drops nothing. Generating both costs a few bytes and
    avoids guessing which convention a given name follows.
    """
    words = [w for w in re.split(r"[^A-Za-z]+", text) if w]
    if len(words) < 2:
        return []
    full = "".join(w[0] for w in words).lower()
    trimmed = "".join(
        w[0] for w in words if w.lower() not in {"of", "the", "and", "for"}
    ).lower()
    return [a for a in {full, trimmed} if len(a) >= 2]


def search_terms(tags: dict, name: str) -> tuple[str, str]:
    """
    Returns (street, extra search terms).

    People search for what they know: a street ("evans"), an acronym ("moe"),
    or an operator — not always the official name. OSM carries all three, so
    they are indexed alongside the name. Words already in the name are dropped
    to keep the file small.
    """
    street = (tags.get("addr:street") or "").strip()

    candidates = [
        tags.get("operator", ""),
        tags.get("alt_name", ""),
        tags.get("short_name", ""),
        tags.get("official_name", ""),
        tags.get("loc_name", ""),
        street,
        *acronyms(name),
        *acronyms(tags.get("operator", "")),
    ]

    in_name = {w.lower() for w in re.split(r"[^A-Za-z0-9]+", name) if w}
    words: list[str] = []
    for c in candidates:
        for w in re.split(r"[^A-Za-z0-9]+", c or ""):
            wl = w.lower()
            if not wl or wl in in_name or wl in _STOPWORDS or wl in words:
                continue
            words.append(wl)
    return street, " ".join(words)


def kind_of(tags: dict) -> str | None:
    for (k, v), key in KIND_KEYS:
        if tags.get(k) == v:
            return key
    return None


def metres(lat1, lng1, lat2, lng2) -> float:
    r = 6371000.0
    p = math.radians((lat1 + lat2) / 2)
    dx = math.radians(lng2 - lng1) * r * math.cos(p)
    dy = math.radians(lat2 - lat1) * r
    return math.hypot(dx, dy)


def main() -> None:
    elements = fetch_landmarks()
    places = []
    for el in elements:
        tags = el.get("tags", {})
        name = tags.get("name")
        kind = kind_of(tags)
        if not name or not kind:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lng = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        street, terms = search_terms(tags, name)
        places.append({
            "name": name, "kind": kind, "lat": lat, "lng": lng,
            "street": street, "terms": terms,
        })
    print(f"{len(places)} named landmarks")

    # Coarse spatial index so we don't compare every exit to every landmark.
    # The cell must be at least MAX_DISTANCE_M across, or a ±1-cell scan can
    # miss landmarks near the edge of the radius — which is exactly what hid
    # the MOE campus at ~610 m when the radius was raised to 700 m.
    CELL = max(0.005, (MAX_DISTANCE_M / 111_000) * 1.1)
    grid: dict[tuple[int, int], list] = {}
    for p in places:
        grid.setdefault((int(p["lat"] / CELL), int(p["lng"] / CELL)), []).append(p)

    stations = json.loads(STATIONS.read_text())["stations"]
    result: dict[str, list] = {}
    total = 0

    for s_ in stations:
        exits = s_.get("exits", [])
        if not exits:
            continue

        # For each landmark, remember only its closest exit at this station.
        best: dict[tuple[str, str], dict] = {}
        for ex in exits:
            gy, gx = int(ex["lat"] / CELL), int(ex["lng"] / CELL)
            nearby = []
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    nearby.extend(grid.get((gy + dy, gx + dx), []))

            for p in nearby:
                d = metres(ex["lat"], ex["lng"], p["lat"], p["lng"])
                if d > MAX_DISTANCE_M:
                    continue
                key = (p["name"], p["kind"])
                if key not in best or d < best[key]["metres"]:
                    entry = {
                        "name": p["name"],
                        "kind": p["kind"],
                        "exit": ex["code"],
                        "metres": round(d),
                    }
                    # Omit empty fields rather than store blanks 5,900 times.
                    if p["street"]:
                        entry["street"] = p["street"]
                    if p["terms"]:
                        entry["terms"] = p["terms"]
                    best[key] = entry

        items = sorted(best.values(), key=lambda x: x["metres"])[:MAX_PER_STATION]
        if items:
            result[s_["code"]] = items
            total += len(items)

    out = {
        "_source": {
            "landmarks": "OpenStreetMap via Overpass API, ODbL licence",
            "exits": "LTA MRT Station Exit via data.gov.sg",
            "method": (
                f"Computed: straight-line distance from each exit to named OSM places "
                f"within {MAX_DISTANCE_M} m, deduplicated per station with each landmark "
                f"keeping its nearest exit. No official exit-to-landmark dataset exists."
            ),
            "caveat": "Straight-line distances, not walking routes.",
            "importedAt": __import__("datetime").date.today().isoformat(),
        },
        "stations": result,
    }
    OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote landmarks for {len(result)} stations ({total} landmarks)")


if __name__ == "__main__":
    main()
