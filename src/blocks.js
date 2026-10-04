// Block definitions. Colors are hex sRGB. `glow` multiplies color into HDR so bloom picks it up.

export const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5, SNOW: 6, LOG: 7, LEAVES: 8,
  LAVA: 9, BASALT: 10, CRYSTAL_PURPLE: 11, CRYSTAL_CYAN: 12, GOLD: 13, PLANKS: 14,
  CACTUS: 15, LANTERN: 16, COBBLE: 17, PINK_LEAVES: 18, ASH: 19, STONE_BRICK: 20, ICE: 21, CHEST: 22, OBSIDIAN: 23,
};

// round: logs are drawn as rounded trunks (see world.js). smooth: natural terrain blocks get rendered as rounded surface-nets mesh (see smooth.js).
// top / side / bottom colors. gradTop: side faces blend from top color down to side color.
export const DEFS = [];
function def(id, d) { DEFS[id] = { solid: true, opaque: true, glow: 0, jitter: 0.07, ...d }; }

def(B.AIR,    { solid: false, opaque: false, top: 0, side: 0, bottom: 0 });
def(B.GRASS,  { smooth: true, top: 0x4e9e32, side: 0x8a6240, bottom: 0x7a5535, gradTop: true, jitter: 0.11 });
def(B.DIRT,   { smooth: true, top: 0x8a6240, side: 0x7d5a3a, bottom: 0x6f4f33 });
def(B.STONE,  { smooth: true, top: 0x8d9097, side: 0x7f838a, bottom: 0x72757c, jitter: 0.08 });
def(B.SAND,   { smooth: true, top: 0xe9d38f, side: 0xdcc57d, bottom: 0xcdb56e });
def(B.WATER,  { solid: false, opaque: false, liquid: true, top: 0x2a8fe0, side: 0x2a8fe0, bottom: 0x2a8fe0, jitter: 0.03 });
def(B.SNOW,   { smooth: true, top: 0xf4f9ff, side: 0xdfe9f4, bottom: 0x9aa7b4, gradTop: true, jitter: 0.03 });
def(B.LOG,    { round: true, top: 0xb08a57, side: 0x6b4a2b, bottom: 0xb08a57, jitter: 0.1 });
def(B.LEAVES, { smooth: true, leafy: true, top: 0x358a2c, side: 0x2f7c28, bottom: 0x286a22, jitter: 0.16 });
def(B.PINK_LEAVES, { smooth: true, leafy: true, top: 0xff9ec7, side: 0xf48bb8, bottom: 0xe27aa8, jitter: 0.12 });
def(B.LAVA,   { solid: false, opaque: true, liquid: true, emissive: true, top: 0xff6a12, side: 0xff5a0a, bottom: 0xff5a0a, glow: 1.9, jitter: 0.2 });
def(B.BASALT, { smooth: true, top: 0x3a3a44, side: 0x32323b, bottom: 0x2b2b33, jitter: 0.1 });
def(B.ASH,    { smooth: true, top: 0x55555e, side: 0x4a4a53, bottom: 0x3f3f48, jitter: 0.12 });
def(B.CRYSTAL_PURPLE, { emissive: true, top: 0xb44dff, side: 0xa23cf0, bottom: 0x8d2ede, glow: 1.5, jitter: 0.15 });
def(B.CRYSTAL_CYAN,   { emissive: true, top: 0x45e8ff, side: 0x33d6f2, bottom: 0x28c0dc, glow: 1.5, jitter: 0.15 });
def(B.GOLD,   { top: 0xffd23f, side: 0xf2c12e, bottom: 0xe0b020, glow: 0.35, emissive: true, jitter: 0.1 });
def(B.PLANKS, { top: 0xc79a5b, side: 0xb98a4c, bottom: 0xa87a40, jitter: 0.05 });
def(B.CACTUS, { top: 0x3d9c4a, side: 0x2f8a3d, bottom: 0x2f8a3d, jitter: 0.06 });
def(B.LANTERN,{ emissive: true, top: 0xffd27a, side: 0xffc35a, bottom: 0xffc35a, glow: 2.0, jitter: 0.05 });
def(B.STONE_BRICK, { top: 0x8e9199, side: 0x7d8087, bottom: 0x70737a, jitter: 0.05 });
def(B.ICE, { top: 0xbfe8ff, side: 0xa9dcf6, bottom: 0x93cdee, jitter: 0.04 });
def(B.CHEST, { emissive: true, top: 0xb97a32, side: 0xa86a28, bottom: 0x7a4a1c, glow: 0.7, jitter: 0.04 });
def(B.OBSIDIAN, { top: 0x45346a, side: 0x3a2b5a, bottom: 0x2d2146, jitter: 0.1 });
def(B.COBBLE, { top: 0x9a9da3, side: 0x8b8e95, bottom: 0x7c7f86, jitter: 0.14 });

export const isSolid = (id) => DEFS[id].solid;
export const isOpaque = (id) => DEFS[id].opaque;
