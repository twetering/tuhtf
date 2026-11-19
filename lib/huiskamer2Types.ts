/**
 * Types voor "De kamer luistert" (Huiskamer v2).
 * Twee kanalen: de kamer (gedeeld) en het oor (koptelefoon per persoon).
 * Doelen zijn relatief: % van de persoonlijke hartslagreserve (HRR).
 */

export const WALLS = ['noord', 'oost', 'zuid', 'west'] as const;
export type Wall = (typeof WALLS)[number];

export const ROOM_MOODS = ['stilte', 'rust', 'zweven', 'spanning', 'opbouw', 'triomf'] as const;
export type RoomMood = (typeof ROOM_MOODS)[number];

export const EAR_LAYERS = ['stil', 'kalm', 'neutraal', 'activerend'] as const;
export type EarLayer = (typeof EAR_LAYERS)[number];

export const DEVICES = ['waterkoker', 'koffiemachine', 'magnetron', 'vaatwasser', 'wasmachine', 'robotstofzuiger'] as const;
export type DeviceId = (typeof DEVICES)[number];

export const ROOM_SOUNDS = ['deurbel', 'servies_valt', 'regen_op_raam', 'vogels', 'telefoon', 'onweer', 'kat_spint'] as const;
export type RoomSound = (typeof ROOM_SOUNDS)[number];

export const PHASES = ['aankomen', 'zwerm', 'lummelen', 'landen'] as const;
export type Phase = (typeof PHASES)[number];

export type Ear = {
  tempo: number; // 0 = geen tikken, anders bpm
  volume: number; // 0..1
  layer: EarLayer;
  mirror: number | null; // null = uit, anders offset in bpm t.o.v. eigen hartslag
};

export type RoomState = {
  clock: { bpm: number; volume: number };
  radio: { mood: RoomMood; intensity: number };
  light: { brightness: number; warmth: number; focus: Wall | null };
  devices: Record<DeviceId, boolean>;
};

export type LabState = { room: RoomState; ears: Record<string, Ear> };

export type Intervention2 =
  | { kind: 'clock'; bpm: number; volume: number }
  | { kind: 'radio'; mood: RoomMood; intensity: number }
  | { kind: 'light'; brightness: number; warmth: number; focus: Wall | null }
  | { kind: 'device'; device: DeviceId; on: boolean }
  | { kind: 'sound'; sound: RoomSound }
  | { kind: 'generate_sound'; description: string }
  | { kind: 'ear'; person: string; ear: Ear }
  | { kind: 'wait' };

export type Source = 'claude' | 'regelaar' | 'hand';
export type Logged2 = { t: number; source: Source; iv: Intervention2 };

export type Goal = { mode: 'relatief' | 'absoluut'; zone: number; bpm: number };

export type PersonReport = {
  id: string;
  rest: number;
  max: number;
  hr: number;
  pct: number; // 0..1 van HRR
  targetPct: number;
  trend30: number; // verandering in pct-punten (0..1 schaal) over 30s
  history: number[]; // pct, elke 15s, laatste 2 min
  ear: Ear;
  real: boolean;
  distToGroup: number; // m tot zwermcentrum
};

export type Dirigent2Request = {
  t: number;
  phase: Phase;
  goal: Goal;
  group: { avgPct: number; spreadPct: number; avgBpm: number; radius: number };
  persons: PersonReport[];
  room: RoomState;
  recent: Logged2[];
  allowGenerate: boolean;
};

export type Dirigent2Response = { intent: string; interventions: Intervention2[]; model: string };
