// A Labyrinth: a huge roofed maze full of traps. Reach the pedestal at the far end for its apple: the Giant Maze's
// Golden Apple (10 minutes of invincibility) or the Volcano Maze's Master Apple (the Annihilate attack). The layout is a pure function (seeded), so every player gets the same maze.
// Traps: arrow turrets in the walls, floor flame jets (the floor warms up first) and timed spike gates.
import * as THREE from 'three';
import { TrapField } from './traps.js';

// world position of the middle of unit (gx, gz), at the floor surface
export function mazeCell(m, gx, gz, base) {
  return new THREE.Vector3(m.x + gx * m.U + 1 - m.HALF + 0.5, base + 1, m.z + gz * m.U + 1 - m.HALF + 0.5);
}

export class Labyrinth {
  // host: the Enemies instance (for arrows). hooks: { hit(dmg, source), toast(text), golden() }
  constructor(scene, world, host, bursts, room, maze) {
    this.m = maze;
    this.scene = scene; this.world = world; this.host = host; this.bursts = bursts; this.room = room;
    this.spawned = false; this.apple = null; this.warned = false; this.time = 0;
    this.field = new TrapField(scene, world, host, bursts);
  }

  get traps() { return this.field.list; }

  get center() { return this._c ??= new THREE.Vector3(this.m.x + 0.5, 0, this.m.z + 0.5); }
  appleKey() { return this.m.apple === 'master' ? `dragoncraft:master:${this.room}` : `dragoncraft:goldapple:${this.room}`; }
  // the Golden Apple comes back 20 minutes after you eat it; the Master Apple is yours for good once taken
  appleReady() {
    try {
      const t = Number(localStorage.getItem(this.appleKey())) || 0;
      return this.m.apple === 'master' ? !t : t + 20 * 60 * 1000 < Date.now();
    } catch { return true; }
  }

  spawn() {
    const base = this.world.gen.mazeBase(this.m);
    const info = this.m.info();
    this.base = base;
    const descs = [];
    for (const t of info.traps.values()) {
      const c = mazeCell(this.m, t.gx, t.gz, base);
      descs.push({ kind: t.kind, x: c.x, y: c.y, z: c.z, phase: t.phase, ammo: this.m.theme.ammo, wall: t.wall, axis: t.axis });
    }
    this.field.add(descs);
    // the golden apple on its pedestal at the far end
    if (this.appleReady()) {
      const g = mazeCell(this.m, info.goal[0], info.goal[1], base);
      const master = this.m.apple === 'master';
      const mat = new THREE.MeshBasicMaterial({ color: master ? new THREE.Color(2.8, 0.5, 3.4) : new THREE.Color(3.4, 2.4, 0.4) });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), mat);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: master ? new THREE.Color(3, 3, 3.6) : new THREE.Color(0.4, 2.2, 0.4) })); leaf.position.set(0.1, 0.45, 0);
      mesh.add(leaf);
      this.apple = { mesh, pos: new THREE.Vector3(g.x, g.y + 1.9, g.z) };
      mesh.position.copy(this.apple.pos);
      this.scene.add(mesh);
    }
    this.spawned = true;
  }

  despawn() {
    this.field.clear();
    if (this.apple) { this.scene.remove(this.apple.mesh); this.apple = null; }
    this.spawned = false;
  }

  update(dt, player, hooks) {
    this.time += dt;
    const dc = Math.hypot(player.pos.x - this.center.x, player.pos.z - this.center.z);
    if (!this.warned && dc < 140) { this.warned = true; hooks.toast(this.m.warn); }
    if (!this.spawned && dc < 150 && this.world.isLoaded(this.m.x, this.m.z)) this.spawn();
    if (this.spawned && dc > 240) this.despawn();
    if (!this.spawned) return;

    const p = player.pos, base = this.base;
    const inside = dc < this.m.reach && p.y < base + 7;
    this.field.update(dt, player, hooks, inside);

    if (this.apple) {
      this.apple.mesh.position.set(this.apple.pos.x, this.apple.pos.y + Math.sin(this.time * 2.4) * 0.12, this.apple.pos.z);
      this.apple.mesh.rotation.y += dt * 1.5;
      if (Math.random() < 0.3) this.bursts.burst(this.apple.pos.x, this.apple.pos.y, this.apple.pos.z, 0xffd23f, 1, 1.2, 0.1, 1.5, 0);
      if (!player.dead && p.distanceTo(this.apple.pos) < 2.4) {
        this.bursts.burst(this.apple.pos.x, this.apple.pos.y, this.apple.pos.z, 0xffd23f, 40, 7, 0.22, 3, 4);
        this.scene.remove(this.apple.mesh); this.apple = null;
        try { localStorage.setItem(this.appleKey(), String(Date.now())); } catch { /* ignore */ }
        hooks[this.m.apple]();
      }
    }
  }
}
