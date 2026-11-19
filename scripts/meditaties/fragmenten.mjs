#!/usr/bin/env node
/**
 * Stemfragmenten voor de interactieve meditatie (nr. 4). Eén keer genereren, daarna werkt alles offline:
 * tijdens een sessie kiest de browser op basis van hart en adem welk fragment er klinkt.
 *   node scripts/meditaties/fragmenten.mjs        (alleen nieuwe of gewijzigde teksten kosten credits)
 * Uitvoer: public/meditaties/live/<categorie>-<n>.mp3 + index.json
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEMMEN } from './scripts.mjs';
import { speak } from './stem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../public/meditaties/live');
fs.mkdirSync(OUT, { recursive: true });

export const FRAGMENTEN = {
  begin: ['Ik ben er. Ik luister mee.', 'Stil maar. Ik hoor je al.'],
  hartOmhoog: ['Er gebeurt iets in je. Dat mag.', 'Je hart versnelt. Ik hoor het.'],
  hartOmlaag: ['Je hart zakt. Tree voor tree.', 'Langzamer. Ja.', 'Hoor je dat? Het wordt trager.'],
  hartRustig: ['Zo klinkt rust, bij jou.', 'Dit tempo is van jou. Ik volg alleen.'],
  ademLanger: ['Je adem wordt langer.', 'Zo. Laat die uitademing maar duren.'],
  ademSnel: ['Je ademt hoog en snel. Laat je buik meedoen.', 'Er is haast in je adem. Je mag hem laten gaan.'],
  ademStil: ['Je houdt je adem vast. Laat maar los.', 'Waar is je adem gebleven?'],
  diep: ['Dat was een diepe.', 'Mmm. Die kwam van ver.'],
  samen: ['Je hart en je adem lopen nu samen.', 'Bij elke inademing versnelt je hart even. Hoor je dat golfje?'],
  stilte: ['Ik zeg even niets.', 'Ik ben er nog.'],
  einde: ['Blijf nog even liggen. Ik word zachter.', 'Dank je. Voor je hart.'],
};

const index = {};
for (const [cat, list] of Object.entries(FRAGMENTEN)) {
  index[cat] = [];
  for (let i = 0; i < list.length; i++) {
    const src = await speak(list[i], STEMMEN.koralyV3);
    const file = `${cat}-${i}.mp3`;
    // stilte aan het begin/eind weg, vaste luidheid
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-18:TP=-2', '-ar', '44100', '-b:a', '128k', path.join(OUT, file)]);
    index[cat].push({ file: `meditaties/live/${file}`, text: list[i] });
  }
  console.log(`✓ ${cat} (${list.length})`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
