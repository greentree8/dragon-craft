// Persistence. Block edits are stored as a sparse diff per chunk (IndexedDB), so worlds stay small
// and the generator stays the source of truth. Player state and the dragon's look use localStorage.

const DB_STORE = 'chunks';

function openDb(name) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const ls = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
};

export class Save {
  constructor(worldName = 'main') {
    this.name = worldName;
    this.prefix = `dragoncraft:${worldName}`;
    this.db = null;
    this.edits = new Map(); // "cx,cz" -> Map(index -> blockId)
    this.dirty = new Set();
    this.timer = null;
    this.persistent = true;
    addEventListener('pagehide', () => this.flush());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.flush(); });
  }

  async init() {
    try {
      this.db = await openDb(`dragoncraft-${this.name}`);
      await new Promise((resolve, reject) => {
        const tx = this.db.transaction(DB_STORE, 'readonly');
        const cur = tx.objectStore(DB_STORE).openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return resolve();
          const flat = c.value, m = new Map();
          for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
          this.edits.set(c.key, m);
          c.continue();
        };
        cur.onerror = () => reject(cur.error);
      });
    } catch {
      // IndexedDB unavailable (e.g. private window): fall back to localStorage
      this.db = null;
      const all = ls.get(`${this.prefix}:edits`) || {};
      for (const [k, flat] of Object.entries(all)) {
        const m = new Map();
        for (let i = 0; i < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
        this.edits.set(k, m);
      }
    }
  }

  getEdits(cx, cz) { return this.edits.get(`${cx},${cz}`); }

  recordEdit(cx, cz, idx, id) {
    const k = `${cx},${cz}`;
    let m = this.edits.get(k);
    if (!m) { m = new Map(); this.edits.set(k, m); }
    m.set(idx, id);
    this.dirty.add(k);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 1500);
  }

  flush() {
    clearTimeout(this.timer);
    if (!this.dirty.size) return;
    const keys = [...this.dirty];
    this.dirty.clear();
    const flatten = (m) => { const a = []; for (const [i, v] of m) a.push(i, v); return a; };
    if (this.db) {
      try {
        const tx = this.db.transaction(DB_STORE, 'readwrite');
        const st = tx.objectStore(DB_STORE);
        for (const k of keys) st.put(flatten(this.edits.get(k)), k);
        return;
      } catch { /* fall through to localStorage */ }
    }
    const all = {};
    for (const [k, m] of this.edits) all[k] = flatten(m);
    ls.set(`${this.prefix}:edits`, all);
  }

  loadState() { return ls.get(`${this.prefix}:state`); }
  saveState(s) { return ls.set(`${this.prefix}:state`, s); }
  static loadLook() { return ls.get('dragoncraft:look'); }
  static saveLook(l) { return ls.set('dragoncraft:look', l); }
  static feedbackLog() { return ls.get('dragoncraft:feedback') || []; }
  static addFeedback(f) { const a = Save.feedbackLog(); a.push(f); ls.set('dragoncraft:feedback', a.slice(-50)); }
}
