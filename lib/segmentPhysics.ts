/** Matches [src/lib/missions.ts](src/lib/missions.ts) default target. */
export const DEFAULT_TARGET = { x: 0.88, y: 0.5 };

/** Minimum progress along +x per tick (normalized 0–1). */
export const MIN_DELTA_X = 0.012;

/** Euclidean length of segment must stay in [STEP_MIN, STEP_MAX]. */
export const STEP_MIN = 0.014;
export const STEP_MAX = 0.068;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/**
 * Enforces: only forward in x (x2 > x1 + MIN_DELTA_X after clamp), and step length in range.
 * Mutates nothing; returns a new endpoint (x1,y1 unchanged).
 */
export function applyStepPhysics(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  target: { x: number; y: number } = DEFAULT_TARGET,
): { x2: number; y2: number } {
  let dx = x2 - x1;
  let dy = y2 - y1;

  const towardTx = target.x - x1;
  const towardTy = target.y - y1;
  const tLen = Math.hypot(towardTx, towardTy) || 1;

  if (dx < MIN_DELTA_X) {
    dx = (towardTx / tLen) * STEP_MIN;
    dy = (towardTy / tLen) * STEP_MIN;
    if (dx < MIN_DELTA_X) {
      dx = MIN_DELTA_X;
      dy = towardTy * 0.02;
    }
  }

  let len = Math.hypot(dx, dy);
  if (len < 1e-9) {
    dx = MIN_DELTA_X;
    dy = 0;
    len = MIN_DELTA_X;
  }

  if (len > STEP_MAX) {
    const s = STEP_MAX / len;
    dx *= s;
    dy *= s;
    len = STEP_MAX;
  } else if (len < STEP_MIN) {
    const s = STEP_MIN / len;
    dx *= s;
    dy *= s;
    len = STEP_MIN;
  }

  let nx2 = clamp01(x1 + dx);
  let ny2 = clamp01(y1 + dy);

  if (nx2 <= x1 + MIN_DELTA_X * 0.85) {
    nx2 = clamp01(x1 + MIN_DELTA_X);
    ny2 = clamp01(y1 + (ny2 - y1) * 0.4);
  }

  nx2 = clamp01(nx2);
  ny2 = clamp01(ny2);

  if (nx2 <= x1) {
    nx2 = clamp01(x1 + MIN_DELTA_X);
  }

  return { x2: nx2, y2: ny2 };
}
