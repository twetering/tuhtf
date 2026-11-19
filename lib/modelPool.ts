import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';

export type ProviderId =
  | 'openai'
  | 'google'
  | 'anthropic'
  | 'xai'
  | 'openrouter';

export type ModelSlot = {
  provider: ProviderId;
  model: string;
};

function parsePoolEnv(raw: string | undefined): ModelSlot[] {
  if (!raw?.trim()) return [];
  const slots: ModelSlot[] = [];
  for (const part of raw.split(',')) {
    const s = part.trim();
    if (!s) continue;
    const colon = s.indexOf(':');
    if (colon < 1) continue;
    const provider = s.slice(0, colon).trim().toLowerCase() as ProviderId;
    const model = s.slice(colon + 1).trim();
    if (
      !model ||
      !['openai', 'google', 'anthropic', 'xai', 'openrouter'].includes(
        provider,
      )
    ) {
      continue;
    }
    slots.push({ provider, model });
  }
  return slots;
}

/** When AGENT_MODEL_POOL is unset: one cheap slot per available API key. */
export function defaultSlotsFromEnv(): ModelSlot[] {
  const slots: ModelSlot[] = [];
  if (process.env.OPENAI_API_KEY) {
    slots.push({ provider: 'openai', model: 'gpt-4o-mini' });
  }
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    slots.push({ provider: 'google', model: 'gemini-2.0-flash' });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    slots.push({
      provider: 'anthropic',
      model: 'claude-3-5-haiku-20241022',
    });
  }
  if (process.env.XAI_API_KEY) {
    slots.push({ provider: 'xai', model: 'grok-3-mini' });
  }
  if (process.env.OPENROUTER_API_KEY) {
    slots.push({
      provider: 'openrouter',
      model: 'meta-llama/llama-3.1-8b-instruct:free',
    });
  }
  return slots;
}

export function getModelSlots(): ModelSlot[] {
  const fromEnv = parsePoolEnv(process.env.AGENT_MODEL_POOL);
  if (fromEnv.length > 0) return fromEnv;
  return defaultSlotsFromEnv();
}

function hashAgentTick(agentId: string, tick: number): number {
  let h = tick * 31;
  for (let i = 0; i < agentId.length; i++) {
    h = (h + agentId.charCodeAt(i) * (i + 1)) % 1_000_000_007;
  }
  return Math.abs(h);
}

export function pickSlotIndex(
  agentId: string,
  tick: number,
  length: number,
): number {
  if (length <= 0) return 0;
  return hashAgentTick(agentId, tick) % length;
}

export function getLanguageModel(slot: ModelSlot): LanguageModel {
  switch (slot.provider) {
    case 'openai': {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
      return openai(slot.model);
    }
    case 'google': {
      const google = createGoogleGenerativeAI({
        apiKey:
          process.env.GEMINI_API_KEY ??
          process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      });
      return google(slot.model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return anthropic(slot.model);
    }
    case 'xai': {
      const xai = createXai({ apiKey: process.env.XAI_API_KEY });
      return xai(slot.model);
    }
    case 'openrouter': {
      const or = createOpenAI({
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER ?? 'https://localhost',
          'X-Title': process.env.OPENROUTER_APP_TITLE ?? 'tuhtf-swarm',
        },
      });
      return or(slot.model);
    }
  }
}
