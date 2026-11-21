/**
 * Lichamen voor het Lummellab.
 * Een lichaam levert slagen (hart), stappen (pas) en ademhalingen (adem), plus
 * bewegingskenmerken uit een accelerometer. Bronnen:
 *  - sim: gesimuleerd lichaam (om alles zonder hardware te kunnen proberen)
 *  - band: hartslagband via Web Bluetooth (HR + RR-intervallen; Polar H10 ook ACC)
 *  - kanaal: een telefoon elders in de ruimte stuurt data via MQTT (rol 'zender')
 */

import { AccProcessor } from './motion';

export type Signal = 'hart' | 'pas' | 'adem';

export type Acc = {
  activity: number; // 0..1
  cadence: number; // stappen/min
  sway: number; // mg, onrust bij stilstaan
  tilt: number; // graden t.o.v. kalibratie
  breathRate: number; // ademhalingen/min
  breathPhase: number; // 0..1 (0 = begin inademing)
  breathQ: number; // 0..1 kwaliteit van het ademsignaal (sim: 1). Onder 0,35 = geen echte adem gemeten
  jolt: number; // 0..1, schrik/stoot
};

export type SimDrive = {
  rest: number;
  activity: number; // 0..1 doelactiviteit
  tension: number; // 0..1
  breathRate: number; // doel ademtempo
  pull: number | null; // externe hartslag waar dit lichaam naartoe getrokken wordt (koppeling)
  pullStrength: number;
  breathPull: number | null; // fase van een ander om mee te ademen
  follow: string | null; // volgt de activiteit van dit lichaam (met vertraging)
};

export type Body = {
  id: string;
  name: string;
  hue: number;
  seed: number;
  source: 'sim' | 'band' | 'kanaal';
  hr: number;
  acc: Acc;
  hasAcc: boolean;
  lastSeen: number;
  beats: number[]; // tijdstempels (ms, performance.now) van recente slagen
  steps: number[];
  breaths: number[];
  sim?: SimDrive & { hrBase: number; beatPhase: number; stepPhase: number; actLag: number[] };
  rrQueue: number[]; // ms, nog af te spelen RR-intervallen (band/kanaal)
  nextBeatAt: number;
  /** Wat het apparaat nog meer weet (M5Stick: gyro, batterij, knop; Garmin: loopsnelheid, paslengte). */
  extra?: { device?: string; gyro?: number; bat?: number; btn?: number; speed?: number; stride?: number; rscCadence?: number; rr?: boolean };
  nextStepAt?: number;
};

const NAMES = ['Anouk', 'Bram', 'Celine', 'Daan', 'Esra', 'Floor', 'Gijs', 'Hanna', 'Ilias', 'Joke', 'Kees', 'Lotte'];
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function emptyAcc(): Acc {
  return { activity: 0, cadence: 0, sway: 10, tilt: 0, breathRate: 0, breathPhase: 0, breathQ: 0, jolt: 0 };
}

type Listener = (id: string, signal: Signal, t: number) => void;

export class BodyHub {
  bodies: Body[] = [];
  private listeners = new Set<Listener>();
  private last = performance.now();
  private raf = 0;
  private mqttClient: { publish: (t: string, m: string) => void; end: () => void } | null = null;
  channel: string | null = null;
  channelStatus = '';
  onChange?: () => void;
  onKlok?: (cmd: { target: string; signal: Signal }) => void;

  constructor(simCount = 8) {
    this.setSimCount(simCount);
  }

  /** Start de tijdlus (idempotent; veilig met React StrictMode). */
  start() {
    if (this.raf) return;
    this.last = performance.now();
    // gewone timer i.p.v. requestAnimationFrame: blijft lopen als het tabblad op de achtergrond staat
    this.raf = window.setInterval(() => this.tick(performance.now()), 16);
  }

  dispose() {
    clearInterval(this.raf);
    this.raf = 0;
    this.mqttClient?.end();
    this.mqttClient = null;
    this.channel = null;
  }

