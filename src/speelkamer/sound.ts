/** Kleine geluidsbibliotheek voor het Lummellab (alles synthetisch, WebAudio). */

let ctx: AudioContext | null = null;
let master: GainNode;
let noiseBuf: AudioBuffer;

export function audio() {
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = (b + 0.08 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = b * 3 + (Math.random() * 2 - 1) * 0.15;
    }
  }
  return { ctx, master };
}

export async function unlock() {
  const { ctx } = audio();
  if (muted) return false; // bewust uitgezet: niet stiekem weer aanzetten
  await ctx.resume();
  return ctx.state === 'running';
}

export function soundReady() {
  return !!ctx && ctx.state === 'running' && !muted;
}

let muted = false;
/** Geluid aan of uit. Uit = de AudioContext pauzeert, zodat ook drones en zoemers stoppen. */
export async function setSoundOn(on: boolean) {
  muted = !on;
  const { ctx } = audio();
  if (on) await ctx.resume();
  else await ctx.suspend();
  return soundReady();
}
export function soundMuted() {
  return muted;
}

function out(pan = 0, dest?: AudioNode): AudioNode {
  const { ctx, master } = audio();
  if (!pan) return dest ?? master;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  p.connect(dest ?? master);
  return p;
}

function env(g: GainNode, t: number, peak: number, a: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

export function noiseSource() {
  const { ctx } = audio();
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  s.loop = true;
  s.loopStart = Math.random();
  return s;
}

/** Mechanische kloktik. tock = lagere helft van tik-tak. */
export function tick(vol = 1, tock = false, pan = 0) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.005;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = tock ? 2200 : 3100;
  bp.Q.value = 7;
  const g = ctx.createGain();
  src.connect(bp).connect(g).connect(out(pan));
  env(g, t, 1.6 * vol, 0.001, 0.04);
  src.start(t);
  src.stop(t + 0.08);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.type = 'triangle';
  o.frequency.value = tock ? 1150 : 1600;
  o.connect(og).connect(out(pan));
  env(og, t, 0.1 * vol, 0.002, 0.03);
  o.start(t);
  o.stop(t + 0.06);
}

/** Houten klop (voor stappen). */
export function knock(vol = 1, pan = 0) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.005;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
  o.connect(g).connect(out(pan));
  env(g, t, 0.7 * vol, 0.002, 0.12);
  o.start(t);
  o.stop(t + 0.16);
}

/** Lub-dub van een hart. */
export function heartbeat(vol = 1, pan = 0, pitch = 1) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t0 = ctx.currentTime + 0.005;
  for (const [dt, f, p] of [
    [0, 55, 1],
    [0.15, 47, 0.6],
  ] as const) {
    const t = t0 + dt;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.setValueAtTime(f * 2 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(f * pitch, t + 0.07);
    o.connect(g).connect(out(pan));
    env(g, t, p * vol, 0.004, 0.2);
    o.start(t);
    o.stop(t + 0.3);
  }
}

/** Ademgeruis: zachte ruisgolf van ~dur seconden. */
export function breathSwell(dur = 3, vol = 0.3, pan = 0) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.01;
  const src = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(1100, t + dur * 0.45);
  f.frequency.linearRampToValueAtTime(400, t + dur);
  f.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + dur * 0.45);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(pan));
  src.start(t);
  src.stop(t + dur + 0.1);
}

/** Krakende vloer: korte resonante ruis met toonhoogtezwiep. */
export function creak(vol = 0.5) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.005;
  const src = noiseSource();
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 18;
  const base = 300 + Math.random() * 500;
  f.frequency.setValueAtTime(base, t);
  f.frequency.exponentialRampToValueAtTime(base * (0.6 + Math.random() * 0.9), t + 0.35);
  const g = ctx.createGain();
  src.connect(f).connect(g).connect(out((Math.random() - 0.5) * 1.4));
  env(g, t, vol * 2.2, 0.03, 0.35);
  src.start(t);
  src.stop(t + 0.5);
}

export function ping(vol = 0.4, n = 1) {
  if (!soundReady()) return;
  const { ctx } = audio();
  for (let i = 0; i < n; i++) {
    const t = ctx.currentTime + 0.01 + i * 0.5;
    for (const [f, p] of [
      [1975, 1],
      [3950, 0.25],
    ]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g).connect(out());
      env(g, t, vol * p, 0.004, 1.3);
      o.start(t);
      o.stop(t + 1.4);
    }
  }
}

export function chime(ok: boolean) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const notes = ok ? [523, 659, 784] : [330, 311];
  notes.forEach((f, i) => {
    const t = ctx.currentTime + 0.01 + i * 0.12;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    o.connect(g).connect(out());
    env(g, t, 0.25, 0.01, 0.5);
    o.start(t);
    o.stop(t + 0.6);
  });
}

