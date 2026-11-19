/**
 * Bewegingsanalyse voor accelerometer (+ optioneel gyro): Polar H10, telefoon, M5Stick.
 * Eerlijk over wat wel en niet gemeten wordt: elke afgeleide grootheid heeft een kwaliteit,
 * en adem wordt alleen gerapporteerd als er echt een ritmisch ademsignaal is.
 */
import type { Acc, Signal } from './bodies';

const RAW_N = 1500; // 30 s bij 50 Hz
const BR_HZ = 10; // ademsignaal wordt naar 10 Hz teruggebracht
const BR_N = BR_HZ * 40; // 40 s ademgeschiedenis

export type Posture = 'rechtop' | 'schuin' | 'liggend' | 'ondersteboven' | 'onbekend';
export type MotionEvent = { t: number; kind: 'pas' | 'sprong' | 'draai' | 'schok'; value: number };

/** Ringbuffer met ruwe samples: tijd (ms, lokale klok), versnelling (mg), gyro (°/s, na bias-correctie). */
export class RawBuffer {
  t = new Float64Array(RAW_N);
  a = [new Float32Array(RAW_N), new Float32Array(RAW_N), new Float32Array(RAW_N)];
  g = [new Float32Array(RAW_N), new Float32Array(RAW_N), new Float32Array(RAW_N)];
  head = 0;
  count = 0;
  hasGyro = false;
  push(t: number, a: number[], g?: number[]) {
    const i = this.head;
    this.t[i] = t;
    for (let k = 0; k < 3; k++) {
      this.a[k][i] = a[k];
      this.g[k][i] = g ? g[k] : 0;
    }
    if (g) this.hasGyro = true;
    this.head = (i + 1) % RAW_N;
    this.count = Math.min(RAW_N, this.count + 1);
  }
  /** Indices van oud naar nieuw, voor samples nieuwer dan `since` (ms). */
  *range(since: number) {
    for (let n = this.count; n > 0; n--) {
      const i = (this.head - n + RAW_N) % RAW_N;
      if (this.t[i] >= since) yield i;
    }
  }
}

export class AccProcessor {
  raw = new RawBuffer();
  // filters
  private fast = [0, 0, 0];
  private slow = [0, 0, 0];
  grav: number[] | null = null;
  calib: number[] | null = null;
  private magFast = 0;
  private magSlow = 1000;
  // stappen
  private lastStep = 0;
  private stepIntervals: number[] = [];
  // activiteit
  private actEma = 0;
  private swayEma = 10;
  private jolt = 0;
  // gyro
  gyroBias = [0, 0, 0];
  biasLearned = 0; // 0..1: hoe zeker de bias is
  private stillFor = 0;
  private gEma: number[] | null = null;
  private gDev = 10;
  rotSpeed = 0; // °/s
  private spin = 0;
  private spinQuiet = 0;
  // sprongen
  private flightStart = 0;
  // adem
  breath = new Float32Array(BR_N); // geprojecteerd ademsignaal (mg), 10 Hz
  breathHead = 0;
  breathCount = 0;
  private brAcc = [0, 0, 0];
  private brN = 0;
  private brNext = 0;
  private brLast: number[][] = [];
  breathAxis = [0, 0, 1];
  breathAmp = 0; // mg (std)
  breathQ = 0; // 0..1
  breathLag = 0; // s: duur van de laatste ademhaling
  private breathUp = 0;
  private breathArmed = false;
  private breathRate = 0;
  private lastAnalysis = 0;
  /** tijdstempels (ms) van het begin van elke gedetecteerde inademing */
  breaths: number[] = [];
  private brPeak = 0;
  private brTrough = 0;
  cycleAmp: number[] = [];
  // ruis/klok
  noiseMg = 0;
  rateHz = 0;
  private rateWin: number[] = [];
  events: MotionEvent[] = [];
  lastT = 0;
  /** oriëntatie sensor → wereld (quaternion w,x,y,z; wereld-z = omhoog), complementair filter op gyro + zwaartekracht */
  q = [1, 0, 0, 0];
  private qInit = false;
  private emit: (s: Signal) => void;

