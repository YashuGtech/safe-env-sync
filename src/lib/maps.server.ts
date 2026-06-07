/**
 * Level generator — ported from the Java Flappy Bird reference.
 *
 * Reference (see uploaded Flappy zip, GameLoop.java / Pipe.java / Map.java):
 *   • Canvas 1280×720, 6 pipes recycled across the screen.
 *   • pipeWidth = 52, pipeGap = 180, top-pipe offset random in [100..350].
 *   • Spacing between pipes = 1280 / 6 ≈ 213 px.
 *   • Scroll = 3 px every 20 ms = 150 px/s ⇒ scroll_speed = 2.5 (×60fps).
 *
 * All levels now use this same arrangement. Background image, obstacle art
 * and per-level metadata stay intact — only the pipe arrangement / gap /
 * spacing are normalized to the Java reference.
 */
import type { LevelObject } from "@/lib/game.functions";

export type BgKind = "sunset_city" | "night_city" | "nebula" | "desert" | "neon_grid" | "aurora";

export type MapTemplate = {
  id: number;
  name: string;
  bg_color: string;
  bg_kind?: BgKind;
  gravity: number;
  jump_strength: number;
  scroll_speed: number;
  pipe_gap: number;
  pool: LevelObject["obj_type"][];
};

const rnd = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
};

const obj = (
  t: LevelObject["obj_type"],
  x_time: number,
  y: number,
  props: Record<string, number | string | boolean> = {},
): Omit<LevelObject, "id"> => ({ obj_type: t, x_time, y, props });

/* ─── Java reference constants ───────────────────────────────────── */
const REF_W = 1280;
const REF_H = 720;
const REF_PIPE_GAP = 180;
const REF_SPACING_PX = REF_W / 6;        // 213.33 px
const REF_SPEED_PX_PER_SEC = 150;        // 3 px / 20 ms
const REF_OFFSET_MIN = 100;              // Java: (int)(100 + rand*250)
const REF_OFFSET_MAX = 350;

// Spawn interval in seconds (framerate-independent).
const SPAWN_INTERVAL_SEC = REF_SPACING_PX / REF_SPEED_PX_PER_SEC; // ≈ 1.422 s

// Normalized gap-center range derived from the Java random offset:
//   gapCenter = topOffset + pipeGap/2
const GAP_Y_MIN = (REF_OFFSET_MIN + REF_PIPE_GAP / 2) / REF_H; // ≈ 0.264
const GAP_Y_MAX = (REF_OFFSET_MAX + REF_PIPE_GAP / 2) / REF_H; // ≈ 0.611

/* ─── Map templates (background flavours only — pipes are identical) ── */
export const MAP_TEMPLATES: MapTemplate[] = [
  { id: 1,  name: "Classic Pipes",  bg_color: "#0a0a0f", bg_kind: "sunset_city", gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
  { id: 2,  name: "Night Run",      bg_color: "#0f0a14", bg_kind: "night_city",  gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
  { id: 3,  name: "Nebula",         bg_color: "#150f0a", bg_kind: "nebula",      gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
  { id: 4,  name: "Desert Flight",  bg_color: "#0a0f14", bg_kind: "desert",      gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
  { id: 5,  name: "Neon Grid",      bg_color: "#100b04", bg_kind: "neon_grid",   gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
  { id: 6,  name: "Aurora",         bg_color: "#14080a", bg_kind: "aurora",      gravity: 0.5, jump_strength: -8, scroll_speed: 2.5, pipe_gap: REF_PIPE_GAP, pool: ["pipe"] },
];

/**
 * Java-faithful pipe builder, with bonus obstacles from level 4 onward:
 *   • Spikes — snap to top or bottom edge, cones face the player.
 *   • Blades — hang from the ceiling on a chain, rotating saw at the bottom,
 *     positioned in the player's flight lane (not at the very top).
 * Spawned in the safe zone between pipes so the player can still pass.
 */
function buildPipes(
  duration: number,
  seed: number,
  levelIndex: number,
): Omit<LevelObject, "id">[] {
  const r = rnd(seed);
  const out: Omit<LevelObject, "id">[] = [];
  const withExtras = levelIndex >= 4;
  // Difficulty ramps with level: more frequent extras at higher levels.
  const spikeChance = withExtras ? Math.min(0.55, 0.25 + (levelIndex - 4) * 0.01) : 0;
  const bladeChance = withExtras ? Math.min(0.45, 0.15 + (levelIndex - 4) * 0.008) : 0;

  let pipeIdx = 0;
  for (let t = 2.5; t < duration - 1.5; t += SPAWN_INTERVAL_SEC) {
    const y = GAP_Y_MIN + r() * (GAP_Y_MAX - GAP_Y_MIN);
    out.push(obj("pipe", t, y));
    // Coins are placed in a dedicated 60-coin pass below — not per pipe.

    if (withExtras && pipeIdx >= 1) {
      // Drop one extra obstacle BETWEEN pipes so player can still squeeze
      // through the pipe gap itself.
      const tBetween = t + SPAWN_INTERVAL_SEC * 0.5;
      const roll = r();
      if (roll < spikeChance) {
        // Snap to top (y<0.5) or bottom (y>0.5), cones face the player.
        const side = r() < 0.5 ? 0.05 : 0.95;
        out.push(obj("spike", tBetween, side));
      } else if (roll < spikeChance + bladeChance) {
        // Blade hangs from ceiling — its y is where the saw sits (in player's path).
        const bladeY = 0.35 + r() * 0.35; // 0.35..0.70 of canvas height
        out.push(obj("blade", tBetween, bladeY, { speed: 4 + r() * 3 }));
      }
    }
    pipeIdx++;
  }

  // ── 60 collectible coins spread across the whole level ──
  // Placed evenly in time on varied Y positions inside the safe band
  // so the player can scoop them by weaving up/down.
  const COIN_COUNT = 60;
  const startT = 2;
  const endT = Math.max(startT + 1, duration - 1);
  const step = (endT - startT) / COIN_COUNT;
  for (let i = 0; i < COIN_COUNT; i++) {
    const t = startT + i * step + (r() - 0.5) * step * 0.4;
    // Y range avoids the very top/bottom; weaves with a sine for variety.
    const yWeave = 0.35 + Math.sin(i * 0.7 + r() * 2) * 0.18 + (r() - 0.5) * 0.06;
    const y = Math.max(0.18, Math.min(0.82, yWeave));
    out.push(obj("coin", t, y));
  }
  return out;
}

/** Pick a deterministic background flavour for a given level index. */
export function pickMap(
  levelIndex: number,
  seed = 0,
): MapTemplate & { build: (d: number) => Omit<LevelObject, "id">[] } {
  const r = rnd(seed + levelIndex * 7919);
  const base = MAP_TEMPLATES[Math.floor(r() * MAP_TEMPLATES.length)];

  return {
    ...base,
    pipe_gap: REF_PIPE_GAP,
    scroll_speed: 2.5,
    pool: ["pipe"],
    build: (duration: number) =>
      buildPipes(duration, seed + levelIndex * 104729, levelIndex),
  };
}
