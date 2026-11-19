import { useCallback, useEffect, useRef, useState } from 'react';
import {
  APPLIANCES,
  SCORE_MOODS,
  SFX_PRESETS,
  type ApplianceId,
  type DirigentRequest,
  type DirigentResponse,
  type InstrumentState,
  type Intervention,
  type LoggedIntervention,
  type ScoreMood,
  type SfxPreset,
} from '../../lib/huiskamerTypes';
import { HuiskamerAudio } from './audio';
import {
  APPLIANCE_POS,
  CLOCK_POS,
  EXERCISES,
  FURNITURE,
  HuiskamerSim,
  LAMP_POS,
  ROOM,
  SFX_STARTLE,
  thermostat,
  type Exercise,
} from './sim';

type Mode = 'handmatig' | 'regelaar' | 'claude';

const INITIAL: InstrumentState = {
  clocks: [
    { bpm: 0, volume: 0.6 },
    { bpm: 0, volume: 0.5 },
  ],
  score: { mood: 'stilte', intensity: 0.5 },
  lamp: { brightness: 0.6, warmth: 0.6 },
  appliances: Object.fromEntries(APPLIANCES.map((a) => [a, false])) as Record<ApplianceId, boolean>,
};

const MOOD_LABEL: Record<ScoreMood, string> = {
  stilte: 'Stilte',
  rust: 'Rust',
  zweven: 'Zweven',
  spanning: 'Spanning',
  opbouw: 'Opbouw',
  triomf: 'Triomf',
  hartslag: 'Hartslag',
};
const SFX_LABEL: Record<SfxPreset, string> = {
  deurbel: 'Deurbel',
  servies_valt: 'Servies valt',
  regen_op_raam: 'Regen op raam',
  vogels: 'Vogels',
  telefoon: 'Telefoon',
  onweer: 'Onweer',
  kat_spint: 'Kat spint',
};
const APPL_ICON: Record<ApplianceId, string> = {
  vaatwasser: '🫧',
  koelkast: '🧊',
  magnetron: '📡',
  koffiemachine: '☕',
  waterkoker: '🫖',
  stofzuiger: '🌀',
};

function hrColor(hr: number, target: number) {
  const d = Math.max(-1, Math.min(1, (hr - target) / 30));
  // onder doel: koel blauw, op doel: warm geel, boven doel: rood
  if (d < 0) return `hsl(${45 + -d * 165} ${55 + -d * 10}% ${60 - -d * 8}%)`;
  return `hsl(${45 - d * 45} ${80}% ${58 - d * 6}%)`;
}

function describe(iv: Intervention): string {
  switch (iv.kind) {
    case 'clock':
      return iv.bpm === 0 ? `klok ${iv.clock + 1} stil` : `klok ${iv.clock + 1} → ${Math.round(iv.bpm)} bpm (vol ${iv.volume.toFixed(1)})`;
    case 'score':
      return `muziek: ${MOOD_LABEL[iv.mood].toLowerCase()} (${iv.intensity.toFixed(1)})`;
    case 'lamp':
      return `licht ${Math.round(iv.brightness * 100)}%, warmte ${Math.round(iv.warmth * 100)}%`;
    case 'appliance':
      return `${iv.appliance} ${iv.on ? 'aan' : 'uit'}`;
    case 'sfx':
      return `geluid: ${SFX_LABEL[iv.sound].toLowerCase()}`;
    case 'generate_sound':
      return `genereer: “${iv.description}”`;
    case 'wait':
      return 'wacht';
  }
}

