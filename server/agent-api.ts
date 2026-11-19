import 'dotenv/config';
import express from 'express';
import type { AgentTurnRequest } from '../lib/swarmTypes';
import { runAgentTurn } from '../lib/runAgentTurn';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { DirigentRequest } from '../lib/huiskamerTypes';
import { runDirigent } from '../lib/dirigent';
import type { Dirigent2Request } from '../lib/huiskamer2Types';
import { runDirigent2 } from '../lib/dirigent2';

const app = express();
app.use(express.json({ limit: '512kb' }));

app.post('/api/agent-turn', async (req, res) => {
  try {
    const body = req.body as AgentTurnRequest;
    if (
      !body?.agentId ||
      typeof body.tick !== 'number' ||
      !body.publicMission ||
      !body.privateConstraint ||
      !body.target ||
      !Array.isArray(body.segments)
    ) {
      res.status(400).json({ error: 'Invalid agent-turn payload' });
      return;
    }
    const result = await runAgentTurn(body);
    res.json(result);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Agent turn failed';
    res.status(500).json({ error: msg });
  }
});

app.post('/api/dirigent', async (req, res) => {
  try {
    const body = req.body as DirigentRequest;
    if (typeof body?.groupAvg !== 'number' || !Array.isArray(body.persons)) {
      res.status(400).json({ error: 'Invalid dirigent payload' });
      return;
    }
    res.json(await runDirigent(body));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Dirigent failed' });
  }
});

app.post('/api/dirigent2', async (req, res) => {
  try {
    const body = req.body as Dirigent2Request;
    if (!body?.group || !Array.isArray(body.persons)) {
      res.status(400).json({ error: 'Invalid dirigent2 payload' });
      return;
    }
    res.json(await runDirigent2(body));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'Dirigent2 failed' });
  }
});

/** ElevenLabs sound generation, met schijfcache zodat elk geluid maar één keer betaald wordt. */
const SFX_DIR = path.resolve('server/.sfx-cache');
app.post('/api/sfx', async (req, res) => {
  try {
    const text = String(req.body?.text ?? '').slice(0, 300).trim();
    const duration = req.body?.duration ? Number(req.body.duration) : undefined;
    if (!text) {
      res.status(400).json({ error: 'text required' });
      return;
    }
    const key = createHash('sha1').update(`${text}|${duration ?? ''}`).digest('hex');
    const file = path.join(SFX_DIR, `${key}.mp3`);
    if (fs.existsSync(file)) {
      res.type('audio/mpeg').send(fs.readFileSync(file));
      return;
    }
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      res.status(503).json({ error: 'ELEVENLABS_API_KEY ontbreekt' });
      return;
    }
    const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
      method: 'POST',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        ...(duration ? { duration_seconds: Math.min(22, Math.max(0.5, duration)) } : {}),
        prompt_influence: 0.4,
      }),
    });
    if (!r.ok) {
      res.status(r.status).json({ error: await r.text() });
      return;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    fs.mkdirSync(SFX_DIR, { recursive: true });
    fs.writeFileSync(file, buf);
    res.type('audio/mpeg').send(buf);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e instanceof Error ? e.message : 'sfx failed' });
  }
});

const port = Number(process.env.AGENT_API_PORT ?? 8788);
app.listen(port, () => {
  console.log(`Agent API listening on http://127.0.0.1:${port}`);
});
