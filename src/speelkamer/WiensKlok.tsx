import { useEffect, useRef, useState } from 'react';
import { rateFrom, type Body, type BodyHub, type Signal } from './bodies';
import { breathSwell, chime, knock, tick } from './sound';
import { BodyDot, ClockFace, Label, Seg, sourceMark, useEvents, useFrame , Uitleg } from './ui';

type Round = { target: string; signal: Signal; start: number; feels: number; wrong: string[]; done: null | { secs: number } };

const SIGNAL_LABEL: Record<Signal, string> = { hart: 'hart', pas: 'pas', adem: 'adem' };
const SIGNAL_UITLEG: Record<Signal, string> = {
  hart: 'De klok tikt iemands hartslag. Onzichtbaar: je moet voelen, kijken naar adem en kleur, of polsen.',
  pas: 'De klok tikt iemands stappen. Zichtbaar: kijk wie op de tel loopt.',
  adem: 'De klok tikt iemands ademhaling. Half zichtbaar: schouders, buik, neusvleugels.',
};

/** Een getekend figuurtje: deint bij elke stap, borst zwelt met de adem. Het hart is niet te zien, tenzij je 'polst'. */
function Figure({ b, lastStep, feeling, lastBeat, state }: { b: Body; lastStep: number; feeling: boolean; lastBeat: number; state: 'idle' | 'wrong' | 'right' }) {
  const now = performance.now();
  const bob = Math.max(0, 1 - (now - lastStep) / 260);
  const breath = 0.5 - 0.5 * Math.cos(b.acc.breathPhase * Math.PI * 2);
  const beat = Math.max(0, 1 - (now - lastBeat) / 250);
  const col = `hsl(${b.hue} 45% 70%)`;
  return (
    <svg viewBox="-40 -70 80 120" className="w-full h-auto">
      <ellipse cx={0} cy={44} rx={22} ry={4} fill="#00000055" />
      <g transform={`translate(0 ${-bob * 5})`}>
        <circle cx={0} cy={-48} r={11} fill={col} />
        <path d={`M-14 ${-30} Q ${-16 - breath * 3} ${-6} -10 14 L 10 14 Q ${16 + breath * 3} ${-6} 14 ${-30} Z`} fill={col} opacity={0.92} />
        <line x1={-7} y1={14} x2={-8 + (b.acc.cadence ? Math.sin(now / 160) * 6 : 0)} y2={42} stroke={col} strokeWidth={6} strokeLinecap="round" />
        <line x1={7} y1={14} x2={8 - (b.acc.cadence ? Math.sin(now / 160) * 6 : 0)} y2={42} stroke={col} strokeWidth={6} strokeLinecap="round" />
        {feeling && (
          <g transform="translate(-3 -18)">
            <circle r={4 + beat * 4} fill="var(--sk-hart)" opacity={0.3 + beat * 0.7} />
            <circle r={3} fill="var(--sk-hart)" />
          </g>
        )}
      </g>
      {state !== 'idle' && <text y={64} textAnchor="middle" fontSize={22} fill={state === 'right' ? '#9be08a' : 'var(--sk-hart)'}>{state === 'right' ? '✓' : '✗'}</text>}
    </svg>
  );
}

