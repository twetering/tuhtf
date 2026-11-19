/**
 * Digital twin van de huiskamer-workshop: 10 mensen, een ruimte met meubels en apparaten,
 * en een eenvoudig fysiologisch model (pas/cadans -> beweging -> hartslag, plus 'arousal').
 * Het model is bewust grof: het is een speelbord om interventies op te proberen,
 * geen medische simulatie. Echte hartslagbanden (Bluetooth) overschrijven de gesimuleerde hartslag.
 */
import type { ApplianceId, InstrumentState, ScoreMood, SfxPreset } from '../../lib/huiskamerTypes';

export const ROOM = { w: 9, h: 6 };

export type Rect = { x: number; y: number; w: number; h: number; label: string; kind: 'bank' | 'tafel' | 'keuken' | 'kast' | 'stoel' | 'kleed' };
export const FURNITURE: Rect[] = [
  { x: 0.9, y: 4.75, w: 2.6, h: 0.95, label: 'bank', kind: 'bank' },
  { x: 1.4, y: 3.4, w: 1.4, h: 0.7, label: 'salontafel', kind: 'tafel' },
  { x: 5.4, y: 2.6, w: 2.0, h: 1.0, label: 'eettafel', kind: 'tafel' },
  { x: 5.3, y: 0, w: 3.7, h: 0.65, label: 'keuken', kind: 'keuken' },
  { x: 0, y: 0, w: 0.45, h: 2.2, label: 'kast', kind: 'kast' },
  { x: 3.6, y: 4.9, w: 0.75, h: 0.75, label: 'stoel', kind: 'stoel' },
];

export const APPLIANCE_POS: Record<ApplianceId, { x: number; y: number }> = {
  koffiemachine: { x: 5.8, y: 0.32 },
  waterkoker: { x: 6.55, y: 0.32 },
  magnetron: { x: 7.35, y: 0.32 },
  vaatwasser: { x: 8.2, y: 0.32 },
  koelkast: { x: 8.7, y: 1.2 },
  stofzuiger: { x: 0.7, y: 2.6 },
};
export const CLOCK_POS = [
  { x: 2.6, y: 0.0, label: 'klok woonkamer' },
  { x: 9.0, y: 4.2, label: 'klok keuken' },
];
export const LAMP_POS = { x: 0.6, y: 4.2 };

export type Exercise = 'zwerm' | 'lummelen' | 'stilstaan';
export const EXERCISES: Record<Exercise, { label: string; instructie: string; cadence: number }> = {
  zwerm: {
    label: 'Zwerm',
    instructie: 'Beweeg door de ruimte, blijf binnen 1 meter van elkaar, zonder te praten.',
    cadence: 88,
  },
  lummelen: {
    label: 'Lummelen',
    instructie: 'Doe niets in het bijzonder. Hang, zit, dwaal. Je mag elkaar opzoeken of juist niet.',
    cadence: 45,
  },
  stilstaan: {
    label: 'Stilstaan',
    instructie: 'Sta stil in de ruimte, ogen half open. Adem. Luister naar het huis.',
    cadence: 0,
  },
};

export type Person = {
  id: string;
  name: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  hrRest: number;
  fitness: number; // schaalt hartslagreactie op beweging
  sens: number; // gevoeligheid voor geluid/sfeer
  entrain: number; // neiging om op tempo mee te gaan
  natural: number; // persoonlijke drift-cadans
  cadence: number; // stappen per minuut
  arousal: number;
  startle: number;
  hr: number;
  real: boolean;
  realHr: number | null;
  sitting: boolean;
};