  on(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(b: Body, s: Signal, t: number) {
    const arr = s === 'hart' ? b.beats : s === 'pas' ? b.steps : b.breaths;
    arr.push(t);
    if (arr.length > 240) arr.shift();
    this.listeners.forEach((f) => f(b.id, s, t));
  }

  get(id: string | null | undefined) {
    return this.bodies.find((b) => b.id === id);
  }

  setSimCount(n: number) {
    const real = this.bodies.filter((b) => b.source !== 'sim');
    const sims = this.bodies.filter((b) => b.source === 'sim').slice(0, n);
    while (sims.length < n) sims.push(this.makeSim(sims.length + real.length));
    this.bodies = [...real, ...sims];
    this.onChange?.();
  }

  makeSim(i: number): Body {
    const rest = rand(56, 80);
    return {
      id: `sim-${Math.random().toString(36).slice(2, 7)}`,
      name: NAMES[i % NAMES.length],
      hue: (i * 137.5) % 360,
      seed: Math.floor(Math.random() * 1e9),
      source: 'sim',
      hr: rest,
      acc: { ...emptyAcc(), breathRate: rand(10, 16), breathPhase: Math.random(), breathQ: 1 },
      hasAcc: true,
      lastSeen: performance.now(),
      beats: [],
      steps: [],
      breaths: [],
      rrQueue: [],
      nextBeatAt: 0,
      sim: {
        rest,
        activity: 0,
        tension: rand(0, 0.25),
        breathRate: rand(10, 16),
        pull: null,
        pullStrength: 0,
        breathPull: null,
        follow: null,
        hrBase: rest,
        beatPhase: Math.random(),
        stepPhase: Math.random(),
        actLag: [],
      },
    };
  }

  /** Maak een nieuw gesimuleerd lichaam aan met een eigen naam (bv. 'jij'). */
  ensureSim(id: string, name: string, hue = 40): Body {
    let b = this.get(id);
    if (!b) {
      b = this.makeSim(this.bodies.length);
      b.id = id;
      b.name = name;
      b.hue = hue;
      this.bodies.push(b);
      queueMicrotask(() => this.onChange?.()); // niet tijdens een React-render

    }
    return b;
  }

  // ------------------------------------------------------------------ tijd
  private tick(now: number) {
    // in stapjes van max 50 ms, ook als de timer op de achtergrond vertraagd wordt
    let left = Math.min(3, (now - this.last) / 1000);
    this.last = now;
    while (left > 0) {
      const dt = Math.min(0.05, left);
      left -= dt;
      for (const b of this.bodies) if (b.sim) this.stepSim(b, dt, now - left * 1000);
    }
    for (const b of this.bodies) if (!b.sim) this.stepReal(b, now, 0.016);
  }

  private stepSim(b: Body, dt: number, now: number) {
    const s = b.sim!;
    // volgen: neem activiteit van een ander over met ~1,5 s vertraging
    let act = s.activity;
    if (s.follow) {
      const leader = this.get(s.follow);
      if (leader) {
        s.actLag.push(leader.acc.activity);
        const lagFrames = Math.round(1.5 / Math.max(dt, 0.016));
        if (s.actLag.length > lagFrames) act = s.actLag.shift()!;
      }
    }
    b.acc.activity += (act - b.acc.activity) * Math.min(1, dt / 1.2);
    // adem
    let br = s.breathRate;
    b.acc.breathRate += (br - b.acc.breathRate) * Math.min(1, dt / 6);
    br = b.acc.breathRate;
    let phaseStep = (dt * br) / 60;
    if (s.breathPull !== null) {
      // fase-koppeling (Kuramoto): adem schuift naar de ander toe
      const d = ((s.breathPull - b.acc.breathPhase + 1.5) % 1) - 0.5;
      phaseStep += d * dt * 0.25;
    }
    const prevBreath = b.acc.breathPhase;
    b.acc.breathPhase = (b.acc.breathPhase + phaseStep + 1) % 1;
    if (b.acc.breathPhase < prevBreath) this.emit(b, 'adem', now);
    // hartslag: basis + activiteit + spanning + koppeling, plus adem-sinusaritmie
    let target = s.rest + 70 * b.acc.activity + 28 * s.tension;
    if (s.pull !== null) target += (s.pull - target) * s.pullStrength;
    s.hrBase += (target - s.hrBase) * Math.min(1, dt / (target > s.hrBase ? 9 : 16)) + rand(-1, 1) * dt * 1.2;
    const rsa = (2 + 7 * clamp((14 - br) / 8, 0, 1)) * (1 - b.acc.activity * 0.7);
    b.hr = s.hrBase + rsa * Math.sin(b.acc.breathPhase * Math.PI * 2);
    s.beatPhase += (dt * b.hr) / 60;
    if (s.beatPhase >= 1) {
      s.beatPhase -= 1 + rand(-0.03, 0.03);
      this.emit(b, 'hart', now);
    }
    // pas
    b.acc.cadence = b.acc.activity > 0.12 ? 55 + 85 * b.acc.activity : 0;
    if (b.acc.cadence > 0) {
      s.stepPhase += (dt * b.acc.cadence) / 60;
      if (s.stepPhase >= 1) {
        s.stepPhase -= 1;
        this.emit(b, 'pas', now);
      }
    }
    b.acc.sway += (6 + 40 * s.tension + 30 * b.acc.activity + rand(-3, 3) - b.acc.sway) * Math.min(1, dt / 2);
    b.acc.tilt += rand(-1, 1) * dt * 2 - b.acc.tilt * dt * 0.1;
    b.acc.jolt *= Math.exp(-dt / 0.6);
    b.lastSeen = now;
  }

  private stepReal(b: Body, now: number, dt: number) {
    // speel RR-intervallen af als slagen (met ~1 s vertraging t.o.v. het echte hart)
    if (b.rrQueue.length) {
      if (b.nextBeatAt === 0 || b.nextBeatAt < now - 2500) b.nextBeatAt = now;
      while (b.rrQueue.length && b.nextBeatAt <= now) {
        this.emit(b, 'hart', b.nextBeatAt);
        b.nextBeatAt += b.rrQueue.shift()!;
      }
    } else if (b.hr > 30 && now - b.lastSeen < 5000) {
      // geen RR beschikbaar: slagen afleiden uit de hartslag
      if (b.nextBeatAt === 0) b.nextBeatAt = now;
      if (now >= b.nextBeatAt) {
        this.emit(b, 'hart', now);
        b.nextBeatAt = now + 60000 / b.hr;
      }
    }
    // pasjes uit een loopsensor zonder ruwe versnelling (Garmin HRM-Pro: RSC-cadans)
    const rc = b.extra?.rscCadence ?? 0;
    if (rc > 20 && !this.procs.has(b.id)) {
      if (!b.nextStepAt || b.nextStepAt < now - 2000) b.nextStepAt = now;
      if (now >= b.nextStepAt) {
        this.emit(b, 'pas', now);
        b.nextStepAt = now + 60000 / rc;
      }
    }
    b.acc.jolt *= Math.exp(-dt / 0.6);
  }

  // ------------------------------------------------------------------ echte band
  /** Verbind een hartslagband (en indien Polar H10: accelerometer). */
  async connectBand(name?: string): Promise<Body | null> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    if (!bt) throw new Error('Web Bluetooth werkt alleen in Chrome/Edge (op iPhone: Bluefy).');
    const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: [PMD_SERVICE, 'running_speed_and_cadence'] });
    const server = await device.gatt.connect();
    const body: Body = {
      id: `band-${device.id ?? Math.random().toString(36).slice(2, 7)}`,
      name: name || device.name || 'band',
      hue: Math.random() * 360,
      seed: Math.floor(Math.random() * 1e9),
      source: 'band',
      hr: 0,
      acc: emptyAcc(),
      hasAcc: false,
      lastSeen: performance.now(),
      beats: [],
      steps: [],
      breaths: [],
      rrQueue: [],
      nextBeatAt: 0,
    };
    this.bodies = [body, ...this.bodies.filter((b) => b.id !== body.id)];
    this.onChange?.();
    const hrc = await (await server.getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
    hrc.addEventListener('characteristicvaluechanged', (ev: Event) => {
      const { hr, rr } = parseHeartRate((ev.target as unknown as { value: DataView }).value);
      if (rr.length) body.extra = { ...body.extra, rr: true };
      this.feed(body, { hr, rr });
    });
    await hrc.startNotifications();
    // Garmin HRM-Pro (Plus) en andere loopsensoren: snelheid, cadans, paslengte via BLE RSC
    try {
      const rsc = await (await server.getPrimaryService('running_speed_and_cadence')).getCharacteristic('rsc_measurement');
      rsc.addEventListener('characteristicvaluechanged', (ev: Event) => {
        const r = parseRsc((ev.target as unknown as { value: DataView }).value);
        body.extra = { ...body.extra, device: 'rsc', speed: r.speed, stride: r.stride, rscCadence: r.cadence };
        body.acc.cadence = r.cadence;
        body.acc.activity = Math.min(1, r.speed / 3 + (r.cadence > 0 ? 0.15 : 0));
        body.hasAcc = true;
        body.lastSeen = performance.now();
      });
      await rsc.startNotifications();
      body.extra = { ...body.extra, device: 'rsc' };
    } catch {
      /* geen loopsensor */
    }
    try {
      await startPolarAcc(server, (x, y, z) => this.feedAccSample(body, x, y, z));
      body.hasAcc = true;
    } catch {
      body.hasAcc = false; // geen Polar H10 of geen toegang: alleen hartslag
    }
    device.addEventListener('gattserverdisconnected', () => {
      body.hr = 0;
      this.onChange?.();
    });
    return body;
  }

  /** Data van band of kanaal verwerken. */
  feed(body: Body, d: Message) {
    if (d.hr) body.hr = d.hr;
    if (d.raw?.length) {
      // ruwe versnelling (mg) in een pakketje, bijv. van een M5Stick
      const hz = d.hz || 50;
      const n = Math.floor(d.raw.length / 3);
      const now = performance.now();
      let t0: number;
      if (d.t !== undefined) {
        // apparaatklok → lokale klok: kleinste vertraging die we ooit zagen (wifi-haperingen vallen weg)
        let c = this.clocks.get(body.id);
        const lastDev = d.t + ((n - 1) * 1000) / hz;
        if (!c || Math.abs(now - lastDev - c.off) > 5000) c = { off: now - lastDev, lastSeq: -1, lost: 0, got: 0 };
        c.off = Math.min(c.off + 0.02, now - lastDev);
        if (d.seq !== undefined) {
          if (c.lastSeq >= 0 && d.seq > c.lastSeq + 1) c.lost += d.seq - c.lastSeq - 1;
          c.lastSeq = d.seq;
        }
        c.got++;
        this.clocks.set(body.id, c);
        t0 = d.t + c.off;
      } else t0 = now - ((n - 1) * 1000) / hz;
      for (let i = 0; i < n; i++) {
        const g = d.g && d.g.length >= (i + 1) * 3 ? [d.g[i * 3], d.g[i * 3 + 1], d.g[i * 3 + 2]] : undefined;
        this.feedAccSample(body, d.raw[i * 3], d.raw[i * 3 + 1], d.raw[i * 3 + 2], t0 + (i * 1000) / hz, g);
      }
    }
    if (d.src || d.gyro !== undefined || d.bat !== undefined || d.btn !== undefined) {
      body.extra = { ...body.extra, device: d.src ?? body.extra?.device, gyro: d.gyro, bat: d.bat, btn: d.btn };
    }
    if (d.rr?.length) body.rrQueue.push(...d.rr);
    if (body.rrQueue.length > 12) body.rrQueue.splice(0, body.rrQueue.length - 12);
    if (d.acc) {
      body.hasAcc = true;
      const prevPhase = body.acc.breathPhase;
      const prevSteps = body.acc.cadence;
      Object.assign(body.acc, d.acc);
      if (d.acc.breathPhase !== undefined && d.acc.breathPhase < prevPhase - 0.5) this.emit(body, 'adem', performance.now());
      void prevSteps;
    }
    if (d.name) body.name = d.name;
    body.lastSeen = performance.now();
  }

  /** Analyse per lichaam met accelerometer (ruwe data, kwaliteit, gebeurtenissen). */
  procs = new Map<string, AccProcessor>();
  private clocks = new Map<string, { off: number; lastSeq: number; lost: number; got: number }>();
  feedAccSample(body: Body, xMg: number, yMg: number, zMg: number, t = performance.now(), gyro?: number[]) {
    let p = this.procs.get(body.id);
    if (!p) {
      p = new AccProcessor((s) => this.emit(body, s, performance.now()));
      this.procs.set(body.id, p);
    }
    p.push(xMg, yMg, zMg, t, gyro);
    Object.assign(body.acc, p.features());
    body.hasAcc = true;
  }

  // ------------------------------------------------------------------ kanaal (MQTT)
  async joinChannel(code: string) {
    this.mqttClient?.end();
    this.channel = code;
    this.channelStatus = 'verbinden…';
    this.onChange?.();
    const mqtt = (await import('mqtt')).default;
    const client = mqtt.connect(MQTT_URL, { clientId: `sk-${Math.random().toString(36).slice(2, 9)}`, reconnectPeriod: 3000 });
    this.mqttClient = client as unknown as { publish: (t: string, m: string) => void; end: () => void };
    client.on('connect', () => {
      this.channelStatus = 'verbonden';
      client.subscribe(`${TOPIC_ROOT}/${code}/lijf/+`);
      client.subscribe(`${TOPIC_ROOT}/${code}/klok`);
      this.onChange?.();
    });
    client.on('error', (e: Error) => {
      this.channelStatus = `fout: ${e.message}`;
      this.onChange?.();
    });
    client.on('message', (topic: string, msg: Uint8Array) => {
      try {
        if (topic.endsWith('/klok')) {
          this.onKlok?.(JSON.parse(new TextDecoder().decode(msg)));
          return;
        }
        const d = JSON.parse(new TextDecoder().decode(msg)) as Message;
        const id = `kanaal-${topic.split('/').pop()}`;
        let body = this.get(id);
        if (!body) {
          body = { ...this.makeSim(this.bodies.length), id, source: 'kanaal', sim: undefined, name: d.name || 'telefoon', hr: 0, acc: emptyAcc(), hasAcc: false };
          this.bodies = [body, ...this.bodies];
          this.onChange?.();
        }
        this.feed(body, d);
      } catch {
        /* onleesbaar bericht negeren */
      }
    });
  }

  /** Pakketverlies (M5Stick): ontvangen en gemiste pakketjes. */
  linkStats(id: string) {
    const c = this.clocks.get(id);
    return c ? { got: c.got, lost: c.lost } : null;
  }

  publish(sub: string, payload: unknown) {
    if (this.channel && this.mqttClient) this.mqttClient.publish(`${TOPIC_ROOT}/${this.channel}/${sub}`, JSON.stringify(payload));
  }
}

