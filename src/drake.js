// The Dread Drake: a big enemy dragon that guards a castle. It perches on the keep, then circles, hurls fireballs,
// dives to bite, and (when badly hurt) breathes fire. Fire only hurts it a little; ice slows it. Hard on purpose.
import * as THREE from 'three';
import { Dragon } from './dragon.js';

export const DRAKE_LOOK = {
  name: 'Dread Drake', body: 0x4a1216, belly: 0x2b1214, accent: 0xffa21a, wing: 0x2a0b0e, eye: 0xff3b1f,
  horns: 'long', tail: 'club', wings: 'spiky', spikes: 'spikes', pattern: 'none', snout: 'long', glow: true,
};
export const DRAKE_MAX_HP = 90;
const SCALE = 1.8, RADIUS = 2.4;

const rand = (a, b) => a + Math.random() * (b - a);

export class Drake {
  // site: { x, z, base } where base is the castle's courtyard floor layer
  constructor(scene, world, site, host) {
    this.scene = scene; this.world = world; this.site = site; this.host = host;
    this.dragon = new Dragon(DRAKE_LOOK);
    this.dragon.root.scale.setScalar(SCALE);
    this.dragon.label.scale.set(2.2, 0.55, 1);
    this.dragon.label.position.y = 3.4;
    scene.add(this.dragon.root);
    this.perch = new THREE.Vector3(site.x - 1.5, site.base + 16 + 1.9, site.z + 2.5);
    this.pos = this.perch.clone();
    this.vel = new THREE.Vector3();
    this.hp = DRAKE_MAX_HP;
    this.state = 'perch';
    this.t = 0; this.shots = 0; this.shotT = 0; this.angle = Math.random() * 6.28; this.dir = Math.random() < 0.5 ? 1 : -1;
    this.yaw = Math.PI; this.frost = false; this.chill = 0; this.flash = 0; this.biteDone = false; this.breathHit = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._m = new THREE.Vector3(); this._a = new THREE.Vector3();
    this.dead = false;
  }

  get engaged() { return this.state !== 'perch' && this.state !== 'return'; }

  setState(s, t = 0) { this.state = s; this.t = t; this.shots = 0; this.shotT = 0; this.biteDone = false; }

  // damage from the player's breath
  hurt(amount, kind) {
    if (this.dead) return;
    if (kind === 'ice') { this.chill = 3; this.hp -= amount * 0.7; }
    else if (kind === 'bolt') this.hp -= amount; // lightning, blasts and roars go straight through the scales
    else this.hp -= amount * (this.chill > 0 ? 1 : 0.8); // thick scales: fire does a bit less
    this.flash = 0.12;
    if (this.state === 'perch' || this.state === 'return') this.setState('circle', 3);
  }

