"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjector, type LatLng } from "@/lib/map-projection";
import { lineFromStationCode, LINES } from "@/lib/lines";
import { exceedsTapSlop } from "@/lib/gesture";

/**
 * The coordinate space the geographic layout is drawn in. Arbitrary, but fixed.
 *
 * The schematic brings its own extent instead: relaxation decides how much
 * room the network needs to keep nothing crowded, and forcing that back into
 * a preset box would undo the spacing exactly where it was needed.
 */
const W = 1000;
const H = 560;
const PAD = 28;

/** Zoom limits. 1 fits the whole network; the top end makes downtown tappable. */
const MIN_ZOOM = 1;
const MAX_ZOOM = 14;

/**
 * Zoom at which every station gets a dot and a label.
 *
 * Below this only interchanges are drawn. At fit-to-screen on a phone, 341
 * pairs of stations sit closer together than a finger — drawing them all would
 * be an unreadable smear of overlapping targets rather than a map.
 */
/**
 * How big a station's tap target should be on screen, in CSS pixels.
 *
 * Held constant in SCREEN space rather than map space. The first version used
 * map units, which rendered a 12px target — fine for a finger, because
 * browsers fuzz touch input by roughly 8px, and impossible with a mouse, which
 * demands pixel accuracy. That is why the map selected stations on a phone and
 * not at all on a laptop.
 *
 * Targets do overlap downtown at low zoom, where stations are a few pixels
 * apart. Overlapping means the topmost wins, which beats a target nobody can
 * hit; zoom is what buys precision there.
 */
const HIT_TARGET_PX = 40;

const DETAIL_ZOOM = 2.2;
const LABEL_ZOOM = 3.2;

export interface MapStation {
  code: string;
  name: string;
  line: string;
  lat: number;
  lng: number;
}

export type MapLayout = "schematic" | "geographic";

interface Props {
  stations: MapStation[];
  edges: [string, string][];
  /**
   * Precomputed octilinear positions by station name.
   *
   * Present for the schematic layout, absent for geographic. Built at build
   * time by scripts/build-schematic.mjs rather than solved in the browser.
   */
  schematic?: Record<string, { x: number; y: number }>;
  /** Natural size of the schematic layout, used as its viewBox. */
  schematicExtent?: { w: number; h: number };
  layout: MapLayout;
  /** Station names already chosen, highlighted on the map. */
  from?: string;
  to?: string;
  onSelect: (name: string) => void;
  labels: {
    zoomIn: string;
    zoomOut: string;
    reset: string;
    station: string;
  };
}

/** One marker per physical station — interchanges share a name and a point. */
interface Node {
  name: string;
  x: number;
  y: number;
  codes: string[];
  lines: string[];
  interchange: boolean;
}

/**
 * Map controls, drawn rather than typeset.
 *
 * They were "+", "−" and "⤢" in the pixel font. Press Start 2P has no glyph
 * for U+2212 or U+2922, so those two silently fell back to a system font and
 * sat visibly off centre and undersized, while "+" was a shade high on the
 * font's own metrics. Geometry does not have that problem.
 */
function IconPlus() {
  return (
    <svg viewBox="0 0 12 12" width={18} height={18} aria-hidden focusable="false" shapeRendering="crispEdges">
      <rect x={1} y={5} width={10} height={2} fill="currentColor" />
      <rect x={5} y={1} width={2} height={10} fill="currentColor" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg viewBox="0 0 12 12" width={18} height={18} aria-hidden focusable="false" shapeRendering="crispEdges">
      <rect x={1} y={5} width={10} height={2} fill="currentColor" />
    </svg>
  );
}

/** Four corner brackets — the usual "fit to view" mark, and legible at 18px. */
function IconFit() {
  return (
    <svg viewBox="0 0 12 12" width={18} height={18} aria-hidden focusable="false" shapeRendering="crispEdges">
      <rect x={0} y={0} width={5} height={2} fill="currentColor" />
      <rect x={0} y={0} width={2} height={5} fill="currentColor" />
      <rect x={7} y={0} width={5} height={2} fill="currentColor" />
      <rect x={10} y={0} width={2} height={5} fill="currentColor" />
      <rect x={0} y={10} width={5} height={2} fill="currentColor" />
      <rect x={0} y={7} width={2} height={5} fill="currentColor" />
      <rect x={7} y={10} width={5} height={2} fill="currentColor" />
      <rect x={10} y={7} width={2} height={5} fill="currentColor" />
    </svg>
  );
}

