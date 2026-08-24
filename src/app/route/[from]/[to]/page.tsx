import { notFound } from "next/navigation";
import { findBestFeature, getFeatures } from "@/lib/positions";
import { planRouteBetweenStations } from "@/lib/routing";
import { getGroup, getStation } from "@/lib/stations";
import { landmarksForCodes } from "@/lib/landmarks";
import { RouteScreen, type LegView } from "./RouteScreen";

export default async function RoutePage({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}) {
  const { from, to } = await params;

  const fromName = decodeURIComponent(from);
  const toName = decodeURIComponent(to);

  const origin = getGroup(fromName);
  const destination = getGroup(toName);
  if (!origin || !destination) notFound();

  const route = planRouteBetweenStations(fromName, toName);
  if (!route) notFound();

  // Ship every recorded feature per leg; the client picks among them using the
  // commuter's preference, which lives in their browser and not on the server.
  const legs: LegView[] = route.legs.map((leg, i) => {
    const nextLeg = route.legs[i + 1];
    return {
      line: leg.line,
      fromName: leg.from.name,
      toName: leg.to.name,
      toCode: leg.to.code,
      stopNames: leg.stops.map((s) => s.name),
      direction: leg.direction,
      towards: leg.towards,
      features: getFeatures(leg.to.code, leg.direction),
      transferFeature: nextLeg
        ? findBestFeature(leg.to.code, leg.direction, "transfer", nextLeg.line)
        : null,
    };
  });

  const exits = [
    ...new Set(
      destination.codes.flatMap(
        (c) => getStation(c)?.exits.map((e) => e.code) ?? [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <RouteScreen
      originName={origin.name}
      destinationName={destination.name}
      destinationCode={destination.primaryCode}
      destinationExits={exits}
      destinationCodes={destination.codes}
      destinationLandmarks={landmarksForCodes(destination.codes)}
      stopCount={route.stopCount}
      interchangeCount={route.interchangeCount}
      approxMinutes={route.approxMinutes}
      legs={legs}
    />
  );
}
