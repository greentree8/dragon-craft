import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Sky } from './sky.js';
import { Dragon, DEFAULT_LOOK } from './dragon.js';
import { Player } from './player.js';
import { FireBreath, ICE_BREATH, ZAP_BREATH, ROCK_BREATH } from './fire.js';
import { Bursts } from './effects.js';
import { Mobs } from './mobs.js';
import { Enemies } from './enemies.js';
import { Abilities, DOOM } from './abilities.js';
import { Progress } from './progress.js';
import { ELEMENTS, ATTACK_STAGE } from './elements.js';
import { Disguise } from './disguise.js';
import { Chests, GrowChests } from './chests.js';
import { Labyrinth } from './maze.js';
import { WorldMap } from './map.js';
import { MAZES } from './mazegen.js';
import { CITADEL, CHEST_TOTAL } from './citadel.js';
import { Vitals } from './stats.js';
import { Save } from './save.js';
import { UI } from './ui.js';
import { Net, serverUrl } from './net.js';
import { Radar } from './radar.js';
import { B, DEFS } from './blocks.js';
import { SLOT, DEFAULT_HOTBAR, FOODS, PALETTE, BLOCK_NAMES, canBreak } from './items.js';
import { VOLCANO, VILLAGE, CRYSTAL_ISLE, HEIGHT } from './worldgen.js';
import { CASTLE, CASTLES } from './castle.js';

const VERSION = '0.3.0';
const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
const RD = Number(params.get('rd')) || (LOW ? 5 : 7);
const SEED_PARAM = Number(params.get('seed')) || 1337;
const WORLD = (params.get('world') || 'main').replace(/[^\w-]/g, '').slice(0, 24) || 'main';
const SPAWN = { x: 2, z: 2 };

const save = new Save(WORLD);
await save.init();
const saved = save.loadState() || {};
const savedLook = Save.loadLook();
const progress = new Progress(WORLD);

// multiplayer: join the room's server if there is one (add ?solo to play alone); the server decides the seed
const net = params.has('solo') ? null : await Net.connect({
  url: serverUrl(params, WORLD), look: { ...DEFAULT_LOOK, ...(savedLook || {}) }, seed: SEED_PARAM,
});
const SEED = net ? net.seed : SEED_PARAM;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);

const world = new World(scene, { seed: SEED, renderDistance: RD, save: net ? net.edits : save });
const sky = new Sky(scene, renderer);
sky.time = net ? net.time : saved.time ?? 0.1;
scene.fog.near = RD * 16 * 0.4;
scene.fog.far = RD * 16 * 0.97;
const dragon = new Dragon({ ...DEFAULT_LOOK, ...(savedLook || {}) });
scene.add(dragon.root);
const fire = new FireBreath(scene);
const ice = new FireBreath(scene, ICE_BREATH);
const zap = new FireBreath(scene, ZAP_BREATH);
const rock = new FireBreath(scene, ROCK_BREATH);
const bursts = new Bursts(scene);
const mobs = new Mobs(scene, world, bursts);
if (net) {
  net.attach(scene, world);
  net.onJoin = (name) => ui.toast(`${name} joined`);
  net.onLeave = (name) => ui.toast(`${name} left`);
  net.onStatus = (ok) => ui.toast(ok ? 'Reconnected' : 'Connection lost. Trying to reconnect…');
}
const enemies = new Enemies(scene, world, bursts);
const disguise = new Disguise(scene, dragon, (why) => ui.toast(why === 'attacked' ? 'The guards saw through your disguise!' : why));
const abilities = new Abilities({ scene, world, bursts, mobs, enemies, canBreak, B });
const vitals = new Vitals();
vitals.setMaxHealth(progress.stage.hp);
vitals.load(saved);
abilities.power = progress.stage.power;
const player = new Player(world, canvas);
if (saved.pos) { player.pos.set(...saved.pos); player.yaw = saved.yaw ?? 0; player.pitch = saved.pitch ?? -0.15; }
else player.pos.set(SPAWN.x, 70, SPAWN.z);

