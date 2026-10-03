// DOM user interface: menu (play / dragon customizer / feedback / controls), HUD bars, hotbar, block palette.
import { DEFAULT_LOOK, LOOK_OPTIONS, PRESETS } from './dragon.js';
import { SLOT, PALETTE, BLOCK_NAMES, FOODS, swatchCss } from './items.js';
import { MAX_HEALTH, MAX_HUNGER } from './stats.js';

const $ = (id) => document.getElementById(id);
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
const REPO = 'https://github.com/greentree8/dragon-craft';

const svg = (inner) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'>${inner}</svg>`)}")`;
const HEART = 'M12 21.5C5 16 2 12.2 2 8.4 2 5.4 4.3 3 7.2 3c1.9 0 3.7 1 4.8 2.7C13.100 4 14.900 3 16.800 3 19.700 3 22 5.400 22 8.400c0 3.800-3 7.600-10 13.100z';
const DRUMSTICK = (fill) => `<g stroke='#2a1608' stroke-width='1.5' stroke-linejoin='round'><rect x='12' y='12' width='11' height='4' rx='2' transform='rotate(45 12 12)' fill='#f4ead2'/><circle cx='9' cy='9' r='7' fill='${fill}'/></g>`;
const FLAME = "<path d='M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 2 2 2 2 3 1-2 1-5 1-8z' fill='#ff8a1f' stroke='#7a2a00' stroke-width='1.2' stroke-linejoin='round'/><path d='M12 11c1 2 3 3 3 5a3 3 0 0 1-6 0c0-2 2-3 3-5z' fill='#ffd84a'/>";
const APPLE = "<path d='M12 7c-3-2-8 0-8 6 0 4 3 8 5 8 1 0 2-.7 3-.7s2 .7 3 .7c2 0 5-4 5-8 0-6-5-8-8-6z' fill='#e0353b' stroke='#5a0e12' stroke-width='1.3' stroke-linejoin='round'/><path d='M12 7c0-2 1-4 3-5' stroke='#5a3a1a' stroke-width='1.6' fill='none'/><path d='M13 4c2-1 4 0 4 0-1 2-3 2-4 1z' fill='#4cae3c'/>";

function iconSvg(inner) { return `<svg viewBox='0 0 24 24'>${inner}</svg>`; }

export class UI {
  constructor({ look, onLook, onPlay, feedbackContext }) {
    this.onLook = onLook;
    this.onPlay = onPlay;
    this.feedbackContext = feedbackContext;
    this.look = { ...DEFAULT_LOOK, ...look };
    this.ready = false;
    this.started = false;
    this.paletteOpen = false;

    const root = document.documentElement.style;
    root.setProperty('--full', svg(`<path d='${HEART}' fill='#e0303a' stroke='#3a0a0e' stroke-width='1.6' stroke-linejoin='round'/><path d='M6 6.5c1-1.200 3-1.300 3.500.300' stroke='#ff9aa0' stroke-width='1.6' fill='none' stroke-linecap='round'/>`));
    root.setProperty('--empty', svg(`<path d='${HEART}' fill='rgba(20,10,20,.55)' stroke='#3a0a0e' stroke-width='1.6' stroke-linejoin='round'/>`));
    this.hungerFull = svg(DRUMSTICK('#c8702e'));
    this.hungerEmpty = svg(DRUMSTICK('rgba(40,25,15,.55)').replace(/%23f4ead2/g, '%23777'));
    this.heartsEl = $('hearts');
    this.hungerEl = $('hunger');
    for (const el of [this.heartsEl, this.hungerEl]) {
      for (let i = 0; i < 10; i++) el.insertAdjacentHTML('beforeend', '<span class="ico"><i></i></span>');
    }
    this.hungerEl.style.setProperty('--full', this.hungerFull);
    this.hungerEl.style.setProperty('--empty', this.hungerEmpty);

    this.initTabs();
    this.initDragonTab();
    this.initFeedback();
    $('start').addEventListener('click', () => { if (this.ready) this.onPlay(); });
    $('to-play').addEventListener('click', () => this.showTab('play'));
  }

  // ---------- menu ----------
  initTabs() {
    for (const b of document.querySelectorAll('.tabs button')) {
      b.addEventListener('click', () => this.showTab(b.dataset.tab));
    }
  }

  showTab(name) {
    for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('on', b.dataset.tab === name);
    for (const s of document.querySelectorAll('.card > section')) s.hidden = s.id !== `tab-${name}`;
  }

