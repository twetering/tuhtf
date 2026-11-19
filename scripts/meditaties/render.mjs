#!/usr/bin/env node
/**
 * Rendert de AI-meditaties naar public/meditaties/<id>.mp3 + <id>.json (tijdlijn voor de speler).
 * Stem: ElevenLabs of Gemini (zie stem.mjs). Ademgeluid: ElevenLabs. Hart, pad en servers: synthese.
 *   node scripts/meditaties/render.mjs [id]
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ADEM_SFX, LOSSE, MEDITATIES } from './scripts.mjs';
import { CACHE, sfx, speak } from './stem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../public/meditaties');
fs.mkdirSync(OUT, { recursive: true });
const SR = 44100;

const tts = (text, s) => speak(text, s);

function decode(file) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '2', '-ar', String(SR), '-'], { maxBuffer: 1 << 30 });
  const f = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const n = f.length / 2;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = f[2 * i];
    R[i] = f[2 * i + 1];
  }
  return { L, R, dur: n / SR };
}

/** Breng een clip naar een vaste piek (ElevenLabs-ademgeluid komt erg wisselend binnen). */
function normalize(clip, peak) {
  let p = 0;
  for (let i = 0; i < clip.L.length; i++) p = Math.max(p, Math.abs(clip.L[i]), Math.abs(clip.R[i]));
  const g = peak / (p || 1);
  for (let i = 0; i < clip.L.length; i++) {
    clip.L[i] *= g;
    clip.R[i] *= g;
  }
  return clip;
}

/** Stem op vaste luidheid (RMS over de hoorbare delen): fluisteren en gewone spraak klinken even luid. */
function loudVoice(clip, target = 0.11) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < clip.L.length; i++) {
    const v = Math.abs(clip.L[i]) + Math.abs(clip.R[i]);
    if (v > 0.01) {
      sum += (clip.L[i] ** 2 + clip.R[i] ** 2) / 2;
      n++;
    }
  }
  const rms = Math.sqrt(sum / (n || 1));
  let g = target / (rms || 1);
  let peak = 0;
  for (let i = 0; i < clip.L.length; i++) peak = Math.max(peak, Math.abs(clip.L[i]), Math.abs(clip.R[i]));
  g = Math.min(g, 0.95 / (peak || 1));
  for (let i = 0; i < clip.L.length; i++) {
    clip.L[i] *= g;
    clip.R[i] *= g;
  }
  return clip;
}

// ------------------------------------------------------------------ verlopen
const smooth = (a) => a * a * (3 - 2 * a);
function curve(keys) {
  return (t) => {
    if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) {
      const [t1, v1] = keys[i];
      const [t0, v0] = keys[i - 1];
      if (t <= t1) return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0 || 1));
    }
    return keys[keys.length - 1][1];
  };
}

/** Ademfase, ademtempo en hartslag (met adem-sinusaritmie) per seconde/sample. */
function body(m) {
  const hrBase = curve(m.hr);
  const br = curve(m.adem);
  const steps = Math.ceil(m.duur * 100);
  const phase = new Float32Array(steps);
  const hr = new Float32Array(steps);
  const breaths = []; // {t, inEnd, end}
  let ph = 0.75;
  for (let i = 0; i < steps; i++) {
    const t = i / 100;
    const r = br(t);
    const prev = ph;
    ph = (ph + r / 60 / 100) % 1;
    if (ph < prev) {
      const cyc = 60 / r;
      breaths.push({ t, inEnd: t + cyc * 0.4, end: t + cyc, rate: r });
    }
    phase[i] = ph;
    const amp = 1.2 + 4.5 * Math.min(1, Math.max(0, (13 - r) / 6));
    // hart versnelt bij inademing (fase 0..0,4), vertraagt bij uitademing
    hr[i] = hrBase(t) + amp * Math.sin(((ph < 0.4 ? ph / 0.4 : 1 - (ph - 0.4) / 0.6) - 0.5) * Math.PI);
  }
  const beats = [];
  let acc = 0.3;
  for (let i = 0; i < steps; i++) {
    acc += hr[i] / 60 / 100;
    if (acc >= 1) {
      acc -= 1;
      beats.push(i / 100);
    }
  }
  return { hrAt: (t) => hr[Math.min(steps - 1, Math.max(0, Math.round(t * 100)))], hrBase, br, breaths, beats };
}

