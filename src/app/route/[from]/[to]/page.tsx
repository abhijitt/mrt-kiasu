import { notFound } from "next/navigation";
import { getFeatures } from "@/lib/positions";
import { planRouteBetweenStations } from "@/lib/routing";
import { getGroup, getStation } from "@/lib/stations";
import { landmarksForCodes } from "@/lib/landmarks";
import { journeyPayload } from "@/lib/journey-data";
import { fareBetween } from "@/lib/fare";
import { doorSideFor, layoutFor } from "@/lib/orientation";
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
  const legs: LegView[] = route.legs.map((leg) => {
    return {
      line: leg.line,
      fromName: leg.from.name,
      toName: leg.to.name,
      toCode: leg.to.code,
      stopNames: leg.stops.map((s) => s.name),
      direction: leg.direction,
      towards: leg.towards,
      features: getFeatures(leg.to.code, leg.direction),
      // Two different platforms, and they are not interchangeable.
      //
      // The diagram is what the reader is looking at RIGHT NOW, standing where
      // this leg begins, so it is oriented by the origin. The door-side note is
      // about getting off, so it comes from the destination. Using the
      // destination for both pointed the train the wrong way whenever the two
      // platforms differed — Promenade to Paya Lebar drew a train facing right
      // while the reader stood on a platform where it goes left.
      //
      // Resolved here so positions.json never crosses to the browser, and an
      // unsurveyed platform arrives as null rather than as a guess.
      boardingSide: doorSideFor(leg.from.code, leg.direction)?.side ?? null,
      doorSide: (() => {
        const o = doorSideFor(leg.to.code, leg.direction);
        if (!o) return null;
        return {
          side: o.side,
          surveyed: o.source === "survey",
          layout: layoutFor(leg.to.code)?.layout ?? null,
        };
      })(),
    };
  });

  const exits = [
    ...new Set(
      destination.codes.flatMap(
        (c) => getStation(c)?.exits.map((e) => e.code) ?? [],
      ),
    ),
  ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  // Worked out here rather than in the browser: the pair table is ~300 KB and
  // the page needs one number out of it. Null when we have no figure for the
  // pair, which the screen renders as no fare rather than a guess.
  const fare = fareBetween(origin.primaryCode, destination.primaryCode);

  return (
    <RouteScreen
      fare={fare}
      originName={origin.name}
      destinationName={destination.name}
      destinationCode={destination.primaryCode}
      destinationExits={exits}
      destinationCodes={destination.codes}
      destinationLandmarks={landmarksForCodes(destination.codes)}
      stopCount={route.stopCount}
      interchangeCount={route.interchangeCount}
      approxMinutes={route.approxMinutes}
      journey={journeyPayload(route.legs)}
      legs={legs}
    />
  );
}
