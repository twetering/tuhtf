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

