/**
 * Gesimuleerde "leerling" met een sensor om de pols, om alles zonder hardware
 * te kunnen proberen. Elk dier heeft een eigen beweging; elke gesimuleerde
 * persoon doet het net anders (groter, sneller, schuiner).
 */

export type Style = { amp: number; tempo: number; tilt: number; seed: number };

export function randomStyle(): Style {
  return { amp: 0.7 + Math.random() * 0.6, tempo: 0.8 + Math.random() * 0.45, tilt: (Math.random() - 0.5) * 30, seed: Math.random() * 100 };
}

const gauss = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const R = Math.PI / 180;

/** Zwaartekracht (mg) voor een houding: pitch = naar voren kantelen, roll = om de lengteas. */
function gravity(pitch: number, roll: number) {
  return [1000 * Math.sin(roll * R) * Math.cos(pitch * R), 1000 * Math.sin(pitch * R), 1000 * Math.cos(pitch * R) * Math.cos(roll * R)];
}

/** Eén sample op tijd t (s). Geeft versnelling (mg) en gyro (°/s). */
export function simSample(animal: string, t: number, s: Style): { a: number[]; g: number[] } {
  const T = t * s.tempo + s.seed;
  let pitch = s.tilt, roll = 0;
  let a = [0, 0, 0], g = [0, 0, 0];
  const A = s.amp;
  switch (animal) {
    case 'kikker': {
      // gehurkt stilzitten, dan een sprong: afzet, zweven, landing
      pitch += 35;
      const P = 1.5;
      const ph = (T % P) / P;
      if (ph < 0.08) a[2] += A * 2300 * Math.sin((ph / 0.08) * Math.PI);
      else if (ph < 0.2) a[2] -= 800; // zweven: bijna gewichtloos
      else if (ph < 0.27) a[2] += A * 2000 * Math.sin(((ph - 0.2) / 0.07) * Math.PI);
      if (ph < 0.27) g = [A * 160 * Math.sin(ph * 25), 0, 0];
      break;
    }
    case 'vogel': {
      // armen fladderen: snel, op en neer
      const w = 2 * Math.PI * 2.8;
      roll += 25 * Math.sin(w * T);
      a = [0, A * 300 * Math.sin(2 * w * T), A * 900 * Math.sin(w * T)];
      g = [A * 260 * Math.cos(w * T), A * 40 * Math.sin(w * T), 0];
      break;
    }
    case 'slang': {
      // arm laag en naar voren, langzaam kronkelen: veel draaien, weinig klappen
      pitch += 70;
      const w = 2 * Math.PI * 0.55;
      roll += A * 55 * Math.sin(w * T);
      a = [A * 220 * Math.sin(w * T + 0.6), 0, A * 60 * Math.sin(2 * w * T)];
      g = [0, A * 50 * Math.cos(w * T) * w * 3, A * 140 * Math.cos(w * T)];
      break;
    }
    case 'paard': {
      // galop: dubbele klap per pas, rechtop
      const w = 2 * Math.PI * 1.9;
      const p1 = Math.max(0, Math.sin(w * T)) ** 4, p2 = Math.max(0, Math.sin(w * T - 1.1)) ** 4;
      a = [A * 350 * Math.sin(w * T), A * 200 * Math.cos(w * T), A * (1300 * p1 + 700 * p2 - 400)];
      g = [A * 70 * Math.sin(w * T), A * 170 * Math.sin(w * T), 0];
      break;
    }
    default: {
      // zelfbedacht dier: een willekeurige, maar vaste beweging per naam
      let h = 0;
      for (const ch of animal) h = (h * 31 + ch.charCodeAt(0)) % 997;
      const f = 0.4 + (h % 30) / 10, w = 2 * Math.PI * f;
      pitch += (h % 90) - 20;
      a = [A * (h % 400) * Math.sin(w * T), A * ((h * 7) % 500) * Math.sin(w * T + 1), A * ((h * 13) % 900) * Math.sin(2 * w * T)];
      g = [A * ((h * 3) % 200) * Math.cos(w * T), 0, A * ((h * 5) % 150) * Math.sin(w * T)];
    }
  }
  const gr = gravity(pitch, roll);
  return {
    a: a.map((v, i) => Math.round(v + gr[i] + gauss() * 55)),
    g: g.map((v) => Math.round(v + gauss() * 8)),
  };
}