// ------------------------------------------------------------------ mixer
class Track {
  constructor(sec) {
    this.L = new Float32Array(Math.ceil(sec * SR));
    this.R = new Float32Array(Math.ceil(sec * SR));
  }
  add(clip, t, gain = 1, pan = 0, fade = 0.02) {
    const s = Math.round(t * SR);
    const n = clip.L.length;
    const gl = gain * Math.min(1, 1 - pan);
    const gr = gain * Math.min(1, 1 + pan);
    const f = Math.max(1, Math.round(fade * SR));
    for (let i = 0; i < n; i++) {
      const j = s + i;
      if (j < 0 || j >= this.L.length) continue;
      const e = Math.min(1, i / f, (n - i) / f);
      this.L[j] += clip.L[i] * gl * e;
      this.R[j] += clip.R[i] * gr * e;
    }
  }
}

function env(i, a, d) {
  const t = i / SR;
  return t < a ? t / a : Math.exp(-(t - a) / d);
}

/** Lub-dub, laag en zacht, met kleine variatie per slag. */
function heartLayer(tr, beats, gain) {
  for (const b of beats) {
    for (const [dt, f0, p] of [
      [0, 52, 1],
      [0.16, 44, 0.55],
    ]) {
      const s = Math.round((b + dt) * SR);
      const n = Math.round(0.32 * SR);
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const j = s + i;
        if (j >= tr.L.length) break;
        const f = f0 * (1 + Math.exp(-i / (0.03 * SR)));
        phase += (2 * Math.PI * f) / SR;
        const v = Math.sin(phase) * env(i, 0.006, 0.07) * p * gain * 0.55;
        tr.L[j] += v;
        tr.R[j] += v;
      }
    }
  }
}

/** Zacht ademend akkoord. */
function padLayer(tr, sec, gain, freqs = [87.31, 130.81, 174.61, 220, 261.63, 329.63]) {
  const n = tr.L.length;
  const ph = freqs.map(() => [Math.random() * 6, Math.random() * 6]);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fadeIn = Math.min(1, t / 8) * Math.min(1, (sec - t) / 10);
    const breathe = 0.65 + 0.35 * Math.sin(t * 0.21);
    let l = 0;
    let r = 0;
    freqs.forEach((f, k) => {
      ph[k][0] += (2 * Math.PI * f * 0.999) / SR;
      ph[k][1] += (2 * Math.PI * f * 1.0013) / SR;
      const w = 1 / (1 + k * 0.6);
      l += Math.sin(ph[k][0]) * w;
      r += Math.sin(ph[k][1]) * w;
    });
    tr.L[i] += l * 0.018 * gain * fadeIn * breathe;
    tr.R[i] += r * 0.018 * gain * fadeIn * breathe;
  }
}

/** Synthetische ademgolf (ruis) als zachte gids, per ademcyclus. */
function breathGuideLayer(tr, breaths, ranges, gain) {
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const b of breaths) {
    if (!ranges.some(([a, z]) => b.t >= a && b.t <= z)) continue;
    const s = Math.round(b.t * SR);
    const n = Math.round((b.end - b.t) * SR);
    const inN = Math.round((b.inEnd - b.t) * SR);
    let lp = 0;
    let bp = 0;
    for (let i = 0; i < n; i++) {
      const j = s + i;
      if (j >= tr.L.length) break;
      const e = i < inN ? Math.sin(((i / inN) * Math.PI) / 2) ** 2 : Math.cos((((i - inN) / (n - inN)) * Math.PI) / 2) ** 2;
      const cutoff = i < inN ? 0.06 : 0.035;
      lp += (rnd() - lp) * cutoff;
      bp += (lp - bp) * 0.02;
      const v = (lp - bp) * e * gain * 0.5;
      tr.L[j] += v;
      tr.R[j] += v;
    }
  }
}