// hotbar: slot 0 fire, 1-6 blocks, 7 apple, 8 meat
const hot = {
  selected: 0,
  blocks: Array.isArray(saved.blocks) && saved.blocks.length === 6 ? saved.blocks : DEFAULT_HOTBAR.slice(),
  food: { apple: 3, meat: 0, ...(saved.food || {}) },
};

// block outline for the targeted block
const outline = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.BoxGeometry(1.012, 1.012, 1.012)),
  new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }),
);
outline.visible = false;
scene.add(outline);

// post-processing: HDR render target (with MSAA) -> bloom -> tone map
const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.55, 1.0));
composer.addPass(new OutputPass());
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---------- UI ----------
let fps = 0;
const ui = new UI({
  look: dragon.look,
  onLook: (l) => { dragon.setLook(l); Save.saveLook({ ...dragon.look }); net?.send({ t: 'look', look: { ...dragon.look } }); },
  onPlay: () => canvas.requestPointerLock(),
  feedbackContext: () => [
    `Dragon Craft v${VERSION} · world "${WORLD}" · seed ${SEED}`,
    `Dragon: ${dragon.look.name} · position ${player.pos.x.toFixed(0)}, ${player.pos.y.toFixed(0)}, ${player.pos.z.toFixed(0)} · time ${sky.clockString()} · ${fps} fps`,
    net ? `Multiplayer room "${WORLD}" · ${net.remotes.size + 1} online` : 'Single player',
    `${progress.stage.label} ${progress.element || 'no'} dragon · ${progress.count}/${CHEST_TOTAL} chests · health ${vitals.health}/${vitals.maxHealth} · hunger ${Math.ceil(vitals.hunger)}/20`,
    navigator.userAgent,
  ].join('\n'),
});
const radar = new Radar(document.getElementById('hud'));
ui.buildHotbar(hot);
const worldMap = new WorldMap(world.gen);
const mazes = MAZES.map((m) => new Labyrinth(scene, world, enemies, bursts, WORLD, m));
let masterOwned = false;
try { masterOwned = !!Number(localStorage.getItem(`dragoncraft:master:${WORLD}`)); } catch { /* ignore */ }
const mazeHooks = {
  hit: (dmg, source) => enemyHooks.hit(dmg, source),
  toast: (t) => ui.toast(t),
  golden: () => { vitals.invincible = 600; ui.toast('GOLDEN APPLE! You are invincible for 10 minutes!'); },
  master: () => { masterOwned = true; ui.toast('MASTER APPLE! Press K to ANNIHILATE everything nearby (2 minute cooldown)'); },
};
const chests = new Chests(world, WORLD, {
  give: (n) => { hot.food.meat += n; refreshHotbar(); },
  toast: (t) => ui.toast(t),
  burst: (x, y, z) => { bursts.burst(x, y, z, 0xffd23f, 24, 5, 0.18, 3); bursts.burst(x, y, z, 0xc86a2a, 10, 3, 0.2, 2); },
});
const growChests = new GrowChests(world, progress, {
  meat: (n) => { hot.food.meat += n; refreshHotbar(); },
  burst: (x, y, z) => { bursts.burst(x, y, z, 0xffd23f, 30, 6, 0.2, 3); bursts.burst(x, y, z, 0xffffff, 12, 4, 0.15, 3); },
  opened: ({ count, grew }) => {
    ui.setElementLocked(true);
    if (grew) applyStage(true);
    else ui.toast(`Chest ${count}/${CHEST_TOTAL}! ${progress.next ? `${progress.next.min - count} more to grow into a ${progress.next.label}` : 'You are fully grown!'}`);
    updateGrowthText();
  },
});

// ---------- growing up and elements ----------
let abilityIds = [];
function buildAbilityBar() {
  const el = ELEMENTS[progress.element];
  const slots = el ? el.attacks.map((a) => ({ ...a, stage: ATTACK_STAGE[a.key] })) : [];
  const list = [...slots, { ...DOOM }, { id: 'disguise', key: 'H', icon: '🛡', name: 'Guard disguise (5 min)' }];
  abilityIds = list.map((a) => a.id);
  ui.buildAbilities(list.map((a) => ({ key: a.key, icon: a.icon, name: a.stage && progress.stageIndex < a.stage ? `${a.name} (grow up to unlock)` : a.name })));
}

