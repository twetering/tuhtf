import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import type { AccProcessor } from './motion';
import Stick3D from './Stick3D';
import { BodyDot, Label, Uitleg, sourceMark, useFrame } from './ui';

/** Draagplekken en wat je daar redelijkerwijs kunt meten. ✓ goed · ~ soms · – niet */
type Plek = 'borst' | 'buik' | 'pols' | 'enkel' | 'hoofd' | 'rug' | 'bovenbeen' | 'hand';
const PLEKKEN: Record<Plek, { label: string; tip: string; kan: Record<Feature, '✓' | '~' | '–'> }> = {
  borst: { label: 'borst', tip: 'Strak op het borstbeen (elastiek, borstband, sporttop). Beste plek voor adem, houding van de romp en stilstaan.', kan: { pas: '✓', onrust: '✓', houding: '✓', adem: '✓', draaien: '✓', sprong: '✓' } },
  buik: { label: 'buik', tip: 'Net boven de navel, onder een strakke band. Buikademhaling is hier het duidelijkst; gaat liggend ook goed.', kan: { pas: '~', onrust: '✓', houding: '✓', adem: '✓', draaien: '✓', sprong: '✓' } },
  pols: { label: 'pols', tip: 'Gebaren, armzwaai, tikken en dirigeren. Adem is hier niet te meten; houding zegt alleen iets over de arm.', kan: { pas: '~', onrust: '~', houding: '~', adem: '–', draaien: '✓', sprong: '~' } },
  enkel: { label: 'enkel', tip: 'Elke stap is een duidelijke klap: beste plek voor pas, tempo en dansritme. Geen adem.', kan: { pas: '✓', onrust: '~', houding: '–', adem: '–', draaien: '~', sprong: '✓' } },
  hoofd: { label: 'hoofd', tip: 'Op het achterhoofd of aan een pet/haarband. Knikken, kijkrichting, hoofdstand en evenwicht.', kan: { pas: '~', onrust: '✓', houding: '✓', adem: '~', draaien: '✓', sprong: '✓' } },
  rug: { label: 'onderrug', tip: 'Op het heiligbeen (broekband achter). Zwaartepunt van het lichaam: sprongen, salto’s, evenwicht, buigen.', kan: { pas: '✓', onrust: '✓', houding: '✓', adem: '~', draaien: '✓', sprong: '✓' } },
  bovenbeen: { label: 'bovenbeen', tip: 'In een broekzak of met band op de dij. Zitten, staan, liggen en knielen zijn hier goed uit elkaar te houden.', kan: { pas: '✓', onrust: '~', houding: '✓', adem: '–', draaien: '~', sprong: '✓' } },
  hand: { label: 'in de hand', tip: 'Losjes vastgehouden, als object of instrument. Alles wat de hand doet; niets over het lichaam zelf.', kan: { pas: '–', onrust: '~', houding: '~', adem: '–', draaien: '✓', sprong: '~' } },
};
type Feature = 'pas' | 'onrust' | 'houding' | 'adem' | 'draaien' | 'sprong';

export default function Sensor({ hub }: { hub: BodyHub }) {
  useFrame(10);
  const withAcc = hub.bodies.filter((b) => hub.procs.has(b.id));
  const [sel, setSel] = useState<string | null>(null);
  const body = withAcc.find((b) => b.id === sel) ?? withAcc[0];
  const proc = body ? hub.procs.get(body.id) : undefined;
  const [plek, setPlek] = useState<Plek>(() => (localStorageGet('sk-plek') as Plek) || 'borst');
  useEffect(() => localStorageSet('sk-plek', plek), [plek]);

  if (!body || !proc) {
    return (
      <div className="card p-10 text-center">
        <div className="text-[26px] font-light tracking-[-0.02em]">Nog geen sensor met ruwe data</div>
        <div className="text-[14px] text-ink-3 mt-2">Open het kanaal van je M5Stick via ⚙, of verbind een Polar H10.</div>
        <Uitleg title="Kalibratie">
          <p>Dit scherm laat zien wat een bewegingssensor echt meet: ruwe versnelling en draaisnelheid, de houding, het ademsignaal met een kwaliteitsmaat, sprongen en omwentelingen. Werkt met M5Stick, Polar H10 en telefoons.</p>
        </Uitleg>
      </div>
    );
  }
  return <SensorView hub={hub} body={body} proc={proc} bodies={withAcc} onPick={setSel} plek={plek} setPlek={setPlek} />;
}

