/**
 * Gedeelde 3D-studio voor de mashups: fysieke materialen, omgevingslicht, zachte schaduwen,
 * bloom, korrel en vignet, en een camera die langzaam op de adem meebeweegt.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { Drive } from '../Digitaal';

export interface Mashup {
  update(d: Drive, t: number, dt: number): void;
  /** Korte regel onder het beeld: wat de machine nu doet. */
  status(): string;
  setSound(on: boolean): void;
  restart?(): void;
  dispose(): void;
}

const FINISH = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, vignette: { value: 0.55 }, grain: { value: 0.035 }, warmth: { value: 0 } },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 res; uniform float vignette; uniform float grain; uniform float warmth;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float d = length(c);
      vec2 off = c * 0.0035 * d;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(1.0, smoothstep(0.95, 0.18, d), vignette);
      col = mix(col, col * vec3(1.06, 1.0, 0.92), warmth);
      float n = hash(floor(vUv * res) + fract(time * 13.7) * 91.0) - 0.5;
      col += n * grain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.01, 60);
  readonly composer: EffectComposer;
  readonly bloom: UnrealBloomPass;
  readonly finish: ShaderPass;
  /** Camerastand in rust; de adem duwt hem een klein stukje naar voren. */
  readonly rig = { pos: new THREE.Vector3(0, 1, 3), target: new THREE.Vector3(), breathe: 0.035, sway: 0.012 };
  private trash: { dispose(): void }[] = [];

  constructor(canvas: HTMLCanvasElement) {
    const r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = r;

    const pmrem = new THREE.PMREMGenerator(r);
    const room = new RoomEnvironment();
    const env = pmrem.fromScene(room, 0.035).texture;
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.55;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    pmrem.dispose();
    this.trash.push(env);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.55, 1.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.finish = new ShaderPass(FINISH);
    this.composer.addPass(this.finish);
  }

  /** Iets dat bij het opruimen weg moet (geometrie, materiaal, textuur). */
  keep<T extends { dispose(): void }>(x: T): T {
    this.trash.push(x);
    return x;
  }

  resize(w: number, h: number) {
    if (w < 2 || h < 2) return;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const pr = this.renderer.getPixelRatio();
    this.finish.uniforms.res.value.set(w * pr, h * pr);
  }

  render(level: number, t: number) {
    const { pos, target, breathe, sway } = this.rig;
    const dir = target.clone().sub(pos);
    const dist = dir.length();
    dir.normalize();
    const side = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
    this.camera.position
      .copy(pos)
      .addScaledVector(dir, (level - 0.5) * breathe * dist)
      .addScaledVector(side, Math.sin(t * 0.07) * sway * dist)
      .addScaledVector(new THREE.Vector3(0, 1, 0), Math.sin(t * 0.05 + 1) * sway * 0.5 * dist);
    this.camera.lookAt(target);
    this.finish.uniforms.time.value = t;
    this.composer.render();
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh || (o as THREE.Points).isPoints || (o as THREE.Sprite).isSprite) {
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mt) => {
          if (!mt) return;
          Object.values(mt).forEach((v) => (v as THREE.Texture)?.isTexture && (v as THREE.Texture).dispose());
          mt.dispose();
        });
      }
    });
    this.trash.forEach((x) => x.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}

// ---------------------------------------------------------------------------- texturen (procedureel, canvas)

export type CanvasTex = { tex: THREE.CanvasTexture; canvas: HTMLCanvasElement; g: CanvasRenderingContext2D };

export function canvasTex(w: number, h: number, draw?: (g: CanvasRenderingContext2D, w: number, h: number) => void, o: { color?: boolean; repeat?: [number, number] } = {}): CanvasTex {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  draw?.(g, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = o.color === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  if (o.repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...o.repeat);
  }
  return { tex, canvas, g };
}

