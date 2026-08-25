/**
 * Telling a tap apart from a drag.
 *
 * Pure and separate because getting it wrong is silent and platform-specific:
 * a threshold that works for a finger can make a mouse unusable, and neither
 * shows up as an error.
 */

/**
 * How far a pointer may wander and still count as a tap, in CSS pixels.
 *
 * A finger that presses and lifts usually emits no movement at all, but a
 * mouse almost always jitters a pixel or two between button down and up. The
 * first version measured this in map units with a 0.01 threshold, where a
 * single screen pixel was around 250 times the limit — so every mouse click
 * registered as a drag and nothing on the map could be selected with a
 * trackpad, while touch worked perfectly.
 *
 * Six pixels is roughly what browsers themselves use to suppress a click
 * after a drag.
 */
export const TAP_SLOP_PX = 6;

export interface PointerPos {
  x: number;
  y: number;
}

/** True when the pointer moved far enough that this is a drag, not a tap. */
export function exceedsTapSlop(
  from: PointerPos,
  to: PointerPos,
  slop: number = TAP_SLOP_PX,
): boolean {
  return Math.hypot(to.x - from.x, to.y - from.y) > slop;
}
