import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as d3 from 'd3';
import {
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from 'lucide-react';
import type {
  AgentTurnRequest,
  AgentTurnResponse,
  Point,
  Segment,
} from '../lib/swarmTypes';
import { applyStepPhysics } from '../lib/segmentPhysics';
import { drawPrivateConstraints } from './lib/constraints';
import { PUBLIC_MISSION, TARGET } from './lib/missions';

const DEFAULT_COUNT = 6;
const TICK_MS_DEFAULT = 2200;

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

/** Warm “swim lane” palette — rose, coral, amber, blush (keeps metaphor tasteful). */
function agentColor(i: number): string {
  const palette = [
    'hsl(350 85% 64%)',
    'hsl(18 90% 58%)',
    'hsl(38 92% 58%)',
    'hsl(328 75% 68%)',
    'hsl(12 80% 62%)',
    'hsl(285 55% 62%)',
  ];
  return palette[i % palette.length];
}

type TraceStep = {
  tick: number;
  affectiveLine: string;
  reasoning: string;
  inferredOthersGoals: string;
  rivalPlay: string;
  emotion: string;
  emotionIntensity: number;
  usedProvider: string;
  usedModel: string;
  segment: AgentTurnResponse['segment'];
};

type AgentRuntime = {
  id: string;
  privateConstraint: string;
  color: string;
  tip: Point | null;
  traceSteps: TraceStep[];
};

function makeAgents(count: number): AgentRuntime[] {
  const constraints = drawPrivateConstraints(count);
  return constraints.map((privateConstraint, i) => ({
    id: `agent-${i + 1}`,
    privateConstraint,
    color: agentColor(i),
    tip: { x: 0, y: clamp01(0.12 + (i / Math.max(1, count - 1)) * 0.76) },
    traceSteps: [],
  }));
}

function fallbackSegment(
  agentId: string,
  tip: Point | null,
  idx: number,
): Segment {
  const start = tip ?? { x: 0, y: clamp01(0.1 + (idx % 8) * 0.1) };
  const dx = TARGET.x - start.x;
  const dy = TARGET.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const rawX2 = clamp01(start.x + (dx / len) * 0.06);
  const rawY2 = clamp01(start.y + (dy / len) * 0.06);
  const p = applyStepPhysics(start.x, start.y, rawX2, rawY2, TARGET);
  return {
    agentId,
    x1: start.x,
    y1: start.y,
    x2: p.x2,
    y2: p.y2,
  };
}

async function postTurn(body: AgentTurnRequest): Promise<AgentTurnResponse> {
  const res = await fetch('/api/agent-turn', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as AgentTurnResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `HTTP ${res.status}`);
  }
  if (!data.segment) {
    throw new Error('Invalid response');
  }
  return data;
}

