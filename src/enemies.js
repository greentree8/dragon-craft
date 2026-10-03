// Castle guards: knights chase and swing, archers shoot arrows from the walls, and the Castle Lord guards the keep.
// Fire breath hurts them. They are local to each player (like the animals).
import * as THREE from 'three';
import { B } from './blocks.js';
import { moveBox } from './physics.js';
import { softGeometry } from './soft.js';
import { CASTLES, GARRISON } from './castle.js';
import { Drake, DRAKE_MAX_HP } from './drake.js';

const SPEC = {
  knight: { hp: 14, speed: 2.7, hx: 0.35, hy: 0.95, dmg: 3, sight: 30, scale: 1 },
  archer: { hp: 8, speed: 0, hx: 0.3, hy: 0.9, dmg: 2, sight: 42, scale: 1 },
  boss: { hp: 60, speed: 2.2, hx: 0.6, hy: 1.55, dmg: 5, sight: 40, scale: 1.7 },
};
const ARROW_SPEED = 28, ARROW_GRAVITY = 9, MAX_ARROWS = 24, SPAWN_RANGE = 115, DESPAWN_RANGE = 190;

// A person built from rounded parts, feet at y = 0, facing -Z.
function humanoid(type) {
  const boss = type === 'boss', archer = type === 'archer';
  const mats = new Map();
  const mat = (c, glow = 0) => {
    const key = `${c}:${glow}`;
    let m = mats.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.55, metalness: archer ? 0 : 0.45 }); if (glow) { m.emissive.set(c); m.emissiveIntensity = glow; } mats.set(key, m); }
    return m;
  };
  const steel = boss ? 0x2a2a35 : archer ? 0x6b4a2b : 0x9aa3ad;
  const cloth = boss ? 0x4a1d6b : archer ? 0x2f6b34 : 0xb33a3a;
  const g = new THREE.Group();
  const part = (parent, w, h, d, color, x, y, z, e = 0.75) => {
    const m = new THREE.Mesh(softGeometry(w, h, d, e), mat(color));
    m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
  };
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = new THREE.Group(); leg.position.set(0.16 * s, 0.82, 0); g.add(leg);
    part(leg, 0.28, 0.9, 0.3, steel, 0, -0.4, 0);
    part(leg, 0.3, 0.16, 0.44, 0x3a2a1c, 0, -0.84, -0.05);
    legs.push(leg);
  }
  part(g, 0.74, 0.8, 0.44, steel, 0, 1.25, 0, 0.7);          // chest
  part(g, 0.78, 0.18, 0.48, cloth, 0, 0.88, 0, 0.7);          // tabard / belt
  const head = new THREE.Group(); head.position.set(0, 1.78, 0); g.add(head);
  part(head, 0.44, 0.48, 0.46, archer ? cloth : steel, 0, 0, 0, 0.85);
  if (!archer) {
    part(head, 0.36, 0.07, 0.1, 0x111116, 0, 0.02, -0.22, 0.5);          // visor slit
    part(head, 0.1, 0.3, 0.34, boss ? 0x7a2bd1 : 0xc22b2b, 0, 0.3, 0.02, 0.8); // plume
  } else part(head, 0.2, 0.2, 0.06, 0xe9c7a0, 0, -0.04, -0.22, 0.9); // face under the hood
  if (boss) {
    for (const s of [-1, 1]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.4, 8), mat(0xe8e0c8));
      h.position.set(0.22 * s, 0.34, 0); h.rotation.z = -0.5 * s; head.add(h);
    }
    part(head, 0.07, 0.07, 0.07, 0xff4be0, 0.1, 0.02, -0.23, 1).material = mat(0xff4be0, 2.5);
    part(head, 0.07, 0.07, 0.07, 0xff4be0, -0.1, 0.02, -0.23, 1).material = mat(0xff4be0, 2.5);
    part(g, 0.9, 1.2, 0.08, 0x2a0f3c, 0, 1.15, 0.3, 0.6); // cape
  }
  const arms = [];
  for (const s of [-1, 1]) {
    const arm = new THREE.Group(); arm.position.set(0.47 * s, 1.55, 0); g.add(arm);
    part(arm, 0.22, 0.72, 0.24, steel, 0, -0.3, 0);
    part(arm, 0.2, 0.2, 0.22, 0xd8c3a5, 0, -0.68, 0, 1);
    arms.push(arm);
  }
  const armR = arms[1], armL = arms[0];
  if (archer) {
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.025, 6, 16, Math.PI), mat(0x5a3b1c));
    bow.rotation.z = Math.PI / 2; bow.position.set(-0.05, -0.62, -0.25); armL.add(bow);
    armL.rotation.x = -1.2;
  } else {
    const blade = part(armR, 0.07, 1.0, 0.04, 0xe6edf2, 0, -1.05, -0.12, 0.5);
    blade.material = mat(0xe6edf2); blade.rotation.x = -0.3;
    part(armR, 0.26, 0.06, 0.08, 0x8a6a2a, 0, -0.62, -0.12, 0.6); // crossguard
    part(armL, 0.08, 0.62, 0.5, cloth, -0.16, -0.45, -0.1, 0.6);   // shield
    part(armL, 0.09, 0.28, 0.26, 0xf2c14e, -0.2, -0.45, -0.1, 0.7);
  }
  g.scale.setScalar(SPEC[type].scale);
  return { group: g, legs, arms, head, mats };
}

