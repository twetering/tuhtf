import type { Body } from './bodies';

/** Analyse van twee hartslagmeters tegelijk (voor 'Welke meter?'). */

export const PLACES = ['', 'pols', 'borst', 'arm', 'vinger', 'oor'] as const;
export type Place = (typeof PLACES)[number];

/** Gok de plek uit de apparaatnaam (Garmin, Polar, Wahoo…). */
export function guessPlace(b: Body): Place {
  const n = `${b.extra?.deviceName ?? ''} ${b.name}`.toLowerCase();
  if (/hrm|polar h|h10|h9|tickr|chest|borst|dual/.test(n)) return 'borst';
  if (/verity|oh1|arm/.test(n)) return 'arm';
  if (/forerunner|fenix|f[eē]nix|venu|vivo|instinct|epix|watch|horloge|versa|charge|band \d|whoop|pols/.test(n)) return 'pols';
  return '';
}

export type Sample = { s: number; a: number | null; b: number | null };
export type Meter = { name: string; place: Place; beats: number; rr: boolean };

const mean = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);
const sd = (v: number[]) => {
  if (v.length < 2) return 0;
  const m = mean(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
function corr(x: number[], y: number[]) {
  if (x.length < 5) return 0;
  const mx = mean(x);
  const my = mean(y);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}
/** Paren (a[i], b[i+lag]) waar beide meters een waarde hadden. */
function pairs(ss: Sample[], lag = 0) {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < ss.length; i++) {
    const j = i + lag;
    if (j < 0 || j >= ss.length) continue;
    if (ss[i].a !== null && ss[j].b !== null) {
      a.push(ss[i].a!);
      b.push(ss[j].b!);
    }
  }
  return { a, b };
}

export const who = (m: Meter, i: number) => (m.place ? `de ${m.place}meter (${m.name})` : `meter ${i} (${m.name})`);
const Who = (m: Meter, i: number) => who(m, i).replace(/^./, (c) => c.toUpperCase());

export type Analysis = {
  n: number;
  meanDiff: number;
  meanAbs: number;
  maxAbs: number;
  maxAt: number;
  loa: [number, number];
  within2: number;
  lag: number;
  r: number;
  jitter: [number, number];
  gaps: [number, number];
  sameSource: boolean;
  lines: string[];
};

/** De analyse na een meting, in gewone zinnen. Samples zijn per seconde. */
export function analyse(ss: Sample[], m1: Meter, m2: Meter): Analysis | null {
  const { a, b } = pairs(ss);
  if (a.length < 10) return null;
  const d = a.map((x, i) => x - b[i]);
  const meanDiff = mean(d);
  const abs = d.map(Math.abs);
  const meanAbs = mean(abs);
  let maxAbs = 0;
  let maxAt = 0;
  for (const s of ss) {
    if (s.a === null || s.b === null) continue;
    if (Math.abs(s.a - s.b) > maxAbs) {
      maxAbs = Math.abs(s.a - s.b);
      maxAt = s.s;
    }
  }
  const sdd = sd(d);
  const loa: [number, number] = [meanDiff - 1.96 * sdd, meanDiff + 1.96 * sdd];
  const within2 = abs.filter((x) => x <= 2).length / abs.length;
  // vertraging: bij welke verschuiving lopen de twee lijnen het mooist gelijk op?
  const r0 = corr(a, b);
  let lag = 0;
  let r = r0;
  for (let L = -10; L <= 10; L++) {
    const p = pairs(ss, L);
    const c = corr(p.a, p.b);
    if (c > r + 1e-9) {
      r = c;
      lag = L;
    }
  }
  if (a.length < 30 || Math.abs(lag) === 10 || r < 0.5 || r - r0 < 0.05) lag = 0; // te weinig verschil om een vertraging te durven noemen
  const jit = (k: 'a' | 'b') => {
    const steps: number[] = [];
    for (let i = 1; i < ss.length; i++) if (ss[i][k] !== null && ss[i - 1][k] !== null) steps.push(Math.abs(ss[i][k]! - ss[i - 1][k]!));
    return mean(steps);
  };
  const jitter: [number, number] = [jit('a'), jit('b')];
  const gaps: [number, number] = [ss.filter((s) => s.a === null).length, ss.filter((s) => s.b === null).length];
  // zelfde bron? Na rechtzetten van de vertraging vrijwel identiek, terwijl de hartslag wel beweegt
  const al = pairs(ss, lag);
  const alignedAbs = mean(al.a.map((x, i) => Math.abs(x - al.b[i])));
  const sameSource = r > 0.97 && alignedAbs < 0.6 && sd(a) > 1.2;

  const lines: string[] = [];
  if (Math.abs(meanDiff) < 0.5) lines.push(`Gemiddeld meten ze bijna hetzelfde: ${nl(Math.abs(meanDiff))} slag per minuut verschil.`);
  else {
    const [hi, lo, hiI, loI] = meanDiff > 0 ? [m1, m2, 1, 2] : [m2, m1, 2, 1];
    lines.push(`${Who(hi, hiI)} meet gemiddeld ${nl(Math.abs(meanDiff))} slagen per minuut hoger dan ${who(lo, loI)}.`);
  }
  lines.push(`Maar per moment scheelt het gemiddeld ${nl(meanAbs)} slagen. Het grootste verschil was ${Math.round(maxAbs)} slagen, na ${Math.round(maxAt)} s.`);
  lines.push(`In 95% van de tijd lag het verschil (meter 1 min meter 2) tussen ${nl(loa[0])} en ${nl(loa[1])}.`);
  lines.push(`${Math.round(within2 * 100)}% van de tijd zaten ze binnen 2 slagen van elkaar.`);
  if (lag !== 0) {
    const [late, early, lateI, earlyI] = lag > 0 ? [m2, m1, 2, 1] : [m1, m2, 1, 2];
    lines.push(`${Who(late, lateI)} loopt ongeveer ${Math.abs(lag)} s achter op ${who(early, earlyI)}: een versnelling komt daar later binnen.`);
  }
  if (r < 0.3 && sd(a) > 1.5 && sd(b) > 1.5) lines.push('Ze gaan nauwelijks samen omhoog en omlaag: de meters zien elk een andere hartslag.');
  if (m1.beats && m2.beats && m1.beats !== m2.beats) lines.push(`Geteld in deze meting: ${m1.beats} slagen bij meter 1, ${m2.beats} bij meter 2.`);
  const [j1, j2] = jitter;
  if (Math.max(j1, j2) > 0.3 && Math.abs(j1 - j2) / Math.max(j1, j2) > 0.35) {
    const [rough, calm, roughI, calmI] = j1 > j2 ? [m1, m2, 1, 2] : [m2, m1, 2, 1];
    lines.push(`${Who(rough, roughI)} springt meer: gemiddeld ${nl(Math.max(j1, j2))} slag per seconde, tegen ${nl(Math.min(j1, j2))} bij ${who(calm, calmI)}. De rustigste lijn is niet per se de juiste; die kan ook meer gladgestreken zijn.`);
  }
  if (gaps[0] + gaps[1] > 2) lines.push(`Wegvallers: ${gaps[0]} s zonder waarde bij meter 1, ${gaps[1]} s bij meter 2.`);
  return { n: a.length, meanDiff, meanAbs, maxAbs, maxAt, loa, within2, lag, r, jitter, gaps, sameSource, lines };
}

export const nl = (x: number, d = 1) => x.toFixed(d).replace('.', ',').replace('-', '−');
