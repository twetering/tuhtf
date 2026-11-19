import { useEffect, useRef, useState } from 'react';
import type { AccProcessor } from './motion';

/**
 * Live 3D-model van een M5StickC Plus2. Een wizard van twee standen legt vast hoe de assen van de
 * sensor in de behuizing liggen (boven = USB-C onder, voor = scherm). Daarna draait het model mee
 * met de echte stick (gyro + zwaartekracht).
 */
type Map3 = { up: number[]; front: number[] };
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: number[]) => {
  const n = Math.hypot(...a) || 1;
  return a.map((x) => x / n);
};
const mul = (A: number[][], B: number[][]) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
const T = (A: number[][]) => A[0].map((_, j) => A.map((r) => r[j]));
const C = [[1, 0, 0], [0, 0, -1], [0, -1, 0]]; // wereld (z omhoog) → CSS (y omlaag, z naar kijker)
const NT = [[1, 0, 0], [0, 0, 1], [0, -1, 0]]; // inverse van 'neutraal': rechtop, scherm naar de kijker

function load(id: string): Map3 | null {
  try {
    const s = localStorage.getItem(`sk-m5map-${id}`);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}
function save(id: string, m: Map3) {
  try {
    localStorage.setItem(`sk-m5map-${id}`, JSON.stringify(m));
  } catch {
    /* niet onthouden */
  }
}

export default function Stick3D({ proc, id }: { proc: AccProcessor; id: string }) {
  const [map, setMap] = useState<Map3 | null>(() => load(id));
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [pendingUp, setPendingUp] = useState<number[] | null>(null);
  const yaw0 = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef(map);
  mapRef.current = map;

  const modelMatrix = () => {
    const m = mapRef.current ?? { up: [0, 1, 0], front: [0, 0, 1] };
    const up = norm(m.up);
    const front = norm(m.front.map((f, i) => f - up[i] * (m.front[0] * up[0] + m.front[1] * up[1] + m.front[2] * up[2])));
    const right = cross(up, front);
    const M = [right, up, front]; // sensor → model (rijen)
    return mul(proc.rotation(), T(M)); // model → wereld
  };
  const resetYaw = () => {
    const R = modelMatrix();
    yaw0.current = Math.atan2(R[0][2], -R[1][2]);
  };

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const el = box.current;
      if (el) {
        const c = Math.cos(-yaw0.current);
        const s = Math.sin(-yaw0.current);
        const Rz = [[c, -s, 0], [s, c, 0], [0, 0, 1]];
        const Tm = mul(mul(mul(C, mul(Rz, modelMatrix())), NT), C);
        // matrix3d is kolom-gewijs
        el.style.transform = `matrix3d(${Tm[0][0]},${Tm[1][0]},${Tm[2][0]},0,${Tm[0][1]},${Tm[1][1]},${Tm[2][1]},0,${Tm[0][2]},${Tm[1][2]},${Tm[2][2]},0,0,0,0,1)`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proc]);

  const capture = () => {
    const v = proc.upVector();
    if (step === 1) {
      setPendingUp(v);
      setStep(2);
    } else if (step === 2 && pendingUp) {
      const m = { up: pendingUp, front: v };
      setMap(m);
      save(id, m);
      setStep(0);
      setTimeout(resetYaw, 50);
    }
  };

  const k = 3.2; // px per mm
  const W = 25 * k;
  const H = 54 * k;
  const D = 13.5 * k;
  const face = (w: number, h: number, transform: string, children?: React.ReactNode, bg = '#ff6a1a') => (
    <div className="absolute left-1/2 top-1/2" style={{ width: w, height: h, marginLeft: -w / 2, marginTop: -h / 2, transform, background: bg, backfaceVisibility: 'hidden', borderRadius: 3, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.18)' }}>
      {children}
    </div>
  );

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full h-[250px]" style={{ perspective: 700 }}>
        <div ref={box} className="absolute left-1/2 top-1/2 w-0 h-0" style={{ transformStyle: 'preserve-3d' }}>
          {/* voorkant: scherm + knop A */}
          {face(W, H, `translateZ(${D / 2}px)`, <>
            <div className="absolute left-[14%] right-[14%] top-[8%] h-[52%] rounded-[3px]" style={{ background: '#111', boxShadow: 'inset 0 0 0 2px #333' }}>
              <div className="absolute inset-[10%] rounded-[2px]" style={{ background: 'linear-gradient(160deg,#5a12c4,#2a0a6a)' }} />
            </div>
            <div className="absolute left-1/2 top-[69%] -translate-x-1/2 w-[46%] aspect-square rounded-full grid place-items-center text-[11px] font-semibold" style={{ background: '#e85a10', color: '#fff', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.2)' }}>M5</div>
            <div className="absolute left-0 right-0 bottom-[4%] text-center text-[8px] font-medium" style={{ color: '#7a2a00' }}>A</div>
          </>)}
          {face(W, H, `rotateY(180deg) translateZ(${D / 2}px)`, <div className="absolute inset-0 grid place-items-center text-[9px]" style={{ color: '#7a2a00' }}>achterkant</div>, '#f05f12')}
          {/* rechterzijde: knop B */}
          {face(D, H, `rotateY(90deg) translateZ(${W / 2}px)`, <div className="absolute left-1/2 top-[26%] -translate-x-1/2 w-[38%] h-[14%] rounded-[2px] grid place-items-center text-[8px]" style={{ background: '#d9550f', color: '#fff' }}>B</div>, '#e8600f')}
          {/* linkerzijde: aan/uit */}
          {face(D, H, `rotateY(-90deg) translateZ(${W / 2}px)`, <div className="absolute left-1/2 top-[30%] -translate-x-1/2 w-[38%] h-[10%] rounded-[2px]" style={{ background: '#d9550f' }} />, '#e8600f')}
          {/* boven: IR + pijl */}
          {face(W, D, `rotateX(90deg) translateZ(${H / 2}px)`, <div className="absolute inset-0 grid place-items-center text-[9px] font-semibold" style={{ color: '#7a2a00' }}>▲ boven</div>, '#f47020')}
          {/* onder: USB-C */}
          {face(W, D, `rotateX(-90deg) translateZ(${H / 2}px)`, <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[36%] h-[30%] rounded-full" style={{ background: '#222' }} />, '#d9550f')}
        </div>
      </div>

      {step === 0 ? (
        <div className="text-center">
          <div className="mono text-[11px] text-ink-3">{map ? 'assen ingesteld · draait mee' : 'assen nog niet ingesteld: het model kan verkeerd staan'}</div>
          <div className="flex gap-2 justify-center mt-2">
            <button className={`btn ${map ? '' : 'accent'}`} onClick={() => setStep(1)}>{map ? 'opnieuw instellen' : 'stel assen in (2 stappen)'}</button>
            <button className="btn" onClick={resetYaw} title="draai het model zo dat het scherm naar je toe wijst">↺ kijkrichting</button>
          </div>
        </div>
      ) : (
        <div className="card p-4 w-full text-center">
          <div className="mono text-[10.5px] text-ink-3">stap {step} van 2</div>
          <div className="text-[18px] mt-1 leading-snug">
            {step === 1 ? 'Houd de stick rechtop: USB-C naar beneden, scherm naar je toe.' : 'Leg de stick plat op tafel, scherm naar boven.'}
          </div>
          <div className="text-[12.5px] text-ink-3 mt-1">Houd hem een tel stil en druk dan op ‘vastleggen’.</div>
          <div className="flex gap-2 justify-center mt-3">
            <button className="btn accent" onClick={capture}>vastleggen</button>
            <button className="btn" onClick={() => setStep(0)}>annuleer</button>
          </div>
        </div>
      )}
    </div>
  );
}
