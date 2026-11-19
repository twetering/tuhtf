/**
 * Het oor: de koptelefoon-mix van één persoon (tempo-tikken, klanklaag, hartslagspiegel).
 * In het prototype hoor je één oor tegelijk ('meeluisteren'); de kamer klinkt dan
 * gedempt mee, zoals door een transparante koptelefoon.
 */
import type { Ear } from '../../lib/huiskamer2Types';
import type { HuiskamerAudio } from '../huiskamer/audio';

export class EarMonitor {
  private a: HuiskamerAudio;
  private out: GainNode;
  private ear: Ear = { tempo: 0, volume: 0.7, layer: 'stil', mirror: null };
  private nextTick = 0;
  private nextBeat = 0;
  private timer: number;
  private layerStop: (() => void) | null = null;
  private layerKey = '';
  hr = 70;
  listening: string | null = null;

  constructor(a: HuiskamerAudio) {
    this.a = a;
    this.out = a.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(a.ctx.destination);
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  dispose() {
    clearInterval(this.timer);
    this.layerStop?.();
  }

  /** null = alleen de kamer horen */
  listen(id: string | null, ear: Ear | null, hr: number) {
    const ctx = this.a.ctx;
    this.listening = id;
    this.a.master.gain.setTargetAtTime(id ? 0.32 : 0.8, ctx.currentTime, 0.2);
    this.out.gain.setTargetAtTime(id ? 1 : 0, ctx.currentTime, 0.2);
    if (id && ear) this.update(ear, hr);
    else this.setLayer('stil', 0);
  }

  update(ear: Ear, hr: number) {
    const ctx = this.a.ctx;
    if (ear.tempo > 0 && this.ear.tempo === 0) this.nextTick = ctx.currentTime + 0.05;
    if (ear.mirror !== null && this.ear.mirror === null) this.nextBeat = ctx.currentTime + 0.05;
    this.ear = ear;
    this.hr = hr;
    this.setLayer(ear.layer, ear.volume, ear.tempo);
  }

  private env(g: GainNode, t: number, peak: number, a: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private schedule() {
    if (!this.listening) return;
    const ctx = this.a.ctx;
    const now = ctx.currentTime;
    const e = this.ear;
    if (e.tempo > 0) {
      if (this.nextTick < now) this.nextTick = now + 0.02;
      while (this.nextTick < now + 0.12) {
        // zachte houtblok-tik, dichtbij het oor
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(1100, this.nextTick);
        o.frequency.exponentialRampToValueAtTime(700, this.nextTick + 0.04);
        o.connect(g).connect(this.out);
        this.env(g, this.nextTick, 0.25 * e.volume, 0.002, 0.06);
        o.start(this.nextTick);
        o.stop(this.nextTick + 0.1);
        this.nextTick += 60 / e.tempo;
      }
    }
    if (e.mirror !== null) {
      const bpm = Math.max(35, this.hr + e.mirror);
      if (this.nextBeat < now) this.nextBeat = now + 0.02;
      while (this.nextBeat < now + 0.12) {
        for (const [dt, f, p] of [
          [0, 52, 0.9],
          [0.15, 45, 0.55],
        ] as const) {
          const t = this.nextBeat + dt;
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.frequency.setValueAtTime(f * 2, t);
          o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
          o.connect(g).connect(this.out);
          this.env(g, t, p * e.volume, 0.004, 0.2);
          o.start(t);
          o.stop(t + 0.28);
        }
        this.nextBeat += 60 / bpm;
      }
    }
  }

  private setLayer(layer: Ear['layer'], volume: number, tempo = 0) {
    const key = `${layer}|${volume.toFixed(2)}|${layer === 'activerend' ? Math.round(tempo) : ''}`;
    if (key === this.layerKey) return;
    this.layerKey = key;
    this.layerStop?.();
    this.layerStop = null;
    if (layer === 'stil' || volume <= 0.01) return;
    const ctx = this.a.ctx;
    const t = ctx.currentTime;
    const bus = ctx.createGain();
    bus.gain.setValueAtTime(0.0001, t);
    bus.gain.exponentialRampToValueAtTime(volume, t + 2);
    bus.connect(this.out);
    const stops: (() => void)[] = [];
    const osc = (f: number, type: OscillatorType, level: number, dest: AudioNode) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      g.gain.value = level;
      o.connect(g).connect(dest);
      o.start();
      stops.push(() => o.stop(ctx.currentTime + 2));
      return o;
    };
    if (layer === 'kalm') {
      // brede, langzaam ademende sinusakkoorden (F majeur 9)
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(bus);
      for (const f of [87.3, 130.8, 174.6, 220, 261.6, 392]) osc(f, 'sine', 0.05, lp);
      const lfo = osc(0.08, 'sine', 0, lp);
      const lg = ctx.createGain();
      lg.gain.value = 0.35;
      lfo.disconnect();
      lfo.connect(lg).connect(bus.gain);
    } else if (layer === 'neutraal') {
      // zachte kamertoon
      const src = ctx.createBufferSource();
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let b = 0;
      for (let i = 0; i < len; i++) {
        b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = b * 4;
      }
      src.buffer = buf;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      src.connect(g).connect(bus);
      src.start();
      stops.push(() => src.stop(ctx.currentTime + 2));
    } else if (layer === 'activerend') {
      // pulserende baslijn op het tempo (of 116 als er geen tempo is)
      const bpm = tempo > 0 ? tempo : 116;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1400;
      lp.Q.value = 4;
      lp.connect(bus);
      const notes = [55, 55, 82.4, 55, 65.4, 55, 98, 82.4];
      let step = 0;
      let next = ctx.currentTime + 0.1;
      const id = window.setInterval(() => {
        while (next < ctx.currentTime + 0.15) {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = notes[step % notes.length];
          o.connect(g).connect(lp);
          this.env(g, next, 0.12, 0.004, 0.14);
          o.start(next);
          o.stop(next + 0.2);
          step++;
          next += 60 / bpm / 2;
        }
      }, 30);
      stops.push(() => clearInterval(id));
    }
    this.layerStop = () => {
      bus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
      stops.forEach((s) => s());
    };
  }
}
