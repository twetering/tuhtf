import { useEffect, useRef } from 'react';
import { Fan, Hum, hddSeek, modemHandshake, ping } from './sound';

/**
 * Wat een machine 'voelt' van jou. beat en breath lopen continu op (aantal + fractie),
 * level is de ademcurve (0 = uit, 1 = vol in). In 'eigen tempo' komen ze uit de klok.
 */
export type Drive = { beat: number; breath: number; level: number; inhaling: boolean; hr: number; br: number; mirrored: boolean };

function useCanvas(draw: (g: CanvasRenderingContext2D, W: number, H: number, t: number) => void, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null);
  const fn = useRef(draw);
  fn.current = draw;
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      if (c) {
        const dpr = Math.min(2, devicePixelRatio || 1);
        const W = (c.width = c.clientWidth * dpr);
        const H = (c.height = c.clientHeight * dpr);
        fn.current(c.getContext('2d')!, W, H, performance.now() / 1000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/** Doet iets bij elke nieuwe hele slag/ademhaling. */
function useWhole(value: number, fn: (n: number) => void) {
  const last = useRef(Math.floor(value));
  const n = Math.floor(value);
  useEffect(() => {
    if (n !== last.current) {
      last.current = n;
      fn(n);
    }
  });
}

// ---------------------------------------------------------------------------- vaatwasser: vloerprojectie

/** Een moderne vaatwasser projecteert de resterende tijd als lichtvlek op de keukenvloer. */
export function Projectie({ d, soundOn }: { d: Drive; soundOn: boolean }) {
  const dRef = useRef(d);
  dRef.current = d;
  useEffect(() => {
    if (!soundOn) return;
    const h = new Hum('lowpass', 380, 1, 0.1, 49);
    return () => h.stop();
  }, [soundOn]);
  const total = 72 * 60;
  const ref = useCanvas((g, W, H, t) => {
    const d = dRef.current;
    // vloer: donkere tegels in perspectief
    g.fillStyle = '#16141a';
    g.fillRect(0, 0, W, H);
    const horizon = H * 0.16;
    g.strokeStyle = 'rgba(255,255,255,.035)';
    g.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      g.beginPath();
      g.moveTo(W / 2 + i * W * 0.02, horizon);
      g.lineTo(W / 2 + i * W * 0.16, H);
      g.stroke();
    }
    for (let k = 1; k < 9; k++) {
      const y = horizon + (H - horizon) * (k / 9) ** 1.6;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(W, y);
      g.stroke();
    }
    // plint van de vaatwasser
    g.fillStyle = '#2a2830';
    g.fillRect(W * 0.18, 0, W * 0.64, horizon);
    g.fillStyle = '#3a3842';
    g.fillRect(W * 0.18, horizon - 6, W * 0.64, 6);
    // lichtbundel op de vloer
    const cx = W / 2;
    const cy = horizon + (H - horizon) * 0.42;
    const pulse = 0.85 + 0.15 * d.level;
    const grad = g.createRadialGradient(cx, cy, 10, cx, cy, W * 0.36);
    grad.addColorStop(0, `rgba(120,170,255,${0.22 * pulse})`);
    grad.addColorStop(1, 'rgba(120,170,255,0)');
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.42);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, W * 0.36, 0, Math.PI * 2);
    g.translate(-cx, -cy);
    g.fill();
    g.restore();
    // golven die per ademhaling uitdijen
    g.save();
    g.translate(cx, cy);
    g.scale(1, 0.42);
    for (let k = 0; k < 4; k++) {
      const ph = (d.breath + k / 4) % 1;
      g.strokeStyle = `rgba(170,205,255,${(1 - ph) * 0.35})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, W * (0.08 + ph * 0.26), 0, Math.PI * 2);
      g.stroke();
    }
    // tijd, platgedrukt alsof hij op de vloer ligt
    const secs = Math.max(0, total - Math.floor(d.beat * (d.mirrored ? 1 : 1)));
    const txt = `${Math.floor(secs / 3600)}:${String(Math.floor((secs / 60) % 60)).padStart(2, '0')}`;
    g.scale(1, 1.6);
    g.fillStyle = `rgba(215,230,255,${0.75 + 0.2 * d.level})`;
    g.shadowColor = 'rgba(140,180,255,.9)';
    g.shadowBlur = 30;
    g.font = `200 ${W * 0.13}px Geist, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(txt, 0, 0);
    g.shadowBlur = 0;
    g.restore();
    void t;
  });
  return <canvas ref={ref} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------- serverruimte

export function Server({ d, soundOn }: { d: Drive; soundOn: boolean }) {
  const dRef = useRef(d);
  dRef.current = d;
  const fan = useRef<Fan | null>(null);
  useEffect(() => {
    if (!soundOn) return;
    fan.current = new Fan(0.09);
    return () => {
      fan.current?.stop();
      fan.current = null;
    };
  }, [soundOn]);
  const rpm = 1200 + Math.max(0, d.hr - 50) * 65;
  fan.current?.set(rpm);
  const flash = useRef(0);
  useWhole(d.beat, () => (flash.current = performance.now()));
  const leds = useRef<number[]>([]);
  const ref = useCanvas((g, W, H, t) => {
    const d = dRef.current;
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, W, H);
    const racks = 4;
    const rw = W / (racks + 0.6);
    const since = (performance.now() - flash.current) / 1000;
    for (let r = 0; r < racks; r++) {
      const x0 = rw * 0.3 + r * rw;
      g.fillStyle = '#16191e';
      g.fillRect(x0, H * 0.06, rw * 0.86, H * 0.88);
      const units = 14;
      for (let u = 0; u < units; u++) {
        const y = H * 0.09 + u * ((H * 0.82) / units);
        const uh = (H * 0.82) / units - 4;
        g.fillStyle = '#1f2329';
        g.fillRect(x0 + 6, y, rw * 0.86 - 12, uh);
        // ventilatorrooster
        g.fillStyle = '#121418';
        for (let k = 0; k < 5; k++) g.fillRect(x0 + rw * 0.4 + k * 9, y + uh * 0.25, 5, uh * 0.5);
        // leds
        for (let k = 0; k < 3; k++) {
          const i = (r * units + u) * 3 + k;
          leds.current[i] ??= Math.random();
          const rate = 0.6 + (d.hr / 60) * 2.5;
          const on = ((t * rate + leds.current[i] * 7) % 1) < 0.35 || since < 0.12 * (1 + k);
          g.fillStyle = on ? (k === 2 ? '#ffb340' : '#3dff8a') : '#123';
          g.fillRect(x0 + 14 + k * 10, y + uh * 0.35, 5, uh * 0.3);
        }
      }
    }
    // warmte-waas
    g.fillStyle = `rgba(255,120,40,${Math.min(0.18, Math.max(0, (d.hr - 60) / 300))})`;
    g.fillRect(0, 0, W, H);
  });
  return (
    <div className="relative w-full h-full">
      <canvas ref={ref} className="w-full h-full" />
      <div className="absolute left-4 bottom-3 mono text-[12px] text-[#3dff8a]">{Math.round(rpm).toLocaleString('nl-NL')} rpm · koeling volgt {d.mirrored ? 'jouw hart' : 'eigen tempo'}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------- nieuwe wereld laden

const TIPS = [
  'Tip: je hoeft niets te doen terwijl je wacht.',
  'Tip: wachten is ook een vaardigheid.',
  'Tip: de wereld laadt sneller als je er niet naar kijkt. Of niet.',
  'Tip: adem uit. Het laden gaat door.',
  'Tip: in deze wereld is lummelen een kracht.',
  'Tip: je schouders mogen ook laden. Omlaag.',
];
export function Laden({ d }: { d: Drive }) {
  const dRef = useRef(d);
  dRef.current = d;
  const ref = useCanvas((g, W, H, t) => {
    const d = dRef.current;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, W, H);
    // sterrenveld dat langzaam draait
    for (let i = 0; i < 90; i++) {
      const a = i * 2.39996 + t * 0.01;
      const r = ((i * 97) % 100) / 100;
      g.fillStyle = `rgba(255,255,255,${0.15 + (i % 5) * 0.08})`;
      g.fillRect(W / 2 + Math.cos(a) * r * W * 0.6, H / 2 + Math.sin(a) * r * H * 0.6, 2, 2);
    }
    const cycleBeats = 140;
    const p = (d.beat % cycleBeats) / cycleBeats;
    const stall = Math.sin(d.beat * 0.37) > 0.85 ? 0.97 : 1; // af en toe een hapering
    const prog = Math.min(1, p * stall);
    // spinner (op de adem)
    const cx = W * 0.5;
    const cy = H * 0.42;
    g.lineWidth = W * 0.008;
    g.lineCap = 'round';
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2 + d.breath * Math.PI * 2;
      g.strokeStyle = `rgba(255,255,255,${0.12 + 0.75 * (k / 12)})`;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * W * 0.035, cy + Math.sin(a) * W * 0.035);
      g.lineTo(cx + Math.cos(a) * W * 0.06, cy + Math.sin(a) * W * 0.06);
      g.stroke();
    }
    g.textAlign = 'center';
    g.fillStyle = '#e8ecff';
    g.font = `300 ${W * 0.034}px Geist, sans-serif`;
    g.fillText(prog >= 0.995 ? 'Druk op een toets om verder te gaan' : 'Nieuwe wereld wordt geladen', cx, H * 0.66);
    // balk
    const bw = W * 0.5;
    g.fillStyle = 'rgba(255,255,255,.12)';
    g.fillRect(cx - bw / 2, H * 0.72, bw, 4);
    g.fillStyle = '#e8ecff';
    g.fillRect(cx - bw / 2, H * 0.72, bw * prog, 4);
    g.font = `${W * 0.016}px "Geist Mono", monospace`;
    g.fillStyle = 'rgba(232,236,255,.6)';
    g.fillText(`${Math.floor(prog * 100)}%  ·  terrein genereren  ·  ${Math.floor(d.beat) % 9973} brokken`, cx, H * 0.79);
    g.fillText(TIPS[Math.floor(d.breath / 6) % TIPS.length], cx, H * 0.9);
  });
  return <canvas ref={ref} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------- modem + bestanden kopiëren (jaren '90)

export function Modem({ d, soundOn }: { d: Drive; soundOn: boolean }) {
  const dRef = useRef(d);
  dRef.current = d;
  const startedAt = useRef(performance.now());
  useEffect(() => {
    if (!soundOn) return;
    modemHandshake(0.16);
    startedAt.current = performance.now();
    const carrier = new Hum('bandpass', 1750, 2.5, 0.025);
    return () => carrier.stop();
  }, [soundOn]);
  useWhole(d.beat, () => soundOn && Math.random() < 0.3 && ping(0.04, 1));
  const ref = useCanvas((g, W, H) => {
    const d = dRef.current;
    const s = W / 800;
    g.fillStyle = '#008080';
    g.fillRect(0, 0, W, H);
    const win = (x: number, y: number, w: number, h: number, title: string) => {
      g.fillStyle = '#c0c0c0';
      g.fillRect(x, y, w, h);
      g.fillStyle = '#fff';
      g.fillRect(x, y, w, 2 * s);
      g.fillRect(x, y, 2 * s, h);
      g.fillStyle = '#404040';
      g.fillRect(x, y + h - 2 * s, w, 2 * s);
      g.fillRect(x + w - 2 * s, y, 2 * s, h);
      g.fillStyle = '#000080';
      g.fillRect(x + 4 * s, y + 4 * s, w - 8 * s, 20 * s);
      g.fillStyle = '#fff';
      g.font = `bold ${12 * s}px Tahoma, Verdana, sans-serif`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(title, x + 10 * s, y + 14 * s);
    };
    // kopieer-venster
    const x = 140 * s;
    const y = 90 * s;
    win(x, y, 520 * s, 230 * s, 'Bezig met kopiëren...');
    // mappen
    const folder = (fx: number) => {
      g.fillStyle = '#e8c547';
      g.fillRect(fx, y + 60 * s, 50 * s, 36 * s);
      g.fillRect(fx, y + 54 * s, 22 * s, 8 * s);
    };
    folder(x + 40 * s);
    folder(x + 430 * s);
    // vliegend blaadje, één per slag
    const f = d.beat % 1;
    const px = x + 70 * s + f * 360 * s;
    const py = y + 62 * s - Math.sin(f * Math.PI) * 30 * s;
    g.save();
    g.translate(px, py);
    g.rotate(Math.sin(f * Math.PI * 2) * 0.4);
    g.fillStyle = '#fff';
    g.fillRect(-10 * s, -13 * s, 20 * s, 26 * s);
    g.fillStyle = '#7f7f7f';
    for (let k = 0; k < 4; k++) g.fillRect(-6 * s, -8 * s + k * 5 * s, 12 * s, 1.2 * s);
    g.restore();
    g.fillStyle = '#000';
    g.font = `${12 * s}px Tahoma, Verdana, sans-serif`;
    const files = ['LUMMELEN.TXT', 'ADEM.WAV', 'HART.BMP', 'STILTE.DOC', 'WACHTEN.EXE', 'NIETS.ZIP'];
    g.fillText(files[Math.floor(d.beat) % files.length], x + 20 * s, y + 130 * s);
    g.fillText(`Van 'C:\\LICHAAM' naar 'A:\\'`, x + 20 * s, y + 150 * s);
    // voortgang in blokjes
    const total = 30;
    const prog = Math.floor(((d.beat % 300) / 300) * total);
    g.fillStyle = '#fff';
    g.fillRect(x + 20 * s, y + 168 * s, 480 * s, 20 * s);
    g.fillStyle = '#000080';
    for (let k = 0; k < prog; k++) g.fillRect(x + 22 * s + k * 16 * s, y + 170 * s, 13 * s, 16 * s);
    // de beroemde schatting die steeds verandert
    const est = Math.max(1, Math.round(3 + Math.sin(d.breath * 1.3) * 2 + (300 - (d.beat % 300)) / 60));
    g.fillStyle = '#000';
    g.fillText(`Nog ${est} ${est === 1 ? 'minuut' : 'minuten'}`, x + 20 * s, y + 210 * s);
    // modemvenster
    const my = 350 * s;
    win(x + 60 * s, my, 400 * s, 90 * s, 'Verbonden met internet');
    g.fillStyle = '#000';
    g.font = `${12 * s}px Tahoma, Verdana, sans-serif`;
    const connected = (performance.now() - startedAt.current) / 1000 > 9 || !soundOn;
    g.fillText(connected ? `Verbonden met ${(28800).toLocaleString('nl-NL')} bps · ${Math.floor(d.beat * 3.6)} kB ontvangen` : 'Bezig met inbellen...', x + 80 * s, my + 50 * s);
    // lampjes (RD/SD) knipperen op de adem
    const lamp = (lx: number, on: boolean) => {
      g.fillStyle = on ? '#3dff3d' : '#205020';
      g.fillRect(lx, my + 68 * s, 10 * s, 8 * s);
    };
    lamp(x + 80 * s, d.inhaling);
    lamp(x + 100 * s, !d.inhaling);
  });
  return <canvas ref={ref} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------- defragmenteren

export function Defrag({ d, soundOn }: { d: Drive; soundOn: boolean }) {
  const dRef = useRef(d);
  dRef.current = d;
  const COLS = 48;
  const ROWS = 22;
  const grid = useRef<number[]>([]); // 0 vrij, 1 aaneengesloten, 2 gefragmenteerd, 3 bezig
  const cursor = useRef(0);
  if (!grid.current.length) grid.current = Array.from({ length: COLS * ROWS }, () => (Math.random() < 0.22 ? 0 : Math.random() < 0.55 ? 2 : 1));
  useWhole(d.beat, () => {
    const gr = grid.current;
    // zoek het eerstvolgende gefragmenteerde blok en zet het op zijn plek
    let i = gr.indexOf(2, cursor.current);
    if (i < 0) {
      grid.current = Array.from({ length: COLS * ROWS }, () => (Math.random() < 0.22 ? 0 : Math.random() < 0.55 ? 2 : 1));
      cursor.current = 0;
      return;
    }
    gr[i] = 1;
    cursor.current = Math.max(0, i - 2);
    i = gr.indexOf(0, cursor.current);
    if (i >= 0 && Math.random() < 0.4) gr[i] = 1;
    if (soundOn) hddSeek(0.2);
  });
  const ref = useCanvas((g, W, H) => {
    const s = W / 800;
    g.fillStyle = '#c0c0c0';
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#000080';
    g.fillRect(0, 0, W, 26 * s);
    g.fillStyle = '#fff';
    g.font = `bold ${13 * s}px Tahoma, Verdana, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText('Schijfdefragmentatie - station C:', 10 * s, 13 * s);
    const cw = (W - 40 * s) / COLS;
    const ch = (H * 0.68) / ROWS;
    const gr = grid.current;
    const colors = ['#ffffff', '#1f3fbf', '#d42a2a', '#2ad42a'];
    const active = gr.indexOf(2, cursor.current);
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        g.fillStyle = i === active ? colors[3] : colors[gr[i]];
        g.fillRect(20 * s + c * cw, 40 * s + r * ch, cw - 2 * s, ch - 2 * s);
      }
    const frag = gr.filter((v) => v === 2).length;
    const done = 1 - frag / Math.max(1, gr.length * 0.43);
    g.fillStyle = '#000';
    g.font = `${12 * s}px Tahoma, Verdana, sans-serif`;
    g.fillText(`${Math.max(0, Math.min(100, Math.floor(done * 100)))}% voltooid · bestanden worden op volgorde gezet`, 20 * s, H * 0.82);
    g.fillStyle = '#fff';
    g.fillRect(20 * s, H * 0.86, W - 40 * s, 18 * s);
    g.fillStyle = '#000080';
    g.fillRect(20 * s, H * 0.86, (W - 40 * s) * Math.max(0, Math.min(1, done)), 18 * s);
  });
  return <canvas ref={ref} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------- AI denkt na

const WOORDEN = ['Lummelen', 'Mijmeren', 'Overpeinzen', 'Sudderen', 'Dralen', 'Broeden', 'Dromen', 'Treuzelen', 'Rijpen', 'Weifelen', 'Drijven', 'Kauwen', 'Peinzen', 'Laten bezinken', 'Wolken kijken', 'Niksen', 'Prutsen', 'Zweven'];
export function Denkt({ d }: { d: Drive }) {
  const word = WOORDEN[Math.floor(d.beat / 7) % WOORDEN.length];
  const secs = Math.floor(d.beat);
  const scale = 0.85 + 0.3 * d.level;
  const rot = d.breath * 90;
  return (
    <div className="w-full h-full grid place-items-center" style={{ background: '#f4f1ea' }}>
      <div className="flex items-center gap-5">
        <svg viewBox="-50 -50 100 100" width={110} height={110} style={{ transform: `rotate(${rot}deg) scale(${scale})`, transition: 'transform 200ms linear' }}>
          {Array.from({ length: 12 }, (_, i) => (
            <path key={i} d="M0 -6 L3 -44 Q0 -48 -3 -44 Z" fill="#d97757" transform={`rotate(${i * 30}) scale(${i % 2 ? 0.78 : 1})`} />
          ))}
          <circle r={7} fill="#d97757" />
        </svg>
        <div>
          <div className="text-[40px] font-light tracking-[-0.02em]" style={{ color: '#3b3632', fontFamily: 'Geist, sans-serif' }}>{word}…</div>
          <div className="mono text-[13px] mt-1" style={{ color: '#8a827a' }}>({secs}s · {Math.floor(d.breath)} ademhalingen · denkt mee op {d.mirrored ? 'jouw ritme' : 'eigen tempo'})</div>
        </div>
      </div>
    </div>
  );
}
