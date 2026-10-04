// The four dragon elements. Every dragon has a breath (hold left click or F) and, as it grows, three more attacks of its
// element on Z (kid), X (teenager) and B (adult). Annihilate (K) and the guard disguise (H) belong to nobody.
export const ELEMENTS = {
  fire: {
    label: 'Fire', icon: '🔥', blurb: 'Burn everything. Fireballs, rings of flame and meteor storms.',
    palette: { body: 0xc8321e, belly: 0xffc060, accent: 0xffd23f, wing: 0x6b1a12, eye: 0xffe9a0 },
    breath: { id: 'fire', name: 'Fire breath', icon: '🔥' },
    attacks: [
      { id: 'fireball', key: 'Z', name: 'Fireball', icon: '☄', cooldown: 3, cost: 1.0 },
      { id: 'inferno', key: 'X', name: 'Inferno ring', icon: '🔥', cooldown: 9, cost: 1.0 },
      { id: 'meteors', key: 'B', name: 'Meteor storm', icon: '🌠', cooldown: 25, cost: 1.5 },
    ],
  },
  ice: {
    label: 'Ice', icon: '❄', blurb: 'Freeze everything. Ice shards, blizzards and Absolute Zero.',
    palette: { body: 0x6fb8e8, belly: 0xf2fbff, accent: 0xb9f0ff, wing: 0x3a6fb0, eye: 0xffffff },
    breath: { id: 'ice', name: 'Ice breath', icon: '❄' },
    attacks: [
      { id: 'shards', key: 'Z', name: 'Ice shards', icon: '🔷', cooldown: 3, cost: 1.0 },
      { id: 'blizzard', key: 'X', name: 'Blizzard', icon: '🌨', cooldown: 12, cost: 1.0 },
      { id: 'zero', key: 'B', name: 'Absolute Zero', icon: '❄', cooldown: 30, cost: 1.5 },
    ],
  },
  lightning: {
    label: 'Lightning', icon: '⚡', blurb: 'Zap everything. Chain lightning, thunder claps and storms.',
    palette: { body: 0x5b3fb0, belly: 0xe8e0ff, accent: 0xffe14d, wing: 0x2a1d5e, eye: 0xfff27a },
    breath: { id: 'zap', name: 'Spark breath', icon: '⚡' },
    attacks: [
      { id: 'lightning', key: 'Z', name: 'Chain lightning', icon: '⚡', cooldown: 2.5, cost: 0.5 },
      { id: 'thunderclap', key: 'X', name: 'Thunder clap', icon: '💥', cooldown: 9, cost: 0.8 },
      { id: 'storm', key: 'B', name: 'Storm call', icon: '⛈', cooldown: 25, cost: 1.5 },
    ],
  },
  earth: {
    label: 'Earth', icon: '⛰', blurb: 'Crush everything. Boulders, earthquakes and stone skin.',
    palette: { body: 0x7a5a2e, belly: 0xd8c8a0, accent: 0x4e9e32, wing: 0x4a6a2a, eye: 0xffd27a },
    breath: { id: 'rock', name: 'Rock spit', icon: '⛰' },
    attacks: [
      { id: 'boulder', key: 'Z', name: 'Boulder', icon: '⛰', cooldown: 3, cost: 1.0 },
      { id: 'quake', key: 'X', name: 'Earthquake', icon: '🌋', cooldown: 10, cost: 1.0 },
      { id: 'stoneskin', key: 'B', name: 'Stone skin', icon: '🛡', cooldown: 30, cost: 1.5 },
    ],
  },
};
export const ELEMENT_IDS = Object.keys(ELEMENTS);

// the attack on a key for an element, and the growth stage (index into STAGES) that unlocks it
export const ATTACK_STAGE = { Z: 1, X: 2, B: 3 };
