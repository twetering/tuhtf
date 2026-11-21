import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Drive } from '../Digitaal';
import { bufferen } from './bufferen';
import { nadenken } from './nadenken';
import { opschonen } from './opschonen';
import { opwarmen } from './opwarmen';
import { Stage, type Mashup as M } from './stage';

export type MashupKind = 'opwarmen' | 'opschonen' | 'nadenken' | 'bufferen';
const BUILD: Record<MashupKind, (st: Stage) => M> = { opwarmen, opschonen, nadenken, bufferen };

/**
 * Eén 3D-mashup, aangedreven door de hartslag (Drive.beat). Adem stuurt niets aan; die wordt
 * alleen gemeten voor het experiment. Fullscreen via de knop of de f-toets, voor schermen in de expo.
 * Toelichting staat achter het i-icoon, zodat het beeld zelf leeg blijft.
 */
export default function Mashup({ kind, d, soundOn, info }: { kind: MashupKind; d: Drive; soundOn: boolean; info?: React.ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const dRef = useRef(d);
  useLayoutEffect(() => {
    dRef.current = d;
  });
  const mRef = useRef<M | null>(null);
  const [status, setStatus] = useState('');
  const [fout, setFout] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [full, setFull] = useState(false);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    const canvas = ref.current!;
    let st: Stage;
    let m: M;
    try {
      st = new Stage(canvas);
      m = BUILD[kind](st);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      queueMicrotask(() => setFout(msg)); // WebGL niet beschikbaar
      return;
    }
    mRef.current = m;
    const fit = () => st.resize(canvas.clientWidth, canvas.clientHeight);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    let raf = 0;
    let last = performance.now();
    let lastStatus = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const t = now / 1000;
      m.update(dRef.current, t, dt);
      // ook de camera loopt op de hartslag: heel traag in en uit, één keer per 14 slagen
      const beat = dRef.current.beat;
      st.render(0.5 - 0.5 * Math.cos((beat / 14) * Math.PI * 2), beat);
      if (now - lastStatus > 250) {
        lastStatus = now;
        setStatus(m.status());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      m.setSound(false);
      m.dispose();
      st.dispose();
      mRef.current = null;
    };
  }, [kind]);

  useEffect(() => {
    mRef.current?.setSound(soundOn);
  }, [soundOn, kind]);

  // fullscreen: knop, f-toets; knoppen en cursor verdwijnen na 2,5 s stilstand
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen();
  };
  useEffect(() => {
    const onFs = () => setFull(document.fullscreenElement === box.current);
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (e.key === 'f' && tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') toggleFull();
    };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, []);
  const idleTimer = useRef(0);
  const wake = () => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => () => clearTimeout(idleTimer.current), []);
  const hide = full && idle && !showInfo;

  const btn = 'w-8 h-8 grid place-items-center rounded-full text-white transition-opacity';
  return (
    <div ref={box} className="absolute inset-0 bg-black" style={{ cursor: hide ? 'none' : undefined }} onMouseMove={wake}>
      <canvas ref={ref} className="w-full h-full block" />
      {fout && <div className="absolute inset-0 grid place-items-center mono text-[12px] p-6 text-center text-white">3D lukt niet in deze browser: {fout}</div>}
      <div className={`absolute right-3 top-3 flex gap-2 ${hide ? 'opacity-0' : 'opacity-100'} transition-opacity duration-700`}>
        <button className={btn} style={{ background: showInfo ? 'rgba(255,255,255,.28)' : 'rgba(0,0,0,.38)' }} onClick={() => setShowInfo(!showInfo)} title="toelichting" aria-label="toelichting">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4"><circle cx="8" cy="8" r="6.6" /><path d="M8 7.2v4.2" strokeLinecap="round" /><circle cx="8" cy="4.9" r=".55" fill="currentColor" stroke="none" /></svg>
        </button>
        <button className={btn} style={{ background: 'rgba(0,0,0,.38)' }} onClick={toggleFull} title={full ? 'scherm verlaten (f)' : 'volledig scherm (f)'} aria-label="volledig scherm">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            {full ? <path d="M6 2.5V6H2.5M10 2.5V6h3.5M6 13.5V10H2.5M10 13.5V10h3.5" /> : <path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" />}
          </svg>
        </button>
      </div>
      {showInfo && (
        <div className="absolute right-3 top-14 w-[min(340px,calc(100%-24px))] p-4 text-[12.5px] leading-[1.5] text-white space-y-2" style={{ background: 'rgba(12,12,12,.72)', backdropFilter: 'blur(8px)' }}>
          {info}
          <div className="mono text-[11px] opacity-70">{status}</div>
        </div>
      )}
    </div>
  );
}
