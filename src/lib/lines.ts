/**
 * MRT/LRT line reference data.
 *
 * Train geometry is what turns a platform position into a "stand at car N"
 * instruction, so every figure here is sourced. Lines whose fleet we could not
 * source carry `train: null` rather than a plausible-looking guess — the app
 * then declines to give door advice there instead of inventing it.
 *
 * Sources:
 *  - NSL/EWL: Kawasaki C151 family + Alstom Movia R151, 6 cars x 4 doors/side
 *    https://en.wikipedia.org/wiki/Alstom_Movia_R151
 *    LTA news release (106 six-car trains, 636 cars):
 *    https://www.lta.gov.sg/content/ltagov/en/newsroom/2023/6/news-releases/first-batch-of-new-north-south-and-east-west-lines--trains-to-be.html
 *  - NEL: Alstom Metropolis C751A/C751C/C851E, 6 cars x 4 doors/side
 *    https://en.wikipedia.org/wiki/Alstom_Metropolis_C851E
 *  - CCL: Alstom Metropolis C830/C830C/C851E, 3 cars x 4 doors/side
 *  - DTL: Bombardier Movia C951, 3 cars x 4 doors/side
 *    https://en.wikipedia.org/wiki/Bombardier_Movia_C951
 *  - TEL: Kawasaki/CRRC Qingdao Sifang T251, 4 cars x 5 doors/side
 *    https://en.wikipedia.org/wiki/Kawasaki_Heavy_Industries_%26_CRRC_Qingdao_Sifang_T251
 */

export type LineCode =
  | "NSL" | "EWL" | "NEL" | "CCL" | "DTL" | "TEL"
  | "BPLRT" | "SKLRT" | "PGLRT";

export interface TrainGeometry {
  cars: number;
  /** Doors per car on one side of the train. */
  doorsPerCar: number;
}

export interface LineInfo {
  code: LineCode;
  name: string;
  shortName: string;
  colorVar: string;
  /** Text colour that actually reads on this line's colour. */
  inkVar: string;
  operator: "SMRT" | "SBS Transit";
  /** Null when we have no sourced fleet data — door advice is withheld. */
  train: TrainGeometry | null;
  trainSource: string | null;
  /** Station code prefixes belonging to this line, including branches. */
  prefixes: string[];
}

export const LINES: Record<LineCode, LineInfo> = {
  NSL: {
    code: "NSL", name: "North South Line", shortName: "NS",
    colorVar: "--line-nsl", inkVar: "--ink-nsl", operator: "SMRT",
    train: { cars: 6, doorsPerCar: 4 },
    trainSource: "Kawasaki C151 family / Alstom Movia R151",
    prefixes: ["NS"],
  },
  EWL: {
    code: "EWL", name: "East West Line", shortName: "EW",
    colorVar: "--line-ewl", inkVar: "--ink-ewl", operator: "SMRT",
    train: { cars: 6, doorsPerCar: 4 },
    trainSource: "Kawasaki C151 family / Alstom Movia R151",
    prefixes: ["EW", "CG"],
  },
  NEL: {
    code: "NEL", name: "North East Line", shortName: "NE",
    colorVar: "--line-nel", inkVar: "--ink-nel", operator: "SBS Transit",
    train: { cars: 6, doorsPerCar: 4 },
    trainSource: "Alstom Metropolis C751A / C751C / C851E",
    prefixes: ["NE"],
  },
  CCL: {
    code: "CCL", name: "Circle Line", shortName: "CC",
    colorVar: "--line-ccl", inkVar: "--ink-ccl", operator: "SMRT",
    train: { cars: 3, doorsPerCar: 4 },
    trainSource: "Alstom Metropolis C830 / C830C / C851E",
    prefixes: ["CC", "CE"],
  },
  DTL: {
    code: "DTL", name: "Downtown Line", shortName: "DT",
    colorVar: "--line-dtl", inkVar: "--ink-dtl", operator: "SBS Transit",
    train: { cars: 3, doorsPerCar: 4 },
    trainSource: "Bombardier Movia C951",
    prefixes: ["DT"],
  },
  TEL: {
    code: "TEL", name: "Thomson-East Coast Line", shortName: "TE",
    colorVar: "--line-tel", inkVar: "--ink-tel", operator: "SMRT",
    train: { cars: 4, doorsPerCar: 5 },
    trainSource: "Kawasaki Heavy Industries & CRRC Qingdao Sifang T251",
    prefixes: ["TE"],
  },
  BPLRT: {
    code: "BPLRT", name: "Bukit Panjang LRT", shortName: "BP",
    colorVar: "--line-lrt", inkVar: "--ink-lrt", operator: "SMRT",
    train: null, trainSource: null,
    prefixes: ["BP"],
  },
  SKLRT: {
    code: "SKLRT", name: "Sengkang LRT", shortName: "SK",
    colorVar: "--line-lrt", inkVar: "--ink-lrt", operator: "SBS Transit",
    train: null, trainSource: null,
    prefixes: ["STC", "SE", "SW"],
  },
  PGLRT: {
    code: "PGLRT", name: "Punggol LRT", shortName: "PG",
    colorVar: "--line-lrt", inkVar: "--ink-lrt", operator: "SBS Transit",
    train: null, trainSource: null,
    prefixes: ["PTC", "PE", "PW"],
  },
};

/**
 * Message key for a line's display name.
 *
 * `LineInfo.name` stays English and is only for logs, source notes and the
 * data scripts. Anything a commuter reads goes through this key — the Chinese
 * names in the catalogue are LTA's own, from the official station code file.
 */
export function lineNameKey(code: LineCode): string {
  return `line.${code}.name`;
}

export const LINE_ORDER: LineCode[] = [
  "NSL", "EWL", "NEL", "CCL", "DTL", "TEL", "BPLRT", "SKLRT", "PGLRT",
];

/** Longest-first so "STC" wins over "ST" and "CE" is not read as "C". */
const PREFIX_TO_LINE: [string, LineCode][] = Object.values(LINES)
  .flatMap((l) => l.prefixes.map((p) => [p, l.code] as [string, LineCode]))
  .sort((a, b) => b[0].length - a[0].length);

/** Resolves a station code like "NE12" or "STC" to its line. */
export function lineFromStationCode(code: string): LineCode | null {
  const upper = code.toUpperCase();
  const prefix = upper.replace(/\d+$/, "");
  const match = PREFIX_TO_LINE.find(([p]) => p === prefix);
  return match?.[1] ?? null;
}

/** Total doors on one side of a full-length train, or null if unsourced. */
export function doorsPerTrain(line: LineCode): number | null {
  const t = LINES[line].train;
  return t ? t.cars * t.doorsPerCar : null;
}

/** Whether we can give door-position advice for this line at all. */
export function hasTrainGeometry(line: LineCode): boolean {
  return LINES[line].train !== null;
}