  cone(origin, dir, dt, range, widen, dps, kind) {
    const v = this._v.copy(this.pos).sub(origin);
    const d = v.length();
    if (d > range + RADIUS || d < 0.01) return;
    const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir) / d, -1, 1));
    if (ang > widen + 0.9 / Math.max(d, 1.5) + Math.atan(RADIUS / d)) return;
    const hit = this.world.raycast(origin, v.clone().normalize(), d);
    if (hit && hit.t < d - 3.5) return;
    this.hurt(dps * dt, kind);
  }
  burnCone(origin, dir, dt) { this.cone(origin, dir, dt, 18, 0.2, 8, 'fire'); }
  freezeCone(origin, dir, dt) { this.cone(origin, dir, dt, 18, 0.25, 4, 'ice'); }

  steer(target, maxSpeed, dt, snap = 2.2) {
    const to = this._w.copy(target).sub(this.pos);
    const dist = to.length();
    if (dist > 0.01) to.multiplyScalar(Math.min(maxSpeed, dist * 2) / dist);
    this.vel.lerp(to, 1 - Math.exp(-snap * dt));
    this.pos.addScaledVector(this.vel, dt);
  }

  groundFloor(x, z) {
    const s = this.site;
    const inCastle = Math.abs(x - s.x) < 22 && Math.abs(z - s.z) < 22;
    return inCastle ? s.base + 26 : this.world.gen.height(Math.floor(x), Math.floor(z)) + 5;
  }

  update(dt, player, hooks) {
    if (this.dead) return;
    const s = this.site;
    const pp = player.pos;
    const toP = this._m.copy(pp).sub(this.pos);
    const dist = toP.length();
    const castleDist = Math.hypot(pp.x - s.x, pp.z - s.z);
    this.chill = Math.max(0, this.chill - dt);
    this.flash = Math.max(0, this.flash - dt);
    const mul = this.chill > 0 ? 0.45 : 1;
    const enraged = this.hp < DRAKE_MAX_HP * 0.5;
    const away = this._a.set(this.pos.x - pp.x, 0, this.pos.z - pp.z).normalize();
    this.t -= dt;
    let faceTarget = false, breathing = false;

    if (this.state === 'perch') {
      this.pos.lerp(this.perch, 1 - Math.exp(-3 * dt)); this.vel.set(0, 0, 0);
      if (!player.dead && castleDist < 80) { this.setState('circle', 2); hooks.toast('The Dread Drake awakens!'); }
    } else if (player.dead || castleDist > 150) {
      if (this.state !== 'return') this.setState('return');
    }

    switch (this.state) {
      case 'return': {
        this.steer(this.perch, 16, dt);
        this.hp = Math.min(DRAKE_MAX_HP, this.hp + 12 * dt);
        if (this.pos.distanceTo(this.perch) < 1.5) this.setState('perch');
        break;
      }
      case 'circle': {
        this.angle += dt * 0.45 * this.dir * mul;
        const R = 22;
        const target = this._v.set(pp.x + Math.cos(this.angle) * R, pp.y + 8 + Math.sin(this.angle * 2) * 2, pp.z + Math.sin(this.angle) * R);
        this.steer(target, 14 * mul, dt);
        if (this.t <= 0) {
          const r = Math.random();
          if (enraged && r < 0.3) { this.setState('breath', 3.4); this.frost = Math.random() < 0.5; }
          else if (r < (enraged ? 0.6 : 0.4)) { this.setState('swoop', 3); this.dir = -this.dir; }
          else this.setState('volley', 6);
        }
        break;
      }
      case 'volley': {
        faceTarget = true;
        const target = this._v.set(pp.x + away.x * 26, pp.y + 7, pp.z + away.z * 26);
        this.steer(target, 8 * mul, dt);
        this.shotT -= dt;
        const maxShots = enraged ? 3 : 2;
        if (this.t < 6 - 0.9 && this.shotT <= 0 && this.shots < maxShots && this.chill <= 0) {
          this.shotT = 1.1; this.shots++;
          this.dragon.root.updateMatrixWorld(true);
          this.dragon.mouthWorld(this._v);
          const from = this._v.clone();
          for (const off of [-1, 0, 1]) {
            const t = pp.clone(); t.x += off * 4 * Math.cos(this.yaw); t.z -= off * 4 * Math.sin(this.yaw);
            this.host.fire(from, t, 21, 'fireball', 0.6, player.vel);
          }
        }
        breathing = this.shotT > 0.7;
        if (this.shots >= maxShots && this.shotT <= 0) this.setState('circle', rand(3.5, 5.5));
        break;
      }
      case 'swoop': {
        const target = this._v.copy(pp);
        this.steer(target, 27 * mul, dt, 3.2);
        if (!this.biteDone && dist < 5.5) { this.biteDone = true; hooks.hit(4, 'dragon'); this.setState('recover', 1.8); this.biteDone = true; }
        else if (this.t <= 0) this.setState('recover', 1.6);
        break;
      }
      case 'recover': {
        const target = this._v.set(pp.x + away.x * 24, pp.y + 20, pp.z + away.z * 24);
        this.steer(target, 18 * mul, dt);
        if (this.t <= 0) this.setState('circle', rand(4, 6));
        break;
      }
      case 'breath': {
        faceTarget = true; breathing = true;
        const target = this._v.set(pp.x + away.x * 12, pp.y + 3, pp.z + away.z * 12);
        this.steer(target, 11 * mul, dt);
        if (this.chill <= 0) {
          this.dragon.root.updateMatrixWorld(true);
          this.dragon.mouthWorld(this._v);
          const aim = this._a.copy(pp).sub(this._v).normalize();
          if (this.frost) hooks.iceBreath(this._v, aim, dt); else hooks.fireBreath(this._v, aim, dt);
          this.breathHit -= dt;
          if (this.breathHit <= 0 && this._v.distanceTo(pp) < 18) {
            this.breathHit = 0.5;
            hooks.hit(this.frost ? 1.5 : 2, 'dragon');
            if (this.frost) hooks.chill(2.5);
          }
        }
        if (this.t <= 0) this.setState('circle', rand(3, 5));
        break;
      }
      default: break;
    }

    // stay off the ground and out of the castle's stonework
    if (this.state !== 'perch' && this.state !== 'return') {
      const floor = this.groundFloor(this.pos.x, this.pos.z);
      if (this.pos.y < floor) this.pos.y += (floor - this.pos.y) * Math.min(1, dt * 4);
    }

    // pose
    const hs = Math.hypot(this.vel.x, this.vel.z), speed = this.vel.length();
    let wantYaw = this.yaw;
    if (faceTarget || (this.state === 'perch' && castleDist < 120)) wantYaw = Math.atan2(-(pp.x - this.pos.x), -(pp.z - this.pos.z));
    else if (hs > 1.5) wantYaw = Math.atan2(-this.vel.x, -this.vel.z);
    const dyaw = Math.atan2(Math.sin(wantYaw - this.yaw), Math.cos(wantYaw - this.yaw));
    this.yaw += dyaw * (1 - Math.exp(-4 * dt));
    const pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(this.vel.y / Math.max(speed, 1), -1, 1)), -0.7, 0.7);
    const flying = this.state !== 'perch';
    this.dragon.root.position.copy(this.pos);
    this.dragon.update(dt, {
      flying, speed: hs, vy: this.vel.y, boosting: this.state === 'swoop', yaw: this.yaw, pitch: flying ? pitch : 0,
      roll: THREE.MathUtils.clamp(-dyaw * 0.8, -0.6, 0.6), lookYaw: 0, lookPitch: 0, breathing,
    });
    const f = this.flash > 0 ? 0.7 : 0;
    this.dragon.mats.body.emissive.setRGB(f, f * 0.25, 0);

    if (this.hp <= 0) this.die(hooks);
  }

  die(hooks) {
    this.dead = true;
    const p = this.pos;
    this.host.bursts.burst(p.x, p.y, p.z, 0xff8a30, 40, 9, 0.5, 2.5, 8);
    this.host.bursts.burst(p.x, p.y, p.z, 0x333333, 24, 6, 0.4, 3, 5);
    for (let i = 0; i < 6; i++) hooks.drop('apple', p.x, p.y - 1, p.z);
    for (let i = 0; i < 6; i++) hooks.drop('meat', p.x, p.y - 1, p.z);
    hooks.toast('You defeated the Dread Drake! Legendary!');
    this.dispose();
  }

  dispose() {
    this.scene.remove(this.dragon.root);
    this.dragon.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
}
