import { describe, expect, it, vi } from "vitest";

// The module is server-only; stub the guard so it can be imported under test.
vi.mock("server-only", () => ({}));

const { VOLUME_MONTH, roundedVolume, volumesFor } = await import("./volumes");
const { STATIONS } = await import("./stations");

/**
 * How many people pass through a station, and how honestly to say it.
 *
 * LTA publishes monthly totals, so the daily figure is derived rather than
 * read off — and the divisor is the number of weekdays in the month with the
 * public holidays taken out, which only became knowable once MOM's list was
 * imported. Before that this feature would have been wrong by about 5% every
 * month with a holiday in it.
 */
describe("station tap volumes", () => {
  it("covers every station", () => {
    // LTA publishes an interchange once under a joined code — "EW8/CC9" — so
    // a station missing here means the split-and-match went wrong, not that
    // LTA omitted it.
    const missing = STATIONS.filter((s) => volumesFor(s.code) === null);
    expect(missing.map((s) => s.code)).toEqual([]);
  });

  it("gives both codes of an interchange the same figure", () => {
    // Paya Lebar is one building with one set of gantries. A tap there is not
    // an East West tap or a Circle Line tap.
    expect(volumesFor("EW8")).toEqual(volumesFor("CC9"));
    expect(volumesFor("NS24")).toEqual(volumesFor("NE6"));
    expect(volumesFor("NS24")).toEqual(volumesFor("CC1"));
  });

  it("reports a daily average, not a monthly total", () => {
    // The raw August figure for Aljunied is 468,684. Anything of that order
    // means the division by days went missing.
    const aljunied = volumesFor("EW9")!;
    expect(aljunied.weekday.in).toBeGreaterThan(5_000);
    expect(aljunied.weekday.in).toBeLessThan(60_000);
  });

  it("keeps tap-ins and tap-outs as separate facts", () => {
    // They are close but not equal, and which way they lean says something:
    // Dhoby Ghaut starts more journeys than it ends, Fort Canning the
    // reverse. Storing one and doubling it would invent the other.
    const dhoby = volumesFor("NS24")!;
    const fortCanning = volumesFor("DT20")!;
    expect(dhoby.weekday.in).toBeGreaterThan(dhoby.weekday.out);
    expect(fortCanning.weekday.in).toBeLessThan(fortCanning.weekday.out);
  });

  it("balances across the network, which is the completeness check", () => {
    // Every journey is one tap in and one tap out, so the two totals must
    // agree to within rounding. A gap would mean stations went missing.
    let inbound = 0;
    let outbound = 0;
    for (const s of STATIONS) {
      const v = volumesFor(s.code)!;
      // Interchanges repeat one station's figure under each code, so count
      // the first code of each physical station only.
      if (s.interchanges.some((i) => i.code < s.code)) continue;
      inbound += v.weekday.in;
      outbound += v.weekday.out;
    }
    expect(inbound / outbound).toBeGreaterThan(0.99);
    expect(inbound / outbound).toBeLessThan(1.01);
  });

  it("names the month it is quoting", () => {
    expect(VOLUME_MONTH).toMatch(/^\d{4}-\d{2}$/);
  });
});

/**
 * A monthly mean is not accurate to the last digit, and printing it as though
 * it were claims a precision the figure does not have. Next month's Paya Lebar
 * will not be 47,813 again.
 */
describe("rounding says how well the number is known", () => {
  it("keeps two significant figures", () => {
    expect(roundedVolume(47813)).toBe(48000);
    expect(roundedVolume(6802)).toBe(6800);
    expect(roundedVolume(23434)).toBe(23000);
  });

  it("does not round a small station away", () => {
    // Two significant figures would make 340 into "340" and 1,050 into
    // "1,100", but a station of 340 must not become 300 or, worse, 0.
    expect(roundedVolume(340)).toBe(300);
    expect(roundedVolume(2673)).toBe(2700);
    expect(roundedVolume(950)).toBe(1000);
  });

  it("never returns zero for a station with any traffic at all", () => {
    for (const s of STATIONS) {
      expect(roundedVolume(volumesFor(s.code)!.weekday.in)).toBeGreaterThan(0);
    }
  });
});