  constructor(emit: (s: Signal) => void) {
    this.emit = emit;
  }

  private event(kind: MotionEvent['kind'], t: number, value: number) {
    this.events.push({ t, kind, value });
    if (this.events.length > 80) this.events.shift();
  }

  push(x: number, y: number, z: number, t: number, gyro?: number[]) {
    const dt = this.lastT ? Math.min(0.1, Math.max(0.001, (t - this.lastT) / 1000)) : 0.02;
    this.lastT = t;
    this.rateWin.push(t);
    while (this.rateWin.length > 2 && this.rateWin[0] < t - 3000) this.rateWin.shift();
    if (this.rateWin.length > 10) this.rateHz = ((this.rateWin.length - 1) / (t - this.rateWin[0])) * 1000;

    const v = [x, y, z];
    if (!this.grav) {
      this.grav = [...v];
      this.slow = [...v];
      this.fast = [...v];
    }
    const a = (tau: number) => 1 - Math.exp(-dt / tau);
    for (let i = 0; i < 3; i++) {
      this.fast[i] += (v[i] - this.fast[i]) * a(0.1);
      this.slow[i] += (v[i] - this.slow[i]) * a(10);
      this.grav[i] += (v[i] - this.grav[i]) * a(1.5);
    }
    if (!this.calib && this.raw.count > 50) this.calib = [...this.grav];
    const mag = Math.hypot(x, y, z);
    this.magFast += (mag - this.magFast) * a(0.04);
    this.magSlow += (mag - this.magSlow) * a(0.6);
    const hp = this.magFast - this.magSlow;

    // ---- gyro: bias leren als het lichaam echt stil is
    let g: number[] | undefined;
    if (gyro) {
      // stil = versnelling rustig én gyro stabiel (niet: gyro bijna 0, want juist de bias is onbekend)
      if (!this.gEma) this.gEma = [...gyro];
      for (let i = 0; i < 3; i++) this.gEma[i] += (gyro[i] - this.gEma[i]) * a(0.5);
      this.gDev += (Math.hypot(...gyro.map((q, i) => q - this.gEma![i])) - this.gDev) * a(0.5);
      const still = Math.abs(mag - this.magSlow) < 25 && Math.abs(hp) < 15 && this.gDev < 4;
      this.stillFor = still ? this.stillFor + dt : 0;
      if (this.stillFor > 1.5) {
        for (let i = 0; i < 3; i++) this.gyroBias[i] += (gyro[i] - this.gyroBias[i]) * (this.biasLearned < 0.3 ? a(0.4) : a(2));
        this.biasLearned = Math.min(1, this.biasLearned + dt / 4);
      }
      g = gyro.map((q, i) => q - this.gyroBias[i]);
      const rs = Math.hypot(...g);
      this.rotSpeed += (rs - this.rotSpeed) * a(0.1);
      // omwentelingen tellen (draai, salto, pirouette)
      if (rs > 120) {
        this.spin += rs * dt;
        this.spinQuiet = 0;
      } else if (this.spin > 0) {
        this.spinQuiet += dt;
        if (this.spinQuiet > 0.35) {
          if (this.spin > 160) this.event('draai', t, this.spin);
          this.spin = 0;
        }
      }
    }
    this.updateOrientation(v, g, dt);
    this.raw.push(t, v, g);

    // ---- stappen
    if (hp > 90 && t - this.lastStep > 280) {
      if (this.lastStep) {
        this.stepIntervals.push(t - this.lastStep);
        if (this.stepIntervals.length > 6) this.stepIntervals.shift();
      }
      this.lastStep = t;
      this.event('pas', t, hp);
      this.emit('pas');
    }
    // ---- sprong / vrije val: |a| bijna nul
    if (mag < 350) {
      if (!this.flightStart) this.flightStart = t;
    } else if (this.flightStart && mag > 650) {
      const ms = t - this.flightStart;
      if (ms > 70 && ms < 1500) this.event('sprong', t, ms);
      this.flightStart = 0;
    }
    this.actEma += (Math.min(1, Math.abs(hp) / 250) - this.actEma) * a(1.5);
    this.swayEma += (Math.abs(hp) - this.swayEma) * a(2);
    this.noiseMg += (Math.abs(mag - this.magSlow) - this.noiseMg) * a(3);
    const d = Math.abs(mag - this.magFast);
    const j = Math.min(1, (d - 400) / 1200);
    if (j > 0.3 && this.jolt < 0.3) this.event('schok', t, d);
    this.jolt = Math.max(this.jolt * Math.exp(-dt / 0.6), j);

    // ---- adem: bandsignaal (≈0,08–0,7 Hz) per as, gemiddeld naar 10 Hz
    for (let i = 0; i < 3; i++) this.brAcc[i] += this.fast[i] - this.slow[i];
    this.brN++;
    if (!this.brNext) this.brNext = t;
    if (t >= this.brNext) {
      this.brNext += 1000 / BR_HZ;
      if (this.brNext < t - 500) this.brNext = t + 1000 / BR_HZ;
      const s = this.brAcc.map((q) => q / this.brN);
      this.brAcc = [0, 0, 0];
      this.brN = 0;
      this.brLast.push(s);
      if (this.brLast.length > BR_N) this.brLast.shift();
      const p = s[0] * this.breathAxis[0] + s[1] * this.breathAxis[1] + s[2] * this.breathAxis[2];
      this.breath[this.breathHead] = p;
      this.breathHead = (this.breathHead + 1) % BR_N;
      this.breathCount = Math.min(BR_N, this.breathCount + 1);
      this.breathEdge(p, t);
    }
    if (t - this.lastAnalysis > 500) {
      this.lastAnalysis = t;
      this.analyseBreath();
    }
  }

