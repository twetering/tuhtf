import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { SimControls } from './Me';
import { AirSound, audio, heartbeat, soundReady, unlock } from './sound';
import { Label, Seg, Spark, Uitleg, sourceMark, useEvents, useFrame } from './ui';

/**
 * Meditatie 4 · live. Werkt zonder internet: alle stemfragmenten zijn vooraf gemaakt
 * (scripts/meditaties/fragmenten.mjs). De klank spiegelt je hart en adem; in de stemversie
 * kiezen eenvoudige regels ('als je hart zakt, dan…') wat de stem zegt.
 */
type Mode = 'stem' | 'spiegel';
type Frag = { file: string; text: string };
const BASE = import.meta.env.BASE_URL ?? '/';
const breathLevel = (ph: number, inFrac = 0.4) => (ph < inFrac ? 0.5 - 0.5 * Math.cos((ph / inFrac) * Math.PI) : 0.5 + 0.5 * Math.cos(((ph - inFrac) / (1 - inFrac)) * Math.PI));
const hasBreath = (b: Body) => !!b.sim || b.acc.breathQ > 0.35;

/** Drone + adem + hart. In 'rust' loopt de toonhoogte een paar slagen vóór je uit, naar beneden (pacing & leading). */
class Engine {
  private oscs: OscillatorNode[] = [];
  private lp: BiquadFilterNode;
  private g: GainNode;
  private air: AirSound;
  constructor() {
    const { ctx, master } = audio();
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 500;
    this.lp.Q.value = 0.7;
    this.g = ctx.createGain();
    this.g.gain.value = 0.0001;
    this.lp.connect(this.g).connect(master);
    [1, 1.5, 2, 3.01].forEach((mul, i) => {
      const o = ctx.createOscillator();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.value = 55 * mul;
      const og = ctx.createGain();
      og.gain.value = [0.5, 0.25, 0.22, 0.06][i];
      o.connect(og).connect(this.lp);
      o.start();
      this.oscs.push(o);
    });
    this.g.gain.setTargetAtTime(0.09, ctx.currentTime, 2);
    this.air = new AirSound(0.16);
  }
  update(hr: number, level: number, inhaling: boolean, breathing: boolean, duck: boolean) {
    const { ctx } = audio();
    const t = ctx.currentTime;
    const root = 55 * 2 ** ((Math.max(40, Math.min(160, hr)) - 60) / 36);
    [1, 1.5, 2, 3.01].forEach((mul, i) => this.oscs[i].frequency.setTargetAtTime(root * mul, t, 1.5));
    this.lp.frequency.setTargetAtTime(260 + (breathing ? level : 0.4) * 1100, t, 0.15);
    this.g.gain.setTargetAtTime(duck ? 0.035 : 0.09, t, 0.6);
    if (breathing) this.air.set(level, inhaling);
    else this.air.set(0, false);
  }
  beat(hr: number) {
    heartbeat(0.32, 0, 0.75 + (hr - 60) / 200);
  }
  stop() {
    const { ctx } = audio();
    this.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.2);
    this.oscs.forEach((o) => o.stop(ctx.currentTime + 5));
    this.air.stop();
  }
}

