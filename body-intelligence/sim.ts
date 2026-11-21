/**
 * Gesimuleerde deelnemer met een sensor om de pols, om alles zonder hardware
 * te kunnen proberen. Elk dier, elke machine en elke bedoeling heeft een eigen beweging; elke gesimuleerde
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
    // ---- machines: de arm als slinger, trommel, wisser of ventilator
    case 'klok': {
      // arm als slinger, met een harde tik op elk uiterste (één per seconde)
      const w = Math.PI; // 0,5 Hz heen en weer = 1 tik per seconde
      roll += A * 30 * Math.sin(w * T);
      const ph = (T % 1 + 1) % 1;
      const tik = ph < 0.04 ? A * 700 * Math.sin((ph / 0.04) * Math.PI) : 0;
      a = [tik * 0.6, 0, tik];
      g = [0, 0, A * 30 * w * Math.cos(w * T)]; // °/s: afgeleide van de rol
      break;
    }
    case 'wasmachine': {
      // trommel: zes seconden rustig rondjes, dan vier seconden centrifugeren
      const ph = T % 10;
      const f = ph < 6 ? 0.9 : 3.2, r = ph < 6 ? 450 : 220;
      const w = 2 * Math.PI * f;
      a = [A * r * Math.sin(w * T), A * r * Math.cos(w * T), A * 60 * Math.sin(2 * w * T)];
      g = [0, 0, A * (ph < 6 ? 160 : 420)];
      break;
    }
    case 'ruitenwisser': {
      // grote, gladde boog met een korte stilstand aan elke kant
      const w = 2 * Math.PI * 0.7;
      const s = Math.max(-1, Math.min(1, 1.25 * Math.sin(w * T)));
      roll += A * 60 * s;
      a = [A * 250 * Math.cos(w * T), 0, 0];
      g = [0, 0, Math.abs(s) > 0.98 ? 0 : A * 75 * w * Math.cos(w * T)];
      break;
    }
    case 'ventilator': {
      // langzaam heen en weer draaien, met een constant zoemen
      const w = 2 * Math.PI * 0.15;
      roll += A * 40 * Math.sin(w * T);
      const zoem = A * 90 * Math.sin(2 * Math.PI * 11 * T);
      a = [zoem, zoem * 0.5, zoem * 0.3];
      g = [0, 0, A * 40 * w * Math.cos(w * T)];
      break;
    }
    // ---- een klap, met verschillende bedoelingen (in de lucht of op een kussen)
    case 'woedend':
    case 'grapje':
    case 'gespeeld':
    case 'aarzelend': {
      const P = { woedend: 2.2, grapje: 2.0, gespeeld: 2.6, aarzelend: 3.2 }[animal]!;
      const kracht = { woedend: 3200, grapje: 1300, gespeeld: 1500, aarzelend: 500 }[animal]!;
      const duur = { woedend: 0.12, grapje: 0.22, gespeeld: 0.35, aarzelend: 0.5 }[animal]!;
      const ph = T % P;
      if (ph < duur) {
        const x = ph / duur;
        const vorm = animal === 'aarzelend' ? Math.sin(x * Math.PI) * (x < 0.6 ? 1 : 0.4) : Math.sin(x * Math.PI);
        a = [A * kracht * vorm, A * kracht * 0.25 * vorm, 0];
        g = [0, 0, A * (kracht / 6) * vorm];
        if (animal === 'woedend' && x > 0.85) a[0] -= A * 1800; // abrupt stoppen bij de inslag
      } else if (animal === 'grapje' && ph < duur + 0.4) {
        // nalachen: losse, kleine schokjes
        a = [A * 200 * Math.sin(40 * ph), A * 150 * Math.sin(33 * ph), 0];
      }
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
