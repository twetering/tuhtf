import { generateObject } from 'ai';
import { agentOutputSchema } from './agentOutputSchema';
import type { AgentTurnRequest, AgentTurnResponse } from './swarmTypes';
import {
  getLanguageModel,
  getModelSlots,
  pickSlotIndex,
  type ModelSlot,
} from './modelPool';
import { applyStepPhysics, DEFAULT_TARGET } from './segmentPhysics';

const SYSTEM = `You are one independent agent in a crowded race toward the same visible target T. You do NOT know other agents' private rules — only their drawn segments and tips (Risk-style: read the board, guess agendas).

You must choose ONE straight line segment for this turn, in normalized canvas coordinates where x and y are each between 0 and 1.

Rules:
- Output valid JSON matching the schema only. No markdown.
- reasoning: max 2 short sentences — your tactical move only (no feelings).
- affectiveLine: 1–2 sentences first person — visceral, competitive, adaptive.
- inferredOthersGoals: 1 short sentence — what you GUESS at least one rival is optimizing for, based ONLY on geometry (no mind-reading claims).
- rivalPlay: 1 short sentence — how you might subtly block, bait, or negotiate around them while still advancing (house-of-cards / fragile alliances).
- emotion: short label. emotionIntensity: 1–5.
- Keep everything brief — quick move, not a novel.

Segment rules (server clamps; comply up front):
- Start exactly at yourCurrentTip if provided; if null, start at x=0 with y in [0,1].
- Move forward in x only: x2 > x1.
- Short hops only: Euclidean length roughly 0.015–0.07 — no teleport.
- Stay inside [0,1].`;

function buildUserPayload(body: AgentTurnRequest): string {
  return JSON.stringify(
    {
      agentId: body.agentId,
      tick: body.tick,
      publicMission: body.publicMission,
      privateConstraint: body.privateConstraint,
      target: body.target,
      yourCurrentTip: body.yourCurrentTip,
      segmentsOnCanvas: body.segments.map((s) => ({
        agentId: s.agentId,
        from: { x: s.x1, y: s.y1 },
        to: { x: s.x2, y: s.y2 },
      })),
    },
    null,
    0,
  );
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function normalizeSegment(
  body: AgentTurnRequest,
  seg: AgentTurnResponse,
): void {
  if (body.yourCurrentTip) {
    seg.segment.x1 = clamp01(body.yourCurrentTip.x);
    seg.segment.y1 = clamp01(body.yourCurrentTip.y);
  } else {
    seg.segment.x1 = 0;
    seg.segment.y1 = clamp01(seg.segment.y1);
  }
  seg.segment.x2 = clamp01(seg.segment.x2);
  seg.segment.y2 = clamp01(seg.segment.y2);
}

async function trySlot(
  slot: ModelSlot,
  userPayload: string,
  body: AgentTurnRequest,
): Promise<AgentTurnResponse> {
  const model = getLanguageModel(slot);
  const { object } = await generateObject({
    model,
    schema: agentOutputSchema,
    system: SYSTEM,
    prompt: `Canvas and mission (JSON):\n${userPayload}`,
    maxOutputTokens: 560,
    temperature: 0.35,
    providerOptions: {
      xai: { reasoningEffort: 'low' as const },
    },
  });

  const out: AgentTurnResponse = {
    ...object,
    usedProvider: slot.provider,
    usedModel: slot.model,
  };
  normalizeSegment(body, out);
  const phys = applyStepPhysics(
    out.segment.x1,
    out.segment.y1,
    out.segment.x2,
    out.segment.y2,
    DEFAULT_TARGET,
  );
  out.segment.x2 = phys.x2;
  out.segment.y2 = phys.y2;
  return out;
}

export async function runAgentTurn(
  body: AgentTurnRequest,
): Promise<AgentTurnResponse> {
  const slots = getModelSlots();
  if (slots.length === 0) {
    throw new Error(
      'No model slots: set AGENT_MODEL_POOL or add at least one of OPENAI_API_KEY, GEMINI_API_KEY, ANTHROPIC_API_KEY, XAI_API_KEY, OPENROUTER_API_KEY',
    );
  }

  const start = pickSlotIndex(body.agentId, body.tick, slots.length);
  const userPayload = buildUserPayload(body);
  let lastError: unknown;

  for (let i = 0; i < slots.length; i++) {
    const idx = (start + i) % slots.length;
    const slot = slots[idx];
    try {
      return await trySlot(slot, userPayload, body);
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'Agent turn failed'));
}
