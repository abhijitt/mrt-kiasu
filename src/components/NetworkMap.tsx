"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createProjector, type LatLng } from "@/lib/map-projection";
import { lineFromStationCode, LINES } from "@/lib/lines";

/** The coordinate space the network is drawn in. Arbitrary, but fixed. */
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
const DETAIL_ZOOM = 2.2;
const LABEL_ZOOM = 3.2;

export interface MapStation {
  code: string;
  name: string;
  line: string;
  lat: number;
  lng: number;
}

interface Props {
  stations: MapStation[];
  edges: [string, string][];
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

export function NetworkMap({ stations, edges, from, to, onSelect, labels }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  // Centre of the viewport in map coordinates.
  const [centre, setCentre] = useState({ x: W / 2, y: H / 2 });

  const { nodes, paths } = useMemo(() => {
    const project = createProjector(stations as LatLng[], W, H, PAD);

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
  }, [stations, edges]);

  // Half-extents of the visible window, in map units.
  const halfW = W / (2 * zoom);
  const halfH = H / (2 * zoom);

  const clamp = useCallback(
    (c: { x: number; y: number }, z: number) => {
      const hw = W / (2 * z);
      const hh = H / (2 * z);
      return {
        x: Math.min(W - hw, Math.max(hw, c.x)),
        y: Math.min(H - hh, Math.max(hh, c.y)),
      };
    },
    [],
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
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragged.current = false;
    svgRef.current?.setPointerCapture(e.pointerId);
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
        zoomTo((pinchStart.current.zoom * dist) / pinchStart.current.dist);
      }
      return;
    }

    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = ((e.clientX - prev.x) / rect.width) * halfW * 2;
    const dy = ((e.clientY - prev.y) / rect.height) * halfH * 2;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) dragged.current = true;
    setCentre((c) => clamp({ x: c.x - dx, y: c.y - dy }, zoom));
  }

  function endPointer(e: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchStart.current = null;
  }

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

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`${centre.x - halfW} ${centre.y - halfH} ${halfW * 2} ${halfH * 2}`}
        className="pixel-box block w-full touch-none select-none bg-bg-sunken"
        style={{ aspectRatio: `${W} / ${H}` }}
        role="application"
        aria-label={labels.station}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
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
                cx={n.x} cy={n.y} r={Math.max(r * 3, 14 / zoom)}
                fill="transparent"
                className="cursor-pointer"
                onPointerUp={(e) => {
                  e.stopPropagation();
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
          onClick={() => { setZoom(MIN_ZOOM); setCentre({ x: W / 2, y: H / 2 }); }}
          aria-label={labels.reset}
          className="pixel-btn flex h-11 w-11 items-center justify-center text-fg"
        >
          <IconFit />
        </button>
      </div>
    </div>
  );
}
