import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEVICES,
  EAR_LAYERS,
  PHASES,
  ROOM_MOODS,
  ROOM_SOUNDS,
  type DeviceId,
  type Dirigent2Request,
  type Dirigent2Response,
  type Ear,
  type EarLayer,
  type Goal,
  type Intervention2,
  type LabState,
  type Logged2,
  type Phase,
  type RoomMood,
  type RoomSound,
  type Source,
  type Wall,
} from '../../lib/huiskamer2Types';
import { HuiskamerAudio } from './audio';
import { EarMonitor } from './ear';
import Room3D, { type RoomView } from './Room3D';
import { DEVICE_POS, PHASE_INFO, SOUND_IMPULSE, Sim2, earActive, thermostat2, type Person2 } from './sim2';

type Mode = 'hand' | 'regelaar' | 'claude';

const EAR_OFF: Ear = { tempo: 0, volume: 0.7, layer: 'stil', mirror: null };
const initialLab = (sim: Sim2): LabState => ({
  room: {
    clock: { bpm: 0, volume: 0.6 },
    radio: { mood: 'stilte', intensity: 0.5 },
    light: { brightness: 0.55, warmth: 0.7, focus: null },
    devices: Object.fromEntries(DEVICES.map((d) => [d, false])) as Record<DeviceId, boolean>,
  },
  ears: Object.fromEntries(sim.persons.map((p) => [p.id, { ...EAR_OFF }])),
});

const MOOD_LABEL: Record<RoomMood, string> = { stilte: 'stilte', rust: 'rust', zweven: 'zweven', spanning: 'spanning', opbouw: 'opbouw', triomf: 'triomf' };
const SOUND_LABEL: Record<RoomSound, string> = { deurbel: 'deurbel', servies_valt: 'servies valt', regen_op_raam: 'regen', vogels: 'vogels', telefoon: 'telefoon', onweer: 'onweer', kat_spint: 'kat spint' };
const LAYER_HEX: Record<EarLayer, string> = { stil: '#8f8a80', kalm: '#5fd1c3', neutraal: '#cfc6b4', activerend: '#ff8a3d' };
const SRC_HEX: Record<Source, string> = { hand: '#e9c46a', regelaar: '#7ab8ff', claude: '#c9a2ff' };
const ZONES = [
  { label: 'rust', v: 0.1 },
  { label: 'lummel', v: 0.2 },
  { label: 'wakker', v: 0.3 },
  { label: 'actief', v: 0.45 },
];

function zoneCss(pct: number, target: number) {
  const d = Math.max(-1, Math.min(1, (pct - target) / 0.2));
  if (d < 0) return `hsl(${40 + -d * 150} 70% ${55 + -d * 5}%)`;
  return `hsl(${(40 - d * 52 + 360) % 360} 85% 56%)`;
}
const pc = (x: number) => `${Math.round(x * 100)}%`;
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

function describe(iv: Intervention2, names: Record<string, string>): string {
  switch (iv.kind) {
    case 'clock':
      return iv.bpm ? `wandklok ${Math.round(iv.bpm)}` : 'wandklok stil';
    case 'radio':
      return `radio · ${MOOD_LABEL[iv.mood]} ${iv.intensity.toFixed(1)}`;
    case 'light':
      return `licht ${pc(iv.brightness)}${iv.focus ? ` · wand ${iv.focus}` : ''}`;
    case 'device':
      return `${iv.device} ${iv.on ? 'aan' : 'uit'}`;
    case 'sound':
      return SOUND_LABEL[iv.sound];
    case 'generate_sound':
      return `“${iv.description}”`;
    case 'ear': {
      const e = iv.ear;
      const parts = [e.tempo ? `${Math.round(e.tempo)} tik` : null, e.layer !== 'stil' ? e.layer : null, e.mirror !== null ? `spiegel ${e.mirror > 0 ? '+' : ''}${Math.round(e.mirror)}` : null].filter(Boolean);
      return `oor ${names[iv.person] ?? iv.person} · ${parts.join(' · ') || 'stil'}`;
    }
    case 'wait':
      return 'wacht';
  }
}

