import Anthropic from '@anthropic-ai/sdk';
import {
  APPLIANCES,
  SCORE_MOODS,
  SFX_PRESETS,
  type DirigentRequest,
  type DirigentResponse,
  type Intervention,
} from './huiskamerTypes';

const MODEL = process.env.DIRIGENT_MODEL ?? 'claude-opus-5-5';

const SYSTEM = `Je bent de onzichtbare dirigent van een huiskamer-workshop (artistiek prototype).
Tien mensen dragen een hartslagmeter en doen samen een oefening in een huiselijke ruimte, zonder te praten.
Jouw opdracht: breng de GEMIDDELDE hartslag van de groep naar het doel (meestal 100 bpm) en houd hem daar.
Secundair: laat de hartslagen naar elkaar toe bewegen ("heartbeat alignment", kleine spreiding).

Je hebt GEEN taal richting de deelnemers. Je kunt alleen de ruimte bespelen:
- analoge klokken die tikken (tempo in bpm en volume; mensen stemmen hun pas en adem onbewust af op het tikken),
- filmmuziek-stemmingen (stilte, rust, zweven, spanning, opbouw, triomf, hartslag) met intensiteit,
- huiskamerlicht (helderheid en warmte),
- huishoudelijke apparaten (vaatwasser, koelkast, magnetron, koffiemachine, waterkoker, stofzuiger),
- losse geluiden (deurbel, servies dat valt, regen, vogels, telefoon, onweer, spinnende kat),
- eventueel een zelf beschreven geluidseffect (nooit stemmen, spraak of woorden).

Werkwijze en houding:
- Hartslag reageert traag: 10-40 seconden vertraging. Kijk naar de trend en naar het effect van je vorige ingrepen voordat je opnieuw ingrijpt.
- De kracht zit in de beperking. Doe per beurt 0 tot 2 ingrepen. Niets doen (wait) is vaak de beste keuze als de groep op koers is.
- Denk als ontwerper van een huiselijke ruimte: hoe nodigt een kamer uit tot onrust of tot lummelen, rust en verbinding? Wees subtiel en speels, niet bombastisch.
- Een plotseling geluid geeft een korte schrikpiek; een tikkende klok en muziek sturen langzamer maar duurzamer.
- Schrijf bij elke beurt eerst één korte zin (Nederlands) over je intentie, alleen voor de begeleiders. Roep daarna de tools aan.`;

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function buildTools(allowGenerate: boolean): Anthropic.Beta.BetaTool[] {
  const tools: Anthropic.Beta.BetaTool[] = [
    {
      name: 'set_clock',
      description:
        'Stel een tikkende klok in. bpm 0 = klok stil. Mensen stemmen pas/adem onbewust af op het tikken.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['clock', 'bpm', 'volume'],
        properties: {
          clock: { type: 'integer', enum: [1, 2], description: 'klok 1 (woonkamer) of 2 (keuken)' },
          bpm: { type: 'number', description: '0 of 30-200 tikken per minuut' },
          volume: { type: 'number', description: '0-1' },
        },
      },
    },
    {
      name: 'set_score',
      description: 'Kies de filmmuziek-stemming en intensiteit (0-1).',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['mood', 'intensity'],
        properties: {
          mood: { type: 'string', enum: [...SCORE_MOODS] },
          intensity: { type: 'number' },
        },
      },
    },
    {
      name: 'set_lamp',
      description: 'Stel het huiskamerlicht in. brightness 0-1, warmth 0 (koel/blauwig) tot 1 (warm/oranje).',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['brightness', 'warmth'],
        properties: {
          brightness: { type: 'number' },
          warmth: { type: 'number' },
        },
      },
    },
    {
      name: 'set_appliance',
      description: 'Zet een huishoudelijk apparaat aan of uit (magnetron en waterkoker stoppen vanzelf met een signaal).',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['appliance', 'on'],
        properties: {
          appliance: { type: 'string', enum: [...APPLIANCES] },
          on: { type: 'boolean' },
        },
      },
    },
    {
      name: 'play_sound',
      description: 'Speel één los huiselijk geluid af.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['sound'],
        properties: { sound: { type: 'string', enum: [...SFX_PRESETS] } },
      },
    },
    {
      name: 'wait',
      description: 'Bewust niets doen deze beurt.',
      strict: true,
      input_schema: { type: 'object', additionalProperties: false, required: [], properties: {} },
    },
  ];
  if (allowGenerate) {
    tools.push({
      name: 'generate_sound',
      description:
        'Laat een nieuw geluidseffect genereren (ElevenLabs) uit een korte Engelse beschrijving. Geen stemmen of woorden. Duurt enkele seconden voordat het klinkt.',
      strict: true,
      input_schema: {
        type: 'object',
        additionalProperties: false,
        required: ['description'],
        properties: { description: { type: 'string' } },
      },
    });
  }
  return tools;
}

