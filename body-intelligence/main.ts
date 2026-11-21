/**
 * B.I. lab (Body Intelligence): laat een model leren wat een lichaam doet, en ontdek wat het níet leert.
 * Per set (dieren, machines, een klap, eigen) volgt de app de AI-keten: datamodel → verzamelen → labelen → ordenen → trainen → raden.
 * Bronnen: M5Stick via MQTT-kanaal (zoals in het Lummellab), de bewegingssensor van deze telefoon, of een simulatie.
 */
import './style.css';
import { FEATS, features, windows } from './features';
import { evaluate, predict, train, type Example, type Model } from './model';
import { randomStyle, simSample, type Style } from './sim';

const MQTT_URL = 'wss://broker.hivemq.com:8884/mqtt';
const TOPIC_ROOT = 'tuhtf/speelkamer';
const WIN = 2; // seconden per venster
const HOP = 1;

type Src = 'sim' | 'm5' | 'telefoon';
type Tab = 'model' | 'verzamelen' | 'labelen' | 'ordenen' | 'trainen' | 'raden';
type Recording = { id: string; animal: string; person: string; src: Src; plek: string; hz: number; acc: number[]; gyr: number[] | null; at: number; gevoel?: string; echt?: number };
type SetId = 'dieren' | 'machines' | 'klap' | 'eigen';

/** Een set = één vraag aan het lichaam, met eigen categorieën en eigen woorden. */
const SETS: Record<SetId, { naam: string; groep: string; vraag: string; uitleg: string; items: string[]; ev: string; elk: string; mv: string; a: string; b: string; titelModel: string; doe: string; raad: string; let?: string }> = {
  dieren: {
    naam: 'Dieren', groep: 'Andere lichamen', vraag: 'Kan een mens een dier nadoen?',
    uitleg: 'Beweeg als een kikker, vogel, slang of paard. Hoeveel kun je overnemen van een lichaam met een ander skelet?',
    items: ['kikker', 'vogel', 'slang', 'paard'], ev: 'dier', elk: 'elk dier', mv: 'dieren', a: 'kikker', b: 'slang',
    titelModel: 'Wat maakt een kikker een kikker?', doe: 'Doe het dier na', raad: 'Welk dier ben jij?',
  },
  machines: {
    naam: 'Machines', groep: 'Andere lichamen', vraag: 'Hoe is het om een machine te zijn?',
    uitleg: 'Tik als een klok, draai als een wasmachine, veeg als een ruitenwisser. Niet machines die op mensen gaan lijken: mensen die op machines gaan lijken.',
    items: ['klok', 'wasmachine', 'ruitenwisser', 'ventilator'], ev: 'machine', elk: 'elke machine', mv: 'machines', a: 'klok', b: 'wasmachine',
    titelModel: 'Wat maakt een klok een klok?', doe: 'Doe de machine na', raad: 'Welke machine ben jij?',
  },
  klap: {
    naam: 'Een klap', groep: 'Situatie en bedoeling', vraag: 'Zit de bedoeling in de beweging?',
    uitleg: 'Dezelfde klap, met een andere bedoeling: als grapje, woedend, gespeeld of aarzelend. Ziet een sensor het verschil? En jij?',
    items: ['grapje', 'woedend', 'gespeeld', 'aarzelend'], ev: 'bedoeling', elk: 'elke bedoeling', mv: 'bedoelingen', a: 'grapje', b: 'woedend',
    titelModel: 'Waar zit de woede in een klap?', doe: 'Geef de klap', raad: 'Wat bedoel je?',
    let: 'Sla nooit op een lichaam. Sla in de lucht, op een kussen of op een opgehouden hand.',
  },
  eigen: {
    naam: 'Eigen set', groep: 'Zelf bedenken', vraag: 'Wat wil jij een model leren?',
    uitleg: 'Bedenk zelf de categorieën: wie leidt en wie volgt, troosten of duwen, een hand geven op vier manieren.',
    items: [], ev: 'categorie', elk: 'elke categorie', mv: 'categorieën', a: 'het een', b: 'het ander',
    titelModel: 'Wat meet je?', doe: 'Doe het voor', raad: 'Wat doe je?',
  },
};

/** Proeven die nog gebouwd moeten worden: ruimte in het lab, om te bespreken. */
const VOORSTELLEN: { naam: string; vraag: string; uitleg: string }[] = [
  { naam: 'Fragmenten', vraag: 'Waar begint en eindigt een beweging?', uitleg: 'Neem een dagelijkse beweging op (opstaan) op de tel, en knip haar in fragmenten van 1, 2 of 4 tellen, of op de rustpunten. Wat blijft er heel, wat valt uit elkaar?' },
  { naam: 'Doorgeven', vraag: 'Wat blijft er over na tien lichamen?', uitleg: 'Een beweging gaat van lichaam naar lichaam, door kijken, door tasten of via woorden. De sensor meet hoeveel ze onderweg verandert.' },
  { naam: 'Beleving en verschijning', vraag: 'Wie weet wat er gebeurde?', uitleg: 'De beweger, een kijker en het model labelen dezelfde beweging. Waar zijn ze het oneens?' },
  { naam: 'Lichaam als prompt', vraag: 'Kan je adem een vraag zijn?', uitleg: 'Geen woorden typen, maar bewegen, ademen, stilvallen. Wat zou een systeem daarop moeten antwoorden?' },
];

const TABS: { id: Tab; n: string; t: string }[] = [
  { id: 'model', n: '1 · datamodel', t: 'Wat meet je?' },
  { id: 'verzamelen', n: '2 · verzamelen', t: 'Opnemen' },
  { id: 'labelen', n: '3 · labelen', t: 'Nakijken' },
  { id: 'ordenen', n: '4 · ordenen', t: 'Bekijken' },
  { id: 'trainen', n: '5 · trainen', t: 'Model bouwen' },
  { id: 'raden', n: '6 · raden', t: 'Fop het model' },
];
const EMOJI: Record<string, string> = {
  kikker: '🐸', vogel: '🐦', slang: '🐍', paard: '🐴', vis: '🐟', kat: '🐈', hond: '🐕', aap: '🐒', olifant: '🐘', konijn: '🐇', pinguïn: '🐧', krab: '🦀', geit: '🐐', gorilla: '🦍',
  klok: '🕰️', wasmachine: '🌀', ruitenwisser: '🌧️', ventilator: '💨', robot: '🤖', printer: '🖨️',
  grapje: '😄', woedend: '😠', gespeeld: '🎭', aarzelend: '😶', leiden: '🧭', volgen: '👣',
};
const PALET = ['#9be564', '#93d5f9', '#f39be8', '#ffb547', '#d3c5f9', '#ff7a7a', '#ffffff', '#5ef0c8'];
const PLEKKEN = ['pols', 'hand', 'enkel', 'onderrug', 'borst', 'hoofd'];
const SIM_PERSONEN: Record<string, Style> = { 'sim-Anouk': randomStyle(), 'sim-Bram': randomStyle(), 'sim-Celine': randomStyle() };

