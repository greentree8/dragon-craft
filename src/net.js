// Multiplayer client: connects to the relay server, keeps the room's block edits, and shows other players' dragons.
// If the server can't be reached the game simply runs single-player.
import * as THREE from 'three';
import { Dragon } from './dragon.js';

const CHUNK = 16;
const NO_VEL = new THREE.Vector3();

// Block edits for the room. Looks like Save to World (getEdits / recordEdit), but writes go to the server.
class SharedEdits {
  constructor(net) { this.net = net; this.edits = new Map(); }
  getEdits(cx, cz) { return this.edits.get(`${cx},${cz}`); }
  set(cx, cz, idx, id) {
    const k = `${cx},${cz}`;
    let m = this.edits.get(k);
    if (!m) { m = new Map(); this.edits.set(k, m); }
    const changed = m.get(idx) !== id;
    m.set(idx, id);
    return changed;
  }
  recordEdit(cx, cz, idx, id) { this.set(cx, cz, idx, id); this.net.send({ t: 'e', c: [cx, cz], i: idx, b: id }); }
}

export class Net {
  // Resolves to a connected Net (already holding the world's seed and edits) or null if there is no server.
  static connect({ url, look, seed, timeoutMs = 3500 }) {
    return new Promise((resolve) => {
      const net = new Net(url, look, seed);
      let done = false;
      const finish = (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } };
      const timer = setTimeout(() => { net.close(); finish(null); }, timeoutMs);
      net.onFirstWelcome = () => finish(net);
      net.onGiveUp = () => finish(null);
      net.open();
    });
  }

  constructor(url, look, seed) {
    this.url = url; this.look = look; this.seed = seed;
    this.edits = new SharedEdits(this);
    this.remotes = new Map(); // id -> { dragon, name, pos, target, state }
    this.ws = null;
    this.id = 0;
    this.time = 0;
    this.closed = false;
    this.retry = 0;
    this.sendT = 0;
    this.lastBr = 0;
    this.onFirstWelcome = null; this.onGiveUp = null;
    this.onJoin = null; this.onLeave = null; this.onEdit = null; this.onStatus = null;
    this.scene = null;
    this.gotWelcome = false;
  }

  open() {
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(this.url); } catch { this.onGiveUp?.(); return; }
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', look: this.look, seed: this.seed }));
    ws.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } this.handle(m); };
    ws.onclose = () => {
      this.clearRemotes();
      if (this.closed) return;
      if (!this.gotWelcome) { this.onGiveUp?.(); return; }
      this.onStatus?.(false);
      setTimeout(() => this.open(), Math.min(10000, 1000 * 2 ** this.retry++));
    };
    ws.onerror = () => {};
  }

  close() { this.closed = true; try { this.ws?.close(); } catch { /* ignore */ } this.clearRemotes(); }
  send(msg) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg)); }
  get connected() { return !!this.ws && this.ws.readyState === 1 && this.gotWelcome; }

  attach(scene, world) { this.scene = scene; this.world = world; for (const r of this.pendingRemotes ?? []) this.addRemote(r.id, r.look, r.s); this.pendingRemotes = null; }

  handle(m) {
    switch (m.t) {
      case 'welcome': {
        this.id = m.id; this.seed = m.seed; this.time = m.time;
        const first = !this.gotWelcome;
        this.gotWelcome = true; this.retry = 0;
        const changes = [];
        for (const [cx, cz, flat] of m.edits) for (let i = 0; i + 1 < flat.length; i += 2) if (this.edits.set(cx, cz, flat[i], flat[i + 1])) changes.push([cx, cz, flat[i], flat[i + 1]]);
        if (this.scene) { this.clearRemotes(); for (const p of m.players) this.addRemote(p.id, p.look, p.s); } else this.pendingRemotes = m.players;
        if (first) this.onFirstWelcome?.();
        else { for (const c of changes) this.applyEdit(...c); this.onStatus?.(true); }
        break;
      }
      case 'join': this.addRemote(m.id, m.look); this.onJoin?.(m.look?.name || 'A dragon'); break;
      case 'leave': { const r = this.remotes.get(m.id); if (r) { this.onLeave?.(r.name); this.removeRemote(m.id); } break; }
      case 'look': { const r = this.remotes.get(m.id); if (r) { r.name = m.look.name || r.name; r.dragon.setLook(m.look); } break; }
      case 's': { const r = this.remotes.get(m.id); if (r) this.setState(r, m); break; }
      case 'e': if (this.edits.set(m.c[0], m.c[1], m.i, m.b)) this.applyEdit(m.c[0], m.c[1], m.i, m.b); break;
    }
  }

  applyEdit(cx, cz, idx, id) {
    const lx = idx % CHUNK, lz = Math.floor(idx / CHUNK) % CHUNK, y = Math.floor(idx / (CHUNK * CHUNK));
    this.world?.setBlock(cx * CHUNK + lx, y, cz * CHUNK + lz, id, false);
    this.onEdit?.(cx * CHUNK + lx + 0.5, y + 0.5, cz * CHUNK + lz + 0.5, id);
  }

  // ---- other players ----
  addRemote(id, look, s) {
    if (!this.scene) { (this.pendingRemotes ??= []).push({ id, look, s }); return; }
    if (this.remotes.has(id)) this.removeRemote(id);
    const dragon = new Dragon(look || {});
    this.scene.add(dragon.root);
    const r = {
      dragon, name: look?.name || 'Dragon', pos: new THREE.Vector3(), target: new THREE.Vector3(), hasPos: false,
      yaw: 0, st: { flying: true, speed: 0, vy: 0, boosting: false, yaw: 0, pitch: 0, roll: 0, lookYaw: 0, lookPitch: 0, breathing: false },
      aim: new THREE.Vector3(0, 0, -1), idle: 0,
    };
    this.remotes.set(id, r);
    if (s) this.setState(r, s);
  }

  setState(r, s) {
    r.target.set(s.p[0], s.p[1], s.p[2]);
    if (!r.hasPos) { r.pos.copy(r.target); r.hasPos = true; }
    const st = r.st;
    st.flying = !!s.f; st.speed = s.sp; st.vy = s.vy; st.boosting = !!s.b;
    st.yaw = s.y; st.pitch = s.pi; st.roll = s.r; st.lookYaw = s.ly; st.lookPitch = s.lp; st.breathing = !!s.br; st.ice = s.br === 2;
    if (s.a) r.aim.set(s.a[0], s.a[1], s.a[2]).normalize();
  }

  removeRemote(id) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.scene.remove(r.dragon.root);
    r.dragon.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.remotes.delete(id);
  }
  clearRemotes() { if (this.scene) for (const id of [...this.remotes.keys()]) this.removeRemote(id); }
  names() { return [...this.remotes.values()].map((r) => r.name); }

  // smooth other dragons toward their last reported state, and breathe their fire
  update(dt, pools, mouth) {
    const out = { fire: false, ice: false };
    const k = 1 - Math.exp(-12 * dt);
    for (const r of this.remotes.values()) {
      r.pos.lerp(r.target, k);
      r.dragon.root.position.copy(r.pos);
      r.dragon.update(dt, r.st);
      if (r.st.breathing) {
        out[r.st.ice ? 'ice' : 'fire'] = true;
        r.dragon.root.updateMatrixWorld(true);
        r.dragon.mouthWorld(mouth);
        pools[r.st.ice ? 'ice' : 'fire'].emit(mouth, r.aim, NO_VEL, dt);
      }
    }
    return out;
  }

  // called every frame with the local player's state; sends ~15 times a second
  sendState(dt, player, look, aim) {
    this.sendT -= dt;
    const br = player.breathing ? (player.breathingIce ? 2 : 1) : 0;
    if (this.sendT > 0 && br === this.lastBr) return;
    this.sendT = 1 / 15;
    this.lastBr = br;
    const a = br ? [aim.x, aim.y, aim.z] : undefined;
    this.send({
      t: 's', p: [player.pos.x, player.pos.y, player.pos.z], y: player.bodyYaw, pi: player.bodyPitch, r: player.roll,
      f: player.flying ? 1 : 0, sp: player.speedXZ, vy: player.vel.y, b: player.boosting ? 1 : 0,
      ly: look.yaw, lp: look.pitch, br, a,
    });
  }
}

export function serverUrl(params, room) {
  const explicit = params.get('server');
  if (explicit) return `${explicit}${explicit.includes('?') ? '&' : '?'}room=${encodeURIComponent(room)}`;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws?room=${encodeURIComponent(room)}`;
}
