// The Labyrinth: a huge roofed maze full of traps. Reach the pedestal at the far end for the Golden Apple
// (10 minutes of invincibility). The layout is a pure function (seeded), so every player gets the same maze.
// Traps: arrow turrets in the walls, floor flame jets (the floor warms up first) and timed spike gates.
import * as THREE from 'three';
import { MAZE, mazeInfo, U, G, HALF } from './mazegen.js';

// world position of the middle of unit (gx, gz), at the floor surface
export function mazeCell(gx, gz, base) {
  return new THREE.Vector3(MAZE.x + gx * U + 1 - HALF + 0.5, base + 1, MAZE.z + gz * U + 1 - HALF + 0.5);
}

export class Labyrinth {
  // host: the Enemies instance (for arrows). hooks: { hit(dmg, source), toast(text), golden() }
  constructor(scene, world, host, bursts, room) {
    this.scene = scene; this.world = world; this.host = host; this.bursts = bursts; this.room = room;
    this.spawned = false; this.traps = []; this.apple = null; this.warned = false; this.time = 0;
    this._v = new THREE.Vector3();
    this.stone = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.6, metalness: 0.4 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.5, metalness: 0.5 });
    this.spikeMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.2) });
  }

  get center() { return this._c ??= new THREE.Vector3(MAZE.x + 0.5, 0, MAZE.z + 0.5); }
  appleKey() { return `dragoncraft:goldapple:${this.room}`; }
  appleReady() { try { return (Number(localStorage.getItem(this.appleKey())) || 0) + 20 * 60 * 1000 < Date.now(); } catch { return true; } }

  spawn() {
    const base = this.world.gen.mazeBase();
    const info = mazeInfo();
    this.base = base;
    for (const t of info.traps.values()) {
      const c = mazeCell(t.gx, t.gz, base);
      const o = { t, c, group: new THREE.Group(), clock: t.phase, cd: 1 + Math.random() * 2, state: 'idle', up: 0 };
      if (t.kind === 'turret') {
        o.group.position.set(c.x + t.wall[0] * 1.15, base + 2.5, c.z + t.wall[1] * 1.15);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.stone); body.castShadow = true;
        o.barrel = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), this.dark); tube.rotation.x = Math.PI / 2; tube.position.z = -0.55;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.eyeMat); eye.position.set(0, 0.28, -0.4);
        o.barrel.add(tube, eye);
        o.group.add(body, o.barrel);
      } else if (t.kind === 'flame') {
        o.group.position.set(c.x, c.y + 0.02, c.z);
        o.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.1), transparent: true, opacity: 0.1, depthWrite: false, fog: false });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8), o.glowMat); plate.rotation.x = -Math.PI / 2;
        o.group.add(plate);
      } else {
        o.group.position.set(c.x, c.y, c.z);
        const alongX = t.axis === 'x';
        o.slab = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.35 : 2.9, 3.6, alongX ? 2.9 : 0.35), this.dark); slab.castShadow = true;
        o.slab.add(slab);
        for (let i = -2; i <= 2; i++) {
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), this.spikeMat);
          sp.position.set(alongX ? 0 : i * 0.6, 2.2, alongX ? i * 0.6 : 0); o.slab.add(sp);
          const sp2 = sp.clone(); sp2.position.y = 0.4; sp2.rotation.z = alongX ? Math.PI / 2 : 0; sp2.rotation.x = alongX ? 0 : Math.PI / 2; sp2.position.x += alongX ? 0.4 : 0; sp2.position.z += alongX ? 0 : 0.4; o.slab.add(sp2);
        }
        o.group.add(o.slab);
        o.slab.position.y = -1.9;
      }
      this.scene.add(o.group);
      this.traps.push(o);
    }
    // the golden apple on its pedestal at the far end
    if (this.appleReady()) {
      const g = mazeCell(info.goal[0], info.goal[1], base);
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.4, 2.4, 0.4) });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 14), mat);
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 0.4) })); leaf.position.set(0.1, 0.45, 0);
      mesh.add(leaf);
      this.apple = { mesh, pos: new THREE.Vector3(g.x, g.y + 1.9, g.z) };
      mesh.position.copy(this.apple.pos);
      this.scene.add(mesh);
    }
    this.spawned = true;
  }

  despawn() {
    for (const o of this.traps) { this.scene.remove(o.group); o.group.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); o.glowMat?.dispose(); }
    this.traps = [];
    if (this.apple) { this.scene.remove(this.apple.mesh); this.apple = null; }
    this.spawned = false;
  }

  update(dt, player, hooks) {
    this.time += dt;
    const dc = Math.hypot(player.pos.x - this.center.x, player.pos.z - this.center.z);
    if (!this.warned && dc < 140) { this.warned = true; hooks.toast('A giant maze! Reach the Golden Apple at the far end. Beware of traps!'); }
    if (!this.spawned && dc < 150 && this.world.isLoaded(MAZE.x, MAZE.z)) this.spawn();
    if (this.spawned && dc > 240) this.despawn();
    if (!this.spawned) return;

    const p = player.pos, base = this.base;
    const inside = dc < MAZE.reach && p.y < base + 7;
    for (const o of this.traps) {
      const dx = p.x - o.c.x, dz = p.z - o.c.z, dy = p.y - o.c.y;
      if (o.t.kind === 'turret') {
        const gp = o.group.position;
        const to = this._v.set(p.x - gp.x, p.y - gp.y, p.z - gp.z);
        const d = to.length();
        if (d < 22 && inside && !player.dead) {
          o.barrel.lookAt(p.x, p.y, p.z);
          o.cd -= dt;
          if (o.cd <= 0 && this.host.lineOfSight(gp, p)) { o.cd = 1.7 + Math.random() * 0.9; this.host.fire(gp.clone(), p, 22, 'arrow', 0.9, player.vel); }
        }
      } else if (o.t.kind === 'flame') {
        o.clock += dt;
        const cyc = o.clock % 5, near = Math.abs(dx) < 1.8 && Math.abs(dz) < 1.8;
        if (cyc < 3) { o.state = 'idle'; o.glowMat.opacity = 0.1; }
        else if (cyc < 4) { o.state = 'warn'; o.glowMat.opacity = 0.35 + 0.3 * Math.sin(this.time * 18); if (Math.random() < 0.3) this.bursts.burst(o.c.x + (Math.random() - 0.5) * 2, o.c.y + 0.2, o.c.z + (Math.random() - 0.5) * 2, 0xff7a2a, 1, 1, 0.12, 1.5); }
        else {
          if (o.state !== 'burst') o.cd = 0; // the first scorch lands right away
          o.state = 'burst'; o.glowMat.opacity = 0.9;
          this.bursts.burst(o.c.x + (Math.random() - 0.5) * 2.2, o.c.y + 0.3, o.c.z + (Math.random() - 0.5) * 2.2, Math.random() < 0.5 ? 0xff8a20 : 0xffd23f, 3, 5, 0.3, 6, -2);
          if (near && dy > -0.5 && dy < 5 && !player.dead) { o.cd -= dt; if (o.cd <= 0) { o.cd = 0.4; hooks.hit(3, 'trap'); } }
        }
      } else {
        o.clock += dt;
        const cyc = o.clock % 4.2, wantUp = cyc < 1.8 ? 1 : 0;
        o.up += (wantUp - o.up) * (1 - Math.exp(-(wantUp ? 14 : 5) * dt));
        o.slab.position.y = -1.9 + 3.7 * o.up;
        if (o.up > 0.7 && !player.dead) {
          const alongX = o.t.axis === 'x';
          const hx = alongX ? 0.2 + 0.5 : 1.45 + 0.5, hz = alongX ? 1.45 + 0.5 : 0.2 + 0.5;
          if (Math.abs(dx) < hx && Math.abs(dz) < hz && dy > -1.5 && dy < 4.2) {
            // solid while up: shove the dragon back out the way it came, and it hurts
            if (alongX) p.x += (dx >= 0 ? 1 : -1) * (hx - Math.abs(dx) + 0.05); else p.z += (dz >= 0 ? 1 : -1) * (hz - Math.abs(dz) + 0.05);
            o.cd -= dt;
            if (o.cd <= 0) { o.cd = 0.5; hooks.hit(4, 'trap'); }
          }
        }
      }
    }

    if (this.apple) {
      this.apple.mesh.position.set(this.apple.pos.x, this.apple.pos.y + Math.sin(this.time * 2.4) * 0.12, this.apple.pos.z);
      this.apple.mesh.rotation.y += dt * 1.5;
      if (Math.random() < 0.3) this.bursts.burst(this.apple.pos.x, this.apple.pos.y, this.apple.pos.z, 0xffd23f, 1, 1.2, 0.1, 1.5, 0);
      if (!player.dead && p.distanceTo(this.apple.pos) < 2.4) {
        this.bursts.burst(this.apple.pos.x, this.apple.pos.y, this.apple.pos.z, 0xffd23f, 40, 7, 0.22, 3, 4);
        this.scene.remove(this.apple.mesh); this.apple = null;
        try { localStorage.setItem(this.appleKey(), String(Date.now())); } catch { /* ignore */ }
        hooks.golden();
      }
    }
  }
}