export class Enemies {
  constructor(scene, world, bursts) {
    this.scene = scene; this.world = world; this.bursts = bursts;
    this.list = []; this.arrows = [];
    this.sites = CASTLES.map((c) => ({ c, spawned: false, clearedAt: null, warned: false, drake: null }));
    this.kills = 0;
    this._v = new THREE.Vector3(); this._d = new THREE.Vector3(); this._q = new THREE.Quaternion();
    this.arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6);
    this.arrowMat = new THREE.MeshStandardMaterial({ color: 0xcaa56a, roughness: 0.8 });
    this.boltGeo = new THREE.SphereGeometry(0.26, 12, 8);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 3.0) });
    this.ballGeo = new THREE.SphereGeometry(0.55, 14, 10);
    this.ballMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.3, 0.25) });
  }

  spawnGarrison(site) {
    const { c } = site;
    const base = this.world.gen.castleBase(c);
    for (const [type, dx, dz, dy] of GARRISON) this.spawn(type, c.x + 0.5 + dx, base + dy, c.z + 0.5 + dz, site);
    site.drake = new Drake(this.scene, this.world, { x: c.x + 0.5, z: c.z + 0.5, base }, this);
    site.spawned = true;
  }

  spawn(type, x, feetY, z, site) {
    const spec = SPEC[type];
    const { group, legs, arms, head, mats } = humanoid(type);
    this.scene.add(group);
    const m = {
      site, type, spec, group, legs, arms, head, mats, hx: spec.hx, hy: spec.hy, hz: spec.hx,
      pos: new THREE.Vector3(x, feetY + spec.hy + 0.05, z), vel: new THREE.Vector3(),
      home: new THREE.Vector3(x, feetY + spec.hy + 0.05, z),
      yaw: Math.random() * 6.28, hp: spec.hp, cd: 1 + Math.random() * 2, swing: 0, burn: 0, freeze: 0, phase: 0, aggro: false, boltT: 3,
    };
    this.list.push(m);
    return m;
  }

  remove(m) {
    this.scene.remove(m.group);
    m.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const mat of m.mats.values()) mat.dispose();
    const i = this.list.indexOf(m); if (i >= 0) this.list.splice(i, 1);
  }

  clearSite(site) {
    for (const m of [...this.list]) if (m.site === site) this.remove(m);
    if (site.drake && !site.drake.dead) site.drake.dispose();
    site.drake = null;
    if (!this.sites.some((s) => s.spawned && s !== site)) { for (const a of this.arrows) this.scene.remove(a.mesh); this.arrows.length = 0; }
  }

  get drakes() { return this.sites.filter((s) => s.drake && !s.drake.dead).map((s) => s.drake); }

  // the boss bar: the Drake that is fighting you right now
  bossInfo() {
    let best = null;
    for (const d of this.drakes) if (d.engaged && (!best || d.hp < best.hp)) best = d;
    return best ? { name: 'Dread Drake', hp: best.hp, max: DRAKE_MAX_HP } : null;
  }

  // fire breath: anyone inside the cone takes damage
  burnCone(origin, dir, dt, range = 16, dps = 8) {
    for (const d of this.drakes) d.burnCone(origin, dir, dt);
    for (const m of this.list) {
      const v = this._v.copy(m.pos).sub(origin);
      const d = v.length();
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir) / d, -1, 1));
      if (ang > 0.2 + 0.9 / Math.max(d, 1.5)) continue;
      const hit = this.world.raycast(origin, v.clone().normalize(), d);
      if (hit && hit.t < d - 1.5) continue;
      m.hp -= dps * dt * (m.freeze > 0 ? 2 : 1); m.burn = 0.3; m.aggro = true; // frozen guards shatter
    }
  }

  // ice breath: guards stop moving and can't attack while frozen
  freezeCone(origin, dir, dt, range = 16) {
    for (const d of this.drakes) d.freezeCone(origin, dir, dt);
    for (const m of this.list) {
      const v = this._v.copy(m.pos).sub(origin);
      const d = v.length();
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir) / d, -1, 1));
      if (ang > 0.25 + 0.9 / Math.max(d, 1.5)) continue;
      const hit = this.world.raycast(origin, v.clone().normalize(), d);
      if (hit && hit.t < d - 1.5) continue;
      m.freeze = Math.max(m.freeze, 2.5); m.hp -= 1.5 * dt; m.aggro = true;
    }
  }

  kill(m, hooks) {
    const p = m.pos;
    this.bursts.burst(p.x, p.y, p.z, 0xffb347, 16, 5, 0.22, 2, 6);
    this.bursts.burst(p.x, p.y, p.z, 0x555555, 10, 3, 0.2, 3, 3);
    this.kills++;
    if (m.type === 'boss') {
      for (let i = 0; i < 4; i++) hooks.drop('apple', p.x, p.y, p.z);
      for (let i = 0; i < 3; i++) hooks.drop('meat', p.x, p.y, p.z);
      hooks.toast('You defeated the Castle Lord! The castle is yours!');
    } else if (Math.random() < 0.5) hooks.drop(Math.random() < 0.5 ? 'meat' : 'apple', p.x, p.y, p.z);
    this.remove(m);
  }

  fire(from, target, speed, kind, spread, tVel) {
    if (this.arrows.length >= MAX_ARROWS) return;
    const d = from.distanceTo(target);
    const t = d / speed;
    const aim = this._v.copy(target).addScaledVector(tVel, t * 0.7);
    aim.x += (Math.random() - 0.5) * spread; aim.y += (Math.random() - 0.5) * spread * 0.6; aim.z += (Math.random() - 0.5) * spread;
    const grav = kind === 'arrow' ? ARROW_GRAVITY : 0;
    aim.y += 0.5 * grav * t * t;
    const vel = aim.sub(from).normalize().multiplyScalar(speed);
    const geo = kind === 'arrow' ? this.arrowGeo : kind === 'fireball' ? this.ballGeo : this.boltGeo;
    const mat = kind === 'arrow' ? this.arrowMat : kind === 'fireball' ? this.ballMat : this.boltMat;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = kind === 'arrow';
    mesh.position.copy(from);
    this.scene.add(mesh);
    this.arrows.push({ mesh, pos: from.clone(), vel, kind, life: 6, dmg: kind === 'fireball' ? 4 : kind === 'bolt' ? 4 : 2, grav });
  }

  lineOfSight(from, to) {
    const dir = this._d.copy(to).sub(from);
    const dist = dir.length();
    if (dist < 0.1) return true;
    dir.divideScalar(dist);
    const hit = this.world.raycast(from, dir, dist);
    return !hit || hit.t > dist - 1;
  }

  step(m, dt, player, hooks) {
    const w = this.world;
    if (!w.isLoaded(m.pos.x, m.pos.z)) return;
    const tx = player.pos.x - m.pos.x, tz = player.pos.z - m.pos.z, ty = player.pos.y - m.pos.y;
    const dist2d = Math.hypot(tx, tz), dist = Math.hypot(dist2d, ty);
    m.freeze = Math.max(0, m.freeze - dt);
    const frozen = m.freeze > 0;
    if (!frozen) m.cd -= dt;
    let speed = 0, face = null;
    const eye = this._e ??= new THREE.Vector3();
    eye.set(m.pos.x, m.pos.y + m.hy * 0.9, m.pos.z);

    if (frozen) { /* stuck in ice */ }
    else if (m.type === 'archer') {
      m.aggro = !player.dead && dist < m.spec.sight && this.lineOfSight(eye, player.pos);
      if (m.aggro) {
        face = [tx, tz];
        m.arms[0].rotation.x = -1.3 + Math.sin(performance.now() / 300) * 0.03;
        if (m.cd <= 0) { m.cd = 2.6 + Math.random() * 1.2; this.fire(eye, player.pos, ARROW_SPEED, 'arrow', 1.4, player.vel); }
      }
    } else {
      const fromHome = m.home.distanceTo(m.pos);
      const reachable = Math.abs(ty) < 7 || player.pos.y < m.pos.y + 3;
      if (!player.dead && dist2d < m.spec.sight && fromHome < 40 && reachable) m.aggro = true;
      else if (dist2d > m.spec.sight * 1.6 || fromHome > 44 || player.dead) m.aggro = false;
      if (m.aggro && dist2d > 1.5) { face = [tx, tz]; speed = m.spec.speed; }
      else if (m.aggro) face = [tx, tz];
      else if (fromHome > 2.5) { face = [m.home.x - m.pos.x, m.home.z - m.pos.z]; speed = m.spec.speed * 0.6; }
      // melee
      if (m.aggro && dist2d < 1.8 * m.spec.scale && Math.abs(ty) < 2.4 * m.spec.scale && m.cd <= 0) {
        m.cd = 1.2; m.swing = 0.35;
        hooks.hit(m.spec.dmg, m.type);
      }
      // the lord also hurls magic bolts
      if (m.type === 'boss' && m.aggro) {
        m.boltT -= dt;
        if (m.boltT <= 0 && dist < 45 && this.lineOfSight(eye, player.pos)) { m.boltT = 3.2; this.fire(eye.clone().setY(eye.y + 0.4), player.pos, 17, 'bolt', 1.0, player.vel); }
      }
    }

    if (face) {
      const want = Math.atan2(-face[0], -face[1]);
      const d = Math.atan2(Math.sin(want - m.yaw), Math.cos(want - m.yaw));
      m.yaw += d * (1 - Math.exp(-8 * dt));
    }
    const k = 1 - Math.exp(-10 * dt);
    m.vel.x += (-Math.sin(m.yaw) * speed - m.vel.x) * k;
    m.vel.z += (-Math.cos(m.yaw) * speed - m.vel.z) * k;
    m.vel.y = Math.max(-40, m.vel.y - 28 * dt);
    const hit = moveBox(w, m.pos, m.vel, m.hx, m.hy, m.hz, dt);
    if ((hit.x || hit.z) && hit.ground && speed > 0) m.vel.y = 8.5; // hop up steps
    if (m.pos.y < -10) m.hp = 0;

    m.group.position.set(m.pos.x, m.pos.y - m.hy - 0.05, m.pos.z);
    m.group.rotation.y = m.yaw;
    const hs = Math.hypot(m.vel.x, m.vel.z);
    m.phase += dt * hs * 4.2;
    const sw = Math.min(1, hs / 2) * 0.7;
    m.legs[0].rotation.x = Math.sin(m.phase) * sw; m.legs[1].rotation.x = -Math.sin(m.phase) * sw;
    if (m.type !== 'archer') {
      m.swing = Math.max(0, m.swing - dt);
      m.arms[1].rotation.x = m.swing > 0 ? -2.2 + (0.35 - m.swing) * 7 : -Math.sin(m.phase) * sw * 0.8;
      m.arms[0].rotation.x = Math.sin(m.phase) * sw * 0.8;
    }
    if (m.burn > 0) {
      m.burn -= dt;
      const glow = 0.5 + 0.5 * Math.sin(performance.now() / 40);
      for (const mat of m.mats.values()) mat.emissive.setRGB(0.9 * glow, 0.35 * glow, 0.05);
    } else if (frozen) for (const mat of m.mats.values()) mat.emissive.setRGB(0.12, 0.3, 0.55);
    else for (const [key, mat] of m.mats) { const glow = Number(key.split(':')[1]); if (glow) mat.emissive.copy(mat.color); else mat.emissive.setRGB(0, 0, 0); }
  }

  // hooks: { hit(dmg, source), drop(type, x, y, z), toast(text) }
  update(dt, player, hooks) {
    const now = performance.now() / 1000;
    for (const site of this.sites) {
      const { c } = site;
      const dc = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (!site.warned && dc < 100) { site.warned = true; hooks.toast(c.id === 0 ? 'A castle! Its guards (and a dragon) have spotted you…' : 'Another castle! Beware its Dread Drake…'); }
      if (!site.spawned && dc < SPAWN_RANGE && this.world.isLoaded(c.x, c.z) && (site.clearedAt === null || (now - site.clearedAt > 240 && dc > 90))) {
        site.clearedAt = null;
        this.spawnGarrison(site);
      }
      if (site.spawned && dc > DESPAWN_RANGE) { this.clearSite(site); site.spawned = false; }
      if (site.drake) site.drake.update(dt, player, hooks);
      if (site.spawned && !this.list.some((m) => m.site === site) && !(site.drake && !site.drake.dead) && site.clearedAt === null) {
        site.clearedAt = now; site.spawned = false; site.drake = null;
      }
    }

    for (const m of [...this.list]) {
      this.step(m, dt, player, hooks);
      if (m.hp <= 0) this.kill(m, hooks);
    }

    // arrows and bolts
    for (const a of [...this.arrows]) {
      a.life -= dt;
      a.vel.y -= a.grav * dt;
      const step = a.vel.length() * dt;
      const dir = this._d.copy(a.vel).normalize();
      const hit = this.world.raycast(a.pos, dir, step + 0.1);
      a.pos.addScaledVector(dir, step);
      a.mesh.position.copy(a.pos);
      if (a.kind === 'arrow') a.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      let done = a.life <= 0 || !!hit;
      if (!player.dead && a.pos.distanceTo(player.pos) < 1.3) { hooks.hit(a.dmg, a.kind); done = true; }
      if (done) {
        if (hit || a.kind !== 'arrow') this.bursts.burst(a.pos.x, a.pos.y, a.pos.z, a.kind === 'bolt' ? 0xc050ff : a.kind === 'fireball' ? 0xff8a30 : 0xcaa56a, a.kind === 'fireball' ? 14 : 5, a.kind === 'fireball' ? 5 : 2, a.kind === 'fireball' ? 0.25 : 0.1, 1);
        this.scene.remove(a.mesh);
        this.arrows.splice(this.arrows.indexOf(a), 1);
      }
    }
  }
}
