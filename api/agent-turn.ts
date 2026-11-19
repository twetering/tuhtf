import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { AgentTurnRequest } from '../lib/swarmTypes';
import { runAgentTurn } from '../lib/runAgentTurn';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body: AgentTurnRequest;
  try {
    body =
      typeof req.body === 'string'
        ? (JSON.parse(req.body) as AgentTurnRequest)
        : (req.body as AgentTurnRequest);
  } catch {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

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

  try {
    const result = await runAgentTurn(body);
    res.status(200).json(result);
  } catch (e) {
    console.error(e);
    const msg = e instanceof Error ? e.message : 'Agent turn failed';
    res.status(500).json({ error: msg });
  }
}
