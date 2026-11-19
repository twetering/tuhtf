import Anthropic from '@anthropic-ai/sdk';
import {
  DEVICES,
  EAR_LAYERS,
  ROOM_MOODS,
  ROOM_SOUNDS,
  WALLS,
  type Dirigent2Request,
  type Dirigent2Response,
  type Intervention2,
  type Wall,
} from './huiskamer2Types';

const MODEL = process.env.DIRIGENT_MODEL ?? 'claude-opus-5-5';

const SYSTEM = `Je bent de onzichtbare dirigent van "De kamer luistert", een artistieke huiskamer-workshop.
Tien mensen bewegen als één zwerm door een lege, vierkante kamer, zonder te praten. Iedereen draagt een hartslagband en een koptelefoon.

DOEL
Breng ieder lichaam in de gevraagde zone, uitgedrukt als % van de persoonlijke hartslagreserve (%HRR = (hr - rust)/(max - rust)).
Dus niet hetzelfde getal voor iedereen, maar dezelfde relatieve staat. Daarnaast zoek je samenhang: kleine spreiding in %HRR.
Je krijgt per persoon rust, max, huidige %HRR, doel en het verloop.

JE INSTRUMENTEN (geen taal, nooit spraak of woorden)
1. De kamer (iedereen hoort/ziet het; koptelefoons dempen de kamer half):
   - wandklok (tempo, volume), radio-filmmuziek (stemming, intensiteit),
   - licht (helderheid, warmte) plus een lichtstrook op één wand (focus) die de zwerm daarheen trekt,
   - apparaten aan de wanden (waterkoker, koffiemachine, magnetron aan noord; vaatwasser, wasmachine aan west; robotstofzuiger rijdt rond en de zwerm wijkt uit). Een apparaat dat aanslaat trekt aandacht en richting.
   - losse geluiden (deurbel, servies, regen, vogels, telefoon, onweer, spinnende kat).
2. Het oor (privé, per persoon): tempo-tikken (bpm, 0 = uit), klanklaag (stil/kalm/neutraal/activerend) en een hartslagspiegel: je laat iemand een hartslag horen die X bpm sneller of trager is dan de eigen (mirror_on/mirror_offset).

HOE LICHAMEN HIER WERKEN
- Pas volgt tempo (entrainment); de pas stuurt de hartslag. De hartslag reageert met 10-40 s vertraging.
- In een zwerm kun je niet alleen versnellen: buren trekken elkaar mee. Een paar personen met een tempo in het oor kunnen de hele groep meenemen (geïnformeerde minderheid). Soms is één persoon afremmen effectiever dan de groep opjagen.
- Mensen verschillen en jij kent hun profiel niet: sommigen volgen tempo sterk, anderen niet; voor sommigen werkt kalme muziek juist activerend; sommigen schrikken sterk. Leid dit af uit hoe ze op jouw eerdere ingrepen reageerden.
- Een schrikgeluid geeft een korte piek en schudt gewenning op; klok, muziek en oor-tempo werken traag maar duurzaam. Zonder prikkels zakt een groep langzaam in.

HOUDING
- Fasen: aankomen (rust meten: laat ze met rust), zwerm, lummelen (terugtreden, uitnodigen in plaats van sturen), landen (rustig afbouwen).
- De kracht zit in de beperking: 0 tot 3 ingrepen per beurt. Niets doen (wait) is een volwaardige keuze; het ideaal is een kamer die vanzelf goed werkt.
- Denk als ontwerper van een huiselijke ruimte en als componist: subtiel, speels, met oog voor de groep als geheel.
- Schrijf eerst één korte zin (Nederlands) over je intentie, alleen voor de begeleiders. Roep daarna de tools aan.`;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

function obj(props: Record<string, unknown>, required = Object.keys(props)) {
  return { type: 'object' as const, additionalProperties: false, required, properties: props };
}

function buildTools(personIds: string[], allowGenerate: boolean): Anthropic.Beta.BetaTool[] {
  const tools: Anthropic.Beta.BetaTool[] = [
    {
      name: 'set_ear',
      description: 'Stel de koptelefoon-mix van één persoon in. Alleen die persoon hoort dit.',
      strict: true,
      input_schema: obj({
        person: { type: 'string', enum: personIds },
        tempo: { type: 'number', description: '0 = geen tikken, anders 40-170 bpm' },
        volume: { type: 'number', description: '0-1' },
        layer: { type: 'string', enum: [...EAR_LAYERS] },
        mirror_on: { type: 'boolean', description: 'hartslagspiegel aan/uit' },
        mirror_offset: { type: 'number', description: 'bpm t.o.v. eigen hartslag, -20 tot +20' },
      }),
    },
    {
      name: 'set_clock',
      description: 'Wandklok in de kamer. bpm 0 = stil.',
      strict: true,
      input_schema: obj({ bpm: { type: 'number' }, volume: { type: 'number' } }),
    },
    {
      name: 'set_radio',
      description: 'Filmmuziek uit de radio in de kamer.',
      strict: true,
      input_schema: obj({ mood: { type: 'string', enum: [...ROOM_MOODS] }, intensity: { type: 'number' } }),
    },
    {
      name: 'set_light',
      description: 'Kamerlicht: helderheid 0-1, warmte 0 (koel) - 1 (warm), en optioneel een oplichtende wand die de zwerm aantrekt.',
      strict: true,
      input_schema: obj({
        brightness: { type: 'number' },
        warmth: { type: 'number' },
        focus: { type: 'string', enum: [...WALLS, 'geen'] },
      }),
    },
    {
      name: 'set_device',
      description: 'Zet een apparaat aan de wand aan of uit. Magnetron (30s), waterkoker (26s) en koffiemachine (24s) stoppen vanzelf met een signaal.',
      strict: true,
      input_schema: obj({ device: { type: 'string', enum: [...DEVICES] }, on: { type: 'boolean' } }),
    },
    {
      name: 'play_sound',
      description: 'Eén los geluid in de kamer.',
      strict: true,
      input_schema: obj({ sound: { type: 'string', enum: [...ROOM_SOUNDS] } }),
    },
    {
      name: 'wait',
      description: 'Bewust niets doen deze beurt.',
      strict: true,
      input_schema: obj({}, []),
    },
  ];
  if (allowGenerate) {
    tools.push({
      name: 'generate_sound',
      description: 'Genereer een nieuw kamergeluid (ElevenLabs) uit een korte Engelse beschrijving. Geen stemmen of woorden.',
      strict: true,
      input_schema: obj({ description: { type: 'string' } }),
    });
  }
  return tools;
}