  /**
   * Adem per ademhaling: opgaande doorgang met hysterese (drempel volgt de amplitude van de
   * laatste ademhalingen). Werkt van heel langzaam (3/min) tot hijgen (~80/min) en reageert binnen één ademhaling.
   */
  private breathEdge(p: number, t: number) {
    if (p > this.brPeak) this.brPeak = p;
    if (p < this.brTrough) this.brTrough = p;
    const env = Math.max(0.6, this.breathAmp);
    const th = env * 0.3;
    if (p < -th) this.breathArmed = true;
    if (this.breathArmed && p > th && t - this.breathUp > 700) {
      this.breathArmed = false;
      const interval = this.breathUp ? (t - this.breathUp) / 1000 : 0;
      const swing = this.brPeak - this.brTrough;
      this.brPeak = p;
      this.brTrough = p;
      if (interval > 30 || interval === 0) {
        this.breathUp = t; // na lange pauze: opnieuw beginnen
        return;
      }
      this.breathUp = t;
      this.breaths.push(t);
      if (this.breaths.length > 30) this.breaths.shift();
      this.cycleAmp.push(swing);
      if (this.cycleAmp.length > 6) this.cycleAmp.shift();
      this.breathLag = interval;
      // tempo: mediaan van de laatste drie, zodat één rare ademhaling niet alles omgooit
      const iv = this.breaths.slice(-4).map((q, i, arr) => (i ? (q - arr[i - 1]) / 1000 : 0)).slice(1);
      const med = [...iv].sort((x, y) => x - y)[Math.floor(iv.length / 2)] ?? interval;
      // wisselt het tempo bewust (ademoefening), volg dan de laatste ademhaling direct
      this.breathRate = 60 / (Math.abs(interval - med) / med > 0.4 ? interval : med);
      this.updateBreathQ(iv);
      if (this.breathQ > 0.35) this.emit('adem');
    }
  }

