// Hotbar layout, the block palette and food definitions.
import { B, DEFS } from './blocks.js';

// Hotbar: [0] fire breath, [1..6] blocks you choose, [7] apples, [8] cooked meat
export const SLOT = { FIRE: 0, FIRST_BLOCK: 1, LAST_BLOCK: 6, APPLE: 7, MEAT: 8 };
export const DEFAULT_HOTBAR = [B.PLANKS, B.COBBLE, B.LOG, B.STONE_BRICK, B.LANTERN, B.CRYSTAL_CYAN];

export const BLOCK_NAMES = {
  [B.GRASS]: 'Grass', [B.DIRT]: 'Dirt', [B.STONE]: 'Stone', [B.STONE_BRICK]: 'Stone Bricks', [B.ICE]: 'Ice', [B.COBBLE]: 'Cobblestone', [B.SAND]: 'Sand',
  [B.SNOW]: 'Snow', [B.PLANKS]: 'Planks', [B.LOG]: 'Log', [B.LEAVES]: 'Leaves', [B.PINK_LEAVES]: 'Pink Leaves',
  [B.BASALT]: 'Basalt', [B.ASH]: 'Ash', [B.GOLD]: 'Gold', [B.LANTERN]: 'Lantern',
  [B.CRYSTAL_PURPLE]: 'Purple Crystal', [B.CRYSTAL_CYAN]: 'Cyan Crystal', [B.CACTUS]: 'Cactus',
};
export const PALETTE = Object.keys(BLOCK_NAMES).map(Number);

export const FOODS = {
  apple: { name: 'Apple', hunger: 4, heal: 0, slot: SLOT.APPLE },
  meat: { name: 'Fire-roasted meat', hunger: 8, heal: 2, slot: SLOT.MEAT },
};

const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
export function swatchCss(id) {
  const d = DEFS[id];
  return `linear-gradient(135deg, ${hex(d.top)} 0 45%, ${hex(d.side)} 45% 100%)`;
}
export function canBreak(id, y) { return id !== 0 && y > 1 && !DEFS[id].liquid; }
