/**
 * Kenmerken uit een venster beweging (versnelling in mg, gyro in °/s).
 * Dit is het "datamodel": wat meten we eigenlijk van een kikker of een slang?
 * Elk kenmerk heeft een uitleg in gewone taal, zodat leerlingen kunnen kiezen.
 */

export type FeatKey = 'intensiteit' | 'piek' | 'ritme' | 'regelmaat' | 'kanteling' | 'rol' | 'draaien' | 'eenrichting';

export const FEATS: { key: FeatKey; naam: string; eenheid: string; uitleg: string }[] = [
  { key: 'intensiteit', naam: 'intensiteit', eenheid: 'mg', uitleg: 'Hoe heftig beweeg je? De spreiding van de totale versnelling.' },
  { key: 'piek', naam: 'pieken', eenheid: 'mg', uitleg: 'De grootste klap of sprong in het venster, boven het gewone niveau.' },
  { key: 'ritme', naam: 'ritme', eenheid: 'Hz', uitleg: 'Hoe vaak per seconde herhaalt de beweging zich? Vleugelslag is snel, kronkelen traag.' },
  { key: 'regelmaat', naam: 'regelmaat', eenheid: '0–1', uitleg: 'Hoe gelijk zijn de herhalingen? Een galop is regelmatig, rondspringen niet.' },
  { key: 'kanteling', naam: 'kanteling', eenheid: '°', uitleg: 'Hoe schuin houd je de sensor gemiddeld? Rechtop of plat naar voren.' },
  { key: 'rol', naam: 'rol', eenheid: '°', uitleg: 'Naar welke kant draai je de sensor gemiddeld om zijn lengteas?' },
  { key: 'draaien', naam: 'draaien', eenheid: '°/s', uitleg: 'Hoe snel draait de sensor (gyro)? Kronkelen en fladderen draaien veel.' },
  { key: 'eenrichting', naam: 'één richting', eenheid: '0–1', uitleg: 'Gaat de beweging vooral langs één as (op en neer), of alle kanten op?' },
];

const mean = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
};
const std = (a: ArrayLike<number>) => {
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return a.length ? Math.sqrt(s / a.length) : 0;
};

/**
 * acc: x,y,z achter elkaar (mg); gyr: idem in °/s of null; hz: samples per seconde.
 * Geeft alle kenmerken terug, in de volgorde van FEATS.
 */
export function features(acc: number[], gyr: number[] | null, hz: number): number[] {
  const n = Math.floor(acc.length / 3);
  const mag = new Float64Array(n);
  const ax = new Float64Array(n), ay = new Float64Array(n), az = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    ax[i] = acc[i * 3];
    ay[i] = acc[i * 3 + 1];
    az[i] = acc[i * 3 + 2];
    mag[i] = Math.hypot(ax[i], ay[i], az[i]);
  }
  const intensiteit = std(mag);
  const sorted = Array.from(mag).sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)] ?? 1000;
  const piek = (sorted[n - 1] ?? 0) - median;

  // ritme en regelmaat: autocorrelatie van |a| over vertragingen van 0,2 tot 2 s
  const mm = mean(mag);
  const c = Array.from(mag, (v) => v - mm);
  let c0 = 0;
  for (const v of c) c0 += v * v;
  let best = 0, bestLag = 0;
  const lo = Math.max(2, Math.round(hz * 0.2)), hi = Math.min(n - 2, Math.round(hz * 2));
  if (c0 > 1e-6 && hi > lo) {
    const r = new Float64Array(hi + 2);
    for (let lag = 1; lag <= hi + 1 && lag < n; lag++) {
      let s = 0;
      for (let i = 0; i + lag < n; i++) s += c[i] * c[i + lag];
      r[lag] = (s / c0) * (n / (n - lag)); // correctie voor kortere overlap
    }
    // lokale pieken; neem de eerste die bijna zo hoog is als de hoogste (anders kies je een veelvoud van de periode)
    const peaks: number[] = [];
    for (let lag = lo; lag <= hi; lag++) if (r[lag] > r[lag - 1] && r[lag] >= r[lag + 1]) peaks.push(lag);
    const top = Math.max(0, ...peaks.map((l) => r[l]));
    const first = peaks.find((l) => r[l] >= top * 0.85);
    if (first !== undefined) {
      bestLag = first;
      best = r[first];
    }
  }
  const ritme = bestLag ? hz / bestLag : 0;
  const regelmaat = Math.max(0, Math.min(1, best));

  // houding: richting van de zwaartekracht (gemiddelde versnelling)
  const gx = mean(ax), gy = mean(ay), gz = mean(az);
  const gn = Math.hypot(gx, gy, gz) || 1;
  const kanteling = (Math.acos(Math.max(-1, Math.min(1, gz / gn))) * 180) / Math.PI;
  const rol = (Math.atan2(gx, gy) * 180) / Math.PI;

  let draaien = 0;
  if (gyr && gyr.length >= n * 3) {
    let s = 0;
    for (let i = 0; i < n; i++) s += Math.hypot(gyr[i * 3], gyr[i * 3 + 1], gyr[i * 3 + 2]);
    draaien = s / n;
  }

  const vx = std(ax) ** 2, vy = std(ay) ** 2, vz = std(az) ** 2;
  const eenrichting = vx + vy + vz > 1 ? Math.max(vx, vy, vz) / (vx + vy + vz) : 0.34;

  return [intensiteit, piek, ritme, regelmaat, kanteling, rol, draaien, eenrichting];
}

/** Knip een opname in vensters (lengte en stap in seconden). */
export function windows(acc: number[], gyr: number[] | null, hz: number, len = 2, hop = 1) {
  const n = Math.floor(acc.length / 3);
  const w = Math.round(len * hz), h = Math.max(1, Math.round(hop * hz));
  const out: { acc: number[]; gyr: number[] | null }[] = [];
  for (let s = 0; s + w <= n; s += h) {
    out.push({ acc: acc.slice(s * 3, (s + w) * 3), gyr: gyr ? gyr.slice(s * 3, (s + w) * 3) : null });
  }
  return out;
}
