/**
 * Simulatie voor "De kamer luistert" (v2).
 * - Eén zwerm: afstoting (<0,5 m), uitlijning met buren, sterke cohesie naar het zwermcentrum.
 * - Aandacht: apparaten en oplichtende wanden trekken de zwerm een richting op.
 * - Twee kanalen: kamer (gedeeld, gedempt door koptelefoon) en oor (privé).
 * - Hartslag in %HRR vanuit persoonlijke rust/max; verborgen profielen maken mensen verschillend.
 * Grof en speculatief: een speelbord om strategieën op te proberen, geen fysiologisch model.
 */
import type { DeviceId, Ear, LabState, Phase, RoomMood, RoomSound, Wall } from '../../lib/huiskamer2Types';

export const ROOM = 8; // vierkant, meter

export const DEVICE_POS: Record<DeviceId, { x: number; y: number; wall: Wall }> = {
  koffiemachine: { x: 2.6, y: 0.35, wall: 'noord' },
  waterkoker: { x: 4.0, y: 0.35, wall: 'noord' },
  magnetron: { x: 5.4, y: 0.35, wall: 'noord' },
  vaatwasser: { x: 0.35, y: 3.0, wall: 'west' },
  wasmachine: { x: 0.35, y: 5.0, wall: 'west' },
  robotstofzuiger: { x: 6.5, y: 7.65, wall: 'zuid' },
};
export const RADIO_POS = { x: 7.7, y: 3.0 };
export const CLOCK_POS = { x: 8.0, y: 5.2 };
export const DOOR_POS = { x: 3.2, y: 8.0 };
export const WALL_MID: Record<Wall, { x: number; y: number }> = {
  noord: { x: 4, y: 0.8 },
  oost: { x: 7.2, y: 4 },
  zuid: { x: 4, y: 7.2 },
  west: { x: 0.8, y: 4 },
};

export type Profile = {
  key: string;
  label: string;
  beschrijving: string;
  entrain: number;
  musicSens: number;
  musicSign: number; // -1: kalme muziek activeert
  startle: number;
  mirror: number;
  influence: number; // gewicht in de zwerm (leider)
  attention: number;
  tau: number; // traagheid hartslag
  fitness: number;
};

export const PROFILES: Profile[] = [
  { key: 'tempovolger', label: 'tempovolger', beschrijving: 'loopt vanzelf op elke maat', entrain: 1.4, musicSens: 0.8, musicSign: 1, startle: 0.8, mirror: 0.6, influence: 1, attention: 1, tau: 1, fitness: 1 },
  { key: 'muziekmens', label: 'muziekmens', beschrijving: 'stemming raakt direct', entrain: 0.8, musicSens: 1.6, musicSign: 1, startle: 0.8, mirror: 0.7, influence: 1, attention: 0.8, tau: 1, fitness: 1 },
  { key: 'schrikker', label: 'schrikker', beschrijving: 'reageert sterk op onverwachte geluiden', entrain: 0.9, musicSens: 1, musicSign: 1, startle: 2, mirror: 0.8, influence: 0.9, attention: 1.5, tau: 0.8, fitness: 0.9 },
  { key: 'eigenwijs', label: 'eigenwijs', beschrijving: 'volgt geen tempo, loopt eigen gang', entrain: 0.25, musicSens: 0.6, musicSign: 1, startle: 0.6, mirror: 0.3, influence: 1.3, attention: 0.5, tau: 1.1, fitness: 1 },
  { key: 'paradox', label: 'paradox', beschrijving: 'kalme muziek maakt juist onrustig', entrain: 0.9, musicSens: 1.2, musicSign: -1, startle: 1, mirror: 0.8, influence: 1, attention: 1, tau: 1, fitness: 1 },
  { key: 'leider', label: 'leider', beschrijving: 'de zwerm volgt deze persoon', entrain: 1, musicSens: 0.9, musicSign: 1, startle: 0.7, mirror: 0.6, influence: 4, attention: 1.2, tau: 1, fitness: 1.1 },
  { key: 'binnenvetter', label: 'binnenvetter', beschrijving: 'traag en weinig zichtbaar', entrain: 0.6, musicSens: 0.5, musicSign: 1, startle: 0.4, mirror: 0.4, influence: 0.7, attention: 0.6, tau: 1.8, fitness: 0.9 },
  { key: 'spiegel', label: 'spiegelgevoelig', beschrijving: 'eigen hartslag horen werkt sterk', entrain: 0.9, musicSens: 0.9, musicSign: 1, startle: 1, mirror: 2, influence: 0.9, attention: 1, tau: 1, fitness: 1 },
  { key: 'sporter', label: 'sporter', beschrijving: 'lage rust, grote reserve', entrain: 1.1, musicSens: 0.8, musicSign: 1, startle: 0.6, mirror: 0.6, influence: 1.2, attention: 0.9, tau: 0.8, fitness: 0.75 },
  { key: 'gevoelig', label: 'gevoelig', beschrijving: 'alles komt binnen', entrain: 1.2, musicSens: 1.4, musicSign: 1, startle: 1.5, mirror: 1.4, influence: 0.8, attention: 1.3, tau: 0.9, fitness: 1.1 },
];

