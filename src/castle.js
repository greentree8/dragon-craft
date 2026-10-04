// The castle landmark: a pure function from local coordinates to a block, plus where its guards stand.
// Local coords: (dx, dz) from the castle centre, dy = 0 is the courtyard floor layer.
import { B } from './blocks.js';

// Castles are scattered around the world; each has the same layout, a garrison and a Dread Drake.
export const CASTLES = [
  { id: 0, x: 136, z: 72, reach: 19 },
  { id: 1, x: -24, z: 324, reach: 19 },
  { id: 2, x: 324, z: -108, reach: 19 },
];
export const CASTLE = CASTLES[0];
const REACH = 19;

const { AIR, STONE_BRICK: SB, COBBLE, PLANKS, LANTERN, GOLD, LOG, CHEST } = B;

// treasure chests hidden in the keep: [dx, dy, dz] (two on the ground floor, two upstairs)
export const CHEST_OFFSETS = [[-4, 1, 3], [4, 1, -3], [-4, 9, -3], [4, 9, 3]];

// returns undefined outside the castle's footprint (terrain is left alone)
export function castleBlock(dx, dy, dz) {
  const ax = Math.abs(dx), az = Math.abs(dz), m = Math.max(ax, az);
  if (m > REACH || dy > 26) return undefined;

  // corner towers (7x7, solid base, open battlement on top)
  if (ax >= 13 && az >= 13) {
    const edge = Math.max(ax - 16, az - 16, 16 - ax, 16 - az) >= 3;
    if (dy <= 12) return SB;
    if (dy === 13) return edge ? SB : AIR;
    if (dy === 14) return edge && (ax + az) % 2 === 0 ? SB : AIR;
    return AIR;
  }

  // keep: 13x13, two floors, flag on the roof
  if (ax <= 6 && az <= 6) {
    const wall = m >= 5;
    if (dy === 0) return ax <= 4 && az <= 4 ? PLANKS : SB;
    if (dy === 15) return SB;
    if (dy === 16) return m === 6 && (ax + az) % 2 === 0 ? SB : AIR;
    if (dy > 16) {
      if (ax === 0 && az === 0 && dy <= 22) return LOG;
      if (az === 0 && (dx === 1 || dx === 2) && (dy === 21 || dy === 22)) return GOLD;
      return AIR;
    }
    if (wall) {
      if (dz > 0 && ax <= 1 && dy <= 3) return AIR; // front door
      if ((dy === 5 || dy === 6) && (ax === 3 || (ax === 0 && dz < 0)) ) return AIR; // windows
      if ((dy === 5 || dy === 6) && (az === 3 || az === 0) && ax >= 5) return AIR;
      return SB;
    }
    // inside
    for (const [cx, cy, cz] of CHEST_OFFSETS) if (dx === cx && dy === cy && dz === cz) return CHEST;
    if (dy === 8) return ax <= 1 && az <= 1 ? AIR : PLANKS;
    if (dy === 7 && ((ax === 3 && az === 3) || (ax === 0 && az === 0))) return LANTERN;
    if (dy === 1 && dz === -3 && ax <= 2) return GOLD; // treasure
    if (dy === 2 && dz === -3 && ax <= 1) return GOLD;
    if (dy === 1 && (ax === 4 && az === 4)) return LANTERN;
    return AIR;
  }

  // curtain wall, 2 thick, walkway on top
  if (m >= 15) {
    if (dy <= 8) {
      if (dz > 0 && az >= 15 && ax <= 2 && dy >= 1 && dy <= 5) return AIR; // gate
      return SB;
    }
    if (dy === 9 || dy === 10) {
      if (m === 16 && (ax + az) % 2 === 0) return SB;                       // merlons
      if (dy === 9 && m === 15 && (dx + dz) % 6 === 0) return LANTERN;      // wall lights
      return AIR;
    }
    return AIR;
  }

  // courtyard and approach
  if (dy === 0) return COBBLE;
  if (m >= 17 && ax <= 2 && dz > 0) return AIR;
  // lantern posts
  if (ax === 10 && az === 10) return dy <= 2 ? LOG : dy === 3 ? LANTERN : AIR;
  if (ax === 3 && dz === 18) return dy <= 2 ? LOG : dy === 3 ? LANTERN : AIR;
  return AIR;
}

// Garrison spawn points as offsets from the centre: [type, dx, dz, dy of the feet above the floor layer]
export const GARRISON = [
  ['boss', 0, -2, 1],
  ['knight', -3, 2, 1], ['knight', 3, 2, 1],
  ['knight', -8, 4, 1], ['knight', 8, 4, 1], ['knight', -7, -8, 1], ['knight', 7, -8, 1], ['knight', 0, 10, 1],
  ['knight', -2, 22, 1], ['knight', 2, 22, 1],
  // archers on the wall walkway and the tower tops
  ['archer', -8, -15.5, 9], ['archer', 8, -15.5, 9], ['archer', -15.5, -4, 9], ['archer', -15.5, 6, 9],
  ['archer', 15.5, -4, 9], ['archer', 15.5, 6, 9], ['archer', -8, 15.5, 9], ['archer', 8, 15.5, 9],
  ['archer', -16, -16, 13], ['archer', 16, -16, 13], ['archer', -16, 16, 13], ['archer', 16, 16, 13],
];