  /** Kwaliteit = genoeg signaal boven de ruis × regelmaat van de laatste ademhalingen × rustig genoeg. */
  private updateBreathQ(iv: number[]) {
    const snr = Math.min(1, Math.max(0, (this.breathAmp - 0.45) / 1.4));
    let reg = 0.6;
    if (iv.length >= 2) {
      const m = iv.reduce((x, y) => x + y, 0) / iv.length;
      const sd = Math.sqrt(iv.reduce((x, y) => x + (y - m) ** 2, 0) / iv.length);
      reg = Math.max(0.3, 1 - (sd / m) * 1.2); // ademoefeningen wisselen bewust: niet te streng
    }
    const amps = this.cycleAmp;
    const ampReg = amps.length >= 2 ? Math.min(1, Math.min(...amps) / (Math.max(...amps) || 1) + 0.4) : 0.7;
    const calm = this.actEma < 0.35 ? 1 : 0;
    this.breathQ = Math.max(0, Math.min(1, snr * (0.5 + 0.5 * reg) * (0.6 + 0.4 * ampReg) * calm * 1.25));
  }

  /** Elke halve seconde: hoofdas (PCA over 20 s), amplitude, en verval als er geen adem meer komt. */
  private analyseBreath() {
    const L = this.brLast.length;
    if (L < BR_HZ * 4) return;
    const W = this.brLast.slice(-BR_HZ * 20);
    const C = [0, 1, 2].map((i) => [0, 1, 2].map((k) => W.reduce((s, w) => s + w[i] * w[k], 0) / W.length));
    let ax = [...this.breathAxis];
    for (let it = 0; it < 8; it++) {
      const nx = [0, 1, 2].map((i) => C[i][0] * ax[0] + C[i][1] * ax[1] + C[i][2] * ax[2]);
      const n = Math.hypot(...nx) || 1;
      ax = nx.map((q) => q / n);
    }
    if (ax[0] * this.breathAxis[0] + ax[1] * this.breathAxis[1] + ax[2] * this.breathAxis[2] < 0) ax = ax.map((q) => -q);
    this.breathAxis = ax;
    // amplitude over de laatste ~2 ademhalingen (of 10 s), zodat de drempel snel meeschaalt
    const span = Math.round(Math.min(20, Math.max(6, (this.breathLag || 5) * 2.2)) * BR_HZ);
    const sig = W.slice(-span).map((w) => w[0] * ax[0] + w[1] * ax[1] + w[2] * ax[2]);
    const mean = sig.reduce((s, q) => s + q, 0) / sig.length;
    this.breathAmp = Math.sqrt(sig.reduce((s, q) => s + (q - mean) ** 2, 0) / sig.length);
    const t = this.lastT;
    const late = t - this.breathUp > Math.max(8000, (this.breathLag || 5) * 2200);
    if (late || this.actEma >= 0.35) {
      this.breathQ *= late ? 0.75 : 0.5;
      if (this.breathQ < 0.35) this.breathRate = 0;
    }
  }

  /** Mahony-achtig filter: gyro integreren, kanteling langzaam naar de zwaartekracht trekken. */
  private updateOrientation(acc: number[], g: number[] | undefined, dt: number) {
    const n = Math.hypot(...acc) || 1;
    const a = acc.map((x) => x / n);
    if (!this.qInit || !g) {
      // alleen uit zwaartekracht: draai sensor-'omhoog' (a) naar wereld-z, zonder gier
      const ax = [a[1], -a[0], 0]; // a × z
      const s2 = Math.hypot(ax[0], ax[1]);
      const ang = Math.atan2(s2, a[2]);
      const k = s2 ? Math.sin(ang / 2) / s2 : 0;
      // quaternion die sensor → wereld draait
      const qq = [Math.cos(ang / 2), ax[0] * k, ax[1] * k, 0];
      if (!g) {
        this.q = qq;
        return;
      }
      this.q = qq;
      this.qInit = true;
      return;
    }
    const [w, x, y, z] = this.q;
    // verwachte 'omhoog' in sensorframe = R^T · (0,0,1)
    const vx = 2 * (x * z - w * y);
    const vy = 2 * (w * x + y * z);
    const vz = w * w - x * x - y * y + z * z;
    // fout = a × v; sterker corrigeren als de versnelling ≈ 1 g (geen beweging)
    const trust = Math.max(0, 1 - Math.abs(n - 1000) / 250);
    const Kp = 2.5 * trust;
    const ex = a[1] * vz - a[2] * vy;
    const ey = a[2] * vx - a[0] * vz;
    const ez = a[0] * vy - a[1] * vx;
    const d = Math.PI / 180;
    const gx = g[0] * d + Kp * ex;
    const gy = g[1] * d + Kp * ey;
    const gz = g[2] * d + Kp * ez;
    const h = 0.5 * dt;
    const nq = [w - h * (x * gx + y * gy + z * gz), x + h * (w * gx + y * gz - z * gy), y + h * (w * gy - x * gz + z * gx), z + h * (w * gz + x * gy - y * gx)];
    const m = Math.hypot(...nq) || 1;
    this.q = nq.map((c) => c / m);
  }

