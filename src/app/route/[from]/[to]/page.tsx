import { notFound, redirect } from "next/navigation";
import { isCanonicalSlug, stationSlug } from "@/lib/station-slug";
import { getFeatures } from "@/lib/positions";
import { planRouteBetweenStations } from "@/lib/routing";
import { roundedVolume, volumesFor } from "@/lib/volumes";
import { getGroup, getStation } from "@/lib/stations";
import { landmarksForCodes } from "@/lib/landmarks";
import { journeyPayload } from "@/lib/journey-data";
import { headsignFor } from "@/lib/train-times";
import { serviceDayOf } from "@/lib/service-status";
import { fareBetween } from "@/lib/fare";
import { doorSideFor, layoutFor } from "@/lib/orientation";
import { isIndexedRoute } from "@/lib/indexed-routes";
import { RouteScreen, type LegView } from "./RouteScreen";
import type { Metadata } from "next";

/**
 * Every route page gets its own title and description, so a shared link reads
 * as the journey it is. Only the pairs in indexed-routes are listed in search,
 * though: the rest are the destination's station page again with a few words
 * about the trip, and would compete with it. They stay followable, so a
 * crawler that lands on one still reaches the station pages it links to.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ from: string; to: string }>;
}): Promise<Metadata> {
  const { from, to } = await params;
  const origin = getGroup(decodeURIComponent(from));
  const destination = getGroup(decodeURIComponent(to));
  if (!origin || !destination) return { title: "Not found" };

  const route = planRouteBetweenStations(origin.name, destination.name);
  const fare = fareBetween(origin.primaryCode, destination.primaryCode);
  const title = `${origin.name} to ${destination.name} by MRT — MRT Kiasu`;
  const trip = route
    ? [
        `${route.stopCount} ${route.stopCount === 1 ? "stop" : "stops"}`,
        route.interchangeCount > 0
          ? `${route.interchangeCount} ${route.interchangeCount === 1 ? "change" : "changes"}`
          : "no changes",
        `about ${Math.round(route.approxMinutes)} min`,
        fare ? `$${(fare.byType.adult.cents / 100).toFixed(2)} adult card fare` : null,
      ]
        .filter(Boolean)
        .join(", ")
    : null;
  const description =
    `${trip ? `${trip}. ` : ""}Which car and door to board at ${origin.name} ` +
    `for the quickest way out at ${destination.name}.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/route/${stationSlug(origin.name)}/${stationSlug(destination.name)}`,
    },
    openGraph: { title, description, type: "article" },
    ...(isIndexedRoute(origin.name, destination.name)
      ? {}
      : { robots: { index: false, follow: true } }),
  };
}

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

  // One address per journey. Links written before slugs existed carry the raw
  // name ("Paya%20Lebar") and still resolve above; this moves them to the
  // canonical form rather than leaving the same page reachable several ways.
  if (!isCanonicalSlug(from, origin.name) || !isCanonicalSlug(to, destination.name)) {
    redirect(`/route/${stationSlug(origin.name)}/${stationSlug(destination.name)}`);
  }

  const route = planRouteBetweenStations(fromName, toName);
  if (!route) notFound();

  // Ship every recorded feature per leg; the client picks among them using the
  // commuter's preference, which lives in their browser and not on the server.
  // Which timetable is running decides the headsign: a Sunday train can carry
  // a different destination from the same platform on a Tuesday.
  const serviceDay = serviceDayOf(new Date());

  const legs: LegView[] = route.legs.map((leg) => {
    // What the front of the train will say. The leg's own `towards` is where
    // the commuter gets off, which is a different fact and not the one printed
    // on the platform sign.
    //
    // Not across a branch. A junction has three services, not two, and asc/desc
    // cannot say which: at Tanah Merah the feed lists only Pasir Ris and Tuas
    // Link, so asking it for the Changi shuttle's headsign confidently returns
    // a train going the other way. Better to keep the old wording there than to
    // print the wrong destination on the one line a commuter checks against the
    // platform sign.
    const crossesBranch =
      leg.from.code.replace(/\d+$/, "") !== leg.to.code.replace(/\d+$/, "");
    const headsign = crossesBranch
      ? null
      : headsignFor(leg.from.code, leg.direction, serviceDay);
    return {
      line: leg.line,
      fromName: leg.from.name,
      toName: leg.to.name,
      toCode: leg.to.code,
      stopNames: leg.stops.map((s) => s.name),
      direction: leg.direction,
      towards: leg.towards,
      headsign,
      // "Clockwise" and "Service B" are destinations in the feed's sense but
      // not places, so the copy cannot wrap them in "towards". Decided here,
      // where the station list is, rather than shipping it to the browser.
      headsignIsPlace: headsign !== null && getGroup(headsign) !== null,
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
      // Tap-OUT, not tap-in: on this page the reader is arriving.
      destinationTaps={(() => {
        const v = volumesFor(destination.codes[0]);
        return v ? roundedVolume(v.weekday.out) : null;
      })()}
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
