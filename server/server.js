// Dragon Craft multiplayer relay. Rooms share one block-edit world and see each other's dragons.
// The world itself is generated on every client; the server only stores edits (a sparse diff per chunk)
// and relays player state. Run behind nginx (wss) with: node server.js
import { WebSocketServer } from 'ws';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const DATA = process.env.DATA_DIR || path.join(HERE, 'data');
const ORIGINS = (process.env.ALLOWED_ORIGINS || 'https://dragon.gordhamer.com,http://localhost:8000,http://127.0.0.1:8000')
  .split(',').map((s) => s.trim()).filter(Boolean);

const MAX_PLAYERS = 8, MAX_ROOMS = 50, MAX_EDITS_PER_ROOM = 600000, DAY_LENGTH = 600;
const CHUNK_VOLUME = 16 * 128 * 16, MAX_BLOCK_ID = 30, CHUNK_LIMIT = 4000;
const LOOK_STRINGS = ['horns', 'tail', 'wings', 'wingpairs', 'spikes', 'pattern', 'snout'];
const LOOK_COLORS = ['body', 'belly', 'accent', 'wing', 'eye'];

fs.mkdirSync(DATA, { recursive: true });

const isInt = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lim = 1e6) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(-lim, Math.min(lim, v)) : 0);
const round = (v, k = 100) => Math.round(v * k) / k;

export function cleanLook(l) {
  const out = {};
  if (!l || typeof l !== 'object') return out;
  out.name = typeof l.name === 'string' ? l.name.replace(/[^\p{L}\p{N} _'-]/gu, '').slice(0, 14) || 'Dragon' : 'Dragon';
  for (const k of LOOK_COLORS) if (isInt(l[k], 0, 0xffffff)) out[k] = l[k];
  for (const k of LOOK_STRINGS) if (typeof l[k] === 'string' && /^[a-z]{1,10}$/.test(l[k])) out[k] = l[k];
  out.glow = l.glow === true;
  return out;
}

class Room {
  constructor(name, seed) {
    this.name = name;
    this.seed = seed;
    this.file = path.join(DATA, `${name}.json`);
    this.edits = new Map(); // "cx,cz" -> Map(index -> id)
    this.count = 0;
    this.players = new Map();
    this.dirty = false;
    this.started = Date.now();
    this.nextId = 1;
    this.load();
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (isInt(j.seed, 1, 1e9)) this.seed = j.seed;
      for (const [k, flat] of Object.entries(j.edits || {})) {
        const m = new Map();
        for (let i = 0; i + 1 < flat.length; i += 2) m.set(flat[i], flat[i + 1]);
        this.edits.set(k, m);
        this.count += m.size;
      }
    } catch { /* new room */ }
  }

  save() {
    if (!this.dirty) return;
    this.dirty = false;
    const edits = {};
    for (const [k, m] of this.edits) { const a = []; for (const [i, v] of m) a.push(i, v); edits[k] = a; }
    const tmp = `${this.file}.tmp`;
    try { fs.writeFileSync(tmp, JSON.stringify({ seed: this.seed, edits })); fs.renameSync(tmp, this.file); }
    catch (e) { console.error('save failed', e.message); this.dirty = true; }
  }

  time() { return (((Date.now() - this.started) / 1000 / DAY_LENGTH) + 0.1) % 1; }

  applyEdit(cx, cz, idx, id) {
    const k = `${cx},${cz}`;
    let m = this.edits.get(k);
    if (!m) { m = new Map(); this.edits.set(k, m); }
    if (!m.has(idx)) { if (this.count >= MAX_EDITS_PER_ROOM) return false; this.count++; }
    m.set(idx, id);
    this.dirty = true;
    return true;
  }

  snapshot() { return [...this.edits].map(([k, m]) => { const a = []; for (const [i, v] of m) a.push(i, v); return [...k.split(',').map(Number), a]; }); }

  send(ws, msg) { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); }
  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const p of this.players.values()) if (p.ws !== except && p.ws.readyState === 1) p.ws.send(s);
  }
}

