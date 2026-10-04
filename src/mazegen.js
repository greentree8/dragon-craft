// Labyrinth layout: a pure, seeded function of local coordinates (no rendering), used by world generation and the traps.
import { B } from './blocks.js';

export const MAZE = { x: -210, z: 170, reach: 41 };
export const N = 13, U = 3, G = 2 * N + 1, S = G * U, HALF = (S - 1) / 2; // 27 x 27 units of 3 blocks = 81 blocks square
const { AIR, STONE_BRICK: SB, COBBLE, PLANKS, LANTERN, GOLD } = B;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

let _info = null;
export function mazeInfo() {
  if (_info) return _info;
  const rnd = mulberry32(20251004);
  const open = new Uint8Array(G * G); // index gz * G + gx
  const seen = new Uint8Array(N * N);
  const cellAt = (cx, cz) => cz * N + cx;
  const stack = [[0, N - 1]];
  seen[cellAt(0, N - 1)] = 1; open[(2 * (N - 1) + 1) * G + 1] = 1;
  while (stack.length) {
    const [cx, cz] = stack[stack.length - 1];
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => { const x = cx + dx, z = cz + dz; return x >= 0 && z >= 0 && x < N && z < N && !seen[cellAt(x, z)]; });
    if (!nb.length) { stack.pop(); continue; }
    const [dx, dz] = nb[Math.floor(rnd() * nb.length)];
    const x = cx + dx, z = cz + dz;
    seen[cellAt(x, z)] = 1;
    open[(2 * cz + 1 + dz) * G + (2 * cx + 1 + dx)] = 1; // knock out the wall between
    open[(2 * z + 1) * G + (2 * x + 1)] = 1;
    stack.push([x, z]);
  }
  open[(G - 1) * G + 1] = 1; // the entrance, in the south wall
  // how far is every open square from the entrance?
  const dist = new Int16Array(G * G).fill(-1);
  const q = [[1, G - 1]]; dist[(G - 1) * G + 1] = 0;
  for (let i = 0; i < q.length; i++) {
    const [gx, gz] = q[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = gx + dx, z = gz + dz;
      if (x < 0 || z < 0 || x >= G || z >= G || !open[z * G + x] || dist[z * G + x] >= 0) continue;
      dist[z * G + x] = dist[gz * G + gx] + 1; q.push([x, z]);
    }
  }
  let goal = [1, G - 2], best = -1, maxD = 1;
  for (let gz = 1; gz < G; gz += 2) for (let gx = 1; gx < G; gx += 2) {
    const d = dist[gz * G + gx];
    if (d > best) { best = d; goal = [gx, gz]; }
    maxD = Math.max(maxD, d);
  }
  // traps: more of them the deeper you go
  const traps = new Map();
  const isOpen = (gx, gz) => gx >= 0 && gz >= 0 && gx < G && gz < G && open[gz * G + gx] === 1;
  for (let gz = 1; gz < G; gz += 2) for (let gx = 1; gx < G; gx += 2) {
    const d = dist[gz * G + gx];
    if (d < 0 || d < 9 || (Math.abs(gx - goal[0]) + Math.abs(gz - goal[1]) < 6)) continue;
    if (rnd() > 0.1 + 0.3 * (d / maxD)) continue;
    const l = isOpen(gx - 1, gz), r = isOpen(gx + 1, gz), u = isOpen(gx, gz - 1), dn = isOpen(gx, gz + 1);
    const straightX = l && r && !u && !dn, straightZ = u && dn && !l && !r;
    const roll = rnd();
    let kind = roll < 0.4 ? 'flame' : 'turret';
    if ((straightX || straightZ) && roll > 0.55) kind = 'gate';
    const t = { kind, gx, gz, phase: rnd() * 4 };
    if (kind === 'gate') t.axis = straightX ? 'x' : 'z';
    if (kind === 'turret') {
      const walls = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => !isOpen(gx + dx, gz + dz));
      if (!walls.length) continue;
      t.wall = walls[Math.floor(rnd() * walls.length)];
    }
    traps.set(gz * G + gx, t);
  }
  _info = { open, goal, traps, maxD, depth: best };
  return _info;
}

// local block lookup: (dx, dz) from the maze centre, dy = 0 is the floor layer
export function mazeBlock(dx, dy, dz) {
  const mx = dx + HALF, mz = dz + HALF;
  if (mx < 0 || mz < 0 || mx >= S || mz >= S || dy < 0 || dy > 8) return undefined;
  const info = mazeInfo();
  const gx = Math.floor(mx / U), gz = Math.floor(mz / U);
  const open = info.open[gz * G + gx] === 1;
  const outer = gx === 0 || gz === 0 || gx === G - 1 || gz === G - 1;
  const mid = mx % U === 1 && mz % U === 1;
  if (dy === 0) {
    const t = info.traps.get(gz * G + gx);
    if (t && t.kind === 'flame') return PLANKS;   // warm wooden tile: a flame jet lives here
    if (t && t.kind === 'gate') return COBBLE;    // rough tile: spikes
    if (gx === info.goal[0] && gz === info.goal[1]) return mid ? GOLD : SB;
    return SB;
  }
  if (dy <= 4) return open ? AIR : outer ? SB : COBBLE;
  if (dy === 5) return open && mid && (gx + gz) % 4 === 0 ? LANTERN : SB; // roof, with a few lanterns
  return AIR;
}