const NAMES = ['Anouk', 'Bram', 'Celine', 'Daan', 'Esra', 'Floor', 'Gijs', 'Hanna', 'Ilias', 'Joke'];

export type Person2 = {
  id: string;
  name: string;
  profile: Profile;
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  rest: number; // 'ware' rust (simulatie)
  max: number;
  natural: number;
  cadence: number;
  arousal: number;
  startle: number;
  hr: number;
  real: boolean;
  realHr: number | null;
  restMeasured: number | null;
  restAcc: { sum: number; n: number };
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function shuffle<T>(a: T[]): T[] {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

export function createPersons(): Person2[] {
  const profiles = shuffle(PROFILES);
  return NAMES.map((name, i) => {
    const profile = profiles[i];
    const rest = profile.key === 'sporter' ? rand(48, 56) : rand(58, 80);
    const age = rand(22, 64);
    const max = 208 - 0.7 * age; // Tanaka
    const a = (i / 10) * Math.PI * 2;
    return {
      id: `P${i + 1}`,
      name,
      profile,
      x: 4 + Math.cos(a) * 1.2,
      y: 4.6 + Math.sin(a) * 1.2,
      vx: 0,
      vy: 0,
      heading: rand(0, Math.PI * 2),
      rest,
      max,
      natural: rand(-8, 8),
      cadence: 0,
      arousal: 0.15,
      startle: 0,
      hr: rest + 4,
      real: false,
      realHr: null,
      restMeasured: null,
      restAcc: { sum: 0, n: 0 },
    };
  });
}

export const PHASE_INFO: Record<Phase, { label: string; instructie: string; cadence: number; cohesion: number }> = {
  aankomen: { label: 'Aankomen', instructie: 'Sta stil in de kamer. Koptelefoon op. We luisteren naar je rust.', cadence: 0, cohesion: 0.4 },
  zwerm: { label: 'Zwerm', instructie: 'Beweeg samen als één zwerm door de kamer. Blijf binnen een meter van elkaar. Niet praten.', cadence: 84, cohesion: 1 },
  lummelen: { label: 'Lummelen', instructie: 'Laat de zwerm los zonder hem te verlaten. Dwaal, hang, kijk. Niets hoeft.', cadence: 44, cohesion: 0.5 },
  landen: { label: 'Landen', instructie: 'Kom langzaam tot stilstand, waar je bent. Adem uit.', cadence: 12, cohesion: 0.6 },
};

const MOOD_AROUSAL: Record<RoomMood, number> = { stilte: 0, rust: -0.13, zweven: -0.16, spanning: 0.2, opbouw: 0.12, triomf: 0.18 };
const MOOD_CADENCE: Record<RoomMood, number> = { stilte: 0, rust: -10, zweven: -12, spanning: 4, opbouw: 12, triomf: 10 };
export const SOUND_IMPULSE: Record<RoomSound, number> = {
  deurbel: 0.3,
  servies_valt: 0.65,
  regen_op_raam: -0.1,
  vogels: -0.05,
  telefoon: 0.3,
  onweer: 0.5,
  kat_spint: -0.12,
};
const DEVICE_AROUSAL: Record<DeviceId, number> = {
  waterkoker: 0.08,
  koffiemachine: 0.1,
  magnetron: 0.04,
  vaatwasser: -0.06,
  wasmachine: 0.1,
  robotstofzuiger: 0.06,
};
/** hoe sterk een apparaat de blik (en daarmee de zwerm) trekt */
const DEVICE_PULL: Record<DeviceId, number> = {
  waterkoker: 0.7,
  koffiemachine: 1,
  magnetron: 0.8,
  vaatwasser: 0.25,
  wasmachine: 0.6,
  robotstofzuiger: 0,
};

export function earActive(e: Ear | undefined) {
  return !!e && e.volume > 0.02 && (e.tempo > 0 || e.layer !== 'stil' || e.mirror !== null);
}

export class Sim2 {
  persons = createPersons();
  t = 0;
  phase: Phase = 'aankomen';
  phaseSince = 0;
  drift = 0;
  robot = { x: DEVICE_POS.robotstofzuiger.x, y: DEVICE_POS.robotstofzuiger.y, a: -Math.PI / 2 };
  wander = { x: 4, y: 4.5, next: 0 };
  attention: { x: number; y: number; w: number } = { x: 4, y: 4, w: 0 };
  private moodSince = 0;
  private lastMood: RoomMood = 'stilte';
  private calm = { t: 0, amount: 0 };
  private deviceOnSince: Partial<Record<DeviceId, number>> = {};

  setPhase(p: Phase) {
    this.phase = p;
    this.phaseSince = this.t;
    this.drift = 0;
  }

  impulse(amount: number, who?: string) {
    if (amount < 0) {
      this.calm = { t: 15, amount };
      return;
    }
    for (const p of this.persons) {
      if (who && p.id !== who) continue;
      p.startle = Math.min(1.3, p.startle + amount * p.profile.startle * rand(0.7, 1.2));
    }
    this.drift = Math.max(0, this.drift - amount * 25);
  }

  deviceChanged(id: DeviceId, on: boolean) {
    if (on) {
      this.deviceOnSince[id] = this.t;
      this.drift = Math.max(0, this.drift - 6);
    } else delete this.deviceOnSince[id];
  }

  pct(p: Person2) {
    const rest = p.restMeasured ?? p.rest;
    return (p.hr - rest) / (p.max - rest);
  }

  centroid() {
    const n = this.persons.length;
    return {
      x: this.persons.reduce((a, p) => a + p.x, 0) / n,
      y: this.persons.reduce((a, p) => a + p.y, 0) / n,
    };
  }

  stats() {
    const pcts = this.persons.map((p) => this.pct(p));
    const avgPct = pcts.reduce((a, b) => a + b, 0) / pcts.length;
    const spreadPct = Math.sqrt(pcts.reduce((a, b) => a + (b - avgPct) ** 2, 0) / pcts.length);
    const avgBpm = this.persons.reduce((a, p) => a + p.hr, 0) / this.persons.length;
    const c = this.centroid();
    const radius = Math.max(...this.persons.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    return { avgPct, spreadPct, avgBpm, radius, cx: c.x, cy: c.y };
  }

  step(dt: number, s: LabState) {
    this.t += dt;
    const room = s.room;
    const ph = PHASE_INFO[this.phase];
    if (room.radio.mood !== this.lastMood) {
      this.lastMood = room.radio.mood;
      this.moodSince = this.t;
    }
    this.drift = Math.min(28, this.drift + dt / 6);
    if (this.calm.t > 0) this.calm.t -= dt;

    // ---- aandacht: waar kijkt/trekt de kamer naartoe? ----
    let ax = 0;
    let ay = 0;
    let aw = 0;
    for (const [id, since] of Object.entries(this.deviceOnSince) as [DeviceId, number][]) {
      if (!room.devices[id]) continue;
      const age = this.t - since;
      const w = DEVICE_PULL[id] * (0.35 + 0.65 * Math.exp(-age / 18));
      const pos = DEVICE_POS[id];
      ax += pos.x * w;
      ay += Math.max(1.2, pos.y) * w;
      aw += w;
    }
    if (room.light.focus) {
      const m = WALL_MID[room.light.focus];
      const w = 0.9 * (0.4 + room.light.brightness);
      ax += m.x * w;
      ay += m.y * w;
      aw += w;
    }
    if (this.t > this.wander.next) {
      this.wander = { x: rand(2, 6), y: rand(2, 6), next: this.t + rand(12, 22) };
    }
    const base = 0.35;
    this.attention = {
      x: (ax + this.wander.x * base) / (aw + base),
      y: (ay + this.wander.y * base) / (aw + base),
      w: aw,
    };
    // pas na fase aankomen beweegt de zwerm echt
    const moving = ph.cadence > 0;

    if (room.devices.robotstofzuiger) {
      this.robot.a += rand(-0.7, 0.7) * dt;
      this.robot.x += Math.cos(this.robot.a) * 0.45 * dt;
      this.robot.y += Math.sin(this.robot.a) * 0.45 * dt;
      if (this.robot.x < 0.6 || this.robot.x > ROOM - 0.6 || this.robot.y < 0.9 || this.robot.y > ROOM - 0.4) {
        this.robot.a += Math.PI * 0.8;
        this.robot.x = clamp(this.robot.x, 0.6, ROOM - 0.6);
        this.robot.y = clamp(this.robot.y, 0.9, ROOM - 0.4);
      }
    }

    // ---- gedeelde kamerprikkels ----
    const moodW = Math.min(1, (this.t - this.moodSince) / 12) * room.radio.intensity;
    const lightArousal = (room.light.brightness - 0.5) * 0.16 + (0.5 - room.light.warmth) * 0.1;
    let deviceArousal = 0;
    for (const id of Object.keys(room.devices) as DeviceId[]) if (room.devices[id]) deviceArousal += DEVICE_AROUSAL[id];
    const c = this.centroid();

    // gemiddelde zwermsnelheid (voor meeloop-effect)
    const P = this.persons;

    for (const p of P) {
      const pr = p.profile;
      const ear = s.ears[p.id];
      const earOn = earActive(ear);
      const roomHear = earOn ? 0.5 : 1; // koptelefoon dempt de kamer

      // --- cadans: eigen drift + kamerklok + oor-tempo + muziek ---
      let target = moving ? Math.max(18, ph.cadence + p.natural - this.drift * (this.phase === 'zwerm' ? 1 : 0.5)) : 0;
      const ref = Math.max(50, ph.cadence + p.natural); // eigen 'thuis'-tempo bepaalt of je op de tel of halve tel loopt
      const pull = (bpm: number, w: number) => {
        const cands = [bpm / 2, bpm, bpm * 2].filter((b) => b >= 30 && b <= 170);
        const cost = (b: number) => Math.abs(b - ref) * (b === bpm ? 1 : 3);
        const best = cands.reduce((a, b) => (cost(b) < cost(a) ? b : a), bpm);
        const ww = moving ? w : w * 0.12; // stilstaand: hooguit wiegen
        target = target * (1 - ww) + best * ww;
      };
      if (room.clock.bpm > 0) pull(room.clock.bpm, Math.min(0.8, room.clock.volume * pr.entrain * 0.9 * roomHear));
      if (ear && ear.tempo > 0) pull(ear.tempo, Math.min(0.92, ear.volume * pr.entrain * 1.5));
      target += MOOD_CADENCE[room.radio.mood] * moodW * pr.musicSens * roomHear;
      if (ear?.layer === 'kalm') target -= 9 * pr.musicSens * pr.musicSign * ear.volume;
      if (ear?.layer === 'activerend') target += 11 * pr.musicSens * ear.volume;
      target += p.startle * 22;
      // meeloop: in een zwerm neem je de pas van je buren over (leiders wegen zwaarder)
      if (moving) {
        let nc = 0;
        let nw = 0;
        for (const q of P) {
          if (q === p) continue;
          const d = Math.hypot(q.x - p.x, q.y - p.y);
          if (d < 1.8) {
            nc += q.cadence * q.profile.influence;
            nw += q.profile.influence;
          }
        }
        if (nw > 0) {
          const g = (this.phase === 'zwerm' ? 0.4 : 0.15) * (1.2 - Math.min(1, pr.influence / 3));
          target = target * (1 - g) + (nc / nw) * g;
        }
      }
      if (!moving) target = Math.min(target, 22);
      p.cadence += (target - p.cadence) * Math.min(1, dt / 4);

      // --- zwermbeweging ---
      const ownSpeed = (Math.max(0, p.cadence) / 60) * 0.5;
      let fx = 0;
      let fy = 0;
      let alX = 0;
      let alY = 0;
      let alW = 0;
      for (const q of P) {
        if (q === p) continue;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const d = Math.hypot(dx, dy) || 0.001;
        if (d < 0.7) {
          fx -= (dx / d) * (0.7 - d) * 4;
          fy -= (dy / d) * (0.7 - d) * 4;
        } else if (d < 1.8) {
          const w = q.profile.influence;
          alX += q.vx * w;
          alY += q.vy * w;
          alW += w;
          if (d > 1.0) {
            fx += (dx / d) * (d - 1.0) * 0.8 * ph.cohesion;
            fy += (dy / d) * (d - 1.0) * 0.8 * ph.cohesion;
          }
        }
      }
      // cohesie naar het centrum: houdt het één groep
      const dc = Math.hypot(c.x - p.x, c.y - p.y);
      const R = 1.5;
      if (dc > R) {
        fx += ((c.x - p.x) / dc) * (dc - R) * 1.6 * ph.cohesion;
        fy += ((c.y - p.y) / dc) * (dc - R) * 1.6 * ph.cohesion;
      }
      // richting: aandacht van de kamer, individueel gewogen
      let hx = this.attention.x - c.x;
      let hy = this.attention.y - c.y;
      const hd = Math.hypot(hx, hy);
      // als de zwerm bij het doel is: eromheen cirkelen i.p.v. stilstaan
      if (hd < 1.2) {
        hx = -(p.y - c.y);
        hy = p.x - c.x;
      }
      const hn = Math.hypot(hx, hy) || 1;
      p.heading += rand(-1, 1) * dt * 0.9;
      const att = 0.55 * pr.attention * (0.5 + Math.min(1, this.attention.w));
      let dirX = Math.cos(p.heading) * 0.5 + (hx / hn) * att;
      let dirY = Math.sin(p.heading) * 0.5 + (hy / hn) * att;
      if (alW > 0) {
        const al = Math.hypot(alX, alY) || 1;
        dirX += (alX / al) * 0.9 * ph.cohesion;
        dirY += (alY / al) * 0.9 * ph.cohesion;
      }
      const dn = Math.hypot(dirX, dirY) || 1;
      // tempo-onderhandeling: je wordt meegetrokken door de snelheid van je buren
      const neighborSpeed = alW > 0 ? Math.hypot(alX, alY) / alW : ownSpeed;
      const blend = this.phase === 'zwerm' ? 0.45 : 0.2;
      const speed = moving ? ownSpeed * (1 - blend) + neighborSpeed * blend : ownSpeed * 0.15;
      let tx = (dirX / dn) * speed + fx;
      let ty = (dirY / dn) * speed + fy;

      if (room.devices.robotstofzuiger) {
        const dx = p.x - this.robot.x;
        const dy = p.y - this.robot.y;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d < 1.4) {
          tx += (dx / d) * (1.4 - d) * 1.6;
          ty += (dy / d) * (1.4 - d) * 1.6;
        }
      }
      // je loopt niet harder dan je pas toelaat (zwermkrachten sturen vooral richting)
      const tm = Math.hypot(tx, ty);
      const cap = speed * 1.15 + 0.12;
      if (tm > cap) {
        tx *= cap / tm;
        ty *= cap / tm;
      }
      const m = 0.45;
      if (p.x < m) tx += (m - p.x) * 5;
      if (p.x > ROOM - m) tx -= (p.x - (ROOM - m)) * 5;
      if (p.y < m + 0.4) ty += (m + 0.4 - p.y) * 5; // keukenblok
      if (p.y > ROOM - m) ty -= (p.y - (ROOM - m)) * 5;

      const k = Math.min(1, dt * 2.2);
      p.vx += (tx - p.vx) * k;
      p.vy += (ty - p.vy) * k;
      const v = Math.hypot(p.vx, p.vy);
      if (v > 0.06) p.heading = Math.atan2(p.vy, p.vx);
      p.x = clamp(p.x + p.vx * dt, 0.2, ROOM - 0.2);
      p.y = clamp(p.y + p.vy * dt, 0.2, ROOM - 0.2);

      // --- arousal ---
      let env = 0.15;
      env += MOOD_AROUSAL[room.radio.mood] * moodW * pr.musicSens * roomHear * (room.radio.mood === 'rust' || room.radio.mood === 'zweven' ? pr.musicSign : 1);
      env += lightArousal + deviceArousal * roomHear;
      if (this.calm.t > 0) env += this.calm.amount * roomHear;
      if (ear?.layer === 'kalm') env += -0.15 * pr.musicSens * pr.musicSign * ear.volume;
      if (ear?.layer === 'activerend') env += 0.18 * pr.musicSens * ear.volume;
      if (ear && ear.mirror !== null) env += clamp(ear.mirror / 10, -1.5, 1.5) * 0.1 * pr.mirror * ear.volume;
      p.arousal += (env - p.arousal) * Math.min(1, dt / 25);
      p.startle *= Math.exp(-dt / 9);

      // --- hartslag ---
      const effort = 0.7 * ownSpeed + 0.3 * v;
      let pct = 0.04 + 0.34 * Math.min(1.6, effort) * (1 / pr.fitness) + 0.38 * p.arousal + 0.2 * p.startle;
      pct = clamp(pct, -0.05, 1);
      let hrTarget = p.rest + pct * (p.max - p.rest);
      if (ear && ear.mirror !== null) hrTarget += ear.mirror * 0.12 * pr.mirror * ear.volume; // gehoorde hartslag trekt licht mee
      const tau = (hrTarget > p.hr ? 12 : 22) * pr.tau;
      p.hr += (hrTarget - p.hr) * Math.min(1, dt / tau) + rand(-0.4, 0.4) * dt * 3;
      if (p.real && p.realHr) p.hr = p.realHr;

      // --- rustmeting tijdens aankomen ---
      if (this.phase === 'aankomen' && this.t - this.phaseSince > 10) {
        p.restAcc.sum += p.hr * dt;
        p.restAcc.n += dt;
        if (p.restAcc.n > 15) p.restMeasured = p.restAcc.sum / p.restAcc.n;
      }
    }
  }
}

/** Mechanische tegenhanger van Claude: per persoon een P-regelaar op het oor-tempo. */
export function thermostat2(sim: Sim2, targetPct: (p: Person2) => number, ears: Record<string, Ear>) {
  const out: { person: string; ear: Ear }[] = [];
  for (const p of sim.persons) {
    const err = targetPct(p) - sim.pct(p);
    const cur = ears[p.id];
    const tempo = Math.round(clamp(Math.max(60, p.cadence) + err * 160, 50, 150));
    const layer = err > 0.08 ? 'activerend' : err < -0.08 ? 'kalm' : 'neutraal';
    if (!cur || Math.abs(cur.tempo - tempo) > 4 || cur.layer !== layer) {
      out.push({ person: p.id, ear: { tempo, volume: 0.7, layer, mirror: null } });
    }
  }
  return out;
}
