// Hidden chests inside the castle keeps. Walk (or fly) up to one to open it for 50 fire-roasted meat.
// A chest refills ten minutes after you opened it (tracked per browser, so everyone can raid the castle).
import { B } from './blocks.js';
import { CASTLES, CHEST_OFFSETS } from './castle.js';

export const CHEST_MEAT = 50;
const REFILL_MS = 10 * 60 * 1000;
const REACH = 2.9;

const store = {
  get(k) { try { return Number(localStorage.getItem(k)) || 0; } catch { return 0; } },
  set(k, v) { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } },
};

export class Chests {
  // hooks: { give(n), toast(text), burst(x, y, z) }
  constructor(world, room, hooks) { this.world = world; this.room = room; this.hooks = hooks; this.told = new Set(); this.t = 0; }

  update(dt, player) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.15;
    for (const c of CASTLES) {
      if (Math.abs(player.pos.x - c.x) > 25 || Math.abs(player.pos.z - c.z) > 25) continue;
      const base = this.world.gen.castleBase(c);
      CHEST_OFFSETS.forEach(([dx, dy, dz], i) => {
        const x = c.x + dx, y = base + dy, z = c.z + dz;
        if (this.world.getBlock(x, y, z) !== B.CHEST) return;
        const dist = Math.hypot(player.pos.x - (x + 0.5), player.pos.y - (y + 0.5), player.pos.z - (z + 0.5));
        if (dist > REACH) { this.told.delete(`${c.id}:${i}`); return; }
        const key = `dragoncraft:chest:${this.room}:${c.id}:${i}`;
        const left = store.get(key) + REFILL_MS - Date.now();
        if (left > 0) {
          if (!this.told.has(`${c.id}:${i}`)) { this.told.add(`${c.id}:${i}`); this.hooks.toast(`Empty chest. It refills in ${Math.ceil(left / 60000)} min`); }
          return;
        }
        store.set(key, Date.now());
        this.hooks.give(CHEST_MEAT);
        this.hooks.toast(`Treasure chest! +${CHEST_MEAT} meat`);
        this.hooks.burst(x + 0.5, y + 0.9, z + 0.5);
      });
    }
  }
}
