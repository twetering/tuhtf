import { useEffect, useRef, useState } from 'react';
import type { Body, BodyHub } from './bodies';
import { Defrag, Denkt, Laden, Modem, Projectie, Server, type Drive } from './Digitaal';
import { SimControls } from './Me';
import Mashup, { type MashupKind } from './mashups/Mashup';
import { Hum, knock, ping, tick } from './sound';
import { ClockFace, Label, Seg, Spark, Uitleg, sourceMark, useEvents, useFrame } from './ui';

type Machine = MashupKind | 'magnetron' | 'wasmachine' | 'projectie' | 'klok' | 'server' | 'laden' | 'modem' | 'defrag' | 'denkt' | 'magnetron2';
type Couple = 'eigen' | 'hart' | 'adem' | 'beide';

const MASHUPS: MashupKind[] = ['opwarmen', 'opschonen', 'nadenken', 'bufferen'];
const isMashup = (m: Machine): m is MashupKind => (MASHUPS as string[]).includes(m);
const GROEPEN: { titel: string; items: Machine[] }[] = [
  { titel: 'analoog', items: ['magnetron', 'wasmachine', 'projectie', 'klok'] },
  { titel: 'digitaal', items: ['server', 'laden', 'modem', 'defrag', 'denkt', 'magnetron2'] },
];
const TEKST: Record<Machine, { titel: string; kort: string; regel: string; spiegel: string }> = {
  opwarmen: { titel: 'Opwarmen', kort: 'magnetron × datacentrum', regel: 'Een magnetron uit de jaren tachtig. Op het draaiplateau staat geen mok maar een klein datacentrum. De racks knipperen en worden langzaam warm, en uit de kasten stijgen getallen op als stoom: enen en nullen, en de gewichten van een model. Je kijkt naar iets dat opwarmt, zoals je altijd naar een magnetron kijkt.', spiegel: 'Het plateau draait mee met je hart: tien slagen per rondje. De kookwekker tikt één seconde terug per hartslag, twee minuten lichaamstijd. Bij elke slag stijgt er een wolkje getallen op.' },
  opschonen: { titel: 'Opschonen', kort: 'vaatwasser × defragmenteren', regel: 'Een open vaatwasser, het bovenrek met kopjes uitgetrokken. De borden in het onderrek zijn de blokken van een harde schijf: terracotta is gefragmenteerd, kobalt staat op zijn plek, celadon is een systeembestand dat nooit verschuift. De machine ruimt op, bord voor bord. Daarna spoelt hij na, en begint een nieuwe dag. Op de vloer ligt de kaart van de schijf als lichtvlek.', spiegel: 'Bij elke hartslag zet de machine één bord op zijn plaats en geeft de sproeiarm een stoot.' },
  nadenken: { titel: 'Nadenken', kort: 'klok × hartslag', regel: 'Een regulateur aan de muur. Uur- en minuutwijzer geven gewoon de tijd aan. De terracotta lolliwijzer is je hart. Telkens als hij de minuutwijzer inhaalt, slaat de klok: de tijd en je hartslag raken elkaar even. Over de muur trekt langzaam het licht van een raam.', spiegel: 'De hartwijzer springt één streepje per hartslag en de slinger zwaait één keer per slag. Hoe rustiger je hart, hoe langer het duurt tot de klok weer slaat.' },
  bufferen: { titel: 'Bufferen', kort: 'wasmachine × denkwoorden', regel: 'Een voorlader die nadenkt zoals een AI. De fases van het wasprogramma heten marineren, karnen, sudderen, herkauwen, mijmeren en zweven. Rond de deur draait een laadwieltje van lampjes. De trommel heeft de echte wascadans: een paar rondjes linksom, even stil, rondjes rechtsom. Binnenin alleen schuim.', spiegel: 'Het wieltje zet één stap per hartslag. De trommel telt zijn cadans in hartslagen, dus hij draait trager als jij rustiger wordt.' },
  magnetron: { titel: 'Draaiplateau', kort: 'magnetron', regel: 'Een mok die langzaam rondjes draait in warm licht. Wachten tot de piep.', spiegel: 'Het plateau draait één keer per ademhaling. Een echt plateau draait 5 à 6 keer per minuut: het tempo van rustig ademen.' },
  wasmachine: { titel: 'Trommel', kort: 'wasmachine', regel: 'Wasgoed dat valt en weer wordt opgetild. Linksom, even stil, rechtsom.', spiegel: 'De trommel draait één keer per ademhaling.' },
  projectie: { titel: 'Nog 1:12', kort: 'vaatwasser', regel: 'Een moderne vaatwasser projecteert de resterende tijd als lichtvlek op de keukenvloer. Je kijkt ernaar zonder iets te verwachten.', spiegel: 'De tijd telt één seconde af per hartslag; de lichtgolven dijen uit op je adem.' },
  klok: { titel: 'Hartslagtijd', kort: 'klok', regel: 'Een klok die één seconde verspringt per hartslag. Rust je, dan loopt jouw tijd achter.', spiegel: 'Echte tijd tegenover lichaamstijd, en het verschil daartussen.' },
  server: { titel: 'Serverruimte', kort: 'server', regel: 'Rijen kasten, knipperende lampjes, ventilatoren die nooit stoppen. Het lichaam van de AI.', spiegel: 'De ventilatoren draaien op jouw hartslag: rustiger hart, stillere hal. De lampjes knipperen mee met je slagen.' },
  laden: { titel: 'Nieuwe wereld', kort: 'laden', regel: 'Een game die een nieuwe wereld laadt. Er is niets te doen dan wachten.', spiegel: 'De balk schuift op per hartslag, de spinner draait op je adem.' },
  modem: { titel: 'Inbellen', kort: 'modem', regel: 'Jaren negentig: het gekrijs van de modem, bestanden die van map naar map vliegen, ‘nog 3 minuten’. Toen was wachten nog gewoon.', spiegel: 'Elk blaadje vliegt op een hartslag over. De modemlampjes knipperen met je in- en uitademing.' },
  defrag: { titel: 'Defragmenteren', kort: 'defrag', regel: 'De schijf wordt opgeruimd, blokje voor blokje. Rood wordt blauw. Je kunt er uren naar kijken.', spiegel: 'Bij elke hartslag wordt één blokje op zijn plek gezet, met het tikje van de leeskop.' },
  denkt: { titel: 'Denkt na…', kort: 'AI denkt', regel: 'De AI is bezig. Lummelen, mijmeren, sudderen. Wat doet een machine als hij ‘denkt’?', spiegel: 'Het teken ademt met je mee; elke zeven hartslagen een nieuw woord voor niksen.' },
  magnetron2: { titel: 'Digitaal opwarmen', kort: 'magnetron 2.0', regel: 'Een magnetron, maar binnenin warmt geen mok op: er laadt iets.', spiegel: 'Het plateau draait op je adem, de ring vult zich per hartslag.' },
};
const breathLevel = (ph: number, inFrac = 0.4) => (ph < inFrac ? 0.5 - 0.5 * Math.cos((ph / inFrac) * Math.PI) : 0.5 + 0.5 * Math.cos(((ph - inFrac) / (1 - inFrac)) * Math.PI));
const hasBreath = (b: Body | undefined) => !!b && (!!b.sim || b.acc.breathQ > 0.35);

