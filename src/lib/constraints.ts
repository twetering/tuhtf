import { shuffle } from 'lodash';

/**
 * Six roles designed to interfere: magnet vs shield, cutter vs ghost, high vs low corridor.
 * Fixed order when exactly 6 players — same table, maximum crossed purposes.
 */
export const SIX_PLAYER_CONFLICT_SUITE: string[] = [
  'Private rule (MAGNET): When at least two other agents have visible tips, try to end within 0.065 norm of at least TWO of their tips — draft in their wake toward T.',
  'Private rule (SHIELD): When possible, end at least 0.095 norm away from EVERY other agent’s current tip — you need a sterile lane; crowding feels like sabotage.',
  'Private rule (CUTTER): When any other agent’s segment exists, your segment should cross at least ONE segment drawn by a DIFFERENT agent this turn if geometry allows — cut across their approach.',
  'Private rule (GHOST): Your segment must not intersect any segment from other agents (shared endpoints only if unavoidable). You need a clean slipstream.',
  'Private rule (HIGH LINE): Prefer ending this turn with y < 0.42 — own the upper corridor toward T; others may be trying to drag the swarm down.',
  'Private rule (LOW LINE): Prefer ending this turn with y > 0.58 — own the lower corridor; others may be squeezing you upward.',
];

/** Extra antagonisms for games with more than six agents. */
export const EXTENSION_ANTAGONIST_DECK: string[] = [
  'Private rule: Prefer landing with x2 < Tx (left of T) even if longer — block overshooters from the inside.',
  'Private rule: Prefer landing with x2 > Tx (right of T) when you can — force others to shorten or weave.',
  'Private rule: Zig-zag hard this turn (large |Δy|) while still moving right — waste others’ “flat” predictions.',
  'Private rule: Stay as flat as possible (|Δy| tiny) while moving right — punish agents betting on chaos.',
  'Private rule: Your segment must pass through the vertical band x ∈ [0.35, 0.55] if possible — occupy the choke.',
  'Private rule: Avoid the band x ∈ [0.35, 0.55] if possible — starve whoever is camping the middle.',
];

/** Legacy broad deck — used only to pad when extension deck exhausted. */
export const CONSTRAINT_DECK: string[] = [
  ...EXTENSION_ANTAGONIST_DECK,
  'Private rule: Touch y < 0.34 at least once this turn if geometry allows.',
  'Private rule: Touch y > 0.66 at least once this turn if geometry allows.',
];

export function drawPrivateConstraints(count: number): string[] {
  if (count <= 6) {
    return SIX_PLAYER_CONFLICT_SUITE.slice(0, count);
  }
  const base = [...SIX_PLAYER_CONFLICT_SUITE];
  const extra = shuffle([...EXTENSION_ANTAGONIST_DECK]);
  const pad = shuffle([...CONSTRAINT_DECK]);
  const out = [...base];
  let ei = 0;
  let pi = 0;
  while (out.length < count) {
    if (ei < extra.length) {
      out.push(extra[ei]);
      ei += 1;
    } else {
      out.push(pad[pi % pad.length]);
      pi += 1;
    }
  }
  return out;
}
