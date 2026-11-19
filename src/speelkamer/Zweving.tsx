import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { Drone, chime } from './sound';
import { BodyDot, Label, Seg, sourceMark, useFrame, Uitleg } from './ui';

/**
 * Zweving: ieder hart is een toon. 1 bpm verschil = 1 Hz zweving.
 * Dicht bij elkaar: een langzaam 'wawawa' dat verdwijnt. Ver uit elkaar: ruw, schurend.
 */
type Mode = 'samen' | 'kwartet' | 'koor' | 'afstoten';
const MODES: Record<Mode, { n: number | 'all'; titel: string; regel: string; doel: string }> = {
  samen: { n: 2, titel: 'Samen één toon', regel: 'Twee harten, twee tonen. Hoe verder jullie uit elkaar liggen, hoe sneller het geluid golft. Kom samen tot één toon.', doel: 'zweving onder 0,7 Hz' },
  kwartet: { n: 4, titel: 'Kwartet', regel: 'Vier harten, zes zwevingen tegelijk. Het akkoord schuurt tot iedereen dezelfde toon vindt. Wie wacht op wie?', doel: 'alle vier binnen 1,5 bpm' },
  koor: { n: 'all', titel: 'Koor', regel: 'Iedereen in de ruimte klinkt. Een wolk van tonen die alleen helder wordt als de hele groep samenvalt.', doel: 'hele groep binnen 3 bpm' },
  afstoten: { n: 3, titel: 'Afstoten', regel: 'Omgekeerd. Kom je in de buurt van iemands hart, dan begint het te zoemen en te schuren. Blijf uit elkaars buurt, zonder af te spreken wie hoog gaat en wie laag.', doel: 'alle harten minstens 6 bpm uit elkaar' },
};
const toneFor = (hr: number) => 220 + (hr - 60);
const DANGER = 6; // bpm: binnen deze afstand gaat het schuren (afstoten)

