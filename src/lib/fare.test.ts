import { describe, expect, it } from "vitest";
import {
  distanceBetween,
  fareBetween,
  fareForDistance,
  formatDistance,
  formatFare,
  FARE_TYPES,
} from "./fare";
import { stationOf } from "./fare";
import { STATIONS } from "./stations";

/**
 * Fares are the one figure on the page that a commuter can check against the
 * card reader, so these are anchored to journeys whose distance and price LTA
 * itself returned, not to numbers this code produced.
 */

describe("distance between stations", () => {
  it("matches LTA for a journey they priced for us", () => {
    // LTA's fare calculator: Admiralty (NS10) to Ang Mo Kio (NS16),
    // distance 1330 (13.30 km), fare 202 cents.
    expect(distanceBetween("NS10", "NS16")).toBe(1330);
  });

  it("is zero for a station to itself", () => {
    expect(distanceBetween("NS10", "NS10")).toBe(0);
  });

  it("does not charge for crossing an interchange", () => {
    // Marina Bay is NS27, CE2 and TE20 — one station, three codes. Walking
    // between its platforms is not travel.
    expect(distanceBetween("NS27", "CE2")).toBe(0);
    expect(distanceBetween("NS27", "TE20")).toBe(0);
  });

  it("is symmetric", () => {
    // You are charged the same going home as coming.
    expect(distanceBetween("EW4", "NS1")).toBe(distanceBetween("NS1", "EW4"));
  });

  it("does not depend on which code names the station", () => {
    // Marina Bay answers to NS27, CE2 and TE20, and the fare from Admiralty
    // is one journey however the caller spells the destination.
    const viaNs = distanceBetween("NS10", "NS27");
    expect(distanceBetween("NS10", "CE2")).toBe(viaNs);
    expect(distanceBetween("NS10", "TE20")).toBe(viaNs);
  });

  it("returns null for a station we do not know", () => {
    expect(distanceBetween("NS10", "ZZ99")).toBeNull();
  });

  it("knows a distance for every station from every other", () => {
    // A missing pair shows on the page as a blank fare rather than a crash, so
    // nothing else would catch it. This is the check that the import finished.
    const stations = [...new Set(STATIONS.map((s) => stationOf(s.code)!))];
    const missing: string[] = [];
    for (let i = 0; i < stations.length; i++) {
      for (let j = i + 1; j < stations.length; j++) {
        if (distanceBetween(stations[i], stations[j]) === null) {
          missing.push(`${stations[i]}|${stations[j]}`);
        }
      }
    }
    expect({ missing: missing.length, of: (stations.length * (stations.length - 1)) / 2 })
      .toEqual({ missing: 0, of: 16290 });
  });
});

describe("pricing a distance", () => {
  it("prices the band a distance falls in", () => {
    // PTC adult card: up to 3.2 km is $1.28; 13.3-14.2 km is $2.02.
    expect(fareForDistance(320, "adult")).toBe(128);
    expect(fareForDistance(1330, "adult")).toBe(202);
  });

  it("reproduces the fare LTA charged for a real journey", () => {
    // The whole model in one line: our distance, their price.
    expect(fareBetween("NS10", "NS16", "adult")).toEqual({ cents: 202, units: 1330 });
  });

  it("puts the gap between bands in the higher band", () => {
    // Bands read "up to 3.2 km" then "3.3 - 4.2 km", so 3.25 km is named by
    // neither. "Up to" decides it: the first band it does not exceed.
    expect(fareForDistance(325, "adult")).toBe(fareForDistance(330, "adult"));
  });

  it("holds the top band open", () => {
    // 40.2 km exactly is still the "39.3 - 40.2 km" band; it is the metre
    // past it that tips into "over 40.2 km", and everything beyond costs the
    // same however far you go.
    expect(fareForDistance(4020, "adult")).toBe(256);
    expect(fareForDistance(4021, "adult")).toBe(257);
    expect(fareForDistance(99999, "adult")).toBe(257);
  });

  it("never falls as the journey gets longer", () => {
    let previous = 0;
    for (let units = 0; units <= 5000; units += 10) {
      const cents = fareForDistance(units, "adult");
      expect(cents).toBeGreaterThanOrEqual(previous);
      previous = cents;
    }
  });

  it("flattens concession fares above 7.2 km", () => {
    // Student, senior and disabilities tables stop at 7.2 km by design.
    for (const type of ["student", "senior", "disabilities"] as const) {
      // Same boundary reading as the adult top band: 7.2 km is the last
      // banded price, and anything past it is the flat one.
      expect(fareForDistance(721, type)).toBe(fareForDistance(4000, type));
    }
  });

  it("never charges a concession more than an adult", () => {
    for (const type of FARE_TYPES) {
      if (type === "adult") continue;
      for (let units = 0; units <= 4500; units += 250) {
        expect(fareForDistance(units, type)).toBeLessThanOrEqual(fareForDistance(units, "adult"));
      }
    }
  });
});

describe("formatting", () => {
  it("writes money without floating point", () => {
    expect(formatFare(202)).toBe("$2.02");
    expect(formatFare(128)).toBe("$1.28");
    expect(formatFare(100)).toBe("$1.00");
  });

  it("writes distance at the one decimal LTA publishes", () => {
    expect(formatDistance(1330)).toBe("13.3 km");
    expect(formatDistance(40)).toBe("0.4 km");
  });
});