  showMenu(tab = 'play') { $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); this.showTab(tab); }
  hideMenu() { $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); }
  get menuOpen() { return !$('menu').classList.contains('hidden'); }

  setLoading(frac) { $('loadbar').style.width = `${Math.round(frac * 100)}%`; }
  setReady() {
    this.ready = true;
    $('start').disabled = false;
    $('start').textContent = this.started ? 'Resume' : 'Click to fly!';
    $('loadtext').textContent = 'The world is ready.';
  }
  markStarted() { this.started = true; $('start').textContent = 'Resume'; }

  // ---------- dragon customizer ----------
  initDragonTab() {
    const name = $('dragon-name');
    name.value = this.look.name;
    name.addEventListener('input', () => this.changeLook({ name: name.value.trim() || 'Dragon' }));

    const presets = $('presets');
    for (const p of PRESETS) {
      const b = document.createElement('button');
      b.className = 'preset';
      b.title = p.label;
      b.style.background = `linear-gradient(135deg, ${hex(p.body)} 0 50%, ${hex(p.wing)} 50% 100%)`;
      b.addEventListener('click', () => { const { label, ...c } = p; this.changeLook(c); this.syncDragonTab(); });
      presets.appendChild(b);
    }
    $('randomize').addEventListener('click', () => {
      const h = Math.random();
      const col = (hh, s, l) => parseInt(hslToHex(hh % 1, s, l).slice(1), 16);
      const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
      this.changeLook({
        body: col(h, 0.6, 0.45), belly: col(h + 0.08, 0.5, 0.78), accent: col(h + 0.5, 0.85, 0.55),
        wing: col(h + 0.33, 0.6, 0.45), eye: col(h + 0.15, 0.9, 0.7),
        horns: pick(LOOK_OPTIONS.horns), tail: pick(LOOK_OPTIONS.tail), wings: pick(LOOK_OPTIONS.wings), wingpairs: pick(LOOK_OPTIONS.wingpairs),
        spikes: pick(LOOK_OPTIONS.spikes), pattern: pick(LOOK_OPTIONS.pattern), snout: pick(LOOK_OPTIONS.snout),
      });
      this.syncDragonTab();
    });

    const colors = $('colors');
    this.colorInputs = {};
    for (const [key, label] of [['body', 'Body'], ['belly', 'Belly'], ['accent', 'Horns'], ['wing', 'Wings'], ['eye', 'Eyes']]) {
      const l = document.createElement('label');
      l.innerHTML = `<input type="color"><span>${label}</span>`;
      const input = l.querySelector('input');
      input.addEventListener('input', () => this.changeLook({ [key]: parseInt(input.value.slice(1), 16) }));
      colors.appendChild(l);
      this.colorInputs[key] = input;
    }

    const shapes = $('shapes');
    this.shapeButtons = {};
    const labels = { horns: 'Horns', tail: 'Tail', wings: 'Wings', wingpairs: 'Wing pairs', spikes: 'Spikes', pattern: 'Pattern', snout: 'Snout' };
    for (const [key, opts] of Object.entries(LOOK_OPTIONS)) {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<span>${labels[key]}</span><div class="seg"></div>`;
      const seg = row.querySelector('.seg');
      this.shapeButtons[key] = [];
      for (const o of opts) {
        const b = document.createElement('button');
        b.textContent = o;
        b.addEventListener('click', () => { this.changeLook({ [key]: o }); this.syncDragonTab(); });
        seg.appendChild(b);
        this.shapeButtons[key].push([o, b]);
      }
      shapes.appendChild(row);
    }
    $('look-glow').addEventListener('change', (e) => this.changeLook({ glow: e.target.checked }));
    this.syncDragonTab();
  }

  syncDragonTab() {
    const L = this.look;
    $('dragon-name').value = L.name;
    for (const [k, input] of Object.entries(this.colorInputs)) input.value = hex(L[k]);
    for (const [k, list] of Object.entries(this.shapeButtons)) for (const [o, b] of list) b.classList.toggle('on', L[k] === o);
    $('look-glow').checked = !!L.glow;
  }

  changeLook(partial) {
    Object.assign(this.look, partial);
    this.onLook(this.look);
  }

  // ---------- feedback ----------
  initFeedback() {
    let type = 'Idea';
    for (const b of document.querySelectorAll('#fb-type button')) {
      b.addEventListener('click', () => {
        type = b.dataset.v;
        for (const o of document.querySelectorAll('#fb-type button')) o.classList.toggle('on', o === b);
      });
    }
    const build = () => {
      const text = $('fb-text').value.trim();
      if (!text) { $('fb-status').textContent = 'Write something first!'; return null; }
      const first = text.split('\n')[0].slice(0, 70);
      return { title: `[${type}] ${first}`, body: `${text}\n\n---\n${this.feedbackContext()}` };
    };
    $('fb-send').addEventListener('click', () => {
      const f = build();
      if (!f) return;
      const url = `${REPO}/issues/new?title=${encodeURIComponent(f.title)}&body=${encodeURIComponent(f.body).slice(0, 6000)}`;
      window.open(url, '_blank', 'noopener');
      $('fb-status').textContent = 'Opened GitHub in a new tab. Press "Submit new issue" there.';
    });
    $('fb-copy').addEventListener('click', async () => {
      const f = build();
      if (!f) return;
      try { await navigator.clipboard.writeText(`${f.title}\n\n${f.body}`); $('fb-status').textContent = 'Copied! Paste it into a message.'; }
      catch { $('fb-text').select(); $('fb-status').textContent = 'Select all and copy the text above.'; }
    });
  }

  // ---------- HUD ----------
  setVitals(health, hunger) {
    this.fill(this.heartsEl, health, MAX_HEALTH);
    this.fill(this.hungerEl, hunger, MAX_HUNGER);
    this.heartsEl.classList.toggle('low', health <= 6);
  }

  fill(el, value, max) {
    const per = max / 10; // points per icon
    [...el.children].forEach((span, i) => {
      const f = Math.max(0, Math.min(1, (value - i * per) / per));
      span.firstChild.style.width = `${Math.ceil(f * 2) * 50}%`; // halves
    });
  }

  buildHotbar(state) {
    const bar = $('hotbar');
    bar.innerHTML = '';
    this.slotEls = [];
    for (let i = 0; i < 9; i++) {
      const el = document.createElement('div');
      el.className = 'slot';
      el.innerHTML = `<span class="num">${i + 1}</span>`;
      bar.appendChild(el);
      this.slotEls.push(el);
    }
    this.refreshHotbar(state);
  }

  refreshHotbar({ selected, blocks, food }) {
    this.slotEls.forEach((el, i) => {
      el.classList.toggle('sel', i === selected);
      el.querySelectorAll(':scope > :not(.num)').forEach((n) => n.remove());
      if (i === SLOT.FIRE) el.insertAdjacentHTML('beforeend', iconSvg(FLAME) + '<span class="icebadge" title="Right-click or G: ice breath">❄</span>');
      else if (i === SLOT.APPLE || i === SLOT.MEAT) {
        const key = i === SLOT.APPLE ? 'apple' : 'meat';
        el.insertAdjacentHTML('beforeend', iconSvg(key === 'apple' ? APPLE : DRUMSTICK('#c8702e')) + `<span class="cnt">${food[key]}</span>`);
        el.classList.toggle('empty', food[key] === 0);
      } else el.insertAdjacentHTML('beforeend', `<div class="sw" style="background:${swatchCss(blocks[i - SLOT.FIRST_BLOCK])}"></div>`);
    });
  }

  showItemName(text) {
    const el = $('itemname');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this._nameT);
    this._nameT = setTimeout(() => el.classList.remove('show'), 1400);
  }

  buildAbilities(list) {
    const box = $('abilities');
    box.innerHTML = '';
    this.abEls = list.map((a) => {
      const el = document.createElement('div');
      el.className = 'ab ready';
      el.title = a.name;
      el.innerHTML = `<kbd>${a.key}</kbd>${a.icon}<div class="cd"></div>`;
      box.appendChild(el);
      return { el, cd: el.querySelector('.cd'), last: -1 };
    });
  }

  // fractions: how much cooldown is left for each ability (0 = ready)
  setCooldowns(fractions) {
    fractions.forEach((f, i) => {
      const a = this.abEls[i];
      const q = Math.round(f * 50);
      if (a.last === q) return;
      a.last = q;
      a.cd.style.height = `${f * 100}%`;
      a.el.classList.toggle('ready', f <= 0);
    });
  }

  // boss health bar; pass null to hide it
  setBoss(info) {
    const el = $('bossbar');
    if (!info) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    $('bossname').textContent = info.name;
    $('bossfill').style.width = `${Math.max(0, Math.min(100, (info.hp / info.max) * 100))}%`;
  }

  toast(text) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('toasts').appendChild(t);
    setTimeout(() => t.remove(), 2700);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }

  flashHurt() {
    const h = $('hurt');
    h.classList.add('on');
    clearTimeout(this._hurtT);
    this._hurtT = setTimeout(() => h.classList.remove('on'), 120);
  }

  showDeath(title, text) { $('death-title').textContent = title; $('death-text').textContent = text; $('death').classList.remove('hidden'); }
  hideDeath() { $('death').classList.add('hidden'); }

  // ---------- block palette ----------
  openPalette(slotLabel, current, onPick, onClose) {
    this.paletteOpen = true;
    this.paletteClose = onClose;
    $('palette-hint').textContent = `Pick a block for slot ${slotLabel}.`;
    const grid = $('palette-grid');
    grid.innerHTML = '';
    for (const id of PALETTE) {
      const b = document.createElement('button');
      b.className = 'pal' + (id === current ? ' cur' : '');
      b.style.background = swatchCss(id);
      b.title = BLOCK_NAMES[id];
      b.addEventListener('click', () => {
        onPick(id);
        for (const o of grid.children) o.classList.toggle('cur', o === b);
      });
      grid.appendChild(b);
    }
    $('palette').classList.remove('hidden');
    $('palette-close').onclick = () => this.closePalette();
  }

  closePalette() {
    if (!this.paletteOpen) return;
    this.paletteOpen = false;
    $('palette').classList.add('hidden');
    if (this.paletteClose) this.paletteClose();
  }
}

function hslToHex(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
export { FOODS };