export default function Zweving({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [mode, setMode] = useState<Mode>('samen');
  const [picked, setPicked] = useState<string[]>([]);
  const [on, setOn] = useState(false);
  const [simHelp, setSimHelp] = useState(false);
  const [held, setHeld] = useState(0); // seconden dat het doel gehaald wordt
  const [record, setRecord] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const sm = useRef<Record<string, number>>({});
  const drones = useRef<Record<string, Drone>>({});
  const buzz = useRef<Drone | null>(null);

  const want = MODES[mode].n === 'all' ? hub.bodies.length : (MODES[mode].n as number);
  // aanvullen of inkorten tot het gewenste aantal
  const valid = picked.filter((id) => hub.get(id));
  const ids = [...valid, ...hub.bodies.map((b) => b.id).filter((id) => !valid.includes(id))].slice(0, want);
  const bodies = ids.map((id) => hub.get(id)!).filter(Boolean);
  for (const b of bodies) sm.current[b.id] = (sm.current[b.id] ?? b.hr) + (b.hr - (sm.current[b.id] ?? b.hr)) * 0.06;
  const hrs = bodies.map((b) => sm.current[b.id]);
  const spread = hrs.length ? Math.max(...hrs) - Math.min(...hrs) : 0;
  let minDist = Infinity;
  for (let i = 0; i < hrs.length; i++) for (let j = i + 1; j < hrs.length; j++) minDist = Math.min(minDist, Math.abs(hrs[i] - hrs[j]));
  if (!isFinite(minDist)) minDist = 0;
  const goal = mode === 'samen' ? spread < 0.7 : mode === 'kwartet' ? spread < 1.5 : mode === 'koor' ? spread < 3 : minDist >= DANGER;
  const closeness = mode === 'afstoten' ? Math.max(0, 1 - minDist / DANGER) : 0;

  // geluid: één drone per hart, verdeeld over het stereobeeld
  const key = ids.join(',') + mode;
  useEffect(() => {
    if (!on) return;
    const n = ids.length;
    ids.forEach((id, i) => {
      const pan = n === 1 ? 0 : -0.8 + (1.6 * i) / (n - 1);
      drones.current[id] = new Drone(toneFor(sm.current[id] ?? 70), mode === 'koor' ? 0.5 / n : mode === 'afstoten' ? 0.05 : 0.11, pan, mode === 'afstoten' ? 'sawtooth' : 'sine');
    });
    if (mode === 'afstoten') buzz.current = new Drone(55, 0.0001, 0, 'square');
    return () => {
      Object.values(drones.current).forEach((d) => d.stop());
      drones.current = {};
      buzz.current?.stop();
      buzz.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, key]);
  for (const b of bodies) drones.current[b.id]?.set(toneFor(sm.current[b.id]));
  if (mode === 'afstoten') {
    for (const b of bodies) drones.current[b.id]?.volume(0.015 + closeness * 0.09);
    buzz.current?.volume(closeness * closeness * 0.06);
    buzz.current?.set(48 + closeness * 30);
  }

  // doel vasthouden
  useEffect(() => setHeld(0), [key]);
  useEffect(() => {
    const id = window.setInterval(() => setHeld((h) => (goalRef.current ? h + 0.25 : 0)), 250);
    return () => clearInterval(id);
  }, []);
  const goalRef = useRef(goal);
  goalRef.current = goal;
  useEffect(() => {
    if (held === 10) chime(true);
    if (held > record) setRecord(held);
  }, [held, record]);

  // simulatie-hulp: samen = naar het gemiddelde trekken, afstoten = elk een eigen plek
  useEffect(() => {
    const id = window.setInterval(() => {
      const mean = bodies.reduce((s, b) => s + b.hr, 0) / Math.max(1, bodies.length);
      const order = [...bodies].sort((a, b) => a.hr - b.hr);
      for (const b of bodies) {
        if (!b.sim) continue;
        if (!simHelp) Object.assign(b.sim, { pull: null, pullStrength: 0, breathPull: null });
        else if (mode === 'afstoten') {
          const rank = order.indexOf(b);
          Object.assign(b.sim, { pull: mean + (rank - (order.length - 1) / 2) * 9, pullStrength: 0.4, breathPull: null });
        } else {
          Object.assign(b.sim, { pull: mean, pullStrength: 0.45, breathPull: bodies[0] === b ? null : bodies[0].acc.breathPhase, breathRate: 7 });
        }
      }
    }, 200);
    return () => {
      clearInterval(id);
      bodies.forEach((b) => b.sim && Object.assign(b.sim, { pull: null, pullStrength: 0, breathPull: null }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simHelp, key]);

  // beeld: elk hart een snaar op zijn eigen hoogte; tussen buren trilt de zweving
  const live = useRef({ bodies, mode });
  live.current = { bodies, mode };
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) {
        const css = getComputedStyle(c);
        const ink = css.getPropertyValue('--sk-ink').trim() || '#fff';
        const acc = css.getPropertyValue('--sk-adem').trim() || '#ffffff';
        const g = c.getContext('2d')!;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const W = (c.width = c.clientWidth * dpr);
        const H = (c.height = c.clientHeight * dpr);
        g.clearRect(0, 0, W, H);
        const t = performance.now() / 1000;
        const { bodies: bs, mode: md } = live.current;
        const hs = bs.map((b) => sm.current[b.id] ?? b.hr);
        const mean = hs.reduce((s, x) => s + x, 0) / Math.max(1, hs.length);
        const range = Math.max(14, (Math.max(...hs) - Math.min(...hs)) * 0.6 + 8);
        const y = (hr: number) => H / 2 - ((hr - mean) / range) * (H * 0.42);
        // raster
        g.strokeStyle = ink;
        g.globalAlpha = 0.12;
        g.lineWidth = dpr;
        for (let v = Math.ceil(mean - range); v <= mean + range; v++) {
          if (v % 5) continue;
          g.beginPath();
          g.moveTo(0, y(v));
          g.lineTo(W, y(v));
          g.stroke();
          g.fillStyle = ink;
          g.font = `${10 * dpr}px "Geist Mono", monospace`;
          g.fillText(String(v), 6 * dpr, y(v) - 4 * dpr);
        }
        g.globalAlpha = 1;
        const sorted = bs.map((b, i) => ({ b, hr: hs[i] })).sort((a, b) => a.hr - b.hr);
        // zweving tussen buren (of in afstoten: alle paren binnen gevarenzone)
        for (let i = 0; i < sorted.length; i++) {
          for (let j = i + 1; j < sorted.length; j++) {
            const d = Math.abs(sorted[i].hr - sorted[j].hr);
            const neighbour = j === i + 1;
            if (md !== 'afstoten' && !neighbour) continue;
            if (md === 'afstoten' && d > DANGER * 1.5) continue;
            const y1 = y(sorted[i].hr);
            const y2 = y(sorted[j].hr);
            const env = Math.abs(Math.cos(t * Math.PI * d));
            const danger = md === 'afstoten' ? Math.max(0, 1 - d / DANGER) : 0;
            g.beginPath();
            for (let x = 0; x <= W; x += 3 * dpr) {
              const ph = (x / W) * Math.PI * 2 * (3 + d * 0.8) - t * (2 + d * 2);
              const mid = (y1 + y2) / 2 + Math.sin(ph) * (Math.abs(y2 - y1) / 2 + 2 * dpr) * env;
              if (x) g.lineTo(x, mid);
              else g.moveTo(x, mid);
            }
            g.strokeStyle = acc;
            g.globalAlpha = md === 'afstoten' ? 0.3 + danger * 0.7 : 0.8;
            g.lineWidth = (md === 'afstoten' ? 1.5 + danger * 5 : 2.2) * dpr;
            g.stroke();
            g.globalAlpha = 1;
          }
        }
        // snaren
        sorted.forEach(({ b, hr }) => {
          const yy = y(hr);
          const col = `hsl(${b.hue} 80% ${md === 'afstoten' ? 60 : 62}%)`;
          g.beginPath();
          const amp = 3 * dpr;
          for (let x = 0; x <= W; x += 3 * dpr) {
            const v = yy + Math.sin((x / W) * Math.PI * 2 * 9 - t * toneFor(hr) * 0.04) * amp;
            if (x) g.lineTo(x, v);
            else g.moveTo(x, v);
          }
          g.strokeStyle = ink;
          g.lineWidth = 2.5 * dpr;
          g.stroke();
          g.fillStyle = col;
          g.beginPath();
          g.arc(W - 16 * dpr, yy, 7 * dpr, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = ink;
          g.font = `500 ${13 * dpr}px Geist, sans-serif`;
          g.textAlign = 'right';
          g.fillText(`${b.name}  ${Math.round(hr)}`, W - 30 * dpr, yy - 9 * dpr);
          g.textAlign = 'left';
        });
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggle = (id: string) => {
    if (MODES[mode].n === 'all') return;
    setPicked(() => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids.slice(-(want - 1)), id]));
  };
  const big =
    mode === 'afstoten'
      ? { v: minDist.toFixed(1), u: 'bpm', l: 'kleinste afstand' }
      : mode === 'samen'
        ? { v: spread.toFixed(1), u: 'Hz', l: 'zweving' }
        : { v: spread.toFixed(1), u: 'bpm', l: 'verschil hoogste en laagste' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Seg value={mode} options={['samen', 'kwartet', 'koor', 'afstoten'] as const} onChange={setMode} labels={{ samen: 'samen · 2', kwartet: 'kwartet · 4', koor: 'koor · allen', afstoten: 'afstoten' }} />
        <div className="flex gap-2">
          <button className={`btn big ${on ? '' : 'accent'}`} onClick={() => setOn(!on)}>{on ? '■ stil' : '▶ laat klinken'}</button>
          {bodies.some((b) => b.sim) && (
            <button className={`btn ${simHelp ? 'accent' : ''}`} onClick={() => setSimHelp(!simHelp)}>{mode === 'afstoten' ? 'sim: wijk uit' : 'sim: adem samen'}</button>
          )}
        </div>
      </div>

      <div>
        <h2 className="display text-[clamp(30px,3.4vw,52px)]">{MODES[mode].titel}</h2>
        <Uitleg title={MODES[mode].titel}>
          <p>{MODES[mode].regel}</p>
          <p>Doel: {MODES[mode].doel}.</p>
        </Uitleg>
        <Uitleg title="Zo klinkt het">
          <p>Ieder hart is een toon: 1 bpm verschil is 1 Hz zweving. Dicht bij elkaar hoor je een langzaam golven dat verdwijnt; ver uit elkaar wordt het ruw en schurend.</p>
        </Uitleg>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="card p-0 overflow-hidden">
          <canvas ref={canvas} className="w-full h-[min(56vh,520px)] block" />
        </div>
        <div className="space-y-5">
          <div>
            <Label>{big.l}</Label>
            <div className={`display text-[96px] leading-[0.9] tabular-nums ${goal ? 'text-acc' : ''}`}>
              {big.v}
              <span className="text-[28px] ml-2 text-ink-3">{big.u}</span>
            </div>
            
            <div className={`mt-3 text-[15px] ${goal ? 'text-acc' : 'text-ink-3'}`}>{goal ? `gehaald, ${held.toFixed(0)} s` : mode === 'afstoten' && closeness > 0 ? 'te dichtbij: het schuurt' : 'nog niet'}</div>
            {record >= 1 && <div className="mono text-[11px] text-ink-4 mt-1">langst deze ronde: {record.toFixed(0)} s</div>}
          </div>
          <div>
            <Label>{MODES[mode].n === 'all' ? 'iedereen klinkt' : `kies ${want} lichamen`}</Label>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {hub.bodies.map((b: Body) => (
                <button key={b.id} onClick={() => toggle(b.id)} className={`chip ${ids.includes(b.id) ? 'on' : ''}`}>
                  <BodyDot b={b} size={8} /> {sourceMark(b)} {b.name}
                </button>
              ))}
            </div>
          </div>
<Uitleg title="Tip">          <p>
            {mode === 'afstoten'
              ? 'Tip: wie omhoog wil, beweegt of spant aan; wie omlaag wil, ademt lang uit. Maar je weet niet wat de ander kiest.'
              : 'Tip: koptelefoon of goede speakers. Adem samen langzaam; de snelste vertraagt, de traagste beweegt een beetje. Het lukt zelden lang, en dat is goed om te voelen.'}
          </p></Uitleg>
        </div>
      </div>
    </div>
  );
}
