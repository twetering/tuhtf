import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { BodyHub } from './bodies';
import Beweging from './Beweging';
import Gesprek from './Gesprek';
import IsDitMijnHart from './IsDitMijnHart';
import Gym from './Gym';
import Machines from './Machines';
import Meditaties from './Meditaties';
import { setSoundOn, soundMuted, soundReady, unlock } from './sound';
import { CSS, FONTS, InfoProvider, THEMES, sourceMark, themeVars } from './ui';
import WiensKlok from './WiensKlok';
import Zweving from './Zweving';

type Key = 'wiens' | 'gym' | 'zweving' | 'beweging' | 'gesprek' | 'mijn' | 'machines' | 'meditaties';
const NAV: { group: string; items: { key: Key; titel: string; sub: string }[] }[] = [
  {
    group: 'samen',
    items: [
      { key: 'wiens', titel: 'Wiens klok?', sub: 'Een klok tikt iemands hart, pas of adem. Van wie?' },
      { key: 'gym', titel: 'Gym', sub: 'Spellen voor lijf en hart: Koekoek en Herstelslag.' },
      { key: 'zweving', titel: 'Zweving', sub: 'Ieder hart een toon. Samen, met vier, of juist uit elkaar.' },
      { key: 'beweging', titel: 'Beweging', sub: 'Stilstaan, samen ademen, zien wie er leidt.' },
    ],
  },
  { group: 'met z’n tweeën', items: [{ key: 'gesprek', titel: 'Hartslaggesprek', sub: 'Zonder woorden, met elkaars hart in je oor.' }] },
  {
    group: 'alleen',
    items: [
      { key: 'mijn', titel: 'Is dit mijn hart?', sub: 'Tellen, herkennen, raden: hoe goed voel je jezelf?' },
      { key: 'machines', titel: 'Machine-meditaties', sub: 'Lummelen bij apparaten die op jouw lichaam lopen.' },
    ],
  },
  { group: 'mens en ai', items: [{ key: 'meditaties', titel: 'AI-meditaties', sub: 'Een stem zonder lichaam die naar het jouwe luistert.' }] },
];
const FLAT = NAV.flatMap((g) => g.items);

export function useFonts() {
  useEffect(() => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONTS;
    document.head.appendChild(l);
    return () => l.remove();
  }, []);
}

