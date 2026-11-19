import { useEffect, useRef, useState } from 'react';
import { meanPhase, phaseSync, type Body, type BodyHub } from './bodies';
import { jitter } from './motion';
import Leiden from './Leiden';
import Sensor from './Sensor';
import { AirSound, creak } from './sound';
import { BodyDot, Label, Seg, Spark, sourceMark, useFrame, Uitleg } from './ui';

type Mode = 'live' | 'sensor' | 'stil' | 'adem' | 'leider';

export default function Beweging({ hub }: { hub: BodyHub }) {
  useFrame(24);
  const [mode, setMode] = useState<Mode>('live');
  return (
    <div className="max-w-[1250px]">
      <div className="flex items-center gap-3 flex-wrap">
        <Seg value={mode} options={['live', 'sensor', 'stil', 'adem', 'leider'] as const} onChange={setMode} labels={{ live: 'iedereen', sensor: 'sensor & kalibratie', stil: 'stil-wedstrijd', adem: 'ademzwerm', leider: 'wie leidt?' }} />
        <Uitleg title="Bron">
          <p>Accelerometer van een Polar H10 op de borst, een M5Stick, een telefoon (via de zender), of de loopsensor van een Garmin HRM-Pro.</p>
        </Uitleg>
      </div>
      <div className="mt-5">
        {mode === 'live' && <Live hub={hub} />}
        {mode === 'sensor' && <Sensor hub={hub} />}
        {mode === 'stil' && <Stil hub={hub} />}
        {mode === 'adem' && <Ademzwerm hub={hub} />}
        {mode === 'leider' && <Leiden hub={hub} />}
      </div>
    </div>
  );
}