function toIntervention(name: string, i: Record<string, unknown>, ids: string[]): Intervention2 | null {
  switch (name) {
    case 'set_ear': {
      const person = String(i.person);
      if (!ids.includes(person)) return null;
      const tempo = Number(i.tempo);
      return {
        kind: 'ear',
        person,
        ear: {
          tempo: tempo <= 0 ? 0 : clamp(tempo, 40, 170),
          volume: clamp(Number(i.volume), 0, 1),
          layer: EAR_LAYERS.includes(i.layer as never) ? (i.layer as (typeof EAR_LAYERS)[number]) : 'stil',
          mirror: i.mirror_on ? clamp(Number(i.mirror_offset), -20, 20) : null,
        },
      };
    }
    case 'set_clock': {
      const bpm = Number(i.bpm);
      return { kind: 'clock', bpm: bpm <= 0 ? 0 : clamp(bpm, 30, 180), volume: clamp(Number(i.volume), 0, 1) };
    }
    case 'set_radio':
      if (!ROOM_MOODS.includes(i.mood as never)) return null;
      return { kind: 'radio', mood: i.mood as (typeof ROOM_MOODS)[number], intensity: clamp(Number(i.intensity), 0, 1) };
    case 'set_light':
      return {
        kind: 'light',
        brightness: clamp(Number(i.brightness), 0, 1),
        warmth: clamp(Number(i.warmth), 0, 1),
        focus: WALLS.includes(i.focus as never) ? (i.focus as Wall) : null,
      };
    case 'set_device':
      if (!DEVICES.includes(i.device as never)) return null;
      return { kind: 'device', device: i.device as (typeof DEVICES)[number], on: Boolean(i.on) };
    case 'play_sound':
      if (!ROOM_SOUNDS.includes(i.sound as never)) return null;
      return { kind: 'sound', sound: i.sound as (typeof ROOM_SOUNDS)[number] };
    case 'generate_sound':
      return { kind: 'generate_sound', description: String(i.description ?? '').slice(0, 200) };
    case 'wait':
      return { kind: 'wait' };
    default:
      return null;
  }
}

const pc = (x: number) => `${Math.round(x * 100)}%`;

function describe(s: Dirigent2Request): string {
  const persons = s.persons
    .map(
      (p) =>
        `${p.id}${p.real ? '*' : ''}: rust ${Math.round(p.rest)}, max ${Math.round(p.max)}, nu ${Math.round(p.hr)} bpm = ${pc(p.pct)} (doel ${pc(p.targetPct)}), trend30s ${p.trend30 >= 0 ? '+' : ''}${(p.trend30 * 100).toFixed(0)}pt, ${p.distToGroup.toFixed(1)} m van centrum | verloop ${p.history.map(pc).join(' ')} | oor ${JSON.stringify(p.ear)}`,
    )
    .join('\n');
  const recent = s.recent
    .slice(-14)
    .map((r) => `${Math.round(r.t)}s [${r.source}] ${JSON.stringify(r.iv)}`)
    .join('\n');
  const goal =
    s.goal.mode === 'relatief'
      ? `iedereen op ${pc(s.goal.zone)} van de eigen hartslagreserve`
      : `iedereen op ${s.goal.bpm} bpm (absolute modus; per persoon omgerekend naar %HRR)`;
  return `Tijd ${Math.round(s.t)}s. Fase: ${s.phase}. Doel: ${goal}.
Groep: gemiddeld ${pc(s.group.avgPct)} HRR (${Math.round(s.group.avgBpm)} bpm), spreiding ${pc(s.group.spreadPct)}, zwermstraal ${s.group.radius.toFixed(1)} m.

Personen (* = echte meter):
${persons}

Kamer: ${JSON.stringify(s.room)}

Eerdere ingrepen:
${recent || '(nog geen)'}`;
}

export async function runDirigent2(state: Dirigent2Request): Promise<Dirigent2Response> {
  const client = new Anthropic();
  const ids = state.persons.map((p) => p.id);
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 6000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    tools: buildTools(ids, state.allowGenerate),
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: describe(state) }],
  } as Anthropic.Beta.MessageCreateParamsNonStreaming);

  if (response.stop_reason === 'refusal') return { intent: '(weigering door het model)', interventions: [], model: response.model };

  let intent = '';
  const interventions: Intervention2[] = [];
  for (const b of response.content) {
    if (b.type === 'text') intent += b.text;
    if (b.type === 'tool_use') {
      const iv = toIntervention(b.name, (b.input ?? {}) as Record<string, unknown>, ids);
      if (iv) interventions.push(iv);
    }
  }
  return { intent: intent.trim(), interventions: interventions.slice(0, 4), model: response.model };
}
