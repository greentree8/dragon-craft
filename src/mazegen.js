// Labyrinth layouts: pure, seeded functions of local coordinates (no rendering), used by world generation and the traps.
// Each maze is a roofed grid of 3-block corridors. makeMaze() builds one from a config; MAZES lists the ones in the world.
import { B } from './blocks.js';

const { AIR, STONE_BRICK: SB, COBBLE, PLANKS, LANTERN, GOLD, OBSIDIAN, LAVA, CRYSTAL_PURPLE } = B;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// cfg: { id, name, x, z, N (cells per side), seed, theme, apple, trapBase, trapDepth, lavaChance, warn }
export function makeMaze(cfg) {
  const { N, theme } = cfg;
  const U = 3, G = 2 * N + 1, S = G * U, HALF = (S - 1) / 2;
  const maze = { ...cfg, U, G, S, HALF, reach: HALF + 1 };
  let _info = null;

  function build() {
    const rnd = mulberry32(cfg.seed);
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
    const traps = new Map(), lava = new Set();
    const isOpen = (gx, gz) => gx >= 0 && gz >= 0 && gx < G && gz < G && open[gz * G + gx] === 1;
    for (let gz = 1; gz < G; gz += 2) for (let gx = 1; gx < G; gx += 2) {
      const d = dist[gz * G + gx];
      if (d < 0 || d < 9 || (Math.abs(gx - goal[0]) + Math.abs(gz - goal[1]) < 6)) continue;
      if (rnd() > (cfg.trapBase ?? 0.1) + (cfg.trapDepth ?? 0.3) * (d / maxD)) {
        // no trap here: maybe a pool of lava on the floor (walking through it burns; flying over is fine)
        if (cfg.lavaChance && rnd() < cfg.lavaChance) lava.add(gz * G + gx);
        continue;
      }
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
    return { open, goal, traps, lava, maxD, depth: best };
  }

  maze.info = () => (_info ??= build());

  // local block lookup: (dx, dz) from the maze centre, dy = 0 is the floor layer
  maze.block = (dx, dy, dz) => {
    const mx = dx + HALF, mz = dz + HALF;
    if (mx < 0 || mz < 0 || mx >= S || mz >= S || dy < 0 || dy > 8) return undefined;
    const info = maze.info();
    const gx = Math.floor(mx / U), gz = Math.floor(mz / U);
    const open = info.open[gz * G + gx] === 1;
    const outer = gx === 0 || gz === 0 || gx === G - 1 || gz === G - 1;
    const mid = mx % U === 1 && mz % U === 1;
    if (dy === 0) {
      const t = info.traps.get(gz * G + gx);
      if (t && t.kind === 'flame') return theme.flame;   // a different floor tile: a flame jet lives here
      if (t && t.kind === 'gate') return theme.gate;     // another tile: spikes
      if (gx === info.goal[0] && gz === info.goal[1]) return mid ? theme.goalMid : theme.floor;
      return theme.floor;
    }
    if (dy === 1 && open && info.lava.has(gz * G + gx)) return LAVA;
    if (dy <= 4) return open ? AIR : outer ? theme.outer : theme.wall;
    if (dy === 5) return open && mid && (gx + gz) % 2 === 0 ? theme.light : theme.ceil; // roof, with a lantern over every corridor square
    return AIR;
  };
  return maze;
}

export const MAZES = [
  // the Giant Maze: stone, arrow turrets, the Golden Apple (10 minutes of invincibility)
  makeMaze({
    id: 'giant', name: 'Giant Maze', x: -210, z: 170, N: 13, seed: 20251004, apple: 'golden',
    theme: { wall: COBBLE, outer: SB, floor: SB, ceil: SB, light: LANTERN, flame: PLANKS, gate: COBBLE, goalMid: GOLD, ammo: 'arrow' },
    trapBase: 0.1, trapDepth: 0.3,
    warn: 'A giant maze! Reach the Golden Apple at the far end. Beware of traps!',
  }),
  // the Volcano Maze: black glass walls, fire turrets, lava pools, the Master Apple (the Annihilate attack)
  makeMaze({
    id: 'volcano', name: 'Volcano Maze', x: 266, z: -48, N: 11, seed: 66642, apple: 'master',
    theme: { wall: OBSIDIAN, outer: OBSIDIAN, floor: OBSIDIAN, ceil: OBSIDIAN, light: LANTERN, flame: COBBLE, gate: SB, goalMid: CRYSTAL_PURPLE, ammo: 'fireball' },
    trapBase: 0.16, trapDepth: 0.34, lavaChance: 0.2,
    warn: 'The Volcano Maze! Lava, fire and spikes guard the Master Apple at the end.',
  }),
];
export const MAZE = MAZES[0]; // the Giant Maze (kept for older imports)
