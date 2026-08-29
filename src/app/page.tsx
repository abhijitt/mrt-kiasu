import { HomeScreen } from "./HomeScreen";
import { STATION_GROUPS, STATIONS, stationsOnLine } from "@/lib/stations";
import { LINES, LINE_ORDER } from "@/lib/lines";

export default function Home() {
  const stations = STATION_GROUPS.map((g) => ({
    name: g.name,
    // Carried so the picker can be searched in Chinese. The English name stays
    // the value: it is what the route URL is built from.
    nameZh: g.nameZh,
    codes: g.codes,
    lines: g.lines,
  }));

  const lines = LINE_ORDER.map((code) => ({
    code,
    shortName: LINES[code].shortName,
    colorVar: LINES[code].colorVar,
    inkVar: LINES[code].inkVar,
    stationCount: stationsOnLine(code).length,
  }));

  const exitCount = STATIONS.reduce((n, s) => n + s.exits.length, 0);

  return <HomeScreen stations={stations} lines={lines} exitCount={exitCount} />;
}
