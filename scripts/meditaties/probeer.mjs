#!/usr/bin/env node
/**
 * Goedkoop proeven: één kort fragment, in een paar stemmen, zonder hele meditaties te renderen.
 *   node scripts/meditaties/probeer.mjs            alle proefjes (alleen wat nog niet in de cache staat kost credits)
 *   node scripts/meditaties/probeer.mjs gemini     alleen proefjes waarvan de id 'gemini' bevat
 *   node scripts/meditaties/probeer.mjs --tekst    geen audio: toont de teksten met geschatte spreektijd en of ze passen
 * Uitvoer: public/meditaties/proef/<id>.mp3 + index.json (te beluisteren in het Lummellab → AI-meditaties).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MEDITATIES, STEMMEN } from './scripts.mjs';
import { speak } from './stem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../public/meditaties/proef');
fs.mkdirSync(OUT, { recursive: true });

const FRAGMENT = 'Stil maar. Ik ben er al. Ik heb geen oren. En toch hoor ik je. Zesentachtig keer per minuut klop je tegen de binnenkant van jezelf.';
const gem = (voice, extra = '') => ({ ...STEMMEN.geminiFluister, voice, regie: STEMMEN.geminiFluister.regie.replace('Lees alleen', `${extra}Lees alleen`) });

export const PROEVEN = [
  { id: 'koraly-v2', label: 'ElevenLabs · Koraly · v2', stem: STEMMEN.koraly, tekst: FRAGMENT },
  { id: 'koraly-v3', label: 'ElevenLabs · Koraly · v3 met regietags', stem: STEMMEN.koralyV3, tekst: '[whispers] Stil maar. Ik ben er al. [pause] Ik heb geen oren. [softly] En toch hoor ik je. [pause] Zesentachtig keer per minuut klop je tegen de binnenkant van jezelf.' },
  { id: 'gemini-enceladus', label: 'Gemini · Enceladus (adem­rijk)', stem: gem('Enceladus'), tekst: FRAGMENT },
  { id: 'gemini-achernar', label: 'Gemini · Achernar (zacht)', stem: gem('Achernar'), tekst: FRAGMENT },
  { id: 'gemini-sulafat', label: 'Gemini · Sulafat (warm)', stem: gem('Sulafat'), tekst: FRAGMENT },
  { id: 'gemini-algenib-machine', label: 'Gemini · Algenib, als machine die mens probeert te zijn', stem: gem('Algenib', 'Je bent een AI die voor het eerst een lichaam probeert te voelen: rustig, nieuwsgierig, licht onwennig, nooit robotachtig. '), tekst: FRAGMENT },
];

if (process.argv.includes('--tekst')) {
  // ~2,1 tekens per 0,1 s is ongeveer rustig meditatietempo (≈ 12-13 tekens per seconde)
  const cps = 12.5;
  for (const m of MEDITATIES) {
    console.log(`\n${m.titel} (${m.duur} s)`);
    let free = 0;
    for (const r of m.regels) {
      if (typeof r[0] !== 'number') continue;
      const [want, text] = r;
      const at = Math.max(want, free + 1.2);
      const dur = text.length / cps;
      free = at + dur;
      const late = at - want > 1 ? `  ⚠ schuift ${(at - want).toFixed(0)} s op` : '';
      console.log(`  ${String(Math.round(at)).padStart(3)}–${String(Math.round(free)).padEnd(3)} ${text}${late}`);
    }
  }
  process.exit(0);
}

const filter = process.argv.slice(2).find((a) => !a.startsWith('-'));
const index = fs.existsSync(path.join(OUT, 'index.json')) ? JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8')) : [];
for (const p of PROEVEN) {
  if (filter && !p.id.includes(filter)) continue;
  try {
    const src = await speak(p.tekst, p.stem);
    const out = path.join(OUT, `${p.id}.mp3`);
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', 'loudnorm=I=-19:TP=-2,apad=pad_dur=0.6', '-ar', '44100', '-b:a', '160k', out]);
    const entry = { id: p.id, label: p.label, tekst: p.tekst, audio: `meditaties/proef/${p.id}.mp3`, engine: p.stem.engine };
    const i = index.findIndex((x) => x.id === p.id);
    if (i >= 0) index[i] = entry;
    else index.push(entry);
    console.log(`✓ ${p.label}`);
  } catch (e) {
    console.error(`✗ ${p.label}: ${e.message}`);
  }
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