const emoji = (a: string) => EMOJI[a] ?? '🐾';
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const uid = () => Math.random().toString(36).slice(2, 9);
const fmt = (v: number, d = 0) => (Number.isFinite(v) ? v.toFixed(d) : '–');

// ------------------------------------------------------------------ toestand

const read = (k: string) => {
  try {
    return JSON.parse(localStorage.getItem(k) || '{}');
  } catch {
    return {};
  }
};
// eenmalig: opnames uit "dier nadoen" overnemen in de set dieren
try {
  if (localStorage.getItem('dn-state') && !localStorage.getItem('bi-dieren')) localStorage.setItem('bi-dieren', localStorage.getItem('dn-state')!);
} catch {
  /* geen opslag */
}
const glob = read('bi-global');
const saved: Record<string, unknown> = {};

const S = {
  set: null as SetId | null,
  lastRec: null as string | null,
  tab: (saved.tab as Tab) || 'model',
  animals: (saved.animals as string[]) || ['kikker', 'vogel', 'slang', 'paard'],
  feats: new Set<number>((saved.feats as number[]) || [0, 1, 2, 3, 4, 6, 7]),
  plek: (saved.plek as string) || 'pols',
  recs: (saved.recs as Recording[]) || [],
  person: (glob.person as string) || '',
  k: (saved.k as number) || 5,
  dur: (saved.dur as number) || 10,
  src: ((glob.src as Src) || 'sim') as Src,
  kanaal: localStorage.getItem('sk-kanaal') || '',
  scX: (saved.scX as number) ?? 0,
  scY: (saved.scY as number) ?? 2,
  recAnimal: (saved.animals as string[] | undefined)?.[0] || 'kikker',
  simPerson: 'sim-Anouk',
  simAnimal: 'kikker',
  rec: null as null | { animal: string; phase: 'aftellen' | 'opnemen'; t0: number; acc: number[]; gyr: number[]; hz: number },
  model: null as Model | null,
  modelKey: '',
  evalRes: null as ReturnType<typeof evaluate> | null,
  // bronnen
  devices: new Map<string, { name: string; last: number }>(),
  device: null as string | null,
  status: '',
  phoneOn: false,
};

function openSet(id: SetId | null) {
  S.set = id;
  S.model = null;
  S.evalRes = null;
  S.lastRec = null;
  featCache.clear();
  if (!id) return;
  const d = read(`bi-${id}`);
  S.tab = (d.tab as Tab) || 'model';
  S.animals = (d.animals as string[]) || [...SETS[id].items];
  S.feats = new Set<number>((d.feats as number[]) || [0, 1, 2, 3, 4, 6, 7]);
  S.plek = (d.plek as string) || 'pols';
  S.recs = (d.recs as Recording[]) || [];
  S.k = (d.k as number) || 5;
  S.dur = (d.dur as number) || 10;
  S.scX = (d.scX as number) ?? 0;
  S.scY = (d.scY as number) ?? 2;
  S.recAnimal = S.animals[0] ?? '';
  S.simAnimal = S.animals[0] ?? '';
}

function save() {
  try {
    localStorage.setItem('bi-global', JSON.stringify({ person: S.person, src: S.src, set: S.set }));
    if (!S.set) return;
    localStorage.setItem(
      `bi-${S.set}`,
      JSON.stringify({ tab: S.tab, animals: S.animals, feats: [...S.feats], plek: S.plek, recs: S.recs, k: S.k, dur: S.dur, scX: S.scX, scY: S.scY }),
    );
  } catch {
    S.status = 'let op: opslag vol, download je dataset';
  }
}

/** Alle voorbeelden (vensters met kenmerken) uit alle opnames. Gecachet per opname. */
const featCache = new Map<string, number[][]>();
function examples(): Example[] {
  const out: Example[] = [];
  for (const r of S.recs) {
    if (!S.animals.includes(r.animal)) continue;
    let fs = featCache.get(r.id);
    if (!fs) {
      fs = windows(r.acc, r.gyr, r.hz, WIN, HOP).map((w) => features(w.acc, w.gyr, r.hz));
      featCache.set(r.id, fs);
    }
    for (const f of fs) out.push({ rec: r.id, animal: r.animal, person: r.person || 'onbekend', f });
  }
  return out;
}
const dataKey = () => `${S.recs.map((r) => r.id + r.animal + r.person).join()}|${[...S.feats].join()}|${S.k}|${S.animals.join()}`;
const color = (a: string) => PALET[Math.max(0, S.animals.indexOf(a)) % PALET.length];

// ------------------------------------------------------------------ live signaal

const live = { acc: [] as number[], gyr: [] as number[], hz: 50, hasGyr: false, last: 0 };

function push(a: number[], g: number[] | null, hz: number) {
  live.hz = hz;
  live.acc.push(a[0], a[1], a[2]);
  live.gyr.push(...(g ?? [0, 0, 0]));
  if (g) live.hasGyr = true;
  live.last = performance.now();
  const max = Math.round(hz * 12) * 3;
  if (live.acc.length > max + 300) {
    live.acc.splice(0, live.acc.length - max);
    live.gyr.splice(0, live.gyr.length - max);
  }
  if (S.rec?.phase === 'opnemen') {
    S.rec.acc.push(a[0], a[1], a[2]);
    S.rec.gyr.push(...(g ?? [0, 0, 0]));
    S.rec.hz = hz;
  }
}

function resetLive() {
  live.acc = [];
  live.gyr = [];
  live.hasGyr = false;
}