export default function SwarmPerformance() {
  const [agentCount, setAgentCount] = useState(DEFAULT_COUNT);
  const [agents, setAgents] = useState<AgentRuntime[]>(() =>
    makeAgents(DEFAULT_COUNT),
  );
  const [segments, setSegments] = useState<Segment[]>([]);
  const [running, setRunning] = useState(false);
  const [tickMs, setTickMs] = useState(TICK_MS_DEFAULT);
  const [globalTick, setGlobalTick] = useState(0);
  const [showSecrets, setShowSecrets] = useState(true);
  const [statusLine, setStatusLine] = useState('');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);

  const agentsRef = useRef(agents);
  const segmentsRef = useRef(segments);
  const tickRef = useRef(0);

  const pathsByAgent = useMemo(() => {
    const map = new Map<string, string>();
    const byAgent = new Map<string, Segment[]>();
    for (const s of segments) {
      const list = byAgent.get(s.agentId) ?? [];
      list.push(s);
      byAgent.set(s.agentId, list);
    }
    for (const [id, segs] of byAgent) {
      if (segs.length === 0) continue;
      const pts: [number, number][] = [
        [segs[0].x1 * 100, segs[0].y1 * 100],
      ];
      for (const s of segs) {
        pts.push([s.x2 * 100, s.y2 * 100]);
      }
      const curve =
        pts.length <= 2 ? d3.curveLinear : d3.curveCatmullRom.alpha(0.55);
      const gen = d3
        .line<[number, number]>()
        .x((d) => d[0])
        .y((d) => d[1])
        .curve(curve);
      const dPath = gen(pts);
      if (dPath) map.set(id, dPath);
    }
    return map;
  }, [segments]);

  const chorusEntries = useMemo(() => {
    const rows: { agent: AgentRuntime; step: TraceStep }[] = [];
    for (const a of agents) {
      const last = a.traceSteps.at(-1);
      if (last) rows.push({ agent: a, step: last });
    }
    return rows.sort(
      (x, y) => y.step.emotionIntensity - x.step.emotionIntensity,
    );
  }, [agents]);

  const spotlightTick = globalTick > 0 ? globalTick - 1 : -1;

  useEffect(() => {
    const svg = svgRef.current;
    const g = gRef.current;
    if (!svg || !g) return;
    const z = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.4, 9])
      .on('zoom', (event) => {
        d3.select(g).attr('transform', event.transform.toString());
      });
    zoomRef.current = z;
    d3.select(svg).call(z);
    return () => {
      d3.select(svg).on('.zoom', null);
      zoomRef.current = null;
    };
  }, []);

  const resetPanZoom = useCallback(() => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    d3.select(svg).transition().duration(400).call(z.transform, d3.zoomIdentity);
  }, []);

  const zoomBy = useCallback((factor: number) => {
    const svg = svgRef.current;
    const z = zoomRef.current;
    if (!svg || !z) return;
    d3.select(svg).transition().duration(180).call(z.scaleBy, factor);
  }, []);

  useEffect(() => {
    agentsRef.current = agents;
  }, [agents]);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  const runTick = useCallback(async () => {
    const tick = tickRef.current;
    tickRef.current += 1;
    const agentSnap = agentsRef.current;
    const segSnap = segmentsRef.current;

    setStatusLine(`Tick ${tick}…`);
    const payloads: AgentTurnRequest[] = agentSnap.map((a) => ({
      agentId: a.id,
      tick,
      publicMission: PUBLIC_MISSION,
      privateConstraint: a.privateConstraint,
      target: TARGET,
      yourCurrentTip: a.tip,
      segments: segSnap,
    }));

    const results = await Promise.all(
      payloads.map(async (p, order) => {
        try {
          setActiveAgent(p.agentId);
          const r = await postTurn(p);
          return { ok: true as const, order, r };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return { ok: false as const, order, err: msg };
        }
      }),
    );

    setActiveAgent(null);

    const newSegments: Segment[] = [...segSnap];
    const nextAgents = agentSnap.map((a) => ({ ...a }));

    for (const item of results) {
      const agent = nextAgents[item.order];
      if (item.ok) {
        const { r } = item;
        const seg: Segment = {
          agentId: agent.id,
          x1: r.segment.x1,
          y1: r.segment.y1,
          x2: r.segment.x2,
          y2: r.segment.y2,
        };
        newSegments.push(seg);
        agent.tip = { x: seg.x2, y: seg.y2 };
        agent.traceSteps = [
          ...agent.traceSteps,
          {
            tick,
            affectiveLine: r.affectiveLine,
            reasoning: r.reasoning,
            inferredOthersGoals: r.inferredOthersGoals,
            rivalPlay: r.rivalPlay,
            emotion: r.emotion,
            emotionIntensity: r.emotionIntensity,
            usedProvider: r.usedProvider,
            usedModel: r.usedModel,
            segment: r.segment,
          },
        ];
      } else {
        const fb = fallbackSegment(agent.id, agent.tip, item.order);
        newSegments.push(fb);
        agent.tip = { x: fb.x2, y: fb.y2 };
        agent.traceSteps = [
          ...agent.traceSteps,
          {
            tick,
            affectiveLine: 'Ik voel me even gedesoriënteerd — alsof de verbinding wegviel.',
            reasoning: `Fallback move (${item.err}).`,
            inferredOthersGoals: 'Onleesbaar — canvas bevriest even.',
            rivalPlay: 'Alleen overleven: een kleine stap vooruit.',
            emotion: 'glitchy unease',
            emotionIntensity: 3,
            usedProvider: 'local',
            usedModel: 'fallback',
            segment: {
              x1: fb.x1,
              y1: fb.y1,
              x2: fb.x2,
              y2: fb.y2,
            },
          },
        ];
      }
    }

    setSegments(newSegments);
    setAgents(nextAgents);
    segmentsRef.current = newSegments;
    agentsRef.current = nextAgents;
    setGlobalTick(tick + 1);
    setStatusLine(`Tick ${tick} done`);
  }, []);

  /** Wait tickMs between ticks, and never start a new tick until the previous one finished (fixes stale-tip / “frozen” agents). */
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    let tid: ReturnType<typeof window.setTimeout> | undefined;

    function schedule() {
      if (tid !== undefined) window.clearTimeout(tid);
      tid = window.setTimeout(async () => {
        if (cancelled) return;
        await runTick();
        if (cancelled) return;
        schedule();
      }, tickMs);
    }

    schedule();

    return () => {
      cancelled = true;
      if (tid !== undefined) window.clearTimeout(tid);
    };
  }, [running, tickMs, runTick]);

  const reset = () => {
    setRunning(false);
    tickRef.current = 0;
    setGlobalTick(0);
    setSegments([]);
    setAgents(makeAgents(agentCount));
    setStatusLine('Reset');
    resetPanZoom();
  };

  const applyCount = () => {
    setRunning(false);
    tickRef.current = 0;
    setGlobalTick(0);
    setSegments([]);
    setAgents(makeAgents(agentCount));
    resetPanZoom();
  };

  return (
    <div className="min-h-screen w-full bg-[#12060c] text-rose-50/95 selection:bg-rose-500/25">
      <div
        className="pointer-events-none fixed inset-0 opacity-[0.09]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <header className="relative z-10 border-b border-rose-900/40 bg-[#1a0812]/85 px-6 py-5 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-end justify-between gap-4">
          <div className="text-left">
            <p className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.35em] text-rose-300/90">
              <Sparkles className="size-3.5" />
              Agentic performance · adaptation
            </p>
            <h1 className="bg-gradient-to-r from-rose-100 via-amber-50 to-orange-100 bg-clip-text font-serif text-3xl font-medium tracking-tight text-transparent md:text-4xl">
              Convergent race / hidden agendas
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-rose-200/55">
              Zes rollen die elkaar expres in de weg zitten — magnet tegen schild, kruiser tegen spook,
              hoge tegen lage lijn. Geen briefs van anderen: alleen Risk-lezen op lijnen, dan emotioneel
              en tactisch bijsturen. Chorus vangt affect + rival games.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setRunning((r) => !r)}
              className="inline-flex items-center gap-2 rounded-full border border-rose-900/50 bg-rose-950/40 px-4 py-2 text-sm font-medium text-rose-50 transition hover:bg-rose-950/70"
            >
              {running ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
              {running ? 'Pause' : 'Run'}
            </button>
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-2 rounded-full border border-rose-900/50 bg-rose-950/40 px-4 py-2 text-sm font-medium text-rose-50 transition hover:bg-rose-950/70"
            >
              <RotateCcw className="size-4" />
              Reset
            </button>
            <label className="flex items-center gap-2 rounded-full border border-rose-900/40 bg-black/35 px-3 py-2 font-mono text-xs text-rose-200/50">
              Agents
              <input
                type="number"
                min={6}
                max={24}
                value={agentCount}
                onChange={(e) =>
                  setAgentCount(
                    Math.min(24, Math.max(6, Number(e.target.value) || 6)),
                  )
                }
                className="w-12 rounded border border-rose-900/50 bg-black/60 px-2 py-1 text-rose-50"
              />
              <button
                type="button"
                onClick={applyCount}
                className="rounded-full bg-rose-700/90 px-2 py-1 text-[10px] uppercase tracking-wider text-white hover:bg-rose-600"
              >
                Apply
              </button>
            </label>
            <label className="flex items-center gap-2 rounded-full border border-rose-900/40 bg-black/35 px-3 py-2 font-mono text-xs text-rose-200/50">
              ms
              <input
                type="number"
                min={800}
                max={8000}
                step={100}
                value={tickMs}
                onChange={(e) => setTickMs(Number(e.target.value) || 2200)}
                className="w-16 rounded border border-rose-900/50 bg-black/60 px-2 py-1 text-rose-50"
              />
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-full border border-rose-900/40 bg-black/35 px-3 py-2 font-mono text-xs text-rose-200/50">
              <input
                type="checkbox"
                checked={showSecrets}
                onChange={(e) => setShowSecrets(e.target.checked)}
                className="accent-rose-500"
              />
              Toon geheime opdracht
            </label>
          </div>
        </div>
        <p className="mx-auto mt-3 max-w-[1600px] px-6 font-mono text-[11px] text-amber-200/70">
          {statusLine} · global tick {globalTick}
        </p>
      </header>

      <main className="relative z-10 mx-auto max-w-[1800px] space-y-6 px-6 py-8">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(260px,340px)]">
        <section className="relative min-h-[min(78vh,920px)] overflow-hidden rounded-2xl border border-rose-900/35 bg-gradient-to-br from-[#1f0a14]/95 via-[#12060c] to-black shadow-[0_0_120px_-20px_rgba(251,113,133,0.28)]">
          <div className="pointer-events-none absolute left-4 top-4 z-20 font-mono text-[10px] uppercase tracking-widest text-rose-300/40">
            Field · scroll zoom · drag pan · same attractor T
          </div>
          <div className="absolute right-3 top-3 z-20 flex gap-1.5">
            <button
              type="button"
              onClick={() => zoomBy(1.22)}
              className="pointer-events-auto rounded-lg border border-rose-900/45 bg-black/55 p-2 text-rose-100/80 backdrop-blur hover:bg-rose-950/50"
              title="Zoom in"
            >
              <ZoomIn className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.22)}
              className="pointer-events-auto rounded-lg border border-rose-900/45 bg-black/55 p-2 text-rose-100/80 backdrop-blur hover:bg-rose-950/50"
              title="Zoom out"
            >
              <ZoomOut className="size-4" />
            </button>
            <button
              type="button"
              onClick={resetPanZoom}
              className="pointer-events-auto rounded-lg border border-rose-900/45 bg-black/55 p-2 text-rose-100/80 backdrop-blur hover:bg-rose-950/50"
              title="Reset view"
            >
              <Maximize2 className="size-4" />
            </button>
          </div>
          <svg
            ref={svgRef}
            viewBox="0 0 100 100"
            className="h-full min-h-[min(72vh,880px)] w-full cursor-grab touch-none active:cursor-grabbing"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="fieldWarm" cx="50%" cy="45%" r="70%">
                <stop offset="0%" stopColor="rgba(254,205,211,0.12)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0)" />
              </radialGradient>
              <radialGradient id="eggGlow" cx="42%" cy="42%" r="55%">
                <stop offset="0%" stopColor="#fff7f2" stopOpacity="0.95" />
                <stop offset="35%" stopColor="#ffd8cf" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#7c2d12" stopOpacity="0" />
              </radialGradient>
              <filter
                id="swimGlow"
                x="-100%"
                y="-100%"
                width="300%"
                height="300%"
              >
                <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" result="b" />
                <feMerge>
                  <feMergeNode in="b" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <g ref={gRef}>
              <rect width="100" height="100" fill="url(#fieldWarm)" opacity="0.9" />
              <ellipse
                cx={TARGET.x * 100}
                cy={TARGET.y * 100}
                rx="5.5"
                ry="6.2"
                fill="url(#eggGlow)"
                opacity="0.85"
              />
              <ellipse
                cx={TARGET.x * 100}
                cy={TARGET.y * 100}
                rx="3.2"
                ry="3.6"
                fill="none"
                stroke="rgba(255,240,235,0.55)"
                strokeWidth="0.2"
              />
              <text
                x={TARGET.x * 100 + 4.2}
                y={TARGET.y * 100 - 3}
                fill="rgba(255,250,248,0.9)"
                fontSize="3.2"
                className="font-mono"
              >
                T
              </text>
              {agents.map((a) => {
                const dPath = pathsByAgent.get(a.id);
                if (!dPath) return null;
                return (
                  <g key={`pathg-${a.id}`}>
                    <path
                      d={dPath}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="2.1"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.18}
                      filter="url(#swimGlow)"
                    />
                    <path
                      d={dPath}
                      fill="none"
                      stroke={a.color}
                      strokeWidth="0.58"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.92}
                    />
                  </g>
                );
              })}
              {agents.map((a) =>
                a.tip ? (
                  <circle
                    key={`tip-${a.id}`}
                    cx={a.tip.x * 100}
                    cy={a.tip.y * 100}
                    r={activeAgent === a.id ? 1.35 : 0.85}
                    fill={a.color}
                    opacity={0.95}
                    className="transition-all duration-300"
                  />
                ) : null,
              )}
            </g>
          </svg>
        </section>

        <aside className="max-h-[min(78vh,920px)] space-y-3 overflow-y-auto pr-1">
          <h2 className="sticky top-0 z-10 bg-[#12060c]/95 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-rose-300/45 backdrop-blur">
            Traces · affect · Risk-reads
          </h2>
          {agents.map((a) => (
            <article
              key={a.id}
              className="rounded-xl border border-rose-900/30 bg-rose-950/[0.12] p-4 shadow-inner backdrop-blur-sm transition hover:border-rose-500/30"
              style={{
                boxShadow: `0 0 32px -12px ${a.color}33`,
              }}
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span
                  className="font-mono text-xs font-semibold tracking-tight"
                  style={{ color: a.color }}
                >
                  {a.id}
                </span>
                <span className="text-[10px] text-rose-200/35">
                  {a.traceSteps.length} steps
                </span>
              </div>
              {showSecrets && (
                <p className="mb-3 border-l-2 border-rose-500/35 pl-2 font-mono text-[10px] leading-snug text-rose-200/50">
                  {a.privateConstraint}
                </p>
              )}
              <ul className="space-y-3">
                {[...a.traceSteps].reverse().slice(0, 4).map((step) => (
                  <li
                    key={`${a.id}-${step.tick}`}
                    className={`rounded-lg border bg-black/30 p-2.5 transition ${
                      spotlightTick >= 0 && step.tick === spotlightTick
                        ? 'border-rose-400/50 shadow-[0_0_24px_-4px_rgba(251,113,133,0.45)] ring-1 ring-rose-400/25'
                        : 'border-rose-900/25'
                    }`}
                  >
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[9px] text-rose-200/40">
                        t{step.tick}
                      </span>
                      <span
                        className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider"
                        style={{
                          backgroundColor: `${a.color}22`,
                          color: a.color,
                          boxShadow: `0 0 ${step.emotionIntensity * 6}px ${a.color}44`,
                        }}
                      >
                        {step.emotion} · {step.emotionIntensity}
                      </span>
                      <span className="font-mono text-[9px] text-rose-200/30">
                        {step.usedProvider}/{step.usedModel}
                      </span>
                    </div>
                    <p className="mb-1 text-xs italic leading-relaxed text-rose-100/90">
                      {step.affectiveLine}
                    </p>
                    <p className="mb-1 font-mono text-[9px] leading-snug text-amber-200/55">
                      <span className="text-rose-300/50">Read:</span>{' '}
                      {step.inferredOthersGoals}
                    </p>
                    <p className="mb-1 font-mono text-[9px] leading-snug text-orange-200/50">
                      <span className="text-rose-300/50">Play:</span> {step.rivalPlay}
                    </p>
                    <p className="font-mono text-[10px] leading-relaxed text-rose-200/45">
                      {step.reasoning}
                    </p>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </aside>
        </div>

        <section className="rounded-2xl border border-rose-500/25 bg-gradient-to-r from-rose-950/50 via-[#140810]/90 to-amber-950/20 px-4 py-4 shadow-[0_0_52px_-14px_rgba(251,113,133,0.35)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.35em] text-rose-100/80">
              Live chorus · affect + rival play
            </h2>
            <span className="font-mono text-[9px] text-rose-200/40">
              intensiteit · tick {spotlightTick >= 0 ? spotlightTick : '—'}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto pb-2 pt-1 [scrollbar-width:thin]">
            {chorusEntries.length === 0 ? (
              <p className="text-sm text-rose-200/40">
                Run — hier verschijnen emotie + hoe ze elkaar proberen te lezen/tegen te werken.
              </p>
            ) : (
              chorusEntries.map(({ agent: a, step }) => (
                <div
                  key={`chorus-${a.id}-${step.tick}`}
                  className={`min-w-[240px] max-w-[300px] shrink-0 rounded-xl border px-3 py-2.5 backdrop-blur-sm transition ${
                    spotlightTick >= 0 && step.tick === spotlightTick
                      ? 'animate-pulse border-rose-400/45 bg-rose-950/30'
                      : 'border-rose-900/35 bg-black/45'
                  }`}
                  style={{
                    boxShadow: `0 0 22px -6px ${a.color}50`,
                  }}
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span
                      className="font-mono text-[11px] font-semibold"
                      style={{ color: a.color }}
                    >
                      {a.id}
                    </span>
                    <span
                      className="rounded-full px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/90"
                      style={{
                        backgroundColor: `${a.color}33`,
                        boxShadow: `0 0 ${8 + step.emotionIntensity * 4}px ${a.color}66`,
                      }}
                    >
                      {step.emotion} · {step.emotionIntensity}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs italic leading-snug text-rose-50/95">
                    {step.affectiveLine}
                  </p>
                  <p className="mt-1 line-clamp-2 font-mono text-[9px] leading-snug text-orange-200/55">
                    {step.rivalPlay}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-rose-950/50 px-6 py-6 text-center font-mono text-[10px] text-rose-200/35">
        Model pool · geometry is public · briefs & reads are private · ticks never overlap
      </footer>
    </div>
  );
}
