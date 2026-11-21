/**
 * Nadenken: een regulateur die op je hartslag loopt.
 * Uur-, minuut- en secondewijzer geven de gewone tijd aan. De terracotta lolliwijzer is je hart: hij
 * springt één streepje per hartslag, en de slinger zwaait één keer per slag. Telkens als hartwijzer
 * en secondewijzer op hetzelfde streepje staan, slaat de klok: de tijd en je hartslag raken elkaar.
 * Hoe dichter je hart bij 60 slagen per minuut komt, hoe langer ze samen oplopen.
 * Over de muur trekt langzaam het zonlicht van een raam.
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { gong, tick } from '../sound';
import type { Drive } from '../Digitaal';
import { canvasTex, ease, font, mat, plasterTex, shadows, woodTex, type Mashup, type Stage } from './stage';

const ROMEINS = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const TERRA = '#c8643f';

function spark(g: CanvasRenderingContext2D, r: number, color: string) {
  g.fillStyle = color;
  for (let i = 0; i < 12; i++) {
    g.save();
    g.rotate((i / 12) * Math.PI * 2);
    const s = i % 2 ? 0.76 : 1;
    g.beginPath();
    g.moveTo(0, -r * 0.12);
    g.lineTo(r * 0.07 * s, -r * 0.9 * s);
    g.quadraticCurveTo(0, -r * s * 1.02, -r * 0.07 * s, -r * 0.9 * s);
    g.closePath();
    g.fill();
    g.restore();
  }
  g.beginPath();
  g.arc(0, 0, r * 0.15, 0, Math.PI * 2);
  g.fill();
}

export function nadenken(st: Stage): Mashup {
  const S = st.scene;
  S.background = new THREE.Color(0x15110d);
  // vlak voor de klok staan, op ooghoogte van de wijzerplaat
  st.rig.pos.set(-0.1, 1.6, 0.92);
  st.rig.target.set(0.0, 1.52, 0.05);
  st.rig.breathe = 0.02;
  st.camera.fov = 32;
  st.scene.environmentIntensity = 0.16;
  st.finish.uniforms.warmth.value = 0.5;
  st.bloom.threshold = 1.1;

  // ---------------------------------------------------------------- muur en zonlicht
  const wallMat = new THREE.MeshStandardMaterial({ map: plasterTex('#ddd2c1', 61).tex, roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(5, 3.4), wallMat);
  wall.position.set(0, 1.4, 0);
  wall.receiveShadow = true;
  S.add(wall);
  const plint = new THREE.Mesh(new THREE.BoxGeometry(5, 0.12, 0.02), new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.5 }));
  plint.position.set(0, 0.06, 0.01);
  S.add(plint);
  const gobo = canvasTex(512, 512, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 512);
    g.filter = 'blur(10px)';
    g.fillStyle = '#fff';
    const m = 56, bar = 20;
    const cw = (512 - 2 * m - bar) / 2;
    for (const x of [0, 1]) for (const y of [0, 1]) g.fillRect(m + x * (cw + bar), m + y * (cw + bar), cw, cw);
    // een tak voor het raam
    g.filter = 'blur(6px)';
    g.strokeStyle = '#000';
    g.lineCap = 'round';
    g.lineWidth = 9;
    g.beginPath();
    g.moveTo(512, 90);
    g.quadraticCurveTo(360, 150, 250, 240);
    g.stroke();
    g.lineWidth = 5;
    for (const [x, y, dx, dy] of [[400, 130, -40, -50], [330, 180, -10, 60], [290, 210, -60, -20]]) {
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + dx, y + dy);
      g.stroke();
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(x + dx, y + dy, 18, 8, Math.atan2(dy, dx), 0, Math.PI * 2);
      g.fill();
    }
  });
  const sun = new THREE.SpotLight(0xffd9a6, 60, 0, 0.3, 0.25, 2);
  sun.position.set(-2.6, 2.9, 2.7);
  sun.target.position.set(0.15, 1.25, 0);
  sun.map = gobo.tex;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 5;
  sun.shadow.bias = -0.0002;
  S.add(sun, sun.target);
  S.add(new THREE.HemisphereLight(0xb7c4d6, 0x4a3524, 0.12));
  const fill = new THREE.PointLight(0xffe7cc, 0.35, 0, 2);
  fill.position.set(0.6, 1.6, 1.4);
  S.add(fill);

  // ---------------------------------------------------------------- kast
  const clock = new THREE.Group();
  clock.position.set(0, 0, 0);
  S.add(clock);
  const walnut = new THREE.MeshPhysicalMaterial({ map: woodTex('#5a3a22', '#21130a', 63).tex, roughness: 0.38, clearcoat: 0.85, clearcoatRoughness: 0.12 });
  const darkWood = new THREE.MeshStandardMaterial({ color: 0x1e140d, roughness: 0.7 });
  const brass = mat.brass(0.2);
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = walnut, r = 0.006) => {
    const b = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), m);
    b.position.set(x, y, z);
    clock.add(b);
    return b;
  };
  const CW = 0.36, depth = 0.11;
  // boven: kop met wijzerplaat
  box(CW, 0.38, depth, 0, 1.6, depth / 2);
  // fronton
  const ped = new THREE.Shape();
  ped.moveTo(-CW / 2 - 0.02, 0);
  ped.lineTo(CW / 2 + 0.02, 0);
  ped.lineTo(CW / 2 + 0.02, 0.025);
  ped.quadraticCurveTo(0, 0.13, -CW / 2 - 0.02, 0.025);
  ped.closePath();
  const pedM = new THREE.Mesh(new THREE.ExtrudeGeometry(ped, { depth: depth + 0.02, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 3 }), walnut);
  pedM.position.set(0, 1.79, -0.005);
  clock.add(pedM);
  const finial = new THREE.Mesh(new THREE.SphereGeometry(0.018, 24, 16), brass);
  finial.position.set(0, 1.9, depth / 2 + 0.01);
  clock.add(finial);
  // midden: lijst
  box(CW + 0.03, 0.03, depth + 0.02, 0, 1.4, depth / 2 + 0.005);
  // onder: slingerkast
  box(0.025, 0.5, depth, -CW / 2 + 0.0125, 1.135, depth / 2);
  box(0.025, 0.5, depth, CW / 2 - 0.0125, 1.135, depth / 2);
  box(CW, 0.04, depth + 0.02, 0, 0.87, depth / 2 + 0.005);
  box(CW, 0.5, 0.01, 0, 1.135, 0.008, darkWood, 0.002);
  const foot = new THREE.Shape();
  foot.moveTo(-CW / 2, 0);
  foot.lineTo(CW / 2, 0);
  foot.quadraticCurveTo(CW / 2 - 0.02, -0.07, 0, -0.09);
  foot.quadraticCurveTo(-CW / 2 + 0.02, -0.07, -CW / 2, 0);
  const footM = new THREE.Mesh(new THREE.ExtrudeGeometry(foot, { depth, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2 }), walnut);
  footM.position.set(0, 0.85, 0);
  clock.add(footM);
  // glazen deur voor de slinger
  const glassDoor = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.05, 0.47), mat.glass(0xf2efe8, 0.003));
  glassDoor.position.set(0, 1.135, depth + 0.001);
  clock.add(glassDoor);
  for (const [w, h, x, y] of [[CW - 0.03, 0.012, 0, 1.375], [CW - 0.03, 0.012, 0, 0.895], [0.012, 0.47, -(CW - 0.05) / 2, 1.135], [0.012, 0.47, (CW - 0.05) / 2, 1.135]] as const)
    box(w, h, 0.012, x, y, depth + 0.004, brass, 0.003);

  // wijzerplaat
  const dialY = 1.6, R = 0.135, zDial = depth + 0.004;
  const dial = canvasTex(1024, 1024, (g) => {
    const gr = g.createRadialGradient(470, 430, 40, 512, 512, 520);
    gr.addColorStop(0, '#f8f2e4');
    gr.addColorStop(1, '#e5d9bf');
    g.fillStyle = gr;
    g.beginPath();
    g.arc(512, 512, 512, 0, Math.PI * 2);
    g.fill();
    g.translate(512, 512);
    // minuutring: 60 streepjes, tussen twee dunne cirkels
    g.strokeStyle = '#2a241d';
    for (const rr of [486, 452]) {
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, rr, 0, Math.PI * 2);
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      g.save();
      g.rotate((i / 60) * Math.PI * 2);
      g.lineWidth = i % 5 ? 3 : 9;
      g.beginPath();
      g.moveTo(0, -486);
      g.lineTo(0, -452);
      g.stroke();
      g.restore();
    }
    // romeinse cijfers, naar het midden gericht
    g.fillStyle = '#231d17';
    g.font = font(92, 'serif', 500);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    ROMEINS.forEach((n, i) => {
      g.save();
      g.rotate((i / 12) * Math.PI * 2);
      g.translate(0, -372);
      g.scale(0.82, 1);
      g.fillText(n, 0, 0);
      g.restore();
    });
    // patina
    const pv = g.createRadialGradient(0, 0, 300, 0, 0, 520);
    pv.addColorStop(0, 'rgba(120,90,40,0)');
    pv.addColorStop(1, 'rgba(120,90,40,0.16)');
    g.fillStyle = pv;
    g.beginPath();
    g.arc(0, 0, 512, 0, Math.PI * 2);
    g.fill();
  });
  const dialMesh = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ map: dial.tex, roughness: 0.5 }));
  dialMesh.position.set(0, dialY, zDial);
  clock.add(dialMesh);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(R + 0.008, 0.011, 24, 96), brass);
  bezel.position.set(0, dialY, zDial + 0.004);
  clock.add(bezel);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 64, 16, 0, Math.PI * 2, 0, 0.27), mat.glass(0xffffff, 0.002));
  dome.rotation.x = Math.PI / 2;
  dome.position.set(0, dialY, zDial - 0.5 * Math.cos(0.27) + 0.012);
  clock.add(dome);

  // wijzers
  const handZ = zDial + 0.002;
  // Breguet-wijzers in blauwgestoomd staal: een steel, een open appeltje, een punt
  const breguet = (len: number, w: number) => {
    const p = len * 0.7;
    const r = len * 0.11;
    const sh = new THREE.Shape();
    sh.moveTo(-w, -len * 0.2);
    sh.lineTo(w, -len * 0.2);
    sh.lineTo(w * 0.55, p - r * 0.9);
    sh.absarc(0, p, r, -Math.PI / 2 + 0.2, Math.PI * 1.5 - 0.2, false);
    sh.lineTo(-w * 0.55, p - r * 0.9);
    sh.closePath();
    const hole = new THREE.Path();
    hole.absarc(0, p, r * 0.55, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    const tip = new THREE.Shape();
    tip.moveTo(-w * 0.45, p + r * 0.85);
    tip.lineTo(w * 0.45, p + r * 0.85);
    tip.lineTo(0, len);
    tip.closePath();
    return new THREE.ExtrudeGeometry([sh, tip], { depth: 0.0016, bevelEnabled: false, curveSegments: 24 });
  };
  const blued = new THREE.MeshStandardMaterial({ color: 0x1b2a5c, metalness: 0.9, roughness: 0.25 });
  const hourHand = new THREE.Mesh(breguet(0.072, 0.0042), blued);
  hourHand.position.set(0, dialY, handZ);
  clock.add(hourHand);
  const minHand = new THREE.Mesh(breguet(0.112, 0.0032), blued);
  minHand.position.set(0, dialY, handZ + 0.0018);
  clock.add(minHand);
  // secondewijzer: een dunne stalen naald met contragewicht
  const secShape = new THREE.Shape();
  secShape.moveTo(-0.0007, -0.032);
  secShape.lineTo(0.0007, -0.032);
  secShape.lineTo(0.00045, 0.118);
  secShape.lineTo(-0.00045, 0.118);
  secShape.closePath();
  const secW = new THREE.Shape();
  secW.absarc(0, -0.026, 0.0052, 0, Math.PI * 2, false);
  const secHand = new THREE.Mesh(new THREE.ExtrudeGeometry([secShape, secW], { depth: 0.001, bevelEnabled: false, curveSegments: 20 }), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.8, roughness: 0.3 }));
  secHand.position.set(0, dialY, handZ + 0.0029);
  clock.add(secHand);
  const lolly = new THREE.Shape();
  lolly.moveTo(-0.0011, -0.03);
  lolly.lineTo(0.0011, -0.03);
  lolly.lineTo(0.0011, 0.1);
  lolly.lineTo(-0.0011, 0.1);
  lolly.closePath();
  const disc = new THREE.Shape();
  disc.absarc(0, 0.093, 0.0085, 0, Math.PI * 2, false);
  const tail = new THREE.Shape();
  tail.absarc(0, -0.026, 0.004, 0, Math.PI * 2, false);
  const terra = new THREE.MeshStandardMaterial({ color: TERRA, roughness: 0.35, metalness: 0.2 });
  const beatHand = new THREE.Mesh(new THREE.ExtrudeGeometry([lolly, disc, tail], { depth: 0.0012, bevelEnabled: false, curveSegments: 24 }), terra);
  beatHand.position.set(0, dialY, handZ + 0.0042);
  clock.add(beatHand);
  // naaf: een kleine vonk, die gloeit als de klok slaat
  const sparkTex = canvasTex(256, 256, (g) => {
    g.translate(128, 128);
    spark(g, 120, '#fff');
  }, { color: false });
  const capMat = new THREE.MeshStandardMaterial({ color: TERRA, roughness: 0.35, metalness: 0.3, alphaMap: sparkTex.tex, transparent: true, emissive: new THREE.Color(TERRA) , emissiveIntensity: 0 });
  const cap = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.03), capMat);
  cap.position.set(0, dialY, handZ + 0.0065);
  clock.add(cap);
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.008, 16), brass);
  pin.rotation.x = Math.PI / 2;
  pin.position.set(0, dialY, handZ + 0.005);
  clock.add(pin);

  // slinger
  const pend = new THREE.Group();
  pend.position.set(0, 1.375, 0.05);
  clock.add(pend);
  const rod = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.37, 0.003), brass);
  rod.position.y = -0.185;
  pend.add(rod);
  const bobTex = canvasTex(512, 512, (g) => {
    const gr = g.createRadialGradient(200, 180, 20, 256, 256, 280);
    gr.addColorStop(0, '#fff3d2');
    gr.addColorStop(1, '#b98d45');
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(80,50,20,0.35)';
    for (let r = 30; r < 256; r += 7) {
      g.lineWidth = 1;
      g.beginPath();
      g.arc(256, 256, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.translate(256, 256);
    spark(g, 120, 'rgba(70,40,15,0.55)');
  });
  const bob = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.01, 72), [new THREE.MeshStandardMaterial({ color: 0xc49a52, metalness: 1, roughness: 0.25 }), new THREE.MeshStandardMaterial({ map: bobTex.tex, metalness: 1, roughness: 0.22 }), brass]);
  bob.rotation.x = Math.PI / 2;
  bob.position.y = -0.4;
  pend.add(bob);

  shadows(clock);
  wall.castShadow = false;
  glassDoor.castShadow = dome.castShadow = false;

  // ---------------------------------------------------------------- toestand
  let lastBeat = -1;
  let beatT = 0;
  let soundOn = false;
  let strikes = 0;
  let strikeT = -99;
  let armed = false;
  let lastSec = -1;
  let secT = 0;
  const TAU = Math.PI * 2;

  return {
    setSound(on) {
      soundOn = on;
    },
    status() {
      const now = new Date();
      return `${now.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })} · de klok sloeg ${strikes}×`;
    },
    update(d: Drive, t: number, dt: number) {
      void dt;
      const b = Math.floor(d.beat);
      if (lastBeat < 0) lastBeat = b;
      let stepped = false;
      if (b !== lastBeat) {
        lastBeat = b;
        beatT = t;
        stepped = true;
        if (soundOn) tick(0.22, b % 2 === 1);
      }
      // gewone tijd; de secondewijzer verspringt elke seconde, zonder geluid: het tikken is van je hart
      const now = new Date();
      const s = now.getSeconds();
      if (s !== lastSec) {
        lastSec = s;
        secT = t;
        stepped = true;
      }
      const sec = s + now.getMilliseconds() / 1000;
      const ks = Math.min(1, (t - secT) / 0.18);
      secHand.rotation.z = -((s - 1 + ease(ks)) / 60) * TAU;
      const min = (now.getMinutes() + sec / 60) / 60;
      const hr = ((now.getHours() % 12) + min) / 12;
      minHand.rotation.z = -min * TAU;
      hourHand.rotation.z = -hr * TAU;
      // hartwijzer: springt per hartslag (zoals een stationsklok), met een kleine naslinger
      const k = Math.min(1, (t - beatT) / 0.32);
      const over = Math.sin(Math.min(1, (t - beatT) / 0.6) * Math.PI) * 0.06 * (1 - k * 0.5);
      const heart = (b - 1 + ease(k)) / 60;
      beatHand.rotation.z = -heart * TAU - over * 0.02;
      // slaan: hartwijzer en secondewijzer staan op hetzelfde streepje. Daarna pas weer slaan als ze
      // minstens vijf streepjes uit elkaar zijn geweest (lopen ze gelijk op, dan slaat hij maar één keer).
      if (stepped) {
        const gap = (((b - s) % 60) + 60) % 60;
        const dist = Math.min(gap, 60 - gap);
        if (gap === 0 && armed) {
          armed = false;
          strikes++;
          strikeT = t;
          if (soundOn) gong(0.55);
        } else if (dist >= 5) armed = true;
      }
      const glow = Math.exp(-(t - strikeT) * 0.9);
      capMat.emissiveIntensity = glow * 2.2;
      cap.rotation.z = -t * 0.05;
      // slinger: één zwaai per hartslag, door het midden op de tik
      pend.rotation.z = Math.sin(d.beat * Math.PI) * 0.07;
      // de zon schuift heel langzaam over de muur
      sun.position.x = -2.6 + Math.sin(t * 0.004) * 0.6;
      sun.position.y = 2.9 + Math.cos(t * 0.003) * 0.2;
    },
    dispose() {},
  };
}
