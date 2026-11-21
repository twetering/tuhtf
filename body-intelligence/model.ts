/**
 * Een klein, doorzichtig model: k dichtstbijzijnde buren (kNN).
 * Het model "onthoudt" alle voorbeelden en kijkt bij een nieuwe beweging
 * welke voorbeelden er het meest op lijken. Die stemmen over het dier.
 * Daardoor kun je altijd laten zien wáárom het model iets raadt.
 */

export type Example = { rec: string; animal: string; person: string; f: number[] };

export type Model = {
  idx: number[]; // welke kenmerken (indexen in FEATS)
  mu: number[];
  sd: number[];
  X: number[][]; // gestandaardiseerd
  ex: Example[];
  k: number;
  animals: string[];
};

export function train(ex: Example[], idx: number[], k: number, animals: string[]): Model | null {
  if (!ex.length || !idx.length) return null;
  const mu = idx.map((j) => ex.reduce((s, e) => s + e.f[j], 0) / ex.length);
  const sd = idx.map((j, q) => Math.sqrt(ex.reduce((s, e) => s + (e.f[j] - mu[q]) ** 2, 0) / ex.length) || 1);
  const X = ex.map((e) => idx.map((j, q) => (e.f[j] - mu[q]) / sd[q]));
  return { idx, mu, sd, X, ex, k, animals };
}

export type Guess = { scores: Record<string, number>; best: string; conf: number; near: { ex: Example; d: number }[] };

export function predict(m: Model, f: number[]): Guess {
  const x = m.idx.map((j, q) => (f[j] - m.mu[q]) / m.sd[q]);
  const ds = m.X.map((row, i) => {
    let s = 0;
    for (let q = 0; q < row.length; q++) s += (row[q] - x[q]) ** 2;
    return { i, d: Math.sqrt(s) };
  });
  ds.sort((a, b) => a.d - b.d);
  const near = ds.slice(0, Math.min(m.k, ds.length));
  const scores: Record<string, number> = Object.fromEntries(m.animals.map((a) => [a, 0]));
  let tot = 0;
  for (const { i, d } of near) {
    const w = 1 / (d + 0.25);
    scores[m.ex[i].animal] = (scores[m.ex[i].animal] ?? 0) + w;
    tot += w;
  }
  for (const a in scores) scores[a] = tot ? scores[a] / tot : 0;
  let best = '', conf = 0;
  for (const a in scores) if (scores[a] > conf) [best, conf] = [a, scores[a]];
  return { scores, best, conf, near: near.map(({ i, d }) => ({ ex: m.ex[i], d })) };
}

/**
 * Eerlijk toetsen: het model mag nooit raden op een opname die het al kent.
 * Met meerdere personen: laat steeds één persoon weg ("kent het model iemand die het nooit zag?").
 * Met één persoon: laat steeds één opname weg.
 */
export function evaluate(ex: Example[], idx: number[], k: number, animals: string[]) {
  const persons = [...new Set(ex.map((e) => e.person))];
  const byPerson = persons.length >= 2;
  const groups = byPerson ? persons : [...new Set(ex.map((e) => e.rec))];
  const conf: Record<string, Record<string, number>> = Object.fromEntries(animals.map((a) => [a, Object.fromEntries(animals.map((b) => [b, 0]))]));
  let good = 0, tot = 0;
  const perGroup: { g: string; good: number; tot: number }[] = [];
  for (const g of groups) {
    const test = ex.filter((e) => (byPerson ? e.person : e.rec) === g);
    const trainSet = ex.filter((e) => (byPerson ? e.person : e.rec) !== g);
    const m = train(trainSet, idx, k, animals);
    if (!m) continue;
    let gg = 0;
    for (const e of test) {
      const p = predict(m, e.f).best;
      if (conf[e.animal]) conf[e.animal][p] = (conf[e.animal][p] ?? 0) + 1;
      if (p === e.animal) gg++;
    }
    good += gg;
    tot += test.length;
    perGroup.push({ g, good: gg, tot: test.length });
  }
  return { method: byPerson ? ('persoon' as const) : ('opname' as const), acc: tot ? good / tot : 0, tot, conf, perGroup };
}
