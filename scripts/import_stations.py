#!/usr/bin/env python3
"""
Builds the full station dataset for every operational MRT and LRT station.

Sources (all public, all cited in the output file):
  * Station codes, English and Chinese names, line
      LTA DataMall "Train Station Codes and Chinese Names"
      https://datamall.lta.gov.sg/content/datamall/en/static-data.html
  * Opening dates
      Wikidata P1619, keyed by official station code P296, with per-station
      Wikipedia infoboxes filling the stations Wikidata does not cover.
  * Coordinates
      Derived from the LTA exit dataset already imported into exits.json.

Interchanges are DERIVED, not asserted: a station name carrying more than one
official code is by definition an interchange between those codes' lines.

Codes come from LTA rather than Wikipedia because the two disagree on the
Circle Line Extension, retired when Stage 6 closed the loop (LTA's code file
still says CE1/CE2 where signage and GTFS now say CC34/CC33), so
dates fall back to a name match for those.

Usage: python3 scripts/import_stations.py
"""

from __future__ import annotations

import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "stations.json"
EXITS = ROOT / "src" / "data" / "exits.json"

CODES_URL = (
    "https://datamall.lta.gov.sg/content/dam/datamall/datasets/Geospatial/"
    "Train%20Station%20Codes%20and%20Chinese%20Names.zip"
)
CODES_SOURCE = "https://datamall.lta.gov.sg/content/datamall/en/static-data.html"
UA = {"User-Agent": "mrt-kiasu/0.1 (station data import)"}

# Maps the line names in LTA's spreadsheet to our internal line codes.
LINE_CODES = {
    "North-South Line": "NSL",
    "East-West Line": "EWL",
    "Changi Airport Branch Line": "EWL",
    "North East Line": "NEL",
    "Circle Line": "CCL",
    # Retired when Stage 6 closed the loop; LTA's code file still uses it.
    "Circle Line Extension": "CCL",
    "Downtown Line": "DTL",
    "Thomson-East Coast Line": "TEL",
    "Bukit Panjang LRT": "BPLRT",
    "Sengkang LRT": "SKLRT",
    "Punggol LRT": "PGLRT",
}


# LTA's station-code file has not caught up with Circle Line Stage 6.
#
# It still numbers the extension CE1/CE2 and has no row at all for the three
# stations that opened on 2026-07-12, while station signage, LTA's own GTFS
# feed and Wikidata all use the closed-loop numbering. Left alone, re-running
# this script silently reverts the Circle Line to its pre-Stage-6 shape — the
# codes, the loop, and the three stations all disappear.
#
# Applied to LTA's rows before anything downstream reads them, so opening
# dates, exits and interchanges all resolve against the codes on the walls.
# Drop each entry once LTA publishes it.
STAGE6_RENAMES = {"CE1": "CC34", "CE2": "CC33"}

# Codes, names and coordinates from LTA GTFS Schedule (Train) stops.txt;
# opening date from Wikidata P1619. Not in LTA's exit dataset, so they carry
# no exits and the loop below marks them gap.noExitData accordingly.
STAGE6_ADDITIONS = [
    {"code": "CC30", "name": "Keppel", "nameZh": "吉宝",
     "coord": {"lat": 1.27009, "lng": 103.8304}},
    {"code": "CC31", "name": "Cantonment", "nameZh": "广东民",
     "coord": {"lat": 1.27294, "lng": 103.83663}},
    {"code": "CC32", "name": "Prince Edward Road", "nameZh": "爱德华太子路",
     "coord": {"lat": 1.27327, "lng": 103.84749}},
]


def apply_stage6(stations: list[dict]) -> list[dict]:
    """Brings LTA's rows up to the numbering now in service. See above."""
    for s in stations:
        new = STAGE6_RENAMES.get(s["code"].upper())
        if new:
            print(f"  stage 6: {s['code']} -> {new} ({s['name']})")
            s["code"] = new
            s["lineName"] = "Circle Line"
    have = {s["code"].upper() for s in stations}
    for extra in STAGE6_ADDITIONS:
        if extra["code"] in have:
            print(f"  stage 6: LTA now publishes {extra['code']} — dropping ours")
            continue
        stations.append({**extra, "line": "CCL", "lineName": "Circle Line"})
        print(f"  stage 6: added {extra['code']} {extra['name']}")
    return stations


