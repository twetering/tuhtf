/**
 * Opschonen: vaatwasser × defragmenteren.
 * Een open vaatwasser. De borden in het onderrek zijn de blokken van een harde schijf:
 * terracotta = gefragmenteerd, kobalt = op zijn plek, celadon = systeembestand (blijft staan).
 * In het bovenrek staan kopjes. Bij elke hartslag zet de machine één bord
 * op zijn plaats en geeft de sproeiarm een stoot. Is alles opgeruimd, dan spoelt hij even na,
 * en begint een nieuwe dag.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { audio, hddSeek, Hum, soundReady } from '../sound';
import type { Drive } from '../Digitaal';
import { brushedTex, canvasTex, clamp01, ease, keyLight, lerp, mat, plasterTex, rng, shadows, softDot, stoneTex, woodTex, type Mashup, type Stage } from './stage';

type Cat = 'frag' | 'ok' | 'vast';
const KLEUR: Record<Cat, THREE.Color> = { frag: new THREE.Color(0xb2462e), ok: new THREE.Color(0x2b4fb0), vast: new THREE.Color(0x8fbaa2) };
const COLS = 3;
const ROWS = 12;
const N = COLS * ROWS;

function clink(vol = 0.05) {
  if (!soundReady()) return;
  const { ctx, master } = audio();
  const t = ctx.currentTime + 0.005;
  for (const [f, v] of [[2350, 1], [3720, 0.6], [5900, 0.25]] as const) {
    const o = ctx.createOscillator();
    o.frequency.value = f * (0.97 + Math.random() * 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.4);
  }
}

export function opschonen(st: Stage): Mashup {
  const S = st.scene;
  S.background = new THREE.Color(0x14110f);
  st.rig.pos.set(0.22, 1.02, 1.36);
  st.rig.target.set(0, 0.3, -0.3);
  st.camera.fov = 33;
  st.scene.environmentIntensity = 0.45;
  st.finish.uniforms.warmth.value = 0.25;
  st.bloom.strength = 0.22;
  st.bloom.threshold = 1.3;

  // ---------------------------------------------------------------- keuken
  const oak = woodTex('#a77d55', '#4b2f1a', 41);
  oak.tex.wrapS = oak.tex.wrapT = THREE.RepeatWrapping;
  oak.tex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshPhysicalMaterial({ map: oak.tex, roughness: 0.42, clearcoat: 0.4, clearcoatRoughness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.8;
  S.add(floor);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshStandardMaterial({ map: plasterTex('#e9e3d8', 43).tex, roughness: 0.9 }));
  wall.position.set(0, 1.2, -0.62);
  S.add(wall);
  const paint = new THREE.MeshPhysicalMaterial({ color: 0x5f7464, roughness: 0.62, clearcoat: 0.15 });
  const brass = mat.brass(0.3);
  for (const side of [-1, 1]) {
    const cab = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.76, 0.6, 3, 0.004), paint);
    cab.position.set(side * (0.3 + 0.6 + 0.002), 0.1 + 0.38, -0.3);
    S.add(cab);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.55), new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.8 }));
    plinth.position.set(side * 0.9, 0.05, -0.34);
    S.add(plinth);
    // deurnaad + greep
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.74, 0.004), new THREE.MeshStandardMaterial({ color: 0x232a24 }));
    seam.position.set(side * 0.9, 0.48, 0.001);
    S.add(seam);
    const knob = new THREE.Mesh(new THREE.CapsuleGeometry(0.006, 0.12, 6, 16), brass);
    knob.position.set(side * 0.38, 0.72, 0.02);
    S.add(knob);
  }
  const top = new THREE.Mesh(new RoundedBoxGeometry(3.2, 0.04, 0.64, 3, 0.006), new THREE.MeshPhysicalMaterial({ map: stoneTex('#d9d4cb', 45).tex, roughness: 0.3, clearcoat: 0.5 }));
  top.position.set(0, 0.88, -0.3);
  S.add(top);

  // ---------------------------------------------------------------- vaatwasser
  const brushed = brushedTex(47, 512, true).tex;
  const steel = mat.steel(0.3, brushed);
  const tub = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.58), new THREE.MeshStandardMaterial({ color: 0xb9bcbe, metalness: 1, roughness: 0.42, roughnessMap: brushed, envMapIntensity: 0.35, side: THREE.BackSide }));
  tub.position.set(0, 0.46, -0.29);
  S.add(tub);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.03), steel);
  lip.position.set(0, 0.84, -0.005);
  S.add(lip);
  const dplinth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.09, 0.5), new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.8 }));
  dplinth.position.set(0, 0.045, -0.3);
  S.add(dplinth);
  // open deur, liggend
  const door = new THREE.Group();
  door.position.set(0, 0.1, 0);
  S.add(door);
  const dBody = new THREE.Mesh(new RoundedBoxGeometry(0.595, 0.05, 0.72, 3, 0.008), new THREE.MeshStandardMaterial({ color: 0x2a2b2d, roughness: 0.4, metalness: 0.6 }));
  dBody.position.set(0, -0.025, 0.36);
  door.add(dBody);
  const dInner = new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.012, 0.66, 2, 0.004), new THREE.MeshStandardMaterial({ color: 0x83878b, metalness: 0.35, roughness: 0.62, envMapIntensity: 0.3 }));
  dInner.position.set(0, 0.004, 0.35);
  door.add(dInner);
  const tabs = new THREE.Mesh(new RoundedBoxGeometry(0.16, 0.02, 0.1, 2, 0.005), mat.plastic(0xd9dad6, 0.4));
  tabs.position.set(0.16, 0.018, 0.14);
  door.add(tabs);

  // licht in de kuip
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.006, 0.012), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.9) }));
  led.position.set(0, 0.815, -0.04);
  S.add(led);
  const inner = new THREE.PointLight(0xe8f2ff, 0.12, 1.2, 2);
  inner.position.set(0, 0.36, 0.02);
  inner.castShadow = true;
  inner.shadow.mapSize.set(1024, 1024);
  inner.shadow.radius = 5;
  inner.shadow.bias = -0.0004;
  inner.shadow.normalBias = 0.012;
  S.add(inner);
  const key = keyLight(0xfff0dc, 9, [0.9, 2.3, 1.4], [0, 0.3, -0.1], 0.38);
  S.add(key, key.target);
  S.add(new THREE.HemisphereLight(0xcfd8e6, 0x3a2a1c, 0.35));

  // ---------------------------------------------------------------- rek
  const rack = new THREE.Group();
  rack.position.set(0, 0.155, -0.3);
  S.add(rack);
  const coat = mat.plastic(0x7f868d, 0.3);
  const wire = (len: number) => new THREE.CylinderGeometry(0.0022, 0.0022, len, 8);
  const RX = 0.25, RZ0 = -0.25, RZ1 = 0.25;
  const lines: THREE.Matrix4[] = [];
  const m4 = (pos: THREE.Vector3, rot: THREE.Euler, sy = 1) => new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromEuler(rot), new THREE.Vector3(1, sy, 1));
  for (let i = 0; i <= 12; i++) lines.push(m4(new THREE.Vector3(-RX + (i / 12) * 2 * RX, 0, 0), new THREE.Euler(Math.PI / 2, 0, 0), (RZ1 - RZ0) / 0.1));
  for (let i = 0; i <= 12; i++) lines.push(m4(new THREE.Vector3(0, 0, RZ0 + (i / 12) * (RZ1 - RZ0)), new THREE.Euler(0, 0, Math.PI / 2), (2 * RX) / 0.1));
  for (let i = 0; i <= 20; i++) {
    const f = i / 20;
    for (const s of [-1, 1]) {
      lines.push(m4(new THREE.Vector3(s * RX, 0.06, RZ0 + f * (RZ1 - RZ0)), new THREE.Euler(0, 0, 0), 1.2));
      lines.push(m4(new THREE.Vector3(-RX + f * 2 * RX, 0.06, s * RZ1), new THREE.Euler(0, 0, 0), 1.2));
    }
  }
  for (const y of [0.06, 0.12]) {
    for (const s of [-1, 1]) {
      lines.push(m4(new THREE.Vector3(s * RX, y, 0), new THREE.Euler(Math.PI / 2, 0, 0), (RZ1 - RZ0) / 0.1));
      lines.push(m4(new THREE.Vector3(0, y, s * RZ1), new THREE.Euler(0, 0, Math.PI / 2), (2 * RX) / 0.1));
    }
  }
  // tanden tussen de borden
  const colX = [-0.165, 0, 0.165];
  const slotZ = (k: number) => RZ0 + 0.025 + (k / (ROWS - 1)) * (RZ1 - RZ0 - 0.05);
  for (const cx of colX)
    for (let k = 0; k <= ROWS; k++) {
      const z = slotZ(k) - 0.0205;
      for (const dx of [-0.05, 0.05]) lines.push(m4(new THREE.Vector3(cx + dx, 0.035, z), new THREE.Euler(0.18, 0, 0), 0.7));
    }
  // bovenrek met kopjes ondersteboven, gewoon in de machine
  const up = new THREE.Group();
  const UX = 0.24, UZ = 0.2;
  up.position.set(0, 0.52, -0.3);
  S.add(up);
  const ul: THREE.Matrix4[] = [];
  for (let i = 0; i <= 10; i++) ul.push(m4(new THREE.Vector3(-UX + (i / 10) * 2 * UX, 0, 0), new THREE.Euler(Math.PI / 2, 0, 0), (2 * UZ) / 0.1));
  for (let i = 0; i <= 8; i++) ul.push(m4(new THREE.Vector3(0, 0, -UZ + (i / 8) * 2 * UZ), new THREE.Euler(0, 0, Math.PI / 2), (2 * UX) / 0.1));
  for (let i = 0; i <= 16; i++) {
    const f = i / 16;
    for (const s2 of [-1, 1]) {
      ul.push(m4(new THREE.Vector3(s2 * UX, 0.035, -UZ + f * 2 * UZ), new THREE.Euler(0, 0, 0), 0.7));
      ul.push(m4(new THREE.Vector3(-UX + f * 2 * UX, 0.035, s2 * UZ), new THREE.Euler(0, 0, 0), 0.7));
    }
  }
  for (const s2 of [-1, 1]) {
    ul.push(m4(new THREE.Vector3(s2 * UX, 0.07, 0), new THREE.Euler(Math.PI / 2, 0, 0), (2 * UZ) / 0.1));
    ul.push(m4(new THREE.Vector3(0, 0.07, s2 * UZ), new THREE.Euler(0, 0, Math.PI / 2), (2 * UX) / 0.1));
  }
  const uInst = new THREE.InstancedMesh(wire(0.1), coat, ul.length);
  ul.forEach((m, i) => uInst.setMatrixAt(i, m));
  up.add(uInst);
  // rails van het bovenrek
  for (const s2 of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(0.012, 0.02, 0.56, 2, 0.003), mat.steel(0.25));
    rail.position.set(s2 * (UX + 0.022), 0.53, -0.3);
    S.add(rail);
    for (const z of [-0.12, 0.12]) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 16), mat.plastic(0x3a3c40));
      w.rotation.z = Math.PI / 2;
      w.position.set(s2 * (UX + 0.012), 0.005, z);
      up.add(w);
    }
  }
  // kopjes: ondersteboven, licht schuin, wit porselein met een dun blauw randje
  const cupPts = [[0, 0.06], [0.026, 0.06], [0.03, 0.055], [0.034, 0.03], [0.036, 0.004], [0.037, 0], [0.034, 0], [0.032, 0.004], [0.03, 0.03], [0.026, 0.052], [0, 0.055]].map(([x, y]) => new THREE.Vector2(x, y));
  const cupGeo = new THREE.LatheGeometry(cupPts, 48);
  cupGeo.rotateX(Math.PI); // ondersteboven
  cupGeo.translate(0, 0.064, 0);
  const cupMap = canvasTex(8, 256, (g) => {
    g.fillStyle = '#f3efe6';
    g.fillRect(0, 0, 8, 256);
    g.fillStyle = '#2b4fb0';
    g.fillRect(0, 108, 8, 10);
  }).tex;
  const cupMat = new THREE.MeshPhysicalMaterial({ map: cupMap, roughness: 0.32, clearcoat: 0.6, clearcoatRoughness: 0.3, side: THREE.DoubleSide });
  const handleGeo = new THREE.TorusGeometry(0.016, 0.0045, 10, 24, Math.PI * 1.2);
  const cr = rng(57);
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 5; k++) {
      if (cr() < 0.12) continue;
      const cup = new THREE.Group();
      cup.position.set(-0.19 + k * 0.095 + (cr() - 0.5) * 0.01, 0.006, -0.13 + row * 0.13);
      cup.rotation.set((cr() - 0.5) * 0.12, cr() * Math.PI * 2, 0.22 * (k % 2 ? 1 : -1));
      cup.add(new THREE.Mesh(cupGeo, cupMat));
      const h = new THREE.Mesh(handleGeo, cupMat);
      h.position.set(0.034, 0.03, 0);
      h.rotation.z = -Math.PI * 0.6;
      cup.add(h);
      up.add(cup);
    }

  const inst = new THREE.InstancedMesh(wire(0.1), coat, lines.length);
  lines.forEach((m, i) => inst.setMatrixAt(i, m));
  inst.castShadow = true;
  rack.add(inst);
  for (const [x, z] of [[-RX, RZ0], [RX, RZ0], [-RX, RZ1], [RX, RZ1]]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.008, 20), mat.plastic(0x3a3c40));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x * 1.03, -0.02, z * 0.8);
    rack.add(wheel);
  }

  // sproeiarm
  const arm = new THREE.Group();
  arm.position.set(0, 0.115, -0.3);
  S.add(arm);
  const armMat = mat.plastic(0xb9bcbe, 0.3);
  arm.add(new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.012, 0.034, 2, 0.005), armMat));
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.026, 0.02, 24), armMat);
  arm.add(hub);
  const NOZ = [-0.2, -0.14, -0.08, 0.08, 0.14, 0.2];

  // ---------------------------------------------------------------- borden
  const pts = [
    [0, 0.0], [0.03, 0.0], [0.034, -0.003], [0.038, -0.003], [0.04, 0.002], [0.055, 0.004], [0.066, 0.011], [0.075, 0.017], [0.0765, 0.0155],
    [0.0745, 0.0128], [0.064, 0.0075], [0.053, 0.0055], [0.04, 0.0045], [0, 0.0045],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const plateGeo = new THREE.LatheGeometry(pts, 72);
  plateGeo.rotateX(Math.PI / 2);
  const glaze = (c: THREE.Color) =>
    canvasTex(8, 512, (g) => {
      const hex = `#${c.getHexString()}`;
      const y = (v: number) => (1 - v) * 512;
      g.fillStyle = hex;
      g.fillRect(0, 0, 8, 512);
      // spiegeltje in het midden iets lichter, een crèmekleurige sierrand, de rand iets donkerder
      g.fillStyle = '#efe6d2';
      g.fillRect(0, y(0.505), 8, y(0.47) - y(0.505));
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(0, y(0.66), 8, y(0.6) - y(0.66));
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, y(1), 8, y(0.7) - y(1));
    }).tex;
  const MAPS: Record<Cat, THREE.Texture> = { frag: glaze(KLEUR.frag), ok: glaze(KLEUR.ok), vast: glaze(KLEUR.vast) };
  const r = rng(91);
  type Plate = { cat: Cat; slot: number; mesh: THREE.Mesh; m: THREE.MeshPhysicalMaterial; anim: null | { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number; toCat: Cat; slot: number } };
  const slotPos = (i: number) => new THREE.Vector3(colX[Math.floor(i / ROWS)], 0.0805, slotZ(i % ROWS));
  const slots: (Plate | null)[] = Array(N).fill(null);
  const plates: Plate[] = [];
  const order = Array.from({ length: N }, (_, i) => i).sort(() => r() - 0.5);
  const nVast = 4;
  const nMov = 25;
  for (let n = 0; n < nVast + nMov; n++) {
    const cat: Cat = n < nVast ? 'vast' : r() < 0.62 ? 'frag' : 'ok';
    const m = new THREE.MeshPhysicalMaterial({ map: MAPS[cat], roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.03, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(plateGeo, m);
    mesh.castShadow = mesh.receiveShadow = true;
    const slot = order[n];
    mesh.position.copy(slotPos(slot));
    mesh.rotation.x = 0.06;
    rack.add(mesh);
    const p: Plate = { cat, slot, mesh, m, anim: null };
    slots[slot] = p;
    plates.push(p);
  }
  // doel: alle verplaatsbare borden aaneengesloten vooraan, systeemborden blijven staan
  const target = () => {
    const free = Array.from({ length: N }, (_, i) => i).filter((i) => slots[i]?.cat !== 'vast');
    return new Set(free.slice(0, nMov));
  };
  let T = target();

  // ---------------------------------------------------------------- water en stoom
  const NP = 2200;
  const pPos = new Float32Array(NP * 3);
  const pVel = new Float32Array(NP * 3);
  const pLife = new Float32Array(NP);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const drop = softDot(64);
  const water = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({ map: drop.tex, size: 0.011, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(0.75, 0.9, 1.1), opacity: 0.55 }),
  );
  water.frustumCulled = false;
  S.add(water);
  let pNext = 0;
  const steamTex = softDot(128, 'rgba(255,255,255,0.9)').tex;
  const steam = Array.from({ length: 14 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: steamTex, transparent: true, opacity: 0, depthWrite: false }));
    s.visible = false;
    S.add(s);
    return { s, age: 0, life: 1, x: 0, vx: 0 };
  });

  shadows(rack);
  shadows(arm);
  shadows(up);
  floor.receiveShadow = wall.receiveShadow = true;
  tub.receiveShadow = true;
  dInner.receiveShadow = dBody.receiveShadow = true;

  // ---------------------------------------------------------------- toestand
  type Phase = 'opschonen' | 'naspoelen' | 'nieuwe dag';
  let phase: Phase = 'opschonen';
  let phaseBeats = 0;
  let usedLeft = 0;
  let lastBeat = -1;
  let beatDur = 0.9;
  let lastBeatT = 0;
  let hum: Hum | null = null;
  let soundOn = false;
  let tNow = 0;
  let spurt = 0;
  let steamDue = false;

  const progress = () => {
    const good = plates.filter((p) => p.cat === 'ok' && T.has(p.slot) && !p.anim).length;
    return good / nMov;
  };
  const startMove = (p: Plate, to: number, toCat: Cat) => {
    slots[p.slot] = null;
    slots[to] = p;
    p.anim = { from: p.mesh.position.clone(), to: slotPos(to), t0: tNow, dur: Math.max(0.45, Math.min(1.3, beatDur * 0.85)), toCat, slot: to };
    p.slot = to;
    if (soundOn) hddSeek(0.12);
  };
  const step = () => {
    if (plates.some((p) => p.anim)) return;
    if (phase === 'opschonen') {
      T = target();
      const outside = plates.filter((p) => p.cat !== 'vast' && !T.has(p.slot)).sort((a, b) => b.slot - a.slot);
      const emptyIn = [...T].filter((i) => !slots[i]).sort((a, b) => a - b);
      if (outside.length && emptyIn.length) return startMove(outside[0], emptyIn[0], 'ok');
      const frag = plates.filter((p) => p.cat === 'frag').sort((a, b) => a.slot - b.slot)[0];
      if (frag) return startMove(frag, frag.slot, 'ok'); // op zijn plek herschrijven
      phase = 'naspoelen';
      phaseBeats = 0;
      return;
    }
    if (phase === 'naspoelen') {
      if (++phaseBeats > 24) {
        phase = 'nieuwe dag';
        usedLeft = 9 + Math.floor(r() * 5);
      }
      return;
    }
    // nieuwe dag: borden worden gebruikt en komen ergens anders terug
    if (usedLeft-- <= 0) {
      phase = 'opschonen';
      return;
    }
    const mov = plates.filter((p) => p.cat !== 'vast');
    const p = mov[Math.floor(r() * mov.length)];
    const empty = Array.from({ length: N }, (_, i) => i).filter((i) => !slots[i]);
    startMove(p, empty[Math.floor(r() * empty.length)], 'frag');
  };

  return {
    setSound(on) {
      soundOn = on;
      if (on && !hum) hum = new Hum('lowpass', 520, 0.9, 0.09, 0);
      if (!on && hum) {
        hum.stop();
        hum = null;
      }
    },
    status() {
      const pct = Math.round(progress() * 100);
      if (phase === 'opschonen') return `defragmenteren · ${pct}%`;
      if (phase === 'naspoelen') return 'naspoelen';
      return 'een nieuwe dag';
    },
    update(d: Drive, t: number, dt: number) {
      tNow = t;
      const b = Math.floor(d.beat);
      if (lastBeat < 0) lastBeat = b;
      if (b !== lastBeat) {
        lastBeat = b;
        if (lastBeatT) beatDur = beatDur * 0.7 + Math.min(1.6, t - lastBeatT) * 0.3;
        lastBeatT = t;
        step();
        spurt = 1;
        if (b % 3 === 0) steamDue = true; // elke derde slag een wolkje stoom
      }
      spurt = Math.max(0, spurt - dt * 2.2);
      // borden in beweging
      for (const p of plates) {
        if (!p.anim) continue;
        const a = p.anim;
        const k = clamp01((t - a.t0) / a.dur);
        const e = ease(k);
        p.mesh.position.lerpVectors(a.from, a.to, e);
        const same = a.from.distanceTo(a.to) < 0.001;
        p.mesh.position.y += Math.sin(Math.PI * k) * (same ? 0.05 : 0.17);
        p.mesh.rotation.x = 0.06 + Math.sin(Math.PI * k) * 0.25;
        p.m.map = k > 0.5 ? MAPS[a.toCat] : MAPS[p.cat];
        if (k >= 1) {
          p.cat = a.toCat;
          p.m.map = MAPS[p.cat];
          p.mesh.rotation.x = 0.06;
          p.anim = null;
          if (soundOn) clink(0.045);
        }
      }
      // sproeiarm: draait mee met de hartslag (een halve slag per tel), elke slag een stoot
      const rinse = phase === 'naspoelen' ? 1.6 : 1;
      arm.rotation.y = d.beat * Math.PI * 2 * 0.06;
      const lvl = 0.25 + 0.75 * spurt;
      const rate = (380 + 900 * lvl) * rinse;
      let emit = rate * dt;
      const ca = Math.cos(arm.rotation.y);
      const sa = Math.sin(arm.rotation.y);
      while (emit-- > 0) {
        const i = pNext;
        pNext = (pNext + 1) % NP;
        const n = NOZ[Math.floor(Math.random() * NOZ.length)];
        const x = n * ca;
        const z = -n * sa;
        pPos[i * 3] = x;
        pPos[i * 3 + 1] = 0.125;
        pPos[i * 3 + 2] = -0.3 + z;
        const vUp = 1.8 + Math.random() * 0.9 * (0.6 + lvl * 0.6);
        const tang = (Math.random() - 0.5) * 0.5 + Math.sign(n) * 0.25;
        pVel[i * 3] = -sa * tang + (Math.random() - 0.5) * 0.12;
        pVel[i * 3 + 1] = vUp;
        pVel[i * 3 + 2] = -ca * tang + (Math.random() - 0.5) * 0.12;
        pLife[i] = 0.7 + Math.random() * 0.3;
      }
      for (let i = 0; i < NP; i++) {
        if (pLife[i] <= 0) {
          pPos[i * 3 + 1] = -10;
          continue;
        }
        pLife[i] -= dt;
        pVel[i * 3 + 1] -= 9.8 * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pPos[i * 3 + 1] < 0.11 || pPos[i * 3 + 1] > 0.51) pLife[i] = 0;
      }
      pGeo.attributes.position.needsUpdate = true;
      // stoom komt rustig naar buiten
      if (steamDue) {
        steamDue = false;
        const s = steam.find((x) => !x.s.visible);
        if (s) {
          s.s.visible = true;
          s.age = 0;
          s.life = 5 + Math.random() * 3;
          s.x = (Math.random() - 0.5) * 0.4;
          s.vx = (Math.random() - 0.5) * 0.02;
        }
      }
      for (const s of steam) {
        if (!s.s.visible) continue;
        s.age += dt;
        const k = s.age / s.life;
        if (k >= 1) {
          s.s.visible = false;
          continue;
        }
        s.s.position.set(s.x + s.vx * s.age, lerp(0.55, 1.15, k), lerp(-0.08, 0.12, k));
        const sc = lerp(0.18, 0.55, k);
        s.s.scale.set(sc, sc, 1);
        s.s.material.opacity = Math.sin(k * Math.PI) * 0.035;
      }
      hum?.filter.frequency.setTargetAtTime(380 + lvl * 420 * rinse, audio().ctx.currentTime, 0.15);
    },
    dispose() {
      hum?.stop();
    },
  };
}
