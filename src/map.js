// Full-screen world map (M): terrain drawn from the world generator, plus the landmarks, you and other players.
import { SEA, VILLAGE, VOLCANO, LAKE, CRYSTAL_ISLE } from './worldgen.js';
import { CASTLES } from './castle.js';
import { MAZES } from './mazegen.js';

const SPAN = 1000;          // blocks across, centred on the origin
const RES = 4;              // blocks per terrain pixel
const W = SPAN / RES;       // terrain pixels across
const VIEW = 640;           // overlay canvas size (CSS pixels)
const mix = (a, b, t) => a + (b - a) * t;

const PLACES = [
  { name: 'Village', icon: 'village', x: VILLAGE.x, z: VILLAGE.z },
  { name: 'Volcano', icon: 'volcano', x: VOLCANO.x, z: VOLCANO.z },
  { name: 'Lake', icon: 'lake', x: LAKE.x, z: LAKE.z },
  { name: 'Crystal Isle', icon: 'crystal', x: CRYSTAL_ISLE.x, z: CRYSTAL_ISLE.z },
  ...MAZES.map((m) => ({ name: m.name, icon: m.id === 'volcano' ? 'volcanomaze' : 'maze', x: m.x, z: m.z, big: true })),
  ...CASTLES.map((c, i) => ({ name: `Castle ${i + 1}`, icon: 'castle', x: c.x, z: c.z, big: true })),
];

// vector icons, so the map never depends on emoji fonts
function drawIcon(g, kind, x, y, k) {
  g.lineWidth = 3; g.strokeStyle = '#fff'; g.lineJoin = 'round';
  const box = (fill, w, h) => { g.fillStyle = fill; g.fillRect(x - w, y - h, 2 * w, 2 * h); g.strokeRect(x - w, y - h, 2 * w, 2 * h); };
  if (kind === 'castle') {
    box('#8c919b', k, k * 0.7);
    g.fillStyle = '#8c919b';
    for (const dx of [-k, -k * 0.2, k * 0.6]) { g.fillRect(x + dx, y - k * 1.1, k * 0.4, k * 0.4); g.strokeRect(x + dx, y - k * 1.1, k * 0.4, k * 0.4); }
    g.fillStyle = '#3a3d44'; g.fillRect(x - k * 0.25, y, k * 0.5, k * 0.7);
  } else if (kind === 'maze') {
    box('#9b3fe0', k, k);
    g.strokeStyle = '#e8c8ff'; g.lineWidth = 3; g.beginPath();
    g.moveTo(x - k * 0.5, y + k * 0.8); g.lineTo(x - k * 0.5, y - k * 0.4); g.lineTo(x + k * 0.1, y - k * 0.4); g.lineTo(x + k * 0.1, y + k * 0.3); g.lineTo(x + k * 0.6, y + k * 0.3); g.lineTo(x + k * 0.6, y - k * 0.8);
    g.stroke();
  } else if (kind === 'volcanomaze') {
    box('#2a1a3a', k, k);
    g.strokeStyle = '#ff7a2a'; g.lineWidth = 3; g.beginPath();
    g.moveTo(x - k * 0.5, y + k * 0.8); g.lineTo(x - k * 0.5, y - k * 0.4); g.lineTo(x + k * 0.1, y - k * 0.4); g.lineTo(x + k * 0.1, y + k * 0.3); g.lineTo(x + k * 0.6, y + k * 0.3); g.lineTo(x + k * 0.6, y - k * 0.8);
    g.stroke();
  } else if (kind === 'village') {
    box('#b9814a', k * 0.8, k * 0.55);
    g.fillStyle = '#c0392b'; g.beginPath(); g.moveTo(x - k, y - k * 0.5); g.lineTo(x, y - k * 1.3); g.lineTo(x + k, y - k * 0.5); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.stroke();
  } else if (kind === 'volcano') {
    g.fillStyle = '#ff6a1a'; g.beginPath(); g.moveTo(x - k, y + k * 0.8); g.lineTo(x, y - k); g.lineTo(x + k, y + k * 0.8); g.closePath(); g.fill(); g.stroke();
  } else if (kind === 'crystal') {
    g.fillStyle = '#45e8ff'; g.beginPath(); g.moveTo(x, y - k * 1.2); g.lineTo(x + k * 0.8, y); g.lineTo(x, y + k * 1.2); g.lineTo(x - k * 0.8, y); g.closePath(); g.fill(); g.stroke();
  } else {
    g.fillStyle = '#3a8fe0'; g.beginPath(); g.arc(x, y, k, 0, Math.PI * 2); g.fill(); g.stroke();
  }
}

export class WorldMap {
  constructor(gen) {
    this.gen = gen;
    this.open = false;
    this.row = 0;
    this.root = document.createElement('div');
    this.root.id = 'worldmap';
    this.root.className = 'hidden';
    this.root.innerHTML = '<div class="wm-title">World map <span>(M to close)</span></div>';
    this.stack = document.createElement('div');
    this.stack.className = 'wm-stack';
    this.terrain = document.createElement('canvas');
    this.terrain.width = this.terrain.height = W;
    this.over = document.createElement('canvas');
    this.over.width = this.over.height = VIEW * 2;
    this.over.style.width = this.over.style.height = `${VIEW}px`;
    this.terrain.style.width = this.terrain.style.height = `${VIEW}px`;
    this.stack.append(this.terrain, this.over);
    this.status = document.createElement('div');
    this.status.className = 'wm-status';
    this.root.append(this.stack, this.status);
    document.body.appendChild(this.root);
    this.img = this.terrain.getContext('2d').createImageData(W, W);
    this.heights = new Float32Array(W * W);
    this.done = false;
  }

