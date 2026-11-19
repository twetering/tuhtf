import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { jitter } from './motion';
import { BodyDot, Label, Seg, Spark, Uitleg, sourceMark } from './ui';

/**
 * Wie leidt? Dataficatie van de zwerm: wie begint een beweging en wie volgt een fractie later.
 * Groep: pijlen tussen alle lichamen. Duo: twee dansers, of twee mensen in gesprek (spiegelen).
 */
const HZ = 10;
const N = HZ * 40; // 40 s geschiedenis
type Kanaal = 'beweging' | 'draaien' | 'adem' | 'houding';

/** Eén getal per lichaam per 0,1 s, per kanaal. Echte sensor: uit ruwe data; sim: uit de schatting. */
function sample(hub: BodyHub, b: Body, k: Kanaal) {
  const p = hub.procs.get(b.id);
  if (k === 'beweging') {
    if (!p) return b.acc.activity;
    const j = jitter(p, 300);
    return Math.min(1, Math.max(j.dev / 160, p.raw.hasGyro ? j.gyro / 110 : 0));
  }
  if (k === 'draaien') return p ? p.rotSpeed / 200 : b.acc.activity;
  if (k === 'adem') return b.sim || b.acc.breathQ > 0.35 ? 0.5 - 0.5 * Math.cos(b.acc.breathPhase * Math.PI * 2) : 0;
  return (p ? p.posture().angle : b.acc.tilt) / 90;
}

/** Pearson-correlatie van a met b, waarbij b `lag` samples later komt (lag > 0: a leidt). */
function xcorr(a: number[], b: number[], lag: number) {
  const n = Math.min(a.length, b.length) - Math.abs(lag);
  if (n < 20) return 0;
  const off = a.length - Math.min(a.length, b.length);
  const x = lag >= 0 ? a.slice(off, off + n) : a.slice(off - lag, off - lag + n);
  const y = lag >= 0 ? b.slice(lag, lag + n) : b.slice(0, n);
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

export default function Leiden({ hub }: { hub: BodyHub }) {
  const [mode, setMode] = useState<'groep' | 'duo'>('groep');
  const [kanaal, setKanaal] = useState<Kanaal>('beweging');
  const [simLeader, setSimLeader] = useState(true);
  const [secret, setSecret] = useState<string | null>(null);
  const series = useRef<Record<string, Record<Kanaal, number[]>>>({});
  const [, force] = useState(0);

  // alle kanalen tegelijk opnemen, zodat wisselen direct resultaat geeft
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const b of hub.bodies) {
        const s = (series.current[b.id] ??= { beweging: [], draaien: [], adem: [], houding: [] });
        for (const k of ['beweging', 'draaien', 'adem', 'houding'] as Kanaal[]) {
          s[k].push(sample(hub, b, k) + (Math.random() - 0.5) * 0.004);
          if (s[k].length > N) s[k].shift();
        }
      }
      force((n) => n + 1);
    }, 1000 / HZ);
    return () => clearInterval(id);
  }, [hub]);

  // oefenen zonder mensen: één gesimuleerde leider, de rest volgt met ~1,5 s vertraging
  useEffect(() => {
    const sims = hub.bodies.filter((b) => b.sim);
    if (!simLeader || !sims.length) {
      setSecret(null);
      return;
    }
    const l = sims[Math.floor(Math.random() * sims.length)];
    setSecret(l.id);
    sims.forEach((b) => (b.sim!.follow = b === l ? null : l.id));
    const vary = window.setInterval(() => {
      if (l.sim) l.sim.activity = Math.random() < 0.3 ? 0 : 0.15 + Math.random() * 0.7;
    }, 3500);
    return () => {
      clearInterval(vary);
      sims.forEach((b) => b.sim && ((b.sim.follow = null), (b.sim.activity = 0)));
    };
  }, [hub, simLeader]);

  const get = (id: string) => series.current[id]?.[kanaal] ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Seg value={mode} options={['groep', 'duo'] as const} onChange={setMode} labels={{ groep: 'groep · wie leidt de zwerm', duo: 'duo · dans of gesprek' }} />
        <span className="mx-1 text-ink-4">·</span>
        <Seg value={kanaal} options={['beweging', 'draaien', 'adem', 'houding'] as const} onChange={setKanaal} />
        {hub.bodies.some((b) => b.sim) && (
          <button className={`chip ${simLeader ? 'on' : ''}`} onClick={() => setSimLeader(!simLeader)}>sim-leider</button>
        )}
      </div>
      {mode === 'groep' ? <Groep hub={hub} get={get} secret={secret} /> : <Duo hub={hub} get={get} kanaal={kanaal} />}
      <Uitleg title="Hoe het werkt">
        <p>Elk lichaam levert tien keer per seconde een getal: hoeveel het beweegt, draait, ademt of hoe het staat. Voor elk paar wordt gekeken of de een de ander vooruit loopt: lijkt het signaal van B op dat van A, maar dan een halve tot twee seconden later? Dan volgt B, en leidt A.</p>
      </Uitleg>
      <Uitleg title="Kanalen">
        <ul>
          <li><b>Beweging</b>: wie begint met bewegen of stilstaan. Voor de zwerm door de ruimte.</li>
          <li><b>Draaien</b>: draaisnelheid (gyro). Voor dansers: wie zet een draai in?</li>
          <li><b>Adem</b>: wie ademt voor, wie ademt na. Voor een gesprek of een stil duo.</li>
          <li><b>Houding</b>: kanteling. Spiegelen in een gesprek of date: leunt de een naar voren, en volgt de ander?</li>
        </ul>
      </Uitleg>
    </div>
  );
}

