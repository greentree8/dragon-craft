// The dragon: a procedural model of rounded, smooth-shaded parts with animated wings, tail, neck and legs, shaped by a "look".
// Faces -Z. `root` sits at the physics hitbox centre.
import * as THREE from 'three';
import { softGeometry } from './soft.js';
import { sweep, lineSweep, membraneGeometry } from './sweep.js';

export const DEFAULT_LOOK = {
  name: 'Ember',
  body: 0x2fa84f, belly: 0xe8d48a, accent: 0xff7a1a, wing: 0xd9402b, eye: 0xffe14d,
  horns: 'short', tail: 'spade', wings: 'bat', wingpairs: 'two', spikes: 'spikes', pattern: 'none', snout: 'short', glow: false,
};

export const LOOK_OPTIONS = {
  horns: ['short', 'long', 'curved', 'none'],
  tail: ['spade', 'club', 'flame', 'plain'],
  wings: ['bat', 'spiky', 'round'],
  wingpairs: ['two', 'four'],
  spikes: ['spikes', 'ridge', 'none'],
  pattern: ['none', 'stripes', 'spots'],
  snout: ['short', 'long'],
};

export const PRESETS = [
  { label: 'Emerald', body: 0x2fa84f, belly: 0xe8d48a, accent: 0xff7a1a, wing: 0xd9402b, eye: 0xffe14d },
  { label: 'Inferno', body: 0xc8321e, belly: 0xffc060, accent: 0xffd23f, wing: 0x6b1a12, eye: 0xffe9a0 },
  { label: 'Frost', body: 0x6fb8e8, belly: 0xf2fbff, accent: 0xb9f0ff, wing: 0x3a6fb0, eye: 0xffffff },
  { label: 'Shadow', body: 0x2b2b3a, belly: 0x55556b, accent: 0xb44dff, wing: 0x3b1f5e, eye: 0xb44dff },
  { label: 'Gold', body: 0xe0a82e, belly: 0xfff0b0, accent: 0xff5a2a, wing: 0xffd86b, eye: 0x7a2a00 },
  { label: 'Cotton Candy', body: 0xff8fc4, belly: 0xfff0f8, accent: 0x7fe0ff, wing: 0xb69cff, eye: 0x3a2a5a },
];

const FINGER_LEN = [1.5, 1.3, 1.05];
const FINGER_ANGLE = [0.4, 0.9, 1.4];
const WING_STYLE = {
  bat: { scallop: [0.3, 0.35], len: 1 },
  spiky: { scallop: [0.5, 0.85], len: 1.15 },
  round: { scallop: [-0.25, -0.15], len: 0.95 },
};

function box(w, h, d, mat, e = 0.72) {
  const m = new THREE.Mesh(softGeometry(w, h, d, e), mat);
  m.castShadow = true;
  return m;
}

function spike(size, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.4, size, 10), mat);
  m.castShadow = true;
  return m;
}

// faint overlapping-scale bump pattern
let scaleBump = null;
function scaleTexture() {
  if (scaleBump) return scaleBump;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  for (let row = 0; row < 4; row++) for (let col = -1; col < 4; col++) {
    const x = col * 16 + (row % 2 ? 8 : 0) + 8, y = row * 16 + 8;
    const gr = g.createRadialGradient(x, y, 1, x, y, 11);
    gr.addColorStop(0, '#fff'); gr.addColorStop(1, '#222');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fill();
  }
  scaleBump = new THREE.CanvasTexture(c);
  scaleBump.wrapS = scaleBump.wrapT = THREE.RepeatWrapping;
  scaleBump.repeat.set(5, 3);
  return scaleBump;
}

function patternTexture(kind) {
  if (kind === 'none') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 32, 32);
  g.fillStyle = kind === 'stripes' ? '#8a8a8a' : '#9a9a9a';
  if (kind === 'stripes') {
    for (let y = 4; y < 32; y += 12) g.fillRect(0, y, 32, 5);
  } else {
    for (const [x, y, r] of [[8, 8, 4], [22, 12, 3], [12, 22, 4], [26, 26, 3], [3, 28, 2]]) {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function nameSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 34px system-ui, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(text, 128, 34);
  g.fillStyle = '#fff'; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, fog: false }));
  s.scale.set(3, 0.75, 1);
  return s;
}