export function NetworkMap({
  stations,
  edges,
  schematic,
  schematicExtent,
  layout,
  from,
  to,
  onSelect,
  labels,
}: Props) {
  // Whichever layout is showing decides the coordinate space.
  const useSchematic = layout === "schematic" && schematicExtent !== undefined;
  const VW = useSchematic ? schematicExtent.w : W;
  const VH = useSchematic ? schematicExtent.h : H;
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  /** Rendered width in CSS pixels, so hit targets can be sized in screen terms. */
  const [renderedW, setRenderedW] = useState(0);
  // Centre of the viewport in map coordinates.
  // Initialised from the active layout. Switching layouts remounts this
  // component — see the key in MapScreen — because the two have different
  // coordinate spaces and a centre carried across lands somewhere arbitrary.
  const [centre, setCentre] = useState({ x: VW / 2, y: VH / 2 });

  const { nodes, paths } = useMemo(() => {
    const geo = createProjector(stations as LatLng[], VW, VH, PAD);
    // Schematic positions are looked up, not computed. A station the layout
    // could not place falls back to geography rather than vanishing.
    const project = (s: MapStation) =>
      layout === "schematic" ? (schematic?.[s.name] ?? geo(s)) : geo(s);

    // Interchanges appear once per line in the dataset (Bishan is NS17 and
    // CC15). On a map they are one place, so they are merged into one marker.
    const byName = new Map<string, Node>();
    const byCode = new Map<string, Node>();
    for (const s of stations) {
      const p = project(s);
      let node = byName.get(s.name);
      if (!node) {
        node = { name: s.name, x: p.x, y: p.y, codes: [], lines: [], interchange: false };
        byName.set(s.name, node);
      }
      node.codes.push(s.code);
      if (!node.lines.includes(s.line)) node.lines.push(s.line);
      node.interchange = node.lines.length > 1;
      byCode.set(s.code, node);
    }

    // One path per edge rather than per line: a polyline would need station
    // ordering, and edges already encode exactly which pairs are connected.
    const paths = edges
      .map(([a, b]) => {
        const na = byCode.get(a);
        const nb = byCode.get(b);
        if (!na || !nb) return null;
        const line = lineFromStationCode(a);
        return {
          key: `${a}-${b}`,
          x1: na.x, y1: na.y, x2: nb.x, y2: nb.y,
          colour: line ? `var(${LINES[line].colorVar})` : "var(--border)",
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    return { nodes: [...byName.values()], paths };
  }, [stations, edges, schematic, layout, VW, VH]);

  // Half-extents of the visible window, in map units.
  const halfW = VW / (2 * zoom);
  const halfH = VH / (2 * zoom);

  const clamp = useCallback(
    (c: { x: number; y: number }, z: number) => {
      const hw = VW / (2 * z);
      const hh = VH / (2 * z);
      return {
        x: Math.min(VW - hw, Math.max(hw, c.x)),
        y: Math.min(VH - hh, Math.max(hh, c.y)),
      };
    },
    [VW, VH],
  );

  const zoomTo = useCallback(
    (next: number, focus?: { x: number; y: number }) => {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next));
      setZoom(z);
      setCentre((c) => clamp(focus ?? c, z));
    },
    [clamp],
  );

  // --- gestures -----------------------------------------------------------
  // Pointer Events rather than touch events, so one code path covers finger,
  // trackpad and mouse.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinchStart = useRef<{ dist: number; zoom: number } | null>(null);
  const dragged = useRef(false);
  /** Where this gesture began, so drag is measured from the origin, not
   *  accumulated from frame to frame. */
  const downAt = useRef<{ x: number; y: number } | null>(null);

  function toMap(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const fx = (clientX - rect.left) / rect.width;
    const fy = (clientY - rect.top) / rect.height;
    return {
      x: centre.x - halfW + fx * halfW * 2,
      y: centre.y - halfH + fy * halfH * 2,
    };
  }

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    onPointerDownReset();
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downAt.current = { x: e.clientX, y: e.clientY };
    dragged.current = false;
    // Capture is claimed in onPointerMove, once this is actually a drag.
    // Capturing here retargets every later event — including the click — to
    // this <svg>, so a station's own handler never ran. Touch was unaffected
    // because its compatibility click arrives after capture is released,
    // which is why the map selected fine on a phone and not at all on a
    // laptop.
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pts = [...pointers.current.values()];

    if (pts.length >= 2) {
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!pinchStart.current) {
        pinchStart.current = { dist, zoom };
      } else if (pinchStart.current.dist > 0) {
        dragged.current = true;
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // Non-fatal: pinch still tracks through the pointers map.
        }
        zoomTo((pinchStart.current.zoom * dist) / pinchStart.current.dist);
      }
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - prev.x) / rect.width) * halfW * 2;
    const dy = ((e.clientY - prev.y) / rect.height) * halfH * 2;
    // Measured in screen pixels from where the gesture started. The map-unit
    // test this replaced flagged a single pixel of mouse jitter as a drag,
    // which made every station unselectable with a trackpad.
    if (downAt.current && exceedsTapSlop(downAt.current, { x: e.clientX, y: e.clientY })) {
      if (!dragged.current) {
        dragged.current = true;
        // Now that it is a drag, keep receiving moves even if the pointer
        // leaves the map. A tap never reaches here, so its click is safe.
        try {
          svgRef.current?.setPointerCapture(e.pointerId);
        } catch {
          // The pointer can already be gone; panning still works without it.
        }
      }
    }
    setCentre((c) => clamp({ x: c.x - dx, y: c.y - dy }, zoom));
  }

  function endPointer(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  }

  /**
   * Belt and braces against a stuck pointer.
   *
   * A pointerup that never arrives — capture lost to a system gesture, a
   * finger leaving the surface mid-drag — would otherwise leave a phantom
   * touch registered, and every later single-finger drag would be mistaken
   * for a pinch. A fresh gesture starting with one finger cannot have a
   * second one already down, so this is the moment to be sure.
   */
  function onPointerDownReset() {
    if (pointers.current.size === 0) pinchStart.current = null;
  }

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setRenderedW(entry.contentRect.width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Non-passive, because zooming the map must not also scroll the page. React's
  // onWheel is passive, so this is attached by hand.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const focus = toMap(e.clientX, e.clientY);
      zoomTo(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), focus ?? undefined);
    }
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  });

  const showAll = zoom >= DETAIL_ZOOM;
  const showLabels = zoom >= LABEL_ZOOM;
  // Markers shrink as you zoom so they stay a consistent size on screen
  // rather than growing into blobs.
  const r = 5 / Math.sqrt(zoom);
  // Map units per CSS pixel at the current zoom. Falls back to a generous
  // constant before the first measurement, so the map is never briefly
  // untappable on the first paint.
  const unitsPerPx = renderedW > 0 ? VW / zoom / renderedW : 2.4;
  const hitRadius = (HIT_TARGET_PX / 2) * unitsPerPx;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${centre.x - halfW} ${centre.y - halfH} ${halfW * 2} ${halfH * 2}`}
        className="pixel-box block w-full touch-none select-none bg-bg-sunken"
        style={{ aspectRatio: `${VW} / ${VH}` }}
        role="application"
        aria-label={labels.station}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onLostPointerCapture={endPointer}
      >
        <g strokeLinecap="square">
          {paths.map((p) => (
            <line
              key={p.key}
              x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2}
              stroke={p.colour}
              strokeWidth={4 / Math.sqrt(zoom)}
            />
          ))}
        </g>

        {nodes.map((n) => {
          const chosen = n.name === from || n.name === to;
          if (!showAll && !n.interchange && !chosen) return null;
          return (
            <g key={n.name}>
              <circle
                cx={n.x} cy={n.y}
                r={chosen ? r * 1.9 : n.interchange ? r * 1.35 : r}
                fill={chosen ? "var(--accent)" : "var(--bg)"}
                stroke={chosen ? "var(--accent)" : "var(--fg)"}
                strokeWidth={2 / Math.sqrt(zoom)}
              />
              {(showLabels || chosen) && (
                <text
                  x={n.x} y={n.y - r * 2.2}
                  textAnchor="middle"
                  fill="var(--fg)"
                  stroke="var(--bg-sunken)"
                  strokeWidth={3 / zoom}
                  paintOrder="stroke"
                  style={{ fontSize: `${11 / Math.sqrt(zoom)}px` }}
                >
                  {n.name}
                </text>
              )}
              {/* An invisible disc gives a finger something to hit that is far
                  bigger than the dot it aims at. Without it the markers are
                  correct but effectively untappable on a phone. */}
              <circle
                cx={n.x} cy={n.y} r={Math.max(r * 2, hitRadius)}
                fill="transparent"
                className="cursor-pointer"
                // onClick, not onPointerUp. A pointer handler here has to
                // stop propagation to avoid double-firing, and stopping it
                // also stopped the map's own pointerup cleanup — so the
                // pointer stayed registered forever and the next touch was
                // read as the second finger of a pinch. After choosing a
                // station the map would only zoom, never pan.
                onClick={() => {
                  // A drag that ends over a station is panning, not choosing.
                  if (!dragged.current) onSelect(n.name);
                }}
              >
                <title>{n.name}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => zoomTo(zoom * 1.6)}
          aria-label={labels.zoomIn}
          className="pixel-btn flex h-11 w-11 items-center justify-center text-fg"
        >
          <IconPlus />
        </button>
        <button
          type="button"
          onClick={() => zoomTo(zoom / 1.6)}
          aria-label={labels.zoomOut}
          className="pixel-btn flex h-11 w-11 items-center justify-center text-fg"
        >
          <IconMinus />
        </button>
        <button
          type="button"
          onClick={() => { setZoom(MIN_ZOOM); setCentre({ x: VW / 2, y: VH / 2 }); }}
          aria-label={labels.reset}
          className="pixel-btn flex h-11 w-11 items-center justify-center text-fg"
        >
          <IconFit />
        </button>
      </div>
    </div>
  );
}
