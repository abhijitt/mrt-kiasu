"use client";

import { useState } from "react";
import { LINES, type LineCode } from "@/lib/lines";
import { avatarSprite, type AvatarId, type SkinToneId } from "./Avatar";
import { toCarPosition, type Direction } from "@/lib/doors";
import type { FeatureType, PlatformFeature } from "@/lib/feature-types";

/** Rendered height in CSS pixels, identical for every line. */
const DIAGRAM_HEIGHT = 132;

const FEATURE_GLYPH: Record<FeatureType, string> = {
  escalator: "▟",
  lift: "▤",
  stairs: "▚",
  transfer: "⇄",
  exit: "↑",
};

interface Props {
  line: LineCode;
  direction: Direction;
  features?: PlatformFeature[];
  /** Door to mark, in reference-end indexing. */
  highlightDoorIndex?: number;
  /**
   * Highlight the whole car rather than one door. Used for estimates, whose
   * precision does not justify pointing at a single door.
   */
  highlightWholeCar?: boolean;
  towards?: string;
  /** Draws the commuter standing at the marked door. */
  avatar?: AvatarId;
  skinTone?: SkinToneId;
  /** Accessible label, already translated by the caller. */
  label?: string;
  /**
   * Makes each door tappable. Used by the survey tool: someone standing on a
   * platform should point at the door they can see, not translate it into a
   * "car 3, door 2" code first.
   */
  onSelectDoor?: (doorIndex: number) => void;
  /** Accessible label for a door, given its car and position. */
  doorLabel?: (doorIndex: number) => string;
  /**
   * Scale the whole train to the container instead of pinning its height.
   *
   * The route page pins height so a 3-car and a 6-car train draw at one scale
   * and stay comparable. The survey shows one train at a time and you must be
   * able to see every door to pick one, so there it fits to width instead.
   */
  fitWidth?: boolean;
  /** Shown when the line has no sourced fleet data; translated by the caller. */
  noDataLabel?: string;
}

/**
 * Pixel-art plan view of a train at a platform.
 *
 * Drawn in the direction of travel: car 1 is the front, on the right. Stored
 * door indices are mapped through the same maths as the text instruction, so
 * the picture cannot disagree with the words.
 */
