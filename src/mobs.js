// Friendly animals (food!) and the items they drop. Fire breath cooks them.
import * as THREE from 'three';
import { B } from './blocks.js';
import { HEIGHT } from './worldgen.js';
import { moveBox, boxCollides } from './physics.js';
import { softGeometry } from './soft.js';

const MAX_MOBS = 22;

// Each builder returns { group, legs, head } with the model's feet at y = 0, facing -Z.
function builder(mat) {
  const part = (parent, w, h, d, color, x, y, z) => {
    // thin patches (cow spots) stay flat; everything else is a rounded blob
    const geo = Math.min(w, h, d) < 0.05 ? new THREE.BoxGeometry(w, h, d) : softGeometry(w, h, d, 0.78);
    const m = new THREE.Mesh(geo, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  const leg = (parent, w, h, color, x, z) => {
    const g = new THREE.Group();
    g.position.set(x, h, z);
    part(g, w, h + 0.16, w, color, 0, -h / 2 + 0.08, 0); // reaches up into the body
    parent.add(g);
    return g;
  };
  return { part, leg };
}

const KINDS = {
  pig: {
    hp: 10, speed: 1.7, half: [0.45, 0.45, 0.55],
    build(g, mat) {
      const { part, leg } = builder(mat);
      part(g, 0.8, 0.65, 1.1, 0xf2a0b0, 0, 0.62, 0);
      const head = new THREE.Group(); head.position.set(0, 0.75, -0.62); g.add(head);
      part(head, 0.6, 0.55, 0.5, 0xf2a0b0, 0, 0, 0);
      part(head, 0.3, 0.22, 0.14, 0xe48a9c, 0, -0.08, -0.3);
      part(head, 0.14, 0.14, 0.08, 0xf2a0b0, 0.22, 0.32, 0.05);
      part(head, 0.14, 0.14, 0.08, 0xf2a0b0, -0.22, 0.32, 0.05);
      return { head, legs: [leg(g, 0.2, 0.3, 0xe48a9c, 0.25, -0.38), leg(g, 0.2, 0.3, 0xe48a9c, -0.25, -0.38), leg(g, 0.2, 0.3, 0xe48a9c, 0.25, 0.38), leg(g, 0.2, 0.3, 0xe48a9c, -0.25, 0.38)] };
    },
  },
  cow: {
    hp: 14, speed: 1.4, half: [0.5, 0.6, 0.65],
    build(g, mat) {
      const { part, leg } = builder(mat);
      part(g, 0.9, 0.8, 1.3, 0xf4f1ea, 0, 0.9, 0);
      part(g, 0.5, 0.4, 0.02, 0x2a2a2a, 0.2, 1.05, -0.66);
      part(g, 0.02, 0.45, 0.5, 0x2a2a2a, 0.46, 0.95, 0.15);
      part(g, 0.02, 0.4, 0.45, 0x2a2a2a, -0.46, 0.85, -0.2);
      const head = new THREE.Group(); head.position.set(0, 1.1, -0.78); g.add(head);
      part(head, 0.6, 0.55, 0.5, 0xf4f1ea, 0, 0, 0);
      part(head, 0.4, 0.25, 0.12, 0xe9b6a5, 0, -0.14, -0.3);
      part(head, 0.1, 0.22, 0.1, 0xe8dcc0, 0.3, 0.3, 0);
      part(head, 0.1, 0.22, 0.1, 0xe8dcc0, -0.3, 0.3, 0);
      const c = 0x2a2a2a;
      return { head, legs: [leg(g, 0.24, 0.5, c, 0.28, -0.45), leg(g, 0.24, 0.5, c, -0.28, -0.45), leg(g, 0.24, 0.5, c, 0.28, 0.45), leg(g, 0.24, 0.5, c, -0.28, 0.45)] };
    },
  },
  sheep: {
    hp: 10, speed: 1.5, half: [0.5, 0.55, 0.6],
    build(g, mat) {
      const { part, leg } = builder(mat);
      part(g, 0.95, 0.8, 1.15, 0xf6f4ef, 0, 0.85, 0);
      const head = new THREE.Group(); head.position.set(0, 0.95, -0.66); g.add(head);
      part(head, 0.42, 0.45, 0.45, 0xc9b79c, 0, 0, 0);
      part(head, 0.5, 0.2, 0.4, 0xf6f4ef, 0, 0.28, 0.05);
      const c = 0xc9b79c;
      return { head, legs: [leg(g, 0.2, 0.45, c, 0.28, -0.4), leg(g, 0.2, 0.45, c, -0.28, -0.4), leg(g, 0.2, 0.45, c, 0.28, 0.4), leg(g, 0.2, 0.45, c, -0.28, 0.4)] };
    },
  },
  chicken: {
    hp: 4, speed: 1.9, half: [0.25, 0.3, 0.3],
    build(g, mat) {
      const { part, leg } = builder(mat);
      part(g, 0.4, 0.38, 0.5, 0xfafafa, 0, 0.4, 0);
      part(g, 0.14, 0.28, 0.34, 0xf0f0f0, 0.22, 0.45, 0.06);
      part(g, 0.14, 0.28, 0.34, 0xf0f0f0, -0.22, 0.45, 0.06);
      const head = new THREE.Group(); head.position.set(0, 0.7, -0.26); g.add(head);
      part(head, 0.24, 0.26, 0.24, 0xfafafa, 0, 0, 0);
      part(head, 0.12, 0.08, 0.14, 0xf59a23, 0, -0.03, -0.16);
      part(head, 0.08, 0.1, 0.12, 0xd62828, 0, 0.17, -0.02);
      const c = 0xf2c14e;
      return { head, legs: [leg(g, 0.06, 0.22, c, 0.1, 0.02), leg(g, 0.06, 0.22, c, -0.1, 0.02)] };
    },
  },
};
const KIND_LIST = ['pig', 'cow', 'sheep', 'sheep', 'chicken', 'pig', 'cow'];

export class Mobs {
  constructor(scene, world, bursts) {
    this.scene = scene;
    this.world = world;
    this.bursts = bursts;
    this.list = [];
    this.drops = [];
    this.spawnT = 0;
    this._v = new THREE.Vector3();
    this.dropGeo = new THREE.SphereGeometry(0.24, 14, 10);
    this.dropMats = {
      apple: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0353b).multiplyScalar(1.3) }),
      meat: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc86a2a).multiplyScalar(1.5) }),
    };
  }

  // ---- animals ----
  spawn(kind, x, y, z) {
    const spec = KINDS[kind];
    const mats = new Map();
    const mat = (c) => { let m = mats.get(c); if (!m) { m = new THREE.MeshLambertMaterial({ color: c, emissive: 0x000000 }); mats.set(c, m); } return m; };
    const group = new THREE.Group();
    const model = new THREE.Group();
    group.add(model);
    const { legs, head } = spec.build(model, mat);
    this.scene.add(group);
    const [hx, hy, hz] = spec.half;
    const m = {
      kind, spec, group, model, legs, head, mats, hx, hy, hz,
      pos: new THREE.Vector3(x, y + hy + 0.05, z), vel: new THREE.Vector3(),
      yaw: Math.random() * 6.28, heading: Math.random() * 6.28, hp: spec.hp,
      t: Math.random() * 2, walking: false, panic: 0, burn: 0, phase: 0, onGround: false,
    };
    this.list.push(m);
    return m;
  }

  trySpawn(px, py, pz) {
    if (this.list.length >= MAX_MOBS) return;
    const a = Math.random() * Math.PI * 2, d = 22 + Math.random() * 40;
    const x = Math.floor(px + Math.cos(a) * d), z = Math.floor(pz + Math.sin(a) * d);
    if (!this.world.isLoaded(x, z)) return;
    const start = Math.min(HEIGHT - 2, Math.floor(py) + 30);
    for (let y = start; y > 3; y--) {
      const b = this.world.getBlock(x, y, z);
      if (b === B.AIR) continue;
      if (b === B.GRASS && this.world.getBlock(x, y + 1, z) === B.AIR && this.world.getBlock(x, y + 2, z) === B.AIR) {
        const kind = KIND_LIST[Math.floor(Math.random() * KIND_LIST.length)];
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.spawn(kind, x + 0.5 + i * 1.2, y + 1, z + 0.5 + (Math.random() - 0.5));
      }
      return; // first solid/liquid block from the top decides
    }
  }

  remove(m) {
    this.scene.remove(m.group);
    m.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const mat of m.mats.values()) mat.dispose();
    this.list.splice(this.list.indexOf(m), 1);
  }

  // damage from fire: anything inside the breath cone takes damage and panics
  burnCone(origin, dir, dt, range = 15, dps = 8) {
    for (const m of [...this.list]) {
      const v = this._v.copy(m.pos).sub(origin);
      const d = v.length();
      if (d > range || d < 0.01) continue;
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(dir) / d, -1, 1));
      if (ang > 0.2 + 0.8 / Math.max(d, 1.5)) continue;
      const hit = this.world.raycast(origin, v.clone().normalize(), d);
      if (hit && hit.t < d - 1.2) continue;
      this.hurt(m, dps * dt, origin);
    }
  }

  hurt(m, amount, from) {
    m.hp -= amount;
    m.burn = 0.3;
    m.panic = 3;
    if (from) m.heading = Math.atan2(m.pos.x - from.x, m.pos.z - from.z) + Math.PI + (Math.random() - 0.5);
    if (m.hp <= 0) this.kill(m);
  }

  kill(m) {
    this.bursts.burst(m.pos.x, m.pos.y, m.pos.z, 0xffb347, 14, 5, 0.22, 2, 6);
    this.bursts.burst(m.pos.x, m.pos.y, m.pos.z, 0x555555, 8, 3, 0.2, 3, 3);
    const n = m.kind === 'chicken' ? 1 : 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) this.spawnDrop('meat', m.pos.x, m.pos.y, m.pos.z);
    this.remove(m);
  }

  step(m, dt, player) {
    const w = this.world;
    if (!w.isLoaded(m.pos.x, m.pos.z)) return;
    m.t -= dt;
    let speed = 0;
    if (m.panic > 0) {
      m.panic -= dt;
      speed = m.spec.speed * 3;
    } else if (m.t <= 0) {
      m.walking = Math.random() < 0.55;
      m.t = 1 + Math.random() * 3;
      m.heading += (Math.random() - 0.5) * 3;
    }
    if (m.panic <= 0 && m.walking) speed = m.spec.speed;

    // turn toward heading
    const d = Math.atan2(Math.sin(m.heading - m.yaw), Math.cos(m.heading - m.yaw));
    m.yaw += d * (1 - Math.exp(-6 * dt));
    const targetVx = -Math.sin(m.yaw) * speed, targetVz = -Math.cos(m.yaw) * speed;
    const k = 1 - Math.exp(-8 * dt);
    m.vel.x += (targetVx - m.vel.x) * k;
    m.vel.z += (targetVz - m.vel.z) * k;
    m.vel.y -= 28 * dt;
    if (m.vel.y < -40) m.vel.y = -40;

    const inWater = w.getBlock(Math.floor(m.pos.x), Math.floor(m.pos.y), Math.floor(m.pos.z)) === B.WATER;
    if (inWater) { m.vel.y = Math.max(m.vel.y, -1); m.vel.y += 40 * dt; }

    const hit = moveBox(w, m.pos, m.vel, m.hx, m.hy, m.hz, dt);
    m.onGround = hit.ground;
    if ((hit.x || hit.z) && m.onGround && speed > 0) m.vel.y = 8.5; // hop up ledges
    if (hit.x || hit.z) m.heading += Math.PI * 0.6 * (Math.random() < 0.5 ? 1 : -1) * (m.panic > 0 ? 0.3 : 1);
    if (m.pos.y < -10) m.hp = 0;

    // visuals
    m.group.position.set(m.pos.x, m.pos.y - m.hy, m.pos.z);
    m.group.rotation.y = m.yaw;
    const hs = Math.hypot(m.vel.x, m.vel.z);
    m.phase += dt * hs * 5;
    const swing = Math.min(1, hs / 1.5) * 0.7;
    m.legs.forEach((l, i) => { l.rotation.x = Math.sin(m.phase + (i % 3 === 0 ? 0 : Math.PI)) * swing; });
    m.head.rotation.x = Math.sin(performance.now() / 700 + m.pos.x) * 0.08 + (m.walking ? 0 : 0.15);
    if (m.burn > 0) {
      m.burn -= dt;
      const glow = 0.5 + 0.5 * Math.sin(performance.now() / 40);
      for (const mat of m.mats.values()) mat.emissive.setRGB(0.9 * glow, 0.35 * glow, 0.05);
    } else for (const mat of m.mats.values()) mat.emissive.setRGB(0, 0, 0);
  }

  // ---- drops ----
  spawnDrop(type, x, y, z) {
    const mesh = new THREE.Mesh(this.dropGeo, this.dropMats[type]);
    mesh.position.set(x, y + 0.4, z);
    this.scene.add(mesh);
    this.drops.push({
      type, mesh, pos: new THREE.Vector3(x, y + 0.4, z),
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, 5, (Math.random() - 0.5) * 3), life: 150, age: Math.random() * 6,
    });
  }

  update(dt, player, onPickup) {
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 0.8; this.trySpawn(player.pos.x, player.pos.y, player.pos.z); }

    for (const m of [...this.list]) {
      const dx = m.pos.x - player.pos.x, dz = m.pos.z - player.pos.z;
      if (dx * dx + dz * dz > 95 * 95) { this.remove(m); continue; }
      this.step(m, dt, player);
      if (m.hp <= 0 && this.list.includes(m)) this.remove(m);
    }

    for (const d of [...this.drops]) {
      d.life -= dt; d.age += dt;
      d.vel.y -= 24 * dt;
      d.pos.x += d.vel.x * dt; d.pos.z += d.vel.z * dt;
      const ny = d.pos.y + d.vel.y * dt;
      if (boxCollides(this.world, d.pos.x, ny, d.pos.z, 0.2, 0.2, 0.2)) { d.vel.y = 0; d.vel.x *= 0.8; d.vel.z *= 0.8; }
      else d.pos.y = ny;
      d.mesh.position.set(d.pos.x, d.pos.y + Math.sin(d.age * 3) * 0.06 + 0.1, d.pos.z);
      d.mesh.rotation.y = d.age * 2;
      const near = d.pos.distanceTo(player.pos) < 2.4;
      if (near && d.age > 0.5) {
        onPickup(d.type);
        this.scene.remove(d.mesh);
        this.drops.splice(this.drops.indexOf(d), 1);
      } else if (d.life <= 0) {
        this.scene.remove(d.mesh);
        this.drops.splice(this.drops.indexOf(d), 1);
      }
    }
  }
}