def fetch(url: str) -> bytes:
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180).read()


def normalise_name(name: str) -> str:
    """Strips Wikipedia's interchange/terminus markers and normalises case."""
    cleaned = re.sub(r"[*‡^†]", "", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return cleaned


def key(name: str) -> str:
    return normalise_name(name).lower()


def load_lta_codes() -> list[dict]:
    print("Downloading LTA station codes…")
    try:
        import xlrd  # noqa: PLC0415
    except ImportError:
        sys.exit("This script needs xlrd: python3 -m pip install --user xlrd")

    blob = fetch(CODES_URL)
    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        xls_name = next(n for n in zf.namelist() if n.lower().endswith(".xls"))
        xls = zf.read(xls_name)

    book = xlrd.open_workbook(file_contents=xls)
    sheet = book.sheet_by_index(0)

    stations = []
    for r in range(1, sheet.nrows):
        code, en, zh, line_en, _ = (str(sheet.cell_value(r, c)).strip() for c in range(5))
        if not code or not en:
            continue
        line_en = re.sub(r"\s+", " ", line_en).strip()
        line = LINE_CODES.get(line_en)
        if line is None:
            print(f"  ! unknown line {line_en!r} for {code}; skipping")
            continue
        stations.append(
            {"code": code, "name": normalise_name(en), "nameZh": zh, "line": line,
             "lineName": line_en}
        )
    print(f"  {len(stations)} stations")
    return stations


WIKIDATA_SPARQL = "https://query.wikidata.org/sparql"

WIKIDATA_QUERY = """
SELECT ?code ?stationLabel ?opened WHERE {
  ?station wdt:P17 wd:Q334 ;
           wdt:P296 ?code .
  OPTIONAL { ?station wdt:P1619 ?opened . }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def load_wikidata() -> tuple[dict[str, str], dict[str, str]]:
    """
    Returns (by_code, by_name) maps of station code / name -> ISO opening date.

    Wikidata is used instead of scraping Wikipedia's HTML tables: those group
    stations with rowspan, and reconstructing the grid silently shifted dates
    between stations. Wikidata keys on the official station code (P296), so
    there is nothing to misalign.

    Note these are STATION opening dates, not per-platform. An interchange's
    later platforms carry the station's original date, which is why the UI
    labels this "station first opened".
    """
    print("Fetching opening dates from Wikidata…")
    url = WIKIDATA_SPARQL + "?" + urllib.parse.urlencode(
        {"query": WIKIDATA_QUERY, "format": "json"}
    )
    req = urllib.request.Request(
        url, headers={**UA, "Accept": "application/sparql-results+json"}
    )

    # The query service rate-limits hard during outages, and this data changes
    # a few times a year at most, so a local cache keeps re-runs cheap.
    cache = ROOT / ".cache" / "wikidata-stations.json"
    payload = None
    for attempt in range(5):
        try:
            payload = json.loads(urllib.request.urlopen(req, timeout=180).read())
            cache.parent.mkdir(exist_ok=True)
            cache.write_text(json.dumps(payload))
            break
        except Exception as exc:  # noqa: BLE001
            print(f"  attempt {attempt + 1}: {exc}")
            if attempt < 4:
                time.sleep(65)
    if payload is None:
        if cache.exists():
            print("  using cached Wikidata response")
            payload = json.loads(cache.read_text())
        else:
            sys.exit("Wikidata unavailable and no cache to fall back on.")

    by_code: dict[str, str] = {}
    by_name: dict[str, str] = {}
    for row in payload["results"]["bindings"]:
        if "opened" not in row:
            continue
        iso = row["opened"]["value"][:10]
        code = row["code"]["value"].strip().upper()
        by_code[code] = iso
        label = re.sub(r"\s+(MRT|LRT|MRT/LRT)\s+station$", "", row["stationLabel"]["value"], flags=re.I)
        name = key(label)
        if name not in by_name or iso < by_name[name]:
            by_name[name] = iso
    print(f"  {len(by_code)} codes, {len(by_name)} names")
    return by_code, by_name


MONTHS = {m: i + 1 for i, m in enumerate(
    ["january", "february", "march", "april", "may", "june", "july",
     "august", "september", "october", "november", "december"])}


_WIKI_CACHE_PATH = ROOT / ".cache" / "wikipedia-opened.json"
_wiki_cache: dict[str, str] | None = None


def _wiki_cache_load() -> dict[str, str]:
    global _wiki_cache
    if _wiki_cache is None:
        try:
            _wiki_cache = json.loads(_WIKI_CACHE_PATH.read_text())
        except Exception:  # noqa: BLE001
            _wiki_cache = {}
    return _wiki_cache


def _wiki_cache_save(name: str, iso: str) -> None:
    cache = _wiki_cache_load()
    cache[name] = iso
    _WIKI_CACHE_PATH.parent.mkdir(exist_ok=True)
    _WIKI_CACHE_PATH.write_text(json.dumps(cache, indent=2, sort_keys=True))


def opening_date_from_wikipedia(name: str, kind: str) -> str | None:
    """
    Reads one station's opening date from its Wikipedia infobox.

    Used only to fill gaps Wikidata does not cover (several TEL stage 4/5 and
    DTL stations). Reading a single article's infobox is unambiguous, unlike
    parsing the rowspan-laden system-wide tables.
    """
    cached = _wiki_cache_load().get(name)
    if cached:
        return cached

    titles = [f"{name} {kind} station", f"{name} MRT/LRT station", f"{name} station"]
    for title in titles:
        url = (
            "https://en.wikipedia.org/w/api.php?action=parse&page="
            + urllib.parse.quote(title.replace(" ", "_"))
            + "&prop=wikitext&format=json&formatversion=2"
        )
        payload = None
        for attempt in range(4):
            try:
                payload = json.loads(fetch(url))
                break
            except Exception as exc:  # noqa: BLE001
                # Wikipedia rate-limits bursts; back off rather than silently
                # dropping the station, which would look like a parsing failure.
                if "429" in str(exc):
                    time.sleep(5 * (attempt + 1))
                    continue
                break
        if payload is None or "parse" not in payload:
            continue
        time.sleep(1.0)  # stay polite across the ~26 gap-filling lookups
        wikitext = payload["parse"]["wikitext"]
        # Capture to end of line: the value is usually a {{Start date}} template
        # whose own pipes would otherwise truncate the match.
        m = re.search(r"\|\s*opened\s*=\s*([^\n]+)", wikitext, re.I)
        if not m:
            continue
        value = m.group(1)
        # {{Start date and age|df=yes|2024|06|23}}
        d = re.search(r"\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", value)
        if d:
            iso = f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}"
            _wiki_cache_save(name, iso)
            return iso
        # Plain prose: "23 June 2024"
        plain = re.sub(r"<[^>]+>|\{\{|\}\}|\[\[|\]\]", " ", value)
        d = re.search(r"\b(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\b", plain)
        if d and d.group(2).lower() in MONTHS:
            iso = f"{d.group(3)}-{MONTHS[d.group(2).lower()]:02d}-{int(d.group(1)):02d}"
            _wiki_cache_save(name, iso)
            return iso
    return None


def main() -> None:
    lta = apply_stage6(load_lta_codes())
    dates_by_code, dates_by_name = load_wikidata()

    exits_payload = json.loads(EXITS.read_text())
    exits_by_name: dict[str, list] = {}
    for entry in exits_payload["stations"]:
        exits_by_name.setdefault(key(entry["station"]), []).extend(entry["exits"])

    # A name carrying several codes is an interchange between those lines.
    codes_by_name: dict[str, list[dict]] = {}
    for s in lta:
        codes_by_name.setdefault(key(s["name"]), []).append(s)

    out = []
    missing_dates, missing_exits = [], []

    for s in lta:
        name_key = key(s["name"])
        interchanges = [
            {"code": o["code"], "line": o["line"]}
            for o in codes_by_name[name_key]
            if o["code"] != s["code"]
        ]
        station_exits = exits_by_name.get(name_key, [])
        # Match on the official code first; fall back to the station name for
        # codes where Wikidata and LTA's code file disagree (its CE1/CE2 vs
        # the CC33/CC34 now on the signs).
        opened = dates_by_code.get(s["code"].upper()) or dates_by_name.get(name_key)
        if not opened:
            kind = "LRT" if s["line"].endswith("LRT") else "MRT"
            opened = opening_date_from_wikipedia(s["name"], kind)
            if opened:
                dates_by_name[name_key] = opened
                print(f"  filled {s['code']} {s['name']} from Wikipedia infobox: {opened}")

        gaps = []
        if not opened:
            missing_dates.append(s["code"])
        if not station_exits:
            missing_exits.append(s["code"])
            # A code, not a sentence: the UI translates it.
            gaps.append("gap.noExitData")

        record = {
            "code": s["code"],
            "name": s["name"],
            "nameZh": s["nameZh"],
            "line": s["line"],
            "lineName": s["lineName"],
            "opened": opened,
            # A station with no exits to average has no centre; the GTFS stop
            # coordinate is what puts it on the map at all.
            **({"coord": s["coord"]} if s.get("coord") and not station_exits else {}),
            "interchanges": interchanges,
            "exits": sorted(
                {e["code"]: e for e in station_exits}.values(),
                key=lambda e: (len(e["code"]), e["code"]),
            ),
            "dataGaps": gaps,
        }
        out.append(record)

    out.sort(key=lambda s: (s["line"], len(s["code"]), s["code"]))

    payload = {
        "_source": {
            "codes": CODES_SOURCE,
            "codesDataset": "LTA Train Station Codes and Chinese Names",
            "openingDates": (
                "Wikidata (P1619, keyed by P296 station code), with per-station "
                "Wikipedia infoboxes filling the stations Wikidata does not cover"
            ),
            "openingDatesNote": (
                "These are station opening dates, not per-platform. At an interchange the "
                "later line's platforms carry the station's original date."
            ),
            "coordinates": "Derived from exits.json (LTA MRT Station Exit, data.gov.sg)",
            "interchanges": "Derived: a station name with more than one official code.",
            "note": (
                "Codes follow LTA signage. The Circle Line Extension was renumbered into "
                "the closed loop when Stage 6 opened: CE1 and CE2 are now CC34 and CC33. "
                "LTA's own station code file still lists the old codes and omits CC30-CC32 "
                "entirely, so those three come from LTA's GTFS Schedule (Train) feed, which "
                "carries the current numbering, with opening dates and Chinese names from "
                "Wikidata."
            ),
            "stage6": (
                "CC30 Keppel, CC31 Cantonment and CC32 Prince Edward Road: names and codes "
                "from LTA GTFS stops.txt; opened 2026-07-12 per Wikidata (P1619). Not in "
                "LTA's station exit dataset, so they carry no exits, like Punggol Coast and "
                "Hume. Applied by apply_stage6() in scripts/import_stations.py."
            ),
            "coord": (
                "Only present where LTA's station exit dataset has no entry yet, so the map "
                "has somewhere to draw the station: the stop coordinate from LTA GTFS "
                "Schedule (Train). Everywhere else the map uses the mean of the real exits."
            ),
            "exitSupplement": (
                "An exit carrying a \"source\" field is not in LTA's exit dataset and was "
                "added from the sources recorded under _source.supplement in exits.json."
            ),
            "importedAt": __import__("datetime").date.today().isoformat(),
        },
        "stations": out,
    }

    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")

    print(f"\nWrote {len(out)} stations to {OUT.relative_to(ROOT)}")
    if missing_dates:
        print(f"  no opening date ({len(missing_dates)}): {', '.join(missing_dates[:12])}"
              + (" …" if len(missing_dates) > 12 else ""))
    if missing_exits:
        print(f"  no exit data ({len(missing_exits)}): {', '.join(missing_exits[:12])}"
              + (" …" if len(missing_exits) > 12 else ""))


if __name__ == "__main__":
    main()
