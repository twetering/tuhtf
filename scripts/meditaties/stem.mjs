/**
 * Stem voor de meditaties: ElevenLabs of Gemini TTS, met cache (scripts/meditaties/.cache).
 * Een stem-instelling is een object:
 *   { engine: 'eleven', voice, model, stability, similarity, style, speed }
 *   { engine: 'gemini', voice, model, regie }   // regie = regieaanwijzing in gewone taal
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const CACHE = path.join(here, '.cache');
fs.mkdirSync(CACHE, { recursive: true });

export async function cached(kind, payload, fetcher) {
  const h = createHash('sha1').update(kind + JSON.stringify(payload)).digest('hex').slice(0, 16);
  const file = path.join(CACHE, `${kind}-${h}.mp3`);
  if (!fs.existsSync(file)) {
    const buf = await fetcher();
    fs.writeFileSync(file, buf);
    process.stdout.write(`  ↓ ${kind}: ${JSON.stringify(payload).slice(0, 80)}\n`);
  }
  return file;
}

async function retry(fn, label) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      if (e.fatal) throw e;
      await new Promise((r) => setTimeout(r, 2500 * (attempt + 1)));
    }
  }
  throw new Error(`${label} bleef falen: ${last?.message}`);
}

export async function eleven(url, body) {
  const KEY = process.env.ELEVENLABS_API_KEY;
  if (!KEY) throw new Error('ELEVENLABS_API_KEY ontbreekt');
  return retry(async () => {
    const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r.ok) return Buffer.from(await r.arrayBuffer());
    const e = new Error(`ElevenLabs ${r.status}: ${(await r.text()).slice(0, 200)}`);
    e.fatal = r.status !== 429 && r.status < 500;
    throw e;
  }, 'ElevenLabs');
}

async function gemini(text, s) {
  const KEY = process.env.GEMINI_API_KEY;
  if (!KEY) throw new Error('GEMINI_API_KEY ontbreekt');
  const prompt = s.regie ? `${s.regie}\n\n${text}` : text;
  const pcm = await retry(async () => {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${s.model}:generateContent?key=${KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: s.voice } } } },
      }),
    });
    const d = await r.json();
    const data = d?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    if (!r.ok || !data) {
      const e = new Error(`Gemini ${r.status}: ${JSON.stringify(d).slice(0, 240)}`);
      e.fatal = r.status !== 429 && r.status < 500 && r.ok === false;
      throw e;
    }
    const rate = +(data.mimeType.match(/rate=(\d+)/)?.[1] ?? 24000);
    return { buf: Buffer.from(data.data, 'base64'), rate };
  }, 'Gemini');
  // ruwe PCM → mp3
  return execFileSync('ffmpeg', ['-v', 'error', '-f', 's16le', '-ar', String(pcm.rate), '-ac', '1', '-i', '-', '-c:a', 'libmp3lame', '-b:a', '160k', '-f', 'mp3', '-'], { input: pcm.buf, maxBuffer: 1 << 28 });
}

/** Spreek tekst uit; geeft het pad naar een (gecachet) mp3-bestand. */
export function speak(text, s) {
  if (s.engine === 'gemini') return cached('gem', { text, ...s }, () => gemini(text, s));
  return cached('tts', { text, ...s.voice ? s : s }, () =>
    eleven(`https://api.elevenlabs.io/v1/text-to-speech/${s.voice}?output_format=mp3_44100_128`, {
      text: (s.prefix ?? '') + text,
      model_id: s.model,
      ...(s.model === 'eleven_v3' ? {} : { language_code: 'nl' }),
      voice_settings: { stability: s.stability, similarity_boost: s.similarity, style: s.style, use_speaker_boost: true, speed: s.speed ?? 1 },
    }),
  );
}

export function sfx(text, duration) {
  return cached('sfx', { text, duration }, () =>
    eleven('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', { text, duration_seconds: duration, prompt_influence: 0.55 }),
  );
}
