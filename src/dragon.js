// The dragon: a procedural model of rounded, smooth-shaded parts with animated wings, tail, neck and legs, shaped by a "look".
// Faces -Z. `root` sits at the physics hitbox centre.
import * as THREE from 'three';
import { softGeometry } from './soft.js';

export const DEFAULT_LOOK = {
  name: 'Ember',
  body: 0x2fa84f, belly: 0xe8d48a, accent: 0xff7a1a, wing: 0xd9402b, eye: 0xffe14d,
  horns: 'short', tail: 'spade', wings: 'bat', spikes: 'spikes', pattern: 'none', snout: 'short', glow: false,
};

export const LOOK_OPTIONS = {
  horns: ['short', 'long', 'curved', 'none'],
  tail: ['spade', 'club', 'flame', 'plain'],
  wings: ['bat', 'spiky', 'round'],
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

    // torso
    pv.add(box(0.95, 0.8, 1.9, M.body, 0.8));
    const belly = box(0.8, 0.28, 1.55, M.belly);
    belly.position.set(0, -0.36, 0);
    pv.add(belly);
    for (let i = 0; i < 4; i++) this.dorsal(pv, 0.34 - i * 0.03, 0, 0.5, -0.6 + i * 0.42);

    // neck (chain of 3) + head
    this.neck = [];
    let parent = pv;
    let at = new THREE.Vector3(0, 0.15, -0.8);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const seg = box(0.55 - i * 0.05, 0.55 - i * 0.05, 0.9, M.body, 0.6);
      seg.position.z = -0.28;
      g.add(seg);
      this.dorsal(g, 0.24, 0, 0.34 - i * 0.03, -0.28);
      this.neck.push(g);
      parent = g;
      at = new THREE.Vector3(0, 0.02, -0.58);
    }
    const head = new THREE.Group();
    head.position.set(0, 0.02, -0.6);
    parent.add(head);
    this.head = head;
    const skull = box(0.72, 0.6, 0.72, M.body);
    skull.position.z = -0.3;
    head.add(skull);
    const long = L.snout === 'long';
    const sLen = long ? 0.95 : 0.55;
    const snout = box(long ? 0.42 : 0.5, 0.3, sLen, M.body);
    snout.position.set(0, -0.08, -0.55 - sLen / 2);
    head.add(snout);
    const jaw = box(long ? 0.38 : 0.46, 0.14, sLen - 0.05, M.belly);
    jaw.position.set(0, -0.28, -0.55 - sLen / 2);
    head.add(jaw);
    this.mouthZ = -0.55 - sLen - 0.1;
    for (const s of [-1, 1]) {
      const eye = box(0.14, 0.14, 0.14, M.eye, 1);
      eye.position.set(0.3 * s, 0.1, -0.5);
      head.add(eye);
      const pupil = box(0.06, 0.1, 0.06, M.dark, 1);
      pupil.position.set(0.37 * s, 0.1, -0.52);
      head.add(pupil);
      const nostril = box(0.07, 0.07, 0.07, M.dark, 1);
      nostril.position.set(0.12 * s, 0.02, this.mouthZ + 0.05);
      head.add(nostril);
      this.horn(head, s, L.horns);
    }
    this.dorsal(head, 0.3, 0, 0.42, -0.2);

    // tail (chain of 7, tapering)
    this.tail = [];
    parent = pv;
    at = new THREE.Vector3(0, 0.05, 0.8);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const t = 1 - i / 8;
      const seg = box(0.55 * t + 0.1, 0.5 * t + 0.1, 0.9, M.body, 0.6);
      seg.position.z = 0.28;
      g.add(seg);
      if (i < 6) this.dorsal(g, 0.26 * t + 0.08, 0, 0.3 * t + 0.1, 0.28);
      this.tail.push(g);
      parent = g;
      at = new THREE.Vector3(0, 0, 0.58);
    }
    this.tailTip(parent, L.tail);

    // legs
    this.legs = [];
    for (const [x, z] of [[0.42, -0.55], [-0.42, -0.55], [0.42, 0.55], [-0.42, 0.55]]) {
      const g = new THREE.Group();
      g.position.set(x, -0.3, z);
      const up = box(0.28, 0.5, 0.32, M.body);
      up.position.y = -0.22;
      g.add(up);
      const foot = box(0.34, 0.14, 0.5, M.accent);
      foot.position.set(0, -0.5, -0.08);
      g.add(foot);
      pv.add(g);
      this.legs.push(g);
    }

    // wings
    this.wings = [];
    const style = WING_STYLE[L.wings] || WING_STYLE.bat;
    for (const s of [1, -1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(0.4, 0.3, -0.25);
      if (s < 0) { shoulder.scale.x = -1; shoulder.position.x = -0.4; }
      pv.add(shoulder);
      const arm = box(1.5, 0.2, 0.22, M.body);
      arm.position.x = 0.75;
      shoulder.add(arm);
      const knuckle = box(0.3, 0.3, 0.3, M.accent);
      knuckle.position.x = 1.45;
      shoulder.add(knuckle);
      const elbow = new THREE.Group();
      elbow.position.x = 1.5;
      shoulder.add(elbow);
      const fore = box(1.6, 0.16, 0.18, M.body);
      fore.position.x = 0.8;
      elbow.add(fore);
      // finger bones fan backward (+Z) from the wrist; the membrane stretches between their tips
      const fingers = [];
      const tips = [];
      for (let f = 0; f < 3; f++) {
        const len = FINGER_LEN[f] * style.len, ang = FINGER_ANGLE[f];
        const fg = new THREE.Group();
        fg.position.x = 1.55;
        fg.rotation.y = -ang;
        const bone = box(len, 0.1, 0.1, M.accent);
        bone.position.x = len / 2;
        fg.add(bone);
        elbow.add(fg);
        fingers.push(fg);
        tips.push([1.55 + len * Math.cos(ang), len * Math.sin(ang)]);
      }
      const scallop = (p, q) => [(p[0] + q[0]) / 2 - style.scallop[0], (p[1] + q[1]) / 2 - style.scallop[1]];
      const mem2 = this.membrane([[0, 0], [1.55, 0], tips[0], scallop(tips[0], tips[1]), tips[1], scallop(tips[1], tips[2]), tips[2], [0.25, 0.95]], M.wing);
      mem2.position.set(0, -0.02, 0.1);
      elbow.add(mem2);
      const mem1 = this.membrane([[0, 0], [1.5, 0], [1.4, 0.8], [0.8, 1.05], [0, 0.95]], M.wing);
      mem1.position.set(0, -0.02, 0.1);
      shoulder.add(mem1);
      this.wings.push({ shoulder, elbow, fingers, mem1, mem2, s });
    }
  }

  horn(head, s, kind) {
    const M = this.mats;
    if (kind === 'none') return;
    if (kind === 'curved') {
      // a ram-style horn: three shrinking blocks arcing back, up and forward
      for (const [x, y, z, w] of [[0.3, 0.38, 0.05, 0.18], [0.36, 0.55, 0.18, 0.14], [0.34, 0.7, 0.16, 0.1]]) {
        const b = box(w, w, w * 1.4, M.accent);
        b.position.set(x * s, y, z);
        head.add(b);
      }
      return;
    }
    const long = kind === 'long';
    const h = new THREE.Mesh(new THREE.ConeGeometry(long ? 0.13 : 0.11, long ? 1.05 : 0.6, 12), M.accent);
    h.position.set(0.24 * s, long ? 0.5 : 0.4, long ? 0.12 : 0);
    h.rotation.x = long ? 1.0 : 0.7;
    h.rotation.z = -0.25 * s;
    h.castShadow = true;
    head.add(h);
  }

  tailTip(parent, kind) {
    const M = this.mats;
    if (kind === 'club') {
      const c = box(0.5, 0.5, 0.5, M.accent);
      c.position.z = 0.55;
      parent.add(c);
      for (const s of [-1, 1]) {
        const sp = spike(0.3, M.accent);
        sp.rotation.z = (Math.PI / 2) * s;
        sp.position.set(0.38 * s, 0, 0.55);
        parent.add(sp);
      }
    } else if (kind === 'flame') {
      for (const [dx, dy, dz, sz] of [[0, 0.05, 0.75, 0.7], [0.12, 0.2, 0.7, 0.45], [-0.12, 0.15, 0.68, 0.5]]) {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.17, sz, 10), M.flame);
        f.rotation.x = Math.PI / 2;
        f.position.set(dx, dy, dz + sz / 2);
        parent.add(f);
      }
    } else if (kind === 'plain') {
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.7, 12), M.body);
      t.rotation.x = Math.PI / 2;
      t.position.z = 0.8;
      t.castShadow = true;
      parent.add(t);
    } else {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 12), M.accent);
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 0.9;
      tip.castShadow = true;
      parent.add(tip);
    }
  }

  membrane(pts, mat) {
    // pts are (x, z-back) pairs; z grows backward (+Z) behind the bone
    const shape = new THREE.Shape();
    shape.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
    shape.closePath();
    const g = new THREE.ShapeGeometry(shape);
    g.rotateX(Math.PI / 2); // XY -> XZ plane
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
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
      w.shoulder.rotation.z = w.s * THREE.MathUtils.lerp(-0.2, 0.18 + amp * flap, sp);
      w.shoulder.rotation.y = w.s * THREE.MathUtils.lerp(-1.2, 0.0, sp); // fold back along the body
      w.elbow.rotation.z = THREE.MathUtils.lerp(-0.1, 0.5 * amp * Math.sin(this.phase * Math.PI - 0.9) - 0.08, sp);
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