export class Dragon {
  constructor(look = DEFAULT_LOOK) {
    this.look = { ...DEFAULT_LOOK, ...look };
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.root.add(this.pivot);
    this.phase = 0;
    this.walkPhase = 0;
    this.tailSway = 0;
    this.mats = {
      body: new THREE.MeshStandardMaterial({ roughness: 0.55, bumpMap: scaleTexture(), bumpScale: 1.2 }),
      belly: new THREE.MeshStandardMaterial({ roughness: 0.7, bumpMap: scaleTexture(), bumpScale: 0.8 }),
      accent: new THREE.MeshStandardMaterial({ roughness: 0.4 }),
      wing: new THREE.MeshStandardMaterial({ roughness: 0.75, side: THREE.DoubleSide }),
      eye: new THREE.MeshBasicMaterial(),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.9 }),
      claw: new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 0.45 }),
      tooth: new THREE.MeshStandardMaterial({ color: 0xf2ecd8, roughness: 0.4 }),
      flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.1, 0.2) }),
    };
    this.label = null;
    this.setLook(this.look);
  }

  setLook(look) {
    Object.assign(this.look, look);
    const L = this.look, M = this.mats;
    M.body.color.set(L.body);
    M.belly.color.set(L.belly);
    M.accent.color.set(L.accent);
    M.wing.color.set(L.wing);
    M.eye.color.set(L.eye).multiplyScalar(3);
    M.accent.emissive.set(L.glow ? L.accent : 0x000000);
    M.accent.emissiveIntensity = L.glow ? 1.4 : 0;
    if (M.body.map) M.body.map.dispose();
    M.body.map = patternTexture(L.pattern);
    M.body.needsUpdate = true;
    this.build();
    if (this.label) { this.root.remove(this.label); this.label.material.map.dispose(); this.label.material.dispose(); }
    this.label = nameSprite(L.name || 'Dragon');
    this.label.position.y = 2.4;
    this.root.add(this.label);
  }

  clear() {
    while (this.pivot.children.length) {
      const c = this.pivot.children[0];
      this.pivot.remove(c);
      c.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
  }

  dorsal(parent, size, x, y, z) {
    const st = this.look.spikes;
    if (st === 'none') return;
    if (st === 'ridge') {
      const r = box(0.12, size * 0.75, size * 1.3, this.mats.accent);
      r.position.set(x, y - size * 0.1, z);
      parent.add(r);
    } else {
      const s = spike(size, this.mats.accent);
      s.position.set(x, y, z);
      parent.add(s);
    }
  }

  build() {
    this.clear();
    const M = this.mats, L = this.look;
    const pv = this.pivot;
    const add = (parent, geo, mat, x = 0, y = 0, z = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      return m;
    };
    const cone = (parent, r, h, mat, x, y, z, rx = 0, rz = 0, sides = 7) => {
      const m = add(parent, new THREE.ConeGeometry(r, h, sides), mat, x, y, z);
      m.rotation.set(rx, 0, rz);
      return m;
    };

    // ---- torso: deep chest tapering to the hips, with a pale plated belly ----
    const tz = [-1.0, -0.8, -0.45, 0, 0.4, 0.75, 1.0];
    add(pv, sweep(tz.map((z, i) => [0, [0, 0.02, 0.03, 0, -0.01, 0, 0.02][i], z]),
      [[0.16, 0.16], [0.4, 0.38], [0.5, 0.47], [0.47, 0.42], [0.4, 0.38], [0.3, 0.3], [0.16, 0.16]], 18, 0.9), M.body);
    add(pv, sweep(tz.map((z) => [0, -0.14, z * 0.95]),
      [[0.1, 0.1], [0.3, 0.34], [0.38, 0.4], [0.36, 0.37], [0.3, 0.34], [0.22, 0.26], [0.1, 0.1]], 16, 1.6), M.belly);
    for (let i = 0; i < 4; i++) this.dorsal(pv, 0.34 - i * 0.03, 0, 0.5, -0.6 + i * 0.42);

    // ---- neck (chain of 4, tapering) + head ----
    this.neck = [];
    let parent = pv;
    let at = new THREE.Vector3(0, 0.18, -0.85);
    for (let i = 0; i < 4; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const r = 0.31 - i * 0.03;
      add(g, sweep([[0, 0, 0.04], [0, 0, -0.18], [0, 0, -0.42], [0, 0, -0.68]],
        [[r * 0.8, r * 0.8], [r, r], [r * 0.95, r * 0.95], [r * 0.8, r * 0.8]], 14, 1.2), M.body);
      add(g, sweep([[0, -r * 0.4, 0.0], [0, -r * 0.42, -0.34], [0, -r * 0.4, -0.66]],
        [[r * 0.55, r * 0.7], [r * 0.6, r * 0.75], [r * 0.5, r * 0.65]], 10, 1.6), M.belly);
      this.dorsal(g, 0.22 - i * 0.015, 0, r + 0.02, -0.34);
      this.neck.push(g);
      parent = g;
      at = new THREE.Vector3(0, 0.02, -0.6);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.02, -0.62);
    parent.add(head);
    this.head = head;
    const long = L.snout === 'long';
    const sl = long ? 1.0 : 0.72;
    const tipZ = -(0.55 + 0.72 * sl);
    add(head, sweep([[0, 0, 0.12], [0, 0.03, -0.05], [0, 0.03, -0.3], [0, 0, -0.55], [0, -0.04, -0.55 - 0.3 * sl], [0, -0.06, -0.55 - 0.55 * sl], [0, -0.07, tipZ]],
      [[0.14, 0.14], [0.3, 0.27], [0.34, 0.29], [0.24, 0.2], [0.19, 0.15], [0.16, 0.12], [0.12, 0.09]], 16, 1.2), M.body);
    // lower jaw hinges at the back of the mouth and opens when breathing
    const jaw = new THREE.Group();
    jaw.position.set(0, -0.13, -0.25);
    head.add(jaw);
    this.jaw = jaw;
    const jl = Math.abs(tipZ) - 0.3;
    add(jaw, sweep([[0, 0, 0.02], [0, -0.03, -jl * 0.3], [0, -0.05, -jl * 0.65], [0, -0.06, -jl]],
      [[0.19, 0.07], [0.17, 0.07], [0.13, 0.055], [0.08, 0.04]], 12, 1.4), M.belly);
    for (let k = 0; k < 5; k++) {
      const z = -0.38 - k * (jl - 0.45) / 4;
      for (const sx of [-1, 1]) {
        cone(head, 0.022, 0.09, M.tooth, sx * (0.125 - k * 0.012), -0.17, z - 0.2 * 0, Math.PI, 0, 6);
        if (k % 2 === 0) cone(jaw, 0.02, 0.07, M.tooth, sx * (0.1 - k * 0.012), 0.02, z + 0.05, 0, 0, 6);
      }
    }
    for (const s of [-1, 1]) {
      add(head, softGeometry(0.15, 0.14, 0.17, 1), M.eye, 0.27 * s, 0.07, -0.22);
      add(head, softGeometry(0.035, 0.11, 0.05, 1), M.dark, 0.335 * s, 0.07, -0.23);
      const brow = add(head, softGeometry(0.2, 0.08, 0.3, 0.8), M.body, 0.21 * s, 0.17, -0.2);
      brow.rotation.z = -0.25 * s;
      add(head, softGeometry(0.05, 0.04, 0.05, 1), M.dark, 0.06 * s, -0.02, tipZ + 0.1);
      cone(head, 0.05, 0.28, M.accent, 0.33 * s, -0.03, 0.12, Math.PI / 2 + 0.2, -0.5 * s, 8); // cheek frill
      this.horn(head, s, L.horns);
    }
    this.mouthZ = tipZ - 0.1;
    this.dorsal(head, 0.28, 0, 0.3, -0.05);

    // ---- tail (chain of 9, tapering to a point) ----
    this.tail = [];
    parent = pv;
    at = new THREE.Vector3(0, 0.05, 0.85);
    const SEG = 9;
    for (let i = 0; i < SEG; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const t = i / (SEG - 1);
      const r = 0.26 * (1 - t * 0.82) + 0.03;
      add(g, sweep([[0, 0, -0.04], [0, 0, 0.2], [0, 0, 0.45], [0, 0, 0.7]],
        [[r * 0.9, r * 0.9], [r, r], [r * 0.94, r * 0.94], [r * 0.82, r * 0.82]], 12, 1.2), M.body);
      if (i < 6) add(g, sweep([[0, -r * 0.42, 0], [0, -r * 0.42, 0.34], [0, -r * 0.42, 0.66]],
        [[r * 0.55, r * 0.6], [r * 0.6, r * 0.62], [r * 0.5, r * 0.55]], 8, 1.6), M.belly);
      if (i < 7) this.dorsal(g, 0.26 * (1 - t) + 0.08, 0, r + 0.02, 0.28);
      this.tail.push(g);
      parent = g;
      at = new THREE.Vector3(0, 0, 0.58);
    }
    this.tailTip(parent, L.tail);

    // ---- legs: thigh, back-bending shin, foot with claws (rear legs are bigger) ----
    this.legs = [];
    for (const [x, z, rear] of [[0.4, -0.55, 0], [-0.4, -0.55, 0], [0.4, 0.6, 1], [-0.4, 0.6, 1]]) {
      const g = new THREE.Group();
      g.position.set(x, -0.3, z);
      const tr = rear ? 0.22 : 0.17, k = rear ? 1.15 : 1;
      add(g, sweep([[0, 0.08, 0], [0, -0.1, -0.04], [0, -0.3, -0.1]], [[tr, tr * 1.15], [tr * 0.95, tr], [tr * 0.6, tr * 0.6]], 12, 1.4), M.body);
      add(g, sweep([[0, -0.3, -0.1], [0, -0.5, 0.05], [0, -0.74, 0.04]], [[0.1 * k, 0.1 * k], [0.075 * k, 0.075 * k], [0.06, 0.06]], 10, 1.6), M.body);
      add(g, sweep([[0, -0.74, 0.04], [0, -0.82, -0.12], [0, -0.85, -0.3]], [[0.085, 0.06], [0.11, 0.05], [0.09, 0.04]], 10, 1.6), M.body);
      for (const tx of [-0.07, 0, 0.07]) cone(g, 0.026, 0.13, M.claw, tx, -0.85, -0.37, -Math.PI / 2, 0, 6);
      pv.add(g);
      this.legs.push(g);
    }

    // ---- wings: tapered arm bones, finger bones fanning back, and a sagging membrane between them ----
    this.wings = [];
    const style = WING_STYLE[L.wings] || WING_STYLE.bat;
    // two wings, or four: a second, smaller pair sits behind the first and beats a little later
    const pairs = L.wingpairs === 'four' ? [{ y: 0.3, z: -0.3, k: 1, delay: 0 }, { y: 0.24, z: 0.42, k: 0.82, delay: 0.8 }] : [{ y: 0.3, z: -0.25, k: 1, delay: 0 }];
    for (const pair of pairs) for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.4 * s, pair.y, pair.z);
      shoulder.scale.set(s * pair.k, pair.k, pair.k); // the left wing is a mirrored copy
      pv.add(shoulder);
      add(shoulder, lineSweep([0, 0, 0], [1.5, 0, 0], (t) => [0.15 * (1 - t) + 0.055 * t, 0.13 * (1 - t) + 0.05 * t], 7, 10, 0.8), M.body);
      add(shoulder, softGeometry(0.22, 0.2, 0.22, 1), M.accent, 1.48, 0, 0);
      const elbow = new THREE.Group();
      elbow.position.x = 1.5;
      shoulder.add(elbow);
      add(elbow, lineSweep([0, 0, 0], [1.6, 0, 0], (t) => [0.075 * (1 - t) + 0.045 * t, 0.065 * (1 - t) + 0.04 * t], 6, 8, 0.8), M.body);
      cone(elbow, 0.03, 0.2, M.claw, 1.58, 0.02, -0.16, -Math.PI / 2, 0, 6); // thumb claw
      const fingers = [];
      const tips = [];
      for (let f = 0; f < 3; f++) {
        const len = FINGER_LEN[f] * style.len, ang = FINGER_ANGLE[f];
        const fg = new THREE.Group();
        fg.position.x = 1.55;
        fg.rotation.y = -ang;
        add(fg, lineSweep([0, 0, 0], [len, 0, 0], (t) => [0.05 * (1 - t) + 0.012 * t, 0.045 * (1 - t) + 0.012 * t], 5, 7, 0.8), M.accent);
        elbow.add(fg);
        fingers.push(fg);
        tips.push([1.55 + len * Math.cos(ang), len * Math.sin(ang)]);
      }
      const scallop = (p, q) => [(p[0] + q[0]) / 2 - style.scallop[0], (p[1] + q[1]) / 2 - style.scallop[1]];
      const mem2 = new THREE.Mesh(membraneGeometry([[0, 0], [1.55, 0], tips[0], scallop(tips[0], tips[1]), tips[1], scallop(tips[1], tips[2]), tips[2], [0.25, 0.95]]), M.wing);
      mem2.position.set(0, -0.02, 0.1);
      mem2.castShadow = true;
      elbow.add(mem2);
      const mem1 = new THREE.Mesh(membraneGeometry([[0, 0], [1.5, 0], [1.4, 0.8], [0.8, 1.05], [0, 0.95]]), M.wing);
      mem1.position.set(0, -0.02, 0.1);
      mem1.castShadow = true;
      shoulder.add(mem1);
      this.wings.push({ shoulder, elbow, fingers, mem1, mem2, s, delay: pair.delay });
    }
  }

  horn(head, s, kind) {
    const M = this.mats;
    if (kind === 'none') return;
    const paths = {
      short: [[0, 0, 0], [0.02, 0.13, 0.06], [0.05, 0.25, 0.2]],
      long: [[0, 0, 0], [0.03, 0.22, 0.1], [0.08, 0.4, 0.36], [0.16, 0.48, 0.72]],
      curved: [[0, 0, 0], [0.1, 0.14, 0.08], [0.22, 0.2, -0.02], [0.31, 0.1, -0.12], [0.3, -0.04, -0.14]],
    };
    const path = paths[kind] || paths.short;
    const r0 = kind === 'long' ? 0.075 : 0.085;
    const radii = path.map((_, i) => { const t = i / (path.length - 1); return [r0 * (1 - t * 0.92), r0 * (1 - t * 0.92)]; });
    const h = new THREE.Mesh(sweep(path.map(([x, y, z]) => [x * s, y, z]), radii, 10, 1.2), M.accent);
    h.position.set(0.17 * s, 0.22, -0.05);
    h.castShadow = true;
    head.add(h);
  }

  tailTip(parent, kind) {
    const M = this.mats;
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
    if (kind === 'club') {
      add(softGeometry(0.5, 0.5, 0.55, 0.9), M.accent, 0, 0, 0.78);
      for (const s of [-1, 1]) {
        const sp = add(new THREE.ConeGeometry(0.1, 0.32, 8), M.accent, 0.36 * s, 0, 0.78);
        sp.rotation.z = -(Math.PI / 2) * s;
      }
    } else if (kind === 'flame') {
      for (const [dx, dy, dz, sz] of [[0, 0.05, 0.75, 0.7], [0.12, 0.2, 0.7, 0.45], [-0.12, 0.15, 0.68, 0.5]]) {
        const f = add(new THREE.ConeGeometry(0.17, sz, 10), M.flame, dx, dy, dz + sz / 2);
        f.rotation.x = Math.PI / 2;
      }
    } else if (kind === 'plain') {
      add(sweep([[0, 0, 0.55], [0, 0, 0.8], [0, 0, 1.05], [0, 0, 1.3]], [[0.13, 0.13], [0.1, 0.1], [0.06, 0.06], [0.015, 0.015]], 10, 1.2), M.body);
    } else {
      // spade: a flat leaf-shaped blade
      add(sweep([[0, 0, 0.5], [0, 0, 0.75], [0, 0, 1.0], [0, 0, 1.25], [0, 0, 1.45]],
        [[0.05, 0.05], [0.2, 0.045], [0.3, 0.045], [0.16, 0.035], [0.02, 0.02]], 12, 1.2), M.accent);
    }
  }

  // state: { flying, speed, vy, boosting, yaw, pitch, roll, lookYaw, lookPitch, breathing }
  update(dt, s) {
    const pv = this.pivot;
    pv.rotation.set(s.pitch, s.yaw, s.roll, 'YXZ');
    const t = performance.now() / 1000;

    // wing flap
    const flapRate = s.flying ? (s.boosting ? 11 : s.vy > 1 ? 9 : s.speed < 2 ? 6.5 : 4.5) : 1.4;
    this.phase += dt * flapRate;
    let spread = 1; // 1 = open, 0 = folded
    if (!s.flying) spread = 0.12;
    else if (s.vy < -3 && s.speed > 8) spread = 0.85; // glide
    this._spread = THREE.MathUtils.lerp(this._spread ?? 1, spread, 1 - Math.exp(-8 * dt));
    const sp = this._spread;
    const gliding = s.flying && s.vy < -3 && s.speed > 8;
    const amp = gliding ? 0.08 : s.flying ? 0.62 : 0.06;
    const flap = Math.sin(this.phase * Math.PI * 2 * 0.5);
    for (const w of this.wings) {
      // the left wing is a mirrored copy (scale.x = -1), so its shoulder angles are negated to move in sync
      const fl = w.delay ? Math.sin(this.phase * Math.PI - w.delay) : flap;
      w.shoulder.rotation.z = w.s * THREE.MathUtils.lerp(-0.2, 0.18 + amp * fl, sp);
      w.shoulder.rotation.y = w.s * THREE.MathUtils.lerp(-1.2, 0.0, sp); // fold back along the body
      w.elbow.rotation.z = THREE.MathUtils.lerp(-0.1, 0.5 * amp * Math.sin(this.phase * Math.PI - 0.9 - w.delay) - 0.08, sp);
      w.elbow.rotation.y = THREE.MathUtils.lerp(-0.25, 0.0, sp); // forearm lies along the body
      const fold = THREE.MathUtils.lerp(0.25, 1, sp); // membranes gather up when the wing folds
      w.mem1.scale.z = fold; w.mem2.scale.z = fold;
      for (let f = 0; f < w.fingers.length; f++) {
        w.fingers[f].rotation.y = -THREE.MathUtils.lerp(0.08 + f * 0.05, FINGER_ANGLE[f], sp);
      }
    }
    pv.position.y = 0.3 + (s.flying ? Math.sin(this.phase * Math.PI) * 0.06 : 0);

    // tail follows turning + gentle idle sway
    this.tailSway = THREE.MathUtils.lerp(this.tailSway, -s.roll * 1.4, 1 - Math.exp(-3 * dt));
    for (let i = 0; i < this.tail.length; i++) {
      const g = this.tail[i];
      g.rotation.y = Math.sin(t * 2.2 - i * 0.7) * 0.07 + this.tailSway * 0.25;
      g.rotation.x = (s.flying ? -s.pitch * 0.08 : 0.04) + Math.sin(t * 1.6 - i * 0.6) * 0.03;
    }
    // neck/head: head leans up in flight, looks where the camera looks
    for (let i = 0; i < this.neck.length; i++) {
      this.neck[i].rotation.x = -0.28 + (s.flying ? 0.12 : 0) - s.lookPitch * 0.12;
      this.neck[i].rotation.y = -s.lookYaw * 0.25;
    }
    this.head.rotation.x = 0.1 - s.lookPitch * 0.25 + (s.breathing ? -0.15 : 0);
    this.jaw.rotation.x = THREE.MathUtils.lerp(this.jaw.rotation.x, s.breathing ? -0.55 : -0.04 + Math.sin(t * 1.3) * 0.015, 1 - Math.exp(-14 * dt));
    this.head.rotation.y = -s.lookYaw * 0.3;

    // legs: tuck in flight, walk on ground
    this.walkPhase += dt * s.speed * 1.8;
    for (let i = 0; i < 4; i++) {
      const leg = this.legs[i];
      if (s.flying) {
        leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, i < 2 ? -0.9 : 0.8, 1 - Math.exp(-8 * dt));
      } else {
        const ph = this.walkPhase + (i === 0 || i === 3 ? 0 : Math.PI);
        const sw = s.speed > 0.4 ? Math.sin(ph) * 0.55 : 0;
        leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, sw, 1 - Math.exp(-14 * dt));
      }
    }
  }

  // world position of the mouth, for fire
  mouthWorld(out) {
    this.head.updateWorldMatrix(true, false);
    return out.set(0, -0.12, this.mouthZ).applyMatrix4(this.head.matrixWorld);
  }
}
