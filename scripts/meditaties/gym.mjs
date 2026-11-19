#!/usr/bin/env node
/**
 * Stemmen voor de Gym-spellen (vooraf gemaakt, werkt daarna offline).
 *   node scripts/meditaties/gym.mjs      (alleen nieuwe teksten kosten credits)
 * Uitvoer: public/gym/<categorie>-<n>.mp3 + index.json
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { speak } from './stem.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../public/gym');
fs.mkdirSync(OUT, { recursive: true });

// ElevenLabs-standaardstemmen, expressief model (v3) met regietags
const WACHTER = { engine: 'eleven', voice: 'N2lVS1w4EtoT3dr4eOWO', model: 'eleven_v3', stability: 0.35, similarity: 0.8, style: 0.6, speed: 1 }; // Callum: plagerig
const COACH = { engine: 'eleven', voice: 'IKne3meq5aSn9XLyUdCD', model: 'eleven_v3', stability: 0.4, similarity: 0.8, style: 0.55, speed: 1.05 }; // Charlie: energiek

export const LIJNEN = {
  // Annemaria Koekoek (wachter)
  kStart: [WACHTER, ['[mischievously] Klaar? Ik draai me om…']],
  kLopen: [WACHTER, ['[whispers] Lopen maar…', '[mischievously] Ga maar. Ik kijk niet.', 'Beweeg maar…']],
  kKoekoek: [WACHTER, ['Annemaria… [shouts] koekoek!', 'Annemaria… koe… [shouts] koek!', '[slowly] Annemaria… [shouts] KOEKOEK!']],
  kBetrapt: [WACHTER, ['[laughs] Betrapt!', 'Ik zag je wel!', '[mischievously] Jij bewoog.']],
  kWinnaar: [WACHTER, ['[surprised] We hebben een winnaar!']],
  // Herstelslag (coach)
  hStart: [COACH, ['[energetic] Daar gaan we. Elke hartslag telt!']],
  hWerk: [COACH, ['[energetic] Werken! Gas erop!', '[shouts] Go! Elke slag telt!', '[energetic] En weer aan de bak!']],
  hRust: [COACH, ['[calm] Rust. Adem lang uit.', '[calm] En… rust. Laat je hart zakken.', '[calm] Stop maar. Rustig ademen.']],
  hTien: [COACH, ['Nog tien seconden. Dan kijk ik.', 'Tien seconden. Breng hem omlaag.']],
  hKoekoek: [COACH, ['[shouts] Koekoek! Hartslagcheck!', 'Koekoek! Even kijken…']],
  hGoed: [COACH, ['Netjes onder de grens.', '[impressed] Mooi hersteld.']],
  hStraf: [COACH, ['Te hoog! Strafslagen.', 'Dat hart bonst nog. Strafslagen.']],
  hLaatste: [COACH, ['[energetic] Laatste ronde!']],
  hEinde: [COACH, ['[cheerfully] Klaar! Goed gewerkt.']],
};

const index = {};
for (const [cat, [stem, list]] of Object.entries(LIJNEN)) {
  index[cat] = [];
  for (let i = 0; i < list.length; i++) {
    const src = await speak(list[i], stem);
    const file = `${cat}-${i}.mp3`;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-af', 'silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,loudnorm=I=-15:TP=-1.5', '-ar', '44100', '-b:a', '128k', path.join(OUT, file)]);
    index[cat].push({ file: `gym/${file}`, text: list[i].replace(/\[[^\]]+\]\s*/g, '') });
  }
  console.log(`✓ ${cat} (${list.length})`);
}
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));
