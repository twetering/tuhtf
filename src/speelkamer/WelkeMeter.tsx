import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { analyse, guessPlace, nl, PLACES, type Analysis, type Meter, type Place, type Sample } from './meterAnalyse';
import { Label, Seg, sourceMark, useEvents, useFrame, Uitleg } from './ui';

/**
 * Welke meter? Twee hartslagmeters tegelijk om (bijv. pols en borst) en kijken hoe ver ze
 * uit elkaar lopen. Maakt voelbaar dat een hartslag geen vast gegeven is, maar een meting:
 * het hangt ervan af waar en hoe je meet.
 */

// ---------------------------------------------------------------------------- weergave

type Run = { dur: number; m1: Meter; m2: Meter; an: Analysis };
const DURS = [60, 120, 300] as const;
const C1 = 'var(--sk-hart)';
const C2 = 'var(--sk-adem)';

export default function WelkeMeter({ hub }: { hub: BodyHub }) {
  useFrame(4);
  const real = hub.bodies.filter((b) => b.source !== 'sim');
  const [id1, setId1] = useState<string | null>(null);
  const [id2, setId2] = useState<string | null>(null);
  const pool = real.length >= 2 ? real : hub.bodies;
  const A = hub.get(id1) ?? pool[0];
  const B = hub.get(id2) && id2 !== A?.id ? hub.get(id2)! : pool.find((b) => b.id !== A?.id);
  const [places, setPlaces] = useState<Record<string, Place>>({});
  const placeOf = (b: Body) => places[b.id] ?? guessPlace(b);
  const [dur, setDur] = useState<(typeof DURS)[number]>(60);
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const t0 = useRef(0);
  const beats = useRef<[number, number]>([0, 0]);

  useEvents(hub, (id, s) => {
    if (!running || s !== 'hart') return;
    if (id === A?.id) beats.current[0]++;
    if (id === B?.id) beats.current[1]++;
  });

  const meter = (b: Body, i: 0 | 1): Meter => ({ name: b.name, place: placeOf(b), beats: beats.current[i], rr: !!b.extra?.rr || b.source === 'sim' });
  const val = (b: Body) => (b.hr > 0 && (b.source === 'sim' || performance.now() - b.lastSeen < 3000) ? b.hr : null);

  // elke seconde één paar waarden; na de gekozen duur volgt de analyse
  useEffect(() => {
    if (!running || !A || !B) return;
    const id = window.setInterval(() => {
      const s = (performance.now() - t0.current) / 1000;
      setSamples((ss) => [...ss, { s, a: val(A), b: val(B) }]);
      if (s >= dur - 0.5) setRunning(false);
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, A?.id, B?.id, dur]);

  // klaar: analyse vastleggen
  const done = useRef(false);
  useEffect(() => {
    if (running || done.current || !A || !B || !samples.length) return;
    done.current = true;
    const m1 = meter(A, 0);
    const m2 = meter(B, 1);
    const an = analyse(samples, m1, m2);
    if (an) setRuns((r) => [{ dur: Math.round(samples[samples.length - 1].s), m1, m2, an }, ...r]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const start = () => {
    t0.current = performance.now();
    beats.current = [0, 0];
    done.current = false;
    setSamples([]);
    setRunning(true);
  };

  if (!A || !B) return <div className="card p-8">Er zijn twee meters nodig. Koppel er twee via de opstelling (rechtsboven).</div>;

  const v1 = val(A);
  const v2 = val(B);
  const live = analyse(samples, meter(A, 0), meter(B, 1));
  const shown = !running && runs.length ? runs[0] : null;
  const an = running ? live : shown?.an ?? live;
  const elapsed = running ? (performance.now() - t0.current) / 1000 : samples.length ? samples[samples.length - 1].s : 0;
  const sameDevice = A.extra?.deviceName && A.extra.deviceName === B.extra?.deviceName;

  const pick = (b: Body, set: (id: string) => void, other: Body, i: 1 | 2) => (
    <div className="flex items-center gap-2 text-[12.5px]">
      <span className="inline-block w-3 h-3 rounded-full" style={{ background: i === 1 ? C1 : C2 }} />
      <span className="text-ink-3">meter {i}</span>
      <select value={b.id} disabled={running} onChange={(e) => set(e.target.value)} className="bg-ink/[0.06] border border-ink/10 rounded-md px-2 py-1 text-ink">
        {hub.bodies.filter((x) => x.id !== other.id).map((x) => (
          <option key={x.id} value={x.id}>{sourceMark(x)} {x.name}</option>
        ))}
      </select>
      <select value={placeOf(b)} disabled={running} onChange={(e) => setPlaces((p) => ({ ...p, [b.id]: e.target.value as Place }))} className="bg-ink/[0.06] border border-ink/10 rounded-md px-2 py-1 text-ink" title="waar zit deze meter?">
        {PLACES.map((p) => (
          <option key={p} value={p}>{p || 'plek?'}</option>
        ))}
      </select>
    </div>
  );

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {pick(A, setId1, B, 1)}
          {pick(B, setId2, A, 2)}
        </div>
        <Uitleg title="Welke meter?">
          <p>Draag twee hartslagmeters tegelijk, bijvoorbeeld een horloge om je pols en een band om je borst. Ze meten hetzelfde hart, maar zelden hetzelfde getal.</p>
          <p>Een borstband meet de elektrische prikkel van elke slag (zoals een ECG). Een horloge kijkt met licht naar de bloedtoevoer in je pols en rekent daaruit een gemiddelde. Dat is trager, en gevoeliger voor bewegen, kou en hoe strak het bandje zit.</p>
          <p>Meet een minuut stil, en daarna een minuut terwijl je beweegt of je hand op en neer zwaait. Wat gebeurt er met het verschil?</p>
        </Uitleg>
        <Uitleg title="Let op bij Garmin">
          <p>Is de borstband ook aan je horloge gekoppeld? Dan gebruikt het horloge de borstband en zendt het die waarde door. Je vergelijkt dan de borstband met zichzelf. Ontkoppel de band van het horloge (of zet hem daar uit) voor een eerlijke vergelijking.</p>
        </Uitleg>

        {/* live getallen */}
        <div className="card p-6 grid grid-cols-3 gap-2 items-end text-center">
          {[[A, v1, C1, 1], [B, v2, C2, 2]].map(([b, v, c, i]) => {
            const body = b as Body;
            return (
              <div key={i as number} style={{ order: i === 1 ? 0 : 2 }}>
                <Label>{placeOf(body) ? `${placeOf(body)} · ${body.name}` : body.name}</Label>
                <div className="serif text-[clamp(44px,6vw,72px)] leading-none tabular-nums mt-2" style={{ color: c as string }}>{v === null ? '–' : Math.round(v as number)}</div>
                <div className="mono text-[10px] text-ink-4 mt-1">{body.source === 'sim' ? 'gesimuleerd' : body.extra?.rr ? 'slag voor slag (RR)' : 'alleen bpm'}</div>
              </div>
            );
          })}
          <div style={{ order: 1 }}>
            <Label>verschil nu</Label>
            <div className="serif text-[clamp(30px,4vw,44px)] leading-none tabular-nums mt-2">{v1 !== null && v2 !== null ? `${v1 - v2 >= 0.5 ? '+' : ''}${Math.round(v1 - v2)}` : '–'}</div>
            <div className="mono text-[10px] text-ink-4 mt-1">meter 1 − meter 2</div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label>{running ? `meten… ${Math.floor(elapsed)} / ${dur} s` : samples.length ? `meting van ${Math.round(elapsed)} s` : 'nog geen meting'}</Label>
            <div className="flex items-center gap-2">
              <Seg value={dur} options={DURS} onChange={(d) => !running && setDur(d)} labels={{ 60: '1 min', 120: '2 min', 300: '5 min' }} />
              {running ? (
                <button className="btn" onClick={() => setRunning(false)}>stop</button>
              ) : (
                <button className="btn accent" onClick={start}>{samples.length ? 'opnieuw' : 'start meting'}</button>
              )}
            </div>
          </div>
          <Chart samples={samples} dur={running ? dur : Math.max(dur, elapsed)} />
        </div>
      </div>

      <div className="space-y-4">
        {(an?.sameSource || sameDevice) && (
          <div className="card p-4 text-[13px] leading-snug" style={{ outline: '2px solid var(--sk-hart)' }}>
            <b>Meten deze twee wel iets anders?</b> {sameDevice ? 'Beide meters hebben dezelfde apparaatnaam.' : 'De lijnen zijn vrijwel gelijk, alleen een beetje verschoven.'} Waarschijnlijk zendt het horloge de waarde van de borstband door. Ontkoppel de band van het horloge en meet opnieuw.
          </div>
        )}
        <div className="card p-5 grid grid-cols-2 gap-4">
          <div>
            <Label>gemiddeld verschil</Label>
            <div className="serif text-[40px] leading-none tabular-nums mt-1">{an ? `${an.meanDiff >= 0.05 ? '+' : ''}${nl(an.meanDiff)}` : '—'}</div>
          </div>
          <div>
            <Label>per moment</Label>
            <div className="serif text-[40px] leading-none tabular-nums mt-1">{an ? nl(an.meanAbs) : '—'}</div>
          </div>
          <div>
            <Label>binnen 2 slagen</Label>
            <div className="serif text-[40px] leading-none tabular-nums mt-1">{an ? `${Math.round(an.within2 * 100)}%` : '—'}</div>
          </div>
          <div>
            <Label>vertraging</Label>
            <div className="serif text-[40px] leading-none tabular-nums mt-1">{an ? (an.lag ? `${Math.abs(an.lag)} s` : '0 s') : '—'}</div>
          </div>
          <Uitleg title="Maten">
            <p><b>Gemiddeld verschil</b>: meter 1 min meter 2, gemiddeld over de meting. Positief = meter 1 meet hoger.</p>
            <p><b>Per moment</b>: hoeveel ze op een willekeurig moment uit elkaar liggen (gemiddelde absolute afwijking). Ook als het gemiddelde klopt, kan dit groot zijn.</p>
            <p><b>Binnen 2 slagen</b>: deel van de seconden dat de meters het (bijna) eens waren.</p>
            <p><b>Vertraging</b>: hoeveel seconden de ene lijn achter de andere aan loopt. Horloges middelen vaak over een paar seconden.</p>
            <p>De 95%-grenzen in de analyse heten in de medische wereld Bland-Altman-grenzen: zo vergelijken onderzoekers ook meters met elkaar.</p>
          </Uitleg>
        </div>

        {shown && !running ? (
          <div className="card p-5 space-y-2 text-[14px] leading-snug">
            <Label>na {shown.dur} s meten</Label>
            {shown.an.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </div>
        ) : (
          <div className="card p-5 text-[13px] text-ink-3 leading-snug">{running ? 'De analyse volgt na de meting.' : 'Start een meting: na een minuut volgt hier de analyse.'}</div>
        )}

        {runs.length > 1 && (
          <div className="space-y-1">
            <Label>eerdere metingen</Label>
            {runs.map((r, i) => (
              <div key={runs.length - i} className="flex justify-between mono text-[12px] border-b border-ink/5 py-1">
                <span className="text-ink-3">{r.dur}s</span>
                <span>gem {r.an.meanDiff >= 0 ? '+' : ''}{nl(r.an.meanDiff)}</span>
                <span>moment {nl(r.an.meanAbs)}</span>
                <span>{Math.round(r.an.within2 * 100)}%</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Twee lijnen over de meting, met daaronder het verschil per seconde. */
function Chart({ samples, dur }: { samples: Sample[]; dur: number }) {
  const W = 720;
  const H = 200;
  const D = 70;
  const vals = samples.flatMap((s) => [s.a, s.b]).filter((v): v is number => v !== null);
  const lo = vals.length ? Math.floor(Math.min(...vals) - 3) : 50;
  const hi = vals.length ? Math.ceil(Math.max(...vals) + 3) : 90;
  const x = (s: number) => (s / Math.max(1, dur)) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * (H - 10) - 5;
  const path = (k: 'a' | 'b') => {
    let d = '';
    let pen = false;
    for (const s of samples) {
      const v = s[k];
      if (v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? 'L' : 'M'}${x(s.s).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };
  const diffs = samples.map((s) => (s.a !== null && s.b !== null ? s.a - s.b : null));
  const dMax = Math.max(4, ...diffs.map((d) => Math.abs(d ?? 0)));
  const bw = Math.max(1, W / Math.max(1, dur) - 1);
  const grid = [];
  for (let v = Math.ceil(lo / 5) * 5; v <= hi; v += 5) grid.push(v);
  return (
    <svg viewBox={`0 0 ${W} ${H + D + 16}`} className="w-full mt-3">
      {grid.map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="var(--sk-ink)" strokeOpacity={0.08} />
          <text x={2} y={y(v) - 3} fontSize={10} fill="var(--sk-ink)" fillOpacity={0.4} fontFamily="Geist Mono">{v}</text>
        </g>
      ))}
      <path d={path('b')} fill="none" stroke={C2} strokeWidth={2.2} strokeLinejoin="round" />
      <path d={path('a')} fill="none" stroke={C1} strokeWidth={2.2} strokeLinejoin="round" />
      <g transform={`translate(0 ${H + 8})`}>
        <line x1={0} x2={W} y1={D / 2} y2={D / 2} stroke="var(--sk-ink)" strokeOpacity={0.25} />
        {samples.map((s, i) => {
          const d = diffs[i];
          if (d === null) return null;
          const h = (Math.abs(d) / dMax) * (D / 2 - 2);
          return <rect key={i} x={x(s.s) - bw / 2} width={bw} y={d > 0 ? D / 2 - h : D / 2} height={Math.max(0.5, h)} fill={d > 0 ? C1 : C2} opacity={0.8} />;
        })}
        <text x={2} y={10} fontSize={10} fill="var(--sk-ink)" fillOpacity={0.5} fontFamily="Geist Mono">meter 1 hoger</text>
        <text x={2} y={D - 2} fontSize={10} fill="var(--sk-ink)" fillOpacity={0.5} fontFamily="Geist Mono">meter 2 hoger</text>
        <text x={W - 2} y={10} textAnchor="end" fontSize={10} fill="var(--sk-ink)" fillOpacity={0.5} fontFamily="Geist Mono">±{Math.round(dMax)}</text>
      </g>
    </svg>
  );
}