function updateGrowthText() {
  const st = progress.stage, nx = progress.next;
  ui.setGrowth(`${st.label} ${progress.element ? ELEMENTS[progress.element].label.toLowerCase() : ''} dragon · ${progress.count}/${CHEST_TOTAL} chests${nx ? ` · ${nx.min - progress.count} to ${nx.label}` : ''}`);
}

// size, health, power and attacks follow your growth stage
function applyStage(announce) {
  const st = progress.stage;
  dragon.look.stage = st.id; dragon.look.element = progress.element;
  dragon.setStage(st.id);
  abilities.power = st.power;
  vitals.setMaxHealth(st.hp);
  buildAbilityBar();
  updateGrowthText();
  net?.send({ t: 'look', look: { ...dragon.look } });
  Save.saveLook({ ...dragon.look });
  if (announce) {
    const el = ELEMENTS[progress.element];
    const a = el && progress.stageIndex >= 1 ? el.attacks[progress.stageIndex - 1] : null;
    ui.toast(`You grew into a ${st.label}! ${a ? `New attack: ${a.name} (${a.key})` : ''}`);
    bursts.burst(player.pos.x, player.pos.y, player.pos.z, 0xffe27a, 50, 9, 0.3, 4, 3);
  }
}

function pickElement(id) {
  if (progress.count > 0) return;
  progress.setElement(id);
  ui.setElement(id);
  ui.changeLook(ELEMENTS[id].palette); // a matching colour scheme (you can still change it)
  ui.syncDragonTab();
  applyStage(false);
  refreshHotbar();
}

ui.initElements(pickElement);
ui.setElement(progress.element);
ui.setElementLocked(progress.count > 0);
applyStage(false);
refreshHotbar();
ui.setVitals(vitals.health, vitals.hunger, vitals.maxHealth);
ui.showMenu(!progress.element || !savedLook ? 'dragon' : 'play');

