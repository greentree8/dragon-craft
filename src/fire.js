// Fire-breath particles: pooled glowing cubes (HDR colours so bloom makes them blaze).
import * as THREE from 'three';

const MAX = 700;

export class FireBreath {
  constructor(scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);

    this.p = [];
    for (let i = 0; i < MAX; i++) this.p.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, spin: 0, rot: 0 });
    this.cursor = 0;
    this.light = new THREE.PointLight(0xff8a30, 0, 28, 1.6);
    scene.add(this.light);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._s = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._c = new THREE.Color();
    this.active = 0;
    this.emitAcc = 0;
  }

  emit(origin, dir, inheritVel, dt) {
    this.emitAcc += dt * 160;
    const n = Math.floor(this.emitAcc);
    this.emitAcc -= n;
    for (let i = 0; i < n; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      const spread = 0.16;
      const sp = 17 + Math.random() * 9;
      p.x = origin.x + (Math.random() - 0.5) * 0.15; p.y = origin.y + (Math.random() - 0.5) * 0.15; p.z = origin.z + (Math.random() - 0.5) * 0.15;
      p.vx = dir.x * sp + (Math.random() - 0.5) * spread * sp + inheritVel.x;
      p.vy = dir.y * sp + (Math.random() - 0.5) * spread * sp + inheritVel.y + 0.8;
      p.vz = dir.z * sp + (Math.random() - 0.5) * spread * sp + inheritVel.z;
      p.max = p.life = 0.45 + Math.random() * 0.35;
      p.size = 0.25 + Math.random() * 0.25;
      p.rot = Math.random() * 6; p.spin = (Math.random() - 0.5) * 8;
    }
    this._lightTarget = origin.clone().addScaledVector(dir, 5);
  }

  update(dt, breathing) {
    const col = this._c;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        p.life -= dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        p.vy += 2.2 * dt; // hot air rises
        p.vx *= 1 - 1.2 * dt; p.vz *= 1 - 1.2 * dt;
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
        // white-hot -> yellow -> orange -> dull red, fading out
        if (t < 0.25) col.setRGB(3.2, 2.6, 1.2);
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
    const target = breathing && this._lightTarget ? 1 : 0;
    this.light.intensity += (target * (55 + Math.random() * 20) - this.light.intensity) * Math.min(1, dt * 14);
    if (this._lightTarget) this.light.position.copy(this._lightTarget);
  }
}
