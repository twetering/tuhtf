import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { beep, buzzer, chime, whistle } from './sound';
import { BodyDot, Label, Seg, Uitleg, sourceMark, useEvents, useFrame } from './ui';

/**
 * Gym: spellen voor lijf en hart.
 *  · Koekoek  (Annemaria Koekoek) – beweeg zolang de wachter niet kijkt, sta stil als hij omdraait.
 *  · Herstel  – intervaltraining: werk, rust, en op het eind van de rust kijkt de wachter naar je hartslag.
 * Omroep: ElevenLabs-stemmen (vooraf gemaakt, offline), of fluit en piepjes, of stil.
 */
type Spel = 'koekoek' | 'herstel';
type Omroep = 'stem' | 'fluit' | 'stil';
type Cue = 'kStart' | 'kLopen' | 'kKoekoek' | 'kBetrapt' | 'kWinnaar' | 'hStart' | 'hWerk' | 'hRust' | 'hTien' | 'hKoekoek' | 'hGoed' | 'hStraf' | 'hLaatste' | 'hEinde';
const BASE = import.meta.env.BASE_URL ?? '/';

/** Omroeper: speelt een vooraf gemaakte stem, of een fluit/piep-patroon. */
function useOmroep(mode: Omroep) {
  const [clips, setClips] = useState<Record<string, { file: string; text: string }[]> | null>(null);
  const last = useRef<Record<string, number>>({});
  const playing = useRef<HTMLAudioElement | null>(null);
  const [caption, setCaption] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    fetch(`${BASE}gym/index.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setClips)
      .catch(() => setClips(null));
  }, []);
  const fluit: Record<Cue, () => void> = {
    kStart: () => [0, 0.35, 0.7].forEach((a, i) => beep(660 + i * 220, 0.12, 0.18, a)),
    kLopen: () => whistle(0.55),
    kKoekoek: () => (whistle(0.16), whistle(0.16, 0.22, 0.22), whistle(0.5, 0.22, 0.44)),
    kBetrapt: () => buzzer(),
    kWinnaar: () => [0, 0.4, 0.8].forEach((a) => whistle(0.3, 0.22, a)),
    hStart: () => [0, 0.35, 0.7].forEach((a, i) => beep(660 + i * 220, 0.12, 0.18, a)),
    hWerk: () => whistle(0.8),
    hRust: () => (whistle(0.25), beep(700, 0.25, 0.16, 0.35), beep(520, 0.4, 0.16, 0.65)),
    hTien: () => beep(880, 0.2),
    hKoekoek: () => (whistle(0.16), whistle(0.16, 0.22, 0.22)),
    hGoed: () => (beep(1320, 0.1, 0.16), beep(1760, 0.14, 0.16, 0.13)),
    hStraf: () => buzzer(),
    hLaatste: () => (beep(1000, 0.12), beep(1000, 0.12, 0.2, 0.2)),
    hEinde: () => [0, 0.4, 0.8].forEach((a) => whistle(0.3, 0.22, a)),
  };
  const call = (cue: Cue, gapMs = 1200) => {
    if (mode === 'stil') return;
    const now = performance.now();
    if (now - (last.current[cue] ?? -1e9) < gapMs) return;
    last.current[cue] = now;
    if (mode === 'fluit' || !clips?.[cue]?.length) return fluit[cue]();
    const list = clips[cue];
    const c = list[Math.floor(Math.random() * list.length)];
    playing.current?.pause();
    const a = new Audio(`${BASE}${c.file}`);
    a.play().catch(() => undefined);
    playing.current = a;
    setCaption({ text: c.text, at: now });
  };
  /** Aftellen: piepjes in de laatste 3 seconden van een fase. */
  const countdown = (secsLeft: number) => {
    if (mode === 'stil') return;
    if (secsLeft <= 3 && secsLeft >= 1) beep(660, 0.1, 0.14);
  };
  return { call, countdown, caption, ready: !!clips };
}

export default function Gym({ hub }: { hub: BodyHub }) {
  useFrame(20);
  const [spel, setSpel] = useState<Spel>('koekoek');
  const [omroep, setOmroep] = useState<Omroep>('stem');
  const o = useOmroep(omroep);
  const showCap = o.caption && performance.now() - o.caption.at < 3000 && omroep === 'stem';
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Seg value={spel} options={['koekoek', 'herstel'] as const} onChange={setSpel} labels={{ koekoek: 'Koekoek · beweging', herstel: 'Herstelslag · hartslag' }} />
        <span className="text-ink-4">·</span>
        <Seg value={omroep} options={['stem', 'fluit', 'stil'] as const} onChange={setOmroep} labels={{ stem: '🗣 stem', fluit: '📣 fluit + piep', stil: 'stil' }} />
        <span className={`text-[15px] italic text-ink-2 transition-opacity duration-500 ${showCap ? 'opacity-100' : 'opacity-0'}`}>“{o.caption?.text}”</span>
      </div>
      {spel === 'koekoek' ? <Koekoek hub={hub} o={o} /> : <Herstel hub={hub} o={o} />}
      <Uitleg title="Omroep">
        <p>Stem: twee vooraf gemaakte ElevenLabs-stemmen (een plagerige wachter en een energieke coach), dus het werkt ook zonder internet. Fluit + piep: sportfluit, piepjes zoals bij de piepjestest en een zoemer. In de laatste drie seconden van elke fase klinkt een aftelpiep.</p>
        <p>Nieuwe zinnen: <span className="mono">scripts/meditaties/gym.mjs</span>.</p>
      </Uitleg>
    </div>
  );
}
type O = ReturnType<typeof useOmroep>;

/** Hoeveel beweegt dit lichaam nú (0..1)? Echte sensor: laatste 0,4 s ruwe data; anders de geschatte activiteit. */
function motionNow(hub: BodyHub, b: Body) {
  const p = hub.procs.get(b.id);
  if (!p || !p.raw.count) return b.acc.activity;
  const r = p.raw;
  const since = r.t[(r.head - 1 + r.t.length) % r.t.length] - 400;
  let dev = 0;
  let gyr = 0;
  let n = 0;
  for (const i of r.range(since)) {
    dev += Math.abs(Math.hypot(r.a[0][i], r.a[1][i], r.a[2][i]) - 1000);
    gyr += Math.hypot(r.g[0][i], r.g[1][i], r.g[2][i]);
    n++;
  }
  if (!n) return 0;
  return Math.min(1, Math.max(dev / n / 160, r.hasGyro ? gyr / n / 110 : 0));
}

/** De wachter: rug (beweeg) of gezicht met oog (kijkt). */
function Wachter({ looking, label, sub, warn = 0 }: { looking: boolean; label: string; sub?: string; warn?: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[200px] h-[200px]" style={{ perspective: 800 }}>
        <div className="absolute inset-0 transition-transform duration-500" style={{ transformStyle: 'preserve-3d', transform: `rotateY(${looking ? 180 : 0}deg)` }}>
          <div className="absolute inset-0 grid place-items-center" style={{ backfaceVisibility: 'hidden' }}>
            <svg viewBox="-100 -100 200 200" width="200" height="200">
              <path d="M-46 -100 H46 L78 -68 V68 L46 100 H-46 L-78 68 V-68 Z" fill="var(--sk-ink)" opacity={0.12 + warn * 0.5} />
              <circle r={34} cy={-26} fill="var(--sk-ink)" />
              <path d="M-52 70 Q-52 10 0 10 Q52 10 52 70 Z" fill="var(--sk-ink)" />
            </svg>
          </div>
          <div className="absolute inset-0 grid place-items-center" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <svg viewBox="-100 -100 200 200" width="200" height="200">
              <path d="M-46 -100 H46 L78 -68 V68 L46 100 H-46 L-78 68 V-68 Z" fill="var(--sk-hart)" />
              <ellipse rx={58} ry={34} fill="var(--sk-bg)" />
              <circle r={22} fill="var(--sk-ink)" />
              <circle r={7} cx={7} cy={-7} fill="var(--sk-bg)" />
            </svg>
          </div>
        </div>
      </div>
      <div className={`display text-[clamp(44px,6vw,84px)] tabular-nums ${looking ? 'text-hart' : ''}`}>{label}</div>
      {sub && <div className="mono text-[13px] text-ink-3 -mt-2 text-center">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------- Koekoek (beweging)

type Phase = 'klaar' | 'lopen' | 'draait' | 'kijkt' | 'einde';
function Koekoek({ hub, o }: { hub: BodyHub; o: O }) {
  const [phase, setPhase] = useState<Phase>('klaar');
  const [until, setUntil] = useState(0);
  const [pos, setPos] = useState<Record<string, number>>({});
  const [caught, setCaught] = useState<Record<string, number>>({});
  const [out, setOut] = useState<string[]>([]);
  const [showData, setShowData] = useState(true);
  const [strict, setStrict] = useState<'terug' | 'af'>('terug');
  const [thr, setThr] = useState(0.14);
  const [winner, setWinner] = useState<string | null>(null);
  const kijkStart = useRef(0);
  const players = hub.bodies;
  const now = performance.now();
  const LEN = 100;

  const toLopen = (first = false) => {
    setPhase('lopen');
    setUntil(performance.now() + (first ? 5000 : 3500 + Math.random() * 5500));
    o.call(first ? 'kStart' : 'kLopen');
    players.forEach((b) => b.sim && (b.sim.activity = 0.35 + Math.random() * 0.6));
  };
  const start = () => {
    setPos({});
    setOut([]);
    setCaught({});
    setWinner(null);
    toLopen(true);
  };

  useEffect(() => {
    if (phase === 'klaar' || phase === 'einde') return;
    const id = window.setInterval(() => {
      const t = performance.now();
      if (t < until) return;
      if (phase === 'lopen') {
        setPhase('draait');
        setUntil(t + 1500);
        o.call('kKoekoek');
      } else if (phase === 'draait') {
        setPhase('kijkt');
        kijkStart.current = t;
        setUntil(t + 2500 + Math.random() * 3500);
        players.forEach((b) => {
          if (!b.sim) return;
          const late = Math.random() < 0.15;
          window.setTimeout(() => {
            b.sim!.activity = 0;
            b.acc.activity *= 0.15;
          }, late ? 1400 : 150 + Math.random() * 450);
        });
      } else if (phase === 'kijkt') toLopen();
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, until]);

  useEffect(() => {
    if (phase !== 'lopen' && phase !== 'kijkt' && phase !== 'draait') return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const t = performance.now();
      const dt = (t - last) / 1000;
      last = t;
      if (phase === 'lopen' || phase === 'draait') {
        setPos((p) => {
          const n = { ...p };
          for (const b of players) {
            if (out.includes(b.id)) continue;
            n[b.id] = Math.min(LEN, (n[b.id] ?? 0) + motionNow(hub, b) * dt * 4.5);
            if (n[b.id] >= LEN && !winner) {
              setWinner(b.id);
              setPhase('einde');
              chime(true);
              o.call('kWinnaar');
            }
          }
          return n;
        });
      } else if (phase === 'kijkt') {
        if (t - kijkStart.current < 600) return; // genadetijd
        for (const b of players) {
          if (out.includes(b.id) || caught[b.id] > kijkStart.current) continue;
          if (motionNow(hub, b) > thr) {
            setCaught((c) => ({ ...c, [b.id]: t }));
            o.call('kBetrapt', 1800);
            if (strict === 'af') setOut((x) => [...x, b.id]);
            else setPos((p) => ({ ...p, [b.id]: Math.max(0, (p[b.id] ?? 0) - 15) }));
          }
        }
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, until, out, caught, thr, strict, winner]);
  useEffect(() => () => players.forEach((b) => b.sim && (b.sim.activity = 0)), [players]);

  const looking = phase === 'kijkt';
  const label = phase === 'klaar' ? 'Klaar?' : phase === 'lopen' ? 'Beweeg!' : phase === 'draait' ? 'Koekoek…' : phase === 'kijkt' ? 'Stil!' : 'Einde';
  const sub = phase === 'einde' && winner ? `${hub.get(winner)?.name} is er` : phase === 'kijkt' ? `${Math.max(0, (until - now) / 1000).toFixed(0)} s` : undefined;

  return (
    <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="flex flex-col items-center gap-4">
        <Wachter looking={looking} label={label} sub={sub} warn={phase === 'draait' ? 1 : 0} />
        <div className="flex gap-2">
          <button className="btn accent big" onClick={start}>{phase === 'klaar' || phase === 'einde' ? '▶ start' : '↺ opnieuw'}</button>
          {phase !== 'klaar' && phase !== 'einde' && <button className="btn big" onClick={() => setPhase('einde')}>■</button>}
        </div>
        <div className="flex flex-wrap gap-1.5 justify-center">
          <button className={`chip ${showData ? 'on' : ''}`} onClick={() => setShowData(!showData)}>bewegingsdata</button>
          <button className={`chip ${strict === 'af' ? 'on' : ''}`} onClick={() => setStrict(strict === 'af' ? 'terug' : 'af')}>{strict === 'af' ? 'betrapt = af' : 'betrapt = 15 terug'}</button>
        </div>
        <label className="w-full max-w-[260px] text-[12px] text-ink-3">
          gevoeligheid · grens {Math.round(thr * 100)}%
          <input type="range" min={0.04} max={0.4} step={0.01} value={thr} onChange={(e) => setThr(+e.target.value)} className="w-full" />
        </label>
      </div>
      <div className="card p-5">
        <div className="space-y-2.5">
          {players.map((b) => {
            const p = pos[b.id] ?? 0;
            const m = motionNow(hub, b);
            const isOut = out.includes(b.id);
            const justCaught = now - (caught[b.id] ?? -1e9) < 1500;
            return (
              <div key={b.id} className={`grid grid-cols-[110px_minmax(0,1fr)_64px] items-center gap-3 ${isOut ? 'opacity-35' : ''}`}>
                <div className="text-[13px] truncate flex items-center gap-1.5"><BodyDot b={b} size={8} /> {sourceMark(b)} {b.name}</div>
                <div className="relative h-[34px]" style={{ background: 'color-mix(in oklab, var(--sk-ink) 7%, transparent)' }}>
                  <div className="absolute right-0 top-0 bottom-0 w-[3px]" style={{ background: 'var(--sk-ink)' }} />
                  {showData && (
                    <>
                      <div className="absolute left-0 bottom-0 h-[5px]" style={{ width: `${m * 100}%`, background: m > thr ? 'var(--sk-hart)' : 'var(--sk-ink-3)', transition: 'width 80ms' }} />
                      <div className="absolute bottom-0 h-[9px] w-[2px]" style={{ left: `${thr * 100}%`, background: 'var(--sk-ink)' }} />
                    </>
                  )}
                  <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[22px] h-[22px] rounded-full transition-[left] duration-150" style={{ left: `${(p / LEN) * 100}%`, background: `hsl(${b.hue} 80% 58%)`, boxShadow: justCaught ? '0 0 0 5px var(--sk-hart)' : 'none' }} />
                </div>
                <div className="mono text-[11px] text-right">{isOut ? 'af' : justCaught ? <span className="text-hart">betrapt</span> : `${Math.round(p)}%`}</div>
              </div>
            );
          })}
        </div>
      </div>
      <Uitleg title="Koekoek">
        <ul>
          <li>Iedereen draagt een bewegingssensor (M5Stick, telefoon of Polar H10). Gesimuleerde spelers doen mee om te oefenen.</li>
          <li><b>Beweeg!</b> Hoe meer je beweegt, hoe sneller je naar de overkant gaat. Op de plaats mag ook: springen, rennen, schudden.</li>
          <li><b>Annemaria koekoek!</b> De wachter draait zich om. Na een halve seconde moet je doodstil staan. Wie nog beweegt, gaat 15 terug of is af.</li>
          <li>Strategie: hard bewegen brengt je verder, maar maakt stilstaan moeilijker. Je hijgt, je wankelt, je hart bonst.</li>
        </ul>
      </Uitleg>
    </div>
  );
}

// ---------------------------------------------------------------------------- Herstelslag (interval)

type HPhase = 'klaar' | 'werk' | 'rust' | 'check' | 'einde';
type Check = { round: number; results: Record<string, { hr: number; limit: number; penalty: number }> };

function Herstel({ hub, o }: { hub: BodyHub; o: O }) {
  const [phase, setPhase] = useState<HPhase>('klaar');
  const [round, setRound] = useState(0);
  const [until, setUntil] = useState(0);
  const [beats, setBeats] = useState<Record<string, number>>({});
  const [penalty, setPenalty] = useState<Record<string, number>>({});
  const [checks, setChecks] = useState<Check[]>([]);
  const [werk, setWerk] = useState(60);
  const [rust, setRust] = useState(60);
  const [rondes, setRondes] = useState(6);
  const [limitMode, setLimitMode] = useState<'herstel' | 'absoluut'>('herstel');
  const [absLimit, setAbsLimit] = useState(120);
  const [drop, setDrop] = useState(20);
  const peak = useRef<Record<string, number>>({});
  const t0 = useRef(0);
  const lastSec = useRef(-1);
  const tienDone = useRef(false);
  const players = hub.bodies;
  const now = performance.now();
  const limitFor = (b: Body) => (limitMode === 'absoluut' ? absLimit : Math.round((peak.current[b.id] ?? b.hr) - drop));

  const toWerk = (r: number) => {
    setPhase('werk');
    setRound(r);
    setUntil(performance.now() + werk * 1000);
    peak.current = {};
    o.call(r === 1 ? 'hStart' : r === rondes ? 'hLaatste' : 'hWerk');
    players.forEach((b) => b.sim && (b.sim.activity = 0.65 + Math.random() * 0.35));
  };
  const start = () => {
    setBeats({});
    setPenalty({});
    setChecks([]);
    t0.current = performance.now();
    toWerk(1);
  };
  const stop = () => {
    setPhase('einde');
    players.forEach((b) => b.sim && (b.sim.activity = 0));
  };

  useEvents(hub, (id, s) => {
    if (s !== 'hart' || phase === 'klaar' || phase === 'einde') return;
    setBeats((b) => ({ ...b, [id]: (b[id] ?? 0) + 1 }));
  });

  useEffect(() => {
    if (phase === 'klaar' || phase === 'einde') return;
    const id = window.setInterval(() => {
      const t = performance.now();
      const left = (until - t) / 1000;
      const sec = Math.ceil(left);
      if (sec !== lastSec.current) {
        lastSec.current = sec;
        if (phase !== 'check') o.countdown(sec);
      }
      if (phase === 'werk') for (const b of players) peak.current[b.id] = Math.max(peak.current[b.id] ?? 0, b.hr);
      if (phase === 'rust' && left <= 10.5 && !tienDone.current && rust > 15) {
        tienDone.current = true;
        o.call('hTien');
      }
      if (left > 0) return;
      if (phase === 'werk') {
        setPhase('rust');
        setUntil(t + rust * 1000);
        tienDone.current = false;
        o.call('hRust');
        players.forEach((b) => b.sim && (b.sim.activity = Math.random() < 0.2 ? 0.25 : 0));
      } else if (phase === 'rust') {
        const results: Check['results'] = {};
        const pen: Record<string, number> = {};
        for (const b of players) {
          const limit = limitFor(b);
          const over = Math.max(0, Math.round(b.hr - limit));
          results[b.id] = { hr: Math.round(b.hr), limit, penalty: over * 10 };
          pen[b.id] = over * 10;
        }
        setPenalty((p) => Object.fromEntries(players.map((b) => [b.id, (p[b.id] ?? 0) + (pen[b.id] ?? 0)])));
        setChecks((c) => [...c, { round, results }]);
        const anyPen = Object.values(pen).some((x) => x > 0);
        o.call('hKoekoek');
        window.setTimeout(() => o.call(anyPen ? 'hStraf' : 'hGoed'), 1800);
        setPhase('check');
        setUntil(t + 5000);
      } else if (phase === 'check') {
        if (round >= rondes) {
          setPhase('einde');
          o.call('hEinde');
          chime(true);
          players.forEach((b) => b.sim && (b.sim.activity = 0));
        } else toWerk(round + 1);
      }
    }, 50);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, until, round, rondes, werk, rust, limitMode, absLimit, drop]);
  useEffect(() => () => players.forEach((b) => b.sim && (b.sim.activity = 0)), [players]);

  const left = Math.max(0, until - now);
  const fmt = (ms: number) => {
    const sec = Math.ceil(ms / 1000);
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const last = checks[checks.length - 1];
  const looking = phase === 'check';
  const label = { klaar: 'Klaar?', werk: fmt(left), rust: fmt(left), check: 'Koekoek!', einde: 'Klaar' }[phase];
  const sub = phase === 'werk' ? `WERK · ronde ${round}/${rondes}` : phase === 'rust' ? `RUST · breng je hart omlaag · ronde ${round}/${rondes}` : phase === 'check' ? 'de wachter kijkt naar je hart' : phase === 'einde' ? `${rondes} rondes` : `${rondes} × (${werk}s werk + ${rust}s rust)`;
  const net = (b: Body) => (beats[b.id] ?? 0) - (penalty[b.id] ?? 0);
  const ranked = [...players].sort((a, b) => net(b) - net(a));
  // tijdlijn van het hele programma
  const total = rondes * (werk + rust + 5);
  const elapsed = phase === 'klaar' ? 0 : phase === 'einde' ? total : (round - 1) * (werk + rust + 5) + (phase === 'werk' ? werk - left / 1000 : phase === 'rust' ? werk + rust - left / 1000 : werk + rust + 5 - left / 1000);

  return (
    <div className="space-y-5">
      {/* intervaltijdlijn */}
      <div className="relative h-[22px] flex gap-[3px]">
        {Array.from({ length: rondes }, (_, i) => (
          <div key={i} className="flex flex-1 gap-[2px]">
            <div style={{ flex: werk, background: 'var(--sk-ink)', opacity: 0.85 }} />
            <div style={{ flex: rust, background: 'var(--sk-ink)', opacity: 0.25 }} />
            <div style={{ flex: 5, background: 'var(--sk-hart)', opacity: 0.8 }} />
          </div>
        ))}
        <div className="absolute -top-1 -bottom-1 w-[3px]" style={{ left: `${(elapsed / total) * 100}%`, background: 'var(--sk-acc)', transition: 'left 200ms linear' }} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex flex-col items-center gap-4">
          <Wachter looking={looking} label={label} sub={sub} warn={phase === 'rust' ? 1 - left / (rust * 1000) : 0} />
          <div className="flex gap-2">
            <button className="btn accent big" onClick={start}>{phase === 'klaar' || phase === 'einde' ? '▶ start' : '↺ opnieuw'}</button>
            {phase !== 'klaar' && phase !== 'einde' && <button className="btn big" onClick={stop}>■</button>}
          </div>
          <div className="w-full max-w-[290px] space-y-3 text-[12.5px]">
            <Row label="werk"><Seg value={werk} options={[20, 30, 45, 60, 90, 120] as const} onChange={setWerk} labels={{ 20: '20s', 30: '30s', 45: '45s', 60: '1m', 90: '1½m', 120: '2m' }} /></Row>
            <Row label="rust"><Seg value={rust} options={[20, 30, 45, 60, 90] as const} onChange={setRust} labels={{ 20: '20s', 30: '30s', 45: '45s', 60: '1m', 90: '1½m' }} /></Row>
            <Row label="rondes"><Seg value={rondes} options={[3, 4, 6, 8, 10] as const} onChange={setRondes} /></Row>
            <Row label="grens"><Seg value={limitMode} options={['herstel', 'absoluut'] as const} onChange={setLimitMode} labels={{ herstel: `piek −${drop}`, absoluut: `onder ${absLimit}` }} /></Row>
            {limitMode === 'herstel' ? (
              <label className="block text-ink-3">{drop} bpm onder je piek van het werkblok<input type="range" min={5} max={50} value={drop} onChange={(e) => setDrop(+e.target.value)} className="w-full" /></label>
            ) : (
              <label className="block text-ink-3">vaste grens {absLimit} bpm<input type="range" min={80} max={170} value={absLimit} onChange={(e) => setAbsLimit(+e.target.value)} className="w-full" /></label>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            {ranked.map((b, i) => {
              const limit = limitFor(b);
              const r = last?.results[b.id];
              const danger = phase === 'rust' && b.hr > limit;
              return (
                <div key={b.id} className="card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-[15px]"><span className="mono text-[11px] text-ink-3">{i + 1}</span><BodyDot b={b} size={9} /> {sourceMark(b)} {b.name}</div>
                    {phase === 'check' && r && <span className={`mono text-[12px] ${r.penalty ? 'text-hart' : ''}`}>{r.penalty ? `−${r.penalty}` : '✓'}</span>}
                  </div>
                  <div className="flex items-end justify-between mt-2">
                    <div>
                      <div className={`text-[54px] font-light tracking-[-0.04em] leading-none tabular-nums ${danger ? 'text-hart' : ''}`}>{Math.round(b.hr) || '–'}</div>
                      <div className="mono text-[10.5px] text-ink-3 mt-1">bpm · grens {limit}{limitMode === 'herstel' && peak.current[b.id] ? ` (piek ${Math.round(peak.current[b.id])})` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[26px] font-light tabular-nums leading-none">{net(b)}</div>
                      <div className="mono text-[10.5px] text-ink-3 mt-1">slagen{penalty[b.id] ? ` (−${penalty[b.id]})` : ''}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {checks.length > 0 && (
            <div className="card p-4 overflow-auto">
              <Label>kijkmomenten · hartslag / grens</Label>
              <table className="w-full mono text-[11.5px] mt-2">
                <thead className="text-ink-3"><tr><td className="pb-1">ronde</td>{players.map((b) => <td key={b.id}>{b.name}</td>)}</tr></thead>
                <tbody>
                  {checks.map((c) => (
                    <tr key={c.round} className="border-t border-ink/10">
                      <td className="py-1">{c.round}</td>
                      {players.map((b) => {
                        const r = c.results[b.id];
                        return <td key={b.id} className={r?.penalty ? 'text-hart' : ''}>{r ? `${r.hr}/${r.limit}${r.penalty ? ` −${r.penalty}` : ' ✓'}` : '—'}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <Uitleg title="Herstelslag">
        <ul>
          <li><b>Werk</b> (standaard 1 minuut). Elke hartslag die je maakt telt op. Hoe harder je werkt, hoe meer slagen.</li>
          <li><b>Rust</b> (standaard 1 minuut). De coach kondigt de rust aan; nu moet je je hart omlaag krijgen. Tien seconden voor het eind hoor je: ‘nog tien seconden’.</li>
          <li><b>Koekoek.</b> Aan het eind van de rust kijkt de wachter naar je hartslag. Elke slag boven je grens kost 10 slagen. Daarna begint de volgende ronde.</li>
          <li><b>Grens.</b> ‘Piek −20’ meet herstel: 20 slagen onder je hoogste hartslag van het werkblok. ‘Onder 120’ is een vaste grens voor iedereen.</li>
          <li>Na het laatste kijkmoment wint wie de meeste slagen overhoudt.</li>
        </ul>
      </Uitleg>
      <Uitleg title="Waarom dit belichaamde kennis is">
        <p>Hartslag reageert traag. Wie dit spel wint, leert voelen hoe ver hij kan gaan en hoe snel zijn lichaam herstelt: precies wat sporters ‘herstelvermogen’ noemen, maar hier ervaar je het in plaats van het af te lezen.</p>
        <p>Voor CrossFit: koppel ieders hartslagband via ⚙, kies werk en rust, en zet het scherm op de tv in de box.</p>
      </Uitleg>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-3">{label}</span>
      {children}
    </div>
  );
}