export default function WiensKlok({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [signal, setSignal] = useState<Signal>('hart');
  const [round, setRound] = useState<Round | null>(null);
  const [ticks, setTicks] = useState(0);
  const [hint, setHint] = useState(false);
  const [feeling, setFeeling] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<{ signal: Signal; secs: number; feels: number; wrong: number }[]>([]);
  const lastEv = useRef<Record<string, { hart: number; pas: number; adem: number }>>({});
  const roundRef = useRef(round);
  roundRef.current = round;

  // gesimuleerde mensen lopen in verschillende tempo's rond
  useEffect(() => {
    const shuffleWalk = () =>
      hub.bodies.forEach((b) => {
        if (!b.sim) return;
        b.sim.activity = 0.2 + Math.random() * 0.5;
        b.sim.tension = Math.random() * 0.35;
      });
    shuffleWalk();
    const id = window.setInterval(shuffleWalk, 25000);
    return () => {
      clearInterval(id);
      hub.bodies.forEach((b) => b.sim && (b.sim.activity = 0));
    };
  }, [hub]);

  useEvents(hub, (id, s, t) => {
    (lastEv.current[id] ??= { hart: 0, pas: 0, adem: 0 })[s] = t;
    const r = roundRef.current;
    if (r && !r.done && id === r.target && s === r.signal) {
      setTicks((n) => n + 1);
      if (s === 'hart') tick(1, false);
      else if (s === 'pas') knock(0.9);
      else {
        tick(0.8, true);
        breathSwell(2.5, 0.25);
      }
    }
  });

  const start = () => {
    const pool = hub.bodies.filter((b) => (signal === 'hart' ? b.hr > 0 : b.hasAcc));
    if (!pool.length) return;
    const target = pool[Math.floor(Math.random() * pool.length)].id;
    setRound({ target, signal, start: performance.now(), feels: 0, wrong: [], done: null });
    setTicks(0);
    setFeeling({});
    hub.publish('klok', { target: target.replace(/^kanaal-/, ''), signal });
  };

  const feel = (id: string) => {
    if (!round || round.done) return;
    setFeeling((f) => ({ ...f, [id]: performance.now() + 4000 }));
    setRound({ ...round, feels: round.feels + 1 });
  };

  const guess = (id: string) => {
    if (!round || round.done) return;
    if (id === round.target) {
      const secs = (performance.now() - round.start) / 1000;
      setRound({ ...round, done: { secs } });
      setHistory((h) => [...h, { signal: round.signal, secs, feels: round.feels, wrong: round.wrong.length }]);
      chime(true);
    } else if (!round.wrong.includes(id)) {
      setRound({ ...round, wrong: [...round.wrong, id] });
      chime(false);
    }
  };

  const target = hub.get(round?.target);
  const now = performance.now();
  const avg = (s: Signal) => {
    const h = history.filter((x) => x.signal === s);
    return h.length ? h.reduce((a, x) => a + x.secs, 0) / h.length : null;
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6 h-full">
      <div className="flex flex-col min-h-0">
        <div className="flex items-center gap-3 flex-wrap">
          <Seg value={signal} options={['hart', 'pas', 'adem'] as const} onChange={(s) => setSignal(s)} labels={SIGNAL_LABEL} />
          <button className="btn accent" onClick={start}>{round && !round.done ? 'nieuwe ronde' : 'start ronde'}</button>
          <label className="text-[12px] text-ink-3 flex items-center gap-1.5">
            <input type="checkbox" checked={hint} onChange={(e) => setHint(e.target.checked)} /> toon tempo's (begeleider)
          </label>
        </div>
        <Uitleg title="Hoe het werkt">
          <p>{SIGNAL_UITLEG.hart}</p>
          <p>{SIGNAL_UITLEG.pas}</p>
          <p>{SIGNAL_UITLEG.adem}</p>
          <p>Start een ronde: de klok gaat tikken op één van de lichamen. Zoek wie het is. Polsen mag, maar kost tijd. Raad met ‘deze!’.</p>
        </Uitleg>

        <div className="grid grid-cols-4 xl:grid-cols-6 gap-3 mt-4 overflow-auto scroll pb-4">
          {hub.bodies.map((b) => {
            const ev = lastEv.current[b.id] ?? { hart: 0, pas: 0, adem: 0 };
            const isFeeling = (feeling[b.id] ?? 0) > now;
            const state = round?.done && b.id === round.target ? 'right' : round?.wrong.includes(b.id) ? 'wrong' : 'idle';
            return (
              <div key={b.id} className="card p-2 flex flex-col items-center">
                <Figure b={b} lastStep={ev.pas} lastBeat={ev.hart} feeling={isFeeling || !!round?.done} state={state} />
                <div className="text-[13px] mt-1 flex items-center gap-1">
                  <BodyDot b={b} size={7} /> {sourceMark(b)} {b.name}
                </div>
                {hint && (
                  <div className="mono text-[10px] text-ink-3">
                    ♥{Math.round(b.hr)} · {Math.round(b.acc.cadence)} st · {b.acc.breathRate.toFixed(0)} adem
                  </div>
                )}
                <div className="flex gap-1 mt-1.5">
                  <button className="btn !px-2 !py-1 !text-[11px]" disabled={!round || !!round.done} onClick={() => feel(b.id)} title="voel de pols (kost tijd en moeite)">polsen</button>
                  <button className="btn !px-2 !py-1 !text-[11px]" disabled={!round || !!round.done} onClick={() => guess(b.id)}>deze!</button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 min-h-0 overflow-auto scroll">
        <ClockFace ticks={ticks} size={300} label={round ? `${SIGNAL_LABEL[round.signal]}tijd` : 'wacht op ronde'} />
        {round?.done && target ? (
          <div className="text-center">
            <div className="serif text-[30px]">Het was {target.name}</div>
            <div className="mono text-[12px] text-ink-3">
              gevonden in {round.done.secs.toFixed(0)} s · {round.feels}× gepolst · {round.wrong.length} mis
            </div>
          </div>
        ) : round ? (
          <div className="mono text-[12px] text-ink-3">
            {((now - round.start) / 1000).toFixed(0)} s · {round.feels}× gepolst
            {hint && target && <> · doel {target.name} ({Math.round(round.signal === 'hart' ? rateFrom(target.beats) : round.signal === 'pas' ? target.acc.cadence : target.acc.breathRate)}/min)</>}
          </div>
        ) : null}

        <div className="card p-4 w-full">
          <Label>zichtbaar ↔ onzichtbaar</Label>
          <div className="grid grid-cols-3 gap-2 mt-2 text-center">
            {(['pas', 'adem', 'hart'] as Signal[]).map((s) => (
              <div key={s}>
                <div className="mono text-[10px] text-ink-3">{s}</div>
                <div className="serif text-[30px] leading-none">{avg(s) === null ? '—' : `${avg(s)!.toFixed(0)}s`}</div>
                <div className="mono text-[10px] text-ink-4">{history.filter((x) => x.signal === s).length} rondes</div>
              </div>
            ))}
          </div>
          <Uitleg title="Zichtbaar ↔ onzichtbaar">
            <p>Gemiddelde zoektijd per signaal. De verwachting: de pas vind je in seconden, het hart nauwelijks. Dat verschil is het gesprek.</p>
          </Uitleg>
        </div>

        <Uitleg title="Varianten">
          <ul>
            <li><b>Aanraken mag / mag niet.</b> Polsen maakt het intiem. Zonder polsen kijk je naar adem en kleur.</li>
            <li><b>Verstoppen.</b> Fluister de gekozen persoon in dat hij of zij het is. Die probeert de klok te laten vertragen.</li>
            <li><b>Twee klokken.</b> Start twee rondes op twee schermen. De twee gekozenen moeten elkaar vinden en hun klokken gelijk laten lopen.</li>
            <li><b>Klokscherm in de ruimte.</b> Met een kanaal open tikt het klokscherm (via ⚙) op een tweede scherm mee.</li>
          </ul>
        </Uitleg>
      </div>
    </div>
  );
}