export default function HuiskamerLab() {
  const simRef = useRef<HuiskamerSim>(new HuiskamerSim(10));
  const audioRef = useRef<HuiskamerAudio | null>(null);
  const [ins, setIns] = useState<InstrumentState>(INITIAL);
  const insRef = useRef(ins);
  insRef.current = ins;
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [, setFrame] = useState(0);
  const [exercise, setExerciseState] = useState<Exercise>('zwerm');
  const [target, setTarget] = useState(100);
  const [mode, setMode] = useState<Mode>('handmatig');
  const [interval, setIntervalSec] = useState(15);
  const [allowGenerate, setAllowGenerate] = useState(false);
  const [log, setLog] = useState<LoggedIntervention[]>([]);
  const logRef = useRef(log);
  logRef.current = log;
  const [intents, setIntents] = useState<{ t: number; text: string; model?: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [genPrompt, setGenPrompt] = useState('old wooden house creaking, slow');
  const [generated, setGenerated] = useState<string[]>([]);
  const historyRef = useRef<{ t: number; avg: number; spread: number }[]>([]);

  // ---------- audio ----------
  const enableSound = async () => {
    if (!audioRef.current) {
      audioRef.current = new HuiskamerAudio();
      audioRef.current.onApplianceEnded = (id) =>
        setIns((s) => ({ ...s, appliances: { ...s.appliances, [id]: false } }));
      const a = audioRef.current;
      const s = insRef.current;
      s.clocks.forEach((c, i) => a.setClock(i, c.bpm, c.volume));
      a.setScore(s.score.mood, s.score.intensity);
      APPLIANCES.forEach((id) => s.appliances[id] && a.setAppliance(id, true));
    }
    await audioRef.current.resume();
    setSoundOn(true);
  };
  useEffect(() => () => audioRef.current?.dispose(), []);

  // ---------- interventies ----------
  const apply = useCallback((iv: Intervention, source: LoggedIntervention['source']) => {
    const sim = simRef.current;
    const a = audioRef.current;
    setLog((l) => [...l.slice(-199), { t: sim.t, source, intervention: iv }]);
    switch (iv.kind) {
      case 'clock':
        setIns((s) => {
          const clocks = s.clocks.map((c, i) => (i === iv.clock ? { bpm: iv.bpm, volume: iv.volume } : c));
          return { ...s, clocks };
        });
        a?.setClock(iv.clock, iv.bpm, iv.volume);
        break;
      case 'score':
        setIns((s) => ({ ...s, score: { mood: iv.mood, intensity: iv.intensity } }));
        a?.setScore(iv.mood, iv.intensity);
        if (iv.mood !== 'stilte') sim.impulse(0.04);
        break;
      case 'lamp':
        setIns((s) => ({ ...s, lamp: { brightness: iv.brightness, warmth: iv.warmth } }));
        break;
      case 'appliance':
        setIns((s) => ({ ...s, appliances: { ...s.appliances, [iv.appliance]: iv.on } }));
        a?.setAppliance(iv.appliance, iv.on);
        if (iv.on) sim.impulse(iv.appliance === 'stofzuiger' ? 0.25 : 0.06);
        if (iv.on && (iv.appliance === 'magnetron' || iv.appliance === 'waterkoker')) {
          // eindsignaal → kleine schrik, ook zonder geluid
          window.setTimeout(() => {
            sim.impulse(0.15);
            if (!audioRef.current) setIns((s) => ({ ...s, appliances: { ...s.appliances, [iv.appliance]: false } }));
          }, (iv.appliance === 'magnetron' ? 30 : 26) * 1000);
        }
        break;
      case 'sfx':
        a?.playSfx(iv.sound);
        sim.impulse(SFX_STARTLE[iv.sound]);
        break;
      case 'generate_sound':
        sim.impulse(0.2);
        if (a) {
          a.playGenerated(iv.description, 6)
            .then(() => setGenerated((g) => (g.includes(iv.description) ? g : [...g, iv.description])))
            .catch((e) => setError(`ElevenLabs: ${e.message}`));
        }
        break;
      case 'wait':
        break;
    }
  }, []);

  // ---------- simulatielus ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let renderAcc = 0;
    let histAcc = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (running) {
        acc += dtReal * speed;
        const sim = simRef.current;
        sim.heartbeatBpm = target;
        while (acc > 0.05) {
          sim.step(0.05, insRef.current);
          acc -= 0.05;
          histAcc += 0.05;
          if (histAcc >= 1) {
            histAcc = 0;
            const st = sim.stats();
            historyRef.current.push({ t: sim.t, avg: st.avg, spread: st.spread });
            if (historyRef.current.length > 600) historyRef.current.shift();
          }
        }
        if (audioRef.current) audioRef.current.heartbeatBpm = target;
      }
      renderAcc += dtReal;
      if (renderAcc > 1 / 20) {
        renderAcc = 0;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, target]);

  // ---------- dirigent ----------
  const buildRequest = useCallback((): DirigentRequest => {
    const sim = simRef.current;
    const st = sim.stats();
    const h = historyRef.current;
    const past = h.find((x) => x.t >= sim.t - 30) ?? h[0];
    return {
      t: sim.t,
      exercise: EXERCISES[sim.exercise].instructie,
      target,
      groupAvg: st.avg,
      groupSpread: st.spread,
      trend30s: past ? st.avg - past.avg : 0,
      history: h.filter((_, i) => i % 5 === 0).slice(-36),
      persons: sim.persons.map((p) => ({ id: p.id, hr: p.hr, real: p.real })),
      instruments: insRef.current,
      recent: logRef.current.slice(-10),
      allowGenerate,
    };
  }, [target, allowGenerate]);

  const askClaude = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/dirigent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildRequest()),
      });
      const data = (await r.json()) as DirigentResponse & { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setIntents((x) => [...x.slice(-30), { t: simRef.current.t, text: data.intent || '…', model: data.model }]);
      data.interventions.forEach((iv) => apply(iv, 'claude'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apply, buildRequest]);

  // tijd in simulatie-seconden, zodat 'versneld' ook de dirigent versnelt
  const lastCallRef = useRef(-999);
  useEffect(() => {
    if (mode === 'handmatig' || !running) return;
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (sim.t - lastCallRef.current < interval) return;
      if (mode === 'claude' && busy) return;
      lastCallRef.current = sim.t;
      if (mode === 'claude') void askClaude();
      else {
        const req = buildRequest();
        thermostat(req.groupAvg, req.target, req.trend30s, insRef.current).forEach((iv) => apply(iv, 'regelaar'));
      }
    }, 300);
    return () => clearInterval(id);
  }, [mode, running, interval, busy, askClaude, buildRequest, apply]);

  // ---------- Bluetooth hartslagbanden ----------
  const connectStrap = async () => {
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    if (!bt) {
      setError('Web Bluetooth niet beschikbaar: gebruik Chrome of Edge (desktop of Android).');
      return;
    }
    try {
      const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('heart_rate');
      const ch = await service.getCharacteristic('heart_rate_measurement');
      const sim = simRef.current;
      const p = sim.persons.find((x) => !x.real);
      if (!p) return;
      p.real = true;
      p.name = device.name ?? p.name;
      ch.addEventListener('characteristicvaluechanged', (ev: Event) => {
        const v = (ev.target as unknown as { value: DataView }).value;
        const flags = v.getUint8(0);
        p.realHr = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
      });
      await ch.startNotifications();
      device.addEventListener('gattserverdisconnected', () => {
        p.real = false;
        p.realHr = null;
      });
    } catch (e) {
      if (e instanceof Error && e.name !== 'NotFoundError') setError(e.message);
    }
  };

  const setExercise = (e: Exercise) => {
    setExerciseState(e);
    simRef.current.setExercise(e);
  };

  const reset = () => {
    simRef.current = new HuiskamerSim(10);
    simRef.current.setExercise(exercise);
    historyRef.current = [];
    setLog([]);
    setIntents([]);
    lastCallRef.current = -999;
  };

  // ---------- afgeleide weergave ----------
  const sim = simRef.current;
  const st = sim.stats();
  const hist = historyRef.current;

  return (
    <div className="min-h-svh w-full bg-[#15120e] text-[#e9e1d3] font-sans text-[14px] leading-snug">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3 border-b border-white/10">
        <div>
          <div className="text-[18px] font-semibold tracking-tight text-[#f4ead8]">Huiskamer · hartslagdirigent</div>
          <div className="text-[12px] text-[#a99d8a]">prototype voor de lummel-workshop: kan een kamer zonder woorden tien harten afstemmen?</div>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-1">
          {(Object.keys(EXERCISES) as Exercise[]).map((e) => (
            <button key={e} onClick={() => setExercise(e)} className={`px-3 py-1 rounded-md ${exercise === e ? 'bg-[#e8b04a] text-[#1c160e] font-medium' : 'hover:bg-white/10'}`}>
              {EXERCISES[e].label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2">
          doel
          <input type="range" min={60} max={140} value={target} onChange={(e) => setTarget(+e.target.value)} />
          <span className="tabular-nums w-14">{target} bpm</span>
        </label>
        <div className="flex items-center gap-2 ml-auto">
          <button onClick={() => setRunning((r) => !r)} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15">{running ? '❚❚ pauze' : '▶ verder'}</button>
          <select value={speed} onChange={(e) => setSpeed(+e.target.value)} className="bg-white/10 rounded-md px-2 py-1">
            <option value={1}>1×</option>
            <option value={2}>2×</option>
            <option value={4}>4×</option>
          </select>
          <button onClick={reset} className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/15">↺ opnieuw</button>
          <button onClick={enableSound} className={`px-3 py-1 rounded-md ${soundOn ? 'bg-emerald-700/60' : 'bg-[#e8b04a] text-[#1c160e] font-medium'}`}>{soundOn ? '🔊 geluid aan' : '🔈 zet geluid aan'}</button>
        </div>
      </header>

      <div className="px-5 pt-2 text-[13px] italic text-[#cbbfa9]">“{EXERCISES[exercise].instructie}”</div>

      <main className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
        {/* ---------- kamer ---------- */}
        <section className="rounded-xl bg-[#1d1914] border border-white/10 p-3">
          <RoomView sim={sim} ins={ins} target={target} />
        </section>

        {/* ---------- groep ---------- */}
        <section className="flex flex-col gap-3">
          <div className="rounded-xl bg-[#1d1914] border border-white/10 p-4">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[12px] uppercase tracking-wider text-[#a99d8a]">groepsgemiddelde</div>
                <div className="text-[44px] font-semibold tabular-nums leading-none" style={{ color: hrColor(st.avg, target) }}>
                  {st.avg.toFixed(0)}
                  <span className="text-[16px] text-[#a99d8a] font-normal"> / {target}</span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] uppercase tracking-wider text-[#a99d8a]">spreiding</div>
                <div className="text-[24px] tabular-nums">±{st.spread.toFixed(1)}</div>
                <div className="text-[11px] text-[#a99d8a]">{st.spread < 6 ? 'samen' : st.spread < 12 ? 'losjes' : 'uiteen'}</div>
              </div>
            </div>
            <HrChart hist={hist} target={target} log={log} now={sim.t} />
          </div>

          <div className="rounded-xl bg-[#1d1914] border border-white/10 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-[12px] uppercase tracking-wider text-[#a99d8a]">deelnemers</div>
              <button onClick={connectStrap} className="text-[12px] px-2 py-1 rounded bg-sky-800/60 hover:bg-sky-700/60">＋ koppel hartslagband (Bluetooth)</button>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1">
              {sim.persons.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="w-16 truncate text-[12px]">{p.real ? '● ' : ''}{p.name}</span>
                  <div className="relative h-2 flex-1 rounded bg-white/5">
                    <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${Math.min(100, ((p.hr - 50) / 110) * 100)}%`, background: hrColor(p.hr, target) }} />
                    <div className="absolute inset-y-[-2px] w-px bg-white/50" style={{ left: `${((target - 50) / 110) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right tabular-nums text-[12px]">{p.hr.toFixed(0)}</span>
                </div>
              ))}
            </div>
          </div>

          <DirigentPanel
            mode={mode}
            setMode={setMode}
            interval={interval}
            setInterval={setIntervalSec}
            allowGenerate={allowGenerate}
            setAllowGenerate={setAllowGenerate}
            busy={busy}
            error={error}
            intents={intents}
            log={log}
            askNow={askClaude}
          />
        </section>
      </main>

      {/* ---------- instrumentenbord ---------- */}
      <section className="grid gap-4 px-5 pb-8 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Klokken" hint="tempo stuurt de pas; op de tel, halve of dubbele tel">
          {ins.clocks.map((c, i) => (
            <div key={i} className="mb-3 last:mb-0">
              <div className="flex items-center justify-between">
                <span>{CLOCK_POS[i].label}</span>
                <button
                  onClick={() => apply({ kind: 'clock', clock: i, bpm: c.bpm ? 0 : 60, volume: c.volume }, 'handmatig')}
                  className={`text-[12px] px-2 py-0.5 rounded ${c.bpm ? 'bg-[#e8b04a] text-[#1c160e]' : 'bg-white/10'}`}
                >
                  {c.bpm ? `${Math.round(c.bpm)} bpm` : 'stil'}
                </button>
              </div>
              <Slider label="tempo" min={30} max={180} value={c.bpm || 60} onChange={(v) => apply({ kind: 'clock', clock: i, bpm: v, volume: c.volume }, 'handmatig')} />
              <Slider label="volume" min={0} max={1} step={0.05} value={c.volume} onChange={(v) => apply({ kind: 'clock', clock: i, bpm: c.bpm, volume: v }, 'handmatig')} />
            </div>
          ))}
        </Card>

        <Card title="Filmscore" hint="stemming werkt traag maar duurzaam">
          <div className="grid grid-cols-3 gap-1.5">
            {SCORE_MOODS.map((m) => (
              <button
                key={m}
                onClick={() => apply({ kind: 'score', mood: m, intensity: ins.score.intensity }, 'handmatig')}
                className={`py-3 rounded-lg text-[13px] ${ins.score.mood === m ? 'bg-[#e8b04a] text-[#1c160e] font-medium' : 'bg-white/5 hover:bg-white/10'}`}
              >
                {MOOD_LABEL[m]}
              </button>
            ))}
          </div>
          <Slider label="intensiteit" min={0} max={1} step={0.05} value={ins.score.intensity} onChange={(v) => apply({ kind: 'score', mood: ins.score.mood, intensity: v }, 'handmatig')} />
          <div className="mt-3 text-[12px] uppercase tracking-wider text-[#a99d8a]">licht</div>
          <Slider label="helderheid" min={0} max={1} step={0.05} value={ins.lamp.brightness} onChange={(v) => apply({ kind: 'lamp', brightness: v, warmth: ins.lamp.warmth }, 'handmatig')} />
          <Slider label="warmte" min={0} max={1} step={0.05} value={ins.lamp.warmth} onChange={(v) => apply({ kind: 'lamp', brightness: ins.lamp.brightness, warmth: v }, 'handmatig')} />
        </Card>

        <Card title="Apparaten" hint="het huis als instrument">
          <div className="grid grid-cols-2 gap-1.5">
            {APPLIANCES.map((a) => (
              <button
                key={a}
                onClick={() => apply({ kind: 'appliance', appliance: a, on: !ins.appliances[a] }, 'handmatig')}
                className={`flex items-center gap-2 px-2 py-2.5 rounded-lg text-left ${ins.appliances[a] ? 'bg-[#e8b04a] text-[#1c160e]' : 'bg-white/5 hover:bg-white/10'}`}
              >
                <span className="text-[18px]">{APPL_ICON[a]}</span>
                <span className="capitalize">{a}</span>
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-[#a99d8a]">Magnetron (30s) en waterkoker (26s) eindigen met een signaal. De stofzuiger rijdt rond en mensen wijken uit.</p>
        </Card>

        <Card title="Geluiden" hint="korte prikkel: schrik of zachtheid">
          <div className="grid grid-cols-2 gap-1.5">
            {SFX_PRESETS.map((s) => (
              <button key={s} onClick={() => apply({ kind: 'sfx', sound: s }, 'handmatig')} className="px-2 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-left">
                {SFX_LABEL[s]}
                <span className="float-right text-[11px] text-[#a99d8a]">{SFX_STARTLE[s] > 0 ? '↑' : '↓'}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 text-[12px] uppercase tracking-wider text-[#a99d8a]">ElevenLabs</div>
          <div className="flex gap-1.5 mt-1">
            <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} className="flex-1 min-w-0 rounded bg-white/5 px-2 py-1" placeholder="beschrijf een geluid (Engels)" />
            <button disabled={!soundOn} onClick={() => apply({ kind: 'generate_sound', description: genPrompt }, 'handmatig')} className="px-2 rounded bg-white/10 hover:bg-white/15 disabled:opacity-40">▶</button>
          </div>
          {generated.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {generated.map((g) => (
                <button key={g} onClick={() => apply({ kind: 'generate_sound', description: g }, 'handmatig')} className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/15">{g}</button>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-[#1d1914] border border-white/10 p-4">
      <div className="mb-3">
        <div className="font-medium text-[#f4ead8]">{title}</div>
        {hint && <div className="text-[11px] text-[#a99d8a]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Slider({ label, min, max, step = 1, value, onChange }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-[12px] mt-1.5">
      <span className="w-20 text-[#a99d8a]">{label}</span>
      <input className="flex-1 accent-[#e8b04a]" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      <span className="w-9 text-right tabular-nums">{step < 1 ? value.toFixed(2) : Math.round(value)}</span>
    </label>
  );
}

function RoomView({ sim, ins, target }: { sim: HuiskamerSim; ins: InstrumentState; target: number }) {
  const S = 80; // px per meter
  const W = ROOM.w * S;
  const H = ROOM.h * S;
  const lampColor = `hsl(${30 + (1 - ins.lamp.warmth) * 170} ${ins.lamp.warmth > 0.5 ? 90 : 40}% 70%)`;
  const t = sim.t;
  const pairs: [number, number][] = [];
  for (let i = 0; i < sim.persons.length; i++)
    for (let j = i + 1; j < sim.persons.length; j++) {
      const a = sim.persons[i];
      const b = sim.persons[j];
      if (Math.hypot(a.x - b.x, a.y - b.y) < 1) pairs.push([i, j]);
    }

  return (
    <svg viewBox={`-10 -10 ${W + 20} ${H + 20}`} className="w-full h-auto block">
      <defs>
        <radialGradient id="lampglow">
          <stop offset="0%" stopColor={lampColor} stopOpacity={0.55 * ins.lamp.brightness} />
          <stop offset="100%" stopColor={lampColor} stopOpacity={0} />
        </radialGradient>
        <pattern id="floor" width="40" height="40" patternUnits="userSpaceOnUse">
          <rect width="40" height="40" fill="#2a231b" />
          <path d="M0 0H40M0 20H40" stroke="#241e17" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#floor)" />
      <rect x={0} y={0} width={W} height={H} fill="#000" opacity={0.55 * (1 - ins.lamp.brightness)} />
      <circle cx={LAMP_POS.x * S} cy={LAMP_POS.y * S} r={6.5 * S * (0.4 + ins.lamp.brightness * 0.6)} fill="url(#lampglow)" />
      {/* vloerkleed */}
      <ellipse cx={2.2 * S} cy={3.8 * S} rx={1.9 * S} ry={1.3 * S} fill="#4a3426" opacity={0.6} />
      {FURNITURE.map((f) => (
        <g key={f.label}>
          <rect x={f.x * S} y={f.y * S} width={f.w * S} height={f.h * S} rx={f.kind === 'bank' ? 14 : 4} fill={f.kind === 'keuken' ? '#3b352d' : f.kind === 'bank' ? '#5b4a6b' : '#5a4330'} stroke="#00000055" />
          <text x={(f.x + f.w / 2) * S} y={(f.y + f.h / 2) * S + 4} textAnchor="middle" fontSize={11} fill="#ffffff55">{f.label}</text>
        </g>
      ))}
      {/* apparaten */}
      {APPLIANCES.map((a) => {
        const pos = a === 'stofzuiger' && ins.appliances.stofzuiger ? sim.vacuum : APPLIANCE_POS[a];
        const on = ins.appliances[a];
        return (
          <g key={a} transform={`translate(${pos.x * S} ${pos.y * S})`}>
            {on && <circle r={22 + Math.sin(t * 6) * 3} fill="#e8b04a" opacity={0.25} />}
            <circle r={14} fill={on ? '#e8b04a' : '#3d362d'} stroke="#00000066" />
            <text y={5} textAnchor="middle" fontSize={14}>{APPL_ICON[a]}</text>
          </g>
        );
      })}
      {/* klokken */}
      {ins.clocks.map((c, i) => {
        const p = CLOCK_POS[i];
        const beats = c.bpm > 0 ? Math.floor((t * c.bpm) / 60) : 0;
        const ang = (beats % 60) * 6;
        return (
          <g key={i} transform={`translate(${p.x * S} ${p.y * S})`}>
            <circle r={18} fill="#efe6d4" stroke="#6b5a45" strokeWidth={3} />
            {Array.from({ length: 12 }, (_, k) => (
              <line key={k} x1={0} y1={-14} x2={0} y2={-11} stroke="#6b5a45" transform={`rotate(${k * 30})`} />
            ))}
            <line x1={0} y1={0} x2={0} y2={-13} stroke="#b33" strokeWidth={1.5} transform={`rotate(${ang})`} />
            <line x1={0} y1={0} x2={0} y2={-8} stroke="#333" strokeWidth={2.5} transform={`rotate(${(t / 60) * 30})`} />
            {c.bpm > 0 && <circle r={22} fill="none" stroke="#e8b04a" opacity={1 - (((t * c.bpm) / 60) % 1)} />}
            <text y={34} textAnchor="middle" fontSize={10} fill="#cbbfa9">{c.bpm ? `${Math.round(c.bpm)}` : '—'}</text>
          </g>
        );
      })}
      {/* lamp */}
      <circle cx={LAMP_POS.x * S} cy={LAMP_POS.y * S} r={9} fill={lampColor} opacity={0.3 + ins.lamp.brightness * 0.7} />
      {/* nabijheidslijnen < 1m */}
      {pairs.map(([i, j]) => {
        const a = sim.persons[i];
        const b = sim.persons[j];
        return <line key={`${i}-${j}`} x1={a.x * S} y1={a.y * S} x2={b.x * S} y2={b.y * S} stroke="#e8b04a" strokeOpacity={0.25} />;
      })}
      {/* mensen */}
      {sim.persons.map((p) => {
        const beat = (t * p.hr) / 60;
        const pulse = Math.max(0, 1 - (beat % 1) * 4);
        const col = hrColor(p.hr, target);
        return (
          <g key={p.id} transform={`translate(${p.x * S} ${p.y * S})`}>
            <circle r={0.5 * S} fill="none" stroke={col} strokeOpacity={0.12} strokeDasharray="3 4" />
            <circle r={12 + pulse * 5} fill={col} opacity={0.18} />
            <circle r={10} fill={col} stroke={p.real ? '#fff' : '#00000088'} strokeWidth={p.real ? 2 : 1} />
            <line x1={0} y1={0} x2={Math.cos(p.heading) * 14} y2={Math.sin(p.heading) * 14} stroke="#1c160e" strokeWidth={2} opacity={p.sitting ? 0 : 0.6} />
            <text y={-16} textAnchor="middle" fontSize={10} fill="#e9e1d3">{p.name}</text>
            <text y={4} textAnchor="middle" fontSize={9} fontWeight={600} fill="#1c160e">{p.hr.toFixed(0)}</text>
          </g>
        );
      })}
      <text x={W - 4} y={H - 6} textAnchor="end" fontSize={10} fill="#ffffff44">9 × 6 m · stippelcirkel = 0,5 m · lijn = binnen 1 m</text>
    </svg>
  );
}

function HrChart({ hist, target, log, now }: { hist: { t: number; avg: number; spread: number }[]; target: number; log: LoggedIntervention[]; now: number }) {
  const W = 420;
  const H = 130;
  const span = 300;
  const t0 = Math.max(0, now - span);
  const x = (t: number) => ((t - t0) / span) * W;
  const y = (hr: number) => H - ((hr - 50) / 100) * H;
  const vis = hist.filter((h) => h.t >= t0);
  const line = vis.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.avg).toFixed(1)}`).join('');
  const band =
    vis.length > 1
      ? vis.map((h, i) => `${i ? 'L' : 'M'}${x(h.t).toFixed(1)},${y(h.avg + h.spread).toFixed(1)}`).join('') +
        vis
          .slice()
          .reverse()
          .map((h) => `L${x(h.t).toFixed(1)},${y(h.avg - h.spread).toFixed(1)}`)
          .join('') +
        'Z'
      : '';
  const colors = { claude: '#c58cff', regelaar: '#6fb7ff', handmatig: '#e8b04a' };
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} className="w-full mt-3">
      {[60, 80, 100, 120, 140].map((v) => (
        <g key={v}>
          <line x1={0} x2={W} y1={y(v)} y2={y(v)} stroke="#ffffff10" />
          <text x={2} y={y(v) - 2} fontSize={8} fill="#ffffff40">{v}</text>
        </g>
      ))}
      <line x1={0} x2={W} y1={y(target)} y2={y(target)} stroke="#e8b04a" strokeDasharray="4 3" />
      <path d={band} fill="#e8b04a" opacity={0.12} />
      <path d={line} fill="none" stroke="#f4ead8" strokeWidth={1.8} />
      {log
        .filter((l) => l.t >= t0 && l.intervention.kind !== 'wait')
        .map((l, i) => (
          <line key={i} x1={x(l.t)} x2={x(l.t)} y1={H} y2={H + 10} stroke={colors[l.source]} strokeWidth={2} />
        ))}
      <text x={W} y={H + 13} textAnchor="end" fontSize={8} fill="#ffffff50">laatste 5 min · streepjes = ingrepen (geel hand, blauw regelaar, paars Claude)</text>
    </svg>
  );
}

function DirigentPanel(props: {
  mode: Mode;
  setMode: (m: Mode) => void;
  interval: number;
  setInterval: (n: number) => void;
  allowGenerate: boolean;
  setAllowGenerate: (b: boolean) => void;
  busy: boolean;
  error: string | null;
  intents: { t: number; text: string; model?: string }[];
  log: LoggedIntervention[];
  askNow: () => void;
}) {
  const { mode, setMode, interval, setInterval, allowGenerate, setAllowGenerate, busy, error, intents, log, askNow } = props;
  const items = [
    ...intents.map((i) => ({ t: i.t, kind: 'intent' as const, text: i.text })),
    ...log.map((l) => ({ t: l.t, kind: l.source, text: describe(l.intervention) })),
  ]
    .sort((a, b) => b.t - a.t)
    .slice(0, 40);
  return (
    <div className="rounded-xl bg-[#1d1914] border border-white/10 p-3 flex flex-col min-h-0">
      <div className="flex items-center justify-between">
        <div className="text-[12px] uppercase tracking-wider text-[#a99d8a]">dirigent</div>
        {busy && <span className="text-[11px] text-[#c58cff] animate-pulse">Claude luistert…</span>}
      </div>
      <div className="flex gap-1 mt-2 rounded-lg bg-white/5 p-1">
        {(['handmatig', 'regelaar', 'claude'] as Mode[]).map((m) => (
          <button key={m} onClick={() => setMode(m)} className={`flex-1 py-1 rounded-md capitalize ${mode === m ? (m === 'claude' ? 'bg-[#c58cff] text-[#1c160e] font-medium' : 'bg-[#e8b04a] text-[#1c160e] font-medium') : 'hover:bg-white/10'}`}>
            {m}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-2 text-[12px]">
        <label className="flex items-center gap-1.5 flex-1">
          elke
          <input type="range" min={5} max={60} value={interval} onChange={(e) => setInterval(+e.target.value)} className="flex-1 accent-[#c58cff]" />
          <span className="tabular-nums w-8">{interval}s</span>
        </label>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={allowGenerate} onChange={(e) => setAllowGenerate(e.target.checked)} />
          mag genereren
        </label>
        <button onClick={askNow} disabled={busy} className="px-2 py-0.5 rounded bg-[#c58cff]/20 hover:bg-[#c58cff]/30 disabled:opacity-40">vraag nu</button>
      </div>
      {error && <div className="mt-2 text-[12px] text-red-300">{error}</div>}
      <div className="mt-2 max-h-56 overflow-auto pr-1 space-y-1">
        {items.length === 0 && <div className="text-[12px] text-[#a99d8a]">Nog geen ingrepen. Kies ‘claude’ om de kamer over te dragen, of speel zelf op het bord hieronder.</div>}
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 text-[12px]">
            <span className="tabular-nums text-[#a99d8a] w-10 shrink-0">{fmt(it.t)}</span>
            {it.kind === 'intent' ? (
              <span className="italic text-[#dcc4ff]">{it.text}</span>
            ) : (
              <span style={{ color: it.kind === 'claude' ? '#c58cff' : it.kind === 'regelaar' ? '#6fb7ff' : '#e8b04a' }}>{it.text}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function fmt(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
