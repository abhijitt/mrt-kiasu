#!/usr/bin/env python3
"""
Produces ESTIMATED door positions for every exit at every MRT station.

These are explicitly weaker than surveyed data and are labelled as estimates
everywhere they surface. The derivation uses only real coordinates — nothing
is invented — but it rests on three stated assumptions, any of which can be
wrong at a given station:

  1. The platform runs along the line's local bearing, taken from the vector
     between the neighbouring stations' coordinates.
  2. The train berths centred on the mean of the station's exit coordinates.
     This is the weakest link: exits are often distributed asymmetrically, and
     no public dataset gives platform centres or berthing positions.
  3. The way up to an exit sits near where that exit surfaces. True for shallow
     stations, less so for deep ones with long passages.

Estimates are typed "exit", not "escalator": the method locates where an exit
reaches the surface and cannot tell an escalator from a lift or stairs. Only a
field survey can do that, which is why a commuter's escalator/lift/stairs
preference can only be honoured where surveyed data exists.

Car lengths are sourced: 23.65 m driving cars, 22.8 m intermediate cars, from
the Wikipedia rolling-stock infoboxes for the C151, C751A, C830, C951 and T251
fleets, which agree across every line.

Usage: python3 scripts/estimate_positions.py
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATIONS = ROOT / "src" / "data" / "stations.json"
OUT = ROOT / "src" / "data" / "estimates.json"

DRIVING_CAR_M = 23.65
INTERMEDIATE_CAR_M = 22.8
CAR_LENGTH_SOURCE = (
    "Wikipedia rolling-stock infoboxes (C151, C751A, C830, C951, T251): "
    "23.65 m driving cars, 22.8 m intermediate cars"
)

# Lines with sourced fleet geometry. LRT lines are absent on purpose.
TRAINS = {
    "NSL": (6, 4), "EWL": (6, 4), "NEL": (6, 4),
    "CCL": (3, 4), "DTL": (3, 4), "TEL": (4, 5),
}

EARTH_R = 6371000.0


def train_length(cars: int) -> float:
    return 2 * DRIVING_CAR_M + (cars - 2) * INTERMEDIATE_CAR_M


def to_xy(lat: float, lng: float, lat0: float, lng0: float) -> tuple[float, float]:
    """Local flat projection in metres, good enough over a station's extent."""
    x = math.radians(lng - lng0) * EARTH_R * math.cos(math.radians(lat0))
    y = math.radians(lat - lat0) * EARTH_R
    return x, y


def split_code(code: str) -> tuple[str, int]:
    m = re.match(r"^([A-Z]+)(\d*)$", code.upper())
    if not m:
        return code.upper(), 0
    return m.group(1), int(m.group(2) or 0)


def main() -> None:
    data = json.loads(STATIONS.read_text())
    stations = data["stations"]
    by_code = {s["code"]: s for s in stations}

    def centre(station) -> tuple[float, float] | None:
        exits = station.get("exits") or []
        if not exits:
            return None
        return (
            sum(e["lat"] for e in exits) / len(exits),
            sum(e["lng"] for e in exits) / len(exits),
        )

    # Order stations within each code prefix so we can find neighbours.
    order: dict[str, list[str]] = {}
    for s in stations:
        prefix, _ = split_code(s["code"])
        order.setdefault(prefix, []).append(s["code"])
    for prefix in order:
        order[prefix].sort(key=lambda c: split_code(c)[1])

    results: dict[str, list[dict]] = {}
    skipped: list[str] = []

    for s in stations:
        line = s["line"]
        if line not in TRAINS:
            continue
        cars, doors_per_car = TRAINS[line]
        total_doors = cars * doors_per_car
        length = train_length(cars)

        here = centre(s)
        if here is None:
            skipped.append(f"{s['code']} (no exits)")
            continue

        prefix, num = split_code(s["code"])
        seq = order[prefix]
        idx = seq.index(s["code"])

        # Local bearing of the line, pointing from lower codes toward higher.
        before = next(
            (centre(by_code[c]) for c in reversed(seq[:idx]) if centre(by_code[c])), None
        )
        after = next(
            (centre(by_code[c]) for c in seq[idx + 1:] if centre(by_code[c])), None
        )
        if before and after:
            ax, ay = to_xy(after[0], after[1], before[0], before[1])
        elif after:
            ax, ay = to_xy(after[0], after[1], here[0], here[1])
        elif before:
            ax, ay = to_xy(here[0], here[1], before[0], before[1])
        else:
            skipped.append(f"{s['code']} (no neighbours)")
            continue

        norm = math.hypot(ax, ay)
        if norm < 1e-6:
            skipped.append(f"{s['code']} (degenerate bearing)")
            continue
        ax, ay = ax / norm, ay / norm

        # Door offsets from the train centre, assuming even spacing.
        door_offsets = [
            ((i + 0.5) / total_doors - 0.5) * length for i in range(total_doors)
        ]

        features = []
        for exit_ in s["exits"]:
            ex, ey = to_xy(exit_["lat"], exit_["lng"], here[0], here[1])
            along = ex * ax + ey * ay  # signed metres toward higher codes
            # doorIndex counts from the reference (lower-code) end.
            best = min(range(total_doors), key=lambda i: abs(door_offsets[i] - along))
            features.append({
                "type": "exit",
                "doorIndex": best + 1,
                "leadsTo": [exit_["code"]],
                "source": "estimate",
                "confidence": "estimate",
                "sourceNote": (
                    f"Estimated: Exit {exit_['code']} projected {along:.0f} m along the "
                    f"line bearing from the station's exit centroid"
                ),
                "offsetM": round(along, 1),
            })

        # Both platform faces get the same estimate: the exit is in one physical
        # place, and doorIndex is measured from a fixed end either way.
        for direction in ("asc", "desc"):
            results[f"{s['code']}:{direction}"] = features

    payload = {
        "_source": {
            "method": "Derived from LTA exit coordinates projected onto the line's local bearing",
            "carLengths": CAR_LENGTH_SOURCE,
            "assumptions": [
                "Platform runs along the bearing between neighbouring stations.",
                "Train berths centred on the mean of the station's exit coordinates.",
                "The escalator serving an exit is near where that exit surfaces.",
            ],
            "warning": (
                "These are estimates, not observations. They are labelled as such in "
                "the UI and must be replaced by field surveys before being trusted."
            ),
            "generatedAt": __import__("datetime").date.today().isoformat(),
        },
        "platforms": results,
    }
    OUT.write_text(json.dumps(payload, indent=2) + "\n")

    total = sum(len(v) for v in results.values()) // 2
    print(f"Wrote estimates for {len(results) // 2} stations ({total} exit positions)")
    if skipped:
        print(f"  skipped {len(skipped)}: {', '.join(skipped[:8])}"
              + (" …" if len(skipped) > 8 else ""))


if __name__ == "__main__":
    main()
