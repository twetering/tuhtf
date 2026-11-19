import { useEffect, useRef, useState } from 'react';
import type { BodyHub } from './bodies';
import Live from './Live';
import { Label, useFrame, Uitleg } from './ui';

type Item = { id: string; titel: string; ondertitel: string; duur: number };
type Timeline = Item & {
  audio: string;
  hr: number[];
  adem: number[];
  toeren: number[] | null;
  ademhalingen: { t: number; uit: number; soort: string }[];
  tekst: { t: number; end: number; text: string }[];
};

const BASE = import.meta.env.BASE_URL ?? '/';
const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export default function Meditaties({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [items, setItems] = useState<Item[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [tl, setTl] = useState<Timeline | null>(null);
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    fetch(`${BASE}meditaties/index.json`)
      .then((r) => r.json())
      .then((d: Item[]) => {
        setItems(d);
        setSel((s) => s ?? d[0]?.id ?? null);
      })
      .catch(() => setItems([]));
  }, []);
  useEffect(() => {
    if (!sel) return;
    setTl(null);
    if (sel === 'live') return;
    fetch(`${BASE}meditaties/${sel}.json`).then((r) => r.json()).then(setTl);
  }, [sel]);

  const t = audio.current?.currentTime ?? 0;
  const i = Math.min((tl?.hr.length ?? 1) - 1, Math.floor(t));
  const hr = tl ? tl.hr[i] + (tl.hr[Math.min(tl.hr.length - 1, i + 1)] - tl.hr[i]) * (t - i) : 0;
  const line = tl?.tekst.find((x) => t >= x.t - 0.2 && t <= x.end + 1.5);
  const rpm = tl?.toeren?.[i] ?? 0;
  const lastBreath = tl?.ademhalingen.filter((b) => b.t <= t).pop();
  const inhaling = lastBreath && t < lastBreath.uit;
  const breathScale = lastBreath ? (inhaling ? (t - lastBreath.t) / (lastBreath.uit - lastBreath.t) : Math.max(0, 1 - (t - lastBreath.uit) / 5)) : 0;
  const beatPhase = (t * hr) / 60;
  const pulse = Math.max(0, 1 - (beatPhase % 1) * 4);

  return (
    <div className="max-w-[1200px]">
<Uitleg title="Over de meditaties">      <p>
        Een AI die geen lichaam heeft, probeert jou bewust te maken van het jouwe. Drie meditaties voor koptelefoon, met een gesimuleerd hartslagverloop: de AI 'weet' wat je hart doet.
      </p></Uitleg>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-5">
        {items.map((it) => (
          <button key={it.id} onClick={() => setSel(it.id)} className={`card p-4 text-left ${sel === it.id ? 'ring-1 ring-acc' : 'hover:bg-ink/[0.04]'}`}>
            <div className="text-[24px] font-light tracking-[-0.02em] leading-tight">{it.titel}</div>
            <div className="mono text-[10px] text-ink-4 mt-2">{fmt(it.duur)}</div>
          </button>
        ))}
        <button onClick={() => setSel('live')} className={`card p-4 text-left ${sel === 'live' ? 'ring-1 ring-acc' : 'hover:bg-ink/[0.04]'}`}>
          <div className="text-[24px] font-light tracking-[-0.02em] leading-tight">Live</div>
          <div className="mono text-[10px] text-ink-4 mt-2">jouw hart en adem · offline</div>
        </button>
        {!items.length && <div className="text-[13px] text-ink-3">Nog geen meditaties gerenderd. Draai: <span className="mono">node scripts/meditaties/render.mjs</span></div>}
      </div>

      {sel === 'live' && <div className="mt-6"><Live hub={hub} /></div>}
      {tl && sel !== 'live' && (
        <div className="grid grid-cols-[minmax(0,1fr)_300px] gap-8 mt-6">
          <div>
            <audio ref={audio} src={`${BASE}${tl.audio}`} controls className="w-full" />
            <div className="card mt-4 p-6 min-h-[150px] flex items-center">
              <div className={`text-[clamp(22px,2.4vw,34px)] font-extralight tracking-[-0.025em] leading-snug transition-opacity duration-700 ${line ? 'opacity-100' : 'opacity-0'}`}>{line ? line.text : '…'}</div>
            </div>
            <Chart tl={tl} t={t} onSeek={(s) => audio.current && (audio.current.currentTime = s)} />
          </div>
          <div className="space-y-4">
            <div className="card p-5 flex items-center gap-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: `rgba(255,90,74,${0.15 + pulse * 0.55})`, transform: `scale(${1 + pulse * 0.1})` }}>
                <span className="text-[22px]">♥</span>
              </div>
              <div>
                <Label>gesimuleerd hart</Label>
                <div className="serif text-[48px] leading-none">{Math.round(hr)}</div>
              </div>
            </div>
            {tl.toeren && (
              <div className="card p-5 flex items-center gap-5">
                <svg width={64} height={64} viewBox="-32 -32 64 64" style={{ transform: `rotate(${((performance.now() / 1000) * rpm * 0.6) % 360}deg)` }}>
                  {[0, 1, 2, 3, 4, 5, 6].map((k) => (
                    <path key={k} d="M0 0 C 6 -8, 6 -22, 0 -28 C -4 -20, -4 -8, 0 0Z" fill="var(--sk-ink-3)" transform={`rotate(${(k * 360) / 7})`} />
                  ))}
                  <circle r={6} fill="var(--sk-bg)" />
                </svg>
                <div>
                  <Label>servers</Label>
                  <div className="serif text-[40px] leading-none">{rpm.toLocaleString('nl-NL')}</div>
                  <div className="mono text-[10px] text-ink-3">toeren per minuut</div>
                </div>
              </div>
            )}
            {tl.ademhalingen.length > 0 && (
              <div className="card p-5 flex items-center gap-5">
                <div className="w-16 h-16 flex items-center justify-center">
                  <div className="rounded-full bg-adem/40 border border-adem/70" style={{ width: 18 + breathScale * 46, height: 18 + breathScale * 46 }} />
                </div>
                <div>
                  <Label>synthetische adem</Label>
                  <div className="serif text-[26px] leading-none">{lastBreath ? (inhaling ? 'in' : lastBreath.soort.replace('uit_', 'uit ').replace('_', ' ')) : '—'}</div>
                  <div className="mono text-[10px] text-ink-3">{tl.adem[i]?.toFixed(1)} per minuut</div>
                </div>
              </div>
            )}
            <Uitleg title="Gemaakt met">
              <p>Stem en ademgeluid: ElevenLabs (stem Koraly, eleven_v3, fluisterend). Hart, akkoord en serverruimte: synthese. Opnieuw maken of aanpassen: <span className="mono">scripts/meditaties/</span>.</p>
            </Uitleg>
          </div>
        </div>
      )}
      {/* stemproefjes tijdelijk verborgen: <Proeven /> */}
    </div>
  );
}

