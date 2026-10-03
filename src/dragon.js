// The dragon: a blocky procedural model with animated wings, tail, neck and legs.
// Faces -Z. `root` sits at the physics hitbox centre.
import * as THREE from 'three';

export const DEFAULT_LOOK = {
  body: 0x2fa84f, belly: 0xe8d48a, accent: 0xff7a1a, wing: 0xd9402b, eye: 0xffe14d,
};

function box(w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.castShadow = true;
  return m;
}

function spike(size, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(size * 0.5, size, 4), mat);
  m.rotation.y = Math.PI / 4;
  m.castShadow = true;
  return m;
}

export class Dragon {
  constructor(look = DEFAULT_LOOK) {
    this.look = { ...look };
    this.root = new THREE.Group();
    this.pivot = new THREE.Group();
    this.pivot.rotation.order = 'YXZ';
    this.root.add(this.pivot);
    this.phase = 0;
    this.walkPhase = 0;
    this.tailSway = 0;
    this.mats = {
      body: new THREE.MeshStandardMaterial({ color: look.body, roughness: 0.65, flatShading: true }),
      belly: new THREE.MeshStandardMaterial({ color: look.belly, roughness: 0.7, flatShading: true }),
      accent: new THREE.MeshStandardMaterial({ color: look.accent, roughness: 0.5, flatShading: true }),
      wing: new THREE.MeshStandardMaterial({ color: look.wing, roughness: 0.8, side: THREE.DoubleSide, flatShading: true }),
      eye: new THREE.MeshBasicMaterial({ color: new THREE.Color(look.eye).multiplyScalar(3) }),
      dark: new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.9 }),
    };
    this.build();
  }

  setLook(look) {
    Object.assign(this.look, look);
    this.mats.body.color.set(this.look.body);
    this.mats.belly.color.set(this.look.belly);
    this.mats.accent.color.set(this.look.accent);
    this.mats.wing.color.set(this.look.wing);
    this.mats.eye.color.set(this.look.eye).multiplyScalar(3);
  }

  build() {
    const M = this.mats;
    const pv = this.pivot;

    // torso
    const torso = box(0.95, 0.8, 1.7, M.body);
    pv.add(torso);
    const belly = box(0.8, 0.28, 1.55, M.belly);
    belly.position.set(0, -0.36, 0);
    pv.add(belly);
    for (let i = 0; i < 4; i++) {
      const s = spike(0.34 - i * 0.03, M.accent);
      s.position.set(0, 0.5, -0.6 + i * 0.42);
      pv.add(s);
    }

    // neck (chain of 3) + head
    this.neck = [];
    let parent = pv;
    let at = new THREE.Vector3(0, 0.15, -0.8);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const seg = box(0.55 - i * 0.05, 0.55 - i * 0.05, 0.62, M.body);
      seg.position.z = -0.28;
      g.add(seg);
      const sp = spike(0.24, M.accent);
      sp.position.set(0, 0.34 - i * 0.03, -0.28);
      g.add(sp);
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
    const snout = box(0.5, 0.3, 0.55, M.body);
    snout.position.set(0, -0.08, -0.82);
    head.add(snout);
    const jaw = box(0.46, 0.14, 0.5, M.belly);
    jaw.position.set(0, -0.28, -0.8);
    head.add(jaw);
    for (const s of [-1, 1]) {
      const eye = box(0.14, 0.14, 0.14, M.eye);
      eye.position.set(0.3 * s, 0.1, -0.5);
      head.add(eye);
      const pupil = box(0.06, 0.1, 0.06, M.dark);
      pupil.position.set(0.37 * s, 0.1, -0.52);
      head.add(pupil);
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.6, 5), M.accent);
      horn.position.set(0.24 * s, 0.4, 0.0);
      horn.rotation.x = 0.7;
      horn.rotation.z = -0.25 * s;
      horn.castShadow = true;
      head.add(horn);
      const nostril = box(0.07, 0.07, 0.07, M.dark);
      nostril.position.set(0.12 * s, 0.02, -1.1);
      head.add(nostril);
    }
    const crest = spike(0.3, M.accent);
    crest.position.set(0, 0.42, -0.2);
    head.add(crest);

    // tail (chain of 7, tapering)
    this.tail = [];
    parent = pv;
    at = new THREE.Vector3(0, 0.05, 0.8);
    for (let i = 0; i < 7; i++) {
      const g = new THREE.Group();
      g.position.copy(at);
      parent.add(g);
      const t = 1 - i / 8;
      const seg = box(0.55 * t + 0.1, 0.5 * t + 0.1, 0.6, M.body);
      seg.position.z = 0.28;
      g.add(seg);
      if (i < 6) {
        const sp = spike(0.26 * t + 0.08, M.accent);
        sp.position.set(0, 0.3 * t + 0.1, 0.28);
        g.add(sp);
      }
      this.tail.push(g);
      parent = g;
      at = new THREE.Vector3(0, 0, 0.58);
    }
    // tail tip: a little spade
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.6, 4), M.accent);
    tip.rotation.x = Math.PI / 2;
    tip.rotation.z = Math.PI / 4;
    tip.position.z = 0.9;
    tip.castShadow = true;
    parent.add(tip);

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
      // finger bones fanning backward from the wrist
      const fingers = [];
      for (let f = 0; f < 3; f++) {
        const fg = new THREE.Group();
        fg.position.x = 1.55;
        fg.rotation.y = 0.35 + f * 0.5;
        const bone = box(1.7 - f * 0.25, 0.1, 0.1, M.accent);
        bone.position.x = 0.85 - f * 0.12;
        fg.add(bone);
        elbow.add(fg);
        fingers.push(fg);
      }
      // membranes: flat shapes in the XZ plane
      const mem1 = this.membrane([[0, 0], [1.5, 0], [1.4, 0.9], [0.8, 1.15], [0, 1.0]], M.wing);
      mem1.position.set(0, -0.02, 0.1);
      shoulder.add(mem1);
      const mem2 = this.membrane([[0, 0], [1.55, 0], [2.25, 1.0], [1.7, 1.45], [1.15, 1.2], [0.7, 1.7], [0.05, 1.15]], M.wing);
      mem2.position.set(0, -0.02, 0.1);
      elbow.add(mem2);
      this.wings.push({ shoulder, elbow, fingers, s });
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

  // state: { flying, speed (0..), vy, boosting, yaw, pitch, roll, moving, breathing }
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
      w.shoulder.rotation.z = THREE.MathUtils.lerp(-0.2, 0.18 + amp * flap, sp);
      w.shoulder.rotation.y = THREE.MathUtils.lerp(0.9, 0.0, sp); // fold back
      w.elbow.rotation.z = THREE.MathUtils.lerp(-0.1, 0.5 * amp * Math.sin(this.phase * Math.PI - 0.9) - 0.08, sp);
      w.elbow.rotation.y = THREE.MathUtils.lerp(-1.5, 0.0, sp); // fold the forearm back along the body
      for (let f = 0; f < w.fingers.length; f++) {
        w.fingers[f].rotation.y = THREE.MathUtils.lerp(0.1, 0.35 + f * 0.5, sp);
      }
    }
    // body bob
    pv.position.y = 0.3 + (s.flying ? Math.sin(this.phase * Math.PI) * 0.06 : 0);

    // tail follows turning + gentle idle sway
    this.tailSway = THREE.MathUtils.lerp(this.tailSway, -s.roll * 1.4, 1 - Math.exp(-3 * dt));
    for (let i = 0; i < this.tail.length; i++) {
      const g = this.tail[i];
      const wave = Math.sin(t * 2.2 - i * 0.7) * 0.07 + this.tailSway * 0.25;
      g.rotation.y = wave;
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
    return out.set(0, -0.12, -1.15).applyMatrix4(this.head.matrixWorld);
  }
}