// simulatie: 50 Hz, in pakketjes van 100 ms (zoals de M5Stick)
let simT = 0;
setInterval(() => {
  if (S.src !== 'sim') return;
  const style = SIM_PERSONEN[S.simPerson] ?? SIM_PERSONEN['sim-Anouk'];
  const doing = S.rec ? S.rec.animal : S.simAnimal;
  for (let i = 0; i < 5; i++) {
    simT += 0.02;
    const s = simSample(doing, simT, style);
    push(s.a, s.g, 50);
  }
}, 100);

// M5Stick (of iets anders dat ruwe data stuurt) via het MQTT-kanaal van het Lummellab
let mqttClient: { end: () => void } | null = null;
async function joinKanaal(code: string) {
  mqttClient?.end();
  mqttClient = null;
  S.devices.clear();
  S.device = null;
  if (!code) return;
  localStorage.setItem('sk-kanaal', code);
  S.status = 'verbinden…';
  render();
  const mqtt = (await import('mqtt')).default;
  const client = mqtt.connect(MQTT_URL, { clientId: `dn-${uid()}`, reconnectPeriod: 3000 });
  mqttClient = client;
  client.on('connect', () => {
    S.status = `kanaal ${code}: wacht op sensor…`;
    client.subscribe(`${TOPIC_ROOT}/${code}/lijf/+`);
    render();
  });
  client.on('error', (e: Error) => {
    S.status = `fout: ${e.message}`;
    render();
  });
  client.on('message', (topic: string, msg: Uint8Array) => {
    try {
      const d = JSON.parse(new TextDecoder().decode(msg)) as { name?: string; raw?: number[]; g?: number[]; hz?: number };
      if (!d.raw?.length) return; // alleen apparaten met ruwe versnelling (M5Stick)
      const id = topic.split('/').pop()!;
      const known = S.devices.has(id);
      S.devices.set(id, { name: d.name || id, last: performance.now() });
      if (!S.device) S.device = id;
      if (!known) {
        S.status = `kanaal ${code}`;
        render();
      }
      if (S.src !== 'm5' || id !== S.device) return;
      const hz = d.hz || 50;
      const n = Math.floor(d.raw.length / 3);
      for (let i = 0; i < n; i++) {
        const g = d.g && d.g.length >= (i + 1) * 3 ? d.g.slice(i * 3, i * 3 + 3) : null;
        push(d.raw.slice(i * 3, i * 3 + 3), g, hz);
      }
    } catch {
      /* onleesbaar bericht negeren */
    }
  });
}

// bewegingssensor van dit apparaat (telefoon; vraagt om https)
let phoneHz = 60, phoneLast = 0;
async function enablePhone() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const DME = (window as any).DeviceMotionEvent;
  if (!DME) {
    S.status = 'dit apparaat heeft geen bewegingssensor';
    return render();
  }
  if (DME.requestPermission) {
    const r = await DME.requestPermission();
    if (r !== 'granted') {
      S.status = 'geen toestemming voor beweging';
      return render();
    }
  }
  if (!S.phoneOn) {
    window.addEventListener('devicemotion', (e: DeviceMotionEvent) => {
      if (S.src !== 'telefoon') return;
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null) return;
      const now = performance.now();
      if (phoneLast) phoneHz += (1000 / Math.max(5, now - phoneLast) - phoneHz) * 0.05;
      phoneLast = now;
      const r = e.rotationRate;
      const g = r && r.alpha !== null ? [r.beta ?? 0, r.gamma ?? 0, r.alpha ?? 0] : null;
      push([(a.x ?? 0) * 102, (a.y ?? 0) * 102, (a.z ?? 0) * 102], g, Math.round(phoneHz));
    });
  }
  S.phoneOn = true;
  S.status = 'bewegingssensor aan';
  render();
}

// ------------------------------------------------------------------ opnemen

function startRec(animal: string) {
  if (S.rec) return;
  S.rec = { animal, phase: 'aftellen', t0: performance.now(), acc: [], gyr: [], hz: live.hz };
  render();
}

function tickRec() {
  const r = S.rec;
  if (!r) return;
  const el = (performance.now() - r.t0) / 1000;
  if (r.phase === 'aftellen' && el >= 3) {
    r.phase = 'opnemen';
    r.t0 = performance.now();
    render();
  } else if (r.phase === 'opnemen' && el >= S.dur) {
    finishRec();
  }
}

function finishRec() {
  const r = S.rec!;
  S.rec = null;
  if (r.acc.length / 3 < r.hz * WIN) {
    S.status = 'opname te kort of geen signaal';
    return render();
  }
  const person = S.src === 'sim' ? S.simPerson : S.person.trim() || 'onbekend';
  const id = uid();
  S.recs.push({ id, animal: r.animal, person, src: S.src, plek: S.plek, hz: r.hz, acc: r.acc.map(Math.round), gyr: live.hasGyr ? r.gyr.map(Math.round) : null, at: Date.now() });
  S.lastRec = id;
  save();
  render();
}

/** Demo-dataset: drie gesimuleerde deelnemers doen elke categorie 12 seconden. */
function demoData() {
  for (const [person, style] of Object.entries(SIM_PERSONEN)) {
    for (const animal of S.animals) {
      const acc: number[] = [], gyr: number[] = [];
      const t0 = Math.random() * 100;
      for (let i = 0; i < 12 * 50; i++) {
        const s = simSample(animal, t0 + i / 50, style);
        acc.push(...s.a);
        gyr.push(...s.g);
      }
      S.recs.push({ id: uid(), animal, person, src: 'sim', plek: 'pols', hz: 50, acc, gyr, at: Date.now() });
    }
  }
  save();
  render();
}