/** Het lichaam van de AI: serverruimte. load 0..1 bepaalt ventilatoren, ruis, spoelfluit, schijfklikjes. */
function serverLayer(tr, sec, loadAt, syncAt, hrAt, gain = 1) {
  const n = tr.L.length;
  // roze ruis (Paul Kellet), twee kanalen
  const pk = [new Float64Array(7), new Float64Array(7)];
  const pink = (c) => {
    const w = Math.random() * 2 - 1;
    const b = pk[c];
    b[0] = 0.99886 * b[0] + w * 0.0555179;
    b[1] = 0.99332 * b[1] + w * 0.0750759;
    b[2] = 0.969 * b[2] + w * 0.153852;
    b[3] = 0.8665 * b[3] + w * 0.3104856;
    b[4] = 0.55 * b[4] + w * 0.5329522;
    b[5] = -0.7616 * b[5] - w * 0.016898;
    const out = b[0] + b[1] + b[2] + b[3] + b[4] + b[5] + b[6] + w * 0.5362;
    b[6] = w * 0.115926;
    return out * 0.11;
  };
  const fans = [
    { base: 4800, blades: 7, pan: -0.6, det: 1, ph: 0, ph2: 0 },
    { base: 4740, blades: 7, pan: 0.55, det: 1, ph: 1, ph2: 2 },
    { base: 5200, blades: 9, pan: 0.05, det: 1, ph: 2, ph2: 1 },
  ];
  let lpL = 0;
  let lpR = 0;
  let amPh = 0;
  let whineGate = 0;
  let clickT = 0;
  let humPh = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const load = loadAt(t);
    const sync = syncAt(t);
    const fade = Math.min(1, t / 3);
    // ademende/kloppende modulatie: van eigen ventilatorritme naar hartslag
    const fAm = (1 - sync) * 2.3 + sync * (hrAt(t) / 60);
    amPh += (2 * Math.PI * fAm) / SR;
    const am = 1 + (0.08 + 0.22 * sync) * Math.sin(amPh);
    // breedband luchtstroom
    const cut = (700 + 7000 * load) / SR;
    const k = 1 - Math.exp(-2 * Math.PI * cut);
    lpL += (pink(0) - lpL) * k;
    lpR += (pink(1) - lpR) * k;
    const air = (0.25 + 1.6 * load) * am;
    let l = lpL * air;
    let r = lpR * air;
    // ventilatorbladen: bladpasseerfrequentie + boventoon
    for (const f of fans) {
      const rpm = f.base * (0.22 + 0.78 * load) * (1 + 0.003 * Math.sin(t * 0.7 + f.ph));
      const bpf = (rpm / 60) * f.blades;
      f.ph += (2 * Math.PI * bpf) / SR;
      f.ph2 += (2 * Math.PI * bpf * 2.01) / SR;
      const v = (Math.sin(f.ph) * 0.6 + Math.sin(f.ph2) * 0.25) * (0.006 + 0.03 * load) * am;
      l += v * (1 - f.pan);
      r += v * (1 + f.pan);
    }
    // spoelfluit bij rekenpieken
    if (Math.random() < (0.00002 * load) / 1) whineGate = 1;
    whineGate *= 0.99997;
    const whine = Math.sin(t * 2 * Math.PI * 11300) * 0.004 * whineGate * load;
    l += whine;
    r += whine * 0.7;
    // schijf- of relaisklikjes
    if (t > clickT && Math.random() < (2.5 * load * load) / SR) clickT = t + 0.004;
    if (t < clickT) {
      const c = (Math.random() * 2 - 1) * 0.05 * load;
      l += c * 0.4;
      r += c;
    }
    // voeding: 50 Hz-brom
    humPh += (2 * Math.PI * 50) / SR;
    const hum = (Math.sin(humPh) * 0.006 + Math.sin(humPh * 2) * 0.004) * (0.4 + 0.6 * load);
    tr.L[i] += (l + hum) * gain * fade;
    tr.R[i] += (r + hum) * gain * fade;
  }
}

