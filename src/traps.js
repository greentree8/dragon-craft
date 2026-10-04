// Traps: arrow/fire turrets that shoot when they see you, floor flame jets that warm up before they burst, and spike gates
// that rise and fall across a passage. Used by the mazes, the castles and the Grand Citadel.
import * as THREE from 'three';

export class TrapField {
  // host: the Enemies instance (it fires arrows and checks line of sight)
  constructor(scene, world, host, bursts) {
    this.scene = scene; this.world = world; this.host = host; this.bursts = bursts;
    this.list = []; this.time = 0;
    this._v = new THREE.Vector3();
    this.stone = new THREE.MeshStandardMaterial({ color: 0x5a5f68, roughness: 0.6, metalness: 0.4 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.5, metalness: 0.5 });
    this.spikeMat = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.3, metalness: 0.8 });
    this.eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.2) });
  }

  // d: { kind: 'turret' | 'flame' | 'gate', x, y, z (the middle of the floor surface), phase,
  //      turret: { ammo, wall: [dx, dz] } or { ammo, at: [x, y, z] };  flame: { half };  gate: { axis, width } }
  add(descs) {
    for (const t of descs) {
      const c = new THREE.Vector3(t.x, t.y, t.z);
      const o = { t, c, group: new THREE.Group(), clock: t.phase || 0, cd: 1 + Math.random() * 2, state: 'idle', up: 0 };
      if (t.kind === 'turret') {
        if (t.at) o.group.position.set(...t.at); else o.group.position.set(c.x + t.wall[0] * 1.15, c.y + 1.5, c.z + t.wall[1] * 1.15);
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), this.stone); body.castShadow = true;
        o.barrel = new THREE.Group();
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.9, 10), this.dark); tube.rotation.x = Math.PI / 2; tube.position.z = -0.55;
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), this.eyeMat); eye.position.set(0, 0.28, -0.4);
        o.barrel.add(tube, eye);
        o.group.add(body, o.barrel);
      } else if (t.kind === 'flame') {
        o.half = t.half || 1.8;
        o.group.position.set(c.x, c.y + 0.02, c.z);
        o.glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.8, 0.1), transparent: true, opacity: 0.1, depthWrite: false, fog: false });
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(o.half * 2 - 0.8, o.half * 2 - 0.8), o.glowMat); plate.rotation.x = -Math.PI / 2;
        o.group.add(plate);
      } else {
        o.group.position.set(c.x, c.y, c.z);
        const alongX = t.axis === 'x', w = t.width || 2.9;
        o.w = w;
        o.slab = new THREE.Group();
        const slab = new THREE.Mesh(new THREE.BoxGeometry(alongX ? 0.35 : w, 3.6, alongX ? w : 0.35), this.dark); slab.castShadow = true;
        o.slab.add(slab);
        const n = Math.max(3, Math.round(w / 0.6));
        for (let i = 0; i < n; i++) {
          const off = (i - (n - 1) / 2) * (w / n);
          const sp = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 6), this.spikeMat);
          sp.position.set(alongX ? 0 : off, 2.2, alongX ? off : 0); o.slab.add(sp);
          const sp2 = sp.clone(); sp2.position.y = 0.4; sp2.rotation.z = alongX ? Math.PI / 2 : 0; sp2.rotation.x = alongX ? 0 : Math.PI / 2; sp2.position.x += alongX ? 0.4 : 0; sp2.position.z += alongX ? 0 : 0.4; o.slab.add(sp2);
        }
        o.group.add(o.slab);
        o.slab.position.y = -1.9;
      }
      this.scene.add(o.group);
      this.list.push(o);
    }
  }

  clear() {
    for (const o of this.list) { this.scene.remove(o.group); o.group.traverse((m) => { if (m.geometry) m.geometry.dispose(); }); o.glowMat?.dispose(); }
    this.list = [];
  }

  // inside: whether the player is within the traps' building (turrets only shoot then)
  update(dt, player, hooks, inside) {
    this.time += dt;
    const p = player.pos;
    for (const o of this.list) {
      const dx = p.x - o.c.x, dz = p.z - o.c.z, dy = p.y - o.c.y;
      if (o.t.kind === 'turret') {
        const gp = o.group.position;
        const d = this._v.set(p.x - gp.x, p.y - gp.y, p.z - gp.z).length();
        if (d < 22 && inside && !player.dead) {
          o.barrel.lookAt(p.x, p.y, p.z);
          o.cd -= dt;
          const ammo = o.t.ammo || 'arrow';
          if (o.cd <= 0 && this.host.lineOfSight(gp, p)) { o.cd = 1.7 + Math.random() * 0.9; this.host.fire(gp.clone(), p, ammo === 'fireball' ? 19 : 22, ammo, 0.9, player.vel); }
        }
      } else if (o.t.kind === 'flame') {
        o.clock += dt;
        const cyc = o.clock % 5, near = Math.abs(dx) < o.half && Math.abs(dz) < o.half;
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
          const alongX = o.t.axis === 'x', span = o.w / 2 + 0.5;
          const hx = alongX ? 0.7 : span, hz = alongX ? span : 0.7;
          if (Math.abs(dx) < hx && Math.abs(dz) < hz && dy > -1.5 && dy < 4.2) {
            // solid while up: shove the dragon back out the way it came, and it hurts
            if (alongX) p.x += (dx >= 0 ? 1 : -1) * (hx - Math.abs(dx) + 0.05); else p.z += (dz >= 0 ? 1 : -1) * (hz - Math.abs(dz) + 0.05);
            o.cd -= dt;
            if (o.cd <= 0) { o.cd = 0.5; hooks.hit(4, 'trap'); }
          }
        }
      }
    }
  }
}
