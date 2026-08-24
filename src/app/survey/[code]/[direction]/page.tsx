import { notFound } from "next/navigation";
import { getStation, stationsOnLine } from "@/lib/stations";
import { getFeatures } from "@/lib/positions";
import { doorsPerTrain, hasTrainGeometry } from "@/lib/lines";
import { SurveyScreen } from "./SurveyScreen";

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ code: string; direction: string }>;
}) {
  const { code, direction } = await params;
  const station = getStation(code);
  if (!station || (direction !== "asc" && direction !== "desc")) notFound();
  // Without sourced fleet data there is no door grid to survey against.
  if (!hasTrainGeometry(station.line)) notFound();

  // Name the terminus this platform's trains head for, rather than "asc"/"desc",
  // which means nothing to someone standing on a platform.
  const onLine = stationsOnLine(station.line);
  const terminus = direction === "asc" ? onLine[onLine.length - 1] : onLine[0];

  return (
    <SurveyScreen
      stationCode={station.code}
      stationName={station.name}
      line={station.line}
      direction={direction}
      towards={terminus?.name ?? station.name}
      totalDoors={doorsPerTrain(station.line)!}
      exitCodes={station.exits.map((e) => e.code)}
      interchanges={station.interchanges.map((i) => i.line)}
      existing={getFeatures(station.code, direction)}
    />
  );
}
