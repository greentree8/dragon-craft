// The Grand Citadel: a huge castle (105 x 105 blocks) whose inside is two floors of winding corridors.
// 50 chests are hidden at dead ends on both floors; opening them grows your dragon. Shafts join the floors.
// The layout is a pure seeded function, so every player gets the same castle.
import { B } from './blocks.js';

const { AIR, STONE_BRICK: SB, COBBLE, PLANKS, LANTERN, GOLD, LOG, CHEST } = B;

const N = 17, U = 3, G = 2 * N + 1, S = G * U, HALF = (S - 1) / 2; // 35 x 35 units of 3 blocks = 105 blocks
export const CITADEL = { id: 'citadel', name: 'Grand Citadel', x: -252, z: -276, N, U, G, S, HALF, reach: HALF + 1, height: 40 };
export const CHEST_TOTAL = 50;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a perfect maze on an N x N grid of cells, drawn into a G x G grid of units (cells at odd coordinates)
function perfectMaze(seed) {
  const rnd = mulberry32(seed);
  const open = new Uint8Array(G * G), seen = new Uint8Array(N * N);
  const stack = [[0, N - 1]];
  seen[(N - 1) * N] = 1; open[(2 * (N - 1) + 1) * G + 1] = 1;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => { const x = cx + dx, z = cz + dz; return x >= 0 && z >= 0 && x < N && z < N && !seen[z * N + x]; });
    if (!nb.length) { stack.pop(); continue; }
    const [dx, dz] = nb[Math.floor(rnd() * nb.length)];
    const x = cx + dx, z = cz + dz;
    seen[z * N + x] = 1;
    open[(2 * cz + 1 + dz) * G + (2 * cx + 1 + dx)] = 1;
    open[(2 * z + 1) * G + (2 * x + 1)] = 1;
    stack.push([x, z]);
  }
  return open;
}

let _info = null;
export function citadelInfo() {
  if (_info) return _info;
  const floors = [perfectMaze(77001), perfectMaze(88002)];
  floors[0][(G - 1) * G + 1] = 1; // the front gate, in the south wall of the ground floor
  const rnd = mulberry32(424242);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const isOpen = (f, gx, gz) => gx >= 0 && gz >= 0 && gx < G && gz < G && floors[f][gz * G + gx] === 1;
  // dead ends are where the chests hide
  const dead = [], others = [];
  for (let f = 0; f < 2; f++) for (let gz = 1; gz < G; gz += 2) for (let gx = 1; gx < G; gx += 2) {
    const n = (isOpen(f, gx - 1, gz) ? 1 : 0) + (isOpen(f, gx + 1, gz) ? 1 : 0) + (isOpen(f, gx, gz - 1) ? 1 : 0) + (isOpen(f, gx, gz + 1) ? 1 : 0);
    if (gx === 1 && gz === G - 2 && f === 0) continue; // right behind the gate
    (n === 1 ? dead : others).push({ floor: f, gx, gz });
  }
  shuffle(dead); shuffle(others);
  let chosen = dead.slice(0, CHEST_TOTAL);
  if (chosen.length < CHEST_TOTAL) chosen = chosen.concat(others.splice(0, CHEST_TOTAL - chosen.length));
  chosen.sort((a, b) => a.floor - b.floor || a.gz - b.gz || a.gx - b.gx);
  const chests = new Map(), cells = [];
  chosen.forEach((c, i) => { c.index = i; chests.set(c.floor * G * G + c.gz * G + c.gx, c); cells.push(c); });
  // shafts join the floors: any cell without a chest
  const shafts = new Set();
  const free = shuffle(others.filter((c) => !chests.has(c.floor * G * G + c.gz * G + c.gx)));
  for (const c of free) { if (shafts.size >= 18) break; shafts.add(c.gz * G + c.gx); }
  // traps and guards, spread through the corridors of both floors (never in a chest cell, a shaft or near the front gate)
  const trng = mulberry32(99001);
  const tiles = new Map(), traps = [], spots = [];
  for (let f = 0; f < 2; f++) for (let gz = 1; gz < G; gz += 2) for (let gx = 1; gx < G; gx += 2) {
    const key = f * G * G + gz * G + gx;
    if (chests.has(key) || shafts.has(gz * G + gx)) continue;
    if (f === 0 && Math.abs(gx - 1) + Math.abs(gz - (G - 2)) < 12) continue;
    spots.push({ floor: f, gx, gz });
    if (trng() > 0.1) continue;
    const l = isOpen(f, gx - 1, gz), r = isOpen(f, gx + 1, gz), u = isOpen(f, gx, gz - 1), d = isOpen(f, gx, gz + 1);
    const straightX = l && r && !u && !d, straightZ = u && d && !l && !r;
    const roll = trng();
    let kind = roll < 0.4 ? 'flame' : 'turret';
    if ((straightX || straightZ) && roll > 0.55) kind = 'gate';
    const t = { kind, floor: f, gx, gz, phase: trng() * 4 };
    if (kind === 'gate') t.axis = straightX ? 'x' : 'z';
    if (kind === 'turret') {
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !isOpen(f, gx + dx, gz + dz));
      if (!walls.length) continue;
      t.wall = walls[Math.floor(trng() * walls.length)];
    }
    traps.push(t);
    if (kind !== 'turret') tiles.set(key, kind);
  }
  const rest = shuffle(spots.slice());
  const garrison = [];
  const kinds = [...Array(14).fill('knight'), ...Array(8).fill('wizard'), ...Array(6).fill('golem')];
  kinds.forEach((type, i) => { if (rest[i]) garrison.push({ type, ...rest[i] }); });
  _info = { floors, chests, chestList: cells, shafts, traps, tiles, garrison };
  return _info;
}

