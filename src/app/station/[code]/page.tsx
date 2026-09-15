import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LINES, hasTrainGeometry } from "@/lib/lines";
import { RETIRED_CODES, STATIONS, getStation } from "@/lib/stations";
import { getFeatures, hasVerifiedData } from "@/lib/positions";
import { landmarksForCodes } from "@/lib/landmarks";
import { platformDirections } from "@/lib/network";
import { stationLayout } from "@/lib/station-layout";
import { stationCoverage } from "@/lib/survey-coverage";
import { timesForCodes } from "@/lib/train-times";
import { anniversaryYears, derivedFacts, getTriviaAllLocales } from "@/lib/trivia";
import { StationScreen } from "./StationScreen";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>;
}): Promise<Metadata> {
  const { code } = await params;
  const station = getStation(code);
  if (!station) return { title: "Not found" };

  const line = LINES[station.line];
  const exits = station.exits.length;
  const title = `${station.name} (${station.code}) — MRT Kiasu`;
  const description = exits
    ? `Which door to stand at when you get off at ${station.name} on the ${line.name}. ${exits} exits, nearby landmarks, live crowding.`
    : `${station.name} on the ${line.name}: live crowding, station facts and door guidance.`;

  return {
    title,
    description,
    alternates: { canonical: `/station/${station.code}` },
    openGraph: { title, description, type: "article" },
  };
}

export function generateStaticParams() {
  return STATIONS.map((s) => ({ code: s.code }));
}

export default async function StationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const station = getStation(code);
  if (!station) notFound();

  // A link written before Stage 6 renumbered the Circle Line still names CE1
  // or CE2. Send it on to the code that is on the signs now, rather than
  // serving the same platform under two addresses.
  if (RETIRED_CODES[code.toUpperCase()]) redirect(`/station/${station.code}`);

  const line = LINES[station.line];

  return (
    <StationScreen
      code={station.code}
      name={station.name}
      nameZh={station.nameZh}
      lineCode={station.line}
      lineShortName={line.shortName}
      colorVar={line.colorVar}
      inkVar={line.inkVar}
      operator={line.operator}
      opened={station.opened}
      interchanges={station.interchanges}
      exits={station.exits.map((e) => e.code)}
      train={line.train}
      trainSource={line.trainSource}
      derived={derivedFacts(station.code)}
      triviaByLocale={getTriviaAllLocales(station.code)}
      trainTimes={timesForCodes([station.code, ...station.interchanges.map((i) => i.code)])}
      anniversaryYears={anniversaryYears(station.code)}
      landmarks={landmarksForCodes([station.code, ...station.interchanges.map((i) => i.code)])}
      dataGaps={station.dataGaps}
      hasVerified={
        hasVerifiedData(station.code, "asc") || hasVerifiedData(station.code, "desc")
      }
      canGiveDoorGuidance={hasTrainGeometry(station.line)}
      // Both platforms, not just one. The survey link used to hardcode "desc",
      // so half of every station was unreachable from the UI.
      platforms={platformDirections(station.code).map((p) => ({
        direction: p.direction,
        nextStop: p.nextStop.name,
      }))}
      hasEstimates={getFeatures(station.code, "desc").length > 0}
      coverage={stationCoverage(station.code)}
      // This line's platforms only. The other lines here are a tap away from
      // the interchange list, which is where a reader looking for them goes.
      layoutBlocks={[stationLayout(station.code)]
        .filter((b) => b !== null)
        .map((b) => ({
          code: b.code,
          line: b.line,
          colorVar: b.colorVar,
          layout: b.layout,
          totalDoors: b.totalDoors,
          platforms: b.platforms,
        }))}
    />
  );
}