export const MQTT_URL = 'wss://broker.hivemq.com:8884/mqtt';
export const TOPIC_ROOT = 'tuhtf/speelkamer';
export type Message = {
  name?: string;
  hr?: number;
  rr?: number[];
  acc?: Partial<Acc>;
  /** ruwe versnelling in mg, x,y,z achter elkaar (M5Stick) */
  raw?: number[];
  /** gyro in °/s, x,y,z achter elkaar (M5Stick) */
  g?: number[];
  /** apparaattijd (ms) van het eerste sample, en volgnummer van het pakket */
  t?: number;
  seq?: number;
  hz?: number;
  src?: string;
  gyro?: number;
  bat?: number;
  btn?: number;
};

// ---------------------------------------------------------------------------- Bluetooth

export function parseHeartRate(v: DataView) {
  const flags = v.getUint8(0);
  let i = 1;
  let hr: number;
  if (flags & 1) {
    hr = v.getUint16(i, true);
    i += 2;
  } else {
    hr = v.getUint8(i);
    i += 1;
  }
  if (flags & 0x08) i += 2; // energy expended
  const rr: number[] = [];
  if (flags & 0x10) {
    while (i + 1 < v.byteLength) {
      rr.push((v.getUint16(i, true) / 1024) * 1000);
      i += 2;
    }
  }
  return { hr, rr };
}