/** Aanhoudende toon die je kunt bijsturen (voor zweving). */
export class Drone {
  private o: OscillatorNode;
  private g: GainNode;
  constructor(freq: number, vol = 0.12, pan = 0, type: OscillatorType = 'sine') {
    const { ctx } = audio();
    this.o = ctx.createOscillator();
    this.o.type = type;
    this.o.frequency.value = freq;
    this.g = ctx.createGain();
    this.g.gain.value = 0.0001;
    this.o.connect(this.g).connect(out(pan));
    this.o.start();
    this.g.gain.setTargetAtTime(vol, ctx.currentTime, 0.3);
  }
  set(freq: number) {
    this.o.frequency.setTargetAtTime(freq, audio().ctx.currentTime, 0.4);
  }
  volume(v: number) {
    this.g.gain.setTargetAtTime(Math.max(0.0001, v), audio().ctx.currentTime, 0.2);
  }
  stop() {
    const { ctx } = audio();
    this.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    this.o.stop(ctx.currentTime + 1.5);
  }
}

/** Gefilterde ruis-laag (vaatwasser, wasmachine, magnetron). */
export class Hum {
  readonly filter: BiquadFilterNode;
  readonly gain: GainNode;
  private src: AudioBufferSourceNode;
  private oscs: OscillatorNode[] = [];
  constructor(type: BiquadFilterType, freq: number, q: number, vol: number, humHz = 0) {
    const { ctx, master } = audio();
    this.src = noiseSource();
    this.filter = ctx.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = freq;
    this.filter.Q.value = q;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.src.connect(this.filter).connect(this.gain).connect(master);
    this.src.start();
    if (humHz) {
      for (let h = 1; h <= 4; h++) {
        const o = ctx.createOscillator();
        o.frequency.value = humHz * h;
        const g = ctx.createGain();
        g.gain.value = 0.08 / h;
        o.connect(g).connect(this.gain);
        o.start();
        this.oscs.push(o);
      }
    }
    this.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.5);
  }
  stop() {
    const { ctx } = audio();
    this.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    this.src.stop(ctx.currentTime + 1.5);
    this.oscs.forEach((o) => o.stop(ctx.currentTime + 1.5));
  }
}

/** Zachte, doorlopende 'lucht': ruis door een bandfilter, volume en helderheid volgen een ademcurve (0..1). */
export class AirSound {
  private src: AudioBufferSourceNode;
  private bp: BiquadFilterNode;
  private g: GainNode;
  private vol: number;
  constructor(vol = 0.22) {
    this.vol = vol;
    const { ctx, master } = audio();
    this.src = noiseSource();
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'bandpass';
    this.bp.Q.value = 0.8;
    this.bp.frequency.value = 500;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.g = ctx.createGain();
    this.g.gain.value = 0.0001;
    this.src.connect(this.bp).connect(lp).connect(this.g).connect(master);
    this.src.start();
  }
  /** level 0 = uitgeademd/stil, 1 = vol ingeademd; inhaling bepaalt de klankkleur. */
  set(level: number, inhaling: boolean) {
    const { ctx } = audio();
    const t = ctx.currentTime;
    const flow = Math.sin(Math.max(0, Math.min(1, level)) * Math.PI); // het meest geluid halverwege een beweging
    this.g.gain.setTargetAtTime(0.0001 + flow * this.vol, t, 0.08);
    this.bp.frequency.setTargetAtTime((inhaling ? 700 : 420) + level * 500, t, 0.1);
  }
  stop() {
    const { ctx } = audio();
    this.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
    this.src.stop(ctx.currentTime + 1);
  }
}