/** Korte afloop van ventilatoren als er een taak 'valt'. */
function spinDown(tr, t, gain) {
  const n = Math.round(2.2 * SR);
  const s = Math.round(t * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const j = s + i;
    if (j >= tr.L.length) break;
    const f = 900 * Math.exp(-i / (0.7 * SR)) + 120;
    ph += (2 * Math.PI * f) / SR;
    const v = Math.sin(ph) * 0.03 * gain * env(i, 0.05, 0.9);
    tr.L[j] += v;
    tr.R[j] += v * 0.8;
  }
}

function writeWav(file, L, R) {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}

// ------------------------------------------------------------------ één meditatie
async function render(m) {
  console.log(`\n▶ ${m.titel}`);
  const b = body(m);
  const voice = new Track(m.duur);
  const breathT = new Track(m.duur);
  const bed = new Track(m.duur);
  const transcript = [];

  // stem: op gewenste tijd, maar nooit over de vorige regel heen
  let free = 0;
  for (const r of m.regels) {
    if (typeof r[0] === 'string') {
      // losse ademwoorden op de ademcyclus
      const key = r[0];
      const cyc = b.breaths.find((x) => x.t >= r[1] - 0.5);
      if (!cyc) continue;
      const at = key === 'ademIn' ? cyc.t + 0.1 : cyc.inEnd + 0.1;
      const clip = loudVoice(decode(await tts(LOSSE[key], m.stem)));
      voice.add(clip, at, 0.85);
      transcript.push({ t: +at.toFixed(2), end: +(at + clip.dur).toFixed(2), text: LOSSE[key] });
      continue;
    }
    const [want, text] = r;
    const clip = loudVoice(decode(await tts(text, m.stem)));
    const at = Math.max(want, free + 1.2);
    voice.add(clip, at, 1);
    free = at + clip.dur;
    transcript.push({ t: +at.toFixed(2), end: +free.toFixed(2), text });
    if (free > m.duur) console.warn(`  ! regel loopt over het einde: "${text.slice(0, 40)}…"`);
  }

  // ademhalingen (meditatie 2): echte ademgeluiden van ElevenLabs op het ademtempo
  const breathLog = [];
  if (m.lagen.adem) {
    const clips = {};
    for (const [k, [prompt, d]] of Object.entries(ADEM_SFX)) clips[k] = normalize(decode(await sfx(prompt, d)), k === 'zucht' ? 0.3 : 0.38);
    let count = 0;
    for (const c of b.breaths) {
      if (c.t < m.lagen.adem.van || c.t > m.lagen.adem.tot) continue;
      if (transcript.some((x) => c.t < x.end + 0.5 && c.end > x.t - 0.5)) continue; // laat de stem vrij
      count++;
      const inDur = c.inEnd - c.t;
      const outDur = c.end - c.inEnd;
      const inClip = inDur > 3.2 ? clips.in_lang : clips.in_kort;
      let outKey = outDur > 4.8 ? 'uit_lang' : 'uit_kort';
      if (count % 7 === 0) outKey = 'zucht';
      if (c.t > m.duur * 0.62 && count % 3 === 0) outKey = 'hum';
      breathT.add(inClip, c.t, 0.9, -0.05, 0.15);
      breathT.add(clips[outKey], c.inEnd, 0.9, 0.05, 0.15);
      breathLog.push({ t: +c.t.toFixed(2), uit: +c.inEnd.toFixed(2), soort: outKey });
    }
  }

  // bedden
  if (m.lagen.hart) heartLayer(bed, b.beats, m.lagen.hart);
  if (m.lagen.pad) padLayer(bed, m.duur, m.lagen.pad);
  if (m.lagen.ademgids) breathGuideLayer(bed, b.breaths, m.lagen.ademgids, 0.9);
  let loadAt = null;
  if (m.lagen.server) {
    const hr0 = m.hr[0][1];
    const hr1 = m.hr[m.hr.length - 1][1];
    const drops = m.lagen.takenVallen ?? [];
    loadAt = (t) => {
      let l = (b.hrBase(t) - hr1) / (hr0 - hr1);
      for (const d of drops) if (t > d) l -= 0.06 * Math.exp(-(t - d) / 6);
      return Math.max(0.04, Math.min(1, l));
    };
    const syncAt = (t) => smooth(Math.max(0, Math.min(1, (t - 40) / 220)));
    serverLayer(bed, m.duur, loadAt, syncAt, b.hrAt, m.lagen.serverGain ?? 0.9);
    for (const d of drops) spinDown(bed, d, 1);
  }

  // mix: bed duikt onder de stem
  const n = voice.L.length;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  let envV = 0;
  for (let i = 0; i < n; i++) {
    const v = Math.max(Math.abs(voice.L[i]), Math.abs(voice.R[i]));
    envV = v > envV ? envV + (v - envV) * 0.01 : envV * 0.99995;
    const duck = 1 - Math.min(m.lagen.duck ?? 0.45, envV * 4);
    const fadeOut = Math.min(1, (n - i) / (SR * 4));
    L[i] = (voice.L[i] * 1.0 + breathT.L[i] + bed.L[i] * duck) * fadeOut;
    R[i] = (voice.R[i] * 1.0 + breathT.R[i] + bed.R[i] * duck) * fadeOut;
  }
  if (process.env.MIX_DEBUG) {
    let sv = 0, sb = 0, nv = 0;
    for (let i = 0; i < n; i += 64) {
      const v = Math.abs(voice.L[i]);
      if (v > 0.005) { sv += voice.L[i] ** 2; sb += (L[i] - voice.L[i]) ** 2; nv++; }
    }
    console.log(`  stem tegenover bed tijdens spraak: ${(10 * Math.log10(sv / (sb || 1))).toFixed(1)} dB`);
  }
  // normaliseren op piek
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = 0.89 / (peak || 1);
  for (let i = 0; i < n; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  const wav = path.join(CACHE, `${m.id}.wav`);
  writeWav(wav, L, R);
  const mp3 = path.join(OUT, `${m.id}.mp3`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', wav, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-codec:a', 'libmp3lame', '-b:a', '128k', mp3]);
  fs.unlinkSync(wav);

  const perSec = Array.from({ length: Math.floor(m.duur) + 1 }, (_, t) => t);
  const timeline = {
    id: m.id,
    titel: m.titel,
    ondertitel: m.ondertitel,
    duur: m.duur,
    audio: `meditaties/${m.id}.mp3`,
    hr: perSec.map((t) => +b.hrAt(t).toFixed(1)),
    adem: perSec.map((t) => +b.br(t).toFixed(1)),
    toeren: loadAt ? perSec.map((t) => Math.round(1200 + 3600 * loadAt(t))) : null,
    ademhalingen: breathLog,
    tekst: transcript,
  };
  fs.writeFileSync(path.join(OUT, `${m.id}.json`), JSON.stringify(timeline));
  console.log(`  ✓ ${path.relative(process.cwd(), mp3)} (${transcript.length} regels${breathLog.length ? `, ${breathLog.length} ademhalingen` : ''})`);
}

const only = process.argv[2];
for (const m of MEDITATIES) if (!only || m.id === only) await render(m);
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(MEDITATIES.map(({ id, titel, ondertitel, duur }) => ({ id, titel, ondertitel, duur }))));