  /** Rotatiematrix sensor → wereld (rijen). */
  rotation(): number[][] {
    const [w, x, y, z] = this.q;
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
  }

  /** Huidige zwaartekrachtrichting in het sensorframe (genormaliseerd), voor kalibratie van de assen. */
  upVector(): number[] {
    const g = this.grav ?? [0, 0, 1000];
    const n = Math.hypot(...g) || 1;
    return g.map((c) => c / n);
  }

  posture(): { posture: Posture; angle: number; pitch: number; roll: number } {
    if (!this.grav || !this.calib) return { posture: 'onbekend', angle: 0, pitch: 0, roll: 0 };
    const g = this.grav;
    const n = Math.hypot(...g) * Math.hypot(...this.calib);
    const angle = (Math.acos(Math.min(1, Math.max(-1, (g[0] * this.calib[0] + g[1] * this.calib[1] + g[2] * this.calib[2]) / (n || 1)))) * 180) / Math.PI;
    const pitch = (Math.atan2(-g[0], Math.hypot(g[1], g[2])) * 180) / Math.PI;
    const roll = (Math.atan2(g[1], g[2]) * 180) / Math.PI;
    const posture: Posture = angle < 25 ? 'rechtop' : angle < 65 ? 'schuin' : angle < 125 ? 'liggend' : 'ondersteboven';
    return { posture, angle, pitch, roll };
  }

  features(): Partial<Acc> {
    const t = this.lastT;
    const med = [...this.stepIntervals].sort((a, b) => a - b)[Math.floor(this.stepIntervals.length / 2)];
    const cadence = med && t - this.lastStep < 2000 ? 60000 / med : 0;
    const valid = this.breathQ > 0.35 && this.breathRate > 0;
    // duurt de huidige ademhaling langer dan verwacht, dan zakt het getal al mee (vertragen zie je meteen)
    const elapsed = (t - this.breathUp) / 1000;
    const rate = valid ? Math.min(this.breathRate, elapsed > 60 / this.breathRate ? 60 / elapsed : Infinity) : 0;
    return {
      activity: this.actEma,
      cadence,
      sway: this.swayEma,
      tilt: this.posture().angle,
      breathRate: rate,
      breathPhase: valid && this.breathRate ? Math.min(0.999, (t - this.breathUp) / (60000 / this.breathRate)) : 0,
      breathQ: this.breathQ,
      jolt: Math.max(0, this.jolt),
    };
  }

  recalibrate() {
    this.calib = this.grav ? [...this.grav] : null;
  }
  resetGyroBias() {
    this.biasLearned = 0;
    this.stillFor = 0;
  }
}

/** Onrust over de laatste `ms`: gemiddelde afwijking van |a| (mg) en gemiddelde draaisnelheid (°/s). */
export function jitter(p: AccProcessor, ms = 1000) {
  const r = p.raw;
  if (!r.count) return { dev: 0, gyro: 0 };
  const since = r.t[(r.head - 1 + r.t.length) % r.t.length] - ms;
  const mags: number[] = [];
  let gyr = 0;
  for (const i of r.range(since)) {
    mags.push(Math.hypot(r.a[0][i], r.a[1][i], r.a[2][i]));
    gyr += Math.hypot(r.g[0][i], r.g[1][i], r.g[2][i]);
  }
  if (!mags.length) return { dev: 0, gyro: 0 };
  const m = mags.reduce((s, x) => s + x, 0) / mags.length;
  return { dev: mags.reduce((s, x) => s + Math.abs(x - m), 0) / mags.length, gyro: gyr / mags.length };
}
