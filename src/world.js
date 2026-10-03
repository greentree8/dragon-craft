// Chunk storage, streaming, meshing (with baked ambient occlusion) and voxel raycasting.
import * as THREE from 'three';
import { B, DEFS } from './blocks.js';
import { WorldGen, CHUNK, HEIGHT } from './worldgen.js';
import { hash3 } from './noise.js';

const P = CHUNK + 2; // padded width
const key = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// Face table: normal, 4 corner offsets (CCW seen from outside), and the 3 AO sample dirs per corner.
const FACES = [
  { n: [1, 0, 0],  c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 'side' },
  { n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 'side' },
  { n: [0, 1, 0],  c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 'top' },
  { n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 'bottom' },
  { n: [0, 0, 1],  c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 'side' },
  { n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 'side' },
];

const _c = new THREE.Color();
const COLORS = DEFS.map((d) => ({
  top: new THREE.Color(d.top || 0), side: new THREE.Color(d.side || 0), bottom: new THREE.Color(d.bottom || 0),
}));

class MeshBuilder {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; this.n = 0; }
  quad(f, x, y, z, colors, ao, flip, yOff = 0, topDrop = 0) {
    const { n, c } = f;
    for (let i = 0; i < 4; i++) {
      const cy = c[i][1];
      this.pos.push(x + c[i][0], y + cy - (cy === 1 ? topDrop : 0) + yOff, z + c[i][2]);
      this.nor.push(n[0], n[1], n[2]);
      const col = colors[i];
      const a = ao[i];
      this.col.push(col.r * a, col.g * a, col.b * a);
    }
    const o = this.n;
    if (flip) this.idx.push(o + 1, o + 2, o + 3, o + 1, o + 3, o);
    else this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    this.n += 4;
  }
  build() {
    if (!this.n) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export class World {
  constructor(scene, { seed = 1337, renderDistance = 7 } = {}) {
    this.scene = scene;
    this.gen = new WorldGen(seed);
    this.chunks = new Map();
    this.renderDistance = renderDistance;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.matOpaque = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.matGlow = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.matWater = new THREE.MeshPhongMaterial({
      vertexColors: true, transparent: true, opacity: 0.82, shininess: 90,
      specular: new THREE.Color(0x99ccff), depthWrite: false,
    });
    this.center = { cx: 0, cz: 0 };
    this.queue = [];
    this.shadowRange = 70;
  }

  // ---- block access ----
  chunkAt(cx, cz) { return this.chunks.get(key(cx, cz)); }

  getBlock(x, y, z) {
    if (y < 0 || y >= HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return B.AIR;
    return c.data[(y * CHUNK + (z - cz * CHUNK)) * CHUNK + (x - cx * CHUNK)];
  }

  isLoaded(x, z) {
    const c = this.chunks.get(key(Math.floor(x / CHUNK), Math.floor(z / CHUNK)));
    return !!(c && c.data);
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= HEIGHT) return;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    c.data[(y * CHUNK + lz) * CHUNK + lx] = id;
    c.modified = true;
    this.markDirty(c);
    if (lx === 0) this.markDirtyAt(cx - 1, cz);
    if (lx === CHUNK - 1) this.markDirtyAt(cx + 1, cz);
    if (lz === 0) this.markDirtyAt(cx, cz - 1);
    if (lz === CHUNK - 1) this.markDirtyAt(cx, cz + 1);
  }

  markDirtyAt(cx, cz) { const c = this.chunks.get(key(cx, cz)); if (c) this.markDirty(c); }
  markDirty(c) { c.dirty = true; }

  // ---- streaming ----
  update(px, pz, budgetMs = 7) {
    const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
    if (cx !== this.center.cx || cz !== this.center.cz || !this.queue.length) {
      this.center = { cx, cz };
      this.rebuildQueue();
    }
    const start = performance.now();
    let guard = 0;
    while (performance.now() - start < budgetMs && guard++ < 6) {
      const job = this.nextJob();
      if (!job) break;
      if (job.type === 'gen') this.generateChunk(job.cx, job.cz);
      else this.meshChunk(job.chunk);
    }
    this.unloadFar();
    // only chunks near the sun-shadow frustum cast shadows
    for (const c of this.chunks.values()) {
      if (!c.mesh) continue;
      const dx = (c.cx + 0.5) * CHUNK - px, dz = (c.cz + 0.5) * CHUNK - pz;
      const near = dx * dx + dz * dz < this.shadowRange * this.shadowRange;
      for (const m of c.meshes) m.castShadow = near && m !== c.water;
    }
  }

  rebuildQueue() {
    const { cx, cz } = this.center;
    const r = this.renderDistance + 1;
    const list = [];
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dz);
      if (d <= r + 0.5) list.push({ cx: cx + dx, cz: cz + dz, d });
    }
    list.sort((a, b) => a.d - b.d);
    this.queue = list;
  }

  nextJob() {
    // generate any missing chunk in range, nearest first; mesh when all 8 neighbours exist
    const r = this.renderDistance;
    for (const e of this.queue) {
      let c = this.chunks.get(key(e.cx, e.cz));
      if (!c) return { type: 'gen', cx: e.cx, cz: e.cz };
    }
    for (const e of this.queue) {
      if (e.d > r + 0.5) continue;
      const c = this.chunks.get(key(e.cx, e.cz));
      if (c && (c.dirty || !c.meshed) && this.neighboursReady(e.cx, e.cz)) return { type: 'mesh', chunk: c };
    }
    return null;
  }

  neighboursReady(cx, cz) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.chunks.get(key(cx + dx, cz + dz));
      if (!c || !c.data) return false;
    }
    return true;
  }

  generateChunk(cx, cz) {
    const c = { cx, cz, data: this.gen.generate(cx, cz), meshed: false, dirty: true, meshes: [], mesh: null, water: null, modified: false };
    this.chunks.set(key(cx, cz), c);
  }

  unloadFar() {
    const { cx, cz } = this.center;
    const lim = this.renderDistance + 3;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - cx) > lim || Math.abs(c.cz - cz) > lim) {
        this.disposeMeshes(c);
        if (!c.modified) this.chunks.delete(k);
        else c.meshed = false;
      }
    }
  }

  disposeMeshes(c) {
    for (const m of c.meshes) { this.group.remove(m); m.geometry.dispose(); }
    c.meshes = []; c.mesh = null; c.water = null;
  }

  // ---- meshing ----
  meshChunk(c) {
    const { cx, cz } = c;
    // padded copy so neighbour/AO lookups are cheap
    const pad = new Uint8Array(P * HEIGHT * P);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nc = this.chunks.get(key(cx + dx, cz + dz));
      const d = nc.data;
      const x0 = dx === -1 ? CHUNK - 1 : dx === 1 ? 0 : 0;
      const x1 = dx === -1 ? CHUNK - 1 : dx === 1 ? 0 : CHUNK - 1;
      const z0 = dz === -1 ? CHUNK - 1 : dz === 1 ? 0 : 0;
      const z1 = dz === -1 ? CHUNK - 1 : dz === 1 ? 0 : CHUNK - 1;
      for (let y = 0; y < HEIGHT; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        pad[((z + dz * CHUNK + 1) * HEIGHT + y) * P + (x + dx * CHUNK + 1)] = d[(y * CHUNK + z) * CHUNK + x];
      }
    }
    const at = (x, y, z) => (y < 0 || y >= HEIGHT ? 0 : pad[((z + 1) * HEIGHT + y) * P + (x + 1)]);
    const opaqueAt = (x, y, z) => { const b = at(x, y, z); return DEFS[b].opaque && !DEFS[b].emissive ? 1 : 0; };

    const solid = new MeshBuilder(), glow = new MeshBuilder(), water = new MeshBuilder();
    const colors = [{ r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 0 }];
    const ao = [1, 1, 1, 1];
    const AO_LEVELS = [0.52, 0.7, 0.86, 1];

    // highest non-air layer, so we can skip the empty sky
    let maxY = 0;
    for (let row = 0; row < P * HEIGHT; row++) {
      const y = row % HEIGHT;
      if (y <= maxY) continue;
      const base = row * P;
      for (let x = 0; x < P; x++) if (pad[base + x]) { maxY = y; break; }
    }
    for (let y = 0; y <= Math.min(HEIGHT - 1, maxY); y++) {
      for (let z = 0; z < CHUNK; z++) {
        for (let x = 0; x < CHUNK; x++) {
          const id = at(x, y, z);
          if (id === 0) continue;
          const def = DEFS[id];
          const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
          const jit = 1 + (hash3(wx, y, wz, 5) - 0.5) * 2 * def.jitter;
          const isWater = id === B.WATER;
          const isGlow = def.emissive;
          for (let fi = 0; fi < 6; fi++) {
            const f = FACES[fi];
            const nb = at(x + f.n[0], y + f.n[1], z + f.n[2]);
            const nd = DEFS[nb];
            // visibility
            if (isWater) { if (nb !== 0) continue; }
            else if (id === B.LAVA) { if (nb === B.LAVA || (nd.opaque && !nd.emissive)) continue; }
            else if (isGlow) { if (nb === id || (nd.opaque && !nd.emissive)) continue; }
            else if (nd.opaque && !nd.emissive) continue;

            const base = COLORS[id];
            const faceCol = f.shade === 'top' ? base.top : f.shade === 'bottom' ? base.bottom : base.side;
            const gm = isGlow ? def.glow : 1;
            const target = isWater ? water : isGlow ? glow : solid;

            for (let i = 0; i < 4; i++) {
              let col = faceCol;
              if (def.gradTop && f.shade === 'side') {
                // grass/snow fringe: top vertices lean toward the top colour
                col = _c.copy(base.side).lerp(base.top, f.c[i][1] === 1 ? 0.92 : 0.08);
              }
              const k = jit * gm;
              const o = colors[i]; o.r = col.r * k; o.g = col.g * k; o.b = col.b * k;
            }

            // ambient occlusion for opaque blocks
            let flip = false;
            if (!isWater && !isGlow) {
              const [nx, ny, nz] = f.n;
              for (let i = 0; i < 4; i++) {
                const cc = f.c[i];
                // corner direction relative to block centre, along the two tangent axes
                const sx = cc[0] * 2 - 1, sy = cc[1] * 2 - 1, sz = cc[2] * 2 - 1;
                let s1, s2, cn;
                if (nx !== 0) {
                  s1 = opaqueAt(x + nx, y + sy, z); s2 = opaqueAt(x + nx, y, z + sz); cn = opaqueAt(x + nx, y + sy, z + sz);
                } else if (ny !== 0) {
                  s1 = opaqueAt(x + sx, y + ny, z); s2 = opaqueAt(x, y + ny, z + sz); cn = opaqueAt(x + sx, y + ny, z + sz);
                } else {
                  s1 = opaqueAt(x + sx, y, z + nz); s2 = opaqueAt(x, y + sy, z + nz); cn = opaqueAt(x + sx, y + sy, z + nz);
                }
                const lvl = s1 && s2 ? 0 : 3 - (s1 + s2 + cn);
                ao[i] = AO_LEVELS[lvl];
              }
              flip = ao[0] + ao[2] < ao[1] + ao[3];
            } else { ao[0] = ao[1] = ao[2] = ao[3] = 1; }

            let drop = 0;
            if (isWater && at(x, y + 1, z) === 0) drop = 0.12;
            target.quad(f, x, y, z, colors, ao, flip, 0, drop);
          }
        }
      }
    }

    this.disposeMeshes(c);
    const mk = (b, mat, order) => {
      const g = b.build();
      if (!g) return null;
      const m = new THREE.Mesh(g, mat);
      m.position.set(cx * CHUNK, 0, cz * CHUNK);
      m.receiveShadow = mat === this.matOpaque;
      m.renderOrder = order;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      c.meshes.push(m);
      return m;
    };
    c.mesh = mk(solid, this.matOpaque, 0);
    mk(glow, this.matGlow, 0);
    c.water = mk(water, this.matWater, 2);
    c.meshed = true;
    c.dirty = false;
  }

  // ---- voxel raycast (Amanatides & Woo) ----
  raycast(origin, dir, maxDist = 6, hitLiquid = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
    const tdx = sx ? Math.abs(1 / dir.x) : Infinity, tdy = sy ? Math.abs(1 / dir.y) : Infinity, tdz = sz ? Math.abs(1 / dir.z) : Infinity;
    let tx = sx ? (sx > 0 ? x + 1 - origin.x : origin.x - x) * tdx : Infinity;
    let ty = sy ? (sy > 0 ? y + 1 - origin.y : origin.y - y) * tdy : Infinity;
    let tz = sz ? (sz > 0 ? z + 1 - origin.z : origin.z - z) * tdz : Infinity;
    let t = 0, nx = 0, ny = 0, nz = 0;
    while (t <= maxDist) {
      const b = this.getBlock(x, y, z);
      if (b !== 0 && (DEFS[b].solid || hitLiquid)) return { x, y, z, id: b, t, normal: { x: nx, y: ny, z: nz } };
      if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; nx = -sx; ny = 0; nz = 0; }
      else if (ty < tz) { y += sy; t = ty; ty += tdy; nx = 0; ny = -sy; nz = 0; }
      else { z += sz; t = tz; tz += tdz; nx = 0; ny = 0; nz = -sz; }
    }
    return null;
  }

  loadedFraction() {
    const r = 2; let ok = 0, tot = 0;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      tot++;
      const c = this.chunks.get(key(this.center.cx + dx, this.center.cz + dz));
      if (c && c.meshed) ok++;
    }
    return ok / tot;
  }

  stats() {
    let tris = 0, n = 0;
    for (const c of this.chunks.values()) for (const m of c.meshes) { tris += m.geometry.index.count / 3; n++; }
    return { chunks: this.chunks.size, meshes: n, tris };
  }
}