/** Running Speed and Cadence (0x2A53): snelheid m/s, cadans per minuut, paslengte m. */
export function parseRsc(v: DataView) {
  const flags = v.getUint8(0);
  const speed = v.getUint16(1, true) / 256;
  const cadence = v.getUint8(3);
  const stride = flags & 1 ? v.getUint16(4, true) / 100 : 0;
  return { speed, cadence, stride, running: !!(flags & 4) };
}

/** Polar Measurement Data (PMD) service: ruwe accelerometer van de Polar H10. */
export const PMD_SERVICE = 'fb005c80-02e7-f387-1cad-8acd2d8df0c8';
const PMD_CONTROL = 'fb005c81-02e7-f387-1cad-8acd2d8df0c8';
const PMD_DATA = 'fb005c82-02e7-f387-1cad-8acd2d8df0c8';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function startPolarAcc(server: any, onSample: (x: number, y: number, z: number) => void) {
  const svc = await server.getPrimaryService(PMD_SERVICE);
  const ctrl = await svc.getCharacteristic(PMD_CONTROL);
  const data = await svc.getCharacteristic(PMD_DATA);
  data.addEventListener('characteristicvaluechanged', (ev: Event) => {
    const v = (ev.target as unknown as { value: DataView }).value;
    if (v.getUint8(0) !== 0x02) return; // 0x02 = ACC
    const frameType = v.getUint8(9);
    if (frameType === 0x01) {
      for (let i = 10; i + 5 < v.byteLength; i += 6) onSample(v.getInt16(i, true), v.getInt16(i + 2, true), v.getInt16(i + 4, true));
    } else if (frameType === 0x00) {
      for (let i = 10; i + 2 < v.byteLength; i += 3) onSample(v.getInt8(i) * 16, v.getInt8(i + 1) * 16, v.getInt8(i + 2) * 16);
    }
  });
  await data.startNotifications();
  await ctrl.startNotifications().catch(() => undefined);
  // start ACC: 200 Hz, 16 bit, bereik 8 G
  await ctrl.writeValue(new Uint8Array([0x02, 0x02, 0x00, 0x01, 0xc8, 0x00, 0x01, 0x01, 0x10, 0x00, 0x02, 0x01, 0x08, 0x00]));
}

export { AccProcessor } from './motion';

// ---------------------------------------------------------------------------- hulpfuncties

/** Gemiddeld tempo (per minuut) uit tijdstempels van de laatste ~15 s. */
export function rateFrom(ts: number[], now = performance.now(), windowMs = 15000) {
  const rec = ts.filter((t) => t > now - windowMs);
  if (rec.length < 2) return 0;
  return ((rec.length - 1) / (rec[rec.length - 1] - rec[0])) * 60000;
}

/** Kuramoto-orde (0..1): hoe gelijk lopen fases (0..1) op? */
export function phaseSync(phases: number[]) {
  if (!phases.length) return 0;
  const c = phases.reduce((s, p) => s + Math.cos(p * Math.PI * 2), 0) / phases.length;
  const s = phases.reduce((s, p) => s + Math.sin(p * Math.PI * 2), 0) / phases.length;
  return Math.hypot(c, s);
}

export function meanPhase(phases: number[]) {
  const c = phases.reduce((s, p) => s + Math.cos(p * Math.PI * 2), 0);
  const s = phases.reduce((s, p) => s + Math.sin(p * Math.PI * 2), 0);
  return ((Math.atan2(s, c) / (Math.PI * 2)) + 1) % 1;
}
