"use client";

import { useEffect, useState } from "react";

/**
 * Pixel-art avatars, drawn as inline SVG from a character grid.
 *
 * No external assets: each sprite is a 16x20 grid where every character maps to
 * a palette slot, so avatars stay crisp at any size, theme correctly, and cost
 * nothing to load.
 *
 * The grid used to be 12x16, which left about three rows for an entire face —
 * enough for two dots and a mouth, which read as noise rather than a person.
 * 16x20 buys brows, a lit pixel in each eye, a shaded cheek, jaw and neck, and
 * sleeves either side of the chest, which is what separates a character from a
 * smudge at this size.
 */

export const AVATAR_IDS = [
  "auntie",
  "uncle",
  "student",
  "office",
  "tourist",
  "rider",
  "meinu",
  "nsman",
  "ahma",
  "tudung",
  "turban",
  "ahbeng",
  "merlion",
] as const;

/** Not shown in Settings until it is found. */
export const SECRET_AVATARS: readonly AvatarId[] = ["merlion"];

export type AvatarId = (typeof AVATAR_IDS)[number];

// Referenced by SECRET_AVATARS above, which needs the type in scope first.

/**
 * Skin tones, light to deep.
 *
 * Kept separate from the character sprites so any avatar can be any tone —
 * baking tone into the sprite would have forced people to pick a character
 * that looks like them from a fixed short list, which is the wrong trade in a
 * country this mixed. Each tone carries its own shadow so the face keeps
 * definition rather than going flat at the deeper end.
 */
export const SKIN_TONES = [
  { id: "porcelain", base: "#f7d9bf", shade: "#dcb193" },
  { id: "light", base: "#f0c9a0", shade: "#d1a179" },
  { id: "tan", base: "#e0b088", shade: "#bf8a5f" },
  { id: "amber", base: "#c98a52", shade: "#a56c3a" },
  { id: "bronze", base: "#a3663a", shade: "#7d4b28" },
  { id: "deep", base: "#6f4326", shade: "#4f2e19" },
] as const;

export type SkinToneId = (typeof SKIN_TONES)[number]["id"];
export const DEFAULT_SKIN_TONE: SkinToneId = "tan";

function toneOf(id: SkinToneId | undefined) {
  return SKIN_TONES.find((t) => t.id === id) ?? SKIN_TONES[2];
}

/** Grid dimensions. Every row of every sprite must be exactly SPRITE_W long. */
export const SPRITE_W = 16;
export const SPRITE_H = 20;

/**
 * Palette keys:
 *   . transparent   k outline      s skin        t skin shade
 *   h hair          g hair light   e eye         w eye highlight
 *   a top           d top shade    b bottom      c accessory
 *
 * `s`/`t` follow the wearer's chosen skin tone, `k` and `w` are fixed, and the
 * rest are per-sprite.
 */
const BASE = [
  "................",
  ".....hggggh.....", // 1 crown, lit
  "...hhgggggghh...",
  "..hhhhhhhhhhhh..",
  "..hhsssssssshh..", // 4 forehead
  "..hhshhsshhshh..", // 5 brows
  "..hhswessweshh..", // 6 eyes
  "..hhtssssssthh..", // 7 cheeks
  "..hhsssttssshh..", // 8 nose
  "..hhsskkkksshh..", // 9 mouth
  "...htssssssth...", // 10 jaw
  "....tssssst.....", // 11 chin
  "......tsst......", // 12 neck
  "...daaassaaad...", // 13 shoulders, with a collar opening
  "..ddaaaaaaaadd..", // 14 sleeves flank the chest
  ".sddaaaaaaaadds.", // 15 hands
  ".sddaaaaaaaadds.",
  "..ddaaaaaaaadd..",
  "...bbbb..bbbb...", // 18 legs
  "...kkkk..kkkk...", // 19 shoes
];

/** Fixed white for the lit pixel in an eye — themed, it would go dead. */
const EYE_LIGHT = "#ffffff";

/** Spray, deliberately lighter than the tail so moving water reads as water. */
const SPOUT_FILL = "#8ed3ea";
const SPOUT_FRAME_MS = 90;

type SpoutFrame = readonly (readonly [number, number])[];

/**
 * Tap animation for the Merlion: successive frames of extra water pixels drawn
 * over the sprite. The jet leaves the mouth at (13, 8), arcs out and down, then
 * breaks up. Every coordinate lands on a transparent pixel of the sprite, which
 * `avatar.test.ts` checks — otherwise the water would just repaint the statue.
 */