function Groep({ hub, get, secret }: { hub: BodyHub; get: (id: string) => number[]; secret: string | null }) {
  const [reveal, setReveal] = useState(false);
  const B = hub.bodies;
  const edges: { from: Body; to: Body; w: number }[] = [];
  const score: Record<string, number> = {};
  const sync: Record<string, number> = {};
  for (let i = 0; i < B.length; i++)
    for (let j = 0; j < B.length; j++) {
      if (i === j) continue;
      const a = get(B[i].id);
      const b = get(B[j].id);
      let best = 0;
      for (const lag of [4, 7, 10, 15, 20]) best = Math.max(best, xcorr(a, b, lag) - xcorr(b, a, lag));
      if (best > 0.15) edges.push({ from: B[i], to: B[j], w: best });
      score[B[i].id] = (score[B[i].id] ?? 0) + Math.max(0, best);
      if (i < j) {
        const r = Math.max(...[-10, -5, 0, 5, 10].map((l) => xcorr(a, b, l)));
        sync[B[i].id] = (sync[B[i].id] ?? 0) + r;
        sync[B[j].id] = (sync[B[j].id] ?? 0) + r;
      }
    }
  const cohesion = B.length > 1 ? Object.values(sync).reduce((s, v) => s + v, 0) / (B.length * (B.length - 1)) : 0;
  const role = (b: Body) => {
    const lead = score[b.id] ?? 0;
    const follows = edges.filter((e) => e.to === b).reduce((s, e) => s + e.w, 0);
    const together = (sync[b.id] ?? 0) / Math.max(1, B.length - 1);
    if (together < 0.15) return 'eigen koers';
    return lead > follows * 1.2 ? 'leidt' : follows > lead * 1.2 ? 'volgt' : 'meebeweger';
  };
  const pos = (i: number) => ({ x: Math.cos((i / B.length) * Math.PI * 2 - Math.PI / 2) * 150, y: Math.sin((i / B.length) * Math.PI * 2 - Math.PI / 2) * 150 });
  const ranked = [...B].sort((a, b) => (score[b.id] ?? 0) - (score[a.id] ?? 0));
  const top = edges.sort((a, b) => b.w - a.w).slice(0, 18);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="card p-2">
        <svg viewBox="-220 -200 440 400" className="w-full max-h-[520px]">
          <defs>
            <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--sk-ink)" />
            </marker>
          </defs>
          {top.map((e, k) => {
            const a = pos(B.indexOf(e.from));
            const b = pos(B.indexOf(e.to));
            const d = Math.hypot(b.x - a.x, b.y - a.y) || 1;
            const ux = (b.x - a.x) / d;
            const uy = (b.y - a.y) / d;
            return <line key={k} x1={a.x + ux * 24} y1={a.y + uy * 24} x2={b.x - ux * 26} y2={b.y - uy * 26} stroke="var(--sk-ink)" strokeOpacity={Math.min(0.9, e.w)} strokeWidth={1 + e.w * 3} markerEnd="url(#arr)" />;
          })}
          {B.map((b, i) => {
            const p = pos(i);
            const v = get(b.id).at(-1) ?? 0;
            return (
              <g key={b.id} transform={`translate(${p.x} ${p.y})`}>
                <circle r={16 + v * 10} fill={`hsl(${b.hue} 70% 58%)`} stroke={reveal && b.id === secret ? 'var(--sk-ink)' : 'none'} strokeWidth={3} />
                <text y={36} textAnchor="middle" fontSize={12} fill="var(--sk-ink)" fontFamily="Geist">{b.name}</text>
                <text y={49} textAnchor="middle" fontSize={9.5} fill="var(--sk-ink-3)" fontFamily="Geist Mono">{role(b)}</text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="space-y-4">
        <div className="card p-4">
          <Label>volgens de data leidt</Label>
          <div className="mt-2 space-y-1.5">
            {ranked.slice(0, 5).map((b, i) => (
              <div key={b.id} className="flex items-center gap-2 text-[13px]">
                <span className="mono w-4 text-ink-3">{i + 1}</span>
                <span className="w-[80px] truncate">{b.name}</span>
                <div className="flex-1 h-[6px]" style={{ background: 'color-mix(in oklab, var(--sk-ink) 10%, transparent)' }}>
                  <div className="h-full" style={{ width: `${((score[b.id] ?? 0) / Math.max(0.01, score[ranked[0].id] ?? 1)) * 100}%`, background: 'var(--sk-ink)' }} />
                </div>
              </div>
            ))}
          </div>
          {secret && <button className="btn mt-3" onClick={() => setReveal(!reveal)}>{reveal ? `sim-leider: ${hub.get(secret)?.name}` : 'onthul sim-leider'}</button>}
        </div>
        <div className="card p-4">
          <Label>samenhang van de zwerm</Label>
          <div className="text-[48px] font-light tracking-[-0.04em] leading-none tabular-nums mt-1">{Math.round(Math.max(0, cohesion) * 100)}%</div>
          <div className="mono text-[10.5px] text-ink-3 mt-1">gemiddelde gelijkenis tussen alle paren</div>
        </div>
        <Uitleg title="Rollen">
          <ul>
            <li><b>Leidt</b>: anderen lijken een fractie later op jou.</li>
            <li><b>Volgt</b>: jij lijkt een fractie later op anderen.</li>
            <li><b>Meebeweger</b>: tegelijk, zonder duidelijke volgorde.</li>
            <li><b>Eigen koers</b>: je beweegt los van de rest.</li>
          </ul>
        </Uitleg>
        <Uitleg title="Om over te praten">
          <ul>
            <li>Vraag eerst iedereen: wie denk jij dat leidde? Toon dan de pijlen.</li>
            <li>Klopt je gevoel? Mensen die denken te volgen, blijken vaak te leiden, en andersom.</li>
          </ul>
        </Uitleg>
      </div>
    </div>
  );
}

function Duo({ hub, get, kanaal }: { hub: BodyHub; get: (id: string) => number[]; kanaal: Kanaal }) {
  const B = hub.bodies;
  const [pair, setPair] = useState<[string, string]>(() => [B[0]?.id ?? '', B[1]?.id ?? '']);
  const A = hub.get(pair[0]) ?? B[0];
  const C = hub.get(pair[1]) ?? B[1];
  if (!A || !C) return <div className="card p-6 text-ink-3">Minstens twee lichamen nodig.</div>;
  const a = get(A.id);
  const c = get(C.id);
  const lags = Array.from({ length: 61 }, (_, i) => i - 30); // −3 … +3 s
  const curve = lags.map((l) => xcorr(a, c, l));
  let bi = 30;
  curve.forEach((r, i) => r > curve[bi] && (bi = i));
  const lagS = lags[bi] / HZ;
  const peak = curve[bi];
  // leiden door de tijd: per venster van 8 s
  const win = HZ * 8;
  const timeline: number[] = [];
  for (let end = win; end <= Math.min(a.length, c.length); end += HZ) {
    const wa = a.slice(end - win, end);
    const wc = c.slice(end - win, end);
    let best = 0;
    let bl = 0;
    for (let l = -20; l <= 20; l += 2) {
      const r = xcorr(wa, wc, l);
      if (r > best) (best = r), (bl = l);
    }
    timeline.push(best > 0.3 ? bl / 20 : 0);
  }
  const verdict = peak < 0.25 ? 'geen duidelijk verband' : Math.abs(lagS) < 0.15 ? 'gelijktijdig: jullie bewegen samen' : lagS > 0 ? `${A.name} leidt, ${C.name} volgt ${lagS.toFixed(1)} s later` : `${C.name} leidt, ${A.name} volgt ${(-lagS).toFixed(1)} s later`;
  const W = 600;
  const H = 160;
  const pick = (k: 0 | 1, id: string) => setPair((p) => (k === 0 ? [id, p[1]] : [p[0], id]));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {[0, 1].map((k) => (
            <div key={k} className="flex flex-wrap gap-1 items-center">
              <span className="mono text-[11px] text-ink-3 mr-1">{k ? 'en' : 'wie'}</span>
              {B.map((b) => (
                <button key={b.id} className={`chip ${pair[k] === b.id ? 'on' : ''}`} onClick={() => pick(k as 0 | 1, b.id)}>
                  <BodyDot b={b} size={7} /> {sourceMark(b)} {b.name}
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="card p-4">
          <Label>{kanaal} · laatste 40 s</Label>
          <div className="mt-2">
            <Spark values={a} h={60} min={0} max={Math.max(0.2, ...a, ...c)} color={`hsl(${A.hue} 80% 50%)`} />
            <div className="-mt-[60px]">
              <Spark values={c} h={60} min={0} max={Math.max(0.2, ...a, ...c)} color={`hsl(${C.hue} 80% 50%)`} />
            </div>
          </div>
        </div>
        <div className="card p-4">
          <Label>gelijkenis bij verschuiving · links: {C.name} eerst · rechts: {A.name} eerst</Label>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2">
            <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="var(--sk-ink)" strokeOpacity={0.25} />
            <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--sk-ink)" strokeOpacity={0.15} />
            <path d={curve.map((r, i) => `${i ? 'L' : 'M'}${(i / 60) * W},${H / 2 - r * (H / 2 - 6)}`).join('')} fill="none" stroke="var(--sk-ink)" strokeWidth={2.5} />
            <circle cx={(bi / 60) * W} cy={H / 2 - peak * (H / 2 - 6)} r={6} fill="var(--sk-hart)" />
            {[-3, -2, -1, 0, 1, 2, 3].map((s) => (
              <text key={s} x={((s + 3) / 6) * W} y={H - 4} textAnchor="middle" fontSize={10} fill="var(--sk-ink-3)" fontFamily="Geist Mono">{s > 0 ? `+${s}` : s} s</text>
            ))}
          </svg>
        </div>
        <div className="card p-4">
          <Label>wie leidt door de tijd · boven: {A.name} · onder: {C.name}</Label>
          <svg viewBox={`0 0 ${W} 80`} className="w-full mt-2">
            <line x1={0} x2={W} y1={40} y2={40} stroke="var(--sk-ink)" strokeOpacity={0.2} />
            {timeline.map((v, i) => (
              <rect key={i} x={(i / Math.max(1, timeline.length)) * W} width={W / Math.max(1, timeline.length) - 1} y={v > 0 ? 40 - v * 36 : 40} height={Math.abs(v) * 36} fill={v > 0 ? `hsl(${A.hue} 80% 50%)` : `hsl(${C.hue} 80% 50%)`} />
            ))}
          </svg>
        </div>
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <Label>oordeel</Label>
          <div className="text-[26px] font-light tracking-[-0.02em] leading-tight mt-1">{verdict}</div>
          <div className="mono text-[11px] text-ink-3 mt-2">gelijkenis {Math.round(Math.max(0, peak) * 100)}% · verschuiving {lagS > 0 ? '+' : ''}{lagS.toFixed(1)} s</div>
        </div>
        <Uitleg title="Duo">
          <ul>
            <li><b>Dans.</b> Twee dansers met elk een stick op de onderrug. Kanaal ‘draaien’ of ‘beweging’. Wie zet in, wie reageert? Wisselt dat tijdens de dans?</li>
            <li><b>Gesprek of date.</b> Sticks op de borst. Kanaal ‘houding’ laat spiegelen zien (de een leunt, de ander volgt), kanaal ‘adem’ of iemand meeademt.</li>
            <li>De grafiek laat zien bij welke verschuiving de signalen het meest op elkaar lijken. Een piek rechts van het midden: de eerste persoon gaat voor.</li>
          </ul>
        </Uitleg>
      </div>
    </div>
  );
}