const NAMES = ['Anouk', 'Bram', 'Celine', 'Daan', 'Esra', 'Floor', 'Gijs', 'Hanna', 'Ilias', 'Joke'];

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function createPersons(n = 10): Person[] {
  return Array.from({ length: n }, (_, i) => {
    const hrRest = rand(58, 78);
    return {
      id: `P${i + 1}`,
      name: NAMES[i % NAMES.length],
      x: rand(3.6, 5.2),
      y: rand(1.4, 4.2),
      vx: 0,
      vy: 0,
      heading: rand(0, Math.PI * 2),
      hrRest,
      fitness: rand(0.75, 1.3),
      sens: rand(0.6, 1.4),
      entrain: rand(0.4, 1.2),
      natural: rand(-8, 8),
      cadence: 70,
      arousal: 0.2,
      startle: 0,
      hr: hrRest + 10,
      real: false,
      realHr: null,
      sitting: false,
    };
  });
}

const MOOD_AROUSAL: Record<ScoreMood, number> = {
  stilte: 0,
  rust: -0.14,
  zweven: -0.18,
  spanning: 0.22,
  opbouw: 0.12,
  triomf: 0.2,
  hartslag: 0.05,
};
const MOOD_CADENCE: Record<ScoreMood, number> = {
  stilte: 0,
  rust: -12,
  zweven: -15,
  spanning: 4,
  opbouw: 14,
  triomf: 12,
  hartslag: 0,
};
export const SFX_STARTLE: Record<SfxPreset, number> = {
  deurbel: 0.3,
  servies_valt: 0.65,
  regen_op_raam: -0.1,
  vogels: -0.05,
  telefoon: 0.3,
  onweer: 0.5,
  kat_spint: -0.12,
};
const APPLIANCE_AROUSAL: Record<ApplianceId, number> = {
  vaatwasser: -0.06,
  koelkast: -0.02,
  magnetron: 0.04,
  koffiemachine: 0.1,
  waterkoker: 0.08,
  stofzuiger: 0.22,
};

export class HuiskamerSim {
  persons: Person[];
  t = 0;
  exercise: Exercise = 'zwerm';
  /** verveling / gewenning: zonder prikkels zakt de groep langzaam in (lummel-drift) */
  drift = 0;
  vacuum = { x: APPLIANCE_POS.stofzuiger.x, y: APPLIANCE_POS.stofzuiger.y, a: 0 };
  heartbeatBpm = 100;
  private moodSince = 0;
  private lastMood: ScoreMood = 'stilte';
  private calmTimer = 0;

  constructor(n = 10) {
    this.persons = createPersons(n);
  }

  setExercise(e: Exercise) {
    this.exercise = e;
    this.drift = 0;
    this.persons.forEach((p) => (p.sitting = false));
  }

  /** korte schrikreactie of juist ontspanning (negatief) */
  impulse(amount: number) {
    if (amount < 0) {
      this.calmTimer = 15;
      this.calmAmount = amount;
      return;
    }
    for (const p of this.persons) p.startle = Math.min(1.2, p.startle + amount * p.sens * rand(0.7, 1.2));
    this.drift = Math.max(0, this.drift - amount * 20); // een verrassing schudt wakker
  }
  private calmAmount = 0;

  stats() {
    const hrs = this.persons.map((p) => p.hr);
    const avg = hrs.reduce((a, b) => a + b, 0) / hrs.length;
    const spread = Math.sqrt(hrs.reduce((a, b) => a + (b - avg) ** 2, 0) / hrs.length);
    return { avg, spread };
  }