type Proef = { id: string; label: string; tekst: string; audio: string; engine: string };
/** Korte stemproefjes (scripts/meditaties/probeer.mjs): eerst vergelijken, dan pas hele meditaties renderen. */
export function Proeven() {
  const [list, setList] = useState<Proef[]>([]);
  useEffect(() => {
    fetch(`${BASE}meditaties/proef/index.json`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : []))
      .then(setList)
      .catch(() => setList([]));
  }, []);
  if (!list.length) return null;
  return (
    <div className="mt-14">
      <Label>stemproefjes · zelfde fragment, andere stem</Label>
      <Uitleg title="Stemproefjes"><p>Kort fragment om stemmen te vergelijken zonder hele meditaties opnieuw te maken. Nieuwe proefjes: <span className="mono">node scripts/meditaties/probeer.mjs</span></p></Uitleg>
      <div className="grid gap-3 mt-4 md:grid-cols-2">
        {list.map((p) => (
          <div key={p.id} className="card p-4">
            <div className="text-[15px] font-medium">{p.label}</div>
            <audio src={`${BASE}${p.audio}?v=${p.id.length}`} controls preload="none" className="w-full mt-3" />

          </div>
        ))}
      </div>
    </div>
  );
}

function Chart({ tl, t, onSeek }: { tl: Timeline; t: number; onSeek: (s: number) => void }) {
  const W = 800;
  const H = 150;
  const lo = Math.min(...tl.hr) - 4;
  const hi = Math.max(...tl.hr) + 4;
  const x = (s: number) => (s / tl.duur) * W;
  const y = (v: number) => H - ((v - lo) / (hi - lo)) * (H - 10) - 5;
  const hrPath = tl.hr.map((v, s) => `${s ? 'L' : 'M'}${x(s).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const rpmPath = tl.toeren?.map((v, s) => `${s ? 'L' : 'M'}${x(s).toFixed(1)},${(H - (v / 5000) * (H - 10) - 5).toFixed(1)}`).join('');
  return (
    <div className="card p-4 mt-4">
      <Label>verloop · klik om te springen</Label>
      <svg
        viewBox={`0 0 ${W} ${H + 18}`}
        className="w-full mt-2 cursor-pointer"
        onClick={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          onSeek(((e.clientX - r.left) / r.width) * tl.duur);
        }}
      >
        {tl.tekst.map((l, k) => (
          <rect key={k} x={x(l.t)} width={Math.max(1.5, x(l.end) - x(l.t))} y={0} height={H} fill="var(--sk-ink)" opacity={0.08} />
        ))}
        {tl.ademhalingen.map((b, k) => (
          <line key={k} x1={x(b.t)} x2={x(b.t)} y1={H - 6} y2={H} stroke="var(--sk-adem)" opacity={0.6} />
        ))}
        {rpmPath && <path d={rpmPath} fill="none" stroke="var(--sk-ink-3)" strokeWidth={1.4} strokeDasharray="4 3" />}
        <path d={hrPath} fill="none" stroke="var(--sk-hart)" strokeWidth={2} />
        <line x1={x(t)} x2={x(t)} y1={0} y2={H} stroke="var(--sk-acc)" />
        <text x={0} y={H + 14} fontSize={10} fill="var(--sk-ink-3)" fontFamily="Geist Mono">lijn = hartslag {Math.round(lo + 4)}–{Math.round(hi - 4)} · vlakken = stem{tl.toeren ? ' · gestippeld = servertoeren' : ''}{tl.ademhalingen.length ? ' · streepjes = ademhalingen' : ''}</text>
      </svg>
    </div>
  );
}
