/**
 * Opwarmen: magnetron × datacentrum.
 * Een jaren-tachtig magnetron. Op het draaiplateau staat geen mok, maar een klein datacentrum.
 * Alles loopt op je hartslag: het plateau draait mee (tien slagen per rondje, zoals een echt
 * plateau bij rust), de kookwekker tikt één seconde per slag terug, de racks knipperen en worden
 * langzaam warm. Uit de racks stijgen getallen op als stoom: enen en nullen, en de getallen van een model.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Fan, Hum, ping, tick } from '../sound';
import type { Drive } from '../Digitaal';
import { brushedTex, canvasTex, font, glareTex, keyLight, mat, rng, shadows, stoneTex, tileTex, type Mashup, type Stage } from './stage';

// stoom van getallen: bits en gewichten uit een embedding
const r0 = rng(5);
const emb = () => `${r0() < 0.45 ? '−' : ''}0.${String(Math.floor(r0() * 9999)).padStart(4, '0')}`;
const TOKENS = [...Array.from({ length: 10 }, (_, i) => (i % 2 ? '1' : '0')), '01', '10', '0110', '1011', '001', ...Array.from({ length: 14 }, emb)];
const TOTAL = 120; // twee minuten lichaamstijd

const rb = (w: number, h: number, d: number, r = 0.006, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

function roundRect(s: THREE.Shape | THREE.Path, x: number, y: number, w: number, h: number, r: number) {
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
}

export function opwarmen(st: Stage): Mashup {
  const S = st.scene;
  S.background = new THREE.Color(0x0b0908);
  st.rig.pos.set(0.2, 0.27, 0.84);
  st.rig.target.set(-0.035, 0.16, 0.0);
  st.camera.fov = 30;
  st.finish.uniforms.warmth.value = 0.6;
  st.scene.environmentIntensity = 0.35;

  // ---------------------------------------------------------------- keuken
  const stone = stoneTex('#2a2623', 7);
  stone.tex.repeat.set(2, 1);
  stone.tex.wrapS = stone.tex.wrapT = THREE.RepeatWrapping;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(3, 0.04, 1.3), new THREE.MeshPhysicalMaterial({ map: stone.tex, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 }));
  counter.position.set(0, -0.02, 0.2);
  counter.receiveShadow = true;
  S.add(counter);
  const tiles = tileTex({ cols: 6, rows: 12, color: '#e7e1d4', grout: '#b9b1a3', offset: true, seed: 21 });
  tiles.map.repeat.set(3.4, 1.7);
  tiles.bump.repeat.set(3.4, 1.7);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.5), new THREE.MeshPhysicalMaterial({ map: tiles.map, bumpMap: tiles.bump, bumpScale: 1.5, roughness: 0.22, clearcoat: 0.7, clearcoatRoughness: 0.1 }));
  wall.position.set(0, 0.75, -0.45);
  wall.receiveShadow = true;
  S.add(wall);

  // licht: een lage lamp van linksvoor, de rest komt uit de magnetron
  const key = keyLight(0xffe2c4, 5.5, [-1.1, 1.25, 1.1], [0, 0.12, 0], 0.42);
  S.add(key, key.target);
  S.add(new THREE.HemisphereLight(0x8a9bb0, 0x2a1d14, 0.25));

  // ---------------------------------------------------------------- magnetron
  const W = 0.56, H = 0.33, D = 0.4, y0 = 0.014, t = 0.02, pw = 0.16;
  const cy = y0 + H / 2;
  const mw = new THREE.Group();
  S.add(mw);
  const cream = mat.enamel(0xe6dcc6, 0.38);
  const add = (g: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = mw) => {
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    return mesh;
  };
  add(rb(W, t, D), cream, 0, y0 + H - t / 2, 0);
  add(rb(W, t, D), cream, 0, y0 + t / 2, 0);
  add(rb(t, H, D), cream, -W / 2 + t / 2, cy, 0);
  add(rb(W, H, t), cream, 0, cy, -D / 2 + t / 2);
  add(rb(pw, H, D), cream, W / 2 - pw / 2, cy, 0);
  // voetjes
  for (const [x, z] of [[-0.24, 0.16], [0.24, 0.16], [-0.24, -0.16], [0.24, -0.16]]) add(new THREE.CylinderGeometry(0.012, 0.014, y0, 20), mat.rubber(), x, y0 / 2, z);

  // binnenkant
  const cw = W - t - pw, ch = H - 2 * t, cd = D - t - 0.025;
  const cx = (t - pw) / 2;
  const cz = -D / 2 + t + cd / 2;
  const liner = add(new THREE.BoxGeometry(cw, ch, cd), new THREE.MeshStandardMaterial({ color: 0xd8d2c6, roughness: 0.55, side: THREE.BackSide }), cx, cy, cz);
  liner.receiveShadow = true;
  // lampje rechtsboven in de ruimte
  const bulbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.3) });
  add(new THREE.CircleGeometry(0.014, 24), bulbMat, cx + cw / 2 - 0.0005, cy + ch / 2 - 0.04, cz - 0.05).rotation.y = -Math.PI / 2;
  const inner = new THREE.PointLight(0xffaa62, 0.6, 0.9, 2);
  inner.position.set(cx + 0.06, cy + ch / 2 - 0.03, cz);
  inner.castShadow = true;
  inner.shadow.mapSize.set(1024, 1024);
  inner.shadow.radius = 4;
  inner.shadow.bias = -0.001;
  mw.add(inner);

  // draaiplateau
  const plate = new THREE.Group();
  plate.position.set(cx, y0 + t + 0.016, cz + 0.008);
  mw.add(plate);
  const dc = new THREE.Group();
  dc.scale.setScalar(1.18);
  plate.add(dc);
  add(new THREE.TorusGeometry(0.09, 0.004, 10, 48), mat.rubber(0x2b2b2b), cx, y0 + t + 0.006, cz + 0.008).rotation.x = Math.PI / 2;
  const glassPlate = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.006, 72), new THREE.MeshPhysicalMaterial({ color: 0xbfd6c9, roughness: 0.04, transparent: true, opacity: 0.55, clearcoat: 1 }));
  plate.add(glassPlate);

  // klein datacentrum: verhoogde vloer, twee rijen racks, kabelgoot
  const tilesDC = tileTex({ cols: 8, rows: 8, color: '#9aa1a8', grout: '#3a3f44', seed: 33, size: 256 });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.008, 0.16), new THREE.MeshStandardMaterial({ map: tilesDC.map, roughness: 0.5, metalness: 0.3 }));
  floor.position.y = 0.007;
  dc.add(floor);
  const rackBody = new THREE.MeshStandardMaterial({ color: 0x17191c, metalness: 0.7, roughness: 0.42, emissive: new THREE.Color(0, 0, 0) });
  const face = canvasTex(64, 192, (g, w, h) => {
    g.fillStyle = '#0d0e10';
    g.fillRect(0, 0, w, h);
    for (let u = 0; u < 24; u++) {
      g.fillStyle = u % 5 === 4 ? '#08090a' : '#1e2125';
      g.fillRect(4, 4 + u * 7.6, w - 8, 6.4);
      g.fillStyle = '#2a2e33';
      for (let k = 0; k < 7; k++) g.fillRect(8 + k * 4, 5.5 + u * 7.6, 2, 3.4);
    }
  });
  const racks: { led: ReturnType<typeof canvasTex>; seed: () => number }[] = [];
  const rackH = 0.118;
  for (let row = 0; row < 2; row++)
    for (let k = 0; k < 3; k++) {
      const g = new THREE.Group();
      g.position.set(-0.062 + k * 0.062, 0.011 + rackH / 2, row ? -0.036 : 0.036);
      if (row) g.rotation.y = Math.PI;
      const body = new THREE.Mesh(rb(0.054, rackH, 0.044, 0.003, 2), rackBody);
      g.add(body);
      const led = canvasTex(64, 192);
      const fm = new THREE.MeshStandardMaterial({ map: face.tex, roughness: 0.5, metalness: 0.4, emissive: 0xffffff, emissiveMap: led.tex, emissiveIntensity: 3.2 });
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.05, rackH - 0.006), fm);
      front.position.z = 0.0225;
      g.add(front);
      dc.add(g);
      racks.push({ led, seed: rng(100 + row * 10 + k) });
    }
  const tray = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: 0xd8b23a, roughness: 0.5, metalness: 0.2 }));
  tray.position.y = 0.011 + rackH + 0.01;
  dc.add(tray);
  for (const x of [-0.08, 0.08]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.012), mat.steel());
    post.position.set(x, 0.011 + rackH + 0.004, 0);
    dc.add(post);
  }

  const drawLeds = (load: number) => {
    for (const r of racks) {
      const g = r.led.g;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 64, 192);
      for (let u = 0; u < 24; u++) {
        if (u % 5 === 4) continue;
        for (let k = 0; k < 3; k++) {
          if (r.seed() > load) continue;
          const p = r.seed();
          g.fillStyle = p < 0.68 ? '#46ff7a' : p < 0.9 ? '#4aa8ff' : '#ffb03a';
          g.fillRect(42 + k * 6, 6 + u * 7.6, 3, 3);
        }
      }
      r.led.tex.needsUpdate = true;
    }
  };
  drawLeds(0.5);

  // deur: frame met venster, gaasje, glas, greep
  const dw = W - pw, dh = H - 0.008;
  const dcx = -W / 2 + dw / 2;
  const ww = 0.29, wh = 0.205, wx = dcx - 0.018;
  const doorShape = new THREE.Shape();
  roundRect(doorShape, -dw / 2, -dh / 2, dw, dh, 0.012);
  const hole = new THREE.Path();
  roundRect(hole, wx - dcx - ww / 2, -wh / 2, ww, wh, 0.01);
  doorShape.holes.push(hole);
  const doorGeo = new THREE.ExtrudeGeometry(doorShape, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 3, curveSegments: 12 });
  const door = add(doorGeo, cream, dcx, cy, D / 2 + 0.002);
  void door;
  const zDoor = D / 2 + 0.012;
  const meshTex = canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#000';
      for (const [x, y] of [[16, 16], [48, 16], [0, 48], [32, 48], [64, 48]]) {
        g.beginPath();
        g.arc(x, y, 10.5, 0, Math.PI * 2);
        g.fill();
      }
    },
    { color: false, repeat: [ww / 0.004, wh / 0.0035] },
  );
  const gauze = add(new THREE.PlaneGeometry(ww, wh), new THREE.MeshStandardMaterial({ color: 0x070707, metalness: 0.3, roughness: 0.6, alphaMap: meshTex.tex, transparent: true, opacity: 0.9, depthWrite: false }), wx, cy, zDoor - 0.004);
  gauze.renderOrder = 2;
  const pane = add(new THREE.PlaneGeometry(ww, wh), mat.thinGlass(0x120b06, 0.22), wx, cy, zDoor);
  pane.renderOrder = 3;
  const glare = add(new THREE.PlaneGeometry(ww, wh), new THREE.MeshBasicMaterial({ map: glareTex().tex, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }), wx, cy, zDoor + 0.001);
  glare.renderOrder = 4;
  // greep
  const chrome = mat.chrome(0.08);
  const hx = dcx + dw / 2 - 0.028;
  add(new THREE.CapsuleGeometry(0.007, 0.2, 8, 20), chrome, hx, cy, zDoor + 0.03);
  for (const dy of [-0.09, 0.09]) add(new THREE.CylinderGeometry(0.005, 0.006, 0.03, 16), chrome, hx, cy + dy, zDoor + 0.016).rotation.x = Math.PI / 2;

  // bedieningspaneel
  const px = W / 2 - pw / 2;
  const zP = D / 2;
  const alu = new THREE.MeshStandardMaterial({ color: 0xc4c6c4, metalness: 1, roughness: 0.38, roughnessMap: brushedTex(23, 512, true).tex });
  add(rb(pw - 0.022, H - 0.03, 0.006, 0.003), alu, px, cy, zP + 0.002);
  add(rb(0.12, 0.05, 0.006, 0.004), new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.1, clearcoat: 1 }), px, y0 + H - 0.055, zP + 0.006);
  const vfd = canvasTex(512, 200);
  const vfdMat = new THREE.MeshBasicMaterial({ map: vfd.tex, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(1.8, 1.8, 1.8), depthWrite: false });
  add(new THREE.PlaneGeometry(0.11, 0.043), vfdMat, px, y0 + H - 0.055, zP + 0.0095);
  const drawVfd = (l1: string, l2: string, l3: string) => {
    const g = vfd.g;
    g.clearRect(0, 0, 512, 200);
    g.fillStyle = 'rgba(60,255,210,0.08)';
    g.fillRect(0, 0, 512, 200);
    g.shadowColor = '#43ffd2';
    g.shadowBlur = 14;
    g.fillStyle = '#7dffe0';
    g.textAlign = 'left';
    g.font = font(34, 'mono', 500);
    g.fillText(l1, 22, 52);
    g.font = font(92, 'mono', 400);
    g.fillText(l2, 20, 150);
    g.font = font(26, 'mono', 400);
    g.textAlign = 'right';
    g.fillText(l3, 492, 186);
    vfd.tex.needsUpdate = true;
  };
  // kookwekker
  const dial = canvasTex(512, 512, (g) => {
    g.fillStyle = '#efe9dc';
    g.beginPath();
    g.arc(256, 256, 256, 0, Math.PI * 2);
    g.fill();
    g.translate(256, 256);
    g.fillStyle = '#1a1714';
    g.strokeStyle = '#1a1714';
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 1.5;
      g.save();
      g.rotate(a);
      g.lineWidth = i % 6 === 0 ? 7 : 3;
      g.beginPath();
      g.moveTo(0, -238);
      g.lineTo(0, i % 6 === 0 ? -200 : -218);
      g.stroke();
      g.restore();
    }
    g.font = font(46, 'sans', 500);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ['0', '½', '1', '1½', '2'].forEach((s, i) => {
      const a = (i / 4) * Math.PI * 1.5;
      g.fillText(s, Math.sin(a) * 166, -Math.cos(a) * 166);
    });
    g.font = font(26, 'mono', 500);
    g.fillText('MIN · HARTSLAG', 0, 110);
  });
  const dialY = cy - 0.012;
  add(new THREE.CircleGeometry(0.05, 64), new THREE.MeshStandardMaterial({ map: dial.tex, roughness: 0.45 }), px, dialY, zP + 0.0058);
  const knob = new THREE.Group();
  knob.position.set(px, dialY, zP + 0.006);
  mw.add(knob);
  const knobMat = mat.plastic(0x2c2a27, 0.35);
  const kb = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.028, 0.02, 48), knobMat);
  kb.rotation.x = Math.PI / 2;
  kb.position.z = 0.01;
  knob.add(kb);
  const grip = new THREE.Mesh(rb(0.012, 0.05, 0.016, 0.004), knobMat);
  grip.position.z = 0.026;
  knob.add(grip);
  const pointer = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.018, 0.001), new THREE.MeshBasicMaterial({ color: 0xf2eee6 }));
  pointer.position.set(0, 0.016, 0.0345);
  knob.add(pointer);
  // vermogensknop + ventilatiesleuven
  const k2 = add(new THREE.CylinderGeometry(0.017, 0.018, 0.016, 40), knobMat, px, y0 + 0.07, zP + 0.013);
  k2.rotation.x = Math.PI / 2;
  const slot = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
  for (let i = 0; i < 4; i++) add(rb(0.09, 0.0035, 0.004, 0.0015), slot, px, y0 + 0.024 + i * 0.008, zP + 0.004);

  shadows(S);
  counter.castShadow = false;
  wall.castShadow = false;
  liner.castShadow = false;
  glare.castShadow = gauze.castShadow = pane.castShadow = false;

  // ---------------------------------------------------------------- woorden als stoom
  const tokenTex = TOKENS.map((w) =>
    canvasTex(256, 64, (g) => {
      g.font = font(w.length > 4 ? 34 : 44, 'mono', 400);
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.shadowColor = 'rgba(40,18,4,0.85)';
      g.shadowBlur = 10;
      g.fillStyle = '#fff8ee';
      g.fillText(w, 128, 32);
    }).tex,
  );
  const steam = Array.from({ length: 26 }, () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tokenTex[0], transparent: true, opacity: 0, depthWrite: false, color: new THREE.Color(1.3, 1.2, 1.1) }));
    s.scale.set(0.06, 0.015, 1);
    s.visible = false;
    mw.add(s);
    return { s, age: 0, life: 1, x: 0, z: 0, ph: 0 };
  });
  let spawnAcc = 0;
  let puff = 0;
  const r = rng(77);

  // ---------------------------------------------------------------- toestand
  let left = TOTAL;
  let heat = 0;
  let done = false;
  let doneAt = 0;
  let lastBeat = -1;
  let tNow = 0;
  let snd: { hum: Hum; fan: Fan } | null = null;
  let soundOn = false;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const restart = () => {
    left = TOTAL;
    done = false;
  };

  return {
    setSound(on) {
      soundOn = on;
      if (on && !snd && !done) snd = { hum: new Hum('bandpass', 900, 0.8, 0.045, 120), fan: new Fan(0.025) };
      if (!on && snd) {
        snd.hum.stop();
        snd.fan.stop();
        snd = null;
      }
    },
    restart,
    status() {
      const temp = Math.round(19 + heat * 64);
      return done ? `klaar · het model is warm (${temp}°C) · koelt af` : `nog ${fmt(left)} lichaamstijd · ${temp}°C`;
    },
    update(d: Drive, t: number, dt: number) {
      tNow = t;
      const b = Math.floor(d.beat);
      if (lastBeat < 0) lastBeat = b;
      if (b !== lastBeat) {
        lastBeat = b;
        drawLeds(done ? 0.12 : 0.35 + heat * 0.45);
        if (!done) puff += 1.5 + heat * 2.5; // elke slag stijgt er een wolkje getallen op
        if (!done) {
          left = Math.max(0, left - 1);
          if (soundOn) tick(0.18, b % 2 === 0);
          if (left === 0) {
            done = true;
            doneAt = t;
            if (soundOn) ping(0.32, 3);
            if (snd) {
              snd.hum.stop();
              snd.fan.stop();
              snd = null;
            }
          }
        }
      }
      if (done && tNow - doneAt > 30) {
        restart();
        if (soundOn && !snd) snd = { hum: new Hum('bandpass', 900, 0.8, 0.045, 120), fan: new Fan(0.025) };
      }

      const target = done ? 0 : 1 - left / TOTAL;
      heat += (target - heat) * Math.min(1, dt * (done ? 0.08 : 0.6));
      plate.rotation.y = -((d.beat / 10) % 1) * Math.PI * 2;
      knob.rotation.z = -(left / TOTAL) * Math.PI * 1.5 + (done ? 0 : Math.sin(t * 40) * 0.0004);
      const on = done ? 0 : 1;
      inner.intensity += ((0.1 + 0.5 * on + 0.25 * heat * on) - inner.intensity) * Math.min(1, dt * 3);
      inner.color.setHSL(0.08 - heat * 0.03, 0.9, 0.62);
      bulbMat.color.setRGB(4 * on + 0.2, 2.6 * on + 0.15, 1.3 * on + 0.1);
      rackBody.emissive.setRGB(0.9 * heat * heat, 0.22 * heat * heat, 0.03 * heat);
      snd?.fan.set(900 + heat * 1600);

      const temp = Math.round(19 + heat * 64);
      if (done) drawVfd('KLAAR', Math.floor(t * 1.2) % 2 ? '0:00' : '', `${temp}°C`);
      else drawVfd('OPWARMEN', fmt(left), `MODEL 7B · ${temp}°C`);

      // getallen stijgen op: een wolkje per hartslag, verspreid over een halve seconde
      const take = Math.min(puff, dt * 8);
      puff -= take;
      spawnAcc += take + dt * (done ? 0.3 : 0.6);
      while (spawnAcc > 1) {
        spawnAcc -= 1;
        const p = steam.find((x) => !x.s.visible);
        if (!p) break;
        p.s.visible = true;
        p.s.material.map = tokenTex[Math.floor(r() * tokenTex.length)];
        p.age = 0;
        p.life = 4 + r() * 3;
        p.x = -0.04 + (r() - 0.5) * 0.18;
        p.z = 0.03 + r() * 0.09;
        p.ph = r() * 6;
      }
      for (const p of steam) {
        if (!p.s.visible) continue;
        p.age += dt;
        const k = p.age / p.life;
        if (k >= 1) {
          p.s.visible = false;
          continue;
        }
        const base = plate.position;
        p.s.position.set(base.x + p.x + Math.sin(p.ph + p.age * 0.9) * 0.012, base.y + 0.105 + k * 0.085, base.z + p.z);
        p.s.material.opacity = Math.sin(k * Math.PI) * 0.9;
        const sc = 0.13 + k * 0.05;
        p.s.scale.set(sc, sc / 4, 1);
      }
      st.bloom.strength = 0.42 + heat * 0.25;
    },
    dispose() {
      if (snd) {
        snd.hum.stop();
        snd.fan.stop();
      }
      tokenTex.forEach((x) => x.dispose());
    },
  };
}