  step(dt: number, ins: InstrumentState) {
    this.t += dt;
    const ex = EXERCISES[this.exercise];
    if (ins.score.mood !== this.lastMood) {
      this.lastMood = ins.score.mood;
      this.moodSince = this.t;
    }
    // gewenning: ~1 stap/min per 6 seconden zonder nieuwe prikkel, max 30
    this.drift = Math.min(30, this.drift + dt / 6);
    if (this.calmTimer > 0) this.calmTimer -= dt;

    // omgevingsbijdrage aan arousal
    let envArousal = 0.18;
    const moodAge = this.t - this.moodSince;
    const moodWeight = Math.min(1, moodAge / 12) * ins.score.intensity;
    envArousal += MOOD_AROUSAL[ins.score.mood] * moodWeight;
    if (ins.score.mood === 'opbouw') envArousal += Math.min(0.2, moodAge / 200) * ins.score.intensity;
    envArousal += (ins.lamp.brightness - 0.5) * 0.16 + (0.5 - ins.lamp.warmth) * 0.1;
    for (const [id, on] of Object.entries(ins.appliances)) if (on) envArousal += APPLIANCE_AROUSAL[id as ApplianceId];
    if (this.calmTimer > 0) envArousal += this.calmAmount;

    const clockPull = ins.clocks.filter((c) => c.bpm > 0 && c.volume > 0.02);
    const moodCad = MOOD_CADENCE[ins.score.mood] * moodWeight;

    // centroid voor de zwermregel
    const cx = this.persons.reduce((a, p) => a + p.x, 0) / this.persons.length;
    const cy = this.persons.reduce((a, p) => a + p.y, 0) / this.persons.length;

    if (ins.appliances.stofzuiger) {
      this.vacuum.a += rand(-0.6, 0.6) * dt;
      this.vacuum.x = clampN(this.vacuum.x + Math.cos(this.vacuum.a) * 0.5 * dt, 0.6, ROOM.w - 0.6);
      this.vacuum.y = clampN(this.vacuum.y + Math.sin(this.vacuum.a) * 0.5 * dt, 1, ROOM.h - 0.6);
      if (this.vacuum.x <= 0.6 || this.vacuum.x >= ROOM.w - 0.6 || this.vacuum.y <= 1 || this.vacuum.y >= ROOM.h - 0.6) this.vacuum.a += Math.PI * 0.7;
    }

    for (const p of this.persons) {
      // --- cadans ---
      let target = ex.cadence === 0 ? 0 : Math.max(20, ex.cadence + p.natural - this.drift);
      for (const c of clockPull) {
        // octaaf-equivalentie: je loopt op de tel, op de halve of dubbele tel
        const cands = [c.bpm / 2, c.bpm, c.bpm * 2].filter((b) => b >= 30 && b <= 170);
        // de directe tel heeft voorkeur; halve/dubbele tel alleen als die veel dichterbij ligt
        const cost = (b: number) => Math.abs(b - p.cadence) * (b === c.bpm ? 1 : 3);
        const best = cands.reduce((a, b) => (cost(b) < cost(a) ? b : a), c.bpm);
        const w = Math.min(0.9, c.volume * p.entrain * 1.4);
        target = target * (1 - w) + (ex.cadence === 0 ? target * 0.85 + best * 0.15 : best) * w;
      }
      target += moodCad * p.sens;
      target += p.startle * 25;
      if (ex.cadence === 0) target = Math.min(target, 25); // stilstaan: hooguit wiegen
      if (this.exercise === 'lummelen' && p.sitting) target = Math.min(target, 10);
      p.cadence += (target - p.cadence) * Math.min(1, dt / 4);

      // --- beweging ---
      const speed = Math.max(0, p.cadence) / 60 * 0.5; // ~0.5 m per stap
      p.heading += rand(-1, 1) * dt * 1.2;
      let ax = Math.cos(p.heading) * speed;
      let ay = Math.sin(p.heading) * speed;

      let nearest = Infinity;
      let nx = 0;
      let ny = 0;
      for (const q of this.persons) {
        if (q === p) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < nearest) {
          nearest = d;
          nx = dx / d;
          ny = dy / d;
        }
        if (d < 0.45) {
          ax -= (dx / d) * (0.45 - d) * 3;
          ay -= (dy / d) * (0.45 - d) * 3;
        }
      }
      if (this.exercise === 'zwerm') {
        if (nearest > 0.9) {
          ax += nx * 0.6;
          ay += ny * 0.6;
        }
        ax += (cx - p.x) * 0.06;
        ay += (cy - p.y) * 0.06;
      }
      if (this.exercise === 'lummelen' && !p.sitting && Math.random() < dt * 0.01 && p.y > 4) p.sitting = true;
      if (p.sitting && (p.startle > 0.25 || Math.random() < dt * 0.004)) p.sitting = false;

      if (ins.appliances.stofzuiger) {
        const dx = p.x - this.vacuum.x;
        const dy = p.y - this.vacuum.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < 1.5) {
          ax += (dx / d) * (1.5 - d) * 1.5;
          ay += (dy / d) * (1.5 - d) * 1.5;
        }
      }
      // meubels en muren ontwijken
      for (const r of FURNITURE) {
        if (p.sitting && r.kind === 'bank') continue;
        const qx = clampN(p.x, r.x, r.x + r.w);
        const qy = clampN(p.y, r.y, r.y + r.h);
        const dx = p.x - qx;
        const dy = p.y - qy;
        const d = Math.hypot(dx, dy);
        if (d < 0.35) {
          const k = (0.35 - d) * 6;
          ax += d > 0 ? (dx / d) * k : rand(-1, 1);
          ay += d > 0 ? (dy / d) * k : rand(-1, 1);
        }
      }
      const m = 0.3;
      if (p.x < m) ax += (m - p.x) * 5;
      if (p.x > ROOM.w - m) ax -= (p.x - (ROOM.w - m)) * 5;
      if (p.y < m) ay += (m - p.y) * 5;
      if (p.y > ROOM.h - m) ay -= (p.y - (ROOM.h - m)) * 5;

