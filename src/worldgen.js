// Procedural terrain: a pure function of (seed, x, y, z) so chunks always agree at their borders.
import { Noise, hash2, smoothstep, clamp, mix } from './noise.js';
import { B } from './blocks.js';

export const CHUNK = 16;
export const HEIGHT = 128;
export const SEA = 26;

// Landmarks (world coordinates). Spawn is at 0,0.
export const VOLCANO = { x: 120, z: -80, radius: 58 };
export const VILLAGE = { x: 24, z: 10 };
export const LAKE = { x: -75, z: 55, radius: 38 };
export const CRYSTAL_ISLE = { x: -35, z: -85, radius: 28, y: 104 };

export class WorldGen {
  constructor(seed = 1337) {
    this.seed = seed;
    this.n = new Noise(seed);
    this.n2 = new Noise(seed + 101);
    this.n3 = new Noise(seed + 202);
    this._hcache = new Map();
  }

  // ---- 2D terrain ----
  rawHeight(x, z) {
    const n = this.n;
    let h = 33 + n.fbm2(x / 110, z / 110, 4) * 16;
    // mountains
    const m = n.fbm2(x / 230 + 40, z / 230 - 12, 3);
    const ridge = 1 - Math.abs(n.fbm2(x / 95 + 9, z / 95 + 3, 3));
    h += smoothstep(0.02, 0.4, m) * (ridge * ridge) * 52;
    // flat, friendly spawn + village plains
    const dv = Math.hypot(x - 14, z - 6);
    h = mix(h, 34, 1 - smoothstep(50, 84, dv));
    // lake basin
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    h = mix(h, 17, 1 - smoothstep(LAKE.radius * 0.55, LAKE.radius, dl));
    // volcano
    const dvol = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (dvol < VOLCANO.radius) {
      const cone = (r) => 58 * Math.pow(1 - r / VOLCANO.radius, 1.35);
      let add = dvol >= 10 ? cone(dvol) : cone(10) - (10 - dvol) * 1.7;
      h = mix(h, 34, 0.5 * (1 - smoothstep(0, 24, dvol))) + add;
    }
    return Math.floor(h);
  }

  height(x, z) {
    const key = x * 100003 + z;
    let v = this._hcache.get(key);
    if (v === undefined) {
      v = this.rawHeight(x, z);
      if (this._hcache.size > 60000) this._hcache.clear();
      this._hcache.set(key, v);
    }
    return v;
  }

  climate(x, z) {
    return {
      temp: this.n2.fbm2(x / 260 + 100, z / 260, 3),
      moist: this.n3.fbm2(x / 190, z / 190 - 70, 3),
    };
  }

  volcanoDist(x, z) { return Math.hypot(x - VOLCANO.x, z - VOLCANO.z); }

  // ---- floating islands ----
  island(x, z) {
    const n = this.n;
    // forced landmark island
    let top = null, bot = null;
    const d = Math.hypot(x - CRYSTAL_ISLE.x, z - CRYSTAL_ISLE.z);
    const edge = d + n.noise2(x / 9, z / 9) * 3.5;
    if (edge < CRYSTAL_ISLE.radius) {
      const s = 1 - edge / CRYSTAL_ISLE.radius;
      top = CRYSTAL_ISLE.y + Math.round(n.noise2(x / 14, z / 14) * 1.5);
      bot = Math.floor(top - 3 - Math.pow(s, 0.7) * 22 - n.noise2(x / 6 + 3, z / 6) * 2);
    }
    // scattered islands
    const m = this.n3.fbm2(x / 85 + 500, z / 85 + 500, 3);
    if (m > 0.2) {
      const s = clamp((m - 0.2) / 0.22, 0, 1);
      const t2 = 102 + Math.round(this.n2.noise2(x / 60, z / 60) * 6);
      const b2 = Math.floor(t2 - 2 - s * 16 - this.n.noise2(x / 5, z / 5) * 2);
      if (top === null || t2 > top) { top = t2; bot = b2; }
    }
    return top === null ? null : { top, bot };
  }

