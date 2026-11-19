import type { Point } from '../../lib/swarmTypes';

export const PUBLIC_MISSION = `Shared mission (everyone knows): Each turn, ONE straight segment in normalized coordinates (0–1). You all start from the left and race the same attractor T to the right. If you have a tip, your next segment must start there. You see all geometry but never see rivals’ private briefs — like Risk, you infer their intentions from lines alone and adapt.

Hard physics (enforced): always increase x; each hop is short (length ~0.015–0.07); stay in bounds. Your private rule may clash with others’ — that tension is the piece.`;

export const TARGET: Point = { x: 0.88, y: 0.5 };