function Bar({ v, color = 'var(--sk-acc)' }: { v: number; color?: string }) {
  return (
    <div className="h-[6px] rounded-full bg-ink/[0.06] w-full">
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, v * 100))}%`, background: color }} />
    </div>
  );
}

/** Wat een apparaat nog meer meldt: M5Stick (draaien, batterij, tikken), Garmin (snelheid, paslengte), RR. */
function Extra({ b }: { b: Body }) {
  const e = b.extra!;
  const parts: string[] = [];
  if (e.rr) parts.push('RR ✓');
  if (e.gyro !== undefined) parts.push(`draai ${Math.round(e.gyro)}°/s`);
  if (e.bat !== undefined) parts.push(`bat ${e.bat}%`);
  if (e.btn) parts.push(`tik ${e.btn}`);
  if (e.device === 'rsc') parts.push(e.speed ? `${(e.speed * 3.6).toFixed(1)} km/u` : 'loopsensor');
  if (e.stride) parts.push(`pas ${e.stride.toFixed(2)} m`);
  if (!parts.length) return null;
  return <div className="mono text-[9.5px] text-ink-3 mt-0.5 pl-4">{parts.join(' · ')}</div>;
}

function Live({ hub }: { hub: BodyHub }) {
  useEffect(() => {
    hub.bodies.forEach((b) => b.sim && (b.sim.activity = Math.random() < 0.5 ? 0 : 0.2 + Math.random() * 0.5));
    return () => hub.bodies.forEach((b) => b.sim && (b.sim.activity = 0));
  }, [hub]);
  return (
    <div>
      <div className="card p-4 overflow-auto">
        <table className="w-full text-[12.5px]">
          <thead className="mono text-[10px] uppercase tracking-wider text-ink-3">
            <tr>
              <td className="pb-2">lichaam</td><td>beweging</td><td>pas</td><td>onrust</td><td>houding</td><td>adem</td><td>schrik</td><td>hart</td>
            </tr>
          </thead>
          <tbody>
            {hub.bodies.map((b) => (
              <tr key={b.id} className="border-t border-ink/5">
                <td className="py-2 pr-2 whitespace-nowrap"><BodyDot b={b} size={8} /> {sourceMark(b)} {b.name}{!b.hasAcc && <span className="mono text-[9px] text-ink-4 ml-1">geen acc</span>}
                  {b.extra && <Extra b={b} />}</td>
                <td className="w-[120px] pr-3"><Bar v={b.acc.activity} /></td>
                <td className="mono">{b.acc.cadence ? Math.round(b.acc.cadence) : '—'}</td>
                <td className="w-[100px] pr-3"><Bar v={b.acc.sway / 80} color="var(--sk-adem)" /></td>
                <td>
                  <svg width={30} height={30} viewBox="-15 -15 30 30">
                    <circle r={13} fill="none" stroke="var(--sk-ink)" strokeOpacity={0.2} />
                    <line x1={0} y1={12} x2={Math.sin((b.acc.tilt * Math.PI) / 180) * 12} y2={12 - Math.cos((b.acc.tilt * Math.PI) / 180) * 24} stroke="var(--sk-ink)" strokeWidth={2} />
                  </svg>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    <div className="rounded-full bg-adem/60" style={{ width: 8 + 14 * (0.5 - 0.5 * Math.cos(b.acc.breathPhase * Math.PI * 2)), height: 8 + 14 * (0.5 - 0.5 * Math.cos(b.acc.breathPhase * Math.PI * 2)) }} />
                    <span className="mono">{b.acc.breathQ > 0.35 ? `${b.acc.breathRate.toFixed(0)}/min` : '—'}</span>
                  </div>
                </td>
                <td><div className="w-3 h-3 rounded-full" style={{ background: 'var(--sk-hart)', opacity: b.acc.jolt }} /></td>
                <td className="mono">{Math.round(b.hr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Uitleg title="Wat de accelerometer toevoegt">
        <ul className="text-[12.5px] text-ink-2 space-y-1.5 list-disc pl-4">
          <li><b>Zichtbaar en direct:</b> pas, houding en schrik zie je meteen; het hart reageert pas na 10-40 s.</li>
          <li><b>Adem:</b> op de borst zie je de borstkas bewegen. Adem is half bewust en goed voelbaar: een brug tussen wil en lijf.</li>
          <li><b>De kloof:</b> stilstaan met een jagend hart, of bewegen met een rustig hart. Daar wordt belichaamde kennis zichtbaar.</li>
          <li><b>Wie volgt wie:</b> met tijdsverschuiving tussen bewegingen zie je wie leidt (tab 'wie leidt?').</li>
        </ul>
      </Uitleg>
    </div>
  );
}

// ---------------------------------------------------------------------------- stil-wedstrijd

/** Onrust in mg: echte sensor uit ruwe data (versnelling + een beetje gyro), sim uit de schatting. */
function onrust(hub: BodyHub, b: Body) {
  const p = hub.procs.get(b.id);
  if (!p) return b.acc.sway;
  const j = jitter(p, 1000);
  return j.dev + j.gyro * 0.6;
}

function Stil({ hub }: { hub: BodyHub }) {
  const [run, setRun] = useState<null | { start: number; sums: Record<string, number>; n: number; done: boolean }>(null);
  const [showData, setShowData] = useState(true);
  const trace = useRef<Record<string, number[]>>({});
  const DUR = 60;
  useEffect(() => {
    hub.bodies.forEach((b) => b.sim && ((b.sim.activity = 0), (b.sim.tension = Math.random() * 0.6)));
  }, [hub]);
  // spoor van de laatste 20 s, ook buiten een ronde (om te kalibreren en te oefenen)
  useEffect(() => {
    const id = window.setInterval(() => {
      for (const b of hub.bodies) {
        const v = onrust(hub, b);
        const tr = (trace.current[b.id] ??= []);
        tr.push(v);
        if (tr.length > 200) tr.shift();
        if (run && !run.done) {
          const p = Math.max(0, (v - 9) / 500);
          if (Math.random() < p) creak(Math.min(0.8, 0.15 + v / 120));
        }
      }
      setRun((r) => {
        if (!r || r.done) return r;
        const sums = { ...r.sums };
        hub.bodies.forEach((b) => (sums[b.id] = (sums[b.id] ?? 0) + onrust(hub, b)));
        return { ...r, sums, n: r.n + 1, done: (performance.now() - r.start) / 1000 >= DUR };
      });
    }, 100);
    return () => clearInterval(id);
  }, [run?.start, run?.done, hub, run]);
  const rank = run ? [...hub.bodies].sort((a, b) => (run.sums[a.id] ?? 0) - (run.sums[b.id] ?? 0)) : [];
  const el = run ? Math.min(DUR, (performance.now() - run.start) / 1000) : 0;
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn accent" onClick={() => setRun({ start: performance.now(), sums: {}, n: 0, done: false })}>{run ? 'opnieuw' : 'start 60 s'}</button>
          {run && <span className="mono text-[12px] text-ink-3">{el.toFixed(0)} / {DUR} s</span>}
          <button className={`chip ${showData ? 'on' : ''}`} onClick={() => setShowData(!showData)}>bewegingsdata</button>
        </div>
        <Uitleg title="Spel"><p>Sta zo stil mogelijk. De vloer versterkt elke beweging tot gekraak. Je lichaam is nooit stil.</p></Uitleg>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          {hub.bodies.map((b) => {
            const v = onrust(hub, b);
            const w = Math.min(1, v / 60);
            return (
              <div key={b.id} className="card p-3 flex flex-col items-center">
                <svg viewBox="-60 -50 120 100" className="w-full h-[96px]">
                  <ellipse rx={30 + w * 28} ry={9 + w * 8} cy={36} fill="var(--sk-ink)" opacity={0.08 + w * 0.3} />
                  <g transform={`translate(${(Math.random() - 0.5) * w * 6} 0)`}>
                    <circle r={13} cy={-22} fill={`hsl(${b.hue} 70% 58%)`} />
                    <rect x={-11} y={-6} width={22} height={40} rx={9} fill={`hsl(${b.hue} 70% 58%)`} />
                  </g>
                </svg>
                <div className="text-[13px] flex items-center gap-1.5">{sourceMark(b)} {b.name}</div>
                {showData && (
                  <div className="w-full mt-1">
                    <div className="flex justify-between mono text-[10.5px]"><span className="text-ink-3">onrust</span><span>{v.toFixed(1)} mg</span></div>
                    <Spark values={trace.current[b.id] ?? []} h={30} min={0} max={Math.max(20, ...(trace.current[b.id] ?? [0]))} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="card p-4 self-start">
        <Label>stilst eerst</Label>
        <div className="mt-2 space-y-1">
          {rank.map((b, i) => (
            <div key={b.id} className="flex items-center gap-2 text-[13px]">
              <span className="mono w-5 text-ink-3">{i + 1}</span>
              <span className="w-[70px] truncate">{b.name}</span>
              <Bar v={(run!.sums[b.id] ?? 0) / Math.max(1, run!.n) / 60} color="var(--sk-adem)" />
            </div>
          ))}
          {!run && <div className="text-[13px] text-ink-3">start een ronde</div>}
          <Uitleg title="Nabespreken"><p>Waarom wiebelde jij meer dan je dacht? Wat deed je adem, je kaak, je knieën?</p></Uitleg>
          <Uitleg title="Onrust"><p>Bij een echte sensor: de gemiddelde trilling van de versnelling over de laatste seconde (mg), plus een deel van de draaisnelheid. Ademen alleen geeft ongeveer 2 tot 5 mg; wiebelen al snel 10 tot 30.</p></Uitleg>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- ademzwerm

type AdemMode = 'samen' | 'machine' | 'mens';
const realBreath = (hub: BodyHub, b: Body) => !b.sim && (hub.procs.has(b.id) || b.acc.breathQ > 0);

/** Ademcurve 0..1 uit een fase, met aparte in- en uitademduur (inFrac = deel van de cyclus dat je inademt). */
const breathLevel = (phase: number, inFrac: number) => (phase < inFrac ? 0.5 - 0.5 * Math.cos((phase / inFrac) * Math.PI) : 0.5 + 0.5 * Math.cos(((phase - inFrac) / (1 - inFrac)) * Math.PI));

function Ademzwerm({ hub }: { hub: BodyHub }) {
  const [mode, setMode] = useState<AdemMode>('samen');
  const [who, setWho] = useState<'echt' | 'iedereen'>(() => (hub.bodies.some((b) => realBreath(hub, b)) ? 'echt' : 'iedereen'));
  const [simHelp, setSimHelp] = useState(true);
  const [rate, setRate] = useState(6);
  const [inFrac, setInFrac] = useState(0.4);
  const [leader, setLeader] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const [hist, setHist] = useState<number[]>([]);
  const t0 = useRef(performance.now());
  const air = useRef<AirSound | null>(null);

  const real = hub.bodies.filter((b) => realBreath(hub, b));
  const group = who === 'echt' && real.length ? real : hub.bodies;
  const breathing = group.filter((b) => b.sim || b.acc.breathQ > 0.35);
  const lead = mode === 'mens' ? hub.get(leader) ?? group[0] : null;
  const guidePhase = mode === 'machine' ? ((((performance.now() - t0.current) / 1000) * rate) / 60) % 1 : lead ? lead.acc.breathPhase : null;
  const others = breathing.filter((b) => b !== lead);
  // score: samen = Kuramoto-orde; volgen = hoe dicht ieders fase bij de gids ligt
  const align = (b: Body) => (guidePhase === null ? 0 : 0.5 + 0.5 * Math.cos((b.acc.breathPhase - guidePhase) * Math.PI * 2));
  const score = guidePhase === null ? phaseSync(breathing.map((b) => b.acc.breathPhase)) : others.length ? others.reduce((s, b) => s + align(b), 0) / others.length : 0;
  const mean = meanPhase(breathing.map((b) => b.acc.breathPhase));
  const lampPhase = guidePhase ?? mean;
  const lamp = mode === 'machine' ? breathLevel(lampPhase, inFrac) : 0.5 - 0.5 * Math.cos(lampPhase * Math.PI * 2);

  // sims laten meedoen, geschiedenis bijhouden
  useEffect(() => {
    hub.bodies.forEach((b) => b.sim && (b.sim.activity = 0));
    const id = window.setInterval(() => {
      const gp = mode === 'machine' ? ((((performance.now() - t0.current) / 1000) * rate) / 60) % 1 : mode === 'mens' ? (hub.get(leader) ?? group[0])?.acc.breathPhase ?? null : null;
      const m = meanPhase(group.map((b) => b.acc.breathPhase));
      for (const b of hub.bodies) {
        if (!b.sim) continue;
        const isLead = mode === 'mens' && b.id === (leader ?? group[0]?.id);
        b.sim.breathPull = !simHelp || isLead ? null : gp ?? m;
        if (simHelp && mode === 'machine') b.sim.breathRate = rate;
      }
      setHist((h) => [...h.slice(-300), scoreRef.current]);
    }, 200);
    return () => {
      clearInterval(id);
      hub.bodies.forEach((b) => b.sim && (b.sim.breathPull = null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hub, mode, simHelp, rate, leader, who]);
  const scoreRef = useRef(score);
  scoreRef.current = score;

  // geluid: doorlopende lucht die met de lamp mee ademt
  useEffect(() => {
    if (!soundOn) return;
    air.current = new AirSound(0.2);
    return () => {
      air.current?.stop();
      air.current = null;
    };
  }, [soundOn]);
  air.current?.set(lamp, mode === 'machine' ? lampPhase < inFrac : lampPhase < 0.5);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <Seg value={mode} options={['samen', 'machine', 'mens'] as const} onChange={setMode} labels={{ samen: 'samen', machine: 'volg de machine', mens: 'volg een mens' }} />
          <span className="mx-1 text-ink-4">·</span>
          <button className={`chip ${who === 'echt' ? 'on' : ''}`} onClick={() => setWho(who === 'echt' ? 'iedereen' : 'echt')} disabled={!real.length}>{real.length ? (who === 'echt' ? `alleen echte sensoren (${real.length})` : 'iedereen, ook sim') : 'geen echte sensor: sim'}</button>
          {hub.bodies.some((b) => b.sim) && (
            <button className={`chip ${simHelp ? 'on' : ''}`} onClick={() => setSimHelp(!simHelp)}>sim volgt</button>
          )}
          <button className={`chip ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn(!soundOn)}>geluid</button>
        </div>
        {mode === 'machine' && (
          <div className="flex flex-wrap gap-6 mt-3 text-[12.5px] text-ink-3">
            <label className="w-[220px]">tempo {rate.toFixed(1)} per minuut<input type="range" min={3} max={20} step={0.5} value={rate} onChange={(e) => setRate(+e.target.value)} className="w-full" /></label>
            <label className="w-[220px]">inademen {Math.round(inFrac * 100)}% · uitademen {Math.round((1 - inFrac) * 100)}%<input type="range" min={0.25} max={0.6} step={0.05} value={inFrac} onChange={(e) => setInFrac(+e.target.value)} className="w-full" /></label>
          </div>
        )}
        {mode === 'mens' && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {group.map((b) => (
              <button key={b.id} className={`chip ${lead?.id === b.id ? 'on' : ''}`} onClick={() => setLeader(b.id)}><BodyDot b={b} size={8} /> {sourceMark(b)} {b.name}</button>
            ))}
          </div>
        )}
        <svg viewBox="-300 -200 600 400" className="w-full card mt-3">
          <defs>
            <radialGradient id="lampg">
              <stop offset="0%" stopColor="var(--sk-acc)" stopOpacity={0.25 + score * 0.75} />
              <stop offset="100%" stopColor="var(--sk-acc)" stopOpacity={0} />
            </radialGradient>
          </defs>
          <circle r={60 + lamp * 100} fill="url(#lampg)" />
          <circle r={16 + lamp * 14} fill="var(--sk-acc)" opacity={0.5 + score * 0.5} />
          {mode !== 'samen' && <text y={5} textAnchor="middle" fontSize={11} fill="var(--sk-acc-ink)" fontFamily="Geist Mono">{mode === 'machine' ? (lampPhase < inFrac ? 'in' : 'uit') : lead?.name}</text>}
          {group.map((b, i) => {
            const a = (i / group.length) * Math.PI * 2 - Math.PI / 2;
            const has = b.sim || b.acc.breathQ > 0.35;
            const s = has ? 0.5 - 0.5 * Math.cos(b.acc.breathPhase * Math.PI * 2) : 0;
            const isLead = lead?.id === b.id;
            return (
              <g key={b.id} transform={`translate(${Math.cos(a) * 170} ${Math.sin(a) * 140})`} opacity={has ? 1 : 0.35}>
                {isLead && <circle r={36} fill="none" stroke="var(--sk-ink)" strokeWidth={2} />}
                <circle r={13 + s * 15} fill={`hsl(${b.hue} 70% 58%)`} />
                <text y={46} textAnchor="middle" fontSize={12} fill="var(--sk-ink)" fontFamily="Geist">{b.name}{has ? '' : ' · geen adem'}</text>
                {guidePhase !== null && has && !isLead && <text y={60} textAnchor="middle" fontSize={10} fill="var(--sk-ink-3)" fontFamily="Geist Mono">{Math.round(align(b) * 100)}%</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <Label>{mode === 'samen' ? 'samen-adem' : mode === 'machine' ? 'mee met de machine' : `mee met ${lead?.name ?? '…'}`}</Label>
          <div className="text-[64px] font-light tracking-[-0.04em] leading-none tabular-nums" style={{ color: score > 0.65 ? 'var(--sk-adem)' : 'var(--sk-ink)' }}>{Math.round(score * 100)}%</div>
          <Spark values={hist} min={0} max={1} h={60} color="var(--sk-adem)" />
          <div className="mono text-[10.5px] text-ink-3 mt-2">{breathing.length} van {group.length} met meetbare adem</div>
        </div>
        <Uitleg title="Varianten">
          <ul>
            <li><b>Samen.</b> Geen leider: de lamp ademt met het gemiddelde. Hoe gelijker jullie ademen, hoe feller hij wordt.</li>
            <li><b>Volg de machine.</b> De lamp (en het luchtgeluid) ademt voor, in een tempo en verhouding die jij kiest. Iedereen probeert mee te ademen; per persoon zie je hoe goed dat lukt.</li>
            <li><b>Volg een mens.</b> Eén persoon is de bron. De rest probeert zijn of haar adem na te doen, zonder te praten. Wie merkt het als de leider ineens versnelt?</li>
          </ul>
        </Uitleg>
        <Uitleg title="Samen-adem en meeademen">
          <p>Samen-adem is de Kuramoto-orde van de ademfases: 100% = iedereen ademt op hetzelfde moment in. Meeademen is per persoon hoe dicht de fase bij die van de gids ligt (100% = gelijk, 0% = precies tegengesteld).</p>
          <p>Alleen lichamen met meetbare adem tellen mee: bij echte sensoren pas als de ademkwaliteit boven 35% ligt (strak op borst of buik, stil zitten).</p>
        </Uitleg>
      </div>
    </div>
  );
}
