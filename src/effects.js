// Small pooled particle bursts (block debris, puffs, munch crumbs).
import * as THREE from 'three';

const MAX = 400;

export class Bursts {
  constructor(scene) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial({ color: 0xffffff }),
      MAX,
    );
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);
    this.p = Array.from({ length: MAX }, () => ({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, size: 0, g: 20, r: 1, gr: 1, b: 1 }));
    this.cursor = 0;
    this.idle = true; // nothing alive and the instance buffer already cleared: skip the per-frame loop
    this._m = new THREE.Matrix4();
    this._pos = new THREE.Vector3();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();
  }

  // color: hex number or THREE.Color
  burst(x, y, z, color, count = 10, speed = 4, size = 0.14, up = 2, gravity = 20) {
    this._c.set(color);
    this.idle = false;
    for (let i = 0; i < count; i++) {
      const p = this.p[this.cursor];
      this.cursor = (this.cursor + 1) % MAX;
      p.x = x + (Math.random() - 0.5) * 0.5; p.y = y + (Math.random() - 0.5) * 0.5; p.z = z + (Math.random() - 0.5) * 0.5;
      p.vx = (Math.random() - 0.5) * speed; p.vy = Math.random() * speed * 0.6 + up; p.vz = (Math.random() - 0.5) * speed;
      p.max = p.life = 0.5 + Math.random() * 0.4;
      p.size = size * (0.6 + Math.random() * 0.8);
      p.g = gravity;
      const j = 0.85 + Math.random() * 0.3;
      p.r = this._c.r * j; p.gr = this._c.g * j; p.b = this._c.b * j;
    }
  }

  update(dt) {
    if (this.idle) return;
    const col = this._c;
    let alive = 0;
    for (let i = 0; i < MAX; i++) {
      const p = this.p[i];
      if (p.life > 0) {
        alive++;
        p.life -= dt;
        p.vy -= p.g * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = Math.max(0, Math.min(1, p.life / p.max * 2));
        this._pos.set(p.x, p.y, p.z);
        this._s.setScalar(p.size * k);
        this._m.compose(this._pos, this._q, this._s);
        col.setRGB(p.r, p.gr, p.b);
      } else {
        this._m.makeScale(0, 0, 0);
      }
      this.mesh.setMatrixAt(i, this._m);
      this.mesh.setColorAt(i, col);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (!alive) this.idle = true; // this pass wrote the cleared state; stop until the next burst
  }
}
