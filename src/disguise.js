// Guard disguise: for five minutes you look like one of the castle's knights and the guards leave you alone.
// Attacking (breath, lightning...) gives you away. After it ends you have to wait before disguising again.
import * as THREE from 'three';
import { humanoid } from './enemies.js';

export const DISGUISE_SECONDS = 300;
export const DISGUISE_COOLDOWN = 90;

export class Disguise {
  constructor(scene, dragon, onEnd) {
    this.scene = scene; this.dragon = dragon; this.onEnd = onEnd;
    this.active = false; this.left = 0; this.cd = 0;
    this.model = null; this.legs = null; this.phase = 0;
  }

  start() {
    if (this.active || this.cd > 0) return false;
    const h = humanoid('knight');
    this.model = new THREE.Group();
    h.group.scale.multiplyScalar(1.45);
    this.model.add(h.group);
    this.legs = h.legs; this.arms = h.arms; this.mats = h.mats;
    this.scene.add(this.model);
    this.active = true; this.left = DISGUISE_SECONDS;
    this.dragon.root.visible = false;
    return true;
  }

  stop(reason) {
    if (!this.active) return;
    this.active = false; this.cd = DISGUISE_COOLDOWN;
    this.scene.remove(this.model);
    this.model.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    for (const m of this.mats.values()) m.dispose();
    this.model = null;
    this.dragon.root.visible = true;
    this.onEnd?.(reason);
  }

  // 0 when ready; otherwise the share of the cooldown left (also 0 while active, so the button shows "on")
  fraction() { return this.active ? 0 : this.cd / DISGUISE_COOLDOWN; }

  update(dt, player) {
    if (!this.active) { this.cd = Math.max(0, this.cd - dt); return; }
    this.left -= dt;
    if (this.left <= 0) { this.stop('Your disguise wore off!'); return; }
    this.model.visible = !player.firstPerson;
    this.dragon.root.visible = false;
    this.model.position.set(player.pos.x, player.pos.y - 1.5, player.pos.z);
    this.model.rotation.y = player.bodyYaw;
    this.phase += dt * Math.min(player.speedXZ, 8) * 1.1;
    const sw = Math.min(1, player.speedXZ / 4) * 0.6;
    this.legs[0].rotation.x = Math.sin(this.phase) * sw; this.legs[1].rotation.x = -Math.sin(this.phase) * sw;
    this.arms[0].rotation.x = Math.sin(this.phase) * sw * 0.8; this.arms[1].rotation.x = -Math.sin(this.phase) * sw * 0.8;
  }

  timeText() {
    const s = Math.ceil(this.left);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}
