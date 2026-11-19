import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { DEVICES, WALLS, type DeviceId, type LabState, type Wall } from '../../lib/huiskamer2Types';
import { CLOCK_POS, DEVICE_POS, DOOR_POS, RADIO_POS, ROOM, earActive, type Person2, type Sim2 } from './sim2';

export type RoomView = {
  sim: Sim2;
  lab: LabState;
  targetPct: (p: Person2) => number;
  selected: string | null;
  onSelect: (id: string | null) => void;
};

const H = ROOM / 2;
const X = (x: number) => x - H;
const Z = (y: number) => y - H;
const WALL_H = 2.6;

export function zoneColor(pct: number, target: number, out = new THREE.Color()) {
  const d = Math.max(-1, Math.min(1, (pct - target) / 0.2));
  if (d < 0) return out.setHSL((40 + -d * 150) / 360, 0.7, 0.55 + -d * 0.05);
  return out.setHSL((40 - d * 52 + 360) % 360 / 360, 0.85, 0.56);
}

const LAYER_COLOR: Record<string, number> = { stil: 0x9a958c, kalm: 0x5fd1c3, neutraal: 0xcfc6b4, activerend: 0xff8a3d };

function plankTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5a4634';
  g.fillRect(0, 0, 1024, 1024);
  const rows = 16;
  for (let r = 0; r < rows; r++) {
    let x = -Math.random() * 300;
    while (x < 1024) {
      const w = 220 + Math.random() * 260;
      const l = 30 + Math.random() * 10;
      g.fillStyle = `hsl(${26 + Math.random() * 6} 28% ${l}%)`;
      g.fillRect(x + 1, r * 64 + 1, w - 2, 62);
      g.globalAlpha = 0.08;
      for (let k = 0; k < 6; k++) {
        g.fillStyle = Math.random() > 0.5 ? '#000' : '#fff';
        g.fillRect(x, r * 64 + Math.random() * 60, w, 1);
      }
      g.globalAlpha = 1;
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

type DeviceObj = { group: THREE.Group; update: (on: boolean, t: number, dt: number) => void };

function std(color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
}
function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function steam(group: THREE.Group, y: number) {
  const puffs: THREE.Mesh[] = [];
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  for (let i = 0; i < 8; i++) {
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 8), mat.clone());
    p.userData.phase = i / 8;
    group.add(p);
    puffs.push(p);
  }
  return (on: boolean, t: number) => {
    for (const p of puffs) {
      const ph = (t * 0.6 + p.userData.phase) % 1;
      p.position.set(Math.sin(ph * 9 + p.userData.phase * 6) * 0.04, y + ph * 0.6, 0);
      p.scale.setScalar(0.6 + ph * 1.8);
      (p.material as THREE.MeshBasicMaterial).opacity = on ? (1 - ph) * 0.35 : 0;
    }
  };
}

function led(color: number) {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: color, emissiveIntensity: 0 });
}

