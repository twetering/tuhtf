import { useEffect, useRef, useState } from 'react';
import { rateFrom, type BodyHub } from './bodies';
import { MeSelect, pickMe } from './Me';
import WelkeMeter from './WelkeMeter';
import { heartbeat } from './sound';
import { Big, Label, Seg, useEvents, useFrame, Uitleg } from './ui';

type Task = 'tel' | 'herken' | 'raad' | 'meters';
type TrialKind = 'eigen' | 'sneller' | 'trager' | 'ander';
type Trial = { kind: TrialKind; other?: string; answer?: boolean; sure?: number };

const TRIAL_SECS = 12;

export default function IsDitMijnHart({ hub }: { hub: BodyHub }) {
  useFrame(20);
  const [meId, setMeId] = useState<string | null>(null);
  const me = pickMe(hub, meId);
  const [task, setTask] = useState<Task>('tel');
  const [showPulse, setShowPulse] = useState(false);
  const lastBeat = useRef(0);
  useEvents(hub, (id, s, t) => {
    if (id === me.id && s === 'hart') lastBeat.current = t;
  });
  const pulse = Math.max(0, 1 - (performance.now() - lastBeat.current) / 250);

  return (
    <div className={task === 'meters' ? 'max-w-[1250px]' : 'max-w-[980px]'}>
      <div className="flex flex-wrap items-center gap-4">
        <Seg value={task} options={['tel', 'herken', 'raad', 'meters'] as const} onChange={setTask} labels={{ tel: 'tel je hart', herken: 'is dit mijn hart?', raad: 'raad je hartslag', meters: 'welke meter?' }} />
        {task !== 'meters' && <MeSelect hub={hub} me={me} setMe={setMeId} />}
        {task !== 'meters' && me.source === 'sim' && (
          <label className="text-[12px] text-ink-3 flex items-center gap-1.5">
            <input type="checkbox" checked={showPulse} onChange={(e) => setShowPulse(e.target.checked)} /> toon mijn pols (testhulp)
            {showPulse && <span className="inline-block w-3 h-3 rounded-full bg-hart" style={{ opacity: 0.2 + pulse * 0.8 }} />}
          </label>
        )}
      </div>
      <div className="mt-6">
        {task === 'tel' && <Tel hub={hub} meId={me.id} />}
        {task === 'herken' && <Herken hub={hub} meId={me.id} />}
        {task === 'raad' && <Raad hub={hub} meId={me.id} />}
        {task === 'meters' && <WelkeMeter hub={hub} />}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- tellen (Schandry)

function Tel({ hub, meId }: { hub: BodyHub; meId: string }) {
  const [phase, setPhase] = useState<'klaar' | 'tel' | 'invoer'>('klaar');
  const [dur, setDur] = useState(25);
  const [win, setWin] = useState<[number, number]>([0, 0]);
  const [count, setCount] = useState('');
  const [results, setResults] = useState<{ dur: number; real: number; counted: number }[]>([]);
  const queue = useRef<number[]>([]);
  const t0 = win[0];
  const now = performance.now();

  useEffect(() => {
    if (phase !== 'tel') return;
    const id = window.setTimeout(() => {
      setWin([t0, performance.now()]);
      setPhase('invoer');
    }, dur * 1000);
    return () => clearTimeout(id);
  }, [phase, dur, t0]);

  const begin = () => {
    if (!queue.current.length) queue.current = [25, 35, 45].sort(() => Math.random() - 0.5);
    const d = queue.current.shift()!;
    setDur(d);
    setWin([performance.now(), 0]);
    setCount('');
    setPhase('tel');
  };
  const submit = () => {
    const b = hub.get(meId);
    const real = b ? b.beats.filter((t) => t >= win[0] && t <= win[1]).length : 0;
    setResults((r) => [...r, { dur, real, counted: Number(count) || 0 }]);
    setPhase('klaar');
  };
  const acc = (r: { real: number; counted: number }) => Math.max(0, 1 - Math.abs(r.real - r.counted) / Math.max(1, r.real));
  const score = results.length ? results.reduce((a, r) => a + acc(r), 0) / results.length : null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
      <div className="card p-8 min-h-[320px] flex flex-col items-center justify-center text-center">
        {phase === 'klaar' && (
          <>
            <div className="serif text-[30px] leading-tight max-w-[520px]">Tel je hartslagen in stilte. Niet aan je pols of hals voelen.</div>
            <Uitleg title="Tellen"><p>Ga zitten, sluit je ogen als je wilt. Tel alleen wat je echt voelt. Het venster duurt 25, 35 of 45 seconden; je weet niet welke.</p></Uitleg>
            <button className="btn accent big mt-6" onClick={begin}>start telvenster</button>
          </>
        )}
        {phase === 'tel' && (
          <>
            <div className="serif italic text-[40px]">tel…</div>
            <div className="mt-6 w-[260px] h-[3px] bg-ink/10 rounded overflow-hidden">
              <div className="h-full bg-acc/60" style={{ width: `${Math.min(100, ((now - t0) / 1000 / 45) * 100)}%` }} />
            </div>
            <div className="mono text-[11px] text-ink-3 mt-2">het venster stopt vanzelf</div>
          </>
        )}
        {phase === 'invoer' && (
          <>
            <div className="serif text-[30px]">Hoeveel slagen telde je?</div>
            <input autoFocus value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && submit()} className="mt-5 w-[140px] text-center serif text-[44px] bg-ink/[0.05] border border-ink/15 rounded-xl" />
            <button className="btn accent mt-4" onClick={submit} disabled={!count}>vergelijk</button>
          </>
        )}
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <Label>interoceptieve nauwkeurigheid</Label>
          <Big color="var(--sk-acc)">{score === null ? '—' : `${Math.round(score * 100)}%`}</Big>
          <Uitleg title="Nauwkeurigheid"><p>Gemiddelde over je telvensters (1 − |echt − geteld| / echt). Mensen verschillen hier enorm in, en de meesten tellen te weinig.</p></Uitleg>
        </div>
        <div className="space-y-1">
          {results.map((r, i) => (
            <div key={i} className="flex justify-between mono text-[12px] border-b border-ink/5 py-1">
              <span className="text-ink-3">{r.dur}s</span>
              <span>geteld {r.counted}</span>
              <span>echt {r.real}</span>
              <span className="text-acc">{Math.round(acc(r) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- herkennen

function Herken({ hub, meId }: { hub: BodyHub; meId: string }) {
  const [trials, setTrials] = useState<Trial[]>([]);
  const [current, setCurrent] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [heard, setHeard] = useState(false);
  const [startAt, setStartAt] = useState(0);
  const synth = useRef<{ next: number; interval: number } | null>(null);
  const lastPulse = useRef(0);

  const kindRef = useRef<Trial | null>(null);
  kindRef.current = current !== null ? trials[current] : null;
  const playingRef = useRef(playing);
  playingRef.current = playing;

  // eigen hart of ander hart: afspelen op echte slagen
  useEvents(hub, (id, s) => {
    const tr = kindRef.current;
    if (!playingRef.current || !tr || s !== 'hart') return;
    if ((tr.kind === 'eigen' && id === meId) || (tr.kind === 'ander' && id === tr.other)) {
      heartbeat(0.9);
      lastPulse.current = performance.now();
    }
  });
  // sneller/trager: eigen ritme geschaald, met behoud van wisselingen
  useEffect(() => {
    if (!playing) return;
    const tr = kindRef.current;
    if (!tr || (tr.kind !== 'sneller' && tr.kind !== 'trager')) return;
    const scale = tr.kind === 'sneller' ? 0.88 : 1.13;
    const id = window.setInterval(() => {
      const b = hub.get(meId);
      if (!b) return;
      const n = b.beats.length;
      const ibi = n > 1 ? b.beats[n - 1] - b.beats[n - 2] : 60000 / Math.max(50, b.hr);
      const now = performance.now();
      if (!synth.current) synth.current = { next: now, interval: ibi * scale };
      if (now >= synth.current.next) {
        heartbeat(0.9);
        lastPulse.current = now;
        synth.current.interval = ibi * scale;
        synth.current.next = now + synth.current.interval;
      }
    }, 10);
    return () => {
      clearInterval(id);
      synth.current = null;
    };
  }, [playing, hub, meId]);
  useEffect(() => {
    if (!playing) return;
    const id = window.setTimeout(() => {
      setPlaying(false);
      setHeard(true);
    }, TRIAL_SECS * 1000);
    return () => clearTimeout(id);
  }, [playing]);

  const newSeries = () => {
    const me = hub.get(meId);
    const kinds: TrialKind[] = ['eigen', 'eigen', 'eigen', 'eigen', 'sneller', 'trager', 'ander', 'ander'];
    kinds.sort(() => Math.random() - 0.5);
    const others = hub.bodies.filter((b) => b.id !== meId && b.hr > 0).sort((a, b) => Math.abs(a.hr - (me?.hr ?? 70)) - Math.abs(b.hr - (me?.hr ?? 70)));
    setTrials(kinds.map((k) => ({ kind: k, other: k === 'ander' ? others[Math.floor(Math.random() * Math.min(3, others.length))]?.id : undefined })));
    setCurrent(0);
    setHeard(false);
  };
  const play = () => {
    setStartAt(performance.now());
    setPlaying(true);
  };
  const [pick, setPick] = useState<boolean | null>(null);
  const [askSure, setAskSure] = useState(false);
  const answer = (mine: boolean, sure: number) => {
    if (current === null) return;
    setTrials((ts) => ts.map((t, i) => (i === current ? { ...t, answer: mine, sure } : t)));
    setCurrent(current + 1 < trials.length ? current + 1 : null);
    setHeard(false);
  };

  const done = trials.filter((t) => t.answer !== undefined);
  const correct = done.filter((t) => (t.kind === 'eigen') === t.answer);
  const sureRight = correct.length ? correct.reduce((a, t) => a + (t.sure ?? 0), 0) / correct.length : 0;
  const wrong = done.filter((t) => (t.kind === 'eigen') !== t.answer);
  const sureWrong = wrong.length ? wrong.reduce((a, t) => a + (t.sure ?? 0), 0) / wrong.length : 0;
  const pulse = Math.max(0, 1 - (performance.now() - lastPulse.current) / 300);
  const left = playing ? Math.max(0, TRIAL_SECS - (performance.now() - startAt) / 1000) : 0;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
      <div className="card p-8 min-h-[340px] flex flex-col items-center justify-center text-center">
        {current === null && !done.length && (
          <>
            <div className="serif text-[30px] leading-tight max-w-[540px]">Je hoort een hart. Is het het jouwe?</div>
            <Uitleg title="Herkennen"><p>Acht keer twaalf seconden. Soms is het jouw hart, live. Soms jouw ritme maar net te snel of te traag, soms het hart van iemand anders in de ruimte. Zet een koptelefoon op, zit stil en voel van binnenuit mee.</p></Uitleg>
            <button className="btn accent big mt-6" onClick={newSeries}>begin</button>
          </>
        )}
        {current !== null && (
          <>
            <div className="mono text-[11px] text-ink-3">poging {current + 1} / {trials.length}</div>
            <div className="w-24 h-24 rounded-full my-5" style={{ background: 'var(--sk-hart)', opacity: playing ? 0.15 + pulse * 0.6 : 0.08, transform: `scale(${1 + pulse * 0.12})` }} />
            {playing ? (
              <div className="serif italic text-[26px]">luister… {left.toFixed(0)}</div>
            ) : heard ? (
              <>
                <div className="text-[34px] font-light tracking-[-0.03em]">{pick === null ? 'Was dit jouw hart?' : 'Hoe zeker ben je?'}</div>
                {pick === null ? (
                  <div className="flex gap-3 mt-6">
                    <button className="btn accent big !px-10 !text-[20px]" onClick={() => (askSure ? setPick(true) : answer(true, 2))}>ja</button>
                    <button className="btn big !px-10 !text-[20px]" onClick={() => (askSure ? setPick(false) : answer(false, 2))}>nee</button>
                  </div>
                ) : (
                  <div className="flex gap-2 mt-6">
                    {[1, 2, 3].map((s) => (
                      <button key={s} className="btn big" onClick={() => { answer(pick, s); setPick(null); }}>{['gok', 'denk het', 'zeker'][s - 1]}</button>
                    ))}
                  </div>
                )}
                <button className={`chip mt-5 ${askSure ? 'on' : ''}`} onClick={() => setAskSure(!askSure)}>vraag ook zekerheid</button>
              </>
            ) : (
              <button className="btn accent big" onClick={play}>speel hart af</button>
            )}
          </>
        )}
        {current === null && done.length > 0 && (
          <>
            <div className="serif text-[34px]">{correct.length} van {done.length} goed</div>
            {askSure && <div className="text-[13px] text-ink-3 mt-2">zekerheid bij goed {sureRight.toFixed(1)} · bij fout {sureWrong.toFixed(1)} (1–3)</div>}
            <button className="btn accent mt-6" onClick={newSeries}>nog een reeks</button>
          </>
        )}
      </div>
      <div className="space-y-4">
        <div>
          <Label>wat je hoorde</Label>
          <div className="space-y-1">
            {done.map((t, i) => (
              <div key={i} className="flex justify-between mono text-[12px] border-b border-ink/5 py-1">
                <span className="text-ink-3">{i + 1}</span>
                <span>{t.kind === 'ander' ? `hart van ${hub.get(t.other)?.name ?? 'ander'}` : t.kind === 'eigen' ? 'jouw hart' : `jouw ritme, ${t.kind}`}</span>
                <span className={(t.kind === 'eigen') === t.answer ? 'text-acc' : 'text-hart'}>{(t.kind === 'eigen') === t.answer ? '✓' : '✗'}</span>
              </div>
            ))}
          </div>
        </div>
        <Uitleg title="Waarom zo getoetst"><p>
          Een band meldt slagen met wat vertraging (Bluetooth). Daarom toetsen we niet of de klik precies op je slag valt, zoals in het lab, maar of je je eigen tempo en wisselingen herkent. De zekerheid laat zien of je weet wát je weet.
        </p></Uitleg>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- raden

function Raad({ hub, meId }: { hub: BodyHub; meId: string }) {
  const [guess, setGuess] = useState('');
  const [rows, setRows] = useState<{ guess: number; real: number }[]>([]);
  const submit = () => {
    const b = hub.get(meId);
    if (!b) return;
    const real = Math.round(rateFrom(b.beats, performance.now(), 10000) || b.hr);
    setRows((r) => [...r, { guess: Number(guess), real }]);
    setGuess('');
  };
  const err = rows.length ? rows.reduce((a, r) => a + Math.abs(r.guess - r.real), 0) / rows.length : null;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8">
      <div className="card p-8 min-h-[300px] flex flex-col items-center justify-center text-center">
        <div className="serif text-[30px]">Hoe snel klopt je hart nu?</div>
        <Uitleg title="Raden"><p>Gok, zonder te voelen. Doe het na elke oefening opnieuw.</p></Uitleg>
        <div className="flex items-center gap-3 mt-5">
          <input value={guess} onChange={(e) => setGuess(e.target.value.replace(/\D/g, ''))} onKeyDown={(e) => e.key === 'Enter' && guess && submit()} className="w-[130px] text-center serif text-[44px] bg-ink/[0.05] border border-ink/15 rounded-xl" />
          <span className="serif text-[24px] text-ink-3">bpm</span>
        </div>
        <button className="btn accent mt-4" disabled={!guess} onClick={submit}>onthul</button>
      </div>
      <div className="space-y-4">
        <div className="card p-5">
          <Label>gemiddeld ernaast</Label>
          <Big color="var(--sk-acc)">{err === null ? '—' : `±${err.toFixed(0)}`}</Big>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="flex justify-between mono text-[12px] border-b border-ink/5 py-1">
            <span>gok {r.guess}</span>
            <span>echt {r.real}</span>
            <span className="text-acc">{r.guess - r.real > 0 ? '+' : ''}{r.guess - r.real}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
