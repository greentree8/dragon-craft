// Chunk storage, streaming, meshing (with baked ambient occlusion) and voxel raycasting.
import * as THREE from 'three';
import { B, DEFS } from './blocks.js';
import { WorldGen, CHUNK, HEIGHT } from './worldgen.js';
import { hash3 } from './noise.js';
import { buildSmooth, PAD, P } from './smooth.js';
import { makeTerrainMaterial } from './material.js';

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
  // a rounded trunk segment along `axis` filling the voxel; capLo/capHi add end caps
  log(x, y, z, axis, capLo, capHi, colors, jit, h) {
    const SIDES = 12, R = 0.47, o = [x + 0.5, y + 0.5, z + 0.5];
    const u = (axis + 1) % 3, v = (axis + 2) % 3;
    const push = (p, n, c, k) => {
      this.pos.push(p[0], p[1], p[2]); this.nor.push(n[0], n[1], n[2]);
      this.col.push(c.r * k, c.g * k, c.b * k); return this.n++;
    };
    const ring = [];
    for (let i = 0; i < SIDES; i++) {
      const a = (i / SIDES) * Math.PI * 2, cu = Math.cos(a), cv = Math.sin(a);
      const streak = 0.82 + 0.3 * h(i, 0); // bark streaks run along the trunk
      const lo = [0, 0, 0], hi = [0, 0, 0], n = [0, 0, 0];
      lo[axis] = o[axis] - 0.5; hi[axis] = o[axis] + 0.5;
      lo[u] = hi[u] = o[u] + cu * R; lo[v] = hi[v] = o[v] + cv * R;
      n[u] = cu; n[v] = cv;
      ring.push([push(lo, n, colors.side, jit * streak), push(hi, n, colors.side, jit * streak)]);
    }
    const P3 = this.pos, N3 = this.nor;
    // wind each triangle so it faces the way its vertex normals point
    const tri = (a, b, c) => {
      const ax = P3[b * 3] - P3[a * 3], ay = P3[b * 3 + 1] - P3[a * 3 + 1], az = P3[b * 3 + 2] - P3[a * 3 + 2];
      const bx = P3[c * 3] - P3[a * 3], by = P3[c * 3 + 1] - P3[a * 3 + 1], bz = P3[c * 3 + 2] - P3[a * 3 + 2];
      const d = (ay * bz - az * by) * (N3[a * 3] + N3[b * 3] + N3[c * 3])
        + (az * bx - ax * bz) * (N3[a * 3 + 1] + N3[b * 3 + 1] + N3[c * 3 + 1])
        + (ax * by - ay * bx) * (N3[a * 3 + 2] + N3[b * 3 + 2] + N3[c * 3 + 2]);
      if (d < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
    };
    for (let i = 0; i < SIDES; i++) {
      const [l0, h0] = ring[i], [l1, h1] = ring[(i + 1) % SIDES];
      tri(l0, l1, h1); tri(l0, h1, h0);
    }
    const cap = (at, sign) => {
      const n = [0, 0, 0]; n[axis] = sign;
      const p = [0, 0, 0]; p[axis] = at; p[u] = o[u]; p[v] = o[v];
      const c = push(p, n, colors.top, jit);
      const rim = [];
      for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2, q = [0, 0, 0];
        q[axis] = at; q[u] = o[u] + Math.cos(a) * R; q[v] = o[v] + Math.sin(a) * R;
        rim.push(push(q, n, colors.top, jit * 0.92));
      }
      for (let i = 0; i < SIDES; i++) tri(c, rim[i], rim[(i + 1) % SIDES]);
    };
    if (capHi) cap(o[axis] + 0.5, 1);
    if (capLo) cap(o[axis] - 0.5, -1);
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
  constructor(scene, { seed = 1337, renderDistance = 7, save = null } = {}) {
    this.scene = scene;
    this.save = save;
    this.gen = new WorldGen(seed);
    this.chunks = new Map();
    this.renderDistance = renderDistance;
    this.group = new THREE.Group();
    scene.add(this.group);

    this.matOpaque = makeTerrainMaterial({ roughness: 0.92, detail: 0.9 });
    this.matSmooth = makeTerrainMaterial({ roughness: 0.95, detail: 1.25 });
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

  // Changes a block, persists the edit and re-meshes the affected chunks right away.
  // record=false is used when applying edits that came from other players
  setBlock(x, y, z, id, record = true) {
    if (y < 0 || y >= HEIGHT) return false;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.data) return false;
    const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
    const idx = (y * CHUNK + lz) * CHUNK + lx;
    if (c.data[idx] === id) return false;
    c.data[idx] = id;
    if (record && this.save) this.save.recordEdit(cx, cz, idx, id);
    const touched = [c];
    const dxs = [0], dzs = [0];
    if (lx < PAD) dxs.push(-1);
    if (lx >= CHUNK - PAD) dxs.push(1);
    if (lz < PAD) dzs.push(-1);
    if (lz >= CHUNK - PAD) dzs.push(1);
    for (const dx of dxs) for (const dz of dzs) if (dx || dz) touched.push(this.chunks.get(key(cx + dx, cz + dz)));
    for (const t of touched) {
      if (!t || !t.data) continue;
      if (t.meshed && this.neighboursReady(t.cx, t.cz)) this.meshChunk(t);
      else t.dirty = true;
    }
    return true;
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
      if (!c.meshes.length) continue;
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
    const data = this.gen.generate(cx, cz);
    const edits = this.save && this.save.getEdits(cx, cz);
    if (edits) for (const [i, id] of edits) data[i] = id;
    this.chunks.set(key(cx, cz), { cx, cz, data, meshed: false, dirty: true, meshes: [], mesh: null, water: null });
  }

  unloadFar() {
    const { cx, cz } = this.center;
    const lim = this.renderDistance + 3;
    for (const [k, c] of this.chunks) {
      if (Math.abs(c.cx - cx) > lim || Math.abs(c.cz - cz) > lim) {
        this.disposeMeshes(c);
        this.chunks.delete(k); // edits live in the save, not the chunk
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
    // padded copy so neighbour/AO/smoothing lookups are cheap
    const pad = new Uint8Array(P * HEIGHT * P);
    for (let pz = -PAD; pz < CHUNK + PAD; pz++) for (let px = -PAD; px < CHUNK + PAD; px++) {
      const ncx = Math.floor(px / CHUNK), ncz = Math.floor(pz / CHUNK);
      const d = this.chunks.get(key(cx + ncx, cz + ncz)).data;
      const lx = px - ncx * CHUNK, lz = pz - ncz * CHUNK;
      for (let y = 0; y < HEIGHT; y++) pad[((pz + PAD) * HEIGHT + y) * P + (px + PAD)] = d[(y * CHUNK + lz) * CHUNK + lx];
    }
    const at = (x, y, z) => (y < 0 || y >= HEIGHT ? 0 : pad[((z + PAD) * HEIGHT + y) * P + (x + PAD)]);
    const opaqueAt = (x, y, z) => { const b = at(x, y, z); return DEFS[b].opaque && !DEFS[b].emissive ? 1 : 0; };
    // smooth and round blocks don't fill their voxel, so they never hide a neighbour's face
    const hides = (d) => d.opaque && !d.emissive && !d.smooth && !d.round;

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
          if (def.smooth) continue;
          if (def.round) {
            const wx = cx * CHUNK + x, wz = cz * CHUNK + z;
            const same = (dx, dy, dz) => at(x + dx, y + dy, z + dz) === id;
            let axis = 1;
            if (!same(0, 1, 0) && !same(0, -1, 0)) { if (same(1, 0, 0) || same(-1, 0, 0)) axis = 0; else if (same(0, 0, 1) || same(0, 0, -1)) axis = 2; }
            const dir = [0, 0, 0]; dir[axis] = 1;
            const jit = 1 + (hash3(wx, y, wz, 5) - 0.5) * 2 * def.jitter;
            solid.log(x, y, z, axis, !same(-dir[0], -dir[1], -dir[2]), !same(dir[0], dir[1], dir[2]), COLORS[id], jit, hash3.bind(null, wx, wz));
            continue;
          }
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
            else if (id === B.LAVA) { if (nb === B.LAVA || hides(nd)) continue; }
            else if (isGlow) { if (nb === id || hides(nd)) continue; }
            else if (hides(nd)) continue;

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
    const sg = buildSmooth(pad, maxY, cx * CHUNK, cz * CHUNK);
    if (sg) {
      const m = new THREE.Mesh(sg, this.matSmooth);
      m.position.set(cx * CHUNK, 0, cz * CHUNK);
      m.receiveShadow = true;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      this.group.add(m);
      c.meshes.push(m);
    }
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