function buildDevice(id: DeviceId): DeviceObj {
  const g = new THREE.Group();
  const p = DEVICE_POS[id];
  g.position.set(X(p.x), 0, Z(p.y));
  const top = 0.92;
  switch (id) {
    case 'koffiemachine': {
      g.add(mesh(new THREE.BoxGeometry(0.3, 0.42, 0.32), std(0x1d1d1f, { metalness: 0.4, roughness: 0.35 }), 0, top + 0.21, 0.02));
      g.add(mesh(new THREE.CylinderGeometry(0.045, 0.035, 0.08, 16), std(0xf1ece2), 0, top + 0.04, 0.12));
      const l = led(0xff3b2f);
      g.add(mesh(new THREE.SphereGeometry(0.015, 8, 8), l, 0.1, top + 0.36, 0.18));
      const s = steam(g, top + 0.1);
      return { group: g, update: (on, t) => { l.emissiveIntensity = on ? 2 + Math.sin(t * 8) : 0; s(on, t); } };
    }
    case 'waterkoker': {
      const body = mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.26, 24), std(0xe9e4da, { roughness: 0.3 }), 0, top + 0.13, 0.05);
      g.add(body);
      const handle = mesh(new THREE.TorusGeometry(0.07, 0.015, 8, 16, Math.PI), std(0x2a2a2a), 0.12, top + 0.15, 0.05);
      handle.rotation.z = -Math.PI / 2;
      g.add(handle);
      const ring = led(0x3aa0ff);
      g.add(mesh(new THREE.TorusGeometry(0.115, 0.008, 6, 32), ring, 0, top + 0.02, 0.05)).rotation.x = Math.PI / 2;
      const s = steam(g, top + 0.3);
      let since = 0;
      return {
        group: g,
        update: (on, t, dt) => {
          since = on ? since + dt : 0;
          ring.emissiveIntensity = on ? 2.5 : 0;
          body.position.x = on && since > 12 ? Math.sin(t * 60) * 0.003 * Math.min(1, (since - 12) / 10) : 0;
          s(on && since > 10, t);
        },
      };
    }
    case 'magnetron': {
      g.add(mesh(new THREE.BoxGeometry(0.55, 0.32, 0.38), std(0xd9d4ca), 0, top + 0.16, 0.02));
      const win = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffb050, emissiveIntensity: 0 });
      g.add(mesh(new THREE.PlaneGeometry(0.34, 0.2), win, -0.06, top + 0.16, 0.215));
      const light = new THREE.PointLight(0xffb050, 0, 1.5);
      light.position.set(0, top + 0.16, 0.35);
      g.add(light);
      return { group: g, update: (on, t) => { win.emissiveIntensity = on ? 1.6 + Math.sin(t * 3) * 0.2 : 0; light.intensity = on ? 0.6 : 0; } };
    }
    case 'vaatwasser': {
      const b = mesh(new THREE.BoxGeometry(0.6, 0.86, 0.6), std(0xe8e5df, { roughness: 0.35 }), 0.02, 0.43, 0);
      g.add(b);
      const strip = led(0x6fd6ff);
      const sm = mesh(new THREE.BoxGeometry(0.02, 0.02, 0.4), strip, 0.33, 0.8, 0);
      g.add(sm);
      return { group: g, update: (on, t) => { strip.emissiveIntensity = on ? 1.5 + Math.sin(t * 0.8) * 0.8 : 0; } };
    }
    case 'wasmachine': {
      g.add(mesh(new THREE.BoxGeometry(0.6, 0.86, 0.6), std(0xf2f0eb, { roughness: 0.35 }), 0.02, 0.43, 0));
      const door = mesh(new THREE.TorusGeometry(0.18, 0.03, 12, 32), std(0x9aa0a6, { metalness: 0.6, roughness: 0.3 }), 0.33, 0.42, 0);
      door.rotation.y = Math.PI / 2;
      g.add(door);
      const drum = new THREE.Group();
      drum.position.set(0.32, 0.42, 0);
      drum.rotation.y = Math.PI / 2;
      const glass = new THREE.MeshStandardMaterial({ color: 0x223344, emissive: 0x88ccff, emissiveIntensity: 0, transparent: true, opacity: 0.8 });
      drum.add(mesh(new THREE.CircleGeometry(0.16, 32), glass));
      for (let i = 0; i < 3; i++) {
        const fin = mesh(new THREE.BoxGeometry(0.03, 0.12, 0.01), std(0xffffff));
        fin.position.set(Math.cos((i * Math.PI * 2) / 3) * 0.09, Math.sin((i * Math.PI * 2) / 3) * 0.09, 0.005);
        fin.rotation.z = (i * Math.PI * 2) / 3;
        drum.add(fin);
      }
      g.add(drum);
      let spin = 0;
      let since = 0;
      return {
        group: g,
        update: (on, _t, dt) => {
          since = on ? since + dt : 0;
          const target = on ? 1 + Math.min(1, since / 40) * 20 : 0;
          spin += (target - spin) * Math.min(1, dt * 0.8);
          drum.rotation.z += spin * dt;
          glass.emissiveIntensity = on ? 0.3 : 0;
          g.position.z = Z(DEVICE_POS.wasmachine.y) + (on && since > 25 ? Math.sin(_t * 50) * 0.004 : 0);
        },
      };
    }
    case 'robotstofzuiger': {
      const r = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.08, 32), std(0x222428, { metalness: 0.3, roughness: 0.4 }), 0, 0.04, 0);
      g.add(r);
      const l = led(0x5cff8a);
      g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 16), l, 0, 0.085, 0.06));
      const dock = mesh(new THREE.BoxGeometry(0.3, 0.12, 0.08), std(0x2c2c2c), 0, 0.06, 0.2);
      dock.userData.dock = true;
      g.add(dock);
      return { group: g, update: (on, t) => { l.emissiveIntensity = on ? 1.5 + Math.sin(t * 4) : 0.2; } };
    }
  }
}

