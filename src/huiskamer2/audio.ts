/**
 * Geluidsmotor voor het Huiskamer-lab. Alles is synthetisch (WebAudio), zodat het
 * prototype zonder samples of API werkt. ElevenLabs-geluiden komen er als buffers bij.
 */
import type { ApplianceId, ScoreMood, SfxPreset } from '../../lib/huiskamerTypes';

type Voice = { stop: (when?: number) => void };
/** v1-apparaten plus de v2-apparaten aan de wand */
export type AnyAppliance = ApplianceId | 'wasmachine' | 'robotstofzuiger';

export class HuiskamerAudio {
  ctx: AudioContext;
  master: GainNode;
  private noiseBuf: AudioBuffer;
  private clocks: { bpm: number; volume: number; next: number; tock: boolean; bus: GainNode }[] = [];
  private scheduler: number | null = null;
  private scoreVoice: Voice | null = null;
  private scoreBus: GainNode;
  private appliances = new Map<AnyAppliance, Voice>();
  private sfxCache = new Map<string, AudioBuffer>();
  heartbeatBpm = 70;
  onApplianceEnded?: (id: AnyAppliance) => void;

  constructor() {
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp).connect(this.ctx.destination);
    this.scoreBus = this.ctx.createGain();
    this.scoreBus.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      // licht 'bruine' ruis: warmer dan wit
      b = (b + 0.08 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = b * 3 + (Math.random() * 2 - 1) * 0.15;
    }
    for (let i = 0; i < 2; i++) {
      const bus = this.ctx.createGain();
      bus.connect(this.master);
      this.clocks.push({ bpm: 0, volume: 0.6, next: 0, tock: false, bus });
    }
    this.scheduler = window.setInterval(() => this.scheduleClocks(), 25);
  }

  resume() {
    return this.ctx.resume();
  }

  dispose() {
    if (this.scheduler) clearInterval(this.scheduler);
    void this.ctx.close();
  }

  // ---------- helpers ----------
  private noise(): AudioBufferSourceNode {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.loopStart = Math.random();
    return src;
  }

  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(freq: number, t: number, dur: number, peak: number, type: OscillatorType = 'sine', dest: AudioNode = this.master) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    o.connect(g).connect(dest);
    this.env(g, t, peak, 0.005, dur);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ---------- klokken ----------
  setClock(i: number, bpm: number, volume: number) {
    const c = this.clocks[i];
    if (!c) return;
    if (c.bpm === 0 && bpm > 0) c.next = this.ctx.currentTime + 0.05;
    c.bpm = bpm;
    c.volume = volume;
    c.bus.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.1);
  }

  private tick(c: (typeof this.clocks)[number], t: number, idx: number) {
    // mechanische tik: korte bandpass-ruis + houtachtige resonantie
    const src = this.noise();
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    const base = idx === 0 ? 3200 : 2300;
    bp.frequency.value = c.tock ? base * 0.72 : base;
    bp.Q.value = 6;
    const g = this.ctx.createGain();
    src.connect(bp).connect(g).connect(c.bus);
    this.env(g, t, 1.4, 0.001, 0.035);
    src.start(t);
    src.stop(t + 0.08);
    this.tone(c.tock ? 1250 : 1650, t, 0.03, 0.08, 'triangle', c.bus);
    c.tock = !c.tock;
  }

  private scheduleClocks() {
    const now = this.ctx.currentTime;
    this.clocks.forEach((c, idx) => {
      if (c.bpm <= 0) return;
      if (c.next < now) c.next = now + 0.02;
      while (c.next < now + 0.12) {
        this.tick(c, c.next, idx);
        c.next += 60 / c.bpm;
      }
    });
    if (this.heartbeatNext !== null) {
      if (this.heartbeatNext < now) this.heartbeatNext = now + 0.02;
      while (this.heartbeatNext < now + 0.12) {
        this.lubDub(this.heartbeatNext);
        this.heartbeatNext += 60 / Math.max(40, this.heartbeatBpm);
      }
    }
  }

  // ---------- filmmuziek ----------
  private heartbeatNext: number | null = null;
  private lubDub(t: number) {
    for (const [dt, f, p] of [
      [0, 55, 0.9],
      [0.16, 48, 0.6],
    ] as const) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(f * 2, t + dt);
      o.frequency.exponentialRampToValueAtTime(f, t + dt + 0.08);
      o.connect(g).connect(this.scoreBus);
      this.env(g, t + dt, p, 0.004, 0.22);
      o.start(t + dt);
      o.stop(t + dt + 0.3);
    }
  }

  private pad(freqs: number[], cutoff: number, attack: number, type: OscillatorType = 'sawtooth', level = 0.06): Voice {
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.Q.value = 0.7;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(1, t + attack);
    lp.connect(out).connect(this.scoreBus);
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      for (const det of [-7, 6]) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = f;
        o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.value = level;
        o.connect(g).connect(lp);
        o.start(t);
        oscs.push(o);
      }
    }
    // langzaam ademende filter
    const lfo = this.ctx.createOscillator();
    const lfoG = this.ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoG.gain.value = cutoff * 0.35;
    lfo.connect(lfoG).connect(lp.frequency);
    lfo.start(t);
    oscs.push(lfo);
    return {
      stop: (when = this.ctx.currentTime) => {
        out.gain.cancelScheduledValues(when);
        out.gain.setTargetAtTime(0.0001, when, 1.2);
        oscs.forEach((o) => o.stop(when + 6));
      },
    };
  }

  private pulse(freqs: number[], bpm: () => number, cutoff: number, level: number): Voice {
    let alive = true;
    let step = 0;
    let next = this.ctx.currentTime + 0.1;
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    lp.connect(this.scoreBus);
    const id = window.setInterval(() => {
      if (!alive) return;
      const now = this.ctx.currentTime;
      while (next < now + 0.15) {
        const f = freqs[step % freqs.length];
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.value = f;
        o.connect(g).connect(lp);
        this.env(g, next, level, 0.004, 0.16);
        o.start(next);
        o.stop(next + 0.25);
        step++;
        next += 60 / bpm() / 2;
      }
    }, 30);
    return {
      stop: () => {
        alive = false;
        clearInterval(id);
      },
    };
  }

  setScore(mood: ScoreMood, intensity: number) {
    const now = this.ctx.currentTime;
    this.scoreVoice?.stop(now);
    this.scoreVoice = null;
    this.heartbeatNext = null;
    const lvl = 0.25 + intensity * 0.9;
    this.scoreBus.gain.setTargetAtTime(mood === 'stilte' ? 0 : lvl, now, 0.8);
    const parts: Voice[] = [];
    const c = (n: number) => 130.81 * 2 ** (n / 12); // C3-relatief
    switch (mood) {
      case 'rust':
        parts.push(this.pad([c(-12), c(0), c(4), c(7), c(11)], 700, 4, 'sawtooth', 0.035));
        break;
      case 'zweven':
        parts.push(this.pad([c(2), c(7), c(14), c(19)], 2200, 6, 'sine', 0.07));
        break;
      case 'spanning': {
        parts.push(this.pad([c(-12), c(-11), c(-6)], 380 + intensity * 600, 3, 'sawtooth', 0.06));
        const src = this.noise();
        const hp = this.ctx.createBiquadFilter();
        hp.type = 'bandpass';
        hp.Q.value = 3;
        hp.frequency.setValueAtTime(400, now);
        hp.frequency.exponentialRampToValueAtTime(3000, now + 25);
        const g = this.ctx.createGain();
        g.gain.value = 0.04 * (0.5 + intensity);
        src.connect(hp).connect(g).connect(this.scoreBus);
        src.start();
        parts.push({ stop: (w) => src.stop((w ?? this.ctx.currentTime) + 2) });
        break;
      }
      case 'opbouw': {
        let bpm = 84;
        const start = now;
        parts.push(this.pulse([c(0), c(7), c(12), c(7), c(3), c(7), c(12), c(15)], () => {
          bpm = Math.min(150, 84 + (this.ctx.currentTime - start) * (0.6 + intensity));
          return bpm;
        }, 1400 + intensity * 1500, 0.05));
        parts.push(this.pad([c(-12), c(-5)], 500, 5, 'sawtooth', 0.05));
        break;
      }
      case 'triomf':
        parts.push(this.pad([c(-12), c(0), c(4), c(7), c(12), c(16)], 2600, 1.5, 'sawtooth', 0.04));
        parts.push(this.pulse([c(-12), c(-12), c(-5), c(-12)], () => 118, 900, 0.08));
        break;
      case 'hartslag':
        this.heartbeatNext = now + 0.1;
        parts.push(this.pad([c(-24), c(-17)], 300, 4, 'sine', 0.12));
        break;
      case 'stilte':
        break;
    }
    this.scoreVoice = { stop: (w) => parts.forEach((p) => p.stop(w)) };
  }

  // ---------- apparaten ----------
  setAppliance(id: AnyAppliance, on: boolean) {
    const existing = this.appliances.get(id);
    if (!on) {
      existing?.stop();
      this.appliances.delete(id);
      return;
    }
    if (existing) return;
    const v = this.makeAppliance(id);
    this.appliances.set(id, v);
  }

  private hum(freq: number, level: number, harmonics = 4): { out: GainNode; stop: () => void } {
    const out = this.ctx.createGain();
    out.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(level, this.ctx.currentTime + 0.6);
    out.connect(this.master);
    const oscs: OscillatorNode[] = [];
    for (let h = 1; h <= harmonics; h++) {
      const o = this.ctx.createOscillator();
      o.frequency.value = freq * h;
      const g = this.ctx.createGain();
      g.gain.value = 0.5 / h;
      o.connect(g).connect(out);
      o.start();
      oscs.push(o);
    }
    return {
      out,
      stop: () => {
        out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
        oscs.forEach((o) => o.stop(this.ctx.currentTime + 1.5));
      },
    };
  }

  private filteredNoise(type: BiquadFilterType, freq: number, q: number, level: number) {
    const src = this.noise();
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(level, this.ctx.currentTime + 0.5);
    src.connect(f).connect(g).connect(this.master);
    src.start();
    return {
      src,
      f,
      g,
      stop: () => {
        g.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
        src.stop(this.ctx.currentTime + 1.5);
      },
    };
  }

  private ding(t: number, n = 1) {
    for (let i = 0; i < n; i++) {
      this.tone(1975, t + i * 0.45, 1.2, 0.18);
      this.tone(3950, t + i * 0.45, 0.6, 0.05);
    }
  }

  private makeAppliance(id: AnyAppliance): Voice {
    const end = (secs: number, after?: () => void): number =>
      window.setTimeout(() => {
        this.appliances.get(id)?.stop();
        this.appliances.delete(id);
        after?.();
        this.onApplianceEnded?.(id);
      }, secs * 1000);

    switch (id) {
      case 'koelkast': {
        const h = this.hum(50, 0.05, 6);
        return h;
      }
      case 'vaatwasser': {
        const n = this.filteredNoise('lowpass', 500, 1, 0.12);
        // klotsend water: LFO op filter en volume
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 0.35;
        lg.gain.value = 260;
        lfo.connect(lg).connect(n.f.frequency);
        lfo.start();
        const h = this.hum(98, 0.02, 3);
        return { stop: () => { n.stop(); h.stop(); lfo.stop(); } };
      }
      case 'magnetron': {
        const h = this.hum(120, 0.05, 5);
        const fan = this.filteredNoise('bandpass', 900, 0.8, 0.05);
        const timer = end(30, () => this.ding(this.ctx.currentTime + 0.1, 3));
        return { stop: () => { clearTimeout(timer); h.stop(); fan.stop(); } };
      }
      case 'koffiemachine': {
        // eerst malen (ruw, 6s), dan pompen/pruttelen
        const grind = this.filteredNoise('bandpass', 1800, 2, 0.16);
        const am = this.ctx.createOscillator();
        const amg = this.ctx.createGain();
        am.frequency.value = 23;
        amg.gain.value = 0.08;
        am.connect(amg).connect(grind.g.gain);
        am.start();
        let gurgle: ReturnType<HuiskamerAudio['filteredNoise']> | null = null;
        const t1 = window.setTimeout(() => {
          grind.stop();
          am.stop();
          gurgle = this.filteredNoise('lowpass', 350, 8, 0.12);
          const l = this.ctx.createOscillator();
          const lg = this.ctx.createGain();
          l.type = 'square';
          l.frequency.value = 5;
          lg.gain.value = 200;
          l.connect(lg).connect(gurgle.f.frequency);
          l.start();
          l.stop(this.ctx.currentTime + 20);
        }, 6000);
        const timer = end(24, () => this.ding(this.ctx.currentTime + 0.1, 1));
        return { stop: () => { clearTimeout(t1); clearTimeout(timer); grind.stop(); gurgle?.stop(); } };
      }
      case 'waterkoker': {
        const n = this.filteredNoise('bandpass', 300, 1.2, 0.04);
        const now = this.ctx.currentTime;
        n.f.frequency.exponentialRampToValueAtTime(2600, now + 25);
        n.g.gain.setTargetAtTime(0.18, now + 2, 8);
        const timer = end(26, () => {
          const t = this.ctx.currentTime;
          this.tone(900, t, 0.04, 0.4, 'square');
          this.tone(500, t + 0.01, 0.06, 0.3, 'triangle');
        });
        return { stop: () => { clearTimeout(timer); n.stop(); } };
      }
      case 'wasmachine': {
        // trommel die steeds sneller gaat draaien (centrifuge)
        const n = this.filteredNoise('bandpass', 260, 2, 0.08);
        const h = this.hum(40, 0.04, 5);
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.setValueAtTime(0.6, this.ctx.currentTime);
        lfo.frequency.exponentialRampToValueAtTime(14, this.ctx.currentTime + 40);
        lg.gain.value = 0.06;
        lfo.connect(lg).connect(n.g.gain);
        lfo.start();
        h.out.gain.setTargetAtTime(0.09, this.ctx.currentTime + 10, 12);
        return { stop: () => { n.stop(); h.stop(); lfo.stop(); } };
      }
      case 'robotstofzuiger': {
        const n = this.filteredNoise('bandpass', 2400, 1.5, 0.05);
        const h = this.hum(310, 0.02, 3);
        return { stop: () => { n.stop(); h.stop(); } };
      }
      case 'stofzuiger': {
        const n = this.filteredNoise('highpass', 600, 0.6, 0.2);
        const h = this.hum(230, 0.06, 6);
        const wob = this.ctx.createOscillator();
        const wg = this.ctx.createGain();
        wob.frequency.value = 0.3;
        wg.gain.value = 300;
        wob.connect(wg).connect(n.f.frequency);
        wob.start();
        return { stop: () => { n.stop(); h.stop(); wob.stop(); } };
      }
    }
  }

  // ---------- losse geluiden ----------
  playSfx(s: SfxPreset) {
    const t = this.ctx.currentTime + 0.02;
    switch (s) {
      case 'deurbel':
        this.tone(659, t, 1.2, 0.3);
        this.tone(523, t + 0.55, 1.6, 0.3);
        break;
      case 'telefoon':
        for (let r = 0; r < 3; r++)
          for (let i = 0; i < 16; i++) this.tone(i % 2 ? 1400 : 1100, t + r * 1.6 + i * 0.05, 0.05, 0.12, 'square');
        break;
      case 'servies_valt':
        for (let i = 0; i < 14; i++) {
          const tt = t + Math.random() * 0.5 + (i < 3 ? 0 : 0.05);
          this.tone(2000 + Math.random() * 5000, tt, 0.25 + Math.random() * 0.5, 0.15 + Math.random() * 0.2, 'triangle');
          const src = this.noise();
          const hp = this.ctx.createBiquadFilter();
          hp.type = 'highpass';
          hp.frequency.value = 3000;
          const g = this.ctx.createGain();
          src.connect(hp).connect(g).connect(this.master);
          this.env(g, tt, 0.6, 0.001, 0.12);
          src.start(tt);
          src.stop(tt + 0.2);
        }
        break;
      case 'onweer': {
        const src = this.noise();
        const lp = this.ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(1800, t);
        lp.frequency.exponentialRampToValueAtTime(90, t + 5);
        const g = this.ctx.createGain();
        src.connect(lp).connect(g).connect(this.master);
        this.env(g, t, 1.2, 0.03, 6);
        src.start(t);
        src.stop(t + 7);
        break;
      }
      case 'regen_op_raam': {
        const n = this.filteredNoise('highpass', 2500, 0.5, 0.06);
        for (let i = 0; i < 160; i++) this.tone(3000 + Math.random() * 4000, t + Math.random() * 15, 0.02, 0.03 * Math.random());
        window.setTimeout(() => n.stop(), 15000);
        break;
      }
      case 'vogels':
        for (let i = 0; i < 18; i++) {
          const tt = t + Math.random() * 8;
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.frequency.setValueAtTime(2500 + Math.random() * 1500, tt);
          o.frequency.exponentialRampToValueAtTime(4200 + Math.random() * 1500, tt + 0.08);
          o.frequency.exponentialRampToValueAtTime(2800, tt + 0.16);
          o.connect(g).connect(this.master);
          this.env(g, tt, 0.06, 0.01, 0.16);
          o.start(tt);
          o.stop(tt + 0.25);
        }
        break;
      case 'kat_spint': {
        const n = this.filteredNoise('lowpass', 180, 4, 0.0001);
        const am = this.ctx.createOscillator();
        const amg = this.ctx.createGain();
        am.frequency.value = 26;
        amg.gain.value = 0.25;
        am.connect(amg).connect(n.g.gain);
        am.start();
        window.setTimeout(() => { n.stop(); am.stop(); }, 12000);
        break;
      }
    }
  }

  /** Speel een ElevenLabs-geluid (gegenereerd via de lokale /api/sfx proxy, met cache). */
  async playGenerated(text: string, duration?: number): Promise<void> {
    let buf = this.sfxCache.get(text);
    if (!buf) {
      const r = await fetch('/api/sfx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, duration }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `sfx ${r.status}`);
      buf = await this.ctx.decodeAudioData(await r.arrayBuffer());
      this.sfxCache.set(text, buf);
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.master);
    src.start();
  }
}