/** Inbelmodem, jaren '90: kiestoon, DTMF, antwoordtoon, gekrijs van de handshake. Duurt ~9 s. */
export function modemHandshake(vol = 0.18) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t0 = ctx.currentTime + 0.05;
  const g = ctx.createGain();
  g.gain.value = vol;
  g.connect(out());
  const tone = (f: number, a: number, d: number, type: OscillatorType = 'sine', lvl = 1) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0 + a);
    og.gain.linearRampToValueAtTime(lvl, t0 + a + 0.01);
    og.gain.setValueAtTime(lvl, t0 + a + d - 0.01);
    og.gain.linearRampToValueAtTime(0.0001, t0 + a + d);
    o.connect(og).connect(g);
    o.start(t0 + a);
    o.stop(t0 + a + d + 0.05);
    return o;
  };
  // kiestoon
  tone(350, 0, 1.1, 'sine', 0.5);
  tone(440, 0, 1.1, 'sine', 0.5);
  // DTMF: 0 3 0 2 1 4 7
  const dtmf: [number, number][] = [[941, 1336], [697, 1477], [941, 1336], [697, 1336], [697, 1209], [770, 1209], [852, 1209]];
  dtmf.forEach(([lo, hi], i) => {
    tone(lo, 1.3 + i * 0.16, 0.1, 'sine', 0.45);
    tone(hi, 1.3 + i * 0.16, 0.1, 'sine', 0.45);
  });
  // antwoordtoon 2100 Hz
  tone(2100, 2.8, 1.4, 'sine', 0.5);
  // V.8 / training: snelle sweeps en klikjes
  for (let i = 0; i < 14; i++) {
    const o = tone(1200, 4.3 + i * 0.09, 0.08, 'square', 0.18);
    o.frequency.setValueAtTime(980 + (i % 3) * 820, t0 + 4.3 + i * 0.09);
  }
  const sweep = tone(600, 5.6, 1.1, 'sawtooth', 0.12);
  sweep.frequency.setValueAtTime(600, t0 + 5.6);
  sweep.frequency.exponentialRampToValueAtTime(3200, t0 + 6.7);
  // het 'gekrijs': gefilterde ruis met trillende filter
  const n = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 3;
  bp.frequency.setValueAtTime(1800, t0 + 6.7);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 9;
  const lg = ctx.createGain();
  lg.gain.value = 700;
  lfo.connect(lg).connect(bp.frequency);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0 + 6.7);
  ng.gain.linearRampToValueAtTime(1.6, t0 + 6.8);
  ng.gain.setValueAtTime(1.6, t0 + 8.6);
  ng.gain.linearRampToValueAtTime(0.0001, t0 + 9.1);
  n.connect(bp).connect(ng).connect(g);
  n.start(t0 + 6.7);
  n.stop(t0 + 9.2);
  lfo.start(t0 + 6.7);
  lfo.stop(t0 + 9.2);
}

/** Harde schijf: kort mechanisch tikje van de kop. */
export function hddSeek(vol = 0.25) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.003;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 3800 + Math.random() * 1500;
  bp.Q.value = 4;
  const g = ctx.createGain();
  src.connect(bp).connect(g).connect(out((Math.random() - 0.5) * 0.4));
  env(g, t, vol, 0.001, 0.025);
  src.start(t);
  src.stop(t + 0.05);
}

/** Ventilator: ruis + bladfrequentie; set(rpm) laat hem op- en afschalen. */
export class Fan {
  private hum: Hum;
  private o: OscillatorNode;
  private og: GainNode;
  constructor(vol = 0.08) {
    const { ctx, master } = audio();
    this.hum = new Hum('bandpass', 500, 0.7, vol, 50);
    this.o = ctx.createOscillator();
    this.o.type = 'triangle';
    this.og = ctx.createGain();
    this.og.gain.value = vol * 0.25;
    this.o.connect(this.og).connect(master);
    this.o.start();
  }
  set(rpm: number) {
    const { ctx } = audio();
    this.hum.filter.frequency.setTargetAtTime(250 + rpm * 0.18, ctx.currentTime, 0.6);
    this.o.frequency.setTargetAtTime((rpm / 60) * 7, ctx.currentTime, 0.6); // 7 bladen
  }
  stop() {
    const { ctx } = audio();
    this.hum.stop();
    this.og.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    this.o.stop(ctx.currentTime + 1.5);
  }
}

/** Sportfluit: twee bijna gelijke tonen met triller (het balletje in de fluit). */
export function whistle(dur = 0.6, vol = 0.22, at = 0) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.01 + at;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
  g.gain.setValueAtTime(vol, t + dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const trem = ctx.createGain();
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 38;
  const lg = ctx.createGain();
  lg.gain.value = 0.45;
  lfo.connect(lg).connect(trem.gain);
  trem.gain.value = 0.55;
  for (const f of [2750, 2795]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(trem);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  const n = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2800;
  bp.Q.value = 6;
  const ng = ctx.createGain();
  ng.gain.value = 0.25;
  n.connect(bp).connect(ng).connect(trem);
  n.start(t);
  n.stop(t + dur + 0.05);
  trem.connect(g).connect(out());
  lfo.start(t);
  lfo.stop(t + dur + 0.05);
}

/** Piepje zoals bij de piepjestest. */
export function beep(freq = 1000, dur = 0.14, vol = 0.2, at = 0) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.005 + at;
  const o = ctx.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.005);
  g.gain.setValueAtTime(vol, t + dur - 0.01);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  o.connect(lp).connect(g).connect(out());
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** Zoemer: fout / betrapt. */
export function buzzer(dur = 0.45, vol = 0.18) {
  if (!soundReady()) return;
  const { ctx } = audio();
  const t = ctx.currentTime + 0.005;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol, t + dur - 0.03);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  for (const f of [110, 116]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    o.connect(lp);
    o.start(t);
    o.stop(t + dur);
  }
  lp.connect(g).connect(out());
}