export default function Machines({ hub }: { hub: BodyHub }) {
  useFrame(30);
  const [machine, setMachine] = useState<Machine>('opwarmen');
  const [schetsen, setSchetsen] = useState(false);
  const [couple, setCouple] = useState<Couple>('beide');
  const [heartId, setHeartId] = useState<string | null>(null);
  const [breathId, setBreathId] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(true);
  const t0 = useRef(performance.now());

  // bronnen: hart van een band (of sim), adem van een stick (of sim). Twee verschillende lichamen mag.
  const sim = () => hub.ensureSim('jij', 'jij (sim)', 40);
  const heart = hub.get(heartId) ?? hub.bodies.find((b) => b.source !== 'sim' && b.hr > 0) ?? sim();
  const breathBody = hub.get(breathId) ?? hub.bodies.find((b) => hub.procs.has(b.id)) ?? heart;

  const beats = useRef(0);
  const lastBeat = useRef(performance.now());
  const breaths = useRef(0);
  useEvents(hub, (id, s, t) => {
    if (id === heart.id && s === 'hart') {
      beats.current++;
      lastBeat.current = t;
      if (machine === 'klok' && soundOn && (couple === 'hart' || couple === 'beide')) tick(0.5);
    }
    if (id === breathBody.id && s === 'adem') breaths.current++;
  });

  const now = performance.now();
  const el = (now - t0.current) / 1000;
  const useHeart = couple === 'hart' || couple === 'beide';
  const useBreath = (couple === 'adem' || couple === 'beide') && hasBreath(breathBody);
  const beatReal = beats.current + Math.min(0.999, (now - lastBeat.current) / (60000 / Math.max(40, heart.hr || 60)));
  const ph = breathBody.acc.breathPhase;
  const d: Drive = {
    beat: useHeart ? beatReal : el,
    breath: useBreath ? breaths.current + ph : el / 10,
    level: useBreath ? breathLevel(ph) : breathLevel((el / 10) % 1),
    inhaling: useBreath ? ph < 0.4 : (el / 10) % 1 < 0.4,
    hr: useHeart ? heart.hr : 66,
    br: useBreath ? breathBody.acc.breathRate : 6,
    mirrored: couple !== 'eigen',
  };

  const T = TEKST[machine];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="mono text-[10.5px] text-ink-3 uppercase tracking-[0.14em]">analoog × digitaal</span>
          <Seg value={machine} options={MASHUPS} onChange={setMachine} labels={{ opwarmen: 'opwarmen', opschonen: 'opschonen', nadenken: 'nadenken', bufferen: 'bufferen' }} />
        </div>
        <button className={`chip ${schetsen ? 'on' : ''}`} onClick={() => setSchetsen(!schetsen)}>eerdere schetsen</button>
      </div>
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${schetsen ? '' : 'hidden'}`}>
        {GROEPEN.map((g) => (
          <div key={g.titel} className="flex items-center gap-2">
            <span className="mono text-[10.5px] text-ink-3 uppercase tracking-[0.14em]">{g.titel}</span>
            <Seg value={machine} options={g.items} onChange={setMachine} labels={Object.fromEntries(g.items.map((m) => [m, TEKST[m].kort]))} />
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {isMashup(machine) ? (
          <Seg value={couple === 'eigen' ? 'eigen' : 'hart'} options={['eigen', 'hart'] as const} onChange={setCouple} labels={{ eigen: 'eigen tempo', hart: 'spiegelt hart' }} />
        ) : (
          <Seg value={couple} options={['eigen', 'hart', 'adem', 'beide'] as const} onChange={setCouple} labels={{ eigen: 'eigen tempo', hart: 'spiegelt hart', adem: 'spiegelt adem', beide: 'spiegelt hart + adem' }} />
        )}
        <Bron label="hart" hub={hub} value={heart} onPick={setHeartId} filter={(b) => b.hr > 0 || !!b.sim} />
        <Bron label="adem" hub={hub} value={breathBody} onPick={setBreathId} filter={(b) => hub.procs.has(b.id) || !!b.sim} />
        <button className={`chip ${soundOn ? 'on' : ''}`} onClick={() => setSoundOn(!soundOn)}>geluid</button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card overflow-hidden relative aspect-[16/10] bg-room flex items-center justify-center">
          {isMashup(machine) && (
            <Mashup kind={machine} d={d} soundOn={soundOn} info={<><div className="text-[15px]">{T.titel} <span className="opacity-60">· {T.kort}</span></div><p className="opacity-85">{couple === 'eigen' ? 'In eigen tempo: de machine loopt op 60 tikken per minuut.' : T.spiegel}</p></>} />
          )}
          {machine === 'klok' && <HartKlok beats={Math.floor(d.beat)} couple={useHeart ? 'hart' : 'eigen'} breaths={Math.floor(d.breath)} />}
          {machine === 'projectie' && <Projectie d={d} soundOn={soundOn} />}
          {machine === 'wasmachine' && <Wasmachine phase={d.breath / (useBreath ? 1 : 0.3)} soundOn={soundOn} />}
          {machine === 'magnetron' && <Magnetron phase={useBreath ? d.breath : el / 10.5} soundOn={soundOn} />}
          {machine === 'magnetron2' && <Magnetron phase={useBreath ? d.breath : el / 10.5} soundOn={soundOn} inside="laden" beat={d.beat} />}
          {machine === 'server' && <Server d={d} soundOn={soundOn} />}
          {machine === 'laden' && <Laden d={d} />}
          {machine === 'modem' && <Modem d={d} soundOn={soundOn} />}
          {machine === 'defrag' && <Defrag d={d} soundOn={soundOn} />}
          {machine === 'denkt' && <Denkt d={d} />}
          {!isMashup(machine) && (couple === 'adem' || couple === 'beide') && !hasBreath(breathBody) && (
            <div className="absolute left-3 top-3 mono text-[11px] px-2 py-1" style={{ background: 'rgba(0,0,0,.55)', color: '#fff' }}>geen meetbare adem: machine ademt in eigen tempo</div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <div className="text-[34px] font-light tracking-[-0.03em] leading-none">{T.titel}</div>
            <div className="mono text-[11px] text-ink-3 mt-2">
              ♥ {Math.round(heart.hr) || '–'} · adem {hasBreath(breathBody) && breathBody.acc.breathRate ? breathBody.acc.breathRate.toFixed(1) : '—'}/min
            </div>
          </div>
          <Experiment hub={hub} heart={heart} breath={breathBody} machine={machine} setCouple={setCouple} />
          <SimControls b={heart} />
        </div>
      </div>

      <Uitleg title={T.titel}>
        <p>{T.regel}</p>
        <p>Spiegelend: {T.spiegel}</p>
      </Uitleg>
      <Uitleg title="Het experiment">
        <p>Kan een machine jou rustig maken? En wat werkt beter: een gewone machine in haar eigen tempo, of een machine die jouw ritme spiegelt?</p>
        <p>Het experiment speelt dezelfde machine twee keer af, in willekeurige volgorde: één keer in eigen tempo, één keer spiegelend op hart en adem. Steeds wordt gemeten hoeveel je hartslag en ademtempo daalden (laatste 30 s tegenover eerste 30 s). De vier analoog × digitaal-machines spiegelen alleen je hartslag: dat is één helder ritme dat je kunt zien en horen. Je adem wordt wel gemeten, zodat je kunt zien of een machine ook je ademhaling vertraagt zonder dat ze die nadoet. De uitkomsten worden bewaard, zodat je over meerdere mensen en machines kunt vergelijken.</p>
      </Uitleg>
      <Uitleg title="Bronnen">
        <p>Hartslag komt van een band, adem van een bewegingssensor op borst of buik (M5Stick, Polar H10). Dat mogen twee verschillende apparaten zijn. Zonder echte sensoren gebruikt het Lummellab een gesimuleerde ‘jij’, die je met de knoppen rechts kunt laten ontspannen.</p>
      </Uitleg>
    </div>
  );
}

function Bron({ label, hub, value, onPick, filter }: { label: string; hub: BodyHub; value: Body; onPick: (id: string) => void; filter: (b: Body) => boolean }) {
  const opts = hub.bodies.filter(filter);
  if (!opts.includes(value)) opts.unshift(value);
  return (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-3">
      {label}
      <select value={value.id} onChange={(e) => onPick(e.target.value)} className="px-1.5 py-1 text-[12px]">
        {opts.map((b) => <option key={b.id} value={b.id}>{sourceMark(b)} {b.name}</option>)}
      </select>
    </label>
  );
}

type ExpResult = { date: string; machine: Machine; eigen: { dhr: number; dbr: number | null }; spiegel: { dhr: number; dbr: number | null } };
function loadResults(): ExpResult[] {
  try {
    return JSON.parse(localStorage.getItem('sk-machine-exp') ?? '[]');
  } catch {
    return [];
  }
}

/** A/B: eigen tempo tegenover spiegelend, in willekeurige volgorde. */
function Experiment({ hub, heart, breath, machine, setCouple }: { hub: BodyHub; heart: Body; breath: Body; machine: Machine; setCouple: (c: Couple) => void }) {
  const [dur, setDur] = useState(180);
  const [run, setRun] = useState<null | { order: ('eigen' | 'beide')[]; idx: number; start: number; samples: { c: string; t: number; hr: number; br: number }[] }>(null);
  const [results, setResults] = useState<ExpResult[]>(loadResults);
  const runRef = useRef(run);
  runRef.current = run;
  void hub;

  useEffect(() => {
    if (!run) return;
    const id = window.setInterval(() => {
      const r = runRef.current;
      if (!r) return;
      const t = (performance.now() - r.start) / 1000;
      const c = r.order[r.idx];
      const sample = { c, t, hr: heart.hr, br: hasBreath(breath) ? breath.acc.breathRate : 0 };
      if (t >= dur) {
        if (r.idx === 0) {
          setCouple(r.order[1]);
          ping(0.3, 1);
          setRun({ ...r, idx: 1, start: performance.now(), samples: [...r.samples, sample] });
        } else {
          const all = [...r.samples, sample];
          const delta = (cond: string) => {
            const s = all.filter((x) => x.c === cond);
            const first = s.filter((x) => x.t < 30);
            const last = s.filter((x) => x.t > dur - 30);
            const avg = (a: typeof s, k: 'hr' | 'br') => (a.length ? a.reduce((q, x) => q + x[k], 0) / a.length : 0);
            const br0 = avg(first.filter((x) => x.br > 0), 'br');
            const br1 = avg(last.filter((x) => x.br > 0), 'br');
            return { dhr: +(avg(last, 'hr') - avg(first, 'hr')).toFixed(1), dbr: br0 && br1 ? +(br1 - br0).toFixed(1) : null };
          };
          const res: ExpResult = { date: new Date().toLocaleString('nl-NL'), machine, eigen: delta('eigen'), spiegel: delta('beide') };
          const next = [res, ...results].slice(0, 40);
          setResults(next);
          try {
            localStorage.setItem('sk-machine-exp', JSON.stringify(next));
          } catch {
            /* niet bewaard */
          }
          ping(0.3, 3);
          setRun(null);
        }
      } else setRun({ ...r, samples: [...r.samples, sample] });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.idx, run?.start, dur, heart, breath, machine]);

  const startExp = () => {
    const order: ('eigen' | 'beide')[] = Math.random() < 0.5 ? ['eigen', 'beide'] : ['beide', 'eigen'];
    setCouple(order[0]);
    setRun({ order, idx: 0, start: performance.now(), samples: [] });
  };
  const left = run ? Math.max(0, dur - (performance.now() - run.start) / 1000) : 0;
  const last = results[0];
  const verdict = (r: ExpResult) => {
    const e = r.eigen.dhr;
    const s = r.spiegel.dhr;
    if (Math.abs(e - s) < 1) return 'geen verschil';
    return s < e ? `spiegelend ${Math.abs(s - e).toFixed(1)} bpm rustiger` : `eigen tempo ${Math.abs(s - e).toFixed(1)} bpm rustiger`;
  };
  const trace = run ? run.samples.filter((x) => x.c === run.order[run.idx]).map((x) => x.hr) : [];

  return (
    <div className="card p-4">
      <Label>experiment · kalmeert deze machine je?</Label>
      {run ? (
        <div className="mt-2">
          <div className="text-[22px] font-light">{run.idx + 1}/2 · {run.order[run.idx] === 'eigen' ? 'eigen tempo' : 'spiegelend'}</div>
          <div className="mono text-[12px] text-ink-3">nog {Math.floor(left / 60)}:{String(Math.floor(left % 60)).padStart(2, '0')} · ♥ {Math.round(heart.hr)}</div>
          <Spark values={trace} h={44} />
          <button className="btn mt-2" onClick={() => setRun(null)}>stop</button>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-[12px] text-ink-3">
            per deel
            <Seg value={dur} options={[60, 180, 300] as const} onChange={setDur} labels={{ 60: '1 min', 180: '3 min', 300: '5 min' }} />
          </div>
          <button className="btn accent w-full" onClick={startExp}>start A/B ({(dur * 2) / 60} min)</button>
          {last && (
            <div className="text-[12.5px] mt-2">
              <div className="text-ink-2">laatste: {TEKST[last.machine].kort} · <b className="font-medium">{verdict(last)}</b></div>
              <div className="mono text-[11px] text-ink-3 mt-1">
                eigen Δ♥ {last.eigen.dhr > 0 ? '+' : ''}{last.eigen.dhr}{last.eigen.dbr !== null ? ` · Δadem ${last.eigen.dbr}` : ''}
                <br />spiegel Δ♥ {last.spiegel.dhr > 0 ? '+' : ''}{last.spiegel.dhr}{last.spiegel.dbr !== null ? ` · Δadem ${last.spiegel.dbr}` : ''}
              </div>
            </div>
          )}
          {results.length > 1 && (
            <div className="mono text-[10.5px] text-ink-3">
              {results.length} metingen · spiegelend rustiger in {results.filter((r) => r.spiegel.dhr < r.eigen.dhr - 1).length}, eigen tempo in {results.filter((r) => r.eigen.dhr < r.spiegel.dhr - 1).length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------- klok

function HartKlok({ beats, breaths, couple }: { beats: number; breaths: number; couple: Couple }) {
  const [t0] = useState(() => Date.now());
  const [b0] = useState(beats);
  const [a0] = useState(breaths);
  const real = Date.now();
  const elapsedReal = Math.floor((real - t0) / 1000);
  const bodySecs = couple === 'hart' ? beats - b0 : couple === 'adem' ? (breaths - a0) * 5 : elapsedReal;
  const startSec = Math.floor(t0 / 1000);
  const fmt = (s: number) => new Date(s * 1000).toLocaleTimeString('nl-NL');
  const diff = bodySecs - elapsedReal;
  return (
    <div className="flex items-center gap-12">
      <ClockFace ticks={startSec + bodySecs} size={380} />
      <div className="mono text-[14px] space-y-2">
        <div className="text-hart">lichaamstijd {fmt(startSec + bodySecs)}</div>
        <div className="text-ink-3">echte tijd {fmt(Math.floor(real / 1000))}</div>
        <div className="serif text-[48px] leading-none">{diff >= 0 ? '+' : '−'}{Math.floor(Math.abs(diff) / 60)}:{String(Math.abs(diff) % 60).padStart(2, '0')}</div>
        <div className="text-ink-3 text-[11px]">{couple === 'adem' ? '5 seconden per ademhaling' : couple === 'hart' ? '1 seconde per hartslag' : 'gewone klok'}</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- wasmachine

function Wasmachine({ phase, soundOn }: { phase: number; soundOn: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const clothes = useRef(
    Array.from({ length: 9 }, (_, i) => ({ a: (i / 9) * Math.PI * 2, r: 0.55 + Math.random() * 0.25, hue: [12, 210, 45, 330, 160, 0, 260, 30, 190][i], size: 0.12 + Math.random() * 0.08, fall: 0 })),
  );
  useEffect(() => {
    const h = soundOn ? new Hum('bandpass', 280, 1.6, 0.1, 37) : null;
    let raf = 0;
    let lastA = 0;
    const draw = () => {
      const c = ref.current;
      if (c) {
        const g = c.getContext('2d')!;
        const W = (c.width = c.clientWidth * 2);
        const H = (c.height = c.clientHeight * 2);
        const R = Math.min(W, H) * 0.36;
        const cx = W / 2;
        const cy = H / 2;
        // richtingwissel: elke 'omwenteling' heen, daarna terug (zoals echte trommels)
        const p = phaseRef.current;
        const k = Math.floor(p);
        const f = p - k;
        const drumA = (k % 2 === 0 ? f : 1 - f) * Math.PI * 2;
        const dA = drumA - lastA;
        lastA = drumA;
        g.fillStyle = '#e8e5de';
        g.fillRect(0, 0, W, H);
        g.fillStyle = '#cfcbc3';
        g.beginPath();
        g.arc(cx, cy, R * 1.32, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#9aa0a6';
        g.beginPath();
        g.arc(cx, cy, R * 1.12, 0, Math.PI * 2);
        g.fill();
        g.save();
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.clip();
        g.fillStyle = '#1d2a36';
        g.fillRect(0, 0, W, H);
        // trommelgaatjes
        g.fillStyle = '#2c3e4f';
        for (let ring = 0.3; ring < 1; ring += 0.18)
          for (let i = 0; i < 24; i++) {
            const a = drumA + (i / 24) * Math.PI * 2 + ring;
            g.beginPath();
            g.arc(cx + Math.cos(a) * R * ring, cy + Math.sin(a) * R * ring, R * 0.018, 0, Math.PI * 2);
            g.fill();
          }
        // wasgoed: wordt opgetild en valt
        for (const cl of clothes.current) {
          cl.a += dA;
          const top = Math.sin(cl.a) < -0.75;
          if (top && Math.random() < 0.04) cl.fall = 1;
          if (cl.fall > 0) {
            cl.a -= dA; // valt los van de trommel
            cl.a += (Math.random() - 0.5) * 0.02;
            cl.r = Math.max(0.2, cl.r - 0.03);
            cl.fall -= 0.03;
            if (cl.fall <= 0) {
              cl.a = Math.PI / 2 + (Math.random() - 0.5) * 1.4;
              cl.r = 0.6 + Math.random() * 0.2;
              if (soundOn) knock(0.15);
            }
          }
          const x = cx + Math.cos(cl.a) * R * cl.r;
          const y = cy + Math.sin(cl.a) * R * cl.r;
          g.fillStyle = `hsla(${cl.hue},55%,58%,.9)`;
          g.beginPath();
          g.ellipse(x, y, R * cl.size * 1.4, R * cl.size, cl.a, 0, Math.PI * 2);
          g.fill();
        }
        // water + schuim
        g.fillStyle = 'rgba(120,180,220,.35)';
        g.fillRect(cx - R, cy + R * (0.35 + Math.sin(drumA * 2) * 0.04), R * 2, R);
        g.restore();
        // glas
        const grad = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
        grad.addColorStop(0, 'rgba(255,255,255,.25)');
        grad.addColorStop(0.5, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, R, 0, Math.PI * 2);
        g.fill();
        if (h) h.filter.frequency.value = 220 + Math.abs(dA) * 4000;
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      h?.stop();
    };
  }, [soundOn]);
  return <canvas ref={ref} className="w-full h-full" />;
}

// ---------------------------------------------------------------------------- magnetron

function Magnetron({ phase, soundOn, inside = 'mok', beat = 0 }: { phase: number; soundOn: boolean; inside?: 'mok' | 'laden'; beat?: number }) {
  const beatRef = useRef(beat);
  beatRef.current = beat;
  const ref = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [start, setStart] = useState(() => performance.now());
  const DUR = 120;
  useEffect(() => {
    const h = soundOn ? new Hum('bandpass', 900, 0.8, 0.05, 120) : null;
    let raf = 0;
    let pinged = false;
    const draw = () => {
      const c = ref.current;
      const left = Math.max(0, DUR - (performance.now() - start) / 1000);
      if (left === 0 && !pinged) {
        pinged = true;
        if (soundOn) ping(0.35, 3);
        h?.stop();
      }
      if (c) {
        const g = c.getContext('2d')!;
        const W = (c.width = c.clientWidth * 2);
        const H = (c.height = c.clientHeight * 2);
        g.fillStyle = '#d6d1c7';
        g.fillRect(0, 0, W, H);
        // venster
        const wx = W * 0.07;
        const wy = H * 0.12;
        const ww = W * 0.62;
        const wh = H * 0.76;
        g.fillStyle = '#1a140e';
        g.beginPath();
        g.roundRect(wx, wy, ww, wh, 24);
        g.fill();
        const on = left > 0;
        const glow = g.createRadialGradient(wx + ww / 2, wy + wh * 0.4, 10, wx + ww / 2, wy + wh / 2, ww * 0.6);
        glow.addColorStop(0, on ? 'rgba(255,190,90,.9)' : 'rgba(80,60,40,.5)');
        glow.addColorStop(1, 'rgba(40,25,10,.95)');
        g.fillStyle = glow;
        g.beginPath();
        g.roundRect(wx + 10, wy + 10, ww - 20, wh - 20, 18);
        g.fill();
        // plateau (perspectief) + mok
        const cx = wx + ww / 2;
        const cy = wy + wh * 0.68;
        const pr = ww * 0.36;
        g.fillStyle = 'rgba(255,255,255,.18)';
        g.beginPath();
        g.ellipse(cx, cy, pr, pr * 0.28, 0, 0, Math.PI * 2);
        g.fill();
        if (inside === 'laden') {
          // digitaal opwarmen: een zwevende voortgangsring die met het plateau meedraait
          const a = (phaseRef.current % 1) * Math.PI * 2;
          const p = (beatRef.current % 90) / 90;
          const r = pr * 0.42;
          g.save();
          g.translate(cx, cy - pr * 0.55);
          g.lineWidth = 14;
          g.strokeStyle = 'rgba(255,255,255,.15)';
          g.beginPath();
          g.arc(0, 0, r, 0, Math.PI * 2);
          g.stroke();
          g.strokeStyle = 'rgba(255,240,210,.95)';
          g.shadowColor = 'rgba(255,200,120,.9)';
          g.shadowBlur = 24;
          g.beginPath();
          g.arc(0, 0, r, a - Math.PI / 2, a - Math.PI / 2 + p * Math.PI * 2);
          g.stroke();
          g.shadowBlur = 0;
          g.fillStyle = 'rgba(255,245,225,.95)';
          g.font = `300 ${r * 0.5}px Geist, sans-serif`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText(`${Math.floor(p * 100)}%`, 0, 0);
          g.font = `${r * 0.17}px "Geist Mono", monospace`;
          g.fillText('opwarmen…', 0, r * 0.42);
          g.restore();
        } else {
        const a = (phaseRef.current % 1) * Math.PI * 2;
        const mx = cx + Math.cos(a) * pr * 0.45;
        const my = cy + Math.sin(a) * pr * 0.45 * 0.28;
        const depth = 0.85 + Math.sin(a) * 0.15;
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.beginPath();
        g.ellipse(mx, my + 6, 46 * depth, 12 * depth, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f1e7d6';
        g.fillRect(mx - 38 * depth, my - 90 * depth, 76 * depth, 90 * depth);
        g.beginPath();
        g.ellipse(mx, my - 90 * depth, 38 * depth, 10 * depth, 0, 0, Math.PI * 2);
        g.fillStyle = '#5a3a24';
        g.fill();
        g.strokeStyle = '#f1e7d6';
        g.lineWidth = 10 * depth;
        g.beginPath();
        const side = Math.cos(a) > 0 ? 1 : -1;
        g.arc(mx + side * 44 * depth, my - 48 * depth, 20 * depth, -Math.PI / 2, Math.PI / 2, side < 0);
        g.stroke();
        // stoom
        if (on) {
          for (let i = 0; i < 4; i++) {
            const t = (performance.now() / 1600 + i / 4) % 1;
            g.fillStyle = `rgba(255,255,255,${(1 - t) * 0.2})`;
            g.beginPath();
            g.arc(mx + Math.sin(t * 8 + i) * 10, my - 100 * depth - t * 80, 10 + t * 20, 0, Math.PI * 2);
            g.fill();
          }
        }
        }
        // paneel
        const px = wx + ww + W * 0.04;
        g.fillStyle = '#111';
        g.beginPath();
        g.roundRect(px, wy, W * 0.2, H * 0.18, 10);
        g.fill();
        g.fillStyle = '#7dff9a';
        g.font = `${H * 0.11}px "Geist Mono", monospace`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.shadowColor = '#7dff9a';
        g.shadowBlur = 16;
        g.fillText(`${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, px + W * 0.1, wy + H * 0.09);
        g.shadowBlur = 0;
        g.fillStyle = '#bdb7ab';
        for (let r = 0; r < 4; r++)
          for (let k = 0; k < 3; k++) {
            g.beginPath();
            g.roundRect(px + W * 0.02 + k * W * 0.06, wy + H * 0.26 + r * H * 0.1, W * 0.045, H * 0.07, 6);
            g.fill();
          }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      h?.stop();
    };
  }, [soundOn, start]);
  return (
    <>
      <canvas ref={ref} className="w-full h-full" />
      <button className="btn absolute right-4 bottom-4 !bg-black/60 !text-ink" onClick={() => setStart(performance.now())}>opnieuw 2:00</button>
    </>
  );
}