let suppressMenu = false, iceHinted = false;
document.addEventListener('pointerlockchange', () => {
  const on = document.pointerLockElement === canvas;
  player.locked = on;
  if (on) {
    ui.hideMenu(); ui.markStarted();
    if (!iceHinted) { iceHinted = true; setTimeout(() => ui.toast('Hold left click (or F) to breathe. Find the 50 chests in the Grand Citadel to grow up!'), 1800); }
  }
  else { worldMap.setOpen(false); player.buttons.clear(); if (!ui.paletteOpen && !suppressMenu) ui.showMenu('play'); }
});
document.addEventListener('pointerlockerror', () => { suppressMenu = false; if (!ui.paletteOpen) ui.showMenu('play'); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function refreshHotbar() { ui.refreshHotbar(hot); }

function selectSlot(i) {
  hot.selected = (i + 9) % 9;
  refreshHotbar();
  let name = `${ELEMENTS[progress.element]?.breath.name ?? 'Breath'} (hold left click or F)`;
  if (hot.selected >= SLOT.FIRST_BLOCK && hot.selected <= SLOT.LAST_BLOCK) name = BLOCK_NAMES[hot.blocks[hot.selected - 1]];
  else if (hot.selected === SLOT.APPLE) name = 'Apple';
  else if (hot.selected === SLOT.MEAT) name = FOODS.meat.name;
  ui.showItemName(name);
}

function eat(key) {
  if (hot.food[key] <= 0) { ui.toast(`No ${FOODS[key].name.toLowerCase()} left`); return; }
  if (vitals.eat(FOODS[key])) {
    hot.food[key]--;
    ui.toast(`Yum! ${FOODS[key].name}`);
    bursts.burst(player.pos.x, player.pos.y + 0.6, player.pos.z, key === 'apple' ? 0xe0353b : 0xc86a2a, 8, 3, 0.1, 2);
    refreshHotbar();
  } else if (!vitals.dead && vitals.eatCooldown <= 0) ui.toast("You're not hungry");
}

function quickEat() {
  const wantMeat = vitals.hunger <= 12 && hot.food.meat > 0;
  eat(wantMeat || hot.food.apple <= 0 ? 'meat' : 'apple');
}

function openPalette() {
  const slot = hot.selected >= SLOT.FIRST_BLOCK && hot.selected <= SLOT.LAST_BLOCK ? hot.selected : SLOT.FIRST_BLOCK;
  if (hot.selected !== slot) { hot.selected = slot; refreshHotbar(); }
  suppressMenu = true;
  document.exitPointerLock();
  ui.openPalette(slot + 1, hot.blocks[slot - 1], (id) => { hot.blocks[slot - 1] = id; refreshHotbar(); },
    () => { suppressMenu = false; canvas.requestPointerLock(); });
}

let debugOn = params.has('debug');
// where the mouth is and which way the crosshair says to aim (sets `mouth` and `aim`)
function aimFromCrosshair() {
  dragon.root.updateMatrixWorld(true);
  dragon.mouthWorld(mouth);
  const dir = player.lookDir(aim);
  const hit = world.raycast(camera.position, dir, 80);
  if (hit) tmpV.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
  else tmpV.copy(camera.position).addScaledVector(dir, 60);
  aim.copy(tmpV).sub(mouth).normalize();
}

let friendIdx = -1;
// J: fly to the next other player (nearest first)
function goToFriend() {
  if (!net) { ui.toast('Single player: nobody to fly to'); return; }
  const list = [...net.remotes.values()].filter((r) => r.hasPos).sort((a, b) => a.pos.distanceTo(player.pos) - b.pos.distanceTo(player.pos));
  if (!list.length) { ui.toast('No other dragons online yet'); return; }
  friendIdx = (friendIdx + 1) % list.length;
  const r = list[friendIdx];
  player.pos.set(r.pos.x + 6, r.pos.y + 2, r.pos.z);
  player.vel.set(0, 0, 0);
  player.flying = true;
  ui.toast(`Flew to ${r.name}`);
}

function toggleDisguise() {
  if (disguise.active) { disguise.stop('You took off the disguise.'); return; }
  if (disguise.start()) ui.toast('Disguised as a castle guard! The guards will leave you alone. Do not attack.');
  else ui.toast(`You can disguise again in ${Math.ceil(disguise.cd)}s`);
}

// Z / X / B: the three attacks of your element, unlocked as you grow up
function useAttack(key) {
  const el = ELEMENTS[progress.element];
  if (!el || vitals.dead || !player.ready) return;
  const a = el.attacks.find((x) => x.key === key);
  if (!a) return;
  if (progress.stageIndex < ATTACK_STAGE[key]) { ui.toast(`Grow up to unlock ${a.name}: open more chests in the Grand Citadel`); return; }
  if (a.id === 'stoneskin') {
    if ((abilities.cd.stoneskin || 0) > 0) return;
    abilities.cd.stoneskin = a.cooldown;
    vitals.invincible = Math.max(vitals.invincible, 6);
    vitals.spend(a.cost);
    ui.toast('Stone skin! Nothing can hurt you for 6 seconds');
    bursts.burst(player.pos.x, player.pos.y, player.pos.z, 0x9a8a70, 30, 6, 0.25, 3, 6);
    return;
  }
  aimFromCrosshair();
  if (abilities.use(a.id, mouth, aim, player)) { disguise.stop('attacked'); vitals.spend(a.cost); }
}

function useDoom() {
  if (vitals.dead || !player.ready) return;
  if (!masterOwned) { ui.toast('Find the Master Apple in the Volcano Maze to unlock this attack'); return; }
  aimFromCrosshair();
  if (abilities.use('doom', mouth, aim, player)) { disguise.stop('attacked'); vitals.spend(DOOM.cost); }
}

addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); debugOn = !debugOn; return; }
  if (e.code === 'Escape' && ui.paletteOpen) { ui.closePalette(); return; }
  if (e.code === 'KeyE' && ui.paletteOpen) { ui.closePalette(); return; }
  if (!player.locked || e.repeat) return;
  if (/^Digit[1-9]$/.test(e.code)) selectSlot(Number(e.code.slice(5)) - 1);
  else if (e.code === 'KeyE') openPalette();
  else if (e.code === 'KeyR') quickEat();
  else if (e.code === 'KeyZ') useAttack('Z');
  else if (e.code === 'KeyX') useAttack('X');
  else if (e.code === 'KeyB') useAttack('B');
  else if (e.code === 'KeyK') useDoom();
  else if (e.code === 'KeyH') toggleDisguise();
  else if (e.code === 'KeyJ') goToFriend();
  else if (e.code === 'KeyM') worldMap.toggle();
  else if (e.code === 'KeyT' && !net) sky.time = (sky.time + 0.08) % 1;
  else if (e.code === 'KeyP' && !net) sky.paused = !sky.paused;
  else if (e.code === 'Minus') player.camDist = Math.min(16, player.camDist + 1);
  else if (e.code === 'Equal') player.camDist = Math.max(3, player.camDist - 1);
});
addEventListener('wheel', (e) => { if (player.locked) selectSlot(hot.selected + Math.sign(e.deltaY)); }, { passive: true });

