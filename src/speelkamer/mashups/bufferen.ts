/**
 * Bufferen: wasmachine × denk-spinner.
 * Een voorlader die 'nadenkt' zoals een AI: de fases van het wasprogramma heten marineren, karnen,
 * sudderen, herkauwen, mijmeren en zweven. Rond de deur loopt een ring van lampjes als laadwieltje,
 * één stap per hartslag. De trommel heeft de echte wascadans: een paar rondjes linksom, even stil,
 * rondjes rechtsom. In de trommel alleen schuim.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { audio, Hum, tick } from '../sound';
import type { Drive } from '../Digitaal';
import { brushedTex, canvasTex, font, keyLight, mat, rng, shadows, tileTex, type Mashup, type Stage } from './stage';

/** Fases van het programma: een denkwoord en hoe de trommel beweegt (omwentelingen per hartslag). */
type Fase = { woord: string; omega: (p: number) => number };
const heenWeer = (v: number, run: number, rest: number) => (p: number) => {
  const c = p % (2 * (run + rest));
  return c < run ? v : c < run + rest ? 0 : c < 2 * run + rest ? -v : 0;
};
const FASES: Fase[] = [
  { woord: 'Marineren', omega: (p) => (p % 6 < 1.2 ? 0.22 : 0) }, // weken: af en toe een kwartslag
  { woord: 'Karnen', omega: heenWeer(0.62, 3, 1) }, // hoofdwas: linksom, stil, rechtsom
  { woord: 'Sudderen', omega: () => 0.24 }, // warm: traag en gelijkmatig
  { woord: 'Herkauwen', omega: heenWeer(0.5, 2, 1.5) }, // spoelen
  { woord: 'Mijmeren', omega: (p) => Math.sin(p * 0.7) * 0.05 }, // pauze: wiegen
  { woord: 'Zweven', omega: (p) => Math.min(1.1, 0.15 + p * 0.08) * (p < 22 ? 1 : 0) }, // zachte centrifuge
];
const PER = 24; // hartslagen per fase
const GLYPHS = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];

