// Input, flight/walk physics and third-person camera for one dragon.
import * as THREE from 'three';
import { isSolid, B } from './blocks.js';

const HX = 0.5, HY = 0.6, HZ = 0.5; // hitbox half extents

export class Player {
  constructor(world, dom) {
    this.world = world;
    this.dom = dom;
    this.pos = new THREE.Vector3(0, 60, 0);
    this.vel = new THREE.Vector3();
    this.yaw = 0;        // camera yaw (look direction)
    this.pitch = -0.15;  // camera pitch
    this.bodyYaw = 0;
    this.bodyPitch = 0;
    this.roll = 0;
    this.flying = true;
    this.onGround = false;
    this.inWater = false;
    this.boosting = false;
    this.breathing = false;
    this.slowT = 0; // seconds of frost slow left
    this.keys = new Set();
    this.buttons = new Set(); // held mouse buttons
    this.inLava = false;
    this.firstPerson = false;
    this.camDist = 7.5;
    this.locked = false;
    this.speedXZ = 0;
    this.ready = false;

    this.fwd = new THREE.Vector3();
    this.right = new THREE.Vector3();

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyV') this.firstPerson = !this.firstPerson;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch - e.movementY * 0.0022));
    });
    addEventListener('mousedown', (e) => { if (this.locked) this.buttons.add(e.button); });
    addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    addEventListener('contextmenu', (e) => { if (this.locked) e.preventDefault(); });
  }

  // camera forward from yaw/pitch
  lookDir(out = new THREE.Vector3()) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  collides(x, y, z) {
    const w = this.world;
    const x0 = Math.floor(x - HX), x1 = Math.floor(x + HX - 1e-6);
    const y0 = Math.floor(y - HY), y1 = Math.floor(y + HY - 1e-6);
    const z0 = Math.floor(z - HZ), z1 = Math.floor(z + HZ - 1e-6);
    for (let by = y0; by <= y1; by++) for (let bz = z0; bz <= z1; bz++) for (let bx = x0; bx <= x1; bx++) {
      if (isSolid(w.getBlock(bx, by, bz))) return true;
    }
    return false;
  }

  moveAxis(axis, d) {
    if (d === 0) return false;
    const p = this.pos;
    const steps = Math.max(1, Math.ceil(Math.abs(d) / 0.4));
    const sd = d / steps;
    for (let i = 0; i < steps; i++) {
      const nx = axis === 0 ? p.x + sd : p.x, ny = axis === 1 ? p.y + sd : p.y, nz = axis === 2 ? p.z + sd : p.z;
      if (this.collides(nx, ny, nz)) {
        // auto step-up when walking into a one-block ledge
        if (axis !== 1 && this.onGround && !this.flying && !this.collides(nx, ny + 1.01, nz) && !this.collides(p.x, p.y + 1.01, p.z)) {
          p.set(nx, ny + 1.001, nz);
          continue;
        }
        if (axis === 0) this.vel.x = 0; else if (axis === 1) this.vel.y = 0; else this.vel.z = 0;
        return true;
      }
      p.set(nx, ny, nz);
    }
    return false;
  }

  update(dt) {
    dt = Math.min(dt, 0.05);
    const k = this.keys;
    const w = this.world;
    if (!w.isLoaded(this.pos.x, this.pos.z)) return; // wait for the ground to exist
    this.ready = true;

    const fwdIn = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
    const strafeIn = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const up = k.has('Space'), down = k.has('KeyC') || k.has('ControlLeft') || k.has('KeyQ');
    this.boosting = (k.has('ShiftLeft') || k.has('ShiftRight')) && (fwdIn > 0 || this.flying);
    this.slowT = Math.max(0, this.slowT - dt);
    if (this.frozen) { this.vel.set(0, 0, 0); return; }

    const head = w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y + 0.3), Math.floor(this.pos.z));
    this.inWater = head === B.WATER;
    this.inLava = head === B.LAVA || w.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.4), Math.floor(this.pos.z)) === B.LAVA;

    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // yaw-only camera-relative axes
    this.right.set(cy, 0, -sy);
    const flatFwd = new THREE.Vector3(-sy, 0, -cy);

    let tx = 0, ty = 0, tz = 0;
    let accel;
    if (this.flying) {
      const speed = (this.boosting ? 34 : 15) * (this.slowT > 0 ? 0.5 : 1);
      const look = this.lookDir(this.fwd);
      tx = look.x * fwdIn + this.right.x * strafeIn;
      ty = look.y * fwdIn;
      tz = look.z * fwdIn + this.right.z * strafeIn;
      const len = Math.hypot(tx, ty, tz);
      if (len > 1) { tx /= len; ty /= len; tz /= len; }
      tx *= speed; ty *= speed; tz *= speed;
      if (up) ty += 12;
      if (down) ty -= 12;
      if (this.inWater || this.inLava) { tx *= 0.55; ty *= 0.55; tz *= 0.55; }
      accel = 1 - Math.exp(-(this.boosting ? 2.6 : 4.2) * dt);
    } else {
      const speed = (this.boosting ? 10 : 5.2) * (this.slowT > 0 ? 0.5 : 1);
      tx = flatFwd.x * fwdIn + this.right.x * strafeIn;
      tz = flatFwd.z * fwdIn + this.right.z * strafeIn;
      const len = Math.hypot(tx, tz);
      if (len > 1) { tx /= len; tz /= len; }
      tx *= speed; tz *= speed;
      if (this.inWater) { tx *= 0.5; tz *= 0.5; }
      accel = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt);
    }

    this.vel.x += (tx - this.vel.x) * accel;
    this.vel.z += (tz - this.vel.z) * accel;
    if (this.flying) {
      this.vel.y += (ty - this.vel.y) * accel;
    } else {
      this.vel.y -= (this.inWater ? 6 : 30) * dt;
      if (this.inWater) { this.vel.y *= 1 - 3 * dt; if (up) this.vel.y = Math.min(this.vel.y + 40 * dt, 4); }
      this.vel.y = Math.max(this.vel.y, -45);
      if (up && !this.inWater) { // take off!
        this.flying = true;
        this.vel.y = 9;
        this.onGround = false;
      }
    }

    // move + collide
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(2, this.vel.z * dt);
    const wasVy = this.vel.y;
    const hitY = this.moveAxis(1, this.vel.y * dt);
    this.onGround = hitY && wasVy < 0;
    if (this.onGround && this.flying && !up) this.flying = false;
    if (this.pos.y > 190) { this.pos.y = 190; if (this.vel.y > 0) this.vel.y = 0; }
    if (this.pos.y < -20) { this.pos.set(0, 70, 0); this.vel.set(0, 0, 0); } // safety net
    // dragons don't fall: spread the wings when dropping fast
    if (!this.flying && this.vel.y < -14) { this.flying = true; this.vel.y *= 0.3; }

    // body orientation follows travel/look
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    this.speedXZ = horiz;
    const turnTo = (cur, target, rate) => {
      const d = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
      return cur + d * (1 - Math.exp(-rate * dt));
    };
    const prevYaw = this.bodyYaw;
    if (this.flying) {
      this.bodyYaw = turnTo(this.bodyYaw, this.yaw, 7);
    } else if (horiz > 0.5) {
      this.bodyYaw = turnTo(this.bodyYaw, Math.atan2(-this.vel.x, -this.vel.z), 9);
    } else if (this.breathing) {
      this.bodyYaw = turnTo(this.bodyYaw, this.yaw, 9);
    }
    const yawRate = Math.atan2(Math.sin(this.bodyYaw - prevYaw), Math.cos(this.bodyYaw - prevYaw)) / Math.max(dt, 1e-3);
    const bankTarget = this.flying ? THREE.MathUtils.clamp(-yawRate * 0.18 - strafeIn * 0.35, -0.7, 0.7) : 0;
    this.roll += (bankTarget - this.roll) * (1 - Math.exp(-6 * dt));
    const pitchTarget = this.flying ? THREE.MathUtils.clamp(Math.atan2(this.vel.y, Math.max(horiz, 4)) * 0.8, -0.9, 0.9) : 0;
    this.bodyPitch += (pitchTarget - this.bodyPitch) * (1 - Math.exp(-6 * dt));
  }

  // place camera behind the dragon, pulled in by terrain
  applyCamera(camera, dragonRoot) {
    const target = this.pos.clone(); target.y += 0.5;
    const dir = this.lookDir(new THREE.Vector3());
    const desired = target.clone();
    if (!this.firstPerson) {
      desired.addScaledVector(dir, -this.camDist);
      desired.y += 1.2;
      const toCam = desired.clone().sub(target);
      const len = toCam.length();
      toCam.normalize();
      const hit = this.world.raycast(target, toCam, len + 0.4);
      if (hit) desired.copy(target).addScaledVector(toCam, Math.max(0.6, hit.t - 0.4));
    } else {
      desired.addScaledVector(dir, 0.9);
      desired.y += 0.45;
    }
    camera.position.copy(desired);
    camera.lookAt(desired.clone().add(dir));
    dragonRoot.visible = !this.firstPerson;
  }

  cameraInWater(camera) {
    return this.world.getBlock(Math.floor(camera.position.x), Math.floor(camera.position.y), Math.floor(camera.position.z)) === B.WATER;
  }
}
