// Growth: you start as a baby dragon and grow by opening the Grand Citadel's 50 chests
// (10 for a kid, 25 for a teenager, 50 for an adult). Stored in this browser, per world/room.
export const STAGES = [
  { id: 'baby', label: 'Baby', min: 0, scale: 0.55, head: 1.35, hp: 24, power: 0.6 },
  { id: 'kid', label: 'Kid', min: 10, scale: 0.75, head: 1.2, hp: 32, power: 0.85 },
  { id: 'teen', label: 'Teenager', min: 25, scale: 0.9, head: 1.1, hp: 40, power: 1.1 },
  { id: 'adult', label: 'Adult', min: 50, scale: 1, head: 1, hp: 50, power: 1.4 },
];

export function stageIndexFor(count) {
  let i = 0;
  for (let k = 0; k < STAGES.length; k++) if (count >= STAGES[k].min) i = k;
  return i;
}

export class Progress {
  constructor(room) {
    this.key = `dragoncraft:progress:${room}`;
    this.element = null;
    this.opened = new Set();
    try {
      const j = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (j) { this.element = j.element || null; for (const i of j.opened || []) this.opened.add(i); }
    } catch { /* fresh start */ }
  }

  get count() { return this.opened.size; }
  get stageIndex() { return stageIndexFor(this.count); }
  get stage() { return STAGES[this.stageIndex]; }
  get next() { return STAGES[this.stageIndex + 1] || null; }

  save() {
    try { localStorage.setItem(this.key, JSON.stringify({ element: this.element, opened: [...this.opened] })); } catch { /* ignore */ }
  }

  setElement(e) { this.element = e; this.save(); }

  // returns { count, grew } or null if this chest was already opened
  open(index) {
    if (this.opened.has(index)) return null;
    const before = this.stageIndex;
    this.opened.add(index);
    this.save();
    return { count: this.count, grew: this.stageIndex > before };
  }
}