      const k = Math.min(1, dt * 2);
      p.vx += (ax - p.vx) * k;
      p.vy += (ay - p.vy) * k;
      if (p.sitting) {
        p.vx *= 0.2;
        p.vy *= 0.2;
      }
      const v = Math.hypot(p.vx, p.vy);
      if (v > 0.05) p.heading = Math.atan2(p.vy, p.vx) * 0.3 + p.heading * 0.7;
      p.x = clampN(p.x + p.vx * dt, 0.1, ROOM.w - 0.1);
      p.y = clampN(p.y + p.vy * dt, 0.1, ROOM.h - 0.1);

      // --- arousal & hartslag ---
      p.arousal += (envArousal * p.sens + (1 - p.sens) * 0.18 - p.arousal) * Math.min(1, dt / 25);
      p.startle *= Math.exp(-dt / 9);
      // inspanning volgt vooral de staptempo (ook als de zwerm elkaar in de weg loopt)
      const effort = Math.max(v, speed * (p.sitting ? 0.2 : 0.9));
      const moveTerm = 30 * Math.min(1.6, effort) * p.fitness;
      let hrTarget = p.hrRest + moveTerm + p.arousal * 40 + p.startle * 22 + (p.sitting ? -4 : 0);
      if (ins.score.mood === 'hartslag') hrTarget += (this.heartbeatBpm - hrTarget) * 0.18 * ins.score.intensity;
      const tau = hrTarget > p.hr ? 12 : 22; // sneller omhoog dan omlaag
      p.hr += (hrTarget - p.hr) * Math.min(1, dt / tau) + rand(-0.4, 0.4) * dt * 3;
      p.hr += Math.sin(this.t * 1.6 + p.hrRest) * 0.02; // ademhalingsvariatie
      if (p.real && p.realHr) p.hr = p.realHr;
    }
  }
}

function clampN(n: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, n));
}

/** Eenvoudige regelaar als contrast met Claude: een thermostaat voor hartslag. */
export function thermostat(avg: number, target: number, trend: number, ins: InstrumentState) {
  const err = target - avg - trend * 0.6; // vooruitkijken
  const bpm = clampN(ins.clocks[0].bpm || 80 + err * 1.5, 40, 160);
  const next = clampN(bpm + err * 0.8, 40, 160);
  const out: import('../../lib/huiskamerTypes').Intervention[] = [];
  if (Math.abs(next - ins.clocks[0].bpm) > 3) out.push({ kind: 'clock', clock: 0, bpm: Math.round(next), volume: 0.7 });
  const mood: ScoreMood = err > 8 ? 'opbouw' : err < -8 ? 'rust' : ins.score.mood;
  if (mood !== ins.score.mood) out.push({ kind: 'score', mood, intensity: 0.6 });
  return out;
}
