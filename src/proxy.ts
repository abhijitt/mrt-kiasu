import { NextResponse, type NextRequest } from "next/server";
import { LINES } from "@/lib/lines";
import { getGroup, getStation } from "@/lib/stations";
import { stationSlug } from "@/lib/station-slug";

/**
 * Settles whether a station, line or route page exists before it renders.
 *
 * The pages check for themselves, but too late to say so over HTTP. The root
 * loading.tsx is a Suspense boundary, and a code that was not prerendered
 * suspends on its params — so the skeleton streams, the 200 goes out with it,
 * and the page's own notFound() can only add a noindex. /station/XX99 was a
 * 200. Their redirects had the same problem: /station/CE1 moved to CC34 in
 * the browser, as a client-side navigation no crawler ever saw as a move.
 *
 * Here nothing has been sent yet. An unknown code is a real 404, and a retired
 * or oddly written one is a real 308 to the address the page would have moved
 * it to. Everything the pages already accept still reaches them unchanged.
 */
export function proxy(request: NextRequest) {
  const [, section, a, b] = request.nextUrl.pathname.split("/");

  let segments: string[];
  try {
    segments = [a, b].filter((s) => s !== undefined).map(decodeURIComponent);
  } catch {
    // Malformed percent-encoding names nothing.
    return notFound(request);
  }

  if (section === "station") {
    const [code] = segments;
    // getStation() resolves a retired code (CE1) to the station that
    // replaced it (CC34), so the same redirect covers both it and "ew8".
    const station = getStation(code);
    if (!station) return notFound(request);
    return code === station.code ? NextResponse.next() : moved(request, `/station/${station.code}`);
  }

  if (section === "line") {
    const [code] = segments;
    const canonical = code.toUpperCase();
    if (!(canonical in LINES)) return notFound(request);
    return code === canonical ? NextResponse.next() : moved(request, `/line/${canonical}`);
  }

  if (section === "route") {
    const [from, to] = segments;
    const origin = getGroup(from);
    const destination = getGroup(to);
    if (!origin || !destination) return notFound(request);
    const path = `/route/${stationSlug(origin.name)}/${stationSlug(destination.name)}`;
    return request.nextUrl.pathname === path ? NextResponse.next() : moved(request, path);
  }

  return NextResponse.next();
}

/**
 * Hands the request to a path no route claims, so the site's own not-found
 * page renders — with a 404 on it, because nothing has streamed yet.
 */
function notFound(request: NextRequest) {
  return NextResponse.rewrite(new URL("/_unknown", request.url));
}

/** Permanent, and keeping any query: a shared link's ?exit=B still applies. */
function moved(request: NextRequest, path: string) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Exactly the shapes the pages take. Anything deeper is not one of these
  // pages and is left to the router, which 404s it on its own.
  matcher: ["/station/:code", "/line/:code", "/route/:from/:to"],
};
