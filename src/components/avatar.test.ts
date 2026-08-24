import { describe, expect, it } from "vitest";
import {
  AVATAR_IDS,
  SKIN_TONES,
  SPRITE_H,
  SPRITE_W,
  avatarLabelKey,
  avatarSpout,
  avatarSprite,
} from "./Avatar";

/**
 * The sprites are hand-authored character grids, so a single mistyped row
 * shears the whole avatar sideways without failing anything else. These guard
 * the invariants that the grid format depends on.
 */
describe("avatar sprites", () => {
  it("every avatar is a full SPRITE_W x SPRITE_H grid", () => {
    for (const id of AVATAR_IDS) {
      const { rows, cols } = avatarSprite(id);
      expect(rows, id).toHaveLength(SPRITE_H);
      expect(cols, id).toBe(SPRITE_W);
      rows.forEach((row, i) => {
        expect(row.length, `${id} row ${i}`).toBe(SPRITE_W);
      });
    }
  });

  it("every drawn pixel resolves to a colour", () => {
    for (const id of AVATAR_IDS) {
      const { rows, fill } = avatarSprite(id);
      for (const row of rows) {
        for (const ch of row) {
          if (ch === ".") continue;
          // var(--fg) is the palette's last resort, so reaching it means the
          // sprite uses a key its colours never defined.
          expect(fill(ch), `${id} palette key "${ch}"`).not.toBe("var(--fg)");
        }
      }
    }
  });

  it("skin and its shade follow the chosen tone", () => {
    for (const tone of SKIN_TONES) {
      const { fill } = avatarSprite("auntie", tone.id);
      expect(fill("s")).toBe(tone.base);
      expect(fill("t")).toBe(tone.shade);
    }
  });

  it("spout frames land on transparent pixels, never on the sprite", () => {
    for (const id of AVATAR_IDS) {
      const frames = avatarSpout(id);
      if (!frames) continue;
      const { rows } = avatarSprite(id);
      frames.forEach((frame, i) => {
        for (const [x, y] of frame) {
          expect(y, `${id} frame ${i}`).toBeLessThan(SPRITE_H);
          expect(x, `${id} frame ${i}`).toBeLessThan(SPRITE_W);
          // Water drawn over the statue would just repaint it rather than read
          // as a jet leaving the mouth.
          expect(rows[y][x], `${id} frame ${i} at (${x},${y})`).toBe(".");
        }
      });
    }
  });

  it("labels are message keys, never literal text", () => {
    for (const id of AVATAR_IDS) {
      expect(avatarLabelKey(id)).toBe(`avatar.${id}`);
    }
  });
});
