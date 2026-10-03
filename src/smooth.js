// Smooth terrain mesher. "Natural" blocks (def.smooth) are turned into a density field, blurred, and
// meshed with surface nets so hills, cliffs and tree canopies are rounded instead of cubic.
// Collisions and building still use the voxels underneath.
import * as THREE from 'three';
import { DEFS } from './blocks.js';
import { CHUNK, HEIGHT } from './worldgen.js';
import { hash3 } from './noise.js';

export const PAD = 3; // voxels of neighbour data needed on each side of a chunk
export const P = CHUNK + 2 * PAD;

const ISO = 13.5; // blurred 3x3x3 count (0..27) that marks the surface
const Y = HEIGHT + 4;
const SM = DEFS.map((d) => !!d.smooth);
const SOLID = DEFS.map((d) => (d.solid ? 1 : 0));
const LEAFY = DEFS.map((d) => (d.leafy ? 1 : 0));
const COL = DEFS.map((d) => ({ top: new THREE.Color(d.top || 0), side: new THREE.Color(d.side || 0) }));
const _c = new THREE.Color();

const EDGES = [];
for (let a = 0; a < 8; a++) for (let b = 1; b < 8; b <<= 1) if (!(a & b)) EDGES.push([a, a | b]);

const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// pad: Uint8Array voxel ids, index ((z + PAD) * HEIGHT + y) * P + (x + PAD). Returns a geometry or null.
export function buildSmooth(pad, maxY, ox, oz) {
  const yMaxS = Math.min(HEIGHT, maxY + 1); // highest sample row that can hold surface data

  // occupancy of smooth blocks (below the world counts as solid, above as air)
  const occ = new Uint8Array(P * P * Y);
  let any = 0;
  const yHi = Math.min(HEIGHT - 1, maxY);
  for (let z = 0; z < P; z++) for (let y = 0; y <= yHi; y++) {
    const row = (z * HEIGHT + y) * P, orow = (z * Y + y + 2) * P;
    for (let x = 0; x < P; x++) if (SM[pad[row + x]]) { occ[orow + x] = 1; any++; }
  }
  if (!any) return null;
  for (let z = 0; z < P; z++) for (let y = 0; y < 2; y++) occ.fill(1, (z * Y + y) * P, (z * Y + y + 1) * P);

  // blurred density at sample points x,z in [-1, CHUNK], y in [-1, yMaxS]
  const CW = CHUNK + 2, CY = yMaxS + 2;
  const C = new Uint8Array(CW * CW * CY);
  const cidx = (x, y, z) => ((z + 1) * CY + (y + 1)) * CW + (x + 1);
  for (let z = -1; z <= CHUNK; z++) for (let y = -1; y <= yMaxS; y++) for (let x = -1; x <= CHUNK; x++) {
    let s = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) {
      const o = ((z + dz + PAD) * Y + (y + dy + 2)) * P + (x + PAD);
      s += occ[o - 1] + occ[o] + occ[o + 1];
    }
    C[cidx(x, y, z)] = s;
  }

  const pos = [], nor = [], col = [], idx = [];
  const vmap = new Int32Array((CHUNK + 1) * (CHUNK + 1) * (yMaxS + 1)).fill(-1);
  const cv = new Array(8);

  const rawAt = (x, y, z) => (y < 0 || y >= HEIGHT ? 0 : pad[((z + PAD) * HEIGHT + y) * P + (x + PAD)]);

  // cheap baked ambient occlusion: how full of solid blocks is the space just off the surface?
  function ambient(px, py, pz) {
    const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
    let n = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) n += SOLID[rawAt(bx + dx, by + dy, bz + dz)];
    return Math.max(0.5, 1 - 1.1 * (n / 27));
  }

  function vertex(x, y, z) {
    const mi = ((z + 1) * (yMaxS + 1) + (y + 1)) * (CHUNK + 1) + (x + 1);
    if (vmap[mi] >= 0) return vmap[mi];
    let mask = 0;
    for (let i = 0; i < 8; i++) {
      const v = C[cidx(x + (i & 1), y + ((i >> 1) & 1), z + (i >> 2))];
      cv[i] = v;
      if (v > ISO) mask |= 1 << i;
    }
    let px = 0, py = 0, pz = 0, n = 0;
    for (const [a, b] of EDGES) {
      if (((mask >> a) & 1) === ((mask >> b) & 1)) continue;
      const t = (ISO - cv[a]) / (cv[b] - cv[a]);
      px += (a & 1) + ((b & 1) - (a & 1)) * t;
      py += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
      pz += (a >> 2) + ((b >> 2) - (a >> 2)) * t;
      n++;
    }
    const vx = x + px / n + 0.5, vy = y + py / n + 0.5, vz = z + pz / n + 0.5;

    // normal = downhill of the blurred density
    let gx = 0, gy = 0, gz = 0;
    for (let i = 0; i < 8; i++) {
      gx += cv[i] * (i & 1 ? 1 : -1); gy += cv[i] * (i & 2 ? 1 : -1); gz += cv[i] * (i & 4 ? 1 : -1);
    }
    let nx = -gx, ny = -gy, nz = -gz;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    // colour from the nearby smooth blocks; facing up shows the block's top colour, cliffs its side
    const up = smoothstep(0.5, 0.9, ny);
    let r = 0, g = 0, b = 0, wsum = 0, leaf = 0;
    for (let dz = -1; dz <= 2; dz++) for (let dy = -1; dy <= 2; dy++) for (let dx = -1; dx <= 2; dx++) {
      const id = rawAt(x + dx, y + dy, z + dz);
      if (!SM[id]) continue;
      const w = dx >= 0 && dx <= 1 && dy >= 0 && dy <= 1 && dz >= 0 && dz <= 1 ? 3 : 1;
      _c.copy(COL[id].side).lerp(COL[id].top, up);
      r += _c.r * w; g += _c.g * w; b += _c.b * w; wsum += w; leaf += LEAFY[id] * w;
    }
    leaf = wsum ? leaf / wsum : 0;
    // foliage: lumpy clusters (push vertices in/out) and per-cluster colour variation, determined by world position
    const h1 = hash3(ox + x, y, oz + z, 91), h2 = hash3(ox + x, y, oz + z, 17);
    const bump = leaf * (h1 - 0.5) * 0.8;
    pos.push(vx + nx * bump, vy + ny * bump, vz + nz * bump);
    nor.push(nx, ny, nz);
    const tint = (1 + leaf * (h2 - 0.5) * 0.7) * ambient(vx + nx * 1.3, vy + ny * 1.3, vz + nz * 1.3);
    if (wsum) col.push(r / wsum * tint, g / wsum * tint, b / wsum * tint); else col.push(0.5, 0.5, 0.5);
    return (vmap[mi] = pos.length / 3 - 1);
  }

  const dist2 = (a, b) => {
    const dx = pos[a * 3] - pos[b * 3], dy = pos[a * 3 + 1] - pos[b * 3 + 1], dz = pos[a * 3 + 2] - pos[b * 3 + 2];
    return dx * dx + dy * dy + dz * dz;
  };
  // emit a triangle wound to agree with the vertex normals
  const tri = (a, b, c) => {
    const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
    const bx = pos[c * 3] - pos[a * 3], by = pos[c * 3 + 1] - pos[a * 3 + 1], bz = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = ay * bz - az * by, fy = az * bx - ax * bz, fz = ax * by - ay * bx;
    const dot = fx * (nor[a * 3] + nor[b * 3] + nor[c * 3]) + fy * (nor[a * 3 + 1] + nor[b * 3 + 1] + nor[c * 3 + 1])
      + fz * (nor[a * 3 + 2] + nor[b * 3 + 2] + nor[c * 3 + 2]);
    if (dot < 0) idx.push(a, c, b); else idx.push(a, b, c);
  };

  const cell = [0, 0, 0];
  for (let z = 0; z < CHUNK; z++) for (let y = 0; y < yMaxS; y++) for (let x = 0; x < CHUNK; x++) {
    const in0 = C[cidx(x, y, z)] > ISO;
    for (let d = 0; d < 3; d++) {
      const in1 = C[cidx(x + (d === 0), y + (d === 1), z + (d === 2))] > ISO;
      if (in0 === in1) continue;
      const u = (d + 1) % 3, v = (d + 2) % 3;
      cell[0] = x; cell[1] = y; cell[2] = z;
      const a = vertex(cell[0], cell[1], cell[2]);
      cell[u]--;
      const b = vertex(cell[0], cell[1], cell[2]);
      cell[v]--;
      const c = vertex(cell[0], cell[1], cell[2]);
      cell[u]++;
      const dd = vertex(cell[0], cell[1], cell[2]);
      if (dist2(a, c) < dist2(b, dd)) { tri(a, b, c); tri(a, c, dd); } else { tri(b, c, dd); tri(b, dd, a); }
    }
  }
  if (!idx.length) return null;

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
