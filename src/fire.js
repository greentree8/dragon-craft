// Breath particles: pooled glowing shapes (HDR colours so bloom makes them blaze). Fire by default; ICE_BREATH is the frosty variant.
import * as THREE from 'three';

const MAX = 700;

// crackling sparks: short, fast, white-blue
export const ZAP_BREATH = {
  geometry: () => new THREE.BoxGeometry(0.25, 0.25, 1.4),
  speed: [24, 34], spread: 0.1, lift: 0, drag: 0.6, rate: 200, life: [0.12, 0.28], size: [0.18, 0.4],
  lightColor: 0x9ac8ff, lightPower: 40,
  color(t, col) { if (t < 0.4) col.setRGB(3.6, 3.6, 4.4); else col.setRGB(1.0 + (1 - t), 1.6 + (1 - t), 4.2); },
};

// a spray of rocks: heavy, falls fast, plain (not glowing)
export const ROCK_BREATH = {
  geometry: () => new THREE.DodecahedronGeometry(0.5),
  additive: false,
  speed: [15, 23], spread: 0.22, lift: -17, drag: 0.3, rate: 80, life: [0.5, 0.9], size: [0.25, 0.5],
  lightColor: 0x000000, lightPower: 0,
  color(t, col) { const k = 0.8 - t * 0.3; col.setRGB(0.55 * k, 0.42 * k, 0.3 * k); },
};

export const ICE_BREATH = {
  geometry: () => new THREE.OctahedronGeometry(0.5),
  speed: [13, 20], spread: 0.26, lift: -0.8, drag: 1.6, rate: 140, life: [0.55, 0.95], size: [0.2, 0.42],
  lightColor: 0x6fc4ff, lightPower: 38,
  // white-blue -> sky blue -> deep blue, fading out
  color(t, col) {
    if (t < 0.25) col.setRGB(2.2, 3.0, 3.4);
    else if (t < 0.6) col.setRGB(0.6, 1.8, 3.2);
    else col.setRGB(0.15 + 0.4 * (1 - t), 0.5 * (1 - t) + 0.2, 1.4 * (1 - t) + 0.3);
  },
};

export class FireBreath {
  constructor(scene, opts = {}) {
    this.opts = { speed: [17, 26], spread: 0.16, lift: 2.2, drag: 1.2, rate: 160, life: [0.45, 0.8], size: [0.25, 0.5], lightColor: 0xff8a30, lightPower: 55, ...opts };
    const geo = this.opts.geometry ? this.opts.geometry() : new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: this.opts.additive === false ? THREE.NormalBlending : THREE.AdditiveBlending, fog: this.opts.additive === false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);

    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, spin: 0, rot: 0 });
    this.cursor = 0;
    this.light = new THREE.PointLight(this.opts.lightColor, 0, 28, 1.6);
    scene.add(this.light);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._c = new THREE.Color();
    this.active = 0;
    this.emitAcc = 0;
    this.idle = true; // no live particles and the buffer is already cleared
  }

  emit(origin, dir, inheritVel, dt) {
    this.idle = false;
    this.emitAcc += dt * this.opts.rate;
    const n = Math.floor(this.emitAcc);
    this.emitAcc -= n;
    for (let i = 0; i < n; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      const o = this.opts, spread = o.spread;
      const sp = o.speed[0] + Math.random() * (o.speed[1] - o.speed[0]);
      p.x = origin.x + (Math.random() - 0.5) * 0.15; p.y = origin.y + (Math.random() - 0.5) * 0.15; p.z = origin.z + (Math.random() - 0.5) * 0.15;
      p.vx = dir.x * sp + (Math.random() - 0.5) * spread * sp + inheritVel.x;
      p.vy = dir.y * sp + (Math.random() - 0.5) * spread * sp + inheritVel.y + (o.lift > 0 ? 0.8 : 0);
      p.vz = dir.z * sp + (Math.random() - 0.5) * spread * sp + inheritVel.z;
      p.max = p.life = o.life[0] + Math.random() * (o.life[1] - o.life[0]);
      p.size = o.size[0] + Math.random() * (o.size[1] - o.size[0]);
      p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 8;
    }
    this._lightTarget = origin.clone().addScaledVector(dir, 5);
  }

  update(dt, breathing) {
    if (!this.idle) this.step(dt);
    this.lightStep(dt, breathing);
  }

  step(dt) {
    const col = this._c;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy += this.opts.lift * dt; // hot air rises, frost sinks
        p.vx *= 1 - this.opts.drag * dt; p.vz *= 1 - this.opts.drag * dt;
        p.rot += p.spin * dt;
      }
      if (p.life > 0) {
        const t = 1 - p.life / p.max; // 0 -> 1 over lifetime
        const size = p.size * (0.6 + t * 2.6) * (1 - t * t * 0.6);
        this._pos.set(p.x, p.y, p.z);
        this._e.set(p.rot, p.rot * 0.7, 0);
        this._q.setFromEuler(this._e);
        this._s.setScalar(size);
        this._m.compose(this._pos, this._q, this._s);
        if (this.opts.color) this.opts.color(t, col);
        else if (t < 0.25) col.setRGB(3.2, 2.6, 1.2); // white-hot -> yellow -> orange -> dull red
        else if (t < 0.6) col.setRGB(3.0, 1.3, 0.2);
        else col.setRGB(1.6 * (1 - t) + 0.2, 0.3 * (1 - t), 0.05);
        const fade = Math.min(1, p.life / (p.max * 0.35));
        col.multiplyScalar(fade);
        alive++;
      } else {
        this._m.makeScale(0, 0, 0);
        col.setRGB(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.active = alive;
    if (!alive) this.idle = true;
  }

  lightStep(dt, breathing) {
    const target = breathing && this._lightTarget ? 1 : 0;
    this.light.intensity += (target * (this.opts.lightPower + Math.random() * 20) - this.light.intensity) * Math.min(1, dt * 14);
    if (this._lightTarget) this.light.position.copy(this._lightTarget);
  }
}
