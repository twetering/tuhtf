import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { heartbeat } from './sound';
import { Label, Seg, Spark, sourceMark, useEvents, useFrame, Uitleg } from './ui';

type Phase = 'eigen' | 'elkaar' | 'stilte';
const PHASE_TXT: Record<Phase, string> = {
  eigen: 'Ieder hoort het eigen hart.',
  elkaar: 'Ieder hoort het hart van de ander.',
  stilte: 'Geen geluid. Alleen kijken.',
};

type Sample = { t: number; a: number; b: number; breath: number; phase: Phase };

function corr(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  if (n < 8) return 0;
  const dx = x.slice(1, n).map((v, i) => v - x[i]);
  const dy = y.slice(1, n).map((v, i) => v - y[i]);
  const mx = dx.reduce((a, b) => a + b, 0) / dx.length;
  const my = dy.reduce((a, b) => a + b, 0) / dy.length;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < dx.length; i++) {
    sxy += (dx[i] - mx) * (dy[i] - my);
    sxx += (dx[i] - mx) ** 2;
    syy += (dy[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

export default function Gesprek({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [aId, setA] = useState<string | null>(null);
  const [bId, setB] = useState<string | null>(null);
  const A = hub.get(aId) ?? hub.bodies[0];
  const B = hub.get(bId) ?? hub.bodies.find((x) => x.id !== A?.id);
  const [phase, setPhase] = useState<Phase>('eigen');
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const ripples = useRef<{ who: 'a' | 'b'; t: number }[]>([]);
  const beatsA = useRef<number[]>([]);
  const beatsB = useRef<number[]>([]);
  const hits = useRef<Record<Phase, { n: number; hit: number }>>({ eigen: { n: 0, hit: 0 }, elkaar: { n: 0, hit: 0 }, stilte: { n: 0, hit: 0 } });

  useEvents(hub, (id, s, t) => {
    if (s !== 'hart' || !A || !B) return;
    const who = id === A.id ? 'a' : id === B.id ? 'b' : null;
    if (!who) return;
    ripples.current.push({ who, t });
    ripples.current = ripples.current.filter((r) => t - r.t < 1200);
    (who === 'a' ? beatsA : beatsB).current.push(t);
    if (who === 'a' && running) {
      const near = beatsB.current.some((x) => Math.abs(x - t) < 120);
      hits.current[phase].n++;
      if (near) hits.current[phase].hit++;
    }
    if (!running) return;
    // links = wat A hoort, rechts = wat B hoort (één oortje per persoon)
    if (phase === 'eigen') heartbeat(0.9, who === 'a' ? -1 : 1);
    if (phase === 'elkaar') heartbeat(0.9, who === 'a' ? 1 : -1);
  });

  // koppeling in de simulatie: wie elkaar hoort, gaat (een beetje) op elkaar lijken
  useEffect(() => {
    if (!A || !B) return;
    const id = window.setInterval(() => {
      const couple = running && phase === 'elkaar';
      for (const [me, other] of [
        [A, B],
        [B, A],
      ] as [Body, Body][]) {
        if (!me.sim) continue;
        me.sim.pull = couple ? other.hr : null;
        me.sim.pullStrength = couple ? 0.3 : 0;
        me.sim.breathPull = couple ? other.acc.breathPhase : null;
      }
    }, 200);
    return () => {
      clearInterval(id);
      [A, B].forEach((x) => x?.sim && Object.assign(x.sim, { pull: null, pullStrength: 0, breathPull: null }));
    };
  }, [A, B, running, phase]);

  useEffect(() => {
    if (!running || !A || !B) return;
    const id = window.setInterval(() => {
      const d = Math.abs(((A.acc.breathPhase - B.acc.breathPhase + 1.5) % 1) - 0.5);
      setSamples((s) => [...s.slice(-1200), { t: performance.now(), a: A.hr, b: B.hr, breath: 1 - d * 2, phase }]);
    }, 500);
    return () => clearInterval(id);
  }, [running, A, B, phase]);

  if (!A || !B) return <div>Er zijn minstens twee lichamen nodig.</div>;

  const last = samples.slice(-120);
  const sync = corr(last.map((s) => s.a), last.map((s) => s.b));
  const gap = last.length ? last.reduce((s, x) => s + Math.abs(x.a - x.b), 0) / last.length : Math.abs(A.hr - B.hr);
  const breath = last.length ? last.reduce((s, x) => s + x.breath, 0) / last.length : 0;
  const per = (p: Phase) => {
    const ss = samples.filter((s) => s.phase === p);
    if (ss.length < 10) return null;
    return {
      sync: corr(ss.map((s) => s.a), ss.map((s) => s.b)),
      gap: ss.reduce((s, x) => s + Math.abs(x.a - x.b), 0) / ss.length,
      breath: ss.reduce((s, x) => s + x.breath, 0) / ss.length,
      hit: hits.current[p].n ? hits.current[p].hit / hits.current[p].n : 0,
      mins: (ss.length * 0.5) / 60,
    };
  };
  const now = performance.now();
  const select = (val: string | undefined, set: (v: string) => void, other: string | undefined) => (
    <select value={val} onChange={(e) => set(e.target.value)} className="bg-ink/[0.06] border border-ink/10 rounded-md px-2 py-1">
      {hub.bodies.filter((x) => x.id !== other).map((x) => (
        <option key={x.id} value={x.id}>{sourceMark(x)} {x.name}</option>
      ))}
    </select>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8 max-w-[1250px]">
      <div>
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          {select(A.id, setA, B.id)} <span className="serif italic text-[18px] text-ink-3">tegenover</span> {select(B.id, setB, A.id)}
          <Seg value={phase} options={['eigen', 'elkaar', 'stilte'] as const} onChange={setPhase} labels={{ eigen: '1 · eigen hart', elkaar: '2 · elkaars hart', stilte: '3 · stilte' }} />
          <button className={`btn ${running ? '' : 'accent'}`} onClick={() => setRunning(!running)}>{running ? 'pauze' : 'start'}</button>
          <button className="btn" onClick={() => { setSamples([]); hits.current = { eigen: { n: 0, hit: 0 }, elkaar: { n: 0, hit: 0 }, stilte: { n: 0, hit: 0 } }; }}>wis</button>
        </div>
        <Uitleg title="Fases">
          <ul>
            <li><b>1 · eigen hart.</b> {PHASE_TXT.eigen}</li>
            <li><b>2 · elkaars hart.</b> {PHASE_TXT.elkaar}</li>
            <li><b>3 · stilte.</b> {PHASE_TXT.stilte}</li>
          </ul>
          <p>Niet praten, wel aankijken.</p>
        </Uitleg>

        {/* twee lichamen tegenover elkaar */}
        <svg viewBox="0 0 700 260" className="w-full mt-2">
          {(['a', 'b'] as const).map((who) => {
            const x = who === 'a' ? 190 : 510;
            const body = who === 'a' ? A : B;
            const col = `hsl(${body.hue} 55% 66%)`;
            const breathS = 0.5 - 0.5 * Math.cos(body.acc.breathPhase * Math.PI * 2);
            return (
              <g key={who}>
                {ripples.current.filter((r) => r.who === who).map((r, i) => {
                  const age = (now - r.t) / 1200;
                  return <circle key={i} cx={x} cy={150} r={40 + age * 150} fill="none" stroke={col} strokeOpacity={(1 - age) * 0.6} strokeWidth={2} />;
                })}
                <circle cx={x} cy={84} r={26} fill={col} />
                <path d={`M${x - 44} 250 Q ${x - 50 - breathS * 6} 140 ${x} 118 Q ${x + 50 + breathS * 6} 140 ${x + 44} 250 Z`} fill={col} />
                <text x={x} y={40} textAnchor="middle" fontSize={22} fill="var(--sk-ink)" fontFamily="Geist" fontWeight={300}>{body.name}</text>
                <text x={x} y={62} textAnchor="middle" fontSize={13} fill="var(--sk-ink-3)" fontFamily="Geist Mono">{Math.round(body.hr)} bpm</text>
              </g>
            );
          })}
          <text x={350} y={150} textAnchor="middle" fontSize={13} fill="var(--sk-ink-3)" fontFamily="Geist Mono">
            {phase === 'elkaar' ? '◀ hoort ▶' : phase === 'eigen' ? '↺   ↻' : '·'}
          </text>
        </svg>

        <div className="card p-4">
          <Label>twee harten</Label>
          <div className="relative h-[110px]">
            <div className="absolute inset-0"><Spark values={samples.slice(-240).map((s) => s.a)} h={110} min={Math.min(...samples.slice(-240).flatMap((s) => [s.a, s.b]), 200) - 3} max={Math.max(...samples.slice(-240).flatMap((s) => [s.a, s.b]), 0) + 3} color={`hsl(${A.hue} 55% 66%)`} /></div>
            <div className="absolute inset-0"><Spark values={samples.slice(-240).map((s) => s.b)} h={110} min={Math.min(...samples.slice(-240).flatMap((s) => [s.a, s.b]), 200) - 3} max={Math.max(...samples.slice(-240).flatMap((s) => [s.a, s.b]), 0) + 3} color={`hsl(${B.hue} 55% 66%)`} /></div>
          </div>
          <div className="mono text-[10px] text-ink-4">laatste 2 minuten</div>
        </div>
      </div>

      <div className="space-y-5">
        <div className="card p-5 grid grid-cols-3 gap-3 text-center">
          <div>
            <Label>meebewegen</Label>
            <div className="serif text-[38px] leading-none" style={{ color: sync > 0.3 ? 'var(--sk-adem)' : 'var(--sk-ink)' }}>{sync.toFixed(2)}</div>
          </div>
          <div>
            <Label>verschil</Label>
            <div className="serif text-[38px] leading-none">{gap.toFixed(0)}</div>
          </div>
          <div>
            <Label>adem</Label>
            <div className="serif text-[38px] leading-none">{Math.round(breath * 100)}%</div>
          </div>
          <Uitleg title="Maten"><p>Meebewegen = hoe gelijk de harten stijgen en dalen (−1..1, laatste minuut). Verschil = gemiddeld bpm uit elkaar. Adem = hoe gelijk jullie ademen.</p></Uitleg>
        </div>
        <div className="card p-4">
          <Label>per fase</Label>
          <table className="w-full mt-2 mono text-[11.5px]">
            <thead className="text-ink-3">
              <tr><td></td><td>mee</td><td>verschil</td><td>adem</td><td>samen-slag</td></tr>
            </thead>
            <tbody>
              {(['eigen', 'elkaar', 'stilte'] as Phase[]).map((p) => {
                const r = per(p);
                return (
                  <tr key={p} className="border-t border-ink/5">
                    <td className="py-1 text-ink-2">{p}</td>
                    <td>{r ? r.sync.toFixed(2) : '—'}</td>
                    <td>{r ? r.gap.toFixed(0) : '—'}</td>
                    <td>{r ? `${Math.round(r.breath * 100)}%` : '—'}</td>
                    <td>{r ? `${Math.round(r.hit * 100)}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Uitleg title="Opstelling">
          <ul className="text-[12.5px] text-ink-2 space-y-1.5 list-disc pl-4">
            <li>Eén laptop, twee banden. Gebruik een koptelefoonsplitter of geef ieder één oortje: <b>links</b> is wat de linker persoon hoort, <b>rechts</b> wat de rechter hoort.</li>
            <li>Elke fase 2 à 3 minuten. Vergelijk daarna samen de tabel: gingen jullie harten mee met elkaar toen je elkaar hoorde?</li>
            <li>Uit onderzoek naar koppels, koren en rituelen weten we dat zulke synchronie voorkomt. Of het hier lukt, is precies de vraag.</li>
          </ul>
        </Uitleg>
      </div>
    </div>
  );
}
