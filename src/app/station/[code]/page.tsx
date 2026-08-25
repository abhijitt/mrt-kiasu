import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LINES, hasTrainGeometry } from "@/lib/lines";
import { STATIONS, getStation } from "@/lib/stations";
import { getFeatures, hasVerifiedData } from "@/lib/positions";
import { landmarksForCodes } from "@/lib/landmarks";
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
      hasEstimates={getFeatures(station.code, "desc").length > 0}
    />
  );
}