// ---------- building ----------
const _dir = new THREE.Vector3(), _org = new THREE.Vector3();
function findTarget() {
  player.lookDir(_dir);
  _org.copy(camera.position).addScaledVector(_dir, player.firstPerson ? 0 : player.camDist);
  return world.raycast(_org, _dir, 14);
}

let protectedToastT = 0;
function protectedHint() { if (performance.now() - protectedToastT > 3000) { protectedToastT = performance.now(); ui.toast('This castle is magic. Nothing can break it!'); } }

function breakBlock(hit) {
  if (world.gen.isProtected(hit.x, hit.y, hit.z)) { protectedHint(); return; }
  if (!canBreak(hit.id, hit.y)) return;
  if (!world.setBlock(hit.x, hit.y, hit.z, B.AIR)) return;
  bursts.burst(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, DEFS[hit.id].top, 12, 4, 0.16, 2);
  if ((hit.id === B.LEAVES || hit.id === B.PINK_LEAVES) && Math.random() < 0.2) mobs.spawnDrop('apple', hit.x + 0.5, hit.y, hit.z + 0.5);
}

function placeBlock(hit) {
  const px = hit.x + hit.normal.x, py = hit.y + hit.normal.y, pz = hit.z + hit.normal.z;
  if (py < 2 || py >= HEIGHT - 1) return;
  if (world.gen.isProtected(px, py, pz)) { protectedHint(); return; }
  const cur = world.getBlock(px, py, pz);
  if (cur !== B.AIR && !DEFS[cur].liquid) return;
  // don't trap the dragon inside the new block
  const p = player.pos;
  if (Math.abs(p.x - (px + 0.5)) < 1 && Math.abs(p.y - (py + 0.5)) < 1.1 && Math.abs(p.z - (pz + 0.5)) < 1) return;
  const id = hot.blocks[hot.selected - 1];
  if (world.setBlock(px, py, pz, id)) bursts.burst(px + 0.5, py + 0.5, pz + 0.5, DEFS[id].top, 5, 2.5, 0.1, 1);
}

// ice breath turns the water it hits into ice, and cools lava into rock (a plus-shaped patch, a few times a second)
let freezeT = 0;
function freezeBlocks(origin, dir, dt) {
  freezeT -= dt;
  if (freezeT > 0) return;
  freezeT = 0.2;
  const hit = world.raycast(origin, dir, 24, true);
  if (!hit) return;
  const to = hit.id === B.WATER ? B.ICE : hit.id === B.LAVA ? B.BASALT : 0;
  if (!to) return;
  for (const [dx, dz] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (world.getBlock(hit.x + dx, hit.y, hit.z + dz) === hit.id) world.setBlock(hit.x + dx, hit.y, hit.z + dz, to);
  }
  bursts.burst(hit.x + 0.5, hit.y + 1, hit.z + 0.5, 0xbfe8ff, 4, 2, 0.12, 1);
}