/** Kleine pseudo-random generator, zodat elk scherm er elke keer hetzelfde uitziet. */
export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Fijne korrel over een vlak (steen, pleister, emaille). */
export function grain(g: CanvasRenderingContext2D, w: number, h: number, amount: number, seed = 3) {
  const img = g.getImageData(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amount;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Wolkige vlekken: grote zachte cirkels. */
export function blotches(g: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, alpha: number, seed = 5) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = r() * h;
    const rad = (0.05 + r() * 0.25) * Math.max(w, h);
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, color.replace('A', String(alpha * r())));
    gr.addColorStop(1, color.replace('A', '0'));
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

export function stoneTex(base: string, seed = 7, size = 1024) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 40, 'rgba(255,255,255,A)', 0.05, seed);
    blotches(g, w, h, 40, 'rgba(0,0,0,A)', 0.08, seed + 1);
    const r = rng(seed + 2);
    for (let i = 0; i < 9000; i++) {
      const l = r();
      g.fillStyle = l < 0.5 ? `rgba(0,0,0,${0.15 + r() * 0.35})` : `rgba(255,255,255,${0.08 + r() * 0.25})`;
      const s = 0.6 + r() * 2.2;
      g.fillRect(r() * w, r() * h, s, s);
    }
    grain(g, w, h, 10, seed + 3);
  });
}

export function plasterTex(base: string, seed = 11, size = 1024) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    blotches(g, w, h, 70, 'rgba(120,100,80,A)', 0.07, seed);
    blotches(g, w, h, 50, 'rgba(255,255,250,A)', 0.08, seed + 1);
    grain(g, w, h, 14, seed + 2);
  });
}

/** Tegels met voegen. Geeft kleur en hoogte (voor bumpMap). */
export function tileTex(o: { cols: number; rows: number; color: string; grout: string; vary?: number; seed?: number; offset?: boolean; size?: number }) {
  const size = o.size ?? 1024;
  const r = rng(o.seed ?? 13);
  const cw = size / o.cols;
  const rh = size / o.rows;
  const gap = Math.max(2, size * 0.006);
  const rects: [number, number, number, number, number][] = [];
  for (let y = 0; y < o.rows; y++)
    for (let x = -1; x < o.cols; x++) {
      const ox = o.offset && y % 2 ? cw / 2 : 0;
      rects.push([x * cw + ox, y * rh, cw, rh, (r() - 0.5) * (o.vary ?? 0.08)]);
    }
  const color = canvasTex(size, size, (g) => {
    g.fillStyle = o.grout;
    g.fillRect(0, 0, size, size);
    for (const [x, y, w, h, v] of rects) {
      g.fillStyle = o.color;
      g.fillRect(x + gap / 2, y + gap / 2, w - gap, h - gap);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(x + gap / 2, y + gap / 2, w - gap, h - gap);
      // glazuur: lichte rand bovenaan
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, 'rgba(255,255,255,0.10)');
      gr.addColorStop(0.15, 'rgba(255,255,255,0)');
      gr.addColorStop(1, 'rgba(0,0,0,0.06)');
      g.fillStyle = gr;
      g.fillRect(x + gap / 2, y + gap / 2, w - gap, h - gap);
    }
    grain(g, size, size, 6);
  });
  const bump = canvasTex(
    size,
    size,
    (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, size, size);
      g.filter = `blur(${gap * 0.6}px)`;
      g.fillStyle = '#fff';
      for (const [x, y, w, h] of rects) g.fillRect(x + gap / 2, y + gap / 2, w - gap, h - gap);
    },
    { color: false },
  );
  for (const t of [color.tex, bump.tex]) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return { map: color.tex, bump: bump.tex };
}

export function woodTex(base: string, dark: string, seed = 17, size = 1024) {
  return canvasTex(size, size, (g, w, h) => {
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const r = rng(seed);
    for (let i = 0; i < 260; i++) {
      const x0 = r() * w;
      const amp = 4 + r() * 18;
      const fr = 0.002 + r() * 0.006;
      g.strokeStyle = dark;
      g.globalAlpha = 0.05 + r() * 0.18;
      g.lineWidth = 0.6 + r() * 3;
      g.beginPath();
      for (let y = 0; y <= h; y += 8) g.lineTo(x0 + Math.sin(y * fr + i) * amp + Math.sin(y * fr * 3.1) * amp * 0.3, y);
      g.stroke();
    }
    g.globalAlpha = 1;
    grain(g, w, h, 8, seed + 1);
  });
}

