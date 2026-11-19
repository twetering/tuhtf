import { createContext, useContext, useEffect, useReducer, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { Body, BodyHub, Signal } from './bodies';

/**
 * Uitleg hoort niet in beeld. <Uitleg> plaatst zijn inhoud in het info-paneel van de werkvorm
 * (geopend met de ⓘ naast de titel). Zo blijven data en ervaring centraal.
 */
const InfoTarget = createContext<HTMLElement | null>(null);
export const InfoProvider = InfoTarget.Provider;
export function Uitleg({ title, children }: { title?: string; children: React.ReactNode }) {
  const el = useContext(InfoTarget);
  if (!el) return null;
  return createPortal(
    <section className="info-sec">
      {title && <h3>{title}</h3>}
      <div className="info-body">{children}</div>
    </section>,
    el,
  );
}

/** Re-render met vaste frequentie (de lichamen leven buiten React). */
export function useFrame(hz = 10) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(force, 1000 / hz);
    return () => clearInterval(id);
  }, [hz]);
}

/** Abonneer op slagen/stappen/ademhalingen. */
export function useEvents(hub: BodyHub, fn: (id: string, s: Signal, t: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const off = hub.on((id, s, t) => ref.current(id, s, t));
    return () => {
      off();
    };
  }, [hub]);
}

export function Section({ title, hint, children, className = '' }: { title: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2">
        <div className="text-[19px] font-medium leading-tight text-ink">{title}</div>
        {hint && <div className="mono text-[10px] text-ink-4 mt-0.5">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function Seg<T extends string | number>({ value, options, onChange, labels }: { value: T; options: readonly T[]; onChange: (v: T) => void; labels?: Partial<Record<T, string>> }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o)} className={value === o ? 'on' : ''} onClick={() => onChange(o)}>
          {labels?.[o] ?? String(o)}
        </button>
      ))}
    </div>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <div className="mono text-[10px] tracking-[0.2em] uppercase text-ink-3">{children}</div>;
}

export function Big({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className="serif text-[56px] leading-none" style={{ color }}>
      {children}
    </div>
  );
}

export function BodyDot({ b, size = 10 }: { b: Body; size?: number }) {
  return <span className="inline-block rounded-full shrink-0" style={{ width: size, height: size, background: `hsl(${b.hue} 60% 62%)` }} />;
}

export function sourceMark(b: Body) {
  return b.extra?.device === 'm5' ? '▣' : b.source === 'band' ? (b.extra?.device === 'rsc' ? '♥↯' : '♥') : b.source === 'kanaal' ? '📱' : '';
}