export default function Speelkamer() {
  useFonts();
  const hub = useMemo(() => new BodyHub(8), []);
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    hub.onChange = force;
    hub.start();
    (window as unknown as { __hub: BodyHub }).__hub = hub; // handig bij debuggen in de console
    return () => hub.dispose();
  }, [hub]);
  const [key, setKey] = useState<Key>(() => {
    const k = localStorageGet('sk-tab') as Key;
    return FLAT.some((x) => x.key === k) ? k : 'wiens';
  });
  const [code, setCode] = useState(() => localStorageGet('sk-kanaal') || `huiskamer-${Math.random().toString(36).slice(2, 6)}`);
  const [err, setErr] = useState<string | null>(null);
  const [sound, setSound] = useState(soundReady());
  const [menu, setMenu] = useState(false);
  const [setup, setSetup] = useState(false);
  const [info, setInfo] = useState(false);
  const [infoEl, setInfoEl] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (setInfo(false), setSetup(false));
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    setInfo(false);
    setSetup(false);
  }, [key]);
  useEffect(() => localStorageSet('sk-tab', key), [key]);

  const theme = THEMES[key];
  // ook de pagina zelf (overscroll, onderkant) in de kleur van de kamer
  useEffect(() => {
    const prev = document.body.style.background;
    document.body.style.background = theme.bg;
    document.body.style.transition = 'background-color 900ms';
    return () => {
      document.body.style.background = prev;
    };
  }, [theme.bg]);

  const addBand = async () => {
    setErr(null);
    try {
      const name = window.prompt('Naam van de drager (optioneel)') ?? undefined;
      await hub.connectBand(name || undefined);
    } catch (e) {
      if (e instanceof Error && e.name !== 'NotFoundError') setErr(e.message);
    }
  };
  // het knopje volgt wat je kiest (direct), de AudioContext volgt daarna
  const toggleSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !sound;
    setSound(next);
    void setSoundOn(next);
  };
  const base = `${location.origin}${location.pathname}`;
  const idx = FLAT.findIndex((x) => x.key === key);
  const cur = FLAT[idx];
  const live = hub.bodies.filter((b) => b.hr > 0);
  const avgHr = live.length ? live.reduce((s, b) => s + b.hr, 0) / live.length : 60;

  return (
    <div className="sk min-h-svh w-full relative" style={themeVars(theme)} onPointerDown={() => !sound && !soundMuted() && unlock().then((ok) => ok && setSound(true))}>
      <style>{CSS}</style>
      <RoomLines bpm={avgHr} />

      <div className="relative flex min-h-svh">
        {/* ------------------------------------------------------------ rail */}
        <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-6 px-5 py-6 h-svh sticky top-0 overflow-y-auto scroll">
          <Brand />
          <Nav current={key} onPick={setKey} />
        </aside>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* ------------------------------------------------------------ top bar */}
          <header className="sticky top-0 z-20" style={{ background: 'var(--sk-bg)', transition: 'background-color 900ms cubic-bezier(.6,0,.2,1)' }}>
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 px-5 lg:px-8 pt-4 pb-3">
              <button className="lg:hidden btn" onClick={() => setMenu(!menu)} aria-label="menu">{menu ? '✕' : '☰'}</button>
              <div className="lg:hidden flex-1 sm:flex-none">
                <Brand small />
              </div>
              <BodyStrip hub={hub} />
              <button className={`icon-btn shrink-0 ${sound ? 'on' : ''}`} onPointerDown={(e) => e.stopPropagation()} onClick={toggleSound} title={sound ? 'geluid uit' : 'geluid aan'} aria-label={sound ? 'geluid uit' : 'geluid aan'}>
                <SpeakerIcon on={sound} />
              </button>
              <div className="relative shrink-0">
                <button className={`icon-btn ${setup ? 'on' : ''}`} onClick={() => setSetup(!setup)} title="opstelling: lichamen, banden, kanaal" aria-label="opstelling">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2.2" /><circle cx="10" cy="17" r="2.2" /></svg>
                </button>
                {setup && (
                  <div className="popover space-y-4 text-[13px]">
                    <div className="flex items-center justify-between">
                      <span className="text-ink-2">Gesimuleerde lichamen</span>
                      <select value={hub.bodies.filter((b) => b.source === 'sim' && b.id !== 'jij').length} onChange={(e) => hub.setSimCount(+e.target.value)} className="px-2 py-1">
                        {[0, 2, 4, 6, 8, 10].map((n) => <option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <button className="btn w-full" onClick={addBand}>＋ hartslagband verbinden</button>
                    <div>
                      <div className="text-ink-2 mb-1.5">Kanaal voor telefoons en M5Sticks</div>
                      <div className="flex gap-1">
                        <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9-]/gi, ''))} className="flex-1 min-w-0 px-2 py-1.5 mono" title="kanaalcode" />
                        <button className="btn" onClick={() => { localStorageSet('sk-kanaal', code); void hub.joinChannel(code); }}>{hub.channel === code ? hub.channelStatus : 'open'}</button>
                      </div>
                      {hub.channel && (
                        <div className="text-[11.5px] text-ink-3 mt-2 break-all leading-relaxed">
                          telefoon: <span className="mono text-ink select-all">{base}#speelkamer/zender?kanaal={hub.channel}</span>
                          <br />M5Stick: zet <span className="mono text-ink">{hub.channel}</span> als KANAAL in de firmware
                        </div>
                      )}
                    </div>
                    <div className="pt-1 space-y-1 text-[12px] text-ink-3">
                      <a className="block hover:text-ink" href={`#speelkamer/klok?kanaal=${code}`} target="_blank" rel="noreferrer">klokscherm voor de ruimte ↗</a>
                      <a className="block hover:text-ink" href="#huiskamer">de kamer luistert (v2) ↗</a>
                    </div>
                  </div>
                )}
              </div>
            </div>
            {err && <div className="px-5 lg:px-8 pb-2 text-[12px] text-hart">{err}</div>}
            {menu && (
              <div className="lg:hidden px-5 pb-5 max-h-[70svh] overflow-y-auto">
                <Nav current={key} onPick={(k) => { setKey(k); setMenu(false); }} />
              </div>
            )}
          </header>

          {/* ------------------------------------------------------------ werkvorm */}
          <main className="flex-1 px-5 lg:px-8 pb-16 pt-6" onClick={() => setup && setSetup(false)}>
            <div key={key} className="enter">
              <div className="flex items-center gap-4 mb-6">
                <h1 className="display text-[clamp(34px,4.2vw,64px)]">{cur.titel}</h1>
                <button className="info-btn" onClick={() => setInfo(true)} title="uitleg" aria-label="uitleg">i</button>
              </div>
              <InfoProvider value={infoEl}>
                {key === 'wiens' && <WiensKlok hub={hub} />}
                {key === 'gym' && <Gym hub={hub} />}
                {key === 'zweving' && <Zweving hub={hub} />}
                {key === 'beweging' && <Beweging hub={hub} />}
                {key === 'gesprek' && <Gesprek hub={hub} />}
                {key === 'mijn' && <IsDitMijnHart hub={hub} />}
                {key === 'machines' && <Machines hub={hub} />}
                {key === 'meditaties' && <Meditaties hub={hub} />}
              </InfoProvider>
            </div>
          </main>
          {/* info-paneel: altijd in de DOM (de werkvorm vult het), alleen zichtbaar na ⓘ */}
          <div className="sheet-wrap" style={{ display: info ? undefined : 'none' }} onClick={() => setInfo(false)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`uitleg ${cur.titel}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mono text-[10.5px] tracking-[0.18em] uppercase text-ink-3 mb-3">{String(idx + 1).padStart(2, '0')} · {NAV.find((g) => g.items.includes(cur))?.group}</div>
                  <div className="sheet-title">{cur.titel}</div>
                  <div className="sheet-sub">{cur.sub}</div>
                </div>
                <button className="icon-btn shrink-0" onClick={() => setInfo(false)} aria-label="sluit">✕</button>
              </div>
              <div ref={setInfoEl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div>
      <div className={`display ${small ? 'text-[22px]' : 'text-[40px]'}`}>Speelkamer</div>
      {!small && <div className="mono text-[10.5px] tracking-[0.16em] uppercase text-ink-3 mt-2">belichaamde kennis · tuhtf</div>}
    </div>
  );
}

function Nav({ current, onPick }: { current: Key; onPick: (k: Key) => void }) {
  return (
    <nav className="flex flex-col gap-4">
      {NAV.map((g) => (
        <div key={g.group}>
          <div className="mono text-[10px] tracking-[0.2em] uppercase text-ink-4 mb-1 px-3">{g.group}</div>
          {g.items.map((it) => (
            <button key={it.key} className={`nav ${current === it.key ? 'on' : ''}`} onClick={() => onPick(it.key)}>
              <span className="n">{String(FLAT.indexOf(it) + 1).padStart(2, '0')}</span>
              <span className="text-[19px] font-normal tracking-[-0.02em] leading-tight">{it.titel}</span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SpeakerIcon({ on }: { on: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" />
      {on ? <path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" strokeLinecap="round" /> : <path d="M16 9.5l5 5M21 9.5l-5 5" strokeLinecap="round" />}
    </svg>
  );
}

/** Lichamen als rij die per hartslag oplicht. */
function BodyStrip({ hub }: { hub: BodyHub }) {
  const dots = useRef<Record<string, HTMLSpanElement | null>>({});
  useEffect(() => {
    const off = hub.on((id, s) => {
      if (s !== 'hart') return;
      dots.current[id]?.animate([{ transform: 'scale(2)', opacity: 1 }, { transform: 'scale(1)', opacity: 0.7 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
    });
    return () => {
      off();
    };
  }, [hub]);
  return (
    <div className="order-last basis-full sm:order-none sm:basis-auto flex-1 min-w-0 flex gap-1.5 overflow-x-auto scroll py-0.5">
      {hub.bodies.map((b) => (
        <span key={b.id} className="chip shrink-0" title={b.source}>
          <span ref={(el) => { dots.current[b.id] = el; }} className="inline-block w-2 h-2 rounded-full opacity-70" style={{ background: `hsl(${b.hue} 80% 62%)` }} />
          {sourceMark(b)} {b.name}
          <span className="mono text-[11px] tabular-nums text-ink">{b.hr ? Math.round(b.hr) : '–'}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Achtergrond: hoekige lijnen in de HKU-vormtaal. Op het gemiddelde hart van de ruimte
 * loopt er bij elke slag een lichtpuls langs een van de lijnen.
 */
const PATHS = [
  'M -20 170 H 230 L 300 240 V 520 L 370 590 H 760 L 830 520 V 130 L 900 60 H 1180 L 1250 130 V 390 H 1620',
  'M 990 1020 V 830 L 1060 760 H 1390 L 1460 690 V 470 L 1530 400 H 1620',
  'M -20 760 H 150 L 220 830 V 1020',
  'M 540 -20 V 130 L 610 200 H 700 L 760 260 V 330',
];
function RoomLines({ bpm }: { bpm: number }) {
  const refs = useRef<(SVGPathElement | null)[]>([]);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  useEffect(() => {
    let raf = 0;
    let phase = 0;
    let last = performance.now();
    let k = 0;
    const starts: number[] = PATHS.map(() => -1e9);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      phase += (dt * bpmRef.current) / 60;
      if (phase >= 1) {
        phase -= 1;
        starts[k++ % PATHS.length] = now;
      }
      refs.current.forEach((p, i) => {
        if (!p) return;
        const len = p.getTotalLength();
        const t = (now - starts[i]) / 2200;
        if (t > 1) return void (p.style.opacity = '0');
        p.style.strokeDasharray = `160 ${len + 400}`;
        p.style.strokeDashoffset = String(160 - t * (len + 160));
        p.style.opacity = String((1 - t) * 0.95);
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <svg className="fixed inset-0 w-full h-full pointer-events-none" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden>
      {PATHS.map((d, i) => (
        <path key={`b${i}`} d={d} fill="none" stroke="var(--sk-ink)" strokeOpacity={0.14} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      ))}
      {PATHS.map((d, i) => (
        <path key={`p${i}`} ref={(el) => { refs.current[i] = el; }} d={d} fill="none" stroke="var(--sk-acc)" strokeWidth={3} style={{ opacity: 0 }} />
      ))}
    </svg>
  );
}

function localStorageGet(k: string) {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* privémodus: niet onthouden */
  }
}