  // ---- fill a chunk's block array (HEIGHT*16*16, index = (y*16+z)*16+x) ----
  generate(cx, cz) {
    const data = new Uint8Array(HEIGHT * CHUNK * CHUNK);
    const ox = cx * CHUNK, oz = cz * CHUNK;
    const idx = (x, y, z) => (y * CHUNK + z) * CHUNK + x;
    const n = this.n;

    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const x = ox + lx, z = oz + lz;
        const h = this.height(x, z);
        const { temp, moist } = this.climate(x, z);
        const dvol = this.volcanoDist(x, z);
        const onVolcano = dvol < VOLCANO.radius * 0.8 && h > 40;
        const snowy = !onVolcano && (h > 66 || (temp < -0.28 && h > SEA + 2));
        const desert = !onVolcano && !snowy && temp > 0.22 && moist < 0.1;
        const beach = h <= SEA + 1;

        let top = B.GRASS, sub = B.DIRT;
        if (onVolcano) { top = B.BASALT; sub = B.BASALT; }
        else if (snowy) { top = B.SNOW; sub = B.STONE; }
        else if (desert || beach) { top = B.SAND; sub = B.SAND; }

        for (let y = 0; y <= h && y < HEIGHT; y++) {
          let b;
          if (y <= 2) b = B.BASALT;
          else if (y === h) b = top;
          else if (y >= h - 3) b = sub;
          else b = B.STONE;

          if (onVolcano && y > h - 2 && b !== B.STONE) {
            // ash dusting and glowing lava veins down the slopes
            const v = n.noise3(x / 7, y / 5, z / 7);
            if (v > 0.52 && dvol > 11) b = B.LAVA;
            else if (hash2(x, z, 3) < 0.35) b = B.ASH;
          }

          // caves
          if (y > 5 && y < h - 1 && b !== B.LAVA) {
            const a = n.noise3(x / 22, y / 13, z / 22);
            const c = this.n2.noise3(x / 22 + 50, y / 13, z / 22);
            const wa = Math.abs(a), wc = Math.abs(c);
            if (wa < 0.075 && wc < 0.075 && (h > SEA + 3 || y < h - 7)) b = B.AIR;
            else if (wa < 0.115 && wc < 0.115 && b === B.STONE) {
              const r = hash2(x * 7 + y, z, 11);
              if (r < 0.07) b = r < 0.035 ? B.CRYSTAL_PURPLE : B.CRYSTAL_CYAN;
            }
          }
          if (b === B.STONE && y < 34 && hash2(x * 3 + y, z * 5, 21) < 0.006) b = B.GOLD;
          data[idx(lx, y, lz)] = b;
        }

        // lakes / sea
        for (let y = h + 1; y <= SEA; y++) data[idx(lx, y, lz)] = B.WATER;

        // volcano crater lava
        if (dvol < 9.5) {
          const lavaY = h - 0; // fill crater floor
          const rim = Math.floor(this.height(VOLCANO.x + 10, VOLCANO.z));
          const level = rim - 8;
          for (let y = lavaY + 1; y <= level; y++) data[idx(lx, y, lz)] = B.LAVA;
        }

        // floating islands
        const isl = this.island(x, z);
        if (isl) {
          for (let y = Math.max(1, isl.bot); y <= isl.top && y < HEIGHT; y++) {
            let b = B.STONE;
            if (y === isl.top) b = B.GRASS;
            else if (y >= isl.top - 3) b = B.DIRT;
            else if (hash2(x * 3 + y, z * 5, 22) < 0.03) b = B.CRYSTAL_CYAN;
            data[idx(lx, y, lz)] = b;
          }
        }
      }
    }

    this.stampTrees(data, cx, cz);
    this.stampVillage(data, cx, cz);
    this.stampCrystals(data, cx, cz);
    return data;
  }

  // ---- decorations ----
  _set(data, cx, cz, wx, y, wz, b, onlyAir = true) {
    const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK || y < 0 || y >= HEIGHT) return;
    const i = (y * CHUNK + lz) * CHUNK + lx;
    if (onlyAir && data[i] !== B.AIR) return;
    data[i] = b;
  }

  nearVillage(x, z, pad = 0) {
    return x > VILLAGE.x - 20 - pad && x < VILLAGE.x + 22 + pad && z > VILLAGE.z - 18 - pad && z < VILLAGE.z + 22 + pad;
  }

  stampTrees(data, cx, cz) {
    const CELL = 5, M = 4;
    const x0 = Math.floor((cx * CHUNK - M) / CELL), x1 = Math.floor((cx * CHUNK + CHUNK + M) / CELL);
    const z0 = Math.floor((cz * CHUNK - M) / CELL), z1 = Math.floor((cz * CHUNK + CHUNK + M) / CELL);
    for (let gz = z0; gz <= z1; gz++) {
      for (let gx = x0; gx <= x1; gx++) {
        const px = gx * CELL + Math.floor(hash2(gx, gz, 1) * CELL);
        const pz = gz * CELL + Math.floor(hash2(gx, gz, 2) * CELL);
        if (px < cx * CHUNK - M || px >= cx * CHUNK + CHUNK + M || pz < cz * CHUNK - M || pz >= cz * CHUNK + CHUNK + M) continue;
        const r = hash2(gx, gz, 3);

        // island tree?
        const isl = this.island(px, pz);
        if (isl && isl.top > 60) {
          // keep canopies over solid ground: all four sides 3 blocks out must also be island
          const inside = [[3, 0], [-3, 0], [0, 3], [0, -3]].every(([dx, dz]) => {
            const o = this.island(px + dx, pz + dz);
            return o && Math.abs(o.top - isl.top) <= 2;
          });
          if (!inside) continue;
          const onCrystal = Math.hypot(px - CRYSTAL_ISLE.x, pz - CRYSTAL_ISLE.z) < CRYSTAL_ISLE.radius - 4;
          if (!onCrystal && r < 0.45) this.oak(data, cx, cz, px, isl.top + 1, pz, r, true);
          continue;
        }

        const h = this.height(px, pz);
        if (h <= SEA + 1 || h > 62 || this.nearVillage(px, pz, 3)) continue;
        if (this.volcanoDist(px, pz) < VOLCANO.radius) continue;
        // skip if a cave punched out the ground here (ground must be solid)
        const { temp, moist } = this.climate(px, pz);
        if (temp > 0.22 && moist < 0.1) {
          if (r < 0.1) { const t = 1 + Math.floor(hash2(gx, gz, 4) * 3); for (let k = 1; k <= t; k++) this._set(data, cx, cz, px, h + k, pz, B.CACTUS); }
        } else if (temp < -0.28 && h > SEA + 2) {
          if (r < 0.22) this.spruce(data, cx, cz, px, h + 1, pz, r);
        } else {
          const dens = moist > 0.05 ? 0.5 : 0.1;
          if (r < dens) this.oak(data, cx, cz, px, h + 1, pz, r, false);
        }
      }
    }
  }

  oak(data, cx, cz, x, y, z, r, island) {
    const trunk = 4 + Math.floor((r * 977) % 3);
    const leaf = island ? B.PINK_LEAVES : B.LEAVES;
    for (let k = 0; k < trunk; k++) this._set(data, cx, cz, x, y + k, z, B.LOG);
    const top = y + trunk;
    for (let dy = -2; dy <= 1; dy++) {
      const rad = dy === 1 ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (dy >= 0 || hash2(x + dx, z + dz, top) < 0.5)) continue;
        this._set(data, cx, cz, x + dx, top + dy, z + dz, leaf);
      }
    }
  }

  spruce(data, cx, cz, x, y, z, r) {
    const trunk = 6 + Math.floor((r * 977) % 3);
    for (let k = 0; k < trunk; k++) this._set(data, cx, cz, x, y + k, z, B.LOG);
    for (let k = 0; k < trunk; k++) {
      const rad = Math.max(0, Math.floor((trunk - k) / 2.2) - (k % 2 === 0 ? 0 : 0));
      if (k < 2) continue;
      const rr = Math.min(2, Math.floor((trunk - k) / 2));
      for (let dz = -rr; dz <= rr; dz++) for (let dx = -rr; dx <= rr; dx++) {
        if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
        this._set(data, cx, cz, x + dx, y + k, z + dz, B.LEAVES);
      }
    }
    this._set(data, cx, cz, x, y + trunk, z, B.SNOW);
  }

  stampCrystals(data, cx, cz) {
    // big glowing crystal spikes on the Crystal Isle landmark
    const R = CRYSTAL_ISLE.radius - 3;
    const CELL = 6, M = 4;
    const x0 = Math.floor((cx * CHUNK - M) / CELL), x1 = Math.floor((cx * CHUNK + CHUNK + M) / CELL);
    const z0 = Math.floor((cz * CHUNK - M) / CELL), z1 = Math.floor((cz * CHUNK + CHUNK + M) / CELL);
    for (let gz = z0; gz <= z1; gz++) for (let gx = x0; gx <= x1; gx++) {
      const px = gx * CELL + Math.floor(hash2(gx, gz, 31) * CELL);
      const pz = gz * CELL + Math.floor(hash2(gx, gz, 32) * CELL);
      const d = Math.hypot(px - CRYSTAL_ISLE.x, pz - CRYSTAL_ISLE.z);
      if (d > R || hash2(gx, gz, 33) > 0.7) continue;
      const isl = this.island(px, pz);
      if (!isl) continue;
      const tall = 3 + Math.floor(hash2(gx, gz, 34) * 8) + (d < 5 ? 6 : 0);
      const kind = hash2(gx, gz, 35) < 0.5 ? B.CRYSTAL_PURPLE : B.CRYSTAL_CYAN;
      for (let k = 1; k <= tall; k++) {
        const w = k < tall * 0.45 ? 1 : 0;
        for (let dz = -w; dz <= w; dz++) for (let dx = -w; dx <= w; dx++) {
          if (w && Math.abs(dx) + Math.abs(dz) > 1 && k > tall * 0.3) continue;
          this._set(data, cx, cz, px + dx, isl.top + k, pz + dz, kind, false);
        }
      }
    }
  }

  stampVillage(data, cx, cz) {
    const houses = [
      { x: VILLAGE.x - 12, z: VILLAGE.z - 10, w: 7, d: 6, h: 4 },
      { x: VILLAGE.x + 4, z: VILLAGE.z - 12, w: 8, d: 7, h: 4 },
      { x: VILLAGE.x - 10, z: VILLAGE.z + 8, w: 6, d: 6, h: 3 },
      { x: VILLAGE.x + 8, z: VILLAGE.z + 8, w: 7, d: 7, h: 5 },
    ];
    const base = 34;
    // cobble plaza + well
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      this._set(data, cx, cz, VILLAGE.x + dx, base, VILLAGE.z + dz, B.COBBLE, false);
    }
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) { this._set(data, cx, cz, VILLAGE.x, base, VILLAGE.z, B.WATER, false); continue; }
      this._set(data, cx, cz, VILLAGE.x + dx, base + 1, VILLAGE.z + dz, B.COBBLE, false);
    }
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      for (let k = 2; k <= 3; k++) this._set(data, cx, cz, VILLAGE.x + dx, base + k, VILLAGE.z + dz, B.LOG, false);
    }
    this._set(data, cx, cz, VILLAGE.x, base + 4, VILLAGE.z, B.LANTERN, false);

    for (const hs of houses) {
      for (let dz = 0; dz < hs.d; dz++) for (let dx = 0; dx < hs.w; dx++) {
        const wx = hs.x + dx, wz = hs.z + dz;
        const edgeX = dx === 0 || dx === hs.w - 1, edgeZ = dz === 0 || dz === hs.d - 1;
        const corner = edgeX && edgeZ;
        // foundation + floor (also fills any gap down to the ground)
        for (let y = base - 3; y <= base; y++) this._set(data, cx, cz, wx, y, wz, y === base ? B.PLANKS : B.COBBLE, false);
        for (let k = 1; k <= hs.h; k++) {
          const y = base + k;
          let b = B.AIR;
          if (corner) b = B.LOG;
          else if (edgeX || edgeZ) {
            const door = dz === hs.d - 1 && dx === Math.floor(hs.w / 2) && k <= 2;
            const window = k === 2 && ((edgeX && dz % 2 === 1) || (edgeZ && dx % 2 === 0 && !(dz === hs.d - 1 && dx === Math.floor(hs.w / 2))));
            b = door || window ? B.AIR : B.PLANKS;
          }
          this._set(data, cx, cz, wx, y, wz, b, false);
        }
      }
      // stepped roof
      const layers = Math.ceil(Math.min(hs.w, hs.d) / 2) ;
      for (let l = 0; l < layers; l++) {
        for (let dz = -1 + l; dz <= hs.d - l; dz++) for (let dx = -1 + l; dx <= hs.w - l; dx++) {
          if (dx > -1 + l && dx < hs.w - l && dz > -1 + l && dz < hs.d - l && l > 0 && false) continue;
          this._set(data, cx, cz, hs.x + dx, base + hs.h + 1 + l, hs.z + dz, B.COBBLE, false);
        }
      }
      // lantern inside
      this._set(data, cx, cz, hs.x + Math.floor(hs.w / 2), base + hs.h, hs.z + Math.floor(hs.d / 2), B.LANTERN, false);
    }
  }
}
