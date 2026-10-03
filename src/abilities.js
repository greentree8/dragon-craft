// Extra dragon attacks, each with a cooldown (and a small hunger cost):
//   Z  chain lightning: instant bolt that arcs from the first thing you hit to nearby enemies and stuns them
//   X  explosive fireball: a slow heavy shot that blows up on impact, hurting everything nearby and cratering the ground
//   B  roar: a shockwave that knocks back and stuns everything around you
import * as THREE from 'three';

export const ABILITIES = [
  { id: 'lightning', key: 'Z', icon: '⚡', name: 'Lightning', cooldown: 2.5, cost: 0.5 },
  { id: 'fireball', key: 'X', icon: '☄', name: 'Fireball', cooldown: 3, cost: 1.0 },
  { id: 'roar', key: 'B', icon: '📣', name: 'Roar', cooldown: 9, cost: 0.8 },
];

const BOLT_RANGE = 55, FIREBALL_SPEED = 36, BLAST_RADIUS = 5.5, CRATER = 2.3, ROAR_RADIUS = 15;

export class Abilities {
  // deps: { scene, world, bursts, mobs, enemies, canBreak, B }
  constructor(deps) {
    Object.assign(this, deps);
    this.cd = { lightning: 0, fireball: 0, roar: 0 };
    this.bolts = []; this.balls = []; this.rings = [];
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3();
    this.boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.6, 3.2, 6), transparent: true, fog: false });
    this.ballGeo = new THREE.SphereGeometry(0.6, 16, 12);
    this.ballMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.4, 0.3) });
    this.ringGeo = new THREE.SphereGeometry(1, 28, 16);
  }

  fractions() { return ABILITIES.map((a) => this.cd[a.id] / a.cooldown); }

  // everything that can be hurt: guards, animals and drakes
  targets() {
    const out = [];
    for (const m of this.enemies.list) out.push({ type: 'enemy', ref: m, pos: m.pos, r: 0.9 * (m.spec.scale || 1) });
    for (const m of this.mobs.list) out.push({ type: 'mob', ref: m, pos: m.pos, r: 0.7 });
    for (const d of this.enemies.drakes) out.push({ type: 'drake', ref: d, pos: d.pos, r: 2.4 });
    return out;
  }

  damage(t, amount, stun, from) {
    if (t.type === 'enemy') { t.ref.hp -= amount; t.ref.aggro = true; if (stun) t.ref.freeze = Math.max(t.ref.freeze, stun); }
    else if (t.type === 'mob') this.mobs.hurt(t.ref, amount, from);
    else t.ref.hurt(amount, 'bolt');
  }

  // returns true if it fired
  use(id, origin, dir, player) {
    if (this.cd[id] > 0) return false;
    const spec = ABILITIES.find((a) => a.id === id);
    if (id === 'lightning') this.lightning(origin, dir);
    else if (id === 'fireball') this.fireball(origin, dir, player);
    else this.roar(player.pos);
    this.cd[id] = spec.cooldown;
    return true;
  }

  // ---- lightning ----
  lightning(origin, dir) {
    let best = null, bestProj = 1e9;
    for (const t of this.targets()) {
      const v = this._v.copy(t.pos).sub(origin);
      const proj = v.dot(dir), d = v.length();
      if (proj < 1.5 || d > BOLT_RANGE) continue;
      const perp = Math.sqrt(Math.max(0, d * d - proj * proj));
      if (perp > t.r + 1.5 + proj * 0.06) continue;
      const hit = this.world.raycast(origin, v.clone().normalize(), d);
      if (hit && hit.t < d - t.r - 1.5) continue;
      if (proj < bestProj) { best = t; bestProj = proj; }
    }
    const pts = [origin.clone()];
    if (best) {
      const first = best.pos.clone(); first.y += 0.6;
      pts.push(first);
      this.damage(best, best.type === 'drake' ? 10 : 14, 1.2, origin);
      const used = new Set([best.ref]);
      let last = first;
      for (let i = 0; i < 3; i++) {
        let next = null, nd = 10;
        for (const t of this.targets()) {
          if (used.has(t.ref)) continue;
          const d = t.pos.distanceTo(last);
          if (d < nd) { nd = d; next = t; }
        }
        if (!next) break;
        used.add(next.ref);
        this.damage(next, 7, 0.8, last);
        last = next.pos.clone(); last.y += 0.6;
        pts.push(last);
      }
      this.bursts.burst(first.x, first.y, first.z, 0xbfe0ff, 10, 4, 0.14, 1);
    } else {
      const hit = this.world.raycast(origin, dir, BOLT_RANGE);
      const end = hit ? new THREE.Vector3(hit.x + 0.5, hit.y + 1, hit.z + 0.5) : origin.clone().addScaledVector(dir, 40);
      pts.push(end);
      this.bursts.burst(end.x, end.y, end.z, 0xbfe0ff, 8, 3, 0.12, 1);
    }
    for (let k = 0; k < 3; k++) this.addBolt(pts, k === 0 ? 0.45 : 0.9);
  }

  addBolt(pts, jitter) {
    const v = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const n = Math.max(2, Math.ceil(a.distanceTo(b) / 1.6));
      for (let s = 0; s < n; s++) {
        const t = s / n, e = Math.sin(Math.PI * t) * jitter + 0.05;
        v.push(a.x + (b.x - a.x) * t + (Math.random() - 0.5) * e * 2, a.y + (b.y - a.y) * t + (Math.random() - 0.5) * e * 2, a.z + (b.z - a.z) * t + (Math.random() - 0.5) * e * 2);
      }
    }
    const last = pts[pts.length - 1];
    v.push(last.x, last.y, last.z);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const line = new THREE.Line(g, this.boltMat.clone());
    line.frustumCulled = false;
    this.scene.add(line);
    this.bolts.push({ line, life: 0.22, max: 0.22 });
  }

  // ---- fireball ----
  fireball(origin, dir, player) {
    const mesh = new THREE.Mesh(this.ballGeo, this.ballMat);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const vel = dir.clone().multiplyScalar(FIREBALL_SPEED).addScaledVector(player.vel, 0.3);
    this.balls.push({ mesh, pos: origin.clone(), vel, life: 3.5 });
  }

  explode(p) {
    this.bursts.burst(p.x, p.y, p.z, 0xff8a30, 36, 9, 0.4, 2.5, 8);
    this.bursts.burst(p.x, p.y, p.z, 0xffd27a, 18, 6, 0.25, 2, 5);
    this.bursts.burst(p.x, p.y, p.z, 0x444444, 20, 4, 0.35, 3, 3);
    for (const t of this.targets()) {
      const d = t.pos.distanceTo(p) - t.r;
      if (d > BLAST_RADIUS) continue;
      const f = 1 - Math.max(0, d) / BLAST_RADIUS * 0.5;
      this.damage(t, (t.type === 'drake' ? 12 : 18) * f, 0.6, p);
    }
    // crater
    let broken = 0;
    const R = CRATER, x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
    for (let dy = -3; dy <= 3 && broken < 45; dy++) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dy * dy + dz * dz > R * R || broken >= 45) continue;
      const x = x0 + dx, y = y0 + dy, z = z0 + dz;
      const id = this.world.getBlock(x, y, z);
      if (id && this.canBreak(id, y) && this.world.setBlock(x, y, z, this.B.AIR)) broken++;
    }
  }

  // ---- roar ----
  roar(pos) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.6, 2.4), transparent: true, opacity: 0.5, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.rings.push({ mesh, life: 0.5, max: 0.5, pos: pos.clone() });
    for (const t of this.targets()) {
      const v = this._d.copy(t.pos).sub(pos);
      const d = v.length();
      if (d > ROAR_RADIUS + t.r) continue;
      v.y = 0; v.normalize();
      if (t.type === 'enemy') { const m = t.ref; m.freeze = Math.max(m.freeze, 2.5); m.vel.x += v.x * 14; m.vel.z += v.z * 14; m.vel.y = Math.max(m.vel.y, 6); m.hp -= 3; m.aggro = true; }
      else if (t.type === 'mob') { const m = t.ref; m.panic = 4; m.vel.x += v.x * 10; m.vel.z += v.z * 10; m.vel.y = 6; m.heading = Math.atan2(v.x, v.z) + Math.PI; }
      else { const dr = t.ref; dr.chill = Math.max(dr.chill, 2); dr.vel.x += v.x * 12; dr.vel.z += v.z * 12; dr.hurt(3, 'bolt'); }
    }
  }

  update(dt) {
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const b of [...this.bolts]) {
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.bolts.splice(this.bolts.indexOf(b), 1); }
    }
    for (const b of [...this.balls]) {
      b.life -= dt;
      const step = b.vel.length() * dt;
      const dir = this._d.copy(b.vel).normalize();
      const hit = this.world.raycast(b.pos, dir, step + 0.3);
      b.pos.addScaledVector(dir, step);
      b.mesh.position.copy(b.pos);
      let boom = !!hit || b.life <= 0;
      if (!boom) for (const t of this.targets()) if (t.pos.distanceTo(b.pos) < t.r + 0.8) { boom = true; break; }
      if (boom) { this.explode(b.pos); this.scene.remove(b.mesh); this.balls.splice(this.balls.indexOf(b), 1); }
      else if (Math.random() < 0.8) this.bursts.burst(b.pos.x, b.pos.y, b.pos.z, 0xff9a40, 1, 0.5, 0.18, 0.5);
    }
    for (const r of [...this.rings]) {
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(1 + t * ROAR_RADIUS);
      r.mesh.material.opacity = 0.5 * (1 - t);
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(this.rings.indexOf(r), 1); }
    }
  }
}
