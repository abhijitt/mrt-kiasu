import { notFound } from "next/navigation";
import { getStation } from "@/lib/stations";
import { platformDirections, stationPlatforms } from "@/lib/network";
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

  // Name the next stop, rather than "asc"/"desc", which means nothing to
  // someone standing on a platform.
  //
  // This used to name the line's terminus, taken as the first or last station
  // once the line was sorted. Branch prefixes sort last, so it told a surveyor
  // on any Circle Line platform that they were facing Marina Bay (CE2) rather
  // than HarbourFront, and any East West platform that it faced Changi Airport
  // rather than Tuas Link — sending them to the wrong physical platform, which
  // would have quietly poisoned the survey.
  const platform = platformDirections(station.code).find((p) => p.direction === direction);
  if (!platform) notFound();

  return (
    <SurveyScreen
      stationCode={station.code}
      stationName={station.name}
      line={station.line}
      direction={direction}
      towards={platform.nextStop.name}
      totalDoors={doorsPerTrain(station.line)!}
      exitCodes={station.exits.map((e) => e.code)}
      interchanges={station.interchanges.map((i) => i.line)}
      existing={getFeatures(station.code, direction)}
      // Every platform under this surveyor's feet, including the ones that
      // belong to the station's other codes: standing in Bayfront is standing
      // in CE1 and DT16 at once. LRT platforms are dropped, not hidden as
      // broken links — without sourced door geometry there is no grid to
      // survey against, which is the same reason this page 404s for them.
      platforms={stationPlatforms(station.code)
        .filter((pl) => hasTrainGeometry(pl.line))
        .map((pl) => ({
          code: pl.code,
          line: pl.line,
          direction: pl.direction,
          nextStop: pl.nextStop.name,
        }))}
    />
  );
}