function SensorView({ hub, body, proc, bodies, onPick, plek, setPlek }: { hub: BodyHub; body: Body; proc: AccProcessor; bodies: Body[]; onPick: (id: string) => void; plek: Plek; setPlek: (p: Plek) => void }) {
  const pos = proc.posture();
  const link = hub.linkStats(body.id);
  const gmag = proc.grav ? Math.hypot(...proc.grav) : 0;
  const now = performance.now();
  const recent = proc.events.filter((e) => now - e.t < 60000);
  const jumps = recent.filter((e) => e.kind === 'sprong');
  const turns = recent.filter((e) => e.kind === 'draai');
  const steps = proc.events.filter((e) => e.kind === 'pas' && now - e.t < 10000).length;
  const brOk = proc.breathQ > 0.35 && body.acc.breathRate > 0;
  const brWhy = brOk
    ? `${body.acc.breathRate.toFixed(1)} per minuut`
    : body.acc.activity >= 0.18
      ? 'te veel beweging om adem te zien'
      : proc.breathAmp <= 1.2
        ? 'signaal te klein: zit de sensor strak op borst of buik?'
        : proc.breathCount < 120
          ? 'even stil zitten, nog aan het luisteren…'
          : 'geen regelmatig ritme gevonden';
  const kan = PLEKKEN[plek].kan;
  const status = (f: Feature): { ok: 0 | 1 | 2; txt: string } => {
    const base = kan[f] === '✓' ? 2 : kan[f] === '~' ? 1 : 0;
    if (f === 'adem') return { ok: base === 0 ? 0 : brOk ? (base as 1 | 2) : 0, txt: base === 0 ? 'niet op deze plek' : brOk ? `kwaliteit ${Math.round(proc.breathQ * 100)}%` : 'nu niet' };
    if (f === 'draaien') return { ok: proc.raw.hasGyro ? (proc.biasLearned > 0.5 ? (base as 0 | 1 | 2) : 1) : 0, txt: !proc.raw.hasGyro ? 'geen gyro' : proc.biasLearned > 0.5 ? 'nulpunt geleerd' : 'leg even stil voor nulpunt' };
    if (f === 'houding') return { ok: base as 0 | 1 | 2, txt: `${pos.posture}, ${pos.angle.toFixed(0)}°` };
    if (f === 'pas') return { ok: base as 0 | 1 | 2, txt: body.acc.cadence ? `${Math.round(body.acc.cadence)}/min` : `${steps} in 10 s` };
    if (f === 'sprong') return { ok: base as 0 | 1 | 2, txt: jumps.length ? `${jumps.length} in 1 min` : 'spring maar' };
    return { ok: base as 0 | 1 | 2, txt: `${body.acc.sway.toFixed(0)} mg` };
  };

  return (
    <div className="space-y-5">
      {/* kiezen: sensor en draagplek */}
      <div className="flex flex-wrap items-center gap-2">
        {bodies.map((b) => (
          <button key={b.id} className={`chip ${b.id === body.id ? 'on' : ''}`} onClick={() => onPick(b.id)}>
            <BodyDot b={b} size={8} /> {sourceMark(b)} {b.name}
          </button>
        ))}
        <span className="mx-2 text-ink-4">·</span>
        <span className="mono text-[11px] text-ink-3 mr-1">draagplek</span>
        {(Object.keys(PLEKKEN) as Plek[]).map((p) => (
          <button key={p} className={`chip ${p === plek ? 'on' : ''}`} onClick={() => setPlek(p)}>{PLEKKEN[p].label}</button>
        ))}
      </div>

      {/* wat wordt er gemeten */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
        {(['pas', 'onrust', 'houding', 'adem', 'draaien', 'sprong'] as Feature[]).map((f) => {
          const s = status(f);
          return (
            <div key={f} className="card px-3 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.ok === 2 ? 'var(--sk-ink)' : s.ok === 1 ? 'transparent' : 'transparent', boxShadow: s.ok === 1 ? 'inset 0 0 0 2px var(--sk-ink)' : s.ok === 0 ? 'inset 0 0 0 1.5px var(--sk-ink-4)' : 'none' }} />
                <span className={`text-[14px] ${s.ok ? '' : 'text-ink-4'}`}>{f}</span>
              </div>
              <div className="mono text-[10.5px] text-ink-3 mt-1 truncate">{s.txt}</div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Plot proc={proc} kind="acc" title="versnelling (mg) · x y z en totaal · 10 s" />
          {proc.raw.hasGyro && <Plot proc={proc} kind="gyro" title="draaisnelheid (°/s, na nulpuntcorrectie) · 10 s" />}
          <div className="card p-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <Label>ademsignaal · 40 s · elke streep is een ademhaling</Label>
              <div className="flex items-baseline gap-3">
                <span className={`text-[22px] font-light tracking-[-0.02em] ${brOk ? '' : 'text-ink-3'}`}>{brWhy}</span>
                <span className="mono text-[11px] text-ink-3">kwaliteit {Math.round(proc.breathQ * 100)}% · amplitude {proc.breathAmp.toFixed(1)} mg</span>
              </div>
            </div>
            <BreathPlot proc={proc} />
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5 flex flex-col items-center">
            {body.extra?.device === 'm5' ? <Stick3D proc={proc} id={body.id} /> : <Attitude pitch={pos.pitch} roll={pos.roll} angle={pos.angle} />}
            <div className="text-[30px] font-light tracking-[-0.03em] mt-3">{pos.posture}</div>
            <div className="mono text-[11px] text-ink-3">{pos.angle.toFixed(0)}° van nulstand · voorover {pos.pitch.toFixed(0)}° · zij {pos.roll.toFixed(0)}°</div>
            <button className="btn mt-3" onClick={() => proc.recalibrate()}>dit is rechtop</button>
          </div>

          <div className="card p-4">
            <Label>gebeurtenissen · laatste minuut</Label>
            <div className="grid grid-cols-3 gap-2 mt-2 text-center">
              <Stat v={steps} l="passen (10 s)" />
              <Stat v={jumps.length} l="sprongen" />
              <Stat v={turns.reduce((s, e) => s + e.value, 0) / 360} l="omwentelingen" dec={1} />
            </div>
            <div className="mt-3 space-y-1 max-h-[140px] overflow-auto scroll">
              {[...jumps, ...turns, ...recent.filter((e) => e.kind === 'schok')]
                .sort((a, b) => b.t - a.t)
                .slice(0, 8)
                .map((e, i) => (
                  <div key={i} className="flex justify-between mono text-[11.5px]">
                    <span className="text-ink-3">{((now - e.t) / 1000).toFixed(0)} s</span>
                    <span>
                      {e.kind === 'sprong'
                        ? `sprong · ${e.value.toFixed(0)} ms lucht · ±${Math.round(((9.81 * (e.value / 1000) ** 2) / 8) * 100)} cm`
                        : e.kind === 'draai'
                          ? `draai · ${Math.round(e.value)}° (${(e.value / 360).toFixed(1)}×)`
                          : `schok · ${Math.round(e.value)} mg`}
                    </span>
                  </div>
                ))}
            </div>
          </div>

          <div className="card p-4">
            <Label>sensor en verbinding</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mt-2 mono text-[11.5px]">
              <span className="text-ink-3">samplerate</span><span>{proc.rateHz.toFixed(1)} Hz</span>
              <span className="text-ink-3">zwaartekracht</span><span className={Math.abs(gmag - 1000) > 60 ? 'text-hart' : ''}>{gmag.toFixed(0)} mg {Math.abs(gmag - 1000) > 60 ? '(beweegt of afwijking)' : '✓'}</span>
              <span className="text-ink-3">ruis in rust</span><span>{proc.noiseMg.toFixed(1)} mg</span>
              {proc.raw.hasGyro && (
                <>
                  <span className="text-ink-3">gyro-nulpunt</span>
                  <span>{proc.gyroBias.map((q) => q.toFixed(0)).join(' / ')} °/s {proc.biasLearned > 0.5 ? '✓' : '…'}</span>
                </>
              )}
              {link && (
                <>
                  <span className="text-ink-3">pakketten</span>
                  <span>{link.lost ? `${((link.lost / (link.got + link.lost)) * 100).toFixed(1)}% kwijt` : 'niets kwijt ✓'}</span>
                </>
              )}
              {body.extra?.bat !== undefined && (
                <>
                  <span className="text-ink-3">batterij</span><span>{body.extra.bat}%</span>
                </>
              )}
            </div>
            {proc.raw.hasGyro && <button className="btn mt-3" onClick={() => proc.resetGyroBias()}>gyro-nulpunt opnieuw leren</button>}
          </div>
        </div>
      </div>

      <Uitleg title="Draagplek">
        <p>{PLEKKEN[plek].tip}</p>
      </Uitleg>
      <Uitleg title="Kalibreren in drie stappen">
        <ul>
          <li><b>Nulpunt gyro.</b> Leg de sensor 3 seconden helemaal stil. Het nulpunt (bias) wordt dan vanzelf geleerd; daarna staat de draaisnelheid in rust op ongeveer 0.</li>
          <li><b>Rechtop.</b> Bevestig de sensor, ga rechtop staan en druk op ‘dit is rechtop’. Houding en hoofdstand worden daarna vanaf deze stand gemeten.</li>
          <li><b>Adem.</b> Sensor strak op borst of buik. Na twee à drie ademhalingen verschijnt het tempo; elke ademhaling wordt apart herkend, van heel langzaam (3 per minuut) tot hijgen.</li>
          <li><b>Assen van de stick.</b> Druk op ‘stel assen in’: één keer rechtop (USB-C onder, scherm naar je toe), één keer plat met het scherm omhoog. Daarna draait het 3D-model mee.</li>
        </ul>
      </Uitleg>
      <Uitleg title="Wat de getallen betekenen">
        <ul>
          <li><b>Zwaartekracht</b> hoort in rust 1000 mg te zijn. Wijkt het veel af terwijl je stilstaat, dan is de sensor slecht gekalibreerd.</li>
          <li><b>Ademkwaliteit</b> combineert signaalsterkte boven de ruis met hoe regelmatig de laatste ademhalingen waren. Bewust wisselen (ademoefening) mag; bij lopen of springen zakt hij naar 0 en zegt het Lummellab eerlijk ‘geen adem’.</li>
          <li><b>Sprong</b>: de sensor voelt in de lucht bijna geen versnelling (vrije val). Uit de vliegtijd volgt de hoogte: h = g·t²/8.</li>
          <li><b>Omwenteling</b>: de draaisnelheid opgeteld zolang hij boven 120 °/s blijft. 360° is één hele draai, salto of pirouette.</li>
        </ul>
      </Uitleg>
    </div>
  );
}

function Stat({ v, l, dec = 0 }: { v: number; l: string; dec?: number }) {
  return (
    <div>
      <div className="text-[34px] font-light tracking-[-0.03em] leading-none tabular-nums">{v.toFixed(dec)}</div>
      <div className="mono text-[10px] text-ink-3 mt-1">{l}</div>
    </div>
  );
}

/** Kantelende tegel: hoe de sensor ten opzichte van de zwaartekracht ligt. */
function Attitude({ pitch, roll, angle }: { pitch: number; roll: number; angle: number }) {
  const upside = angle > 125;
  return (
    <div className="relative w-[180px] h-[180px]" style={{ perspective: 520 }}>
      <div className="absolute inset-0 rounded-full" style={{ boxShadow: 'inset 0 0 0 1.5px color-mix(in oklab, var(--sk-ink) 25%, transparent)' }} />
      <div className="absolute left-1/2 top-1/2 w-[2px] h-[86px] -translate-x-1/2 -translate-y-full" style={{ background: 'color-mix(in oklab, var(--sk-ink) 25%, transparent)' }} />
      <div
        className="absolute left-1/2 top-1/2 w-[70px] h-[110px] -ml-[35px] -mt-[55px]"
        style={{ transform: `rotateX(${-pitch}deg) rotateY(${roll}deg)`, transformStyle: 'preserve-3d', transition: 'transform 120ms linear' }}
      >
        <div className="absolute inset-0" style={{ background: upside ? 'var(--sk-hart)' : 'var(--sk-ink)', clipPath: 'polygon(14px 0, calc(100% - 14px) 0, 100% 14px, 100% calc(100% - 14px), calc(100% - 14px) 100%, 14px 100%, 0 calc(100% - 14px), 0 14px)' }} />
        <div className="absolute left-1/2 top-[14px] w-[18px] h-[18px] -ml-[9px] rounded-full" style={{ background: 'var(--sk-bg)' }} />
      </div>
    </div>
  );
}

/** Lopende grafiek van de ruwe buffer. */
function Plot({ proc, kind, title }: { proc: AccProcessor; kind: 'acc' | 'gyro'; title: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = ref.current;
      if (c) {
        const css = getComputedStyle(c);
        const col = ['--sk-hart', '--sk-adem', '--sk-ink'].map((v) => css.getPropertyValue(v).trim());
        const ink = col[2];
        const g = c.getContext('2d')!;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const W = (c.width = c.clientWidth * dpr);
        const H = (c.height = c.clientHeight * dpr);
        g.clearRect(0, 0, W, H);
        const r = proc.raw;
        const tEnd = r.count ? r.t[(r.head - 1 + r.t.length) % r.t.length] : performance.now();
        const span = 10000;
        const idx = [...r.range(tEnd - span)];
        const src = kind === 'acc' ? r.a : r.g;
        let lo = Infinity;
        let hi = -Infinity;
        for (const i of idx) for (let k = 0; k < 3; k++) (lo = Math.min(lo, src[k][i])), (hi = Math.max(hi, src[k][i]));
        if (kind === 'acc') (lo = Math.min(lo, -200)), (hi = Math.max(hi, 1200));
        else (lo = Math.min(lo, -60)), (hi = Math.max(hi, 60));
        const pad = (hi - lo) * 0.08;
        lo -= pad;
        hi += pad;
        const x = (t: number) => ((t - (tEnd - span)) / span) * W;
        const y = (v: number) => H - ((v - lo) / (hi - lo)) * H;
        // nullijn en 1 g
        g.strokeStyle = ink;
        g.globalAlpha = 0.18;
        g.lineWidth = dpr;
        for (const v of kind === 'acc' ? [0, 1000] : [0]) {
          g.beginPath();
          g.moveTo(0, y(v));
          g.lineTo(W, y(v));
          g.stroke();
        }
        g.globalAlpha = 1;
        const series: [number, (i: number) => number, string, number][] = [
          [0, (i) => src[0][i], col[0], 1.4],
          [1, (i) => src[1][i], col[1], 1.4],
          [2, (i) => src[2][i], ink, 1.4],
          [3, (i) => Math.hypot(src[0][i], src[1][i], src[2][i]), ink, 2.6],
        ];
        for (const [k, f, color, lw] of series) {
          g.beginPath();
          let first = true;
          for (const i of idx) {
            const px = x(r.t[i]);
            const py = y(f(i));
            if (first) g.moveTo(px, py);
            else g.lineTo(px, py);
            first = false;
          }
          g.strokeStyle = color;
          g.globalAlpha = k === 3 ? 0.9 : 0.75;
          g.lineWidth = lw * dpr;
          g.stroke();
        }
        g.globalAlpha = 1;
        // gebeurtenissen
        for (const e of proc.events) {
          if (e.t < tEnd - span) continue;
          if (kind === 'acc' && e.kind === 'draai') continue;
          if (kind === 'gyro' && e.kind !== 'draai') continue;
          g.fillStyle = ink;
          g.font = `500 ${10 * dpr}px "Geist Mono", monospace`;
          g.fillText(e.kind === 'pas' ? '▴' : e.kind === 'sprong' ? '↑ sprong' : e.kind === 'draai' ? `↻ ${Math.round(e.value)}°` : '✶', x(e.t) - 3 * dpr, 12 * dpr);
        }
        g.fillStyle = ink;
        g.globalAlpha = 0.6;
        g.font = `${10 * dpr}px "Geist Mono", monospace`;
        g.fillText(kind === 'acc' ? 'x  y  z  |a|' : 'x  y  z  |ω|', W - 90 * dpr, H - 8 * dpr);
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [proc, kind]);
  return (
    <div className="card p-4">
      <Label>{title}</Label>
      <canvas ref={ref} className="w-full h-[150px] block mt-2" />
    </div>
  );
}

function BreathPlot({ proc }: { proc: AccProcessor }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const c = ref.current;
      if (c) {
        const css = getComputedStyle(c);
        const ink = css.getPropertyValue('--sk-ink').trim();
        const adem = css.getPropertyValue('--sk-adem').trim();
        const g = c.getContext('2d')!;
        const dpr = Math.min(2, devicePixelRatio || 1);
        const W = (c.width = c.clientWidth * dpr);
        const H = (c.height = c.clientHeight * dpr);
        g.clearRect(0, 0, W, H);
        const N = proc.breath.length;
        const n = proc.breathCount;
        const vals: number[] = [];
        for (let k = n; k > 0; k--) vals.push(proc.breath[(proc.breathHead - k + N) % N]);
        const amp = Math.max(4, proc.breathAmp * 3, ...vals.map(Math.abs));
        const y = (v: number) => H / 2 - (v / amp) * (H * 0.45);
        // band = ±amplitude
        g.fillStyle = adem;
        g.globalAlpha = 0.15;
        g.fillRect(0, y(proc.breathAmp), W, y(-proc.breathAmp) - y(proc.breathAmp));
        g.globalAlpha = 1;
        g.beginPath();
        vals.forEach((v, i) => {
          const px = W - (vals.length - 1 - i) * (W / (N - 1));
          if (i) g.lineTo(px, y(v));
          else g.moveTo(px, y(v));
        });
        // gedetecteerde ademhalingen
        const tEnd = proc.lastT;
        g.fillStyle = ink;
        g.font = `${9 * dpr}px "Geist Mono", monospace`;
        let prev = 0;
        for (const tb of proc.breaths) {
          const px = W - ((tEnd - tb) / (N * 100)) * W;
          if (px < 0) {
            prev = tb;
            continue;
          }
          g.globalAlpha = 0.55;
          g.fillRect(px, 0, 1.5 * dpr, H);
          if (prev) {
            g.globalAlpha = 0.8;
            g.fillText(`${((tb - prev) / 1000).toFixed(1)}s`, px + 3 * dpr, 10 * dpr);
          }
          prev = tb;
        }
        g.globalAlpha = 1;
        g.strokeStyle = proc.breathQ > 0.35 ? adem : ink;
        g.globalAlpha = proc.breathQ > 0.35 ? 1 : 0.45;
        g.lineWidth = 2.2 * dpr;
        g.stroke();
        g.globalAlpha = 1;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [proc]);
  return <canvas ref={ref} className="w-full h-[120px] block mt-3" />;
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
    /* niet onthouden */
  }
}