const SPOUT_FRAMES: readonly SpoutFrame[] = [
  [[1, 6]],
  [[1, 6], [0, 6]],
  [[1, 6], [0, 6], [0, 7]],
  [[1, 6], [0, 6], [0, 7], [0, 8]],
  [[1, 6], [0, 6], [0, 7], [0, 8], [0, 9]],
  [[0, 6], [0, 7], [0, 8], [0, 9], [0, 10]],
  [[0, 7], [0, 9], [0, 11], [0, 12]],
  [[0, 11], [0, 13]],
];

interface Sprite {
  /** Message key for the accessible label — never a hardcoded string. */
  labelKey: string;
  /** Rows that differ from BASE, keyed by row index. */
  patch?: Record<number, string>;
  colors: Record<string, string>;
  /** Frames to play over the sprite when someone taps it. */
  spout?: readonly SpoutFrame[];
}

const SPRITES: Record<AvatarId, Sprite> = {
  auntie: {
    labelKey: "avatar.auntie",
    patch: {
      1: "....hggggggh....", // permed, higher and wider
      2: "..hhgggggggghh..",
      3: ".hhhhhhhhhhhhhh.",
      4: ".hhhsssssssshhh.",
      5: ".hhhshhsshhshhh.",
      6: ".hhhswessweshhh.",
      7: ".hhhtssssssthhh.",
      8: ".hhhsssttssshhh.",
      9: ".hhhsskkkksshhh.",
      10: "..hhtssssssthh..",
      15: ".sddaaaaaaaaddsc", // handbag over the arm
      16: "..ddaaaaaaaaddcc",
      17: "..ddaaaaaaaaddcc",
    },
    colors: { h: "#9aa0ad", g: "#c6cbd4", a: "#d4489b", d: "#9d3573", b: "#565a78", c: "#5c8ad4", e: "#2a2434" },
  },
  uncle: {
    labelKey: "avatar.uncle",
    patch: {
      1: "................",
      2: "....hggggggh....", // receded
      3: "..hhhhhhhhhhhh..",
      15: "csddaaaaaaaadds.", // kopi in hand
      16: "c.ddaaaaaaaadds.",
    },
    colors: { h: "#d8d8d8", g: "#f0f0f0", a: "#f4f1e8", d: "#b5b2ac", b: "#6b7280", c: "#8b5a2b", e: "#2a2434" },
  },
  student: {
    labelKey: "avatar.student",
    patch: {
      13: "...daaassaaad...",
      14: "..ddacaaaacadd..", // backpack straps
      15: ".sddacaaaacadds.",
      16: ".sddacaaaacadds.",
      17: "..ddacaaaacadd..",
    },
    colors: { h: "#2a2a3a", g: "#454560", a: "#4a9eda", d: "#3775a1", b: "#46587f", c: "#d4a017", e: "#2a2434" },
  },
  office: {
    labelKey: "avatar.office",
    patch: {
      14: "..ddaaaccaaadd..", // tie
      15: ".sddaaaccaaadds.",
      16: ".sddaaaccaaadds.",
      17: "..ddaaaccaaadd..",
    },
    colors: { h: "#1f1f2e", g: "#3a3a52", a: "#e8e8ee", d: "#acacb0", b: "#4a4a60", c: "#c0392b", e: "#2a2434" },
  },
  tourist: {
    labelKey: "avatar.tourist",
    patch: {
      1: "................",
      2: ".....cccccc.....",
      3: "...cccccccccc...",
      4: ".cccccccccccccc.", // sun hat brim
      5: "..hhshhsshhshh..",
      14: "..ddaaaccaaadd..", // camera on the chest
      15: ".sddaaaccaaadds.",
    },
    colors: { h: "#6b4423", g: "#8a5c30", a: "#2ecc71", d: "#229754", b: "#c9b896", c: "#e8d8a0", e: "#2a2434" },
  },
  rider: {
    labelKey: "avatar.rider",
    patch: {
      1: ".....cccccc.....", // helmet
      2: "...cccccccccc...",
      3: "..cccccccccccc..",
      4: "..cccccccccccc..", // visor
      5: "..ccshhsshhscc..",
      6: "..csswesswessc..",
      7: "..cstsssssstsc..",
      8: "..cssssttssssc..",
      9: "..cssskkkksssc..",
      10: "...ctsssssstc...", // strap under the chin
      14: "..ccaaaaaaaacc..", // reflective band
    },
    colors: { h: "#1f1f2e", g: "#3a3a52", a: "#e8542f", d: "#ac3e23", b: "#4a4a60", c: "#1f6f4a", e: "#2a2434" },
  },
  meinu: {
    labelKey: "avatar.meinu",
    patch: {
      1: "....hggggggh....",
      2: "..hhgggggggghh..",
      3: ".hhhhhhhhhhhhhh.",
      4: ".hhhsssssssshhh.",
      5: ".hhhshhsshhshhh.",
      6: ".hhhswessweshhh.",
      7: ".hhhtssssssthhh.",
      8: ".hhhsssttssshhh.",
      9: ".hhhsskkkksshhh.",
      10: ".hhhtssssssthhh.",
      11: ".hhhtssssssthhh.",
      12: ".hhh..tsst..hhh.", // hair falls past the shoulders
      13: ".hhdaaassaaadhh.",
      15: ".sddaaaaaaaaddsc", // sling bag
      16: "..ddaaaaaaaaddcc",
    },
    colors: { h: "#3a2317", g: "#5a3a24", a: "#e85fa0", d: "#ac4676", b: "#61508a", c: "#c98a52", e: "#2a2434" },
  },
  nsman: {
    labelKey: "avatar.nsman",
    patch: {
      1: "................",
      2: "...cccccccccc...", // cap
      3: "..cccccccccccc..",
      4: "..ccsssssssscc..",
      5: "..hhshhsshhshh..",
      13: "...daaaccaaad...", // rank on the collar
    },
    colors: { h: "#1f1f2e", g: "#3a3a52", a: "#4a5d3a", d: "#37452b", b: "#56683f", c: "#2f3d24", e: "#2a2434" },
  },
  ahma: {
    labelKey: "avatar.ahma",
    patch: {
      0: ".......hh.......", // bun
      13: "...daaassaaad..c", // walking stick, held all the way down
      14: "..ddaaaaaaaadd.c",
      15: ".sddaaaaaaaaddsc",
      16: ".sddaaaaaaaaddsc",
      17: "..ddaaaaaaaadd.c",
      18: "...bbbb..bbbb..c",
      19: "...kkkk..kkkk..c",
    },
    colors: { h: "#dcdcdc", g: "#f4f4f4", a: "#8fbf6f", d: "#6a8d52", b: "#5c5c73", c: "#8b5a2b", e: "#2a2434" },
  },
  tudung: {
    labelKey: "avatar.tudung",
    patch: {
      1: ".....cccccc.....", // headscarf
      2: "...cccccccccc...",
      3: "..cccccccccccc..",
      4: "..ccsssssssscc..",
      5: "..ccshhsshhscc..",
      6: "..ccswesswescc..",
      7: "..cctsssssstcc..",
      8: "..ccsssttssscc..",
      9: "..ccsskkkksscc..",
      10: "..cctsssssstcc..",
      11: "..cctsssssstcc..",
      12: "..cccccccccccc..", // draped under the chin
      13: "..cccccccccccc..",
    },
    colors: { h: "#2a2a3a", g: "#454560", a: "#5aa9c9", d: "#437d95", b: "#46587f", c: "#7b5ea7", e: "#2a2434" },
  },
  turban: {
    labelKey: "avatar.turban",
    patch: {
      1: "....cccccccc....", // turban
      2: "..cccccccccccc..",
      3: ".cccccccccccccc.",
      4: ".cccccccccccccc.",
      5: "..ccshhsshhscc..",
      10: "..hhhhhhhhhhhh..", // beard
      11: "...hhhhhhhhhh...",
      12: "....hhhhhhhh....",
      13: "...daaaaaaaad...",
    },
    colors: { h: "#4a4a55", g: "#63636f", a: "#e8e8ee", d: "#acacb0", b: "#4a4a60", c: "#c0392b", e: "#2a2434" },
  },
  ahbeng: {
    labelKey: "avatar.ahbeng",
    patch: {
      0: "..h.h.h..h.h.h..", // spiked and bleached
      1: ".hhhhhhhhhhhhhh.",
      2: "..hhgggggggghh..",
      13: "...daaaccaaad...",
      14: "..ddaaaaaaaadd..",
      15: ".sddccccccccdds.", // loud banded shirt
      16: ".sddaaaaaaaadds.",
      17: "..ddccccccccdd..",
    },
    colors: { h: "#e8c34a", g: "#f7e39a", a: "#e8542f", d: "#ac3e23", b: "#3f3f57", c: "#2ecc71", e: "#2a2434" },
  },
  merlion: {
    labelKey: "avatar.merlion",
    patch: {
      0: ".........hhhh...",
      1: ".......aahhhhhh.",
      2: "......aaaahhhhh.",
      3: ".....aaaaaahhhhh",
      4: "....aaeaaaaahhh.",
      5: "..aaaaaaaaaahhhh",
      6: "..eeaaaaaaaahhh.",
      7: "...eaaaaaaaahhhh",
      8: "....aaaaaaaahhh.",
      9: ".....aaaaaahhh..", // snout
      10: "......hhhhhhhh..", // mane
      11: ".....aaaaaaaa...",
      12: "....aaaaaaaaaa..",
      13: "....aaaaaaaaaa..",
      14: "....aaaaaaaaad..",
      15: "...caaaaaaaaad..",
      16: "..ccaaaaaaaaad..",
      17: ".cccaaaaaaaaad..",
      18: "ccccaaaaaaaad...", // tail fins, not legs
      19: ".cccaaaaaaad....",
    },
    colors: { h: "#ffffff", a: "#b9c9dc", d: "#8995a3", c: "#8ba5c4", e: "#2a2434" },
    spout: SPOUT_FRAMES,
  },
};