  toggle() { this.setOpen(!this.open); }
  setOpen(v) {
    this.open = v;
    this.root.classList.toggle('hidden', !v);
  }

  worldToMap(x, z) { return [((x + SPAN / 2) / SPAN) * VIEW * 2, ((z + SPAN / 2) / SPAN) * VIEW * 2]; }

  // paint a slice of the terrain per frame so opening the map never freezes the game
  buildSome(rows = 14) {
    if (this.done) return;
    const g = this.gen, d = this.img.data;
    for (let n = 0; n < rows && this.row < W; n++, this.row++) {
      const py = this.row, z = py * RES - SPAN / 2;
      for (let px = 0; px < W; px++) {
        const x = px * RES - SPAN / 2;
        const h = g.height(Math.floor(x), Math.floor(z));
        this.heights[py * W + px] = h;
        let r, gr, b;
        const { temp, moist } = g.climate(x, z);
        const dvol = g.volcanoDist(x, z);
        if (h <= SEA) { const k = Math.min(1, (SEA - h) / 14); r = mix(70, 20, k); gr = mix(140, 60, k); b = mix(210, 140, k); }
        else if (dvol < VOLCANO.radius * 0.8 && h > 40) { const hot = dvol < 12; r = hot ? 255 : 60; gr = hot ? 110 : 52; b = hot ? 20 : 56; }
        else if (h > 66 || (temp < -0.28 && h > SEA + 2)) { r = 244; gr = 248; b = 252; }
        else if (h <= SEA + 1 || (temp > 0.22 && moist < 0.1)) { r = 226; gr = 208; b = 142; }
        else { const t = Math.min(1, (h - 30) / 30); r = mix(86, 120, t); gr = mix(158, 130, t); b = mix(60, 70, t); }
        // simple hill shading from the height difference towards the north-west
        if (px > 0 && py > 0) {
          const s = (this.heights[(py - 1) * W + px - 1] - h) * 7;
          r += s; gr += s; b += s;
        }
        const i = (py * W + px) * 4;
        d[i] = r; d[i + 1] = gr; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    this.terrain.getContext('2d').putImageData(this.img, 0, 0);
    if (this.row >= W) { this.done = true; this.status.textContent = ''; }
    else this.status.textContent = `Drawing the map… ${Math.round((this.row / W) * 100)}%`;
  }

  // me: { x, z, yaw }; others: [{ name, x, z, color }]
  draw(me, others) {
    if (!this.open) return;
    this.buildSome();
    const g = this.over.getContext('2d'), S = VIEW * 2;
    g.clearRect(0, 0, S, S);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
    g.beginPath();
    for (let v = -400; v <= 400; v += 200) { const [x] = this.worldToMap(v, 0), [, y] = this.worldToMap(0, v); g.moveTo(x, 0); g.lineTo(x, S); g.moveTo(0, y); g.lineTo(S, y); }
    g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const p of PLACES) {
      const [x, y] = this.worldToMap(p.x, p.z);
      drawIcon(g, p.icon, x, y, p.big ? 16 : 13);
      g.font = '700 22px system-ui, sans-serif';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(p.name, x, y + 34);
      g.fillStyle = '#fff'; g.fillText(p.name, x, y + 34);
    }
    for (const o of others) {
      const [x, y] = this.clamp(...this.worldToMap(o.x, o.z), S);
      g.fillStyle = `#${(o.color ?? 0xffffff).toString(16).padStart(6, '0')}`;
      g.strokeStyle = '#fff'; g.lineWidth = 4;
      g.beginPath(); g.arc(x, y, 11, 0, Math.PI * 2); g.fill(); g.stroke();
      g.font = '700 22px system-ui, sans-serif';
      g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText(o.name, x, y - 24);
      g.fillStyle = '#fff'; g.fillText(o.name, x, y - 24);
    }
    // you: an arrow pointing the way you face (north is up)
    const [mx, my] = this.clamp(...this.worldToMap(me.x, me.z), S);
    const dx = -Math.sin(me.yaw), dz = -Math.cos(me.yaw), a = Math.atan2(dz, dx);
    g.save(); g.translate(mx, my); g.rotate(a);
    g.fillStyle = '#ff3b3b'; g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(20, 0); g.lineTo(-12, 13); g.lineTo(-5, 0); g.lineTo(-12, -13); g.closePath(); g.fill(); g.stroke();
    g.restore();
    g.font = '700 22px system-ui, sans-serif';
    g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.8)'; g.strokeText('You', mx, my - 30);
    g.fillStyle = '#ffd0d0'; g.fillText('You', mx, my - 30);
    if (this.done) this.status.textContent = `You: x ${Math.round(me.x)}, z ${Math.round(me.z)}   ·   north is up`;
  }

  clamp(x, y, S) { const m = 24; return [Math.max(m, Math.min(S - m, x)), Math.max(m, Math.min(S - m, y))]; }
}
