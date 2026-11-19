/**
 * Gedeelde types voor het Huiskamer-lab (hartslag-dirigent).
 * De instrumenten zijn bewust niet-talig: klokken, filmmuziek, apparaten, licht, geluid.
 */

export const SCORE_MOODS = [
  'stilte',
  'rust',
  'zweven',
  'spanning',
  'opbouw',
  'triomf',
  'hartslag',
] as const;
export type ScoreMood = (typeof SCORE_MOODS)[number];

export const APPLIANCES = [
  'vaatwasser',
  'koelkast',
  'magnetron',
  'koffiemachine',
  'waterkoker',
  'stofzuiger',
] as const;
export type ApplianceId = (typeof APPLIANCES)[number];

export const SFX_PRESETS = [
  'deurbel',
  'servies_valt',
  'regen_op_raam',
  'vogels',
  'telefoon',
  'onweer',
  'kat_spint',
] as const;
export type SfxPreset = (typeof SFX_PRESETS)[number];

export type ClockState = { bpm: number; volume: number }; // bpm 0 = stil

export type InstrumentState = {
  clocks: ClockState[];
  score: { mood: ScoreMood; intensity: number };
  lamp: { brightness: number; warmth: number }; // 0..1, warmth 1 = warm/oranje
  appliances: Record<ApplianceId, boolean>;
};

export type Intervention =
  | { kind: 'clock'; clock: number; bpm: number; volume: number }
  | { kind: 'score'; mood: ScoreMood; intensity: number }
  | { kind: 'lamp'; brightness: number; warmth: number }
  | { kind: 'appliance'; appliance: ApplianceId; on: boolean }
  | { kind: 'sfx'; sound: SfxPreset }
  | { kind: 'generate_sound'; description: string }
  | { kind: 'wait' };

export type LoggedIntervention = {
  t: number; // seconden sinds start
  source: 'claude' | 'regelaar' | 'handmatig';
  intervention: Intervention;
};

export type DirigentRequest = {
  t: number;
  exercise: string;
  target: number;
  groupAvg: number;
  groupSpread: number; // standaarddeviatie
  trend30s: number; // bpm verschil t.o.v. 30s geleden
  history: { t: number; avg: number; spread: number }[]; // ca. elke 5s, laatste ~3 min
  persons: { id: string; hr: number; real: boolean }[];
  instruments: InstrumentState;
  recent: LoggedIntervention[];
  allowGenerate: boolean;
};

export type DirigentResponse = {
  intent: string;
  interventions: Intervention[];
  model: string;
};