/** Analoge wandklok. `ticks` = aantal gebeurtenissen; de secondewijzer springt één streep per gebeurtenis. */
export function ClockFace({ ticks, size = 320, accent = 'var(--sk-clock, #e236d9)', minute = true, label }: { ticks: number; size?: number; accent?: string; minute?: boolean; label?: React.ReactNode }) {
  const sec = (ticks % 60) * 6;
  const min = ((ticks / 60) % 60) * 6;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="-110 -110 220 220" width={size} height={size}>
        <circle r={104} fill="#f3ede1" stroke="#2a221b" strokeWidth={5} />
        <circle r={98} fill="none" stroke="#d9cfbf" strokeWidth={1} />
        {Array.from({ length: 60 }, (_, i) => (
          <line key={i} x1={0} y1={-92} x2={0} y2={i % 5 ? -86 : -76} stroke="#1d1814" strokeWidth={i % 5 ? 1.2 : 4.2} transform={`rotate(${i * 6})`} />
        ))}
        {minute && <line x1={0} y1={14} x2={0} y2={-70} stroke="#1d1814" strokeWidth={7} strokeLinecap="round" transform={`rotate(${min})`} />}
        <g transform={`rotate(${sec})`} style={{ transition: 'transform 70ms cubic-bezier(.3,1.8,.6,1)' }}>
          <line x1={0} y1={22} x2={0} y2={-88} stroke={accent} strokeWidth={2.2} />
          <circle cy={-62} r={7} fill={accent} />
        </g>
        <circle r={4.5} fill={accent} />
      </svg>
      {label && <div className="absolute inset-x-0 bottom-[22%] text-center mono text-[11px] text-ink-4">{label}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------- generatief portret

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Face = { w: number; h: number; hue: number; sat: number; eyeDx: number; eyeY: number; eyeR: number; mouth: number; mouthW: number; brow: number; hair: number; hairHue: number; nose: number; ears: number };

export function faceFromSeed(seed: number): Face {
  const r = rng(seed);
  return {
    w: 0.72 + r() * 0.26,
    h: 0.9 + r() * 0.25,
    hue: r() * 360,
    sat: 35 + r() * 35,
    eyeDx: 0.2 + r() * 0.16,
    eyeY: -0.12 + r() * 0.14,
    eyeR: 0.05 + r() * 0.06,
    mouth: -0.6 + r() * 1.4,
    mouthW: 0.18 + r() * 0.2,
    brow: -0.5 + r(),
    hair: r(),
    hairHue: r() * 360,
    nose: 0.05 + r() * 0.12,
    ears: r(),
  };
}

export function blendFaces(a: Face, b: Face, mut = 0.08, seed = 1): Face {
  const r = rng(seed);
  const m = (x: number, y: number, span: number) => (x + y) / 2 + (r() - 0.5) * span * mut;
  const hueAvg = (x: number, y: number) => {
    const d = ((y - x + 540) % 360) - 180;
    return (x + d / 2 + 360) % 360;
  };
  return {
    w: m(a.w, b.w, 0.3),
    h: m(a.h, b.h, 0.3),
    hue: hueAvg(a.hue, b.hue),
    sat: m(a.sat, b.sat, 30),
    eyeDx: m(a.eyeDx, b.eyeDx, 0.15),
    eyeY: m(a.eyeY, b.eyeY, 0.1),
    eyeR: m(a.eyeR, b.eyeR, 0.05),
    mouth: m(a.mouth, b.mouth, 1),
    mouthW: m(a.mouthW, b.mouthW, 0.2),
    brow: m(a.brow, b.brow, 0.6),
    hair: m(a.hair, b.hair, 0.3),
    hairHue: hueAvg(a.hairHue, b.hairHue),
    nose: m(a.nose, b.nose, 0.08),
    ears: m(a.ears, b.ears, 0.3),
  };
}

/** Abstract 'pasfoto'-portret. Een kind is de vermenging van twee gezichten. */
export function Glyph({ face, size = 96, pulse = 0, mono = false }: { face: Face; size?: number; pulse?: number; mono?: boolean }) {
  const f = face;
  const skin = mono ? '#d9d0c2' : `hsl(${f.hue} ${f.sat}% 72%)`;
  const hair = mono ? '#3b342d' : `hsl(${f.hairHue} 35% 28%)`;
  const W = 40 * f.w;
  const H = 46 * f.h;
  const hairPath =
    f.hair < 0.33
      ? `M${-W} ${-H * 0.2} Q ${-W} ${-H * 1.15} 0 ${-H * 1.08} Q ${W} ${-H * 1.15} ${W} ${-H * 0.2} Q ${W * 0.6} ${-H * 0.75} 0 ${-H * 0.7} Q ${-W * 0.6} ${-H * 0.75} ${-W} ${-H * 0.2}Z`
      : f.hair < 0.66
        ? `M${-W * 1.08} ${H * 0.4} Q ${-W * 1.25} ${-H * 1.2} 0 ${-H * 1.1} Q ${W * 1.25} ${-H * 1.2} ${W * 1.08} ${H * 0.4} Q ${W * 0.9} ${-H * 0.6} 0 ${-H * 0.62} Q ${-W * 0.9} ${-H * 0.6} ${-W * 1.08} ${H * 0.4}Z`
        : `M${-W * 0.8} ${-H * 0.55} Q 0 ${-H * 1.5} ${W * 0.8} ${-H * 0.55} Q 0 ${-H * 0.85} ${-W * 0.8} ${-H * 0.55}Z`;
  return (
    <svg viewBox="-60 -66 120 132" width={size} height={size * 1.1} style={{ transform: `scale(${1 + pulse * 0.04})`, transition: 'transform 120ms' }}>
      <rect x={-60} y={-66} width={120} height={132} rx={10} fill={mono ? '#efe9de' : `hsl(${(f.hue + 180) % 360} 25% 86%)`} />
      <path d={`M${-W * 1.1} 66 Q 0 ${H * 0.55} ${W * 1.1} 66Z`} fill={hair} opacity={0.75} />
      {f.ears > 0.4 && (
        <>
          <ellipse cx={-W * 0.98} cy={4} rx={6} ry={10} fill={skin} />
          <ellipse cx={W * 0.98} cy={4} rx={6} ry={10} fill={skin} />
        </>
      )}
      <ellipse cx={0} cy={0} rx={W} ry={H} fill={skin} />
      <path d={hairPath} fill={hair} />
      {[-1, 1].map((s) => (
        <g key={s}>
          <line x1={s * (f.eyeDx * 60) - 7} y1={f.eyeY * 60 - 9 - s * f.brow * 3} x2={s * (f.eyeDx * 60) + 7} y2={f.eyeY * 60 - 9 + s * f.brow * 3} stroke={hair} strokeWidth={2.4} strokeLinecap="round" />
          <circle cx={s * f.eyeDx * 60} cy={f.eyeY * 60} r={f.eyeR * 60} fill="#1d1814" />
          <circle cx={s * f.eyeDx * 60 + 1} cy={f.eyeY * 60 - 1} r={f.eyeR * 18} fill="#fff" opacity={0.7} />
        </g>
      ))}
      <path d={`M0 ${f.eyeY * 60 + 6} L ${-f.nose * 40} ${f.eyeY * 60 + 18} L 2 ${f.eyeY * 60 + 19}`} fill="none" stroke="#00000055" strokeWidth={1.6} strokeLinejoin="round" />
      <path d={`M${-f.mouthW * 60} ${H * 0.45} Q 0 ${H * 0.45 + f.mouth * 10} ${f.mouthW * 60} ${H * 0.45}`} fill="none" stroke="#5a2a24" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}

/** Kleine lijngrafiek. */
export function Spark({ values, w = 240, h = 48, min, max, color = 'var(--sk-acc)', band }: { values: number[]; w?: number; h?: number; min?: number; max?: number; color?: string; band?: [number, number] }) {
  if (values.length < 2) return <svg width={w} height={h} />;
  const lo = min ?? Math.min(...values);
  const hi = max ?? Math.max(...values);
  const y = (v: number) => h - ((v - lo) / (hi - lo || 1)) * (h - 4) - 2;
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * w).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none">
      {band && <rect x={0} width={w} y={y(band[1])} height={Math.max(1, y(band[0]) - y(band[1]))} fill="var(--sk-acc)" opacity={0.12} />}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** Kleurkamers in HKU-palet: elke werkvorm een eigen kamer. */
export const HKU = { aubergine: '#5b0f3d', violet: '#5a12c4', blauw: '#0d22b5', lime: '#d9ff6b', magenta: '#e236d9', roze: '#f6d0f3', lila: '#d3c5f9', lucht: '#93d5f9', zwart: '#08070a', wit: '#ffffff' };
export type Theme = { bg: string; ink: string; acc: string; accInk: string; hart: string; adem: string; clock?: string };
export const THEMES: Record<string, Theme> = {
  wiens: { bg: HKU.blauw, ink: HKU.wit, acc: HKU.lime, accInk: HKU.blauw, hart: '#ff8fc8', adem: HKU.lucht, clock: HKU.magenta },
  gym: { bg: HKU.lila, ink: '#2a0a6a', acc: HKU.violet, accInk: HKU.wit, hart: '#e2246b', adem: HKU.blauw, clock: HKU.magenta },
  zweving: { bg: HKU.magenta, ink: '#2a0019', acc: HKU.lime, accInk: '#2a0019', hart: '#2a0019', adem: HKU.wit, clock: HKU.aubergine },
  beweging: { bg: HKU.lime, ink: '#1100cc', acc: '#1100cc', accInk: HKU.lime, hart: HKU.magenta, adem: HKU.violet, clock: '#1100cc' },
  gesprek: { bg: HKU.aubergine, ink: HKU.roze, acc: HKU.magenta, accInk: HKU.wit, hart: HKU.magenta, adem: HKU.lucht, clock: HKU.magenta },
  mijn: { bg: HKU.lucht, ink: '#3a0c8f', acc: HKU.violet, accInk: HKU.wit, hart: HKU.magenta, adem: HKU.blauw, clock: HKU.magenta },
  machines: { bg: HKU.violet, ink: HKU.wit, acc: HKU.lime, accInk: HKU.violet, hart: HKU.roze, adem: HKU.lucht, clock: HKU.magenta },
  meditaties: { bg: HKU.zwart, ink: '#f4efe9', acc: HKU.lime, accInk: HKU.zwart, hart: HKU.magenta, adem: HKU.lucht, clock: HKU.magenta },
};
export function themeVars(t: Theme): React.CSSProperties {
  return { '--sk-bg': t.bg, '--sk-ink': t.ink, '--sk-acc': t.acc, '--sk-acc-ink': t.accInk, '--sk-hart': t.hart, '--sk-adem': t.adem, '--sk-clock': t.clock ?? t.acc } as React.CSSProperties;
}

const CH = (n: number) => `polygon(${n}px 0, calc(100% - ${n}px) 0, 100% ${n}px, 100% calc(100% - ${n}px), calc(100% - ${n}px) 100%, ${n}px 100%, 0 calc(100% - ${n}px), 0 ${n}px)`;

export const CSS = `
@layer base { .sk h1, .sk h2, .sk h3 { color: inherit; margin: 0; font-family: inherit; font-weight: inherit; letter-spacing: inherit; } }
.sk {
  --sk-bg: ${HKU.zwart}; --sk-ink: #fff; --sk-acc: ${HKU.lime}; --sk-acc-ink: #000; --sk-hart: ${HKU.magenta}; --sk-adem: ${HKU.lucht};
  --sk-ink-2: color-mix(in oklab, var(--sk-ink) 84%, var(--sk-bg));
  --sk-ink-3: color-mix(in oklab, var(--sk-ink) 64%, var(--sk-bg));
  --sk-ink-4: color-mix(in oklab, var(--sk-ink) 44%, var(--sk-bg));
  --sk-room: var(--sk-bg);
  font-family: Geist, system-ui, sans-serif; letter-spacing: -0.005em;
  background: var(--sk-bg); color: var(--sk-ink);
  transition: background-color 900ms cubic-bezier(.6,0,.2,1), color 900ms;
  -webkit-font-smoothing: antialiased;
}
.sk ::selection { background: var(--sk-acc); color: var(--sk-acc-ink); }
.sk .serif { font-family: Geist, system-ui, sans-serif; font-weight: 300; letter-spacing: -0.025em; font-style: normal !important; }
.sk .display { font-family: Geist, system-ui, sans-serif; font-weight: 400; letter-spacing: -0.045em; line-height: .92; }
.sk .lede { font-size: clamp(17px, 1.5vw, 21px); line-height: 1.4; font-weight: 300; color: var(--sk-ink-2); letter-spacing: -0.01em; }
.sk .mono, .sk .font-\\[IBM_Plex_Mono\\] { font-family: 'Geist Mono', ui-monospace, monospace; letter-spacing: 0; }
.sk input[type=range] { accent-color: var(--sk-acc); }
.sk select, .sk input:not([type=range]):not([type=checkbox]) { color: var(--sk-ink); background: color-mix(in oklab, var(--sk-ink) 8%, transparent); border: 0; outline: none; }
.sk select option { color: #000; }
.sk .btn { font-size: 13px; font-weight: 500; padding: 7px 14px; background: color-mix(in oklab, var(--sk-ink) 10%, transparent); color: var(--sk-ink); clip-path: ${CH(6)}; transition: background 150ms, transform 150ms; }
.sk .btn:hover { background: color-mix(in oklab, var(--sk-ink) 18%, transparent); }
.sk .btn:active { transform: translateY(1px); }
.sk .btn:disabled { opacity: .35; }
.sk .btn.accent { background: var(--sk-acc); color: var(--sk-acc-ink); }
.sk .btn.big { font-size: 16px; padding: 12px 22px; clip-path: ${CH(10)}; }
.sk .seg { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.sk .seg button { font-size: 13px; font-weight: 500; padding: 7px 13px; color: var(--sk-ink-3); background: color-mix(in oklab, var(--sk-ink) 7%, transparent); white-space: nowrap; clip-path: ${CH(6)}; transition: all 150ms; }
.sk .seg button:hover { color: var(--sk-ink); }
.sk .seg button.on { background: var(--sk-ink); color: var(--sk-bg); }
.sk .card { background: color-mix(in oklab, var(--sk-ink) 7%, transparent); clip-path: ${CH(14)}; }
.sk .card[class*="ring-"] { background: color-mix(in oklab, var(--sk-acc) 30%, transparent); }
.sk .chip { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; padding: 4px 10px; color: var(--sk-ink-3); background: color-mix(in oklab, var(--sk-ink) 7%, transparent); clip-path: ${CH(5)}; }
.sk .chip.on { background: var(--sk-ink); color: var(--sk-bg); }
.sk .nav { display: grid; grid-template-columns: 30px 1fr; align-items: baseline; width: 100%; text-align: left; padding: 7px 12px 8px; color: var(--sk-ink-3); clip-path: ${CH(8)}; transition: background 200ms, color 200ms; }
.sk .nav:hover { color: var(--sk-ink); }
.sk .nav.on { background: var(--sk-ink); color: var(--sk-bg); }
.sk .nav .n { font-family: 'Geist Mono', monospace; font-size: 11px; opacity: .7; }
.sk .info-btn { width: 30px; height: 30px; display: inline-grid; place-items: center; border-radius: 999px; font: 500 15px/1 Geist, sans-serif; color: var(--sk-ink-3); box-shadow: inset 0 0 0 1.5px currentColor; transition: color 150ms, transform 150ms; }
.sk .info-btn:hover { color: var(--sk-ink); transform: scale(1.06); }
.sk .icon-btn { width: 34px; height: 34px; display: inline-grid; place-items: center; color: var(--sk-ink-3); background: color-mix(in oklab, var(--sk-ink) 8%, transparent); clip-path: ${CH(6)}; }
.sk .icon-btn:hover, .sk .icon-btn.on { color: var(--sk-ink); background: color-mix(in oklab, var(--sk-ink) 16%, transparent); }
@keyframes skfade { from { opacity: 0 } to { opacity: 1 } }
@keyframes sksheet { from { opacity: 0; transform: translateY(18px) scale(.985) } to { opacity: 1; transform: none } }
.sk .sheet-wrap { position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 24px; background: color-mix(in oklab, var(--sk-bg) 55%, rgba(0,0,0,.35)); backdrop-filter: blur(14px) saturate(1.2); -webkit-backdrop-filter: blur(14px) saturate(1.2); animation: skfade 240ms ease-out; }
.sk .sheet { width: min(620px, 100%); max-height: min(78svh, 820px); overflow-y: auto; padding: 34px 36px 30px; background: var(--sk-bg); color: var(--sk-ink); clip-path: ${CH(18)}; animation: sksheet 340ms cubic-bezier(.2,.8,.2,1); box-shadow: 0 30px 80px rgba(0,0,0,.25); }
.sk .sheet .sheet-title { font-size: 30px; font-weight: 400; letter-spacing: -0.035em; line-height: 1.05; }
.sk .sheet .sheet-sub { font-size: 16px; color: var(--sk-ink-3); margin-top: 8px; font-weight: 300; }
.sk .info-sec { margin-top: 26px; }
.sk .info-sec h3 { font-family: 'Geist Mono', monospace; font-size: 10.5px; letter-spacing: .18em; text-transform: uppercase; color: var(--sk-ink-3); margin-bottom: 8px; }
.sk .info-body { font-size: 15px; line-height: 1.55; font-weight: 300; color: var(--sk-ink-2); }
.sk .info-body > * + * { margin-top: 10px; }
.sk .info-body ul { list-style: none; padding: 0; }
.sk .info-body li { padding-left: 16px; position: relative; margin-top: 8px; }
.sk .info-body li::before { content: ''; position: absolute; left: 0; top: .65em; width: 6px; height: 6px; background: var(--sk-acc); clip-path: polygon(50% 0,100% 50%,50% 100%,0 50%); }
.sk .info-body b { font-weight: 500; color: var(--sk-ink); }
.sk .info-body :is(p, ul, li, span, div) { font-size: inherit !important; color: inherit; font-style: normal !important; }
.sk .popover { position: absolute; right: 0; top: calc(100% + 8px); z-index: 40; width: min(400px, calc(100vw - 32px)); padding: 20px; background: color-mix(in oklab, var(--sk-ink) 9%, var(--sk-bg)); clip-path: ${CH(12)}; box-shadow: 0 20px 60px rgba(0,0,0,.25); animation: sksheet 220ms cubic-bezier(.2,.8,.2,1); outline: 1.5px solid color-mix(in oklab, var(--sk-ink) 14%, transparent); }
.sk .scroll::-webkit-scrollbar { width: 6px; height: 6px; }
.sk .scroll::-webkit-scrollbar-thumb { background: color-mix(in oklab, var(--sk-ink) 20%, transparent); }
.sk .rings-off [class*="ring-"] { box-shadow: none; }
@keyframes skpulse { from { transform: scale(1); opacity: .7 } to { transform: scale(2.4); opacity: 0 } }
.sk .ripple { animation: skpulse 900ms ease-out forwards; }
@keyframes skin { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
.sk .enter > * { animation: skin 700ms cubic-bezier(.2,.7,.2,1) both; }
.sk .enter > *:nth-child(2) { animation-delay: 60ms } .sk .enter > *:nth-child(3) { animation-delay: 120ms } .sk .enter > *:nth-child(4) { animation-delay: 180ms }
`;

export const FONTS = 'https://fonts.googleapis.com/css2?family=Geist:wght@200..700&family=Geist+Mono:wght@400;500&display=swap';