export default function Room3D({ viewRef }: { viewRef: React.MutableRefObject<RoomView> }) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const labels = new CSS2DRenderer();
    labels.domElement.style.position = 'absolute';
    labels.domElement.style.inset = '0';
    labels.domElement.style.pointerEvents = 'none';
    host.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e0c0a);
    scene.fog = new THREE.Fog(0x0e0c0a, 16, 30);
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(6.2, 7.2, 8.0);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.6, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.46;
    controls.minDistance = 5;
    controls.maxDistance = 22;

    // ---- kamer ----
    const floor = mesh(new THREE.PlaneGeometry(ROOM, ROOM), new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.82 }));
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    scene.add(floor);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xe6ddcf, roughness: 0.95 });
    const wallDefs: Record<Wall, { pos: [number, number, number]; rotY: number }> = {
      noord: { pos: [0, WALL_H / 2, -H], rotY: 0 },
      zuid: { pos: [0, WALL_H / 2, H], rotY: Math.PI },
      west: { pos: [-H, WALL_H / 2, 0], rotY: Math.PI / 2 },
      oost: { pos: [H, WALL_H / 2, 0], rotY: -Math.PI / 2 },
    };
    const strips: Record<Wall, { mat: THREE.MeshStandardMaterial; light: THREE.PointLight }> = {} as never;
    for (const w of WALLS) {
      const d = wallDefs[w];
      const wall = mesh(new THREE.PlaneGeometry(ROOM, WALL_H), wallMat);
      wall.position.set(...d.pos);
      wall.rotation.y = d.rotY;
      wall.castShadow = false;
      scene.add(wall); // alleen de binnenkant rendert: de muur aan camerazijde verdwijnt vanzelf
      // plint + lichtstrook
      const plint = mesh(new THREE.BoxGeometry(ROOM, 0.08, 0.02), std(0xece6da));
      plint.position.set(d.pos[0], 0.04, d.pos[2]);
      plint.rotation.y = d.rotY;
      plint.translateZ(0.011);
      scene.add(plint);
      const mat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffc070, emissiveIntensity: 0 });
      const strip = new THREE.Mesh(new THREE.BoxGeometry(ROOM - 0.4, 0.03, 0.02), mat);
      strip.position.set(d.pos[0], 1.05, d.pos[2]);
      strip.rotation.y = d.rotY;
      strip.translateZ(0.02);
      scene.add(strip);
      const light = new THREE.PointLight(0xffc070, 0, 6, 1.6);
      light.position.set(d.pos[0] * 0.85, 1.1, d.pos[2] * 0.85);
      scene.add(light);
      strips[w] = { mat, light };
    }
    // keukenblok
    const counter = mesh(new THREE.BoxGeometry(4.4, 0.9, 0.62), std(0x6b5b4b, { roughness: 0.7 }), X(4), 0.45, Z(0.32));
    scene.add(counter);
    scene.add(mesh(new THREE.BoxGeometry(4.5, 0.04, 0.66), std(0xe7e1d6, { roughness: 0.3 }), X(4), 0.92, Z(0.33)));
    // radio op kastje
    scene.add(mesh(new THREE.BoxGeometry(0.4, 0.6, 0.9), std(0x5a4636), X(RADIO_POS.x), 0.3, Z(RADIO_POS.y)));
    const radio = new THREE.Group();
    radio.position.set(X(RADIO_POS.x), 0.6, Z(RADIO_POS.y));
    radio.add(mesh(new THREE.BoxGeometry(0.22, 0.3, 0.55), std(0x8a6a48, { roughness: 0.5 }), 0, 0.15, 0));
    const cones: THREE.Mesh[] = [];
    for (const dz of [-0.14, 0.14]) {
      const c = mesh(new THREE.CircleGeometry(0.085, 24), std(0x2a2420, { roughness: 0.9 }), -0.112, 0.15, dz);
      c.rotation.y = -Math.PI / 2;
      radio.add(c);
      cones.push(c);
    }
    const dial = led(0xffd28a);
    radio.add(mesh(new THREE.BoxGeometry(0.01, 0.03, 0.18), dial, -0.112, 0.27, 0));
    scene.add(radio);
    // wandklok
    const clock = new THREE.Group();
    clock.position.set(X(CLOCK_POS.x) - 0.04, 1.85, Z(CLOCK_POS.y));
    clock.rotation.y = -Math.PI / 2;
    const face = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.05, 48), std(0xf4efe4, { roughness: 0.6 }));
    face.rotation.x = Math.PI / 2;
    clock.add(face);
    const rim = mesh(new THREE.TorusGeometry(0.28, 0.025, 12, 48), std(0x3a2e24, { metalness: 0.3 }));
    clock.add(rim);
    for (let k = 0; k < 12; k++) {
      const tick = mesh(new THREE.BoxGeometry(0.015, 0.05, 0.01), std(0x333333));
      const a = (k / 12) * Math.PI * 2;
      tick.position.set(Math.sin(a) * 0.23, Math.cos(a) * 0.23, 0.03);
      tick.rotation.z = -a;
      clock.add(tick);
    }
    const mkHand = (len: number, w: number, col: number) => {
      const h = new THREE.Group();
      const m = mesh(new THREE.BoxGeometry(w, len, 0.008), std(col));
      m.position.y = len / 2 - 0.03;
      h.add(m);
      h.position.z = 0.035;
      clock.add(h);
      return h;
    };
    const hourHand = mkHand(0.14, 0.022, 0x222222);
    const secHand = mkHand(0.24, 0.008, 0xc0392b);
    scene.add(clock);
    // deur
    const door = new THREE.Group();
    door.position.set(X(DOOR_POS.x), 0, Z(DOOR_POS.y) - 0.02);
    door.add(mesh(new THREE.BoxGeometry(0.95, 2.1, 0.04), std(0x7b6650, { roughness: 0.6 }), 0, 1.05, 0));
    door.add(mesh(new THREE.SphereGeometry(0.03, 12, 12), std(0xc9a85a, { metalness: 0.8, roughness: 0.3 }), 0.36, 1.0, -0.04));
    scene.add(door);
    // hanglamp
    const lampGroup = new THREE.Group();
    lampGroup.position.set(0, WALL_H - 0.1, 0);
    lampGroup.add(mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.6, 6), std(0x111111), 0, 0, 0));
    const shade = mesh(new THREE.ConeGeometry(0.32, 0.26, 32, 1, true), std(0x1b1b1b, { side: THREE.DoubleSide }), 0, -0.4, 0);
    shade.castShadow = false;
    lampGroup.add(shade);
    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffd9a0, emissiveIntensity: 2 });
    lampGroup.add(new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 16), bulbMat)).position.y = -0.48;
    scene.add(lampGroup);
    const lamp = new THREE.SpotLight(0xffd9a0, 30, 14, Math.PI * 0.46, 0.8, 1.1);
    lamp.position.set(0, WALL_H - 0.15, 0);
    lamp.target.position.set(0, 0, 0);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.bias = -0.0005;
    lamp.shadow.radius = 6;
    scene.add(lamp, lamp.target);
    const hemi = new THREE.HemisphereLight(0xffeedd, 0x2a2018, 0.35);
    scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xfff4e6, 0.3);
    scene.add(ambient);

    const devices = Object.fromEntries(DEVICES.map((id) => [id, buildDevice(id)])) as Record<DeviceId, DeviceObj>;
    const deviceHalo: Record<string, THREE.Mesh> = {};
    for (const id of DEVICES) {
      scene.add(devices[id].group);
      const halo = new THREE.Mesh(
        new THREE.RingGeometry(0.35, 0.42, 48),
        new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0, depthWrite: false }),
      );
      halo.rotation.x = -Math.PI / 2;
      const p = DEVICE_POS[id];
      halo.position.set(X(p.wall === 'west' ? p.x + 0.55 : p.x), 0.01, Z(p.wall === 'noord' ? p.y + 0.6 : p.y));
      scene.add(halo);
      deviceHalo[id] = halo;
    }
    const robotBody = devices.robotstofzuiger.group;

    // ---- zwerm ----
    const groupDisk = new THREE.Mesh(
      new THREE.CircleGeometry(1, 64),
      new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.05, depthWrite: false }),
    );
    groupDisk.rotation.x = -Math.PI / 2;
    groupDisk.position.y = 0.005;
    scene.add(groupDisk);
    const attLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineDashedMaterial({ color: 0xffc070, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.5 }),
    );
    scene.add(attLine);

    type PersonObj = {
      g: THREE.Group;
      body: THREE.Mesh;
      heart: THREE.MeshStandardMaterial;
      ring: THREE.Mesh;
      ringMat: THREE.MeshBasicMaterial;
      sel: THREE.Mesh;
      phones: THREE.Group;
      phoneMat: THREE.MeshStandardMaterial;
      mirrorLed: THREE.MeshStandardMaterial;
      label: HTMLDivElement;
    };
    const people = new Map<string, PersonObj>();
    const pickables: THREE.Object3D[] = [];
    const bodyMat = () => new THREE.MeshStandardMaterial({ color: 0xe9e2d4, roughness: 0.65 });
    for (const p of viewRef.current.sim.persons) {
      const g = new THREE.Group();
      const body = mesh(new THREE.CapsuleGeometry(0.16, 0.8, 6, 16), bodyMat(), 0, 0.6, 0);
      body.userData.pid = p.id;
      g.add(body);
      const head = mesh(new THREE.SphereGeometry(0.12, 20, 20), bodyMat(), 0, 1.32, 0);
      head.userData.pid = p.id;
      g.add(head);
      pickables.push(body, head);
      const heart = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff5a4a, emissiveIntensity: 1 });
      g.add(new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), heart)).position.set(0.03, 0.9, 0.14);
      const phones = new THREE.Group();
      const phoneMat = new THREE.MeshStandardMaterial({ color: 0x9a958c, roughness: 0.4, emissive: 0x000000 });
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.014, 8, 24, Math.PI), phoneMat);
      band.position.y = 1.34;
      phones.add(band);
      for (const sx of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16), phoneMat);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(sx * 0.135, 1.32, 0);
        phones.add(cup);
      }
      const mirrorLed = new THREE.MeshStandardMaterial({ color: 0x110000, emissive: 0xff2244, emissiveIntensity: 0 });
      phones.add(new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), mirrorLed)).position.set(0.158, 1.32, 0);
      g.add(phones);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.6, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.3, 40), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      g.add(ring);
      const sel = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.43, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
      sel.rotation.x = -Math.PI / 2;
      sel.position.y = 0.013;
      g.add(sel);
      const label = document.createElement('div');
      label.className = 'kl-label';
      const lo = new CSS2DObject(label);
      lo.position.set(0, 1.75, 0);
      g.add(lo);
      scene.add(g);
      people.set(p.id, { g, body, heart, ring, ringMat, sel, phones, phoneMat, mirrorLed, label });
    }

    // ---- interactie ----
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let downAt = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (downAt = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return;
      const r = renderer.domElement.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      viewRef.current.onSelect(hit ? (hit.object.userData.pid as string) : null);
    };
    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);

    const resize = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      renderer.setSize(w, h);
      labels.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host);
    resize();

    // ---- animatie ----
    const tmpColor = new THREE.Color();
    const warm = new THREE.Color(0xffc488);
    const cool = new THREE.Color(0xcfe4ff);
    let last = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const { sim, lab, targetPct, selected } = viewRef.current;
      const t = sim.t;
      const room = lab.room;

      // licht
      const lampCol = cool.clone().lerp(warm, room.light.warmth);
      lamp.color.copy(lampCol);
      lamp.intensity = 4 + room.light.brightness * 46;
      bulbMat.emissive.copy(lampCol);
      bulbMat.emissiveIntensity = 0.5 + room.light.brightness * 3;
      hemi.intensity = 0.45 + room.light.brightness * 1.8;
      hemi.color.copy(lampCol);
      for (const w of WALLS) {
        const on = room.light.focus === w;
        const s = strips[w];
        const target = on ? 3 + Math.sin(t * 1.5) * 0.6 : 0;
        s.mat.emissiveIntensity += (target - s.mat.emissiveIntensity) * Math.min(1, dt * 2);
        s.mat.emissive.copy(lampCol);
        s.light.color.copy(lampCol);
        s.light.intensity += ((on ? 5 : 0) - s.light.intensity) * Math.min(1, dt * 2);
      }

      // apparaten
      for (const id of DEVICES) {
        const on = room.devices[id];
        devices[id].update(on, t, dt);
        const halo = deviceHalo[id];
        const m = halo.material as THREE.MeshBasicMaterial;
        m.opacity += ((on && id !== 'robotstofzuiger' ? 0.35 + Math.sin(t * 3) * 0.15 : 0) - m.opacity) * Math.min(1, dt * 3);
        halo.scale.setScalar(1 + ((t * 0.8) % 1) * 0.5);
      }
      if (room.devices.robotstofzuiger) {
        robotBody.children[0].position.set(X(sim.robot.x) - robotBody.position.x, 0.04, Z(sim.robot.y) - robotBody.position.z);
        robotBody.children[1].position.set(robotBody.children[0].position.x, 0.085, robotBody.children[0].position.z);
      } else {
        robotBody.children[0].position.set(0, 0.04, 0);
        robotBody.children[1].position.set(0, 0.085, 0.06);
      }
      // radio pulseert
      const rI = room.radio.mood === 'stilte' ? 0 : room.radio.intensity;
      cones.forEach((c, i) => c.scale.setScalar(1 + rI * 0.12 * Math.max(0, Math.sin(t * 7 + i))));
      dial.emissiveIntensity = rI > 0 ? 1.5 : 0.1;
      // klok
      const beats = room.clock.bpm > 0 ? Math.floor((t * room.clock.bpm) / 60) : Math.floor(t);
      secHand.rotation.z = -(beats % 60) * ((Math.PI * 2) / 60);
      hourHand.rotation.z = -(t / 3600) * Math.PI * 2 - 1.2;

      // zwerm
      const st = sim.stats();
      groupDisk.position.x = X(st.cx);
      groupDisk.position.z = Z(st.cy);
      groupDisk.scale.setScalar(st.radius + 0.55);
      const pts = [new THREE.Vector3(X(st.cx), 0.02, Z(st.cy)), new THREE.Vector3(X(sim.attention.x), 0.02, Z(sim.attention.y))];
      attLine.geometry.setFromPoints(pts);
      attLine.computeLineDistances();
      (attLine.material as THREE.LineDashedMaterial).opacity = Math.min(0.6, sim.attention.w * 0.5);

      for (const p of sim.persons) {
        const o = people.get(p.id)!;
        const pct = sim.pct(p);
        const tp = targetPct(p);
        zoneColor(pct, tp, tmpColor);
        const bob = Math.abs(Math.sin((t * Math.max(0, p.cadence) * Math.PI) / 60)) * 0.03 * Math.min(1, p.cadence / 60);
        o.g.position.set(X(p.x), bob, Z(p.y));
        o.g.rotation.y = -p.heading + Math.PI / 2;
        const beat = (t * p.hr) / 60;
        const pulse = Math.max(0, 1 - (beat % 1) * 3.5);
        o.heart.emissive.copy(tmpColor);
        o.heart.emissiveIntensity = 0.6 + pulse * 3;
        o.ringMat.color.copy(tmpColor);
        o.ring.scale.setScalar(1 + pulse * 0.25);
        o.ringMat.opacity = 0.35 + pulse * 0.5;
        o.sel.visible = selected === p.id;
        const ear = lab.ears[p.id];
        const on = earActive(ear);
        o.phoneMat.color.setHex(on ? LAYER_COLOR[ear!.layer] : 0x55524c);
        o.phoneMat.emissive.setHex(on && ear!.layer !== 'stil' ? LAYER_COLOR[ear!.layer] : 0x000000);
        o.phoneMat.emissiveIntensity = on ? 0.4 : 0;
        o.mirrorLed.emissiveIntensity = on && ear!.mirror !== null ? pulse * 4 : 0;
        const txt = selected === p.id ? `${p.name} <b>${Math.round(pct * 100)}%</b>` : `<b>${Math.round(pct * 100)}</b>`;
        if (o.label.innerHTML !== txt) o.label.innerHTML = txt;
        o.label.style.opacity = selected === p.id ? '1' : '0.7';
      }

      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      controls.dispose();
      renderer.dispose();
      host.innerHTML = '';
    };
  }, [viewRef]);

  return <div ref={hostRef} className="absolute inset-0" />;
}