function paletteFor(sprite: Sprite, tone: (typeof SKIN_TONES)[number]) {
  return (ch: string): string => {
    switch (ch) {
      case "k":
        return "var(--border)";
      case "s":
        return tone.base;
      case "t":
        return tone.shade;
      case "w":
        return EYE_LIGHT;
      default:
        return sprite.colors[ch] ?? "var(--fg)";
    }
  };
}

function gridFor(sprite: Sprite): string[] {
  return BASE.map((row, i) => sprite.patch?.[i] ?? row);
}

interface Props {
  id: AvatarId;
  /** Rendered size in CSS pixels. */
  size?: number;
  className?: string;
  /** Accessible label, already translated by the caller. */
  label?: string;
  /** Purely ornamental here — hidden from assistive tech rather than announced
   *  as an image with no name. */
  decorative?: boolean;
  skinTone?: SkinToneId;
}

export function Avatar({ id, size = 48, className, label, decorative, skinTone }: Props) {
  const sprite = SPRITES[id];
  // -1 is at rest. Any other value is the frame of the tap animation showing.
  const [frame, setFrame] = useState(-1);
  const spout = sprite.spout;

  useEffect(() => {
    if (frame < 0 || !spout) return;
    const next = frame + 1 < spout.length ? frame + 1 : -1;
    const timer = setTimeout(() => setFrame(next), SPOUT_FRAME_MS);
    return () => clearTimeout(timer);
  }, [frame, spout]);

  function play() {
    // Someone who has asked for less motion gets the avatar, not the fountain.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setFrame(0);
  }

  const rows = gridFor(sprite);
  const fill = paletteFor(sprite, toneOf(skinTone));
  const cols = rows[0].length;

  const cells: React.ReactElement[] = [];
  rows.forEach((row, y) => {
    // Merge horizontal runs of the same colour into one rect — at this grid
    // size that is the difference between ~320 nodes and roughly 90.
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let run = 1;
      while (x + run < row.length && row[x + run] === ch) run++;
      if (ch !== ".") {
        cells.push(
          <rect key={`${x}-${y}`} x={x} y={y} width={run} height={1} fill={fill(ch)} />,
        );
      }
      x += run;
    }
  });

  return (
    <svg
      viewBox={`0 0 ${cols} ${rows.length}`}
      width={size}
      height={(size * rows.length) / cols}
      className={className}
      {...(decorative
        ? { "aria-hidden": true, focusable: false }
        : { role: "img", "aria-label": label })}
      shapeRendering="crispEdges"
      onPointerDown={spout ? play : undefined}
      style={spout ? { cursor: "pointer" } : undefined}
    >
      {cells}
      {frame >= 0 &&
        spout?.[frame].map(([x, y]) => (
          <rect key={`w-${x}-${y}`} x={x} y={y} width={1} height={1} fill={SPOUT_FILL} />
        ))}
    </svg>
  );
}

/**
 * The raw sprite grid, for callers that need to draw the avatar inside their
 * own SVG — the platform diagram puts the commuter on the platform at the door
 * they should stand at, which needs the pixels, not a nested <svg>.
 */
export function avatarSprite(id: AvatarId, skinTone?: SkinToneId) {
  const sprite = SPRITES[id];
  const rows = gridFor(sprite);
  return { rows, cols: rows[0].length, fill: paletteFor(sprite, toneOf(skinTone)) };
}

/** The tap animation's frames, if this avatar has one. For tests and callers
 *  that draw the sprite themselves. */
export function avatarSpout(id: AvatarId): readonly SpoutFrame[] | undefined {
  return SPRITES[id].spout;
}

/** Message key for an avatar's label, for the caller to translate. */
export function avatarLabelKey(id: AvatarId): string {
  return SPRITES[id].labelKey;
}