export default function Lab2() {
  const simRef = useRef(new Sim2());
  const [lab, setLab] = useState<LabState>(() => initialLab(simRef.current));
  const labRef = useRef(lab);
  labRef.current = lab;
  const [goal, setGoal] = useState<Goal>({ mode: 'relatief', zone: 0.3, bpm: 100 });
  const goalRef = useRef(goal);
  goalRef.current = goal;
  const [phase, setPhaseState] = useState<Phase>('aankomen');
  const [running, setRunning] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [, setFrame] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [showProfiles, setShowProfiles] = useState(false);
  const [tab, setTab] = useState<'kamer' | 'oren'>('kamer');
  const [mode, setMode] = useState<Mode>('hand');
  const [interval, setIntervalSec] = useState(20);
  const [allowGenerate, setAllowGenerate] = useState(false);
  const [log, setLog] = useState<Logged2[]>([]);
  const logRef = useRef(log);
  logRef.current = log;
  const [intents, setIntents] = useState<{ t: number; text: string }[]>([]);
  const [phaseMarks, setPhaseMarks] = useState<{ t: number; phase: Phase }[]>([{ t: 0, phase: 'aankomen' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [genPrompt, setGenPrompt] = useState('old wooden house settling, soft creaks');
  const [showConcept, setShowConcept] = useState(false);
  const audioRef = useRef<HuiskamerAudio | null>(null);
  const earRef = useRef<EarMonitor | null>(null);
  const histRef = useRef<{ t: number; pcts: number[]; avg: number }[]>([]);
  const streakRef = useRef(0);

  const targetPct = useCallback((p: Person2) => {
    const g = goalRef.current;
    if (g.mode === 'relatief') return g.zone;
    const rest = p.restMeasured ?? p.rest;
    return (g.bpm - rest) / (p.max - rest);
  }, []);

  const viewRef = useRef<RoomView>({ sim: simRef.current, lab, targetPct, selected, onSelect: () => {} });
  viewRef.current = {
    sim: simRef.current,
    lab,
    targetPct,
    selected,
    onSelect: (id) => {
      setSelected(id);
      if (id) setTab('oren');
    },
  };

  // fonts
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap';
    document.head.appendChild(l);
    return () => l.remove();
  }, []);

  // ---------- audio ----------
  const enableSound = async () => {
    if (!audioRef.current) {
      const a = new HuiskamerAudio();
      audioRef.current = a;
      earRef.current = new EarMonitor(a);
      a.onApplianceEnded = (id) => {
        if ((DEVICES as readonly string[]).includes(id)) {
          setLab((s) => ({ ...s, room: { ...s.room, devices: { ...s.room.devices, [id]: false } } }));
          simRef.current.deviceChanged(id as DeviceId, false);
        }
      };
      const r = labRef.current.room;
      a.setClock(0, r.clock.bpm, r.clock.volume);
      a.setScore(r.radio.mood, r.radio.intensity);
      DEVICES.forEach((d) => r.devices[d] && a.setAppliance(d, true));
    }
    await audioRef.current.resume();
    setSoundOn(true);
  };
  useEffect(() => () => {
    earRef.current?.dispose();
    audioRef.current?.dispose();
  }, []);

  // meeluisteren met het geselecteerde oor
  useEffect(() => {
    const em = earRef.current;
    if (!em) return;
    const p = simRef.current.persons.find((x) => x.id === selected);
    if (listening && p) em.listen(p.id, labRef.current.ears[p.id], p.hr);
    else em.listen(null, null, 0);
  }, [listening, selected, soundOn]);
  useEffect(() => {
    const id = window.setInterval(() => {
      const em = earRef.current;
      if (!em?.listening) return;
      const p = simRef.current.persons.find((x) => x.id === em.listening);
      if (p) em.update(labRef.current.ears[p.id], p.hr);
    }, 300);
    return () => clearInterval(id);
  }, []);

  // ---------- interventies ----------
  const apply = useCallback((iv: Intervention2, source: Source) => {
    const sim = simRef.current;
    const a = audioRef.current;
    if (iv.kind !== 'wait') setLog((l) => [...l.slice(-299), { t: sim.t, source, iv }]);
    streakRef.current = 0;
    switch (iv.kind) {
      case 'clock':
        setLab((s) => ({ ...s, room: { ...s.room, clock: { bpm: iv.bpm, volume: iv.volume } } }));
        a?.setClock(0, iv.bpm, iv.volume);
        break;
      case 'radio':
        setLab((s) => ({ ...s, room: { ...s.room, radio: { mood: iv.mood, intensity: iv.intensity } } }));
        a?.setScore(iv.mood, iv.intensity);
        break;
      case 'light':
        setLab((s) => ({ ...s, room: { ...s.room, light: { brightness: iv.brightness, warmth: iv.warmth, focus: iv.focus } } }));
        break;
      case 'device': {
        setLab((s) => ({ ...s, room: { ...s.room, devices: { ...s.room.devices, [iv.device]: iv.on } } }));
        sim.deviceChanged(iv.device, iv.on);
        a?.setAppliance(iv.device, iv.on);
        if (iv.on) sim.impulse(0.06);
        const dur = { magnetron: 30, waterkoker: 26, koffiemachine: 24 } as Partial<Record<DeviceId, number>>;
        if (iv.on && dur[iv.device]) {
          window.setTimeout(() => {
            sim.impulse(0.15);
            if (!audioRef.current) {
              setLab((s) => ({ ...s, room: { ...s.room, devices: { ...s.room.devices, [iv.device]: false } } }));
              sim.deviceChanged(iv.device, false);
            }
          }, dur[iv.device]! * 1000);
        }
        break;
      }
      case 'sound':
        a?.playSfx(iv.sound);
        sim.impulse(SOUND_IMPULSE[iv.sound]);
        break;
      case 'generate_sound':
        sim.impulse(0.2);
        a?.playGenerated(iv.description, 6).catch((e) => setError(`ElevenLabs: ${e.message}`));
        break;
      case 'ear':
        labRef.current = { ...labRef.current, ears: { ...labRef.current.ears, [iv.person]: iv.ear } };
        setLab((s) => ({ ...s, ears: { ...s.ears, [iv.person]: iv.ear } }));
        break;
      case 'wait':
        break;
    }
  }, []);

  const setPhase = (p: Phase) => {
    setPhaseState(p);
    simRef.current.setPhase(p);
    setPhaseMarks((m) => [...m, { t: simRef.current.t, phase: p }]);
  };

  // ---------- simulatielus ----------
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let histAcc = 0;
    let renderAcc = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.25, (now - last) / 1000);
      last = now;
      if (running) {
        acc += dtReal * speed;
        const sim = simRef.current;
        while (acc > 0.05) {
          sim.step(0.05, labRef.current);
          acc -= 0.05;
          histAcc += 0.05;
          if (histAcc >= 1) {
            histAcc = 0;
            const pcts = sim.persons.map((p) => sim.pct(p));
            const st = sim.stats();
            histRef.current.push({ t: sim.t, pcts, avg: st.avgPct });
            if (histRef.current.length > 900) histRef.current.shift();
            const tz = goalRef.current.mode === 'relatief' ? goalRef.current.zone : sim.persons.reduce((a, p) => a + targetPct(p), 0) / sim.persons.length;
            streakRef.current = Math.abs(st.avgPct - tz) < 0.05 ? streakRef.current + 1 : 0;
          }
        }
      }
      renderAcc += dtReal;
      if (renderAcc > 1 / 8) {
        renderAcc = 0;
        setFrame((f) => f + 1);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running, speed, targetPct]);

  // ---------- dirigent ----------
  const buildRequest = useCallback((): Dirigent2Request => {
    const sim = simRef.current;
    const st = sim.stats();
    const h = histRef.current;
    const c = sim.centroid();
    const past = h.find((x) => x.t >= sim.t - 30) ?? h[0];
    const samples = h.filter((x) => x.t >= sim.t - 120 && Math.round(x.t) % 15 === 0);
    return {
      t: sim.t,
      phase: sim.phase,
      goal: goalRef.current,
      group: { avgPct: st.avgPct, spreadPct: st.spreadPct, avgBpm: st.avgBpm, radius: st.radius },
      persons: sim.persons.map((p, i) => ({
        id: p.id,
        rest: p.restMeasured ?? p.rest,
        max: p.max,
        hr: p.hr,
        pct: sim.pct(p),
        targetPct: targetPct(p),
        trend30: past ? sim.pct(p) - past.pcts[i] : 0,
        history: samples.map((x) => x.pcts[i]),
        ear: labRef.current.ears[p.id],
        real: p.real,
        distToGroup: Math.hypot(p.x - c.x, p.y - c.y),
      })),
      room: labRef.current.room,
      recent: logRef.current.slice(-14),
      allowGenerate,
    };
  }, [allowGenerate, targetPct]);

  const askClaude = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/dirigent2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(buildRequest()) });
      const data = (await r.json()) as Dirigent2Response & { error?: string };
      if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
      setIntents((x) => [...x.slice(-40), { t: simRef.current.t, text: data.intent || '…' }]);
      data.interventions.forEach((iv) => apply(iv, 'claude'));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [apply, buildRequest]);

  const lastCall = useRef(-999);
  useEffect(() => {
    if (mode === 'hand' || !running) return;
    const id = window.setInterval(() => {
      const sim = simRef.current;
      if (sim.t - lastCall.current < interval || (mode === 'claude' && busy)) return;
      lastCall.current = sim.t;
      if (mode === 'claude') void askClaude();
      else thermostat2(sim, targetPct, labRef.current.ears).forEach((x) => apply({ kind: 'ear', person: x.person, ear: x.ear }, 'regelaar'));
    }, 300);
    return () => clearInterval(id);
  }, [mode, running, interval, busy, askClaude, apply, targetPct]);

  // ---------- Bluetooth ----------
  const connectStrap = async (pid: string) => {
    setError(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bt = (navigator as any).bluetooth;
    if (!bt) return setError('Web Bluetooth werkt alleen in Chrome/Edge.');
    try {
      const device = await bt.requestDevice({ filters: [{ services: ['heart_rate'] }] });
      const ch = await (await (await device.gatt.connect()).getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
      const p = simRef.current.persons.find((x) => x.id === pid)!;
      p.real = true;
      p.restMeasured = null;
      p.restAcc = { sum: 0, n: 0 };
      ch.addEventListener('characteristicvaluechanged', (ev: Event) => {
        const v = (ev.target as unknown as { value: DataView }).value;
        p.realHr = v.getUint8(0) & 1 ? v.getUint16(1, true) : v.getUint8(1);
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

  const reset = () => {
    simRef.current = new Sim2();
    histRef.current = [];
    setLab(initialLab(simRef.current));
    setLog([]);
    setIntents([]);
    setPhaseState('aankomen');
    setPhaseMarks([{ t: 0, phase: 'aankomen' }]);
    setSelected(null);
    lastCall.current = -999;
    if (audioRef.current) {
      const a = audioRef.current;
      a.setClock(0, 0, 0.6);
      a.setScore('stilte', 0.5);
      DEVICES.forEach((d) => a.setAppliance(d, false));
    }
  };

  // ---------- afgeleid ----------
  const sim = simRef.current;
  const st = sim.stats();
  const names = Object.fromEntries(sim.persons.map((p) => [p.id, p.name]));
  const inZone = sim.persons.filter((p) => Math.abs(sim.pct(p) - targetPct(p)) < 0.05).length;
  const perMin = log.filter((l) => l.t > sim.t - 60).length;
  const latest = intents[intents.length - 1];
  const zoneLabel = goal.mode === 'relatief' ? pc(goal.zone) : `${goal.bpm} bpm`;
  const avgTarget = sim.persons.reduce((a, p) => a + targetPct(p), 0) / sim.persons.length;

  return (
    <div className="kl h-svh w-full overflow-hidden bg-[#0e0c0a] text-[#ebe3d5] flex flex-col" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      <style>{CSS}</style>

      {/* ------------- kop ------------- */}
      <header className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5 shrink-0 border-b border-white/[0.06] relative">
        <button onClick={() => setShowConcept((s) => !s)} className="text-left">
          <div className="serif text-[28px] leading-none text-[#f5ecdc]">De kamer luistert</div>
          <div className="mono text-[10px] tracking-[0.18em] uppercase text-[#8f8577] mt-1">huiskamer v2 · zwerm · oor · kamer {showConcept ? '▴' : '▾'}</div>
        </button>

        <nav className="flex items-center">
          {PHASES.map((p, i) => (
            <button key={p} onClick={() => setPhase(p)} className={`phase ${phase === p ? 'on' : ''}`}>
              <span className="mono text-[10px] opacity-60 mr-1.5">{i + 1}</span>
              {PHASE_INFO[p].label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="seg">
            {(['relatief', 'absoluut'] as const).map((m) => (
              <button key={m} className={goal.mode === m ? 'on' : ''} onClick={() => setGoal((g) => ({ ...g, mode: m }))}>
                {m === 'relatief' ? '%HRR' : 'bpm'}
              </button>
            ))}
          </div>
          {goal.mode === 'relatief' ? (
            <div className="seg">
              {ZONES.map((z) => (
                <button key={z.label} className={Math.abs(goal.zone - z.v) < 0.001 ? 'on' : ''} onClick={() => setGoal((g) => ({ ...g, zone: z.v }))}>
                  <span title={pc(z.v)}>{z.label}</span>
                </button>
              ))}
            </div>
          ) : (
            <label className="flex items-center gap-2 text-[12px]">
              <input type="range" min={60} max={140} value={goal.bpm} onChange={(e) => setGoal((g) => ({ ...g, bpm: +e.target.value }))} />
              <span className="mono w-14">{goal.bpm} bpm</span>
            </label>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <span className="mono text-[13px] text-[#b5a993] w-12 text-right">{fmt(sim.t)}</span>
          <button className="btn" onClick={() => setRunning((r) => !r)}>{running ? '❚❚' : '▶'}</button>
          <div className="seg">
            {[1, 3, 6].map((s) => (
              <button key={s} className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)}>{s}×</button>
            ))}
          </div>
          <button className="btn" onClick={reset} title="opnieuw">↺</button>
          <button className={`btn ${soundOn ? '' : 'accent'}`} onClick={enableSound}>{soundOn ? '◉ geluid' : '○ geluid aan'}</button>
        </div>
      </header>

      {showConcept && <Concept onClose={() => setShowConcept(false)} />}

      {/* ------------- hoofdvlak ------------- */}
      <div className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_340px] grid-rows-[minmax(0,1fr)_236px]">
        {/* instrumenten */}
        <aside className="row-span-2 border-r border-white/[0.06] flex flex-col min-h-0">
          <div className="flex px-4 pt-3 gap-4 text-[13px]">
            {(['kamer', 'oren'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`tab ${tab === t ? 'on' : ''}`}>
                {t === 'kamer' ? 'De kamer' : 'De oren'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-auto px-4 pb-6 pt-3 space-y-5 scroll">
            {tab === 'kamer' ? (
              <RoomPanel lab={lab} apply={apply} soundOn={soundOn} genPrompt={genPrompt} setGenPrompt={setGenPrompt} />
            ) : (
              <EarsPanel
                sim={sim}
                lab={lab}
                selected={selected}
                setSelected={setSelected}
                apply={apply}
                targetPct={targetPct}
                showProfiles={showProfiles}
                setShowProfiles={setShowProfiles}
                listening={listening}
                setListening={(b) => {
                  if (b && !soundOn) void enableSound();
                  setListening(b);
                }}
                connectStrap={connectStrap}
                getEar={(id) => labRef.current.ears[id]}
              />
            )}
          </div>
        </aside>

        {/* kamer 3D */}
        <section className="relative min-h-0">
          <Room3D viewRef={viewRef} />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(14,12,10,.7),transparent_35%),radial-gradient(ellipse_at_bottom_left,rgba(14,12,10,.7),transparent_32%)]" />
          <div className="pointer-events-none absolute left-5 top-4">
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">samen</div>
            <div className="flex items-baseline gap-2">
              <span className="serif text-[64px] leading-none" style={{ color: zoneCss(st.avgPct, avgTarget) }}>{Math.round(st.avgPct * 100)}</span>
              <span className="serif text-[24px] text-[#8f8577]">% / {zoneLabel}</span>
            </div>
            <div className="mono text-[11px] text-[#b5a993] mt-1 space-y-0.5">
              <div>spreiding ±{Math.round(st.spreadPct * 100)} · {Math.round(st.avgBpm)} bpm gem.</div>
              <div>{inZone}/10 in de zone · zwermstraal {st.radius.toFixed(1)} m</div>
              <div>sturing {perMin}/min · vanzelf {streakRef.current}s</div>
            </div>
          </div>
          <div className="pointer-events-none absolute left-5 bottom-4 max-w-[520px]">
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">opdracht · {PHASE_INFO[phase].label}</div>
            <div className="serif italic text-[22px] leading-tight text-[#efe5d3]">“{PHASE_INFO[phase].instructie}”</div>
          </div>
          <div className="pointer-events-none absolute right-4 top-4 mono text-[10px] text-[#8f8577] space-y-1 text-right">
            <div>
              <span style={{ color: zoneCss(0, 0.2) }}>●</span> onder · <span style={{ color: zoneCss(0.2, 0.2) }}>●</span> in zone · <span style={{ color: zoneCss(0.4, 0.2) }}>●</span> boven
            </div>
            <div>
              koptelefoon: {EAR_LAYERS.slice(1).map((l) => (
                <span key={l} className="ml-1" style={{ color: LAYER_HEX[l] }}>■ {l}</span>
              ))}
            </div>
            <div>stippellijn = waar de kamer de zwerm heen trekt</div>
          </div>
        </section>

        {/* dirigent */}
        <aside className="row-span-2 border-l border-white/[0.06] flex flex-col min-h-0">
          <div className="px-5 pt-4">
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">dirigent</div>
            <div className="seg mt-2 w-full">
              {(['hand', 'regelaar', 'claude'] as Mode[]).map((m) => (
                <button key={m} className={`flex-1 ${mode === m ? (m === 'claude' ? 'on claude' : 'on') : ''}`} onClick={() => setMode(m)}>
                  {m === 'hand' ? 'begeleider' : m}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[12px] text-[#b5a993]">
              <label className="flex items-center gap-2 flex-1">
                elke
                <input type="range" min={6} max={60} value={interval} onChange={(e) => setIntervalSec(+e.target.value)} className="flex-1" />
                <span className="mono w-7">{interval}s</span>
              </label>
              <label className="flex items-center gap-1" title="mag Claude nieuwe geluiden laten genereren (ElevenLabs)">
                <input type="checkbox" checked={allowGenerate} onChange={(e) => setAllowGenerate(e.target.checked)} /> genereren
              </label>
            </div>
            <button className="btn w-full mt-2" disabled={busy} onClick={askClaude}>{busy ? 'Claude luistert…' : 'vraag Claude nu'}</button>
            {error && <div className="mt-2 text-[12px] text-red-300">{error}</div>}
          </div>

          <div className="px-5 mt-5">
            <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">intentie</div>
            <div className={`serif italic text-[21px] leading-snug mt-1 min-h-[3.5em] ${busy ? 'text-[#c9a2ff] animate-pulse' : 'text-[#e6d7ff]'}`}>
              {latest ? `“${latest.text}”` : mode === 'claude' ? 'Claude luistert naar de kamer…' : 'Nog geen intentie. Kies claude om de kamer over te dragen.'}
            </div>
            {latest && <div className="mono text-[10px] text-[#8f8577] mt-1">{fmt(latest.t)}</div>}
          </div>

          <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577] px-5 mt-5">verloop</div>
          <div className="flex-1 overflow-auto px-5 pb-5 mt-1 space-y-1 scroll">
            {[...intents.slice(0, -1).map((i) => ({ t: i.t, intent: i.text })), ...log.map((l) => ({ t: l.t, l }))]
              .sort((a, b) => b.t - a.t)
              .slice(0, 80)
              .map((it, i) => (
                <div key={i} className="flex gap-2 text-[12px] leading-snug">
                  <span className="mono text-[10px] text-[#6f675c] w-9 shrink-0 pt-[2px]">{fmt(it.t)}</span>
                  {'intent' in it ? (
                    <span className="serif italic text-[14px] text-[#b9a6d8]">{it.intent}</span>
                  ) : (
                    <span className="flex gap-1.5">
                      <span style={{ color: SRC_HEX[it.l!.source] }}>●</span>
                      <span className="text-[#d8cebd]">{describe(it.l!.iv, names)}</span>
                    </span>
                  )}
                </div>
              ))}
          </div>
        </aside>

        {/* partituur */}
        <section className="border-t border-white/[0.06] min-h-0">
          <Score sim={sim} hist={histRef.current} log={log} phaseMarks={phaseMarks} targetPct={targetPct} selected={selected} onSelect={setSelected} />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2">
        <div className="serif text-[20px] leading-tight text-[#f1e7d6]">{title}</div>
        {hint && <div className="mono text-[9.5px] text-[#7d7467]">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function Range({ label, min, max, step = 1, value, onChange, fmtv }: { label: string; min: number; max: number; step?: number; value: number; onChange: (v: number) => void; fmtv?: (v: number) => string }) {
  return (
    <label className="flex items-center gap-2 text-[11.5px] mt-1.5">
      <span className="w-[70px] text-[#9c917f]">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className="flex-1" />
      <span className="mono w-10 text-right text-[11px]">{fmtv ? fmtv(value) : step < 1 ? value.toFixed(2) : Math.round(value)}</span>
    </label>
  );
}

const WALL_DEVICES: Record<Wall, DeviceId[]> = {
  noord: ['koffiemachine', 'waterkoker', 'magnetron'],
  west: ['vaatwasser', 'wasmachine'],
  zuid: ['robotstofzuiger'],
  oost: [],
};

function RoomPanel({ lab, apply, soundOn, genPrompt, setGenPrompt }: { lab: LabState; apply: (iv: Intervention2, s: Source) => void; soundOn: boolean; genPrompt: string; setGenPrompt: (s: string) => void }) {
  const r = lab.room;
  const dev = (d: DeviceId) => (
    <button key={d} onClick={() => apply({ kind: 'device', device: d, on: !r.devices[d] }, 'hand')} className={`chip ${r.devices[d] ? 'on' : ''}`}>
      {d}
    </button>
  );
  const focusBtn = (w: Wall, cls: string) => (
    <button
      onClick={() => apply({ kind: 'light', ...r.light, focus: r.light.focus === w ? null : w }, 'hand')}
      className={`absolute ${cls} mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${r.light.focus === w ? 'bg-[#e9c46a] text-[#1b150e]' : 'text-[#9c917f] hover:text-white'}`}
    >
      {w}
    </button>
  );
  return (
    <>
      <Section title="Plattegrond" hint="tik een wand om die op te laten lichten">
        <div className="relative aspect-square rounded-lg border border-white/10 bg-white/[0.02]">
          {focusBtn('noord', 'left-1/2 -translate-x-1/2 -top-2.5 bg-[#0e0c0a]')}
          {focusBtn('zuid', 'left-1/2 -translate-x-1/2 -bottom-2.5 bg-[#0e0c0a]')}
          {focusBtn('west', '-left-2 top-1/2 -translate-y-1/2 -rotate-90 bg-[#0e0c0a]')}
          {focusBtn('oost', '-right-2 top-1/2 -translate-y-1/2 rotate-90 bg-[#0e0c0a]')}
          {r.light.focus && (
            <div
              className="absolute bg-[#e9c46a]/70"
              style={
                r.light.focus === 'noord'
                  ? { left: 6, right: 6, top: 0, height: 3 }
                  : r.light.focus === 'zuid'
                    ? { left: 6, right: 6, bottom: 0, height: 3 }
                    : r.light.focus === 'west'
                      ? { top: 6, bottom: 6, left: 0, width: 3 }
                      : { top: 6, bottom: 6, right: 0, width: 3 }
              }
            />
          )}
          {DEVICES.map((d) => {
            const p = DEVICE_POS[d];
            return (
              <button
                key={d}
                onClick={() => apply({ kind: 'device', device: d, on: !r.devices[d] }, 'hand')}
                title={d}
                className={`absolute -translate-x-1/2 -translate-y-1/2 w-7 h-7 rounded-full mono text-[9px] border ${r.devices[d] ? 'bg-[#e9c46a] text-[#1b150e] border-[#e9c46a] shadow-[0_0_14px_#e9c46a]' : 'bg-[#1b1814] border-white/20 text-[#cbbfa9]'}`}
                style={{ left: `${(p.x / 8) * 100}%`, top: `${(Math.max(0.5, p.y) / 8) * 100}%` }}
              >
                {d.slice(0, 2)}
              </button>
            );
          })}
          <div className="absolute mono text-[9px] text-[#7d7467]" style={{ right: '6%', top: '36%' }}>radio</div>
          <div className="absolute mono text-[9px] text-[#7d7467]" style={{ right: '6%', top: '63%' }}>klok</div>
          <div className="absolute mono text-[9px] text-[#7d7467]" style={{ left: '37%', bottom: '4%' }}>deur</div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">{(Object.keys(WALL_DEVICES) as Wall[]).flatMap((w) => WALL_DEVICES[w].map(dev))}</div>
      </Section>

      <Section title="Wandklok" hint="tempo voor iedereen; koptelefoon dempt">
        <div className="flex gap-1.5 mb-1">
          <button className={`chip ${r.clock.bpm ? 'on' : ''}`} onClick={() => apply({ kind: 'clock', bpm: r.clock.bpm ? 0 : 60, volume: r.clock.volume }, 'hand')}>
            {r.clock.bpm ? `tikt ${Math.round(r.clock.bpm)}` : 'stil'}
          </button>
        </div>
        <Range label="tempo" min={30} max={180} value={r.clock.bpm || 60} onChange={(v) => apply({ kind: 'clock', bpm: v, volume: r.clock.volume }, 'hand')} />
        <Range label="volume" min={0} max={1} step={0.05} value={r.clock.volume} onChange={(v) => apply({ kind: 'clock', bpm: r.clock.bpm, volume: v }, 'hand')} />
      </Section>

      <Section title="Radio" hint="filmmuziek in de kamer">
        <div className="grid grid-cols-3 gap-1.5">
          {ROOM_MOODS.map((m) => (
            <button key={m} className={`chip ${r.radio.mood === m ? 'on' : ''}`} onClick={() => apply({ kind: 'radio', mood: m, intensity: r.radio.intensity }, 'hand')}>
              {MOOD_LABEL[m]}
            </button>
          ))}
        </div>
        <Range label="intensiteit" min={0} max={1} step={0.05} value={r.radio.intensity} onChange={(v) => apply({ kind: 'radio', mood: r.radio.mood, intensity: v }, 'hand')} />
      </Section>

      <Section title="Licht">
        <Range label="helderheid" min={0} max={1} step={0.05} value={r.light.brightness} onChange={(v) => apply({ kind: 'light', ...r.light, brightness: v }, 'hand')} fmtv={pc} />
        <Range label="warmte" min={0} max={1} step={0.05} value={r.light.warmth} onChange={(v) => apply({ kind: 'light', ...r.light, warmth: v }, 'hand')} fmtv={pc} />
      </Section>

      <Section title="Geluiden" hint="↑ schrikt op · ↓ maakt zacht">
        <div className="grid grid-cols-2 gap-1.5">
          {ROOM_SOUNDS.map((s) => (
            <button key={s} className="chip text-left" onClick={() => apply({ kind: 'sound', sound: s }, 'hand')}>
              {SOUND_LABEL[s]} <span className="float-right opacity-50">{SOUND_IMPULSE[s] > 0 ? '↑' : '↓'}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 mt-2">
          <input value={genPrompt} onChange={(e) => setGenPrompt(e.target.value)} className="flex-1 min-w-0 rounded-md bg-white/[0.04] border border-white/10 px-2 py-1 text-[12px]" placeholder="ElevenLabs: beschrijf een geluid" />
          <button className="btn" disabled={!soundOn} onClick={() => apply({ kind: 'generate_sound', description: genPrompt }, 'hand')}>▶</button>
        </div>
      </Section>
    </>
  );
}

function EarsPanel(props: {
  sim: Sim2;
  lab: LabState;
  selected: string | null;
  setSelected: (id: string | null) => void;
  apply: (iv: Intervention2, s: Source) => void;
  targetPct: (p: Person2) => number;
  showProfiles: boolean;
  setShowProfiles: (b: boolean) => void;
  listening: boolean;
  setListening: (b: boolean) => void;
  connectStrap: (id: string) => void;
  getEar: (id: string) => Ear;
}) {
  const { getEar, sim, lab, selected, setSelected, apply, targetPct, showProfiles, setShowProfiles, listening, setListening, connectStrap } = props;
  const p = sim.persons.find((x) => x.id === selected);
  const ear = p ? lab.ears[p.id] : null;
  const setEar = (patch: Partial<Ear>) => p && apply({ kind: 'ear', person: p.id, ear: { ...getEar(p.id), ...patch } }, 'hand');
  return (
    <>
      {p && ear ? (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="flex items-baseline justify-between">
            <div className="serif text-[26px] leading-none">{p.name}</div>
            <button className="mono text-[10px] text-[#9c917f]" onClick={() => setSelected(null)}>sluit ×</button>
          </div>
          <div className="mono text-[10.5px] text-[#9c917f] mt-1">
            {showProfiles ? (
              <span className="text-[#e9c46a]">{p.profile.label}: {p.profile.beschrijving}</span>
            ) : (
              <button onClick={() => setShowProfiles(true)} className="underline decoration-dotted">verborgen profiel tonen</button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3 text-center">
            {[
              ['rust', p.restMeasured ? Math.round(p.restMeasured) : '…', p.restMeasured ? 'gemeten' : 'meten'],
              ['max', Math.round(p.max), 'geschat'],
              ['doel', Math.round((p.restMeasured ?? p.rest) + targetPct(p) * (p.max - (p.restMeasured ?? p.rest))), pc(targetPct(p))],
              ['nu', Math.round(p.hr), pc(sim.pct(p))],
            ].map(([k, v, s]) => (
              <div key={k as string}>
                <div className="mono text-[9px] uppercase tracking-wider text-[#7d7467]">{k}</div>
                <div className="serif text-[24px] leading-none" style={k === 'nu' ? { color: zoneCss(sim.pct(p), targetPct(p)) } : undefined}>{v}</div>
                <div className="mono text-[9px] text-[#7d7467]">{s}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">in het oor</div>
          <div className="flex gap-1.5 mt-1.5">
            <button className={`chip ${ear.tempo ? 'on' : ''}`} onClick={() => setEar({ tempo: ear.tempo ? 0 : Math.round(Math.max(60, p.cadence)) })}>
              {ear.tempo ? `tik ${Math.round(ear.tempo)}` : 'geen tik'}
            </button>
            <button className={`chip ${ear.mirror !== null ? 'on' : ''}`} onClick={() => setEar({ mirror: ear.mirror === null ? 0 : null })}>
              {ear.mirror === null ? 'spiegel uit' : `spiegel ${ear.mirror > 0 ? '+' : ''}${Math.round(ear.mirror)}`}
            </button>
          </div>
          <Range label="tempo" min={40} max={170} value={ear.tempo || 80} onChange={(v) => setEar({ tempo: v })} />
          <Range label="spiegel" min={-20} max={20} value={ear.mirror ?? 0} onChange={(v) => setEar({ mirror: v })} fmtv={(v) => `${v > 0 ? '+' : ''}${v}`} />
          <Range label="volume" min={0} max={1} step={0.05} value={ear.volume} onChange={(v) => setEar({ volume: v })} fmtv={pc} />
          <div className="grid grid-cols-4 gap-1 mt-2">
            {EAR_LAYERS.map((l) => (
              <button key={l} className={`chip !px-1 ${ear.layer === l ? 'on' : ''}`} style={ear.layer === l ? { background: LAYER_HEX[l], borderColor: LAYER_HEX[l] } : undefined} onClick={() => setEar({ layer: l })}>
                {l}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 mt-3">
            <button className={`btn flex-1 ${listening ? 'accent' : ''}`} onClick={() => setListening(!listening)}>{listening ? '🎧 luistert mee' : '🎧 luister mee'}</button>
            <button className="btn" onClick={() => connectStrap(p.id)} title="koppel een echte hartslagband aan deze persoon">♥ band</button>
          </div>
        </div>
      ) : (
        <div className="serif italic text-[16px] text-[#9c917f]">Kies iemand in de kamer of hieronder. Alleen die persoon hoort wat je in het oor zet.</div>
      )}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <div className="mono text-[10px] tracking-[0.2em] uppercase text-[#8f8577]">tien oren</div>
          <label className="mono text-[10px] text-[#8f8577] flex items-center gap-1">
            <input type="checkbox" checked={showProfiles} onChange={(e) => setShowProfiles(e.target.checked)} /> profielen
          </label>
        </div>
        <div className="space-y-1">
          {sim.persons.map((q) => {
            const e = lab.ears[q.id];
            const pct = sim.pct(q);
            const tp = targetPct(q);
            return (
              <button key={q.id} onClick={() => setSelected(q.id)} className={`w-full flex items-center gap-2 rounded-md px-2 py-1.5 text-left ${selected === q.id ? 'bg-white/[0.08]' : 'hover:bg-white/[0.04]'}`}>
                <span className="w-[54px] text-[12px] truncate">{q.real ? '♥ ' : ''}{q.name}</span>
                <span className="relative flex-1 h-[6px] rounded-full bg-white/[0.06]">
                  <span className="absolute top-[-3px] bottom-[-3px] w-px bg-white/40" style={{ left: `${Math.min(100, tp * 160)}%` }} />
                  <span className="absolute top-0 bottom-0 left-0 rounded-full" style={{ width: `${Math.max(2, Math.min(100, pct * 160))}%`, background: zoneCss(pct, tp) }} />
                </span>
                <span className="mono text-[10.5px] w-8 text-right">{pc(pct)}</span>
                <span className="w-3 h-3 rounded-full border" style={{ borderColor: earActive(e) ? LAYER_HEX[e.layer] : '#3a362f', background: earActive(e) && e.layer !== 'stil' ? LAYER_HEX[e.layer] : 'transparent' }} title={earActive(e) ? 'iets in het oor' : 'oor stil'} />
                {showProfiles && <span className="mono text-[9px] text-[#e9c46a] w-[62px] truncate">{q.profile.label}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function Score({ sim, hist, log, phaseMarks, targetPct, selected, onSelect }: { sim: Sim2; hist: { t: number; pcts: number[] }[]; log: Logged2[]; phaseMarks: { t: number; phase: Phase }[]; targetPct: (p: Person2) => number; selected: string | null; onSelect: (id: string) => void }) {
  const W = 1000;
  const top = 18;
  const rowH = 21;
  const H = top + rowH * 10 + 4;
  const left = 70;
  const span = 240;
  const t0 = Math.max(0, sim.t - span);
  const x = (t: number) => left + ((t - t0) / span) * (W - left - 8);
  const vis = hist.filter((h) => h.t >= t0);
  const idx = Object.fromEntries(sim.persons.map((p, i) => [p.id, i]));
  return (
    <div className="h-full flex flex-col px-4 pt-2">
      <div className="flex items-baseline gap-4">
        <div className="serif text-[20px] text-[#f1e7d6] shrink-0">Hartslagpartituur</div>
        <div className="mono text-[9.5px] text-[#7d7467] truncate">één balk per lichaam · middenlijn = eigen doel · ● = oor · | = kamer · 4 min</div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full flex-1 min-h-0">
        {phaseMarks
          .filter((m) => m.t >= t0)
          .map((m, i) => (
            <g key={i}>
              <line x1={x(m.t)} x2={x(m.t)} y1={0} y2={H} stroke="#ffffff25" strokeDasharray="2 3" />
              <text x={x(m.t) + 3} y={10} fontSize={9} fill="#8f8577" fontFamily="IBM Plex Mono">{PHASE_INFO[m.phase].label.toLowerCase()}</text>
            </g>
          ))}
        {log
          .filter((l) => l.t >= t0 && l.iv.kind !== 'ear')
          .map((l, i) => (
            <line key={i} x1={x(l.t)} x2={x(l.t)} y1={top - 4} y2={H} stroke={SRC_HEX[l.source]} strokeOpacity={0.35} />
          ))}
        {sim.persons.map((p, i) => {
          const y0 = top + i * rowH + rowH / 2;
          const tp = targetPct(p);
          const k = rowH / 2 / 0.15; // ±15 pt vult de balk
          const path = vis.map((h, j) => `${j ? 'L' : 'M'}${x(h.t).toFixed(1)},${(y0 - Math.max(-0.15, Math.min(0.15, h.pcts[i] - tp)) * k).toFixed(1)}`).join('');
          const cur = sim.pct(p);
          return (
            <g key={p.id} onClick={() => onSelect(p.id)} style={{ cursor: 'pointer' }}>
              <rect x={0} y={y0 - rowH / 2} width={W} height={rowH} fill={selected === p.id ? '#ffffff0d' : i % 2 ? '#ffffff04' : 'transparent'} />
              <rect x={left} y={y0 - 0.05 * k} width={W - left - 8} height={0.1 * k} fill="#e9c46a" opacity={0.06} />
              <line x1={left} x2={W - 8} y1={y0} y2={y0} stroke="#e9c46a" strokeOpacity={0.25} />
              <text x={6} y={y0 + 3.5} fontSize={11} fill={selected === p.id ? '#fff' : '#cbbfa9'} fontFamily="Inter">{p.name}</text>
              <text x={left - 6} y={y0 + 3.5} fontSize={9} fill={zoneCss(cur, tp)} textAnchor="end" fontFamily="IBM Plex Mono">{Math.round(cur * 100)}</text>
              <path d={path} fill="none" stroke={zoneCss(cur, tp)} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
            </g>
          );
        })}
        {log
          .filter((l) => l.t >= t0 && l.iv.kind === 'ear')
          .map((l, i) => {
            const iv = l.iv as Extract<Intervention2, { kind: 'ear' }>;
            const y0 = top + (idx[iv.person] ?? 0) * rowH + rowH / 2;
            return <circle key={i} cx={x(l.t)} cy={y0} r={3.6} fill={LAYER_HEX[iv.ear.layer]} stroke={SRC_HEX[l.source]} strokeWidth={1.4} />;
          })}
      </svg>
    </div>
  );
}

function Concept({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute z-20 left-5 top-[70px] w-[560px] max-w-[calc(100vw-40px)] rounded-xl border border-white/10 bg-[#15120f]/95 backdrop-blur p-5 shadow-2xl">
      <div className="flex justify-between items-baseline">
        <div className="serif text-[26px]">Over dit prototype</div>
        <button className="mono text-[11px] text-[#9c917f]" onClick={onClose}>sluit ×</button>
      </div>
      <div className="text-[13px] leading-relaxed text-[#d8cebd] space-y-2 mt-2">
        <p>Tien mensen bewegen als één zwerm door een lege kamer, zonder woorden. Hun hartslag is het signaal. Een AI kan alleen via dingen ingrijpen: apparaten aan de wanden, licht, een radio, een klok, en een koptelefoon per persoon.</p>
        <p><b>Van getal naar zone.</b> In de aankomstfase meten we ieders rust. Het doel is daarna een % van de persoonlijke hartslagreserve. Dezelfde staat voor iedereen, niet hetzelfde getal.</p>
        <p><b>Kamer en oor.</b> De kamer is gedeeld en trekt de zwerm een richting op. Het oor is privé: tempo, klankkleur en een hartslagspiegel. De zwerm koppelt de twee. Wie in het oor versnelt, trekt zijn buren mee.</p>
        <p><b>Verborgen profielen.</b> Iedereen reageert anders (tempovolger, paradox, schrikker, leider…). De dirigent moet dat afleiden uit de reacties, net als in het echt.</p>
        <p><b>Lummel-ideaal.</b> We meten ook hoeveel er gestuurd wordt en hoe lang de groep vanzelf in de zone blijft. Een goede kamer maakt de dirigent overbodig.</p>
        <p className="mono text-[10.5px] text-[#8f8577]">Volledige tekst: huiskamer-v2-concept.md</p>
      </div>
    </div>
  );
}

const CSS = `
.kl .serif { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; }
.kl .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
.kl input[type=range] { accent-color: #e9c46a; height: 14px; }
.kl .btn { font-size: 12px; padding: 5px 10px; border-radius: 8px; background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.08); color: #ebe3d5; }
.kl .btn:hover { background: rgba(255,255,255,.1); }
.kl .btn:disabled { opacity: .45; }
.kl .btn.accent { background: #e9c46a; color: #1b150e; border-color: #e9c46a; font-weight: 500; }
.kl .seg { display: inline-flex; padding: 2px; border-radius: 9px; background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.07); }
.kl .seg button { font-size: 12px; padding: 4px 9px; border-radius: 7px; color: #b5a993; white-space: nowrap; }
.kl .seg button:hover { color: #fff; }
.kl .seg button.on { background: #e9c46a; color: #1b150e; font-weight: 500; }
.kl .seg button.on.claude { background: #c9a2ff; }
.kl .phase { font-size: 13px; padding: 6px 12px; color: #8f8577; border-bottom: 2px solid transparent; }
.kl .phase:hover { color: #ebe3d5; }
.kl .phase.on { color: #f5ecdc; border-color: #e9c46a; }
.kl .tab { padding-bottom: 6px; color: #8f8577; border-bottom: 2px solid transparent; font-family: 'Instrument Serif', serif; font-size: 20px; }
.kl .tab.on { color: #f5ecdc; border-color: #e9c46a; }
.kl .chip { font-size: 12px; padding: 6px 9px; border-radius: 8px; background: rgba(255,255,255,.035); border: 1px solid rgba(255,255,255,.08); color: #d8cebd; }
.kl .chip:hover { background: rgba(255,255,255,.08); }
.kl .chip.on { background: #e9c46a; border-color: #e9c46a; color: #1b150e; font-weight: 500; }
.kl .scroll::-webkit-scrollbar { width: 6px; }
.kl .scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 3px; }
.kl-label { font: 500 10.5px Inter, system-ui, sans-serif; color: #f1e7d6; background: rgba(14,12,10,.55); padding: 1px 6px; border-radius: 99px; white-space: nowrap; transform: translateY(-4px); }
.kl-label b { font-family: 'IBM Plex Mono', monospace; font-weight: 500; color: #e9c46a; margin-left: 3px; }
.kl-label b:only-child { margin-left: 0; }
`;