function toIntervention(name: string, input: Record<string, unknown>): Intervention | null {
  switch (name) {
    case 'set_clock': {
      const bpm = Number(input.bpm);
      return {
        kind: 'clock',
        clock: clamp(Number(input.clock), 1, 2) - 1,
        bpm: bpm <= 0 ? 0 : clamp(bpm, 30, 200),
        volume: clamp(Number(input.volume), 0, 1),
      };
    }
    case 'set_score':
      if (!SCORE_MOODS.includes(input.mood as never)) return null;
      return {
        kind: 'score',
        mood: input.mood as (typeof SCORE_MOODS)[number],
        intensity: clamp(Number(input.intensity), 0, 1),
      };
    case 'set_lamp':
      return {
        kind: 'lamp',
        brightness: clamp(Number(input.brightness), 0, 1),
        warmth: clamp(Number(input.warmth), 0, 1),
      };
    case 'set_appliance':
      if (!APPLIANCES.includes(input.appliance as never)) return null;
      return {
        kind: 'appliance',
        appliance: input.appliance as (typeof APPLIANCES)[number],
        on: Boolean(input.on),
      };
    case 'play_sound':
      if (!SFX_PRESETS.includes(input.sound as never)) return null;
      return { kind: 'sfx', sound: input.sound as (typeof SFX_PRESETS)[number] };
    case 'generate_sound':
      return { kind: 'generate_sound', description: String(input.description ?? '').slice(0, 200) };
    case 'wait':
      return { kind: 'wait' };
    default:
      return null;
  }
}

function describeState(s: DirigentRequest): string {
  const hist = s.history
    .slice(-36)
    .map((h) => `${Math.round(h.t)}s: gem ${h.avg.toFixed(0)} (spreiding ${h.spread.toFixed(0)})`)
    .join('\n');
  const recent = s.recent
    .slice(-10)
    .map((r) => `${Math.round(r.t)}s [${r.source}] ${JSON.stringify(r.intervention)}`)
    .join('\n');
  const persons = s.persons
    .map((p) => `${p.id}${p.real ? '*' : ''}:${Math.round(p.hr)}`)
    .join('  ');
  return `Tijd: ${Math.round(s.t)}s. Oefening: "${s.exercise}". Doel: ${s.target} bpm.
Nu: gemiddeld ${s.groupAvg.toFixed(1)} bpm, spreiding ${s.groupSpread.toFixed(1)}, trend laatste 30s ${s.trend30s >= 0 ? '+' : ''}${s.trend30s.toFixed(1)}.
Per persoon (* = echte meter): ${persons}

Verloop:
${hist || '(nog geen verloop)'}

Huidige stand van de ruimte: ${JSON.stringify(s.instruments)}

Eerdere ingrepen:
${recent || '(nog geen)'}`;
}

export async function runDirigent(state: DirigentRequest): Promise<DirigentResponse> {
  const client = new Anthropic();
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: buildTools(state.allowGenerate),
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: describeState(state) }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') {
    return { intent: '(weigering door het model)', interventions: [], model: response.model };
  }

  let intent = '';
  const interventions: Intervention[] = [];
  for (const block of response.content) {
    if (block.type === 'text') intent += block.text;
    if (block.type === 'tool_use') {
      const iv = toIntervention(block.name, (block.input ?? {}) as Record<string, unknown>);
      if (iv) interventions.push(iv);
    }
  }
  return { intent: intent.trim(), interventions: interventions.slice(0, 3), model: response.model };
}