export function PlatformDiagram({
  line,
  direction,
  features = [],
  highlightDoorIndex,
  highlightWholeCar = false,
  towards,
  avatar,
  skinTone,
  label,
  noDataLabel,
  onSelectDoor,
  doorLabel,
  fitWidth = false,
}: Props) {
  const [departing, setDeparting] = useState(false);
  const train = LINES[line].train;
  if (!train) {
    return <p className="text-sm text-fg-muted">{noDataLabel}</p>;
  }

  const { cars, doorsPerCar } = train;
  const total = cars * doorsPerCar;

  const DOOR_W = 14;
  const DOOR_GAP = 4;
  const CAR_PAD = 6;
  const CAR_W = doorsPerCar * DOOR_W + (doorsPerCar - 1) * DOOR_GAP + CAR_PAD * 2;
  const CAR_GAP = 4;
  const NOSE_W = 12;
  const width = cars * CAR_W + (cars - 1) * CAR_GAP + NOSE_W + 4;
  const TRAIN_Y = 38;
  const TRAIN_H = 30;
  const height = 132;

  const lineColor = `var(${LINES[line].colorVar})`;

  function carLeft(carFromFront: number): number {
    return (cars - carFromFront) * (CAR_W + CAR_GAP);
  }

  function doorX(doorFromFront: number): number {
    const carFromFront = Math.ceil(doorFromFront / doorsPerCar);
    const withinCar = ((doorFromFront - 1) % doorsPerCar) + 1;
    return carLeft(carFromFront) + CAR_PAD + (withinCar - 1) * (DOOR_W + DOOR_GAP);
  }

  const doors = Array.from({ length: total }, (_, i) => {
    const doorIndex = i + 1;
    const { doorFromFront } = toCarPosition(doorIndex, line, direction);
    return { doorIndex, doorFromFront, x: doorX(doorFromFront) };
  });

  const target =
    highlightDoorIndex != null
      ? doors.find((d) => d.doorIndex === highlightDoorIndex)
      : undefined;
  const targetCar =
    highlightDoorIndex != null
      ? toCarPosition(highlightDoorIndex, line, direction).car
      : undefined;

  return (
    // A 6-car train is roughly twice as long as a 3-car one. Scaling both to
    // the same WIDTH would render the 6-car train at half the size, so instead
    // the height is pinned and the width follows the train's real length,
    // scrolling when it does not fit. Every line then draws at one scale.
    <div className={fitWidth ? "" : "overflow-x-auto"}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        {...(fitWidth
          ? { width: "100%", preserveAspectRatio: "xMidYMid meet" }
          : {
              height: DIAGRAM_HEIGHT,
              width: (width / height) * DIAGRAM_HEIGHT,
              preserveAspectRatio: "xMinYMid meet",
            })}
        className={`anim-train ${fitWidth ? "h-auto w-full" : "max-w-none"}`}
        role="img"
        aria-label={label}
      >
        <rect
          x={0}
          y={TRAIN_Y + TRAIN_H + 6}
          width={width}
          height={6}
          fill="var(--border-soft)"
        />

        <g className={departing ? "anim-depart" : undefined}>
        {Array.from({ length: cars }, (_, i) => {
          const carFromFront = i + 1;
          const x = carLeft(carFromFront);
          const isTargetCar = targetCar === carFromFront;
          return (
            <g key={carFromFront}>
              <rect
                x={x}
                y={TRAIN_Y}
                width={CAR_W}
                height={TRAIN_H}
                fill={
                  isTargetCar && highlightWholeCar
                    ? "color-mix(in srgb, var(--accent) 30%, var(--bg-raised))"
                    : "var(--bg-raised)"
                }
                stroke={isTargetCar ? "var(--accent)" : "var(--border)"}
                strokeWidth={isTargetCar ? 3 : 2}
              />
              <text
                x={x + CAR_W / 2}
                y={TRAIN_Y + 14}
                textAnchor="middle"
                fontSize={11}
                fill={isTargetCar ? "var(--accent)" : "var(--fg-muted)"}
                fontFamily="var(--font-pixel)"
              >
                {carFromFront}
              </text>
            </g>
          );
        })}

        <polygon
          points={`${width - NOSE_W},${TRAIN_Y} ${width},${TRAIN_Y + TRAIN_H / 2} ${width - NOSE_W},${TRAIN_Y + TRAIN_H}`}
          fill={lineColor}
          stroke="var(--border)"
          strokeWidth={2}
          className="cursor-pointer"
          onClick={() => {
            if (departing) return;
            setDeparting(true);
            window.setTimeout(() => setDeparting(false), 1500);
          }}
        />

        {doors.map((d) => {
          const isTarget = !highlightWholeCar && d.doorIndex === highlightDoorIndex;
          return (
            <rect
              key={d.doorIndex}
              x={d.x}
              y={TRAIN_Y + TRAIN_H - 8}
              width={DOOR_W}
              height={8}
              fill={isTarget ? "var(--accent)" : lineColor}
              stroke="var(--border)"
              strokeWidth={isTarget ? 2 : 1}
            />
          );
        })}

        </g>

        {onSelectDoor &&
          doors.map((d) => (
            <g key={`hit-${d.doorIndex}`} className="cursor-pointer">
              <rect
                x={d.x - DOOR_GAP / 2}
                y={TRAIN_Y - 4}
                width={DOOR_W + DOOR_GAP}
                height={TRAIN_H + 20}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={doorLabel?.(d.doorIndex)}
                aria-pressed={d.doorIndex === highlightDoorIndex}
                onClick={() => onSelectDoor(d.doorIndex)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectDoor(d.doorIndex);
                  }
                }}
              />
            </g>
          ))}

        {features.map((f, i) => {
          const d = doors.find((x) => x.doorIndex === f.doorIndex);
          if (!d) return null;
          const soft = f.confidence !== "verified";
          return (
            <g key={`${f.type}-${f.doorIndex}-${i}`}>
              <text
                x={d.x + DOOR_W / 2}
                y={TRAIN_Y - 12}
                textAnchor="middle"
                fontSize={15}
                fill={soft ? "var(--candidate)" : "var(--fg)"}
                opacity={soft ? 0.8 : 1}
              >
                {FEATURE_GLYPH[f.type]}
              </text>
              {f.leadsTo.length > 0 && (
                <text
                  x={d.x + DOOR_W / 2}
                  y={TRAIN_Y - 25}
                  textAnchor="middle"
                  fontSize={9}
                  fill="var(--fg-muted)"
                  fontFamily="var(--font-pixel)"
                >
                  {f.leadsTo.join("/")}
                </text>
              )}
            </g>
          );
        })}

        {target && avatar && (() => {
          const sprite = avatarSprite(avatar, skinTone);
          // Scale to a fixed drawn height rather than a fixed per-pixel factor,
          // so raising the sprite's grid resolution adds detail without
          // growing the commuter and crowding the neighbouring doors.
          const SPRITE_H = 36;
          const SCALE = SPRITE_H / sprite.rows.length;
          const w = sprite.cols * SCALE;
          const h = SPRITE_H;
          // For an estimate we only claim the car, so the commuter stands at
          // the middle of it. Placing the sprite at one door would imply a
          // precision the estimate explicitly disclaims.
          const anchorX = highlightWholeCar && targetCar
            ? carLeft(targetCar) + CAR_W / 2
            : target.x + DOOR_W / 2;
          const ox = anchorX - w / 2;
          const oy = TRAIN_Y + TRAIN_H + 11;
          return (
            <g className="anim-pop">
              {sprite.rows.flatMap((row, y) => {
                const cells = [];
                let x = 0;
                while (x < row.length) {
                  const ch = row[x];
                  let run = 1;
                  while (x + run < row.length && row[x + run] === ch) run++;
                  if (ch !== ".") {
                    cells.push(
                      <rect
                        key={`av-${x}-${y}`}
                        x={ox + x * SCALE}
                        y={oy + y * SCALE}
                        width={run * SCALE}
                        height={SCALE}
                        fill={sprite.fill(ch)}
                      />,
                    );
                  }
                  x += run;
                }
                return cells;
              })}
              {/* Feet line, so the sprite reads as standing rather than floating. */}
              <rect
                x={ox - 1}
                y={oy + h}
                width={w + 2}
                height={1.5}
                fill="var(--accent)"
              />
            </g>
          );
        })()}

        {target && !highlightWholeCar && (
          <polygon
            points={`${target.x + DOOR_W / 2},${TRAIN_Y + TRAIN_H + 4} ${target.x + DOOR_W / 2 - 6},${TRAIN_Y + TRAIN_H + 14} ${target.x + DOOR_W / 2 + 6},${TRAIN_Y + TRAIN_H + 14}`}
            fill="var(--accent)"
            stroke="var(--border)"
            strokeWidth={1.5}
            className="anim-blink"
          />
        )}

        {towards && (
          <text
            x={width - 2}
            y={height - 4}
            textAnchor="end"
            fontSize={9}
            fill="var(--fg-muted)"
            fontFamily="var(--font-pixel)"
          >
            → {towards}
          </text>
        )}
      </svg>
    </div>
  );
}
