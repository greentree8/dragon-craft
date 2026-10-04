// Dragon attacks with cooldowns. Which ones you have depends on your element and how much you've grown (see elements.js):
//   fire: fireball, inferno ring, meteor storm     ice: ice shards, blizzard, Absolute Zero
//   lightning: chain lightning, thunder clap, storm call     earth: boulder, earthquake, stone skin
// plus Annihilate (K), which anyone can unlock with the Master Apple from the Volcano Maze.
import * as THREE from 'three';
import { ELEMENTS } from './elements.js';

export const DOOM = { id: 'doom', key: 'K', icon: '💀', name: 'Annihilate (Master Apple)', cooldown: 120, cost: 2 };
const ALL = new Map([[DOOM.id, DOOM]]);
for (const e of Object.values(ELEMENTS)) for (const a of e.attacks) ALL.set(a.id, a);
export const attackInfo = (id) => ALL.get(id);

const DOOM_RADIUS = 70, BOLT_RANGE = 55;

export class Abilities {
  // deps: { scene, world, bursts, mobs, enemies, canBreak, B }
  constructor(deps) {
    Object.assign(this, deps);
    this.power = 1;                     // grows with your dragon
    this.cd = {};
    this.bolts = []; this.shots = []; this.rings = []; this.later = [];
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._e = new THREE.Vector3();
    this.boltMat = new THREE.LineBasicMaterial({ color: new THREE.Color(2.6, 3.2, 6), transparent: true, fog: false });
    this.ballGeo = new THREE.SphereGeometry(0.6, 16, 12);
    this.fireMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 1.4, 0.3) });
    this.rockMat = new THREE.MeshStandardMaterial({ color: 0x77706a, roughness: 0.95 });
    this.shardGeo = new THREE.OctahedronGeometry(0.4);
    this.shardMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 2.6, 3.6) });
    this.ringGeo = new THREE.SphereGeometry(1, 28, 16);
  }

  fraction(id) { const a = attackInfo(id); return a ? (this.cd[id] || 0) / a.cooldown : 0; }

  // everything that can be hurt: guards, animals and drakes
  targets() {
    const out = [];
    for (const m of this.enemies.list) out.push({ type: 'enemy', ref: m, pos: m.pos, r: 0.9 * (m.spec.scale || 1) });
    for (const m of this.mobs.list) out.push({ type: 'mob', ref: m, pos: m.pos, r: 0.7 });
    for (const d of this.enemies.drakes) out.push({ type: 'drake', ref: d, pos: d.pos, r: 2.4 });
    return out;
  }

  damage(t, amount, stun, from, kind = 'bolt') {
    const dmg = amount * this.power;
    if (t.type === 'enemy') { t.ref.hp -= dmg; t.ref.aggro = true; if (stun) t.ref.freeze = Math.max(t.ref.freeze, stun); }
    else if (t.type === 'mob') { this.mobs.hurt(t.ref, dmg, from); if (stun) t.ref.freeze = Math.max(t.ref.freeze || 0, stun); }
    else { t.ref.hurt(dmg, kind); if (stun) t.ref.chill = Math.max(t.ref.chill, stun * 0.6); }
  }

  freeze(t, secs) {
    if (t.type === 'drake') t.ref.chill = Math.max(t.ref.chill, secs * 0.6);
    else t.ref.freeze = Math.max(t.ref.freeze || 0, secs);
  }

  // returns true if it fired
  use(id, origin, dir, player) {
    if ((this.cd[id] || 0) > 0) return false;
    const spec = attackInfo(id);
    switch (id) {
      case 'lightning': this.lightning(origin, dir); break;
      case 'fireball': this.shoot('fireball', origin, dir, player); break;
      case 'boulder': this.shoot('boulder', origin, dir, player); break;
      case 'shards': for (const off of [-0.2, -0.1, 0, 0.1, 0.2]) this.shoot('shard', origin, this._rotated(dir, off), player); break;
      case 'inferno': this.shockwave(player.pos, { radius: 11, damage: 16, color: [3.2, 1.2, 0.2], bursts: 0xff8a20, kind: 'fire', stun: 0 }); break;
      case 'meteors': this.meteors(origin, dir); break;
      case 'blizzard': this.blizzard(player.pos); break;
      case 'zero': this.absoluteZero(player.pos); break;
      case 'thunderclap': this.thunderclap(player.pos); break;
      case 'storm': this.storm(player.pos); break;
      case 'quake': this.quake(player.pos); break;
      case 'doom': this.doom(player.pos); break;
      default: return false; // stone skin is handled by the game itself
    }
    this.cd[id] = spec.cooldown;
    return true;
  }

  // distance from a point to the segment a-b
  segDist(p, a, b) {
    const ab = this._e.copy(b).sub(a), l2 = ab.lengthSq();
    let t = l2 > 0 ? ((p.x - a.x) * ab.x + (p.y - a.y) * ab.y + (p.z - a.z) * ab.z) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = a.x + ab.x * t - p.x, dy = a.y + ab.y * t - p.y, dz = a.z + ab.z * t - p.z;
    return Math.hypot(dx, dy, dz);
  }

  _rotated(dir, yaw) { // turn a direction left/right a little
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return new THREE.Vector3(dir.x * c - dir.z * s, dir.y, dir.x * s + dir.z * c).normalize();
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

  // ---- projectiles: fireball, boulder, meteor, ice shard ----
  shoot(kind, origin, dir, player) {
    const mesh = new THREE.Mesh(kind === 'shard' ? this.shardGeo : this.ballGeo, kind === 'fireball' || kind === 'meteor' ? this.fireMat : kind === 'shard' ? this.shardMat : this.rockMat);
    if (kind === 'shard') mesh.scale.set(0.5, 0.5, 2.2);
    if (kind === 'boulder') mesh.scale.setScalar(1.15);
    mesh.position.copy(origin);
    this.scene.add(mesh);
    const speed = { fireball: 36, boulder: 30, shard: 46 }[kind];
    const vel = dir.clone().multiplyScalar(speed);
    if (kind !== 'shard') vel.addScaledVector(player.vel, 0.3);
    this.shots.push({ kind, mesh, pos: origin.clone(), vel, life: 3.5, grav: kind === 'boulder' ? 9 : 0 });
  }

  meteors(origin, dir) {
    const hit = this.world.raycast(origin, dir, 60);
    const c = hit ? new THREE.Vector3(hit.x + 0.5, hit.y + 1, hit.z + 0.5) : origin.clone().addScaledVector(dir, 38);
    for (let i = 0; i < 9; i++) {
      this.later.push({ t: i * 0.28 + Math.random() * 0.15, fn: () => {
        // most meteors home in on something near where you aimed; the rest scatter around the spot
        const near = this.targets().filter((t) => t.pos.distanceTo(c) < 30);
        const t = near.length && Math.random() < 0.65 ? near[Math.floor(Math.random() * near.length)] : null;
        const p = t ? new THREE.Vector3(t.pos.x + (Math.random() - 0.5) * 2, c.y + 55, t.pos.z + (Math.random() - 0.5) * 2)
          : new THREE.Vector3(c.x + (Math.random() - 0.5) * 18, c.y + 55, c.z + (Math.random() - 0.5) * 18);
        const mesh = new THREE.Mesh(this.ballGeo, this.fireMat);
        mesh.scale.setScalar(1.3); mesh.position.copy(p); this.scene.add(mesh);
        this.shots.push({ kind: 'meteor', mesh, pos: p, vel: new THREE.Vector3((Math.random() - 0.5) * 4, -52, (Math.random() - 0.5) * 4), life: 3, grav: 0 });
      } });
    }
  }

  // a blast where something lands: damage, a crater, and fireworks of the right colour
  blast(p, { radius = 5.5, damage = 18, drakeDamage = 12, crater = 2.3, color = 0xff8a30, stun = 0.6, kind = 'bolt' } = {}) {
    this.bursts.burst(p.x, p.y, p.z, color, 36, 9, 0.4, 2.5, 8);
    this.bursts.burst(p.x, p.y, p.z, 0xffd27a, 14, 6, 0.25, 2, 5);
    this.bursts.burst(p.x, p.y, p.z, 0x444444, 18, 4, 0.35, 3, 3);
    for (const t of this.targets()) {
      const d = t.pos.distanceTo(p) - t.r;
      if (d > radius) continue;
      const f = 1 - Math.max(0, d) / radius * 0.5;
      this.damage(t, (t.type === 'drake' ? drakeDamage : damage) * f, stun, p, kind);
    }
    if (!crater) return;
    let broken = 0;
    const R = crater, x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z), r = Math.ceil(R);
    for (let dy = -r; dy <= r && broken < 60; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dy * dy + dz * dz > R * R || broken >= 60) continue;
      const x = x0 + dx, y = y0 + dy, z = z0 + dz;
      const id = this.world.getBlock(x, y, z);
      if (id && this.canBreak(id, y) && this.world.setBlock(x, y, z, this.B.AIR)) broken++;
    }
  }

  // ---- area attacks ----
  ring(pos, radius, color, life = 0.5, opacity = 0.5) {
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(...color), transparent: true, opacity, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending, fog: false });
    const mesh = new THREE.Mesh(this.ringGeo, mat);
    mesh.position.copy(pos);
    this.scene.add(mesh);
    this.rings.push({ mesh, life, max: life, radius, a: opacity });
  }

  // damages everything in a radius, pushing it away; options: { radius, damage, stun, knock, color, bursts, kind }
  shockwave(pos, o) {
    this.ring(pos, o.radius, o.color, 0.5);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      this.bursts.burst(pos.x + Math.cos(a) * o.radius * 0.7, pos.y - 0.5, pos.z + Math.sin(a) * o.radius * 0.7, o.bursts, 2, 4, 0.25, 3, 2);
    }
    for (const t of this.targets()) {
      const v = this._d.copy(t.pos).sub(pos);
      const d = v.length();
      if (d > o.radius + t.r) continue;
      v.y = 0; v.normalize();
      this.damage(t, o.damage, o.stun || 0, pos, o.kind);
      const k = o.knock || 0;
      if (k && t.type === 'enemy') { t.ref.vel.x += v.x * k; t.ref.vel.z += v.z * k; t.ref.vel.y = Math.max(t.ref.vel.y, o.lift || 6); }
      else if (k && t.type === 'mob') { t.ref.panic = 4; t.ref.vel.x += v.x * k * 0.7; t.ref.vel.z += v.z * k * 0.7; t.ref.vel.y = 6; t.ref.heading = Math.atan2(v.x, v.z) + Math.PI; }
      else if (k && t.type === 'drake') { t.ref.vel.x += v.x * k * 0.8; t.ref.vel.z += v.z * k * 0.8; }
    }
  }

  thunderclap(pos) {
    this.shockwave(pos, { radius: 13, damage: 14, stun: 3, knock: 14, color: [2.4, 2.8, 4], bursts: 0xcfe0ff, kind: 'bolt' });
    for (const t of this.targets()) {
      if (t.pos.distanceTo(pos) > 13 + t.r) continue;
      const top = t.pos.clone(); top.y += 40;
      this.addBolt([top, t.pos.clone()], 0.8);
    }
  }

  quake(pos) {
    this.shockwave(pos, { radius: 16, damage: 11, stun: 3, knock: 8, lift: 8, color: [1.4, 1, 0.6], bursts: 0x9a7a4a, kind: 'bolt' });
    for (let i = 0; i < 40; i++) this.bursts.burst(pos.x + (Math.random() - 0.5) * 24, pos.y - 0.4, pos.z + (Math.random() - 0.5) * 24, 0x8a6a40, 1, 3, 0.35, 5, 14);
  }

  storm(pos) {
    for (let i = 0; i < 10; i++) {
      this.later.push({ t: i * 0.3, fn: () => {
        const ts = this.targets().filter((t) => t.pos.distanceTo(pos) < 42);
        const t = ts.length ? ts[Math.floor(Math.random() * ts.length)] : null;
        const end = t ? t.pos.clone() : new THREE.Vector3(pos.x + (Math.random() - 0.5) * 40, pos.y - 1, pos.z + (Math.random() - 0.5) * 40);
        if (t) this.damage(t, 16, 0.6, end);
        const top = end.clone(); top.y += 45; top.x += (Math.random() - 0.5) * 6;
        for (let k = 0; k < 2; k++) this.addBolt([top, end], 1.1);
        this.bursts.burst(end.x, end.y, end.z, 0xcfe0ff, 10, 5, 0.2, 2, 4);
      } });
    }
  }

  blizzard(pos) {
    this.ring(pos, 14, [1.4, 2.4, 3.4], 0.7);
    for (let i = 0; i < 30; i++) this.bursts.burst(pos.x + (Math.random() - 0.5) * 26, pos.y + Math.random() * 5, pos.z + (Math.random() - 0.5) * 26, 0xeaf6ff, 1, 3, 0.3, 1, 3);
    for (const t of this.targets()) {
      if (t.pos.distanceTo(pos) > 14 + t.r) continue;
      this.damage(t, 6, 0, pos, 'ice'); this.freeze(t, 4);
    }
    this.freezeWater(pos, 9);
  }

  absoluteZero(pos) {
    this.ring(pos, 45, [1.6, 2.6, 3.8], 1.0, 0.55);
    this.bursts.burst(pos.x, pos.y, pos.z, 0xeaf6ff, 50, 14, 0.3, 4, 2);
    for (const t of this.targets()) {
      if (t.pos.distanceTo(pos) > 45 + t.r) continue;
      this.freeze(t, 6);
      this.damage(t, 22, 0, pos, 'ice');
      this.bursts.burst(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xbfe8ff, 14, 5, 0.22, 3, 3);
    }
    this.freezeWater(pos, 14);
  }

  // turn water near you into ice (at most ~40 blocks)
  freezeWater(pos, radius) {
    let n = 0;
    const x0 = Math.floor(pos.x), z0 = Math.floor(pos.z), y1 = Math.floor(pos.y) + 2, y0 = y1 - 24;
    for (let dz = -radius; dz <= radius && n < 40; dz++) for (let dx = -radius; dx <= radius && n < 40; dx++) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let y = y1; y >= y0; y--) {
        const id = this.world.getBlock(x0 + dx, y, z0 + dz);
        if (!id) continue;
        if (id === this.B.WATER && this.world.setBlock(x0 + dx, y, z0 + dz, this.B.ICE)) n++;
        break; // only the top surface
      }
    }
  }

  // ---- the breath cone of the lightning and earth dragons ----
  coneAttack(origin, dir, dt, { range = 14, widen = 0.25, dps = 7, stun = 0, kind = 'bolt', push = 0 } = {}) {
    for (const t of this.targets()) {
      const v = this._e.copy(t.pos).sub(origin);
      const d = v.length();
      if (d > range + t.r || d < 0.01) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir) / d, -1, 1));
      if (ang > widen + 0.9 / Math.max(d, 1.5) + Math.atan(t.r / Math.max(d, 1))) continue;
      const hit = this.world.raycast(origin, v.clone().normalize(), d);
      if (hit && hit.t < d - t.r - 1.2) continue;
      this.damage(t, dps * dt, stun, origin, kind);
      if (push && t.type === 'enemy') { t.ref.vel.x += dir.x * push * dt; t.ref.vel.z += dir.z * push * dt; }
    }
  }

  // ---- annihilate: nothing nearby survives ----
  doom(pos) {
    this.ring(pos, DOOM_RADIUS, [2.6, 0.7, 3.6], 1.1, 0.6);
    this.bursts.burst(pos.x, pos.y, pos.z, 0xe8c8ff, 40, 12, 0.3, 4, 2);
    for (const t of this.targets()) {
      if (t.pos.distanceTo(pos) - t.r > DOOM_RADIUS) continue;
      if (t.type === 'enemy') t.ref.hp = 0;                       // the guard falls on the next update (and drops its loot)
      else if (t.type === 'mob') this.mobs.hurt(t.ref, 9999, pos);
      else t.ref.hp = 0;                                          // a Dread Drake dies on its next update, loot and all
      this.bursts.burst(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xc060ff, 20, 7, 0.25, 3, 4);
      this.bursts.burst(t.pos.x, t.pos.y + 0.5, t.pos.z, 0xffffff, 8, 5, 0.18, 2, 2);
    }
    for (const a of [...this.enemies.arrows]) {
      this.scene.remove(a.mesh);
      this.enemies.arrows.splice(this.enemies.arrows.indexOf(a), 1);
    }
  }

  update(dt) {
    for (const k of Object.keys(this.cd)) this.cd[k] = Math.max(0, this.cd[k] - dt);
    for (const e of [...this.later]) { e.t -= dt; if (e.t <= 0) { this.later.splice(this.later.indexOf(e), 1); e.fn(); } }
    for (const b of [...this.bolts]) {
      b.life -= dt;
      b.line.material.opacity = Math.max(0, b.life / b.max);
      if (b.life <= 0) { this.scene.remove(b.line); b.line.geometry.dispose(); b.line.material.dispose(); this.bolts.splice(this.bolts.indexOf(b), 1); }
    }
    for (const s of [...this.shots]) {
      s.life -= dt;
      s.vel.y -= s.grav * dt;
      const step = s.vel.length() * dt;
      const dir = this._d.copy(s.vel).normalize();
      const hit = this.world.raycast(s.pos, dir, step + 0.3);
      const from = this._v.copy(s.pos); // where it was: targets are tested along the whole segment, so a fast shot can't skip past one
      s.pos.addScaledVector(dir, step);
      s.mesh.position.copy(s.pos);
      if (s.kind === 'shard') s.mesh.lookAt(s.pos.x + dir.x, s.pos.y + dir.y, s.pos.z + dir.z);
      let target = null;
      for (const t of this.targets()) if (this.segDist(t.pos, from, s.pos) < t.r + (s.kind === 'shard' ? 0.7 : 0.8)) { target = t; break; }
      const end = !!hit || s.life <= 0 || !!target;
      if (end) {
        if (s.kind === 'fireball') this.blast(s.pos, { radius: 5.5, damage: 18, drakeDamage: 12, crater: 2.3, color: 0xff8a30 });
        else if (s.kind === 'meteor') this.blast(s.pos, { radius: 4, damage: 14, drakeDamage: 9, crater: 1.8, color: 0xff7a20 });
        else if (s.kind === 'boulder') this.blast(s.pos, { radius: 4.5, damage: 20, drakeDamage: 13, crater: 2.6, color: 0x8a6a40, stun: 1.2 });
        else if (target) { this.damage(target, 10, 0, s.pos, 'ice'); this.freeze(target, 1.5); this.bursts.burst(s.pos.x, s.pos.y, s.pos.z, 0xbfe8ff, 12, 4, 0.16, 2, 4); }
        else this.bursts.burst(s.pos.x, s.pos.y, s.pos.z, 0xbfe8ff, 6, 3, 0.12, 1, 4);
        this.scene.remove(s.mesh); this.shots.splice(this.shots.indexOf(s), 1);
      } else if (s.kind !== 'shard' && Math.random() < 0.7) {
        this.bursts.burst(s.pos.x, s.pos.y, s.pos.z, s.kind === 'boulder' ? 0x8a7a66 : 0xff9a40, 1, 0.5, 0.18, 0.5, 0);
      }
    }
    for (const r of [...this.rings]) {
      r.life -= dt;
      const t = 1 - r.life / r.max;
      r.mesh.scale.setScalar(1 + t * r.radius);
      r.mesh.material.opacity = r.a * (1 - t);
      if (r.life <= 0) { this.scene.remove(r.mesh); r.mesh.material.dispose(); this.rings.splice(this.rings.indexOf(r), 1); }
    }
  }
}