export function bufferen(st: Stage): Mashup {
  const S = st.scene;
  S.background = new THREE.Color(0x101214);
  st.rig.pos.set(0.3, 0.72, 1.4);
  st.rig.target.set(0.0, 0.47, 0.06);
  st.camera.fov = 32;
  st.scene.environmentIntensity = 0.32;
  st.bloom.threshold = 1.2;
  st.finish.uniforms.warmth.value = 0.1;

  // ---------------------------------------------------------------- washok
  const floorT = tileTex({ cols: 4, rows: 4, color: '#8f918d', grout: '#5d5f5c', vary: 0.1, seed: 71 });
  floorT.map.repeat.set(4, 4);
  floorT.bump.repeat.set(4, 4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshPhysicalMaterial({ map: floorT.map, bumpMap: floorT.bump, bumpScale: 2, roughness: 0.45, clearcoat: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = 0.8;
  S.add(floor);
  const wallT = tileTex({ cols: 8, rows: 8, color: '#eceae5', grout: '#c9c5bd', vary: 0.04, seed: 73 });
  wallT.map.repeat.set(3.3, 2);
  wallT.bump.repeat.set(3.3, 2);
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.4), new THREE.MeshPhysicalMaterial({ map: wallT.map, bumpMap: wallT.bump, bumpScale: 1.2, roughness: 0.2, clearcoat: 0.8, clearcoatRoughness: 0.08 }));
  wall.position.set(0, 1.2, -0.33);
  S.add(wall);
  const key = keyLight(0xf3f6ff, 3.2, [1.7, 1.9, 1.3], [0, 0.45, 0], 0.45);
  S.add(key, key.target);
  S.add(new THREE.HemisphereLight(0xdfe8f5, 0x3b3631, 0.4));

  // ---------------------------------------------------------------- machine
  const W = 0.6, H = 0.85, D = 0.58, t = 0.02;
  const white = mat.enamel(0xf3f2ee, 0.3);
  const m = new THREE.Group();
  S.add(m);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, mt: THREE.Material = white, r = 0.008) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mt);
    b.position.set(x, y, z);
    m.add(b);
    return b;
  };
  box(t, H - 0.04, D, -W / 2 + t / 2, 0.04 + (H - 0.04) / 2, 0);
  box(t, H - 0.04, D, W / 2 - t / 2, 0.04 + (H - 0.04) / 2, 0);
  box(W, t, D, 0, 0.04 + t / 2, 0);
  box(W, H - 0.04, t, 0, 0.04 + (H - 0.04) / 2, -D / 2 + t / 2);
  box(W + 0.006, 0.026, D + 0.01, 0, H - 0.013, 0.003, white, 0.01);
  box(W - 0.01, 0.04, D - 0.04, 0, 0.02, -0.01, new THREE.MeshStandardMaterial({ color: 0x2b2d30, roughness: 0.7 }), 0.004);

  // voorplaat met gat
  const doorY = 0.43, hole = 0.19;
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-W / 2, 0.04);
  plateShape.lineTo(W / 2, 0.04);
  plateShape.lineTo(W / 2, 0.71);
  plateShape.lineTo(-W / 2, 0.71);
  plateShape.closePath();
  const hp = new THREE.Path();
  hp.absarc(0, doorY, hole, 0, Math.PI * 2, true);
  plateShape.holes.push(hp);
  const front = new THREE.Mesh(new THREE.ExtrudeGeometry(plateShape, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3, curveSegments: 64 }), white);
  front.position.z = D / 2 - 0.012;
  m.add(front);
  const zF = D / 2 + 0.004;

  // bedieningsstrook: alleen stipjes rond de programmaknop
  const panelTex = canvasTex(1024, 220, (g) => {
    g.fillStyle = '#f3f2ee';
    g.fillRect(0, 0, 1024, 220);
    g.translate(870, 110);
    g.fillStyle = '#8a8d90';
    FASES.forEach((_, i) => {
      const a = -Math.PI * 0.75 + (i / (FASES.length - 1)) * Math.PI * 1.5;
      g.beginPath();
      g.arc(Math.sin(a) * 78, -Math.cos(a) * 78, 4, 0, Math.PI * 2);
      g.fill();
    });
  });
  const panel = box(W - 0.004, 0.13, 0.03, 0, 0.78, D / 2 - 0.012, new THREE.MeshPhysicalMaterial({ map: panelTex.tex, roughness: 0.3, clearcoat: 0.9 }), 0.006);
  void panel;
  // zeepbakje
  box(0.17, 0.085, 0.012, -W / 2 + 0.105, 0.78, D / 2 + 0.006, white, 0.006);
  box(0.06, 0.012, 0.006, -W / 2 + 0.105, 0.756, D / 2 + 0.013, new THREE.MeshStandardMaterial({ color: 0xc8c8c4, roughness: 0.6 }), 0.003);
  // display
  box(0.15, 0.06, 0.006, 0.03, 0.785, D / 2 + 0.005, new THREE.MeshPhysicalMaterial({ color: 0x050607, roughness: 0.08, clearcoat: 1 }), 0.004);
  const lcd = canvasTex(600, 240);
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.056), new THREE.MeshBasicMaterial({ map: lcd.tex, transparent: true, blending: THREE.AdditiveBlending, color: new THREE.Color(1.7, 1.7, 1.7), depthWrite: false }));
  lcdMesh.position.set(0.03, 0.785, D / 2 + 0.0085);
  m.add(lcdMesh);
  // programmaknop
  const dial = new THREE.Group();
  dial.position.set(0.21, 0.78, D / 2 + 0.004);
  m.add(dial);
  const chrome = mat.chrome(0.12);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.004, 16, 64), chrome);
  ring.position.z = 0.004;
  dial.add(ring);
  const kn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.031, 0.022, 64), new THREE.MeshStandardMaterial({ color: 0xd8dadb, metalness: 1, roughness: 0.28, roughnessMap: brushedTex(75).tex }));
  kn.rotation.x = Math.PI / 2;
  kn.position.z = 0.012;
  dial.add(kn);
  const notch = new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.018, 0.002), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.1, 0.3) }));
  notch.position.set(0, 0.018, 0.024);
  dial.add(notch);

  // deur
  const door = new THREE.Group();
  door.position.set(0, doorY, zF);
  m.add(door);
  const doorRing = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.03, 32, 96), mat.plastic(0xe9e9e6, 0.25));
  doorRing.scale.z = 0.7;
  door.add(doorRing);
  const inRing = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.009, 24, 96), chrome);
  inRing.position.z = 0.012;
  door.add(inRing);
  const capR = 0.3;
  const theta = Math.asin(0.172 / capR);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(capR, 72, 18, 0, Math.PI * 2, 0, theta), mat.glass(0xe8f0f4, 0.03));
  glass.rotation.x = Math.PI / 2;
  glass.position.z = -capR * Math.cos(theta) + 0.01;
  door.add(glass);
  const hinge = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.1, 0.03, 2, 0.006), mat.plastic(0xdadad6));
  hinge.position.set(-0.215, 0, -0.01);
  door.add(hinge);
  // rubber manchet
  const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.186, 0.018, 20, 96), mat.rubber(0x3a3c3f));
  gasket.position.set(0, doorY, D / 2 - 0.03);
  m.add(gasket);

  // trommel
  const dz = D / 2 - 0.05 - 0.19;
  const drum = new THREE.Group();
  drum.position.set(0, doorY, dz);
  m.add(drum);
  const perf = canvasTex(256, 256, (g) => {
    g.fillStyle = '#9aa0a4';
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#2b2f33';
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        g.beginPath();
        g.arc(16 + x * 32 + (y % 2) * 16, 16 + y * 32, 5, 0, Math.PI * 2);
        g.fill();
      }
  }, { repeat: [14, 5] });
  const drumMat = new THREE.MeshStandardMaterial({ map: perf.tex, metalness: 0.9, roughness: 0.32, side: THREE.BackSide });
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.38, 72, 1, true), drumMat);
  shell.rotation.x = Math.PI / 2;
  drum.add(shell);
  const backTex = canvasTex(512, 512, (g) => {
    const gr = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    gr.addColorStop(0, '#b7bcc0');
    gr.addColorStop(1, '#73797e');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let r = 8; r < 256; r += 3) {
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = '#2b2f33';
    for (let ring = 0; ring < 3; ring++)
      for (let i = 0; i < 18 + ring * 10; i++) {
        const a = (i / (18 + ring * 10)) * Math.PI * 2;
        const r = 165 + ring * 30;
        g.beginPath();
        g.arc(256 + Math.cos(a) * r, 256 + Math.sin(a) * r, 4.5, 0, Math.PI * 2);
        g.fill();
      }
  });
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.2, 72), new THREE.MeshStandardMaterial({ map: backTex.tex, metalness: 0.9, roughness: 0.3 }));
  back.position.z = -0.19;
  drum.add(back);
  for (let i = 0; i < 3; i++) {
    const lifter = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.045, 0.34, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0xb5babd, metalness: 0.9, roughness: 0.3 }));
    const a = (i / 3) * Math.PI * 2;
    lifter.position.set(Math.cos(a) * 0.185, Math.sin(a) * 0.185, 0);
    lifter.rotation.z = a + Math.PI / 2;
    drum.add(lifter);
  }
  // het laadwieltje: een ring van twaalf lampjes rond de deur
  const dots: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const dm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.05) });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 16, 8), dm);
    dot.scale.z = 0.4;
    dot.position.set(Math.sin(a) * 0.232, Math.cos(a) * 0.232, 0.006);
    door.add(dot);
    dots.push(dm);
  }
  const glow = new THREE.PointLight(0xff9a62, 0.0, 0.5, 2);
  glow.position.set(0, doorY + 0.1, zF + 0.08);
  m.add(glow);
  const drumLight = new THREE.PointLight(0xf2f6ff, 0.18, 0.8, 2);
  drumLight.position.set(0, doorY + 0.1, dz + 0.12);
  m.add(drumLight);

  // water
  const waterY = -0.152;
  const chord = 2 * Math.sqrt(0.2 * 0.2 - waterY * waterY);
  const foam = canvasTex(512, 512, (g) => {
    g.fillStyle = '#3f525c';
    g.fillRect(0, 0, 512, 512);
    const r = rng(79);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(240,248,255,${0.03 + r() * 0.16})`;
      g.beginPath();
      g.arc(r() * 512, r() * 512, 2 + r() * 14, 0, Math.PI * 2);
      g.fill();
    }
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(chord, 0.36, 24, 24), new THREE.MeshPhysicalMaterial({ map: foam.tex, roughness: 0.06, clearcoat: 1, metalness: 0.1 }));
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, doorY + waterY, dz);
  m.add(water);

  // schuim: honderden belletjes die op de bodem liggen en meegolven met de trommel
  const r = rng(83);
  const NB = 520;
  const foamMat = new THREE.MeshPhysicalMaterial({ color: 0xf2f6f9, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.45, iridescenceIOR: 1.3, sheen: 0.5, sheenColor: new THREE.Color(0xdfefff) });
  const bubbles = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 3), foamMat, NB);
  bubbles.castShadow = bubbles.receiveShadow = true;
  m.add(bubbles);
  const bub = Array.from({ length: NB }, () => {
    const depth = Math.pow(r(), 0.7); // 0 = tegen de wand, 1 = bovenop de berg
    return { a: -Math.PI / 2 + (r() - 0.5) * 2.2 * (1 - depth * 0.55), rr: 0.19 - depth * 0.07 - r() * 0.01, z: dz - 0.17 + r() * 0.34, s: 0.005 + r() * r() * 0.022 * (1 - depth * 0.4), ph: r() * 6 };
  });
  const bm = new THREE.Matrix4();
  const bq = new THREE.Quaternion();
  const bv = new THREE.Vector3();
  const bs = new THREE.Vector3();
  water.visible = true;

  shadows(m);
  floor.receiveShadow = wall.receiveShadow = true;
  glass.castShadow = false;
  lcdMesh.castShadow = false;

  // ---------------------------------------------------------------- toestand
  let lastBeat = -1;
  let head = 0;
  let headT = 0;
  let angle = 0;
  let omega = 0; // omwentelingen per hartslag, afgevlakt
  let prevBeat = NaN;
  let beatsIn = 0;
  let prog = 0;
  let hum: Hum | null = null;
  let soundOn = false;
  let slosh = 0;

  let lcdKey = '';
  const drawLcd = () => {
    const glyph = GLYPHS[head % GLYPHS.length];
    const key = `${prog}${glyph}`;
    if (key === lcdKey) return;
    lcdKey = key;
    const g = lcd.g;
    g.clearRect(0, 0, 600, 240);
    g.shadowColor = 'rgba(255,150,90,0.8)';
    g.shadowBlur = 12;
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(255,170,120,0.98)';
    g.font = font(64, 'sans', 400);
    g.textAlign = 'center';
    g.fillText(glyph, 62, 122);
    g.fillStyle = 'rgba(255,240,228,0.95)';
    g.font = font(58, 'sans', 300);
    g.textAlign = 'left';
    g.fillText(`${FASES[prog].woord}…`, 112, 122);
    lcd.tex.needsUpdate = true;
  };

  return {
    setSound(on) {
      soundOn = on;
      if (on && !hum) hum = new Hum('lowpass', 300, 0.8, 0.1, 0);
      if (!on && hum) {
        hum.stop();
        hum = null;
      }
    },
    status() {
      return `${FASES[prog].woord.toLowerCase()}…`;
    },
    update(d: Drive, t: number, dt: number) {
      const b = Math.floor(d.beat);
      if (lastBeat < 0) lastBeat = b;
      if (b !== lastBeat) {
        lastBeat = b;
        head = (head + 1) % 12;
        headT = t;
        beatsIn++;
        if (beatsIn >= PER) {
          beatsIn = 0;
          prog = (prog + 1) % FASES.length;
          if (soundOn) tick(0.3, true);
        } else if (soundOn) tick(0.04);
      }
      // trommel: de cadans van de fase, in hartslagen. Snelheid volgt dus je hart.
      const db = Number.isNaN(prevBeat) ? 0 : Math.max(0, Math.min(0.2, d.beat - prevBeat));
      prevBeat = d.beat;
      const want = FASES[prog].omega(beatsIn + (d.beat - b));
      const prevOmega = omega;
      omega += (want - omega) * Math.min(1, dt * 2.2); // traagheid: rustig optrekken en uitlopen
      angle += omega * db * Math.PI * 2;
      drum.rotation.z = angle;
      // schuim klotst tegen de draairichting in en zakt weer terug
      const acc = (omega - prevOmega) / Math.max(dt, 1e-3);
      slosh += (Math.max(-0.6, Math.min(0.6, omega * 0.9 + acc * 0.25)) - slosh) * Math.min(1, dt * 1.6);
      water.rotation.y = slosh * 0.08;
      water.position.y = doorY + waterY + Math.sin(t * 1.1) * 0.002;
      for (let i = 0; i < NB; i++) {
        const q = bub[i];
        const lift = slosh * (0.5 + (0.19 - q.rr) * 4);
        const a = q.a + lift + Math.sin(t * 0.7 + q.ph) * 0.02;
        const rr = q.rr + Math.sin(t * 0.9 + q.ph * 2) * 0.002;
        bv.set(Math.cos(a) * rr, doorY + Math.sin(a) * rr, q.z);
        const sc = q.s * (1 + Math.sin(t * 1.3 + q.ph) * 0.06);
        bs.set(sc, sc * 0.92, sc);
        bm.compose(bv, bq, bs);
        bubbles.setMatrixAt(i, bm);
      }
      bubbles.instanceMatrix.needsUpdate = true;
      // laadwieltje rond de deur: één stap per hartslag, met een staart
      const since = t - headT;
      dots.forEach((dm, i) => {
        const age = (head - i + 12) % 12;
        const v = Math.max(0, 1 - age / 6) * (age === 0 ? 1 + Math.max(0, 0.5 - since) : 1);
        dm.color.setRGB(0.06 + 2.8 * v * v, 0.06 + 1.15 * v * v, 0.06 + 0.55 * v * v);
      });
      glow.intensity = 0.04 + 0.08 * Math.max(0, 1 - since);
      dial.rotation.z = -(-Math.PI * 0.75 + (prog / (FASES.length - 1)) * Math.PI * 1.5);
      if (hum) hum.filter.frequency.setTargetAtTime(Math.min(900, 200 + Math.abs(omega) * 420), audio().ctx.currentTime, 0.3);
      drawLcd();
    },
    dispose() {
      hum?.stop();
    },
  };
}
