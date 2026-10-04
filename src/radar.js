// Radar for multiplayer: shows the direction and distance to the other dragons, relative to where you're facing.
const SIZE = 168, R = SIZE / 2 - 6, MAX_RANGE = 400;
const ARROWS = ['↑', '↗', '→', '↘', '↓', '↙', '←', '↖'];
const css = (n) => `#${(n ?? 0xffffff).toString(16).padStart(6, '0')}`;

export class Radar {
  constructor(parent) {
    this.root = document.createElement('div');
    this.root.id = 'radar';
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = SIZE * 2; // crisp on high-DPI screens
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.list = document.createElement('div');
    this.list.className = 'radar-list';
    this.root.append(this.canvas, this.list);
    parent.appendChild(this.root);
    this.ctx = this.canvas.getContext('2d');
    this.ctx.scale(2, 2);
    this.listT = 0;
  }

  // me: { x, y, z, yaw }; others: [{ name, x, y, z, color }]; status: text shown when nobody is around
  update(dt, me, others, status, places = []) {
    const g = this.ctx, c = SIZE / 2;
    g.clearRect(0, 0, SIZE, SIZE);
    g.fillStyle = 'rgba(8,14,28,.62)';
    g.beginPath(); g.arc(c, c, R + 4, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1;
    for (const f of [0.35, 0.7, 1]) { g.beginPath(); g.arc(c, c, R * f, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(c, c - R); g.lineTo(c, c + R); g.moveTo(c - R, c); g.lineTo(c + R, c); g.stroke();
    // you: a small arrow pointing up (the way you face)
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(c, c - 7); g.lineTo(c + 5, c + 5); g.lineTo(c, c + 2); g.lineTo(c - 5, c + 5); g.closePath(); g.fill();

    const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), rx = Math.cos(me.yaw), rz = -Math.sin(me.yaw);
    const rows = [];
    for (const o of others) {
      const dx = o.x - me.x, dz = o.z - me.z, dy = o.y - me.y;
      const dist = Math.hypot(dx, dz, dy), flat = Math.hypot(dx, dz);
      const sx = dx * rx + dz * rz, sy = dx * fx + dz * fz; // sy > 0 is ahead of you
      const ang = Math.atan2(sx, sy); // 0 = straight ahead, + = to your right
      const r = R * Math.min(1, Math.pow(flat / MAX_RANGE, 0.55));
      const px = c + Math.sin(ang) * r, py = c - Math.cos(ang) * r;
      g.fillStyle = css(o.color); g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      if (flat > MAX_RANGE) { // beyond the radar: an arrow on the rim
        g.save(); g.translate(px, py); g.rotate(ang);
        g.beginPath(); g.moveTo(0, -7); g.lineTo(6, 5); g.lineTo(-6, 5); g.closePath(); g.fill(); g.stroke(); g.restore();
      } else { g.beginPath(); g.arc(px, py, 5.5, 0, Math.PI * 2); g.fill(); g.stroke(); }
      const oct = (Math.round(ang / (Math.PI / 4)) + 8) % 8;
      rows.push({ o, dist, arrow: ARROWS[oct], vert: dy > 8 ? '▲' : dy < -8 ? '▼' : '' });
    }

    // castles: grey squares, and the nearest one is listed below
    let nearest = null;
    for (const pl of places) {
      const dx = pl.x - me.x, dz = pl.z - me.z, flat = Math.hypot(dx, dz);
      const sx = dx * rx + dz * rz, sy = dx * fx + dz * fz, ang = Math.atan2(sx, sy);
      const r = R * Math.min(1, Math.pow(flat / MAX_RANGE, 0.55));
      g.fillStyle = '#c9ced6'; g.strokeStyle = '#222'; g.lineWidth = 1;
      g.fillRect(c + Math.sin(ang) * r - 4, c - Math.cos(ang) * r - 4, 8, 8);
      g.strokeRect(c + Math.sin(ang) * r - 4, c - Math.cos(ang) * r - 4, 8, 8);
      if (!nearest || flat < nearest.flat) nearest = { pl, flat, ang };
    }
    this.listT -= dt;
    if (this.listT <= 0) {
      this.listT = 0.25;
      this.list.replaceChildren();
      if (!rows.length) { const d = document.createElement('div'); d.className = 'radar-empty'; d.textContent = status; this.list.appendChild(d); }
      rows.sort((a, b) => a.dist - b.dist);
      if (nearest) {
        const d = document.createElement('div');
        const oct = (Math.round(nearest.ang / (Math.PI / 4)) + 8) % 8;
        d.append(`🏰 ${nearest.pl.name}  ${ARROWS[oct]} ${Math.round(nearest.flat)} m`);
        this.list.appendChild(d);
      }
      if (rows.length) { const h = document.createElement('div'); h.className = 'radar-empty'; h.textContent = 'J: fly to a friend'; this.list.appendChild(h); }
      for (const r of rows) {
        const d = document.createElement('div');
        const dot = document.createElement('i'); dot.style.background = css(r.o.color);
        d.append(dot, `${r.o.name}  ${r.arrow} ${Math.round(r.dist)} m ${r.vert}`);
        this.list.appendChild(d);
      }
    }
  }
}
