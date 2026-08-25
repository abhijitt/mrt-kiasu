/**
 * Turns latitude and longitude into map coordinates.
 *
 * Isolated and pure on purpose. It is the only place that decides where a
 * station sits, so if the geographic layout proves too cramped downtown, a
 * hand-authored schematic can replace this function without touching the map
 * component, the selection flow or the data.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Web Mercator, the projection every slippy map uses.
 *
 * At Singapore's latitude the distortion versus a plain equirectangular plot
 * is under a tenth of a percent, so this is not about accuracy — it is about
 * matching what people's eyes expect a map to look like.
 */
function mercatorY(lat: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + rad / 2));
}

/**
 * Longitude in RADIANS, matching mercatorY's units.
 *
 * Both axes must share a unit or the aspect ratio is nonsense. Feeding degrees
 * in on x while y came back in radians squashed the country by a factor of 57
 * — Singapore rendered as a horizontal line.
 */
function mercatorX(lng: number): number {
  return (lng * Math.PI) / 180;
}

export interface Extent {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The bounding box of a set of points, in projected space. */
export function extentOf(points: readonly LatLng[]): Extent {
  if (points.length === 0) {
    throw new Error("Cannot compute an extent with no points");
  }
  const xs = points.map((p) => mercatorX(p.lng));
  const ys = points.map((p) => mercatorY(p.lat));
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

/**
 * Builds a projector that fits `points` into a `width` x `height` box.
 *
 * Both axes share one scale, so the network keeps its true shape instead of
 * being stretched to fill the viewport. Whatever slack the other axis has is
 * split evenly, which centres the network in the box.
 *
 * Y is flipped because screen coordinates grow downward while latitude grows
 * upward — miss this and Singapore comes out upside down.
 */
export function createProjector(
  points: readonly LatLng[],
  width: number,
  height: number,
  padding = 0,
): (p: LatLng) => Point {
  const e = extentOf(points);
  const spanX = e.maxX - e.minX || 1;
  const spanY = e.maxY - e.minY || 1;

  const usableW = width - padding * 2;
  const usableH = height - padding * 2;
  const scale = Math.min(usableW / spanX, usableH / spanY);

  const offsetX = padding + (usableW - spanX * scale) / 2;
  const offsetY = padding + (usableH - spanY * scale) / 2;

  /**
   * Rounded, and that is not cosmetic.
   *
   * Math.log and Math.tan are not required to be correctly rounded, so Node
   * and the browser can disagree in the last couple of digits. Emitting full
   * precision put y2="227.9590045303124" in the server HTML against
   * 227.95900453031186 on the client — React cannot patch up an attribute
   * mismatch, so the whole tree hydrated broken and nothing on the map
   * responded to a tap.
   *
   * Two decimals in a 1000-unit space is well under a pixel at any zoom, and
   * it shortens the served HTML considerably.
   */
  const round = (n: number) => Math.round(n * 100) / 100;

  return (p: LatLng): Point => ({
    x: round(offsetX + (mercatorX(p.lng) - e.minX) * scale),
    y: round(offsetY + (e.maxY - mercatorY(p.lat)) * scale),
  });
}