/** Geborsteld metaal als ruwheidskaart: fijne strepen in één richting. */
export function brushedTex(seed = 19, size = 512, vertical = false) {
  return canvasTex(
    size,
    size,
    (g, w, h) => {
      g.fillStyle = '#6a6a6a';
      g.fillRect(0, 0, w, h);
      const r = rng(seed);
      for (let i = 0; i < 3000; i++) {
        const c = 70 + r() * 90;
        g.strokeStyle = `rgba(${c},${c},${c},0.35)`;
        g.lineWidth = r() * 1.4;
        const p = r() * (vertical ? w : h);
        const a = r() * (vertical ? h : w);
        const len = 40 + r() * 300;
        g.beginPath();
        if (vertical) {
          g.moveTo(p, a);
          g.lineTo(p, a + len);
        } else {
          g.moveTo(a, p);
          g.lineTo(a + len, p);
        }
        g.stroke();
      }
    },
    { color: false, repeat: [1, 1] },
  );
}

/** Zachte ronde vlek: voor stoom, waterdruppels en lichtvlekken. */
export function softDot(size = 128, inner = 'rgba(255,255,255,1)') {
  return canvasTex(size, size, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, w);
  });
}

/** Valse reflectiestreep voor glas: een diagonale, zachte lichtband. */
export function glareTex() {
  return canvasTex(512, 512, (g, w, h) => {
    g.translate(w / 2, h / 2);
    g.rotate(-0.6);
    const gr = g.createLinearGradient(-w, 0, w, 0);
    gr.addColorStop(0.3, 'rgba(255,255,255,0)');
    gr.addColorStop(0.42, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.47, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.53, 'rgba(255,255,255,0.3)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-w, -h, w * 2, h * 2);
  });
}

// ---------------------------------------------------------------------------- materialen

export const mat = {
  enamel: (color: THREE.ColorRepresentation, rough = 0.34) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.9, clearcoatRoughness: 0.1 }),
  chrome: (rough = 0.06) => new THREE.MeshStandardMaterial({ color: 0xf4f4f4, metalness: 1, roughness: rough }),
  steel: (rough = 0.32, roughnessMap?: THREE.Texture) => new THREE.MeshStandardMaterial({ color: 0xd2d5d8, metalness: 1, roughness: rough, ...(roughnessMap ? { roughnessMap } : {}) }),
  brass: (rough = 0.22) => new THREE.MeshStandardMaterial({ color: 0xd6a85a, metalness: 1, roughness: rough }),
  rubber: (color: THREE.ColorRepresentation = 0x1c1c1e) => new THREE.MeshStandardMaterial({ color, roughness: 0.85 }),
  plastic: (color: THREE.ColorRepresentation, rough = 0.45) => new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
  /** Echt (transmissief) glas: breekt wat erachter staat en weerkaatst de kamer. */
  glass: (tint: THREE.ColorRepresentation = 0xffffff, thickness = 0.004) =>
    new THREE.MeshPhysicalMaterial({ color: tint, metalness: 0, roughness: 0.02, transmission: 1, thickness, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.02, specularIntensity: 1 }),
  /** Doorzichtig glas zonder transmissie (laat ook transparante dingen erachter zien). */
  thinGlass: (tint: THREE.ColorRepresentation = 0x111111, opacity = 0.25) =>
    new THREE.MeshPhysicalMaterial({ color: tint, roughness: 0.03, transparent: true, opacity, clearcoat: 1, clearcoatRoughness: 0.02, depthWrite: false }),
};

/** Alle meshes in een groep werpen en ontvangen schaduw. */
export function shadows(root: THREE.Object3D, cast = true, receive = true) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

/** Een spotlamp met zachte schaduw. */
export function keyLight(color: THREE.ColorRepresentation, intensity: number, pos: [number, number, number], target: [number, number, number], angle = 0.5, mapSize = 2048) {
  const s = new THREE.SpotLight(color, intensity, 0, angle, 0.85, 1.6);
  s.position.set(...pos);
  s.target.position.set(...target);
  s.castShadow = true;
  s.shadow.mapSize.set(mapSize, mapSize);
  s.shadow.bias = -0.0002;
  s.shadow.normalBias = 0.01;
  s.shadow.radius = 6;
  return s;
}

/** Tekst op een canvas: voor displays, wijzerplaten en labels. */
export function font(px: number, family: 'sans' | 'mono' | 'serif' = 'sans', weight = 400) {
  const f = family === 'mono' ? '"Geist Mono", ui-monospace, monospace' : family === 'serif' ? 'Georgia, "Times New Roman", serif' : 'Geist, system-ui, sans-serif';
  return `${weight} ${px}px ${f}`;
}

export const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