let breakT = 0, placeT = 0, midWas = false, rightWas = false;
function handleActions(dt) {
  const slot = hot.selected;
  const blockSlot = slot >= SLOT.FIRST_BLOCK && slot <= SLOT.LAST_BLOCK;
  const breathKey = (slot === SLOT.FIRE && player.buttons.has(0)) || player.keys.has('KeyF');
  player.breathing = player.locked && !vitals.dead && breathKey;
  player.breathKind = ELEMENTS[progress.element]?.breath.id || 'fire';

  let hit = null;
  if (blockSlot && player.locked && !vitals.dead) hit = findTarget();
  outline.visible = !!hit;
  if (hit) outline.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

  breakT -= dt; placeT -= dt;
  if (player.locked && !vitals.dead) {
    if (blockSlot && hit) {
      if (player.buttons.has(0) && breakT <= 0) { breakBlock(hit); breakT = 0.2; }
      if (player.buttons.has(2) && placeT <= 0) { placeBlock(hit); placeT = 0.2; }
      const mid = player.buttons.has(1);
      if (mid && !midWas && PALETTE.includes(hit.id)) { hot.blocks[slot - 1] = hit.id; refreshHotbar(); ui.showItemName(BLOCK_NAMES[hit.id]); }
      midWas = mid;
    }
    const right = player.buttons.has(2);
    if (right && !rightWas && (slot === SLOT.APPLE || slot === SLOT.MEAT)) eat(slot === SLOT.APPLE ? 'apple' : 'meat');
    rightWas = right;
  }
}

// ---------- loop ----------
let lastT = performance.now();
let started = false;
let fpsAcc = 0, fpsN = 0, saveT = 0, deathT = 0, hungerWarned = false, orbit = 0;
const onlineEl = document.getElementById('online');
let onlineT = 0;
const debug = document.getElementById('debug'), clockEl = document.getElementById('clock'), underwater = document.getElementById('underwater');
const tmpV = new THREE.Vector3(), mouth = new THREE.Vector3(), aim = new THREE.Vector3(), vel = new THREE.Vector3();
const center = new THREE.Vector3(), camTarget = new THREE.Vector3();

function respawn() {
  player.pos.set(SPAWN.x, world.gen.height(SPAWN.x, SPAWN.z) + 6, SPAWN.z);
  player.vel.set(0, 0, 0);
  player.flying = true;
  vitals.respawn();
  player.frozen = false;
  ui.hideDeath();
  ui.toast('Back at the village. Be careful of lava!');
}

function handleVitalEvents(events) {
  for (const ev of events) {
    if (ev.type === 'hurt' || ev.type === 'death') ui.flashHurt();
    if (ev.type === 'death') {
      player.frozen = true; deathT = 2.6;
      ui.showDeath(ev.source === 'lava' ? 'You got scorched!' : 'The castle guards got you!', ev.source === 'lava' ? 'Respawning at the village…' : 'Respawning at the village. Try again!');
    }
    if (ev.type === 'starve') ui.toast('Your tummy is rumbling. Find some food!');
  }
}

const NO_VEL = new THREE.Vector3();
const enemyHooks = {
  hit: (dmg, source) => { if (!vitals.dead) { const ev = vitals.damage(dmg, source); if (ev) handleVitalEvents([ev]); } },
  drop: (type, x, y, z) => mobs.spawnDrop(type, x, y, z),
  toast: (t) => ui.toast(t),
  fireBreath: (origin, dir, dt) => fire.emit(origin, dir, NO_VEL, dt),
  iceBreath: (origin, dir, dt) => ice.emit(origin, dir, NO_VEL, dt),
  chill: (t) => { if (player.slowT <= 0) ui.toast('Frozen! You are slowed…'); player.slowT = t; },
};