const rooms = new Map();
function getRoom(name, seed) {
  let r = rooms.get(name);
  if (!r) {
    if (rooms.size >= MAX_ROOMS) return null;
    r = new Room(name, seed);
    rooms.set(name, r);
  }
  return r;
}

const wss = new WebSocketServer({
  host: HOST, port: PORT, maxPayload: 8192, perMessageDeflate: { threshold: 1024 },
  verifyClient: ({ origin }) => !origin || ORIGINS.includes(origin),
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://x');
  const roomName = (url.searchParams.get('room') || 'main').replace(/[^\w-]/g, '').slice(0, 24) || 'main';
  let player = null, room = null;
  let tokens = 40, lastRefill = Date.now(); // edit rate limit
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;

    if (m.t === 'hello') {
      if (player) return;
      const seed = isInt(m.seed, 1, 1e9) ? m.seed : 1337;
      room = getRoom(roomName, seed);
      if (!room) return ws.close(1013, 'server full');
      if (room.players.size >= MAX_PLAYERS) return ws.close(1013, 'room full');
      player = { id: room.nextId++, ws, look: cleanLook(m.look), state: null };
      room.send(ws, {
        t: 'welcome', id: player.id, seed: room.seed, time: room.time(), edits: room.snapshot(),
        players: [...room.players.values()].map((p) => ({ id: p.id, look: p.look, s: p.state })),
      });
      room.players.set(player.id, player);
      room.broadcast({ t: 'join', id: player.id, look: player.look }, ws);
      return;
    }
    if (!player) return;

    if (m.t === 's') {
      const p = Array.isArray(m.p) ? m.p : [];
      const s = {
        p: [round(num(p[0]), 100), round(num(p[1]), 100), round(num(p[2]), 100)],
        y: round(num(m.y, 100), 1000), pi: round(num(m.pi, 100), 1000), r: round(num(m.r, 100), 1000),
        f: m.f ? 1 : 0, sp: round(num(m.sp, 200), 10), vy: round(num(m.vy, 200), 10), b: m.b ? 1 : 0,
        ly: round(num(m.ly, 100), 1000), lp: round(num(m.lp, 100), 1000), br: m.br === 2 ? 2 : m.br ? 1 : 0,
      };
      if (s.br && Array.isArray(m.a)) s.a = [round(num(m.a[0], 1)), round(num(m.a[1], 1)), round(num(m.a[2], 1))];
      player.state = s;
      room.broadcast({ t: 's', id: player.id, ...s }, ws);
    } else if (m.t === 'look') {
      player.look = cleanLook(m.look);
      room.broadcast({ t: 'look', id: player.id, look: player.look }, ws);
    } else if (m.t === 'e') {
      const now = Date.now();
      tokens = Math.min(40, tokens + ((now - lastRefill) / 1000) * 30);
      lastRefill = now;
      if (tokens < 1) return;
      tokens--;
      const c = Array.isArray(m.c) ? m.c : [];
      if (!isInt(c[0], -CHUNK_LIMIT, CHUNK_LIMIT) || !isInt(c[1], -CHUNK_LIMIT, CHUNK_LIMIT)) return;
      if (!isInt(m.i, 0, CHUNK_VOLUME - 1) || !isInt(m.b, 0, MAX_BLOCK_ID)) return;
      const y = Math.floor(m.i / 256);
      if (y < 2 || y > 126) return;
      if (room.applyEdit(c[0], c[1], m.i, m.b)) room.broadcast({ t: 'e', c, i: m.i, b: m.b }, ws);
    }
  });

  ws.on('close', () => {
    if (!player || !room) return;
    room.players.delete(player.id);
    room.broadcast({ t: 'leave', id: player.id });
    room.save();
  });
  ws.on('error', () => {});
});

const beat = setInterval(() => {
  for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); }
}, 30000);
const saver = setInterval(() => { for (const r of rooms.values()) r.save(); }, 3000);
function shutdown() { clearInterval(beat); clearInterval(saver); for (const r of rooms.values()) r.save(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
console.log(`Dragon Craft server on ws://${HOST}:${PORT} (data: ${DATA})`);