// local block lookup: (dx, dz) from the citadel centre, dy = 0 is the ground floor's floor layer
CITADEL.block = (dx, dy, dz) => {
  const mx = dx + HALF, mz = dz + HALF;
  if (mx < 0 || mz < 0 || mx >= S || mz >= S || dy < 0 || dy > CITADEL.height) return undefined;
  const ax = Math.abs(dx), az = Math.abs(dz);
  const edge = mx === 0 || mz === 0 || mx === S - 1 || mz === S - 1;
  if (dy >= 13) {
    // the roof: a walkway with battlements, four corner towers and a tall central keep
    if (ax >= HALF - 8 && az >= HALF - 8) {
      if (dy <= 24) return SB;
      const tx = ax - (HALF - 8), tz = az - (HALF - 8), rim = tx === 0 || tz === 0 || tx === 8 || tz === 8;
      if (dy === 25) return rim && (tx + tz) % 2 === 0 ? SB : AIR;
      if (tx === 4 && tz === 4 && dy <= 29) return dy === 29 ? GOLD : LOG;
      return AIR;
    }
    if (ax <= 9 && az <= 9) {
      if (dy <= 30) return SB;
      if (dy === 31) return (ax === 9 || az === 9) && (ax + az) % 2 === 0 ? SB : AIR;
      if (ax === 0 && az === 0 && dy <= 38) return LOG;
      if (az === 0 && (dx === 1 || dx === 2) && dy >= 37 && dy <= 38) return GOLD;
      return AIR;
    }
    if (dy === 13) return edge ? SB : AIR;
    if (dy === 14) return edge && (mx + mz) % 2 === 0 ? SB : AIR;
    return AIR;
  }
  const info = citadelInfo();
  const gx = Math.floor(mx / U), gz = Math.floor(mz / U);
  const mid = mx % U === 1 && mz % U === 1;
  const outer = gx === 0 || gz === 0 || gx === G - 1 || gz === G - 1;
  if (dy === 0) { const t = info.tiles.get(gz * G + gx); return t === 'flame' ? PLANKS : t === 'gate' ? COBBLE : SB; } // a tile of a different kind marks a trap
  if (dy <= 5 || (dy >= 7 && dy <= 11)) {
    const f = dy <= 5 ? 0 : 1, y0 = f === 0 ? 1 : 7;
    if (info.floors[f][gz * G + gx] === 1) return mid && dy === y0 && info.chests.has(f * G * G + gz * G + gx) ? CHEST : AIR;
    return outer ? SB : COBBLE;
  }
  if (dy === 6) {
    if (info.shafts.has(gz * G + gx)) return AIR;
    const t = info.tiles.get(G * G + gz * G + gx);
    if (t) return t === 'flame' ? PLANKS : COBBLE;
    return info.floors[0][gz * G + gx] === 1 && mid && (gx + gz) % 4 === 0 ? LANTERN : SB;
  }
  return info.floors[1][gz * G + gx] === 1 && mid && (gx + gz) % 4 === 2 ? LANTERN : SB; // dy 12: the roof slab, with lanterns
};

// world position of a chest block
export function chestPos(base, c) {
  return { x: CITADEL.x + c.gx * U + 1 - HALF, y: base + (c.floor === 0 ? 1 : 7), z: CITADEL.z + c.gz * U + 1 - HALF };
}

// world position of the middle of a corridor square (at the floor surface)
export function cellCenter(base, floor, gx, gz) {
  return { x: CITADEL.x + gx * U + 1 - HALF + 0.5, y: base + (floor === 0 ? 1 : 7), z: CITADEL.z + gz * U + 1 - HALF + 0.5 };
}