function download() {
  const blob = new Blob([JSON.stringify({ tuhtf: 'bi-lab', versie: 2, set: S.set, animals: S.animals, recs: S.recs })], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `bi-${S.set}-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importFiles(files: FileList) {
  let n = 0;
  for (const f of Array.from(files)) {
    try {
      const d = JSON.parse(await f.text()) as { animals?: string[]; recs?: Recording[] };
      for (const a of d.animals ?? []) if (!S.animals.includes(a)) S.animals.push(a);
      for (const r of d.recs ?? []) {
        if (S.recs.some((x) => x.id === r.id)) continue;
        S.recs.push(r);
        n++;
      }
    } catch {
      S.status = `kon ${f.name} niet lezen`;
    }
  }
  S.status = `${n} opnames toegevoegd`;
  save();
  render();
}

// ------------------------------------------------------------------ tekenen

const app = document.getElementById('app')!;
const C = () => SETS[S.set ?? 'dieren'];

function header() {
  const srcBtn = (s: Src, label: string) => `<button class="btn ${S.src === s ? 'on' : ''}" data-src="${s}">${label}</button>`;
  return `
  <header>
    <a class="home" href="/">← TUHTF</a>
    <h1><button class="h1-link" data-home="1">B.I. lab</button><span class="muted"> · ${esc(C().naam)}</span></h1>
    <div class="src">
      ${srcBtn('m5', 'M5Stick')}${srcBtn('telefoon', 'deze telefoon')}${srcBtn('sim', 'simulatie')}
      <span class="live"><span class="dot" id="dot"></span><canvas id="trace" width="440" height="80"></canvas></span>
    </div>
  </header>
  <div class="row small muted" style="justify-content:flex-end;margin-top:8px">${srcDetail()}</div>`;
}

function srcDetail() {
  if (S.src === 'sim') {
    return `gesimuleerde deelnemer <select data-k="simPerson">${Object.keys(SIM_PERSONEN).map((p) => `<option ${p === S.simPerson ? 'selected' : ''}>${p}</option>`).join('')}</select>`;
  }
  if (S.src === 'telefoon') {
    return S.phoneOn ? `${esc(S.status)} · ±${Math.round(phoneHz)} Hz` : `<button class="btn" data-act="phone">bewegingssensor aanzetten</button> <span>werkt alleen via https</span>`;
  }
  const devs = [...S.devices.entries()];
  return `kanaal <input type="text" data-k="kanaal" value="${esc(S.kanaal)}" placeholder="code" size="8"> <button class="btn" data-act="join">verbind</button>
    ${devs.length ? `<select data-k="device">${devs.map(([id, d]) => `<option value="${esc(id)}" ${id === S.device ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select>` : ''}
    <span>${esc(S.status)}</span>`;
}

function nav() {
  return `<nav>${TABS.map((t) => `<button data-tab="${t.id}" class="${S.tab === t.id ? 'on' : ''}"><span class="n">${t.n}</span>${t.t}</button>`).join('')}</nav>`;
}

function viewModel() {
  return `
  <h2>${esc(C().titelModel)}</h2>
  <p class="lede">Een model ziet geen ${esc(C().ev)}. Het ziet alleen getallen uit een sensor. Spreek eerst samen af <b>welke ${esc(C().mv)}</b> je gaat doen, <b>waar</b> de sensor zit, en <b>welke kenmerken</b> ${esc(C().a)} van ${esc(C().b)} onderscheiden. <span class="q">Wat zou jij meten als je alleen de sensor had?</span></p>
  ${C().let ? `<div class="note warn" style="margin-bottom:18px">${esc(C().let!)}</div>` : ''}
  <div class="cols">
    <div class="stack">
      <div class="card stack">
        <h3>${esc(C().mv)}</h3>
        <div class="row">${S.animals.map((a) => `<span class="animal" style="box-shadow:inset 0 0 0 1.5px ${color(a)}"><span class="e">${emoji(a)}</span>${esc(a)}<button class="btn" style="padding:0 6px;background:none;box-shadow:none" data-del-animal="${esc(a)}" title="weghalen">✕</button></span>`).join('')}</div>
        <div class="row"><input type="text" id="new-animal" placeholder="nog een ${esc(C().ev)}…"> <button class="btn" data-act="add-animal">voeg toe</button></div>
      </div>
      <div class="card stack">
        <h3>Waar zit de sensor?</h3>
        <div class="row">${PLEKKEN.map((p) => `<button class="btn ${S.plek === p ? 'on' : ''}" data-plek="${p}">${p}</button>`).join('')}</div>
        <div class="small muted">Spreek één plek af voor de hele groep. Wat zie je vanaf de pols, wat vanaf de enkel of de borst? Een klap zit in de arm, maar een slang misschien in de rug. De simulatie doet alsof de sensor om de pols zit.</div>
      </div>
    </div>
    <div class="card stack">
      <h3>Kenmerken (per venster van ${WIN} seconden)</h3>
      ${FEATS.map((f, i) => `<label class="feat ${S.feats.has(i) ? 'on' : ''}"><input type="checkbox" data-feat="${i}" ${S.feats.has(i) ? 'checked' : ''}><span><b>${f.naam}</b> <span class="mono small muted">${f.eenheid}</span><br><span class="small muted">${f.uitleg}</span></span></label>`).join('')}
    </div>
  </div>`;
}

/** Na een opname: hoe voelde het? Data die geen sensor meet. */
function gevoelVraag() {
  const r = S.recs.find((x) => x.id === S.lastRec);
  if (!r) return '';
  return `<div class="card stack" style="background:rgba(0,0,0,.18)">
    <h3>Net opgenomen: ${emoji(r.animal)} ${esc(r.animal)} · hoe voelde het?</h3>
    <input type="text" data-gevoel="${r.id}" value="${esc(r.gevoel ?? '')}" placeholder="één woord, of een zin" maxlength="80">
    <label class="row small">gespeeld <input type="range" min="0" max="100" value="${r.echt ?? 50}" data-echt="${r.id}" style="flex:1"> echt</label>
  </div>`;
}

function viewVerzamelen() {
  const r = S.rec;
  const counts = Object.fromEntries(S.animals.map((a) => [a, S.recs.filter((x) => x.animal === a).length]));
  const person = S.src === 'sim' ? `<span class="muted">de opname komt op naam van <b>${S.simPerson}</b></span>` : `<label>wie doet het? <input type="text" data-k="person" value="${esc(S.person)}" placeholder="naam of code" size="12"></label>`;
  return `
  <h2>${esc(C().doe)}</h2>
  <p class="lede">Kies een ${esc(C().ev)}, druk op opnemen en beweeg ${S.dur} seconden. Neem ${esc(C().elk)} een paar keer op, en laat zoveel mogelijk verschillende mensen meedoen. Schrijf na elke opname op hoe het voelde: dat is ook data. <span class="q">Hoe meer verschillende lichamen, hoe minder het model één lichaam als maat neemt.</span></p>
  ${C().let ? `<div class="note warn" style="margin-bottom:18px">${esc(C().let!)}</div>` : ''}
  <div class="cols">
    <div class="card stack" style="min-height:360px">
      ${
        r
          ? `<div class="muted mono small" style="text-align:center">${r.phase === 'aftellen' ? 'klaar voor…' : 'opnemen'} · ${emoji(r.animal)} ${esc(r.animal)}</div>
             <div class="count" id="rec-count">3</div>
             <div class="bar"><i id="rec-bar" style="width:0%"></i></div>
             <div class="row" style="justify-content:center"><button class="btn" data-act="stop">stop</button></div>`
          : `<div class="row">${S.animals.map((a) => `<button class="animal ${S.recAnimal === a ? 'on' : ''}" data-rec-animal="${esc(a)}"><span class="e">${emoji(a)}</span>${esc(a)} <span class="mono small" style="opacity:.6">${counts[a]}</span></button>`).join('')}</div>
             <div class="row">${person}</div>
             <div class="row"><label class="small">duur <select data-k="dur">${[5, 10, 15, 20, 30].map((d) => `<option value="${d}" ${d === S.dur ? 'selected' : ''}>${d} s</option>`).join('')}</select></label> <span class="small muted">sensor: ${S.plek}</span></div>
             <div><button class="btn acc big" data-act="rec" ${S.animals.length ? '' : 'disabled'}>● neem ${emoji(S.recAnimal)} ${esc(S.recAnimal)} op</button></div>
             ${!live.acc.length ? `<div class="warn small">nog geen signaal van de sensor</div>` : ''}
             ${gevoelVraag()}`
      }
    </div>
    <div class="card stack">
      <h3>Verzameld</h3>
      <div class="big-pct">${S.recs.length}</div>
      <div class="muted small">opnames · ${examples().length} vensters van ${WIN} s · ${new Set(S.recs.map((x) => x.person)).size} personen</div>
      ${S.animals.map((a) => `<div class="row small"><span style="width:110px">${emoji(a)} ${esc(a)}</span><div class="bar" style="flex:1"><i style="width:${Math.min(100, counts[a] * 12.5)}%;background:${color(a)}"></i></div><span class="mono">${counts[a]}</span></div>`).join('')}
      ${S.src === 'sim' && S.animals.length ? `<div class="note small">Geen sensors bij de hand? <button class="btn" data-act="demo">maak een demo-dataset</button> Drie gesimuleerde deelnemers doen ${esc(C().elk)} 12 seconden.</div>` : ''}
    </div>
  </div>`;
}

function spark(r: Recording, w = 160, h = 34) {
  const n = Math.floor(r.acc.length / 3);
  const step = Math.max(1, Math.floor(n / 120));
  const pts: string[] = [];
  for (let i = 0, j = 0; i < n; i += step, j++) {
    const m = Math.hypot(r.acc[i * 3], r.acc[i * 3 + 1], r.acc[i * 3 + 2]);
    const y = h / 2 - ((m - 1000) / 3000) * h;
    pts.push(`${((i / n) * w).toFixed(1)},${Math.max(1, Math.min(h - 1, y)).toFixed(1)}`);
  }
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="${color(r.animal)}" stroke-width="1.3"/></svg>`;
}

function viewLabelen() {
  const recs = [...S.recs].reverse();
  return `
  <h2>Klopt het label?</h2>
  <p class="lede">Een model leert precies wat jij het voorzegt, ook je fouten. Kijk elke opname na. Heeft iemand per ongeluk de verkeerde knop ingedrukt? Stond de sensor nog uit? Een vlak lijntje is geen ${esc(C().ev)}. En past het label bij wat iemand voelde? <span class="q">Wie bepaalt wat een goede ${esc(C().a)} is?</span></p>
  <div class="row" style="margin-bottom:14px">
    <button class="btn" data-act="download" ${S.recs.length ? '' : 'disabled'}>↓ download dataset</button>
    <label class="btn">↑ voeg dataset toe <input type="file" accept=".json,application/json" multiple data-act="import" hidden></label>
    <span class="small muted">Elk groepje neemt op, downloadt, en voegt de bestanden samen tot één klasdataset.</span>
    ${S.recs.length ? `<button class="btn" data-act="clear" style="margin-left:auto">alles wissen</button>` : ''}
  </div>
  ${
    recs.length
      ? `<div class="card" style="overflow-x:auto"><table>
    <tr><th>beweging</th><th>label</th><th>wie</th><th>gevoel</th><th>sensor</th><th class="num">duur</th><th></th></tr>
    ${recs
      .map(
        (r) => `<tr>
      <td>${spark(r)}</td>
      <td><select data-relabel="${r.id}">${[...new Set([...S.animals, r.animal])].map((a) => `<option value="${esc(a)}" ${a === r.animal ? 'selected' : ''}>${emoji(a)} ${esc(a)}</option>`).join('')}</select></td>
      <td>${esc(r.person)}</td>
      <td class="small">${r.gevoel ? esc(r.gevoel) : '<span class="muted">–</span>'}${r.echt !== undefined ? ` <span class="mono muted">${r.echt}% echt</span>` : ''}</td>
      <td class="small muted">${r.src === 'm5' ? 'M5Stick' : r.src}${r.plek ? ` · ${esc(r.plek)}` : ''}</td>
      <td class="num">${fmt(r.acc.length / 3 / r.hz)} s</td>
      <td><button class="btn" data-del="${r.id}" title="weggooien">✕</button></td></tr>`,
      )
      .join('')}
  </table></div>`
      : `<div class="card muted">Nog geen opnames. Ga naar <b>verzamelen</b>.</div>`
  }`;
}

function viewOrdenen() {
  const ex = examples();
  const W = 640, H = 420, P = 46;
  const xs = ex.map((e) => e.f[S.scX]), ys = ex.map((e) => e.f[S.scY]);
  const [x0, x1] = [Math.min(...xs, 0), Math.max(...xs, 1)], [y0, y1] = [Math.min(...ys, 0), Math.max(...ys, 1)];
  const sx = (v: number) => P + ((v - x0) / (x1 - x0 || 1)) * (W - P * 1.5);
  const sy = (v: number) => H - P - ((v - y0) / (y1 - y0 || 1)) * (H - P * 1.6);
  const opt = (sel: number) => FEATS.map((f, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${f.naam}</option>`).join('');
  const means = S.animals.map((a) => {
    const e = ex.filter((x) => x.animal === a);
    return { a, n: e.length, m: FEATS.map((_, i) => (e.length ? e.reduce((s, x) => s + x.f[i], 0) / e.length : NaN)) };
  });
  return `
  <h2>Waar liggen de ${esc(C().mv)}?</h2>
  <p class="lede">Elk puntje is twee seconden beweging. Kies twee kenmerken en kijk of de ${esc(C().mv)} uit elkaar liggen. Liggen ze door elkaar, dan kan het model ze ook niet goed scheiden. <span class="q">Welk kenmerk vertelt het meest?</span></p>
  <div class="cols">
    <div class="card">
      <div class="row small" style="margin-bottom:8px">→ <select data-k="scX">${opt(S.scX)}</select> ↑ <select data-k="scY">${opt(S.scY)}</select></div>
      ${
        ex.length
          ? `<svg viewBox="0 0 ${W} ${H}" width="100%" style="display:block">
        <line x1="${P}" y1="${H - P}" x2="${W - P / 2}" y2="${H - P}" stroke="var(--line)"/><line x1="${P}" y1="${P * 0.6}" x2="${P}" y2="${H - P}" stroke="var(--line)"/>
        <text x="${P}" y="${H - P + 18}" font-size="11" fill="var(--ink-3)">${fmt(x0, 1)}</text><text x="${W - P / 2}" y="${H - P + 18}" font-size="11" fill="var(--ink-3)" text-anchor="end">${fmt(x1, 1)} ${FEATS[S.scX].eenheid}</text>
        <text x="${P - 6}" y="${H - P}" font-size="11" fill="var(--ink-3)" text-anchor="end">${fmt(y0, 1)}</text><text x="${P - 6}" y="${P * 0.6 + 8}" font-size="11" fill="var(--ink-3)" text-anchor="end">${fmt(y1, 1)}</text>
        ${ex.map((e) => `<circle cx="${sx(e.f[S.scX]).toFixed(1)}" cy="${sy(e.f[S.scY]).toFixed(1)}" r="4.5" fill="${color(e.animal)}" opacity=".8"><title>${esc(e.animal)} · ${esc(e.person)}</title></circle>`).join('')}
      </svg>
      <div class="row small">${S.animals.map((a) => `<span><span class="dot" style="background:${color(a)}"></span> ${emoji(a)} ${esc(a)}</span>`).join('')}</div>`
          : `<div class="muted">Nog geen data.</div>`
      }
    </div>
    <div class="card" style="overflow-x:auto">
      <h3>Gemiddeld per ${esc(C().ev)}</h3>
      <table><tr><th></th>${means.map((m) => `<th title="${esc(m.a)}">${emoji(m.a)}</th>`).join('')}</tr>
      ${FEATS.map((f, i) => `<tr><td class="small ${S.feats.has(i) ? '' : 'muted'}">${f.naam}</td>${means.map((m) => `<td class="num small">${fmt(m.m[i], f.eenheid === '0–1' || f.eenheid === 'Hz' ? 2 : 0)}</td>`).join('')}</tr>`).join('')}
      </table>
      <div class="small muted" style="margin-top:10px">Grijze kenmerken staan uit in het datamodel.</div>
    </div>
  </div>`;
}

function viewTrainen() {
  const ex = examples();
  const ev = S.evalRes;
  const stale = S.model && S.modelKey !== dataKey();
  const persons = new Set(ex.map((e) => e.person)).size;
  return `
  <h2>Train het model</h2>
  <p class="lede">Ons model is eenvoudig en doorzichtig: het onthoudt alle voorbeelden. Bij een nieuwe beweging zoekt het de <b>${S.k}</b> voorbeelden die er het meest op lijken, en die stemmen. <span class="q">Raadt het ook goed bij iemand die het nog nooit zag?</span></p>
  <div class="cols">
    <div class="card stack">
      <div class="row"><span class="small">kenmerken:</span> ${[...S.feats].map((i) => `<span class="mono small" style="padding:2px 8px;border-radius:99px;box-shadow:inset 0 0 0 1px var(--line)">${FEATS[i].naam}</span>`).join('')} <button class="btn small" data-tab="model">aanpassen</button></div>
      <label class="row small">buren (k) <input type="range" min="1" max="15" value="${S.k}" data-k="k"> <span class="mono">${S.k}</span></label>
      <div><button class="btn acc big" data-act="train" ${ex.length >= 4 && S.feats.size ? '' : 'disabled'}>train en toets</button> ${stale ? `<span class="warn small">data of instellingen veranderd: train opnieuw</span>` : ''}</div>
      ${ex.length < 4 ? `<div class="muted small">Eerst meer data verzamelen.</div>` : ''}
      ${
        ev
          ? `<div class="row" style="align-items:flex-end;gap:18px"><div class="big-pct">${Math.round(ev.acc * 100)}%</div><div class="small muted" style="padding-bottom:12px">goed geraden van ${ev.tot} vensters<br>${ev.method === 'persoon' ? 'telkens getoetst op één persoon die het model níet kende' : 'telkens getoetst op één opname die het model níet kende (meer personen = eerlijker toets)'}<br>gokken zou ${Math.round(100 / Math.max(1, S.animals.length))}% halen</div></div>
          <div class="note small">${ev.method === 'persoon' ? `Dit is de eerlijke vraag: kan het model ${esc(C().a)} herkennen bij iemand die het nooit zag? Elk lichaam doet het anders.` : `Er is maar ${persons} persoon. Het model toetst dan op een andere opname van dezelfde persoon. Dat is makkelijker dan het lijkt.`}</div>`
          : ''
      }
    </div>
    <div class="card" style="overflow-x:auto">
      <h3>Wat werd waarvoor aangezien?</h3>
      ${
        ev
          ? `<table class="conf"><tr><th style="text-align:left">echt ↓ · geraden →</th>${S.animals.map((a) => `<th style="text-align:center">${emoji(a)}</th>`).join('')}</tr>
        ${S.animals.map((a) => `<tr><td style="text-align:left">${emoji(a)} ${esc(a)}</td>${S.animals.map((b) => `<td class="${a === b ? 'diag' : ''}">${ev.conf[a]?.[b] ?? 0}</td>`).join('')}</tr>`).join('')}</table>
        ${ev.method === 'persoon' ? `<h3 style="margin-top:18px">Per persoon</h3>${ev.perGroup.map((g) => `<div class="row small"><span style="width:120px">${esc(g.g)}</span><div class="bar" style="flex:1"><i style="width:${(g.good / g.tot) * 100}%"></i></div><span class="mono">${Math.round((g.good / g.tot) * 100)}%</span></div>`).join('')}` : ''}`
          : `<div class="muted small">Na het trainen zie je hier welke ${esc(C().mv)} door elkaar gehaald worden. ${esc(C().b)} die voor ${esc(C().a)} wordt aangezien: wat zegt dat over de kenmerken?</div>`
      }
    </div>
  </div>`;
}

function viewRaden() {
  if (!S.model) {
    return `<h2>${esc(C().raad)}</h2><div class="card muted">Train eerst een model in stap 5.</div>`;
  }
  return `
  <h2>${esc(C().raad)}</h2>
  <p class="lede">Beweeg, en het model raadt. Probeer het daarna te foppen: kun je ${esc(C().b)} doen die het model voor ${esc(C().a)} houdt? Of iets wat het niet kent? <span class="q">Wat heeft het model eigenlijk geleerd, en wat niet?</span></p>
  ${S.src === 'sim' ? `<div class="row small" style="margin-bottom:14px">de simulatie doet nu: ${S.animals.map((a) => `<button class="animal ${S.simAnimal === a ? 'on' : ''}" data-sim-animal="${esc(a)}" style="padding:6px 12px 6px 8px;font-size:14px"><span class="e" style="font-size:20px">${emoji(a)}</span>${esc(a)}</button>`).join('')} <button class="btn" data-act="new-sim">nieuwe onbekende deelnemer</button></div>` : ''}
  <div class="cols">
    <div class="card guess" id="guess"><div class="e">…</div><div class="n muted">beweeg maar</div></div>
    <div class="card stack">
      <h3>Zekerheid</h3>
      <div id="scores" class="stack"></div>
      <h3 style="margin-top:8px">Lijkt het meest op</h3>
      <div id="near" class="small muted"></div>
    </div>
  </div>`;
}

function viewHome() {
  const card = (id: SetId) => {
    const st = SETS[id];
    const n = (read(`bi-${id}`).recs as unknown[] | undefined)?.length ?? 0;
    return `<button class="set-card" data-set="${id}">
      <span class="row" style="gap:6px;font-size:30px">${(st.items.length ? st.items : ['✳️']).map((a) => (a === '✳️' ? a : emoji(a))).join('')}</span>
      <span class="t">${esc(st.naam)}</span>
      <span class="q">${esc(st.vraag)}</span>
      <span class="small" style="color:var(--ink-2)">${esc(st.uitleg)}</span>
      <span class="mono small muted" style="margin-top:auto">${n ? `${n} opnames` : 'nog leeg'} →</span>
    </button>`;
  };
  const groepen = [...new Set(Object.values(SETS).map((s) => s.groep))];
  return `<div class="wrap">
  <header><a class="home" href="/">← TUHTF</a><h1>B.I. lab</h1></header>
  <p class="lede" style="margin-top:22px;font-size:22px">Als er A.I. is, waarom dan geen B.I., een <b>Body Intelligence</b>? Dit lab volgt hoe A.I. getraind wordt, met lichamen in plaats van tekst. Niet om een machine te leren voelen, maar om te zien wat er onderweg verloren gaat. <span class="q">Waar werkt die logica voor een lichaam, en waar juist niet?</span></p>
  ${groepen
    .map(
      (g) => `<h3 style="margin-top:34px">${esc(g)}</h3><div class="grid">${(Object.keys(SETS) as SetId[])
        .filter((id) => SETS[id].groep === g)
        .map(card)
        .join('')}</div>`,
    )
    .join('')}
  <h3 style="margin-top:34px">In ontwikkeling · voorstellen om te bespreken</h3>
  <div class="grid">${VOORSTELLEN.map((v) => `<div class="set-card voorstel"><span class="tag">voorstel</span><span class="t">${esc(v.naam)}</span><span class="q">${esc(v.vraag)}</span><span class="small" style="color:var(--ink-2)">${esc(v.uitleg)}</span></div>`).join('')}</div>
  <p class="small muted" style="margin-top:34px">Bronnen: een M5Stick op het kanaal van het Lummellab, de bewegingssensor van een telefoon, of een simulatie. Opnames blijven in deze browser tot je ze downloadt of wist.</p>
  </div>`;
}

function render() {
  if (!S.set) {
    app.innerHTML = viewHome();
    return;
  }
  const views: Record<Tab, () => string> = { model: viewModel, verzamelen: viewVerzamelen, labelen: viewLabelen, ordenen: viewOrdenen, trainen: viewTrainen, raden: viewRaden };
  app.innerHTML = `<div class="wrap">${header()}${nav()}<main>${views[S.tab]()}</main></div>`;
}

// ------------------------------------------------------------------ interactie

app.addEventListener('click', (e) => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button, [data-plek]');
  if (!t) return;
  const d = t.dataset;
  if (d.set) {
    openSet(d.set as SetId);
    resetLive();
  } else if (d.home) {
    save();
    openSet(null);
  } else if (d.tab) S.tab = d.tab as Tab;
  else if (d.src) {
    S.src = d.src as Src;
    resetLive();
    if (S.src === 'm5' && S.kanaal && !mqttClient) void joinKanaal(S.kanaal);
  } else if (d.plek) S.plek = d.plek;
  else if (d.recAnimal) S.recAnimal = d.recAnimal;
  else if (d.simAnimal) S.simAnimal = d.simAnimal;
  else if (d.delAnimal) S.animals = S.animals.filter((a) => a !== d.delAnimal);
  else if (d.del) {
    S.recs = S.recs.filter((r) => r.id !== d.del);
    featCache.delete(d.del);
  } else if (d.act) {
    switch (d.act) {
      case 'rec':
        return startRec(S.recAnimal);
      case 'stop':
        S.rec = null;
        break;
      case 'demo':
        return demoData();
      case 'phone':
        return void enablePhone();
      case 'join':
        return void joinKanaal(S.kanaal.trim());
      case 'download':
        return download();
      case 'clear':
        if (!confirm('Alle opnames wissen? Download eerst je dataset als je die wilt bewaren.')) return;
        S.recs = [];
        featCache.clear();
        S.model = null;
        S.evalRes = null;
        break;
      case 'add-animal': {
        const inp = document.getElementById('new-animal') as HTMLInputElement;
        const a = inp.value.trim().toLowerCase();
        if (a && !S.animals.includes(a)) S.animals.push(a);
        break;
      }
      case 'train': {
        const ex = examples();
        const idx = [...S.feats].sort((a, b) => a - b);
        S.evalRes = evaluate(ex, idx, S.k, S.animals);
        S.model = train(ex, idx, S.k, S.animals);
        S.modelKey = dataKey();
        break;
      }
      case 'new-sim': {
        SIM_PERSONEN['sim-nieuw'] = randomStyle();
        S.simPerson = 'sim-nieuw';
        break;
      }
    }
  }
  if (!S.animals.includes(S.recAnimal)) S.recAnimal = S.animals[0] ?? '';
  save();
  render();
});

app.addEventListener('change', (e) => {
  const t = e.target as HTMLInputElement;
  const d = t.dataset;
  if (d.feat !== undefined) {
    const i = Number(d.feat);
    if (t.checked) S.feats.add(i);
    else S.feats.delete(i);
  } else if (d.gevoel || d.echt) {
    const r = S.recs.find((x) => x.id === (d.gevoel || d.echt));
    if (r && d.gevoel) r.gevoel = t.value.trim();
    if (r && d.echt) r.echt = Number(t.value);
    save();
    return; // niet opnieuw tekenen: je bent misschien nog aan het typen
  } else if (d.relabel) {
    const r = S.recs.find((x) => x.id === d.relabel);
    if (r) r.animal = t.value;
  } else if (d.act === 'import' && t.files) {
    return void importFiles(t.files);
  } else if (d.k) {
    const k = d.k;
    if (k === 'kanaal') S.kanaal = t.value;
    else if (k === 'device') {
      S.device = t.value;
      resetLive();
    } else if (k === 'person') S.person = t.value;
    else if (k === 'simPerson') S.simPerson = t.value;
    else if (k === 'dur') S.dur = Number(t.value);
    else if (k === 'scX') S.scX = Number(t.value);
    else if (k === 'scY') S.scY = Number(t.value);
    else if (k === 'k') S.k = Number(t.value);
  } else return;
  save();
  render();
});

app.addEventListener('keydown', (e) => {
  const t = e.target as HTMLInputElement;
  if (e.key !== 'Enter') return;
  if (t.id === 'new-animal') (app.querySelector('[data-act="add-animal"]') as HTMLElement)?.click();
  if (t.dataset.k === 'kanaal') {
    S.kanaal = t.value;
    void joinKanaal(S.kanaal.trim());
  }
});

// ------------------------------------------------------------------ live lus

function drawTrace() {
  const c = document.getElementById('trace') as HTMLCanvasElement | null;
  const dot = document.getElementById('dot');
  const on = performance.now() - live.last < 1000;
  dot?.classList.toggle('on', on);
  if (!c) return;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, c.width, c.height);
  const n = Math.floor(live.acc.length / 3);
  const show = Math.min(n, Math.round(live.hz * 5));
  if (show < 2) return;
  const line = (val: (i: number) => number, scale: number, col: string) => {
    g.beginPath();
    for (let k = 0; k < show; k++) {
      const i = n - show + k;
      const y = c.height / 2 - val(i) * scale;
      const x = (k / (show - 1)) * c.width;
      if (k) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.strokeStyle = col;
    g.lineWidth = 2;
    g.stroke();
  };
  if (live.hasGyr) line((i) => Math.hypot(live.gyr[i * 3], live.gyr[i * 3 + 1], live.gyr[i * 3 + 2]) / 300 - 0.4, c.height / 3, 'rgba(147,213,249,.7)');
  line((i) => (Math.hypot(live.acc[i * 3], live.acc[i * 3 + 1], live.acc[i * 3 + 2]) - 1000) / 2500, c.height / 2, '#d9ff6b');
}

function updateRec() {
  const r = S.rec;
  if (!r) return;
  const el = (performance.now() - r.t0) / 1000;
  const cnt = document.getElementById('rec-count');
  const bar = document.getElementById('rec-bar');
  if (cnt) cnt.textContent = r.phase === 'aftellen' ? String(Math.max(1, Math.ceil(3 - el))) : emoji(r.animal) + ' ' + Math.max(0, Math.ceil(S.dur - el));
  if (bar) bar.style.width = r.phase === 'opnemen' ? `${Math.min(100, (el / S.dur) * 100)}%` : '0%';
}

let lastGuess = 0;
function updateGuess() {
  if (S.tab !== 'raden' || !S.model) return;
  const now = performance.now();
  if (now - lastGuess < 400) return;
  lastGuess = now;
  const el = document.getElementById('guess');
  if (!el) return;
  const w = Math.round(live.hz * WIN);
  const n = Math.floor(live.acc.length / 3);
  if (n < w || now - live.last > 1500) {
    el.innerHTML = `<div class="e">…</div><div class="n muted">geen beweging binnen</div>`;
    return;
  }
  const f = features(live.acc.slice((n - w) * 3), live.hasGyr ? live.gyr.slice((n - w) * 3) : null, live.hz);
  const g = predict(S.model, f);
  const unsure = g.conf < 0.5;
  el.innerHTML = `<div class="e">${unsure ? '🤔' : emoji(g.best)}</div><div class="n">${unsure ? `misschien ${esc(g.best)}?` : esc(g.best)}</div><div class="mono small muted">${Math.round(g.conf * 100)}% zeker</div>`;
  const sc = document.getElementById('scores');
  if (sc) sc.innerHTML = S.model.animals.map((a) => `<div class="row small"><span style="width:110px">${emoji(a)} ${esc(a)}</span><div class="bar" style="flex:1"><i style="width:${(g.scores[a] ?? 0) * 100}%;background:${color(a)}"></i></div><span class="mono" style="width:40px;text-align:right">${Math.round((g.scores[a] ?? 0) * 100)}%</span></div>`).join('');
  const nr = document.getElementById('near');
  if (nr) nr.innerHTML = g.near.slice(0, 5).map((x) => `${emoji(x.ex.animal)} ${esc(x.ex.animal)} van ${esc(x.ex.person)} <span class="mono">(afstand ${x.d.toFixed(2)})</span>`).join('<br>');
}

function loop() {
  tickRec();
  updateRec();
  drawTrace();
  updateGuess();
  requestAnimationFrame(loop);
}

openSet((glob.set as SetId) || null);
render();
if (S.src === 'm5' && S.kanaal) void joinKanaal(S.kanaal);
loop();
