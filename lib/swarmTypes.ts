import type { AgentModelOutput } from './agentOutputSchema';

export type Point = { x: number; y: number };

export type Segment = {
  agentId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type AgentTurnRequest = {
  agentId: string;
  tick: number;
  publicMission: string;
  privateConstraint: string;
  target: Point;
  /** Normalized 0–1; null = start new stroke from left margin */
  yourCurrentTip: Point | null;
  segments: Segment[];
};

export type AgentTurnResponse = AgentModelOutput & {
  usedProvider: string;
  usedModel: string;
};