function persist() {
  save.saveState({
    pos: [player.pos.x, player.pos.y, player.pos.z], yaw: player.yaw, pitch: player.pitch,
    blocks: hot.blocks, food: hot.food, time: sky.time, ...vitals.toJSON(),
  });
}
addEventListener('pagehide', persist);

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;

  world.update(player.pos.x, player.pos.z, started ? 6 : 14);
  if (!started) {
    const f = world.loadedFraction();
    ui.setLoading(f);
    if (f >= 1) { started = true; ui.setReady(); }
  }

  player.update(dt);
  sky.update(dt, player.pos);
  handleActions(dt);

  // vitals
  if (player.locked && player.ready && !vitals.dead) {
    handleVitalEvents(vitals.tick(dt, { flying: player.flying, boosting: player.boosting, breathing: player.breathing, inLava: player.inLava }));
    if (vitals.hunger <= 4 && !hungerWarned) { hungerWarned = true; ui.toast('Getting hungry: roast an animal with fire, or press 8 for an apple'); }
    if (vitals.hunger > 8) hungerWarned = false;
  }
  if (vitals.dead) { deathT -= dt; if (deathT <= 0) respawn(); }
  if (vitals.changed) { ui.setVitals(vitals.health, vitals.hunger, vitals.maxHealth); vitals.changed = false; }

  // dragon
  dragon.root.position.copy(player.pos);
  const look = player.lookDir(tmpV);
  const relYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(player.yaw - player.bodyYaw), Math.cos(player.yaw - player.bodyYaw)), -1, 1);
  dragon.update(dt, {
    flying: player.flying, speed: player.speedXZ, vy: player.vel.y, boosting: player.boosting,
    yaw: player.bodyYaw, pitch: player.bodyPitch, roll: player.roll,
    lookYaw: relYaw, lookPitch: look.y, breathing: player.breathing,
  });
  const lookPitch = look.y;

  // camera: gameplay view, or a slow orbit around the dragon while a menu is open
  if (player.locked) {
    player.applyCamera(camera, dragon.root);
    const fovTarget = player.boosting && player.flying ? 84 : 72;
    camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 5);
    camera.updateProjectionMatrix();
  } else {
    orbit += dt * 0.35;
    dragon.root.visible = true;
    center.copy(player.pos); center.y += 0.4;
    camera.position.set(center.x + Math.sin(orbit) * 6.5, center.y + 1.6, center.z + Math.cos(orbit) * 6.5);
    camTarget.set(center.x - Math.cos(orbit) * 1.9, center.y, center.z + Math.sin(orbit) * 1.9);
    camera.lookAt(camTarget);
    camera.fov = 60; camera.updateProjectionMatrix();
  }

  // fire breath aims where the crosshair points
  if (player.breathing && player.ready) {
    aimFromCrosshair();
    vel.copy(player.vel).multiplyScalar(0.6);
    const pw = abilities.power;
    if (player.breathKind === 'ice') {
      ice.emit(mouth, aim, vel, dt);
      mobs.freezeCone(mouth, aim, dt);
      enemies.freezeCone(mouth, aim, dt);
      freezeBlocks(mouth, aim, dt);
    } else if (player.breathKind === 'zap') {
      zap.emit(mouth, aim, vel, dt);
      abilities.coneAttack(mouth, aim, dt, { range: 15, widen: 0.2, dps: 9, stun: 0.5 });
    } else if (player.breathKind === 'rock') {
      rock.emit(mouth, aim, vel, dt);
      abilities.coneAttack(mouth, aim, dt, { range: 13, widen: 0.28, dps: 9, push: 40 });
    } else {
      fire.emit(mouth, aim, vel, dt);
      mobs.burnCone(mouth, aim, dt, 15, 8 * pw);
      enemies.burnCone(mouth, aim, dt, 16, 8 * pw);
    }
  }
  if (net) net.sendState(dt, player, { yaw: relYaw, pitch: lookPitch }, aim);
  const others = net ? net.update(dt, { fire, ice, zap, rock }, mouth) : { fire: false, ice: false, zap: false, rock: false };
  const mine = player.breathing ? player.breathKind : null;
  fire.update(dt, mine === 'fire' || others.fire || enemies.drakes.some((d) => d.state === 'breath' && !d.frost));
  ice.update(dt, mine === 'ice' || others.ice || enemies.drakes.some((d) => d.state === 'breath' && d.frost));
  zap.update(dt, mine === 'zap' || others.zap);
  rock.update(dt, mine === 'rock' || others.rock);
  bursts.update(dt);
  abilities.update(dt);
  if (player.breathing && disguise.active) disguise.stop('attacked');
  disguise.update(dt, player);
  chests.update(dt, player);
  growChests.update(dt, player);
  if (player.ready) for (const mz of mazes) mz.update(dt, { pos: player.pos, vel: player.vel, dead: vitals.dead }, mazeHooks);
  { // golden glow while invincible
    const g = vitals.invincible > 0 ? 0.28 + 0.14 * Math.sin(performance.now() / 160) : 0;
    for (const m of [dragon.mats.body, dragon.mats.belly]) m.emissive.setRGB(g, g * 0.72, g * 0.1);
    ui.setInvincible(vitals.invincible > 0 ? `✨ Invincible ${Math.floor(vitals.invincible / 60)}:${String(Math.floor(vitals.invincible % 60)).padStart(2, '0')}` : null);
  }
  ui.setCooldowns(abilityIds.map((id) => (id === 'disguise' ? disguise.fraction() : abilities.fraction(id))),
    abilityIds.map((id, i) => (id === 'doom' ? !masterOwned : i < 3 && progress.stageIndex < i + 1)));
  ui.setDisguise(disguise.active ? `🛡 Disguised as a guard ${disguise.timeText()} · H to take off` : null);
  if (player.ready) enemies.update(dt, { pos: player.pos, vel: player.vel, dead: vitals.dead, disguised: disguise.active }, enemyHooks);
  ui.setBoss(enemies.bossInfo());
  if (player.ready) mobs.update(dt, player, (type) => {
    hot.food[type]++;
    ui.toast(`Picked up ${FOODS[type].name}`);
    refreshHotbar();
  });

  composer.render();

  underwater.style.opacity = player.cameraInWater(camera) ? '1' : '0';
  saveT += dt;
  if (saveT > 5) { saveT = 0; persist(); }

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (debugOn) {
    const s = world.stats();
    debug.textContent = `${fps} fps  xyz ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}\n` +
      `chunks ${s.chunks}  tris ${(s.tris / 1000).toFixed(0)}k  mobs ${mobs.list.length}  time ${sky.clockString()}  ${player.flying ? 'flying' : 'walking'}`;
  } else debug.textContent = '';
  clockEl.textContent = sky.clockString();
  worldMap.draw({ x: player.pos.x, z: player.pos.z, yaw: player.yaw },
    net ? [...net.remotes.values()].filter((r) => r.hasPos).map((r) => ({ name: r.name, x: r.pos.x, z: r.pos.z, color: r.dragon.look.body })) : []);
  radar.update(dt, { x: player.pos.x, y: player.pos.y, z: player.pos.z, yaw: player.yaw },
    net ? [...net.remotes.values()].filter((r) => r.hasPos).map((r) => ({ name: r.name, x: r.pos.x, y: r.pos.y, z: r.pos.z, color: r.dragon.look.body })) : [],
    net ? (net.connected ? `Room "${WORLD}": no other dragons yet. Send your friend this link!` : 'Reconnecting…')
      : 'Single player. Could not reach the multiplayer server.', [...CASTLES.map((c) => ({ name: 'Castle', x: c.x, z: c.z })), { name: 'Grand Citadel', x: CITADEL.x, z: CITADEL.z }, ...MAZES.map((m) => ({ name: m.name, x: m.x, z: m.z }))]);
  if (net && (onlineT -= dt) <= 0) {
    onlineT = 1;
    onlineEl.textContent = net.connected ? `👥 ${[dragon.look.name, ...net.names()].join(', ')}` : '⚠ reconnecting…';
  }
}
frame();

// handy for tests and future features
window.__game = { progress, applyStage, growChests, zap, rock, mazes, disguise, chests, abilities, composer, ice, enemies, net, THREE, scene, camera, renderer, world, sky, dragon, player, fire, mobs, vitals, hot, ui, save, bursts, landmarks: { VOLCANO, VILLAGE, CRYSTAL_ISLE, CASTLE, CASTLES } };
