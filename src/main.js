import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './world.js';
import { Sky } from './sky.js';
import { Dragon } from './dragon.js';
import { Player } from './player.js';
import { FireBreath } from './fire.js';
import { VOLCANO, VILLAGE, CRYSTAL_ISLE } from './worldgen.js';

const params = new URLSearchParams(location.search);
const LOW = params.get('q') === 'low';
const RD = Number(params.get('rd')) || (LOW ? 5 : 7);
const SEED = Number(params.get('seed')) || 1337;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = !LOW;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 1000);
scene.add(camera);

const world = new World(scene, { seed: SEED, renderDistance: RD });
const sky = new Sky(scene, renderer);
scene.fog.near = RD * 16 * 0.4;
scene.fog.far = RD * 16 * 0.97;
const dragon = new Dragon();
scene.add(dragon.root);
const fire = new FireBreath(scene);
const player = new Player(world, canvas);
player.pos.set(2, 70, 2);

// post-processing: HDR render target (with MSAA) -> bloom -> tone map
const target = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: LOW ? 0 : 4 });
const composer = new EffectComposer(renderer, target);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.38, 0.55, 1.0);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

// ---- UI ----
const $ = (id) => document.getElementById(id);
const overlay = $('overlay'), loadbar = $('loadbar'), startBtn = $('start'), hud = $('hud'), debug = $('debug'), underwater = $('underwater');
let started = false, debugOn = params.has('debug');

function setLock(on) {
  player.locked = on;
  overlay.classList.toggle('hidden', on);
  hud.classList.toggle('hidden', !on);
}
startBtn.addEventListener('click', () => { if (!startBtn.disabled) canvas.requestPointerLock(); });
document.addEventListener('pointerlockchange', () => setLock(document.pointerLockElement === canvas));
addEventListener('keydown', (e) => {
  if (e.code === 'F3') { e.preventDefault(); debugOn = !debugOn; }
  if (e.code === 'KeyT') sky.time = (sky.time + 0.08) % 1;
  if (e.code === 'KeyP') sky.paused = !sky.paused;
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
});

// ---- loop ----
let lastT = performance.now();
const tmpV = new THREE.Vector3(), mouth = new THREE.Vector3(), aim = new THREE.Vector3(), vel = new THREE.Vector3();
let fpsAcc = 0, fpsN = 0, fps = 0;

function frame() {
  requestAnimationFrame(frame);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.1);
  lastT = now;

  world.update(player.pos.x, player.pos.z, started ? 6 : 14);
  if (!started) {
    const f = world.loadedFraction();
    loadbar.style.width = `${Math.round(f * 100)}%`;
    if (f >= 1) {
      started = true;
      startBtn.disabled = false;
      startBtn.textContent = 'Click to fly!';
      $('loadtext').textContent = 'The world is ready.';
    }
  }

  player.update(dt);
  sky.update(dt, player.pos);

  // dragon
  dragon.root.position.copy(player.pos);
  const look = player.lookDir(tmpV);
  const relYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(player.yaw - player.bodyYaw), Math.cos(player.yaw - player.bodyYaw)), -1, 1);
  dragon.update(dt, {
    flying: player.flying, speed: player.speedXZ, vy: player.vel.y, boosting: player.boosting,
    yaw: player.bodyYaw, pitch: player.bodyPitch, roll: player.roll,
    lookYaw: relYaw, lookPitch: look.y, breathing: player.breathing,
  });

  player.applyCamera(camera, dragon.root);
  const fovTarget = player.boosting && player.flying ? 84 : 72;
  camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 5);
  camera.updateProjectionMatrix();

  // fire breath aims where the crosshair points
  if (player.breathing && player.ready) {
    dragon.root.updateMatrixWorld(true);
    dragon.mouthWorld(mouth);
    const dir = player.lookDir(aim);
    const hit = world.raycast(camera.position, dir, 80);
    if (hit) tmpV.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
    else tmpV.copy(camera.position).addScaledVector(dir, 60);
    aim.copy(tmpV).sub(mouth).normalize();
    vel.copy(player.vel).multiplyScalar(0.6);
    fire.emit(mouth, aim, vel, dt);
  }
  fire.update(dt, player.breathing);

  composer.render();

  underwater.style.opacity = player.cameraInWater(camera) ? '1' : '0';

  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { fps = Math.round(fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; }
  if (debugOn) {
    const s = world.stats();
    debug.textContent = `${fps} fps  xyz ${player.pos.x.toFixed(1)} ${player.pos.y.toFixed(1)} ${player.pos.z.toFixed(1)}\n` +
      `chunks ${s.chunks}  tris ${(s.tris / 1000).toFixed(0)}k  time ${sky.clockString()}  ${player.flying ? 'flying' : 'walking'}`;
  } else debug.textContent = '';
  $('clock').textContent = sky.clockString();
}
frame();

// handy for tests and future features
window.__game = { THREE, scene, camera, renderer, world, sky, dragon, player, fire, landmarks: { VOLCANO, VILLAGE, CRYSTAL_ISLE } };
