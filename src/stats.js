// Health and hunger. Tuned to be forgiving: starving never kills, and there is no fall damage.
export const MAX_HEALTH = 24; // a baby dragon; it grows with the dragon (see progress.js)
export const MAX_HUNGER = 20;

export class Vitals {
  constructor() {
    this.maxHealth = MAX_HEALTH;
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.dead = false;
    this.hurtCooldown = 0;
    this.regenT = 0;
    this.starveT = 0;
    this.eatCooldown = 0;
    this.invincible = 0; // seconds left of Golden Apple invincibility
    this.changed = true;
  }

  load(s) {
    if (!s) return;
    this.health = Math.min(this.maxHealth, Math.max(1, s.health ?? this.maxHealth));
    this.hunger = Math.min(MAX_HUNGER, Math.max(0, s.hunger ?? MAX_HUNGER));
    this.changed = true;
  }

  toJSON() { return { health: this.health, hunger: this.hunger }; }

  // ctx: { flying, boosting, breathing, inLava }. Returns damage events for the UI.
  tick(dt, ctx) {
    const events = [];
    if (this.dead) return events;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    this.eatCooldown = Math.max(0, this.eatCooldown - dt);
    this.invincible = Math.max(0, this.invincible - dt);

    // hunger drains slowly, faster with effort
    let drain = 0.03;
    if (ctx.flying) drain += 0.02;
    if (ctx.boosting) drain += 0.07;
    if (ctx.breathing) drain += 0.25;
    const before = Math.ceil(this.hunger);
    this.hunger = Math.max(0, this.hunger - drain * dt);
    if (Math.ceil(this.hunger) !== before) this.changed = true;

    if (ctx.inLava && this.hurtCooldown <= 0) {
      events.push(this.damage(4, 'lava'));
    }

    // regenerate when well fed, starve (down to one heart) when empty
    if (this.hunger >= 14 && this.health < this.maxHealth) {
      this.regenT += dt;
      if (this.regenT >= 3) { this.regenT = 0; this.health = Math.min(this.maxHealth, this.health + 2); this.hunger = Math.max(0, this.hunger - 0.4); this.changed = true; }
    } else this.regenT = 0;
    if (this.hunger <= 0 && this.health > 2) {
      this.starveT += dt;
      if (this.starveT >= 4) { this.starveT = 0; this.health -= 1; this.changed = true; events.push({ type: 'starve' }); }
    } else this.starveT = 0;
    return events.filter(Boolean);
  }

  damage(n, source) {
    if (this.dead || this.hurtCooldown > 0 || this.invincible > 0) return null;
    this.health = Math.max(0, this.health - n);
    this.hurtCooldown = 0.6;
    this.changed = true;
    if (this.health <= 0) { this.dead = true; return { type: 'death', source }; }
    return { type: 'hurt', source };
  }

  // growing up: a bigger heart bar, and the new hearts are full
  setMaxHealth(n) { const gain = n - this.maxHealth; this.maxHealth = n; if (gain > 0) this.health = Math.min(n, this.health + gain); else this.health = Math.min(this.health, n); this.changed = true; }

  // abilities cost a little food
  spend(n) { this.hunger = Math.max(0, this.hunger - n); this.changed = true; }

  // returns true if something was eaten
  eat(food) {
    if (this.dead || this.eatCooldown > 0) return false;
    if (this.hunger >= MAX_HUNGER - 0.5 && this.health >= this.maxHealth) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.health = Math.min(this.maxHealth, this.health + food.heal);
    this.eatCooldown = 0.5;
    this.changed = true;
    return true;
  }

  respawn() {
    this.dead = false;
    this.health = this.maxHealth;
    this.hunger = Math.max(this.hunger, 12);
    this.hurtCooldown = 2;
    this.changed = true;
  }
}