export default function Live({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [mode, setMode] = useState<Mode>('stem');
  const [heartId, setHeartId] = useState<string | null>(null);
  const [breathId, setBreathId] = useState<string | null>(null);
  const [running, setRunning] = useState<null | { start: number; hr0: number }>(null);
  const [said, setSaid] = useState<{ text: string; at: number } | null>(null);
  const [frags, setFrags] = useState<Record<string, Frag[]> | null>(null);
  const [trace, setTrace] = useState<number[]>([]);
  const engine = useRef<Engine | null>(null);
  const voice = useRef<HTMLAudioElement | null>(null);
  const lastSaid = useRef<{ global: number; cat: Record<string, number>; used: Set<string> }>({ global: 0, cat: {}, used: new Set() });
  const hist = useRef<{ t: number; hr: number; br: number; q: number }[]>([]);
  const lastBeatT = useRef(0);

  const sim = () => hub.ensureSim('jij', 'jij (sim)', 40);
  const heart = hub.get(heartId) ?? hub.bodies.find((b) => b.source !== 'sim' && b.hr > 0) ?? sim();
  const breathB = hub.get(breathId) ?? hub.bodies.find((b) => hub.procs.has(b.id)) ?? heart;
  const ph = breathB.acc.breathPhase;
  const breathing = hasBreath(breathB);
  const level = breathing ? breathLevel(ph) : 0.4;

  useEffect(() => {
    fetch(`${BASE}meditaties/live/index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setFrags)
      .catch(() => setFrags(null));
  }, []);

  useEvents(hub, (id, s, t) => {
    if (!running || id !== heart.id || s !== 'hart') return;
    lastBeatT.current = t;
    engine.current?.beat(heart.hr);
  });

  const speaking = !!voice.current && !voice.current.paused && !voice.current.ended;
  engine.current?.update(heart.hr || 60, level, ph < 0.4, breathing, speaking);

  const say = (cat: string, force = false) => {
    if (!frags?.[cat] || mode !== 'stem') return false;
    const now = performance.now();
    const L = lastSaid.current;
    if (!force && (now - L.global < 20000 || now - (L.cat[cat] ?? -1e9) < 75000 || speaking)) return false;
    const options = frags[cat].filter((f) => !L.used.has(f.file));
    const f = (options.length ? options : frags[cat])[Math.floor(Math.random() * (options.length || frags[cat].length))];
    L.used.add(f.file);
    L.global = now;
    L.cat[cat] = now;
    const a = new Audio(`${BASE}${f.file}`);
    a.volume = 0.95;
    a.play().catch(() => undefined); // onderbroken (bijv. pagina verlaten): geen probleem
    voice.current = a;
    setSaid({ text: f.text, at: now });
    return true;
  };

  // regels: elke 2 s kijken wat er in het lichaam gebeurt
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      const t = (performance.now() - running.start) / 1000;
      const br = breathing ? breathB.acc.breathRate : 0;
      hist.current.push({ t, hr: heart.hr, br, q: breathB.acc.breathQ });
      if (hist.current.length > 120) hist.current.shift();
      setTrace((tr) => [...tr.slice(-300), heart.hr]);
      if (mode !== 'stem') return;
      const H = hist.current;
      const win = (s: number) => H.filter((x) => x.t > t - s);
      const slope = (arr: { t: number; hr: number }[]) => {
        if (arr.length < 5) return 0;
        const mt = arr.reduce((s, x) => s + x.t, 0) / arr.length;
        const mh = arr.reduce((s, x) => s + x.hr, 0) / arr.length;
        const num = arr.reduce((s, x) => s + (x.t - mt) * (x.hr - mh), 0);
        const den = arr.reduce((s, x) => s + (x.t - mt) ** 2, 0);
        return (num / (den || 1)) * 60; // bpm per minuut
      };
      const w20 = win(20);
      const w30 = win(30);
      const s20 = slope(w20);
      const sd30 = Math.sqrt(w30.reduce((s, x) => s + (x.hr - w30.reduce((q, y) => q + y.hr, 0) / w30.length) ** 2, 0) / (w30.length || 1));
      const brNow = br;
      const brThen = H.find((x) => x.t > t - 32)?.br ?? brNow;
      const p = hub.procs.get(breathB.id);
      const amps = p?.cycleAmp ?? [];
      const lastAmp = amps[amps.length - 1] ?? 0;
      const medAmp = [...amps.slice(0, -1)].sort((a, b) => a - b)[Math.floor((amps.length - 1) / 2)] ?? 0;
      const lostBreath = !!p && H.slice(-8).every((x) => x.q < 0.2) && H.slice(-30, -8).some((x) => x.q > 0.5) && breathB.acc.activity < 0.15;

      if (t < 4) return;
      if (!lastSaid.current.cat.begin) return void say('begin', true);
      if (lostBreath && say('ademStil')) return;
      if (p && amps.length > 3 && lastAmp > medAmp * 1.9 && say('diep')) return;
      if (s20 > 6 && say('hartOmhoog')) return;
      if (s20 < -4 && say('hartOmlaag')) return;
      if (brNow > 18 && say('ademSnel')) return;
      if (brNow && brThen - brNow > 2 && say('ademLanger')) return;
      if (brNow && brNow < 8 && sd30 > 1.5 && sd30 < 6 && say('samen')) return;
      if (sd30 < 1.5 && heart.hr < running.hr0 - 4 && say('hartRustig')) return;
      if (performance.now() - lastSaid.current.global > 90000) say('stilte');
    }, 2000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode, heart, breathB, frags]);

  const start = async () => {
    await unlock();
    engine.current = new Engine();
    lastSaid.current = { global: 0, cat: {}, used: new Set() };
    hist.current = [];
    setTrace([]);
    setSaid(null);
    setRunning({ start: performance.now(), hr0: heart.hr });
  };
  const stop = () => {
    if (mode === 'stem') say('einde', true);
    engine.current?.stop();
    engine.current = null;
    setRunning(null);
  };
  useEffect(
    () => () => {
      engine.current?.stop();
      voice.current?.pause();
    },
    [],
  );

  const now = performance.now();
  const beatGlow = Math.max(0, 1 - (now - lastBeatT.current) / 450);
  const el = running ? (now - running.start) / 1000 : 0;
  const showSaid = said && now - said.at < 9000;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="card relative overflow-hidden aspect-[16/10] grid place-items-center" style={{ background: 'color-mix(in oklab, var(--sk-ink) 4%, transparent)' }}>
        <svg viewBox="-200 -130 400 260" className="w-full h-full">
          <circle r={70 + beatGlow * 8} fill="none" stroke="var(--sk-hart)" strokeWidth={1.5 + beatGlow * 3} opacity={0.25 + beatGlow * 0.6} />
          <circle r={26 + level * 52} fill="var(--sk-adem)" opacity={breathing ? 0.22 + level * 0.3 : 0.08} />
          <circle r={4} fill="var(--sk-ink)" opacity={0.6} />
        </svg>
        <div className={`absolute bottom-[12%] left-0 right-0 text-center px-8 text-[clamp(20px,2.2vw,30px)] font-extralight tracking-[-0.02em] transition-opacity duration-1000 ${showSaid ? 'opacity-100' : 'opacity-0'}`}>{said?.text ?? ''}</div>
        <div className="absolute left-4 top-3 mono text-[11px] text-ink-3">
          ♥ {Math.round(heart.hr) || '–'} · adem {breathing && breathB.acc.breathRate ? breathB.acc.breathRate.toFixed(1) : '—'}
          {running && ` · ${Math.floor(el / 60)}:${String(Math.floor(el % 60)).padStart(2, '0')}`}
        </div>
        {!running && (
          <button className="btn accent big absolute" onClick={start}>▶ begin</button>
        )}
      </div>
      <div className="space-y-4">
        <Seg value={mode} options={['stem', 'spiegel'] as const} onChange={setMode} labels={{ stem: 'met stem · naar rust', spiegel: 'puur spiegel' }} />
        <div className="space-y-2 text-[12.5px]">
          <Bron label="hart" hub={hub} value={heart} onPick={setHeartId} filter={(b) => b.hr > 0 || !!b.sim} />
          <Bron label="adem" hub={hub} value={breathB} onPick={setBreathId} filter={(b) => hub.procs.has(b.id) || !!b.sim} />
        </div>
        {running && <button className="btn w-full" onClick={stop}>■ afronden</button>}
        <div className="card p-4">
          <Label>hartslag deze sessie</Label>
          <Spark values={trace} h={50} />
          {running && <div className="mono text-[11px] text-ink-3 mt-1">begin {Math.round(running.hr0)} → nu {Math.round(heart.hr)}</div>}
        </div>
        {!frags && mode === 'stem' && <div className="text-[12px] text-hart">Stemfragmenten ontbreken. Draai: node scripts/meditaties/fragmenten.mjs</div>}
        {!soundReady() && <div className="mono text-[11px] text-ink-3">geluid gaat aan bij ‘begin’</div>}
        <SimControls b={heart} />
      </div>
      <Uitleg title="Live">
        <p>Een meditatie die op je lichaam reageert, zonder internet. De toonhoogte van de klank volgt je hartslag, het luchtgeluid volgt je adem, en elke echte hartslag hoor je als een zachte klop.</p>
        <ul>
          <li><b>Met stem.</b> Een fluisterstem reageert op wat er gebeurt: je hart zakt of stijgt, je adem wordt langer, je zucht diep, je houdt je adem in. Alle zinnen zijn vooraf gemaakt; regels bepalen welke klinkt, met rust ertussen.</li>
          <li><b>Puur spiegel.</b> Geen stem, geen doel. Alleen je eigen lichaam als klank. Wat doet het met je om jezelf zo te horen?</li>
        </ul>
      </Uitleg>
      <Uitleg title="Bronnen">
        <p>Hart van een band, adem van een stick op borst of buik. Zonder sensoren speelt een gesimuleerde ‘jij’ mee; met de knoppen kun je die laten ontspannen of spannen om de regels te testen.</p>
        <p>Nieuwe zinnen toevoegen: <span className="mono">scripts/meditaties/fragmenten.mjs</span>.</p>
      </Uitleg>
    </div>
  );
}

function Bron({ label, hub, value, onPick, filter }: { label: string; hub: BodyHub; value: Body; onPick: (id: string) => void; filter: (b: Body) => boolean }) {
  const opts = hub.bodies.filter(filter);
  if (!opts.includes(value)) opts.unshift(value);
  return (
    <label className="flex items-center justify-between gap-2 text-ink-3">
      {label}
      <select value={value.id} onChange={(e) => onPick(e.target.value)} className="px-1.5 py-1 text-[12px] flex-1 max-w-[200px]">
        {opts.map((b) => <option key={b.id} value={b.id}>{sourceMark(b)} {b.name}</option>)}
      </select>
    </label>
  );
}
