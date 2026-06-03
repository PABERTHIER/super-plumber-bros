/* =========================================================================
 * SUPER PLUMBER BROS — vanilla JS platformer (no dependencies, no assets)
 * All sprites are drawn from pixel arrays at startup.
 * All sounds are synthesised with the WebAudio API.
 * ========================================================================= */
(() => {
'use strict';

// -----------------------------------------------------------------------
// CONSTANTS
// -----------------------------------------------------------------------
const TILE = 16;
const VW = 512, VH = 448;             // viewport size in pixels
const VW_T = VW / TILE;               // 32 cols
const VH_T = VH / TILE;               // 28 rows
const LEVEL_HEIGHT = 14;
const LEVEL_Y = VH - LEVEL_HEIGHT * TILE;
const GRAVITY = 0.45;
const MAX_FALL = 8;
const FRICTION = 0.85;
const ACCEL = 0.25;
const RUN_ACCEL = 0.4;
const MAX_WALK = 2.2;
const MAX_RUN = 3.6;
const JUMP_V = -8.2;
const JUMP_HOLD = -0.20;              // extra lift while holding jump
const JUMP_HOLD_FRAMES = 8;
const STOMP_BOUNCE = -5.1;
const STOMP_GRACE = 8;

// -----------------------------------------------------------------------
// CANVAS
// -----------------------------------------------------------------------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const hudScore = document.getElementById('hud-score');
const hudCoins = document.getElementById('hud-coins');
const hudWorld = document.getElementById('hud-world');
const hudLives = document.getElementById('hud-lives');

// -----------------------------------------------------------------------
// INPUT
// -----------------------------------------------------------------------
const keys = {};
const pressed = {};
const GAMEPLAY_CODES = new Set([
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
  'Space', 'ShiftLeft', 'ShiftRight',
  'KeyA', 'KeyD', 'KeyQ', 'KeyS', 'KeyW', 'KeyZ', 'KeyX', 'KeyP', 'KeyM'
]);
const GAMEPLAY_KEYS = new Set(['a', 'd', 'q', 's', 'w', 'z', 'x', 'p', 'm']);

function normalizedKey(e) {
  return e.key ? e.key.toLowerCase() : '';
}
function keyAliases(e) {
  const aliases = [];
  if (e.code) aliases.push(e.code);
  const key = normalizedKey(e);
  if (key) aliases.push('key:' + key);
  return aliases;
}
function setKeyState(e, value) {
  for (const alias of keyAliases(e)) {
    if (value && !keys[alias]) pressed[alias] = true;
    keys[alias] = value;
  }
}
function isGameplayKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  return GAMEPLAY_CODES.has(e.code) || GAMEPLAY_KEYS.has(normalizedKey(e));
}
function anyKey(...aliases) {
  return aliases.some(alias => keys[alias]);
}
function anyPressed(...aliases) {
  return aliases.some(alias => pressed[alias]);
}
function resetInput() {
  for (const k in keys) delete keys[k];
  for (const k in pressed) delete pressed[k];
}
window.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  setKeyState(e, true);
  if (isGameplayKey(e)) e.preventDefault();
});
window.addEventListener('keyup', e => {
  for (const alias of keyAliases(e)) keys[alias] = false;
});
window.addEventListener('blur', resetInput);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) resetInput();
});

const Input = {
  left()   { return anyKey('ArrowLeft', 'key:q', 'key:a', 'KeyQ', 'KeyA'); },
  right()  { return anyKey('ArrowRight', 'key:d', 'KeyD'); },
  jump()   { return anyKey('Space', 'ArrowUp', 'key:z', 'key:w', 'KeyZ', 'KeyW'); },
  jumpPressed() { return anyPressed('Space', 'ArrowUp', 'key:z', 'key:w', 'KeyZ', 'KeyW'); },
  run()    { return anyKey('ShiftLeft', 'ShiftRight', 'key:x', 'KeyX'); },
  down()   { return anyKey('ArrowDown', 'key:s', 'KeyS'); },
  pausePressed() { return anyPressed('key:p', 'KeyP'); },
  mutePressed()  { return anyPressed('key:m', 'KeyM'); },
  reset: resetInput,
  flush() { for (const k in pressed) delete pressed[k]; }
};

// -----------------------------------------------------------------------
// AUDIO — tiny chiptune synth
// -----------------------------------------------------------------------
const Audio = (() => {
  let ctxA = null, muted = false, warnedNoAudio = false;
  const ensure = () => {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      if (!warnedNoAudio) {
        console.warn('WebAudio is not available; sound effects are disabled.');
        warnedNoAudio = true;
      }
      return null;
    }
    if (!ctxA) ctxA = new AudioContextCtor();
    return ctxA;
  };
  const beep = (freq, dur, type = 'square', vol = 0.07) => {
    if (muted) return;
    const a = ensure();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g).connect(a.destination);
    const t = a.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  };
  const sweep = (f1, f2, dur, type = 'square', vol = 0.07) => {
    if (muted) return;
    const a = ensure();
    if (!a) return;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    g.gain.value = vol;
    o.connect(g).connect(a.destination);
    const t = a.currentTime;
    o.frequency.setValueAtTime(f1, t);
    o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  };
  return {
    jump:  () => sweep(420, 820, 0.13),
    coin:  () => { beep(987, 0.06, 'square', 0.08); setTimeout(()=>beep(1318,0.12,'square',0.08), 60); },
    stomp: () => sweep(220, 80, 0.12, 'square', 0.1),
    bump:  () => beep(160, 0.08, 'square', 0.08),
    powerup: () => { [523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'square',0.08), i*80)); },
    die:   () => { [440,392,330,262].forEach((f,i)=>setTimeout(()=>beep(f,0.18,'triangle',0.1), i*120)); },
    clear: () => { [523,659,784,1046,1318].forEach((f,i)=>setTimeout(()=>beep(f,0.1,'square',0.08), i*90)); },
    kick:  () => sweep(300, 120, 0.1, 'sawtooth', 0.07),
    toggle() { muted = !muted; return muted; }
  };
})();

// -----------------------------------------------------------------------
// SPRITES — pixel-art rendered to offscreen canvases.
// Each sprite is a string of single-character color codes. Codes map to
// the palette below. '.' / ' ' are transparent.
// -----------------------------------------------------------------------
const PAL = {
  '.': null,   ' ': null,
  K: '#000000',                // black outline
  W: '#ffffff',
  S: '#ffd1a8',                // skin
  R: '#d72b2b',                // red shirt / cap
  r: '#8a1414',                // dark red
  B: '#2050d0',                // overalls blue
  b: '#102060',                // dark blue
  Y: '#ffd633',                // yellow / coin
  y: '#a07a00',                // dark yellow
  G: '#5cba3a',                // green (pipes / koopa)
  g: '#1f5c1d',                // dark green
  N: '#7a4a1f',                // brown (goomba / dirt)
  n: '#3a2410',                // dark brown
  O: '#ff9a3c',                // orange (brick)
  o: '#a04a10',
  T: '#ffe1b8',                // tan (block face)
  t: '#c08040',
  L: '#a0e0ff',                // light blue
  P: '#ffaad5',                // pink
  C: '#10c0d0',                // cyan
  X: '#888888',                // grey
  x: '#444444'
};

function bakeSprite(rows, scale = 1) {
  const h = rows.length, w = rows[0].length;
  const c = document.createElement('canvas');
  c.width = w * scale; c.height = h * scale;
  const cx = c.getContext('2d');
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = PAL[ch];
      if (!col) continue;
      cx.fillStyle = col;
      cx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}
function flipH(src) {
  const c = document.createElement('canvas');
  c.width = src.width; c.height = src.height;
  const cx = c.getContext('2d');
  cx.translate(src.width, 0); cx.scale(-1, 1);
  cx.drawImage(src, 0, 0);
  return c;
}

// --- Player (16x16) -----------------------------------------------------
const PLR_STAND = [
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '..KSKKSSSSK.....',
  '...KSSSSSK......',
  '....KKKK........',
  '...KBBKBBKK.....',
  '..KBBBKBBBBK....',
  '.KSSBBKBBSSKK...',
  '.KSSBBBBBBSSK...',
  '.KSSBBBBBBSSK...',
  '..KKBBBBBBKK....',
  '...KKKK.KKKK....',
  '...nnn..nnn.....'
];
const PLR_WALK1 = [
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '..KSKKSSSSK.....',
  '...KSSSSSK......',
  '....KKKK........',
  '...KBBKBBKK.....',
  '..KBBBKBBBBK....',
  '.KSSBBKBBSSKK...',
  '..SSBBBBBBSSK...',
  '...SBBBBBBSK....',
  '...KBBBBBBKK....',
  '..KKKK..KKKK....',
  '..nnn....nnn....'
];
const PLR_WALK2 = [
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '..KSKKSSSSK.....',
  '...KSSSSSK......',
  '....KKKK........',
  '...KBBKBBK......',
  '..KBBBKBBBK.....',
  '.KSSBBKBBSSK....',
  '.KSSBBBBBBSSK...',
  '..KBBBBBBBBK....',
  '...KKBBBBKK.....',
  '....KKKKKK......',
  '....nnnnn.......'
];
const PLR_WALK3 = [
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '..KSKKSSSSK.....',
  '...KSSSSSK......',
  '....KKKK........',
  '...KBBKBBK......',
  '....BBBKBBBK....',
  '...SSBBKBBSSK...',
  '...SSBBBBBBSSK..',
  '....BBBBBBBSK...',
  '...KKBBBBBKK....',
  '...KKKK..KKKK...',
  '...nnn....nnn...'
];
const PLR_JUMP = [
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '..KSKKSSSSK.....',
  '...KSSSSSK......',
  '..KKKKKKK.......',
  '.KSSBBKBBKK.....',
  '.KSSBBKBBBBK....',
  '..KKBBKBBSSK....',
  '...KBBBBBBSK....',
  '..KBBBBBBBBK....',
  '.KKBBKK.KKBBKK..',
  'KSSKK....KKSSK..',
  '.KK........KK...'
];
const PLR_DUCK = [
  '................',
  '................',
  '....KKKKK.......',
  '...KRRRRRK......',
  '...RRRRRRR......',
  '..KSSKSKK.......',
  '..KSKSSSKKK.....',
  '...KSSSSSK......',
  '....KKKK........',
  '..KBBBKBBBK.....',
  '.KSSBBKBBSSK....',
  '.KSSBBBBBBSSK...',
  '..KBBBBBBBBK....',
  '..KKBBBBBBKK....',
  '...KKK..KKK.....',
  '...nnn..nnn.....'
];

// --- Enemies ------------------------------------------------------------
const GOOMBA1 = [
  '................',
  '....KKKKKK......',
  '...KNNNNNNK.....',
  '..KNNNNNNNNK....',
  '..KNNNNNNNNK....',
  '.KNWWNNNNWWNK...',
  '.KNWKNNNNKWNK...',
  '.KNWKNNNNKWNK...',
  '.KNNNNNNNNNNK...',
  '.KNNNKKKKNNNK...',
  '..KNKKNNKKNK....',
  '...KNNNNNNK.....',
  '....KK..KK......',
  '...KKK..KKK.....',
  '..KnnK..KnnK....',
  '..nnnn..nnnn....'
];
const GOOMBA2 = [
  '................',
  '....KKKKKK......',
  '...KNNNNNNK.....',
  '..KNNNNNNNNK....',
  '..KNNNNNNNNK....',
  '.KNWWNNNNWWNK...',
  '.KNWKNNNNKWNK...',
  '.KNWKNNNNKWNK...',
  '.KNNNNNNNNNNK...',
  '.KNNNKKKKNNNK...',
  '..KNKKNNKKNK....',
  '...KNNNNNNK.....',
  '....KKKKKK......',
  '...KnnnnnnK.....',
  '..KnnK..Knnn....',
  '..nnn....nnnn...'
];
const GOOMBA_FLAT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '....KKKKKK......',
  '...KNNNNNNK.....',
  '..KNWWNNWWNK....',
  '..KNWKNNKWNK....',
  '..KNNNNNNNNK....',
  '.KNNKKKKKKNNK...',
  '.KNKKNNNNKKNK...',
  '..KKKKKKKKKK....',
  '................'
];

// Koopa (turtle)
const KOOPA1 = [
  '................',
  '...KKKK.........',
  '..KGGGGK........',
  '.KGWWGGGK.......',
  '.KGWKGGGK.......',
  '.KGGGGGGK.......',
  '..KKKKKKK.......',
  '..ggGGGGGK......',
  '.gGGYYYYGGK.....',
  'gGGYYYYYYGGK....',
  'gGYYyyyyYYGK....',
  'gGYYyyyyYYGK....',
  '.gGYYYYYYGK.....',
  '..ggGGGGGK......',
  '...KSSKKSSK.....',
  '....KK..KK......'
];
const KOOPA2 = [
  '................',
  '...KKKK.........',
  '..KGGGGK........',
  '.KGWWGGGK.......',
  '.KGWKGGGK.......',
  '.KGGGGGGK.......',
  '..KKKKKKK.......',
  '..ggGGGGGK......',
  '.gGGYYYYGGK.....',
  'gGGYYYYYYGGK....',
  'gGYYyyyyYYGK....',
  'gGYYyyyyYYGK....',
  '.gGYYYYYYGK.....',
  '..ggGGGGGK......',
  '..KSS..SSKK.....',
  '..KK....KK......'
];
const KOOPA_SHELL = [
  '................',
  '................',
  '................',
  '..KKKKKKKK......',
  '.KGGGGGGGGK.....',
  'KGGYYYYYYGGK....',
  'KGYYyyyyYYGK....',
  'KGYyyKKyyYGK....',
  'KGYyyKKyyYGK....',
  'KGYYyyyyYYGK....',
  'KGGYYYYYYGGK....',
  '.KGGGGGGGGK.....',
  '..KKKKKKKK......',
  '................',
  '................',
  '................'
];

// --- Tiles --------------------------------------------------------------
const TILE_GROUND = [
  'OOOOOOOOOOOOOOOO',
  'OoooooOOOoOOoooO',
  'OoOOOoOoOoOoOOoO',
  'OoOOOoOoOoOoOOoO',
  'OoooooOoOOOoooOO',
  'OOOOOOOOOOOOOOOO',
  'OoooOOOoooOOOooO',
  'OoOOoOOoOOoOOoOO',
  'OoOOoOOoOOoOOoOO',
  'OoooOOOoooOOoooO',
  'OOOOOOOOOOOOOOOO',
  'OOoooOOOoooOOOoO',
  'OOoOOoOOoOOoOOoO',
  'OOoooOOOoooOOoOO',
  'OOOOOOOOOOOOOOoO',
  'OOOOOOOOOOOOOOOO'
];
const TILE_BRICK = [
  'KKKKKKKKKKKKKKKK',
  'KOOOOOOOKOOOOOOO',
  'KOOOOOOOKOOOOOOO',
  'KOOOOOOOKOOOOOOO',
  'KOOOOOOOKOOOOOOO',
  'KOOOOOOOKOOOOOOO',
  'KOOOOOOOKOOOOOOO',
  'KKKKKKKKKKKKKKKK',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KOOOKOOOOOOOOKOO',
  'KKKKKKKKKKKKKKKK'
];
const TILE_QUESTION1 = [
  'KKKKKKKKKKKKKKKK',
  'KYYYYYYYYYYYYYYK',
  'KYyyyyyyyyyyyyYK',
  'KYyyKKKKKKKKyyYK',
  'KYyKYYYYYYKKyyYK',
  'KYyKYYKKKKKKyyYK',
  'KYyKKKKKKYYKyyYK',
  'KYyyyyyyKYYKyyYK',
  'KYyyyyyKKYYKyyYK',
  'KYyyyyKYYYYKyyYK',
  'KYyyyyKYYYYKyyYK',
  'KYyyyyKKKKKyyyYK',
  'KYyyyyyyyyyyyyYK',
  'KYyyyyKKKKyyyyYK',
  'KYyyyyKKKKyyyyYK',
  'KKKKKKKKKKKKKKKK'
];
const TILE_QUESTION2 = [
  'KKKKKKKKKKKKKKKK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KyyyyyyyyyyyyyyK',
  'KKKKKKKKKKKKKKKK'
];
const TILE_HARD = [
  'KKKKKKKKKKKKKKKK',
  'KXXXXXXXXXXXXXxK',
  'KXXXXXXXXXXXXXxK',
  'KXXKKKKKKKKKKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKxxxxxxxxKxxK',
  'KXXKKKKKKKKKKxxK',
  'KXxxxxxxxxxxxxxK',
  'KKKKKKKKKKKKKKKK'
];
const TILE_PIPE_TL = [
  'KKKKKKKKKKKKKKKK',
  'KGGGGGGGGGGGGGGK',
  'KGgggggggggggggK',
  'KGgGGGGGGGGGGGgK',
  'KGgGGGGGGGGGGGgK',
  'KGgGGGGGGGGGGGgK',
  'KGgGGGGGGGGGGGgK',
  'KKKKKKKKKKKKKKKG',
  '.KGGGGGGGGGGGGGG',
  '.KGggggggggggggG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG'
];
const TILE_PIPE_TR = [
  'KKKKKKKKKKKKKKKK',
  'KGGGGGGGGGGGGGGK',
  'KgggggggggggggGK',
  'KgGGGGGGGGGGGGGK',
  'KgGGGGGGGGGGGGGK',
  'KgGGGGGGGGGGGGGK',
  'KgGGGGGGGGGGGGGK',
  'GKKKKKKKKKKKKKKK',
  'GGGGGGGGGGGGGGK.',
  'GggggggggggggGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.'
];
const TILE_PIPE_L = [
  '.KGGGGGGGGGGGGGG',
  '.KGggggggggggggG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG',
  '.KGgGGGGGGGGGGgG'
];
const TILE_PIPE_R = [
  'GGGGGGGGGGGGGGK.',
  'GggggggggggggGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.',
  'GgGGGGGGGGGGGGK.'
];

const COIN1 = [
  '................',
  '......KKK.......',
  '....KKYYYKK.....',
  '...KYYYyyYYK....',
  '..KYYyyyyyYYK...',
  '..KYyyKyyKyYK...',
  '..KYyyKyyKyYK...',
  '..KYyyKyyKyYK...',
  '..KYyyKyyKyYK...',
  '..KYyyKyyKyYK...',
  '..KYyyKyyKyYK...',
  '..KYYyyyyyYYK...',
  '...KYYYyyYYK....',
  '....KKYYYKK.....',
  '......KKK.......',
  '................'
];
const COIN2 = [
  '................',
  '......KKK.......',
  '......KYK.......',
  '......KYK.......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '.....KYyYK......',
  '......KYK.......',
  '......KYK.......',
  '......KKK.......',
  '................'
];

const FLAGPOLE = [
  '.......WW.......',
  '.......WW.......',
  '......KKKK......',
  '......XXXX......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......',
  '.......XX.......'
];
const FLAG = [
  '................',
  '....GGGGGGGG....',
  '....GGGGGGGGG...',
  '....GGGGGGGGGG..',
  '....GGGGGGGGG...',
  '....GGGGGGGG....',
  '....GGGGGGG.....',
  '....GGGGGG......',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '................'
];

const CLOUD = [
  '................',
  '....WWWW........',
  '...WWWWWWW......',
  '..WWWWWWWWW.WW..',
  '.WWWWWWWWWWWWW..',
  '..WWWWWWWWWWW...',
  '....WWWWWWW.....',
  '................'
];
const HILL = [
  '...........GGG..........',
  '..........GGGGG.........',
  '.........GGgggGG........',
  '........GGgggggGG.......',
  '.......GGgggggggGG......',
  '......GGgggggggggGG.....',
  '.....GGgggggggggggGG....',
  '....GGggggggGggggggGG...',
  '...GGgggggggGgggggggGG..',
  '..GGggggggggGggggggggGG.',
  '.GGgggggggggGgggggggggGG'
];
const BUSH = [
  '................',
  '................',
  '....GGG.....GG..',
  '...GGGGG..GGGGG.',
  '..GGGgggGGGgggGG',
  '.GGggggggggggggG',
  'GGgggggggggggggG',
  'GggggggggggggggG'
];

// Bake all sprites
const SPR = {
  plr: {
    stand: bakeSprite(PLR_STAND),
    walk1: bakeSprite(PLR_WALK1),
    walk2: bakeSprite(PLR_WALK2),
    walk3: bakeSprite(PLR_WALK3),
    jump:  bakeSprite(PLR_JUMP),
    duck:  bakeSprite(PLR_DUCK)
  },
  goomba1: bakeSprite(GOOMBA1),
  goomba2: bakeSprite(GOOMBA2),
  goombaFlat: bakeSprite(GOOMBA_FLAT),
  koopa1: bakeSprite(KOOPA1),
  koopa2: bakeSprite(KOOPA2),
  koopaShell: bakeSprite(KOOPA_SHELL),
  ground: bakeSprite(TILE_GROUND),
  brick: bakeSprite(TILE_BRICK),
  question1: bakeSprite(TILE_QUESTION1),
  question2: bakeSprite(TILE_QUESTION2),
  hard: bakeSprite(TILE_HARD),
  pipeTL: bakeSprite(TILE_PIPE_TL),
  pipeTR: bakeSprite(TILE_PIPE_TR),
  pipeL:  bakeSprite(TILE_PIPE_L),
  pipeR:  bakeSprite(TILE_PIPE_R),
  coin1: bakeSprite(COIN1),
  coin2: bakeSprite(COIN2),
  pole: bakeSprite(FLAGPOLE),
  flag: bakeSprite(FLAG),
  cloud: bakeSprite(CLOUD, 2),
  hill: bakeSprite(HILL, 2),
  bush: bakeSprite(BUSH)
};
SPR.plr.standL = flipH(SPR.plr.stand);
SPR.plr.walk1L = flipH(SPR.plr.walk1);
SPR.plr.walk2L = flipH(SPR.plr.walk2);
SPR.plr.walk3L = flipH(SPR.plr.walk3);
SPR.plr.jumpL  = flipH(SPR.plr.jump);
SPR.plr.duckL  = flipH(SPR.plr.duck);
SPR.koopa1L = flipH(SPR.koopa1);
SPR.koopa2L = flipH(SPR.koopa2);

// -----------------------------------------------------------------------
// LEVELS
// Char legend:
//  ' ' empty    '.' empty (visual)
//  '#' ground   'X' hard block (no break)
//  'B' brick (breakable when big; otherwise bumps)
//  '?' question with coin   '!' question (used)
//  'C' floating coin
//  'P'/'p'/'q'/'r' pipe parts (PP top, pp body)  -> internally we use pairs
//  'F' flag pole (top)   'f' flag pole body
//  '|' flag base
//  'G' goomba spawn   'K' koopa spawn
// -----------------------------------------------------------------------

// Levels are stored as arrays of strings, each string = 1 row, 14 rows tall.
// Width is variable; player scrolls horizontally.
function levelRows(width, draw) {
  const rows = Array.from({ length: LEVEL_HEIGHT }, () => Array(width).fill(' '));
  const put = (x, y, ch) => {
    if (x >= 0 && x < width && y >= 0 && y < LEVEL_HEIGHT) rows[y][x] = ch;
  };
  const api = {
    put,
    run(y, x0, x1, ch) {
      for (let x = Math.max(0, x0); x < Math.min(width, x1); x++) put(x, y, ch);
    },
    ground(x0, x1) {
      this.run(12, x0, x1, '#');
      this.run(13, x0, x1, '#');
    },
    platform(y, x0, x1, ch = 'B') {
      this.run(y, x0, x1, ch);
    },
    coins(y, x0, x1, step = 1) {
      for (let x = x0; x < x1; x += step) put(x, y, 'C');
    },
    pipe(x, topY = 9) {
      put(x, topY, 'P'); put(x + 1, topY, 'P');
      for (let y = topY + 1; y < 12; y++) {
        put(x, y, 'p'); put(x + 1, y, 'p');
      }
    },
    flag(x) {
      put(x, 8, 'F');
      for (let y = 9; y < LEVEL_HEIGHT; y++) put(x, y, 'f');
      put(x - 2, 11, '|');
      put(x - 2, 12, '|');
    }
  };
  draw(api);
  return rows.map(row => row.join(''));
}

const LEVEL_1_1 = [
  '                                                                                                                                                              ',
  '                                                                                                                                                              ',
  '                                                                                                                                                              ',
  '                                                                                                                                                              ',
  '                                                                                                                                                              ',
  '                                                                                                                                                              ',
  '                                  C                              C                                                                                            ',
  '                       ?BB?B                CCC                                                  C C                                  CC                      ',
  '                                                                                                                                                          F  ',
  '                                                                                                                                                          f  ',
  '                          G               G  G               PP        PP            G  K                                                               | f  ',
  '                                                              pp        pp                                                                              || f  ',
  '##############     ###############      ##################   pp   ###  pp     ###############     #######      ###################################    ###|f##',
  '##############     ###############      ##################   pp   ###  pp     ###############     #######      ###################################    ####f##',
];

const LEVEL_1_2 = [
  '                                                                                                                                                                  ',
  '                                                                                                                                                                  ',
  '                                                                                                                                                                  ',
  '                                                                                                                                                                  ',
  '                       BB?BB              CCCCCC               BBBBBBBB                                                                                          ',
  '                                                                                                                                                                  ',
  '                                                                                                                                                                  ',
  '                                          PP                          PP            X X                       BB?BB                                              ',
  '                                          pp     G                    pp           XXXXX                                                                          ',
  '            G                  K          pp     ?B?B   K             pp          XXXXXXX           G  G                       K            G       G        F   ',
  '                                          pp                          pp         XXXXXXXXX                                                                    f   ',
  '                                          pp                          pp        XXXXXXXXXXX                                                                || f   ',
  '############     ################      ###pp##################     ###pp###############################      ##########      ###############     ############f###',
  '############     ################      ###pp##################     ###pp###############################      ##########      ###############     #############f##',
];

const LEVEL_1_3 = [
  '                                                                                                                                                                       ',
  '                                                                                                                                                                       ',
  '                                                                                                                                                                       ',
  '                                                                                                                                                                       ',
  '                                                                                                                                                                       ',
  '              CCC          BBBBBBB?BBB              CCCCC                       BBBBB?BBBB              C C                                                            ',
  '                                                                                                                                                                       ',
  '                                                XX                                                                          XXX                                        ',
  '                                              XXXXX        K                                  K                            XXXXX                                       ',
  '                  G G                       XXXXXXXX                       G   G    G G                                  XXXXXXX        G  G  G  K              F      ',
  '                                          XXXXXXXXXX                                                                   XXXXXXXXXX                                f      ',
  '                                       XXXXXXXXXXXXX     PP                                            PP           XXXXXXXXXXXX                              | f      ',
  '##############     #####################XXXXXXXXXXXX     pp#############################################pp########XXXXXXXXXXXXXX###################     ##########f####',
  '##############     #####################XXXXXXXXXXXX     pp#############################################pp########XXXXXXXXXXXXXX###################     ###########f###',
];

const LEVEL_2_1 = levelRows(150, l => {
  l.ground(0, 29); l.ground(33, 59); l.ground(63, 91); l.ground(95, 123); l.ground(127, 150);
  l.platform(8, 18, 23, '?'); l.platform(7, 38, 45, 'B'); l.platform(6, 69, 76, 'B');
  l.platform(8, 101, 105, '?'); l.platform(9, 112, 118, 'X');
  l.coins(6, 16, 27, 2); l.coins(5, 67, 79, 2); l.coins(7, 100, 110, 2);
  l.pipe(49, 9); l.pipe(82, 8); l.pipe(133, 9);
  [20, 42, 72, 88, 107, 116, 138].forEach(x => l.put(x, 11, 'G'));
  [55, 119].forEach(x => l.put(x, 11, 'K'));
  l.flag(145);
});

const LEVEL_2_2 = levelRows(160, l => {
  l.ground(0, 25); l.ground(28, 50); l.ground(54, 77); l.ground(81, 106); l.ground(110, 133); l.ground(137, 160);
  l.platform(9, 17, 21, 'X'); l.platform(7, 35, 42, '?'); l.platform(6, 62, 70, 'B');
  l.platform(8, 88, 96, 'X'); l.platform(6, 116, 122, '?'); l.platform(9, 126, 131, 'B');
  l.coins(5, 34, 44, 2); l.coins(4, 61, 72, 2); l.coins(6, 115, 124, 2);
  l.pipe(45, 9); l.pipe(100, 8); l.pipe(141, 9);
  [18, 39, 64, 91, 117, 128, 146].forEach(x => l.put(x, 11, 'G'));
  [72, 103, 132].forEach(x => l.put(x, 11, 'K'));
  l.flag(156);
});

const LEVEL_2_3 = levelRows(170, l => {
  l.ground(0, 36); l.ground(40, 73); l.ground(77, 111); l.ground(115, 149); l.ground(153, 170);
  l.platform(8, 14, 20, 'B'); l.platform(6, 28, 33, '?'); l.platform(7, 53, 61, 'B');
  l.platform(5, 87, 96, '?'); l.platform(8, 119, 127, 'B'); l.platform(6, 139, 145, 'X');
  l.coins(5, 12, 22, 2); l.coins(4, 84, 99, 3); l.coins(7, 118, 130, 2);
  l.pipe(67, 8); l.pipe(105, 9); l.pipe(156, 8);
  [22, 31, 56, 89, 94, 123, 142, 158].forEach(x => l.put(x, 11, 'G'));
  [70, 109, 147].forEach(x => l.put(x, 11, 'K'));
  l.flag(166);
});

const LEVEL_3_1 = levelRows(165, l => {
  l.ground(0, 31); l.ground(35, 63); l.ground(67, 96); l.ground(100, 127); l.ground(131, 165);
  l.platform(2, 0, 165, 'X');
  l.platform(8, 18, 26, 'X'); l.platform(6, 42, 51, 'B'); l.platform(8, 72, 80, '?');
  l.platform(5, 103, 111, 'X'); l.platform(8, 119, 124, 'B'); l.platform(7, 143, 150, '?');
  l.coins(5, 43, 52, 2); l.coins(6, 72, 82, 2); l.coins(5, 143, 153, 2);
  l.pipe(57, 9); l.pipe(90, 8); l.pipe(135, 9);
  [20, 47, 75, 107, 122, 146, 152].forEach(x => l.put(x, 11, 'G'));
  [59, 92, 137].forEach(x => l.put(x, 11, 'K'));
  l.flag(161);
});

const LEVEL_3_2 = levelRows(175, l => {
  l.ground(0, 27); l.ground(31, 58); l.ground(63, 88); l.ground(92, 119); l.ground(124, 150); l.ground(154, 175);
  l.platform(8, 16, 21, '?'); l.platform(7, 39, 46, 'X'); l.platform(6, 69, 76, 'B');
  l.platform(8, 100, 107, '?'); l.platform(5, 132, 139, 'X'); l.platform(8, 144, 149, 'B');
  l.coins(5, 14, 24, 2); l.coins(4, 68, 79, 2); l.coins(6, 98, 110, 2); l.coins(4, 132, 141, 2);
  l.pipe(52, 8); l.pipe(83, 9); l.pipe(114, 8); l.pipe(158, 9);
  [18, 42, 72, 78, 103, 136, 146, 162].forEach(x => l.put(x, 11, 'G'));
  [54, 86, 116, 151].forEach(x => l.put(x, 11, 'K'));
  l.flag(171);
});

const LEVEL_3_3 = levelRows(168, l => {
  l.ground(0, 23); l.ground(28, 48); l.ground(53, 75); l.ground(80, 102); l.ground(107, 129); l.ground(134, 168);
  l.platform(9, 18, 26, 'X'); l.platform(7, 34, 43, 'B'); l.platform(5, 58, 68, '?');
  l.platform(8, 86, 96, 'X'); l.platform(6, 113, 123, 'B'); l.platform(8, 142, 151, '?');
  l.coins(6, 33, 45, 2); l.coins(3, 58, 70, 2); l.coins(5, 112, 125, 2); l.coins(6, 141, 153, 2);
  l.pipe(70, 9); l.pipe(124, 9); l.pipe(150, 8);
  [20, 38, 62, 90, 117, 146, 154].forEach(x => l.put(x, 11, 'G'));
  [72, 126].forEach(x => l.put(x, 11, 'K'));
  l.flag(164);
});

const LEVEL_4_1 = levelRows(190, l => {
  l.ground(0, 32); l.ground(36, 67); l.ground(71, 101); l.ground(106, 137); l.ground(142, 165); l.ground(169, 190);
  l.platform(8, 16, 24, '?'); l.platform(6, 42, 51, 'B'); l.platform(7, 78, 88, 'X');
  l.platform(5, 114, 124, '?'); l.platform(8, 131, 138, 'B'); l.platform(6, 154, 162, 'X');
  l.coins(5, 15, 27, 2); l.coins(4, 41, 53, 2); l.coins(5, 77, 90, 2); l.coins(3, 113, 126, 2); l.coins(5, 153, 164, 2);
  l.pipe(60, 8); l.pipe(95, 9); l.pipe(129, 8); l.pipe(173, 8);
  [20, 46, 81, 87, 118, 134, 157, 176, 182].forEach(x => l.put(x, 11, 'G'));
  [62, 97, 131, 166].forEach(x => l.put(x, 11, 'K'));
  l.flag(186);
});

const LEVELS = [
  { name: '1-1', data: LEVEL_1_1, biome: 'meadow', bg: '#6b8cff' },
  { name: '1-2', data: LEVEL_1_2, biome: 'meadow', bg: '#5878ff' },
  { name: '1-3', data: LEVEL_1_3, biome: 'twilight', bg: '#3050c0' },
  { name: '2-1', data: LEVEL_2_1, biome: 'desert' },
  { name: '2-2', data: LEVEL_2_2, biome: 'ice' },
  { name: '2-3', data: LEVEL_2_3, biome: 'forest' },
  { name: '3-1', data: LEVEL_3_1, biome: 'cave' },
  { name: '3-2', data: LEVEL_3_2, biome: 'volcano' },
  { name: '3-3', data: LEVEL_3_3, biome: 'sky' },
  { name: '4-1', data: LEVEL_4_1, biome: 'night' }
];

// -----------------------------------------------------------------------
// LEVEL OBJECT
// -----------------------------------------------------------------------
function buildLevel(def) {
  const rows = def.data;
  const w = Math.max(...rows.map(r => r.length));
  const h = rows.length;
  const tiles = [];
  const enemies = [];
  let flagX = -1;
  let spawnX = 2 * TILE, spawnY = 10 * TILE;

  for (let y = 0; y < h; y++) {
    const row = rows[y].padEnd(w, ' ');
    const trow = new Array(w).fill(0);
    for (let x = 0; x < w; x++) {
      const c = row[x];
      switch (c) {
        case '#': trow[x] = T_GROUND; break;
        case 'X': trow[x] = T_HARD; break;
        case 'B': trow[x] = T_BRICK; break;
        case '?': trow[x] = T_QUESTION; break;
        case 'C': trow[x] = T_COIN; break;
        case 'P':
          trow[x] = (row[x-1] === 'P') ? T_PIPE_TR : T_PIPE_TL;
          break;
        case 'p':
          trow[x] = (row[x-1] === 'p') ? T_PIPE_R : T_PIPE_L;
          break;
        case 'F': trow[x] = T_FLAGTOP; flagX = x; break;
        case 'f': trow[x] = T_FLAGPOLE; if (flagX < 0) flagX = x; break;
        case '|': trow[x] = T_FLAGBASE; break;
        case 'G': enemies.push({type:'goomba', x: x*TILE, y: y*TILE}); break;
        case 'K': enemies.push({type:'koopa',  x: x*TILE, y: y*TILE}); break;
      }
    }
    tiles.push(trow);
  }
  return {
    name: def.name, biome: def.biome || 'meadow', bg: def.bg, w, h, tiles, enemies,
    pixelW: w * TILE, pixelH: h * TILE,
    flagX: flagX >= 0 ? flagX * TILE : (w-3) * TILE,
    spawnX, spawnY
  };
}

// Tile type constants (non-zero are SOLID unless excluded below)
const T_EMPTY = 0;
const T_GROUND = 1;
const T_BRICK = 2;
const T_QUESTION = 3;
const T_QUESTION_USED = 4;
const T_HARD = 5;
const T_PIPE_TL = 6;
const T_PIPE_TR = 7;
const T_PIPE_L = 8;
const T_PIPE_R = 9;
const T_COIN = 10;        // not solid
const T_FLAGPOLE = 11;    // not solid
const T_FLAGTOP = 12;     // not solid
const T_FLAGBASE = 13;    // solid

const NON_SOLID = new Set([T_EMPTY, T_COIN, T_FLAGPOLE, T_FLAGTOP]);

function isSolid(t) { return !NON_SOLID.has(t); }

// -----------------------------------------------------------------------
// ENTITIES
// -----------------------------------------------------------------------
class Entity {
  constructor(x, y, w, h) {
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.vx = 0; this.vy = 0;
    this.onGround = false;
    this.dead = false;
    this.facing = 1; // 1 right, -1 left
    this.prevX = x; this.prevY = y; this.prevBottom = y + h;
  }
  get cx() { return this.x + this.w/2; }
  get cy() { return this.y + this.h/2; }
  get right() { return this.x + this.w; }
  get bottom() { return this.y + this.h; }
  intersects(o) {
    return this.x < o.right && this.right > o.x &&
           this.y < o.bottom && this.bottom > o.y;
  }
}

// ---- Player ------------------------------------------------------------
class Player extends Entity {
  constructor(x, y) {
    super(x, y, 14, 16);
    this.spriteOffsetX = -1;
    this.animTime = 0;
    this.jumpFrames = 0;
    this.invuln = 0;
    this.dying = false;
    this.dyingTime = 0;
    this.winning = false;
    this.winTime = 0;
    this.ducking = false;
  }
  update(level) {
    if (this.dying) {
      this.dyingTime++;
      if (this.dyingTime < 30) this.vy = -3;
      this.vy += GRAVITY;
      this.y += this.vy;
      return;
    }
    if (this.winning) {
      this.winTime++;
      // slide down then walk right
      if (this.winTime < 60) { this.y += 2; }
      else { this.x += 1.5; this.animTime++; }
      return;
    }

    const left = Input.left(), right = Input.right(), run = Input.run();
    const accel = run ? RUN_ACCEL : ACCEL;
    const maxV = run ? MAX_RUN : MAX_WALK;
    this.ducking = this.onGround && Input.down();

    if (!this.ducking) {
      if (left)  { this.vx -= accel; this.facing = -1; }
      if (right) { this.vx += accel; this.facing =  1; }
    }
    if ((!left && !right) || this.ducking) this.vx *= FRICTION;
    if (Math.abs(this.vx) < 0.05) this.vx = 0;
    this.vx = Math.max(-maxV, Math.min(maxV, this.vx));

    if (Input.jumpPressed() && this.onGround) {
      this.vy = JUMP_V;
      this.onGround = false;
      this.jumpFrames = JUMP_HOLD_FRAMES;
      Audio.jump();
    }
    if (Input.jump() && this.jumpFrames > 0 && this.vy < 0) {
      this.vy += JUMP_HOLD;
      this.jumpFrames--;
    } else {
      this.jumpFrames = 0;
    }

    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    moveAndCollide(this, level, true);

    if (this.invuln > 0) this.invuln--;
    if (this.onGround && Math.abs(this.vx) > 0.1) this.animTime++;
  }
  draw(camX) {
    if (this.invuln > 0 && (this.invuln >> 1) & 1) return;
    let img;
    const S = SPR.plr;
    if (this.winning || (!this.onGround && !this.dying)) {
      img = this.facing > 0 ? S.jump : S.jumpL;
    } else if (this.ducking) {
      img = this.facing > 0 ? S.duck : S.duckL;
    } else if (Math.abs(this.vx) > 0.1) {
      const f = Math.floor(this.animTime / 5) % 3;
      const set = [S.walk1, S.walk2, S.walk3];
      const setL = [S.walk1L, S.walk2L, S.walk3L];
      img = this.facing > 0 ? set[f] : setL[f];
    } else {
      img = this.facing > 0 ? S.stand : S.standL;
    }
    ctx.drawImage(img, Math.round(this.x - camX + this.spriteOffsetX), Math.round(this.y + LEVEL_Y));
  }
}

// ---- Goomba ------------------------------------------------------------
class Goomba extends Entity {
  constructor(x, y) {
    super(x, y, 14, 14);
    this.vx = -0.6;
    this.animTime = 0;
    this.flat = false;
    this.flatTime = 0;
  }
  update(level) {
    if (this.flat) {
      this.flatTime++;
      if (this.flatTime > 30) this.dead = true;
      return;
    }
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    const wasOnGround = this.onGround;
    moveAndCollide(this, level, false);
    if (this.hitWallX) this.vx = -this.vx;
    this.animTime++;
  }
  stomp() { this.flat = true; this.vx = 0; }
  draw(camX) {
    let img;
    if (this.flat) img = SPR.goombaFlat;
    else img = (Math.floor(this.animTime / 12) & 1) ? SPR.goomba2 : SPR.goomba1;
    ctx.drawImage(img, Math.round(this.x - camX - 1), Math.round(this.y + LEVEL_Y - 2));
  }
}

// ---- Koopa -------------------------------------------------------------
class Koopa extends Entity {
  constructor(x, y) {
    super(x, y, 14, 16);
    this.vx = -0.5;
    this.shell = false;
    this.shellMoving = false;
    this.shellCooldown = 0;
    this.animTime = 0;
  }
  update(level) {
    if (this.shellCooldown > 0) this.shellCooldown--;
    this.vy = Math.min(MAX_FALL, this.vy + GRAVITY);
    moveAndCollide(this, level, false);
    if (this.hitWallX) this.vx = -this.vx;
    this.animTime++;
  }
  stomp() {
    if (!this.shell) {
      this.shell = true; this.shellMoving = false; this.shellCooldown = 10; this.vx = 0; this.h = 14;
    } else if (!this.shellMoving) {
      // kicked elsewhere
    }
  }
  kick(dir) {
    this.shellMoving = true;
    this.vx = 4 * dir;
    Audio.kick();
  }
  draw(camX) {
    let img;
    if (this.shell) img = SPR.koopaShell;
    else {
      const f = Math.floor(this.animTime / 10) & 1;
      img = this.facing > 0
        ? (f ? SPR.koopa2 : SPR.koopa1)
        : (f ? SPR.koopa2L : SPR.koopa1L);
      // koopa walks based on vx direction
      img = (this.vx >= 0)
        ? (f ? SPR.koopa2 : SPR.koopa1)
        : (f ? SPR.koopa2L : SPR.koopa1L);
    }
    ctx.drawImage(img, Math.round(this.x - camX - 1), Math.round(this.y + LEVEL_Y));
  }
}

// ---- Floating coin (from question block) ------------------------------
class FloatingCoin {
  constructor(x, y) { this.x = x; this.y = y; this.vy = -4; this.t = 0; this.dead = false; }
  update() { this.vy += 0.25; this.y += this.vy; this.t++; if (this.t > 28) this.dead = true; }
  draw(camX) {
    const img = (this.t >> 1) & 1 ? SPR.coin1 : SPR.coin2;
    ctx.drawImage(img, Math.round(this.x - camX), Math.round(this.y + LEVEL_Y));
  }
}

// ---- Score popup -------------------------------------------------------
class Popup {
  constructor(x, y, text, color = '#fff') {
    this.x = x; this.y = y; this.text = text; this.color = color; this.t = 0; this.dead = false;
  }
  update() { this.y -= 0.7; this.t++; if (this.t > 40) this.dead = true; }
  draw(camX) {
    ctx.fillStyle = '#000';
    ctx.font = 'bold 10px "Courier New", monospace';
    ctx.fillText(this.text, this.x - camX + 1, this.y + LEVEL_Y + 1);
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, this.x - camX, this.y + LEVEL_Y);
  }
}

// -----------------------------------------------------------------------
// COLLISION (axis-separated, tile based)
// -----------------------------------------------------------------------
function moveAndCollide(e, level, isPlayer) {
  e.prevX = e.x;
  e.prevY = e.y;
  e.prevBottom = e.bottom;
  e.hitWallX = false;
  // X axis
  e.x += e.vx;
  let bounds = tileBounds(e, level);
  for (let ty = bounds.y0; ty <= bounds.y1; ty++) {
    for (let tx = bounds.x0; tx <= bounds.x1; tx++) {
      const t = level.tiles[ty]?.[tx] ?? 0;
      if (!isSolid(t)) continue;
      const tx0 = tx*TILE, ty0 = ty*TILE;
      if (e.x < tx0 + TILE && e.right > tx0 &&
          e.y < ty0 + TILE && e.bottom > ty0) {
        if (e.vx > 0) e.x = tx0 - e.w;
        else if (e.vx < 0) e.x = tx0 + TILE;
        e.vx = 0;
        e.hitWallX = true;
      }
    }
  }
  if (e.x < 0) { e.x = 0; e.vx = 0; e.hitWallX = true; }
  if (e.x + e.w > level.pixelW) { e.x = level.pixelW - e.w; e.vx = 0; e.hitWallX = true; }

  // Y axis
  e.y += e.vy;
  e.onGround = false;
  bounds = tileBounds(e, level);
  for (let ty = bounds.y0; ty <= bounds.y1; ty++) {
    for (let tx = bounds.x0; tx <= bounds.x1; tx++) {
      const t = level.tiles[ty]?.[tx] ?? 0;
      if (!isSolid(t)) continue;
      const tx0 = tx*TILE, ty0 = ty*TILE;
      if (e.x < tx0 + TILE && e.right > tx0 &&
          e.y < ty0 + TILE && e.bottom > ty0) {
        if (e.vy > 0) {
          e.y = ty0 - e.h;
          e.onGround = true;
          e.vy = 0;
        } else if (e.vy < 0) {
          e.y = ty0 + TILE;
          e.vy = 0;
          if (isPlayer) onHeadBump(tx, ty, level);
        }
      }
    }
  }
}
function tileBounds(e, level) {
  return {
    x0: Math.max(0, Math.floor(e.x / TILE)),
    x1: Math.min(level.w - 1, Math.floor((e.right - 0.001) / TILE)),
    y0: Math.max(0, Math.floor(e.y / TILE)),
    y1: Math.min(level.h - 1, Math.floor((e.bottom - 0.001) / TILE))
  };
}

// -----------------------------------------------------------------------
// HEAD BUMP — break bricks, coin from ?
// -----------------------------------------------------------------------
function onHeadBump(tx, ty, level) {
  const t = level.tiles[ty][tx];
  if (t === T_QUESTION) {
    level.tiles[ty][tx] = T_QUESTION_USED;
    state.entities.push(new FloatingCoin(tx * TILE, ty * TILE - TILE));
    state.entities.push(new Popup(tx*TILE, ty*TILE - 4, '+200', '#ffcc33'));
    state.coins++;
    state.score += 200;
    Audio.coin();
    updateHud();
  } else if (t === T_BRICK) {
    level.tiles[ty][tx] = T_EMPTY;
    state.entities.push(new Popup(tx*TILE, ty*TILE - 4, '+50', '#fff'));
    state.score += 50;
    Audio.bump();
    updateHud();
  } else {
    Audio.bump();
  }
}

// -----------------------------------------------------------------------
// DRAW HELPERS
// -----------------------------------------------------------------------
function drawTile(t, px, py) {
  switch (t) {
    case T_GROUND:    ctx.drawImage(SPR.ground, px, py); break;
    case T_BRICK:     ctx.drawImage(SPR.brick, px, py); break;
    case T_QUESTION:  ctx.drawImage((state.frame & 16) ? SPR.question1 : SPR.question1, px, py); break;
    case T_QUESTION_USED: ctx.drawImage(SPR.question2, px, py); break;
    case T_HARD:      ctx.drawImage(SPR.hard, px, py); break;
    case T_PIPE_TL:   ctx.drawImage(SPR.pipeTL, px, py); break;
    case T_PIPE_TR:   ctx.drawImage(SPR.pipeTR, px, py); break;
    case T_PIPE_L:    ctx.drawImage(SPR.pipeL, px, py); break;
    case T_PIPE_R:    ctx.drawImage(SPR.pipeR, px, py); break;
    case T_COIN: {
      const img = (state.frame >> 3) & 1 ? SPR.coin2 : SPR.coin1;
      ctx.drawImage(img, px, py); break;
    }
    case T_FLAGPOLE:  ctx.drawImage(SPR.pole, px, py); break;
    case T_FLAGTOP:   ctx.drawImage(SPR.pole, px, py); ctx.drawImage(SPR.flag, px - 8, py); break;
    case T_FLAGBASE:  ctx.drawImage(SPR.hard, px, py); break;
  }
}

const THEMES = {
  meadow:  { skyTop: '#6b8cff', skyBottom: '#b9e6ff', sun: '#ffe066', cloud: '#ffffff', hillFar: '#5fbf55', hillNear: '#2e8d3c', deco: '#60c96b' },
  twilight:{ skyTop: '#263875', skyBottom: '#f08a66', sun: '#ffd166', cloud: '#ffd0aa', hillFar: '#4b5b86', hillNear: '#2f4669', deco: '#4f9a5c', stars: true },
  desert:  { skyTop: '#ffb85c', skyBottom: '#ffe0a3', sun: '#fff0a6', cloud: '#fff3d8', hillFar: '#d59a45', hillNear: '#b9772f', deco: '#e6b25b' },
  ice:     { skyTop: '#bdefff', skyBottom: '#eefcff', sun: '#ffffff', cloud: '#f8ffff', hillFar: '#8ed7ef', hillNear: '#5fb8d6', deco: '#d7fbff' },
  forest:  { skyTop: '#4f8f68', skyBottom: '#a7d98b', sun: '#ffe066', cloud: '#e8ffe0', hillFar: '#367a4a', hillNear: '#215c35', deco: '#6cc04a' },
  cave:    { skyTop: '#171225', skyBottom: '#302642', cloud: null, hillFar: '#45385c', hillNear: '#292038', deco: '#6f65a8', ceiling: '#0f0b18', stars: true },
  volcano: { skyTop: '#3a1720', skyBottom: '#c84b31', sun: '#ff9b43', cloud: '#6b2a2a', hillFar: '#5d2330', hillNear: '#2a1620', deco: '#ff7a1a', embers: true },
  sky:     { skyTop: '#54b8ff', skyBottom: '#dff7ff', sun: '#fff4a8', cloud: '#ffffff', hillFar: '#95ddff', hillNear: '#65bfe8', deco: '#ffffff' },
  night:   { skyTop: '#101936', skyBottom: '#243d73', sun: '#f6f3c9', cloud: '#aeb9dc', hillFar: '#25385f', hillNear: '#172747', deco: '#8ec6ff', stars: true }
};

function wrapParallax(i, spacing, camX, rate, level, margin) {
  const span = level.pixelW + margin * 2;
  return ((i * spacing - camX * rate) % span + span) % span - margin;
}
function drawOrb(theme) {
  if (!theme.sun) return;
  ctx.fillStyle = theme.sun;
  ctx.beginPath();
  ctx.arc(VW - 74, 62, theme.stars ? 22 : 28, 0, Math.PI * 2);
  ctx.fill();
}
function drawStars(camX, color = '#ffffff') {
  ctx.fillStyle = color;
  for (let i = 0; i < 36; i++) {
    const x = (i * 73 - camX * 0.08) % (VW + 80);
    const y = 18 + ((i * 37) % 130);
    ctx.fillRect((x + VW + 80) % (VW + 80) - 40, y, (i % 5) ? 1 : 2, 1);
  }
}
function drawCloudShape(x, y, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x + 14, y + 10, 10, 0, Math.PI * 2);
  ctx.arc(x + 28, y + 8, 14, 0, Math.PI * 2);
  ctx.arc(x + 45, y + 12, 11, 0, Math.PI * 2);
  ctx.fillRect(x + 10, y + 10, 44, 13);
  ctx.fill();
}
function drawMounds(camX, level, color, rate, baseY, height, spacing, width) {
  ctx.fillStyle = color;
  for (let i = 0; i < 8; i++) {
    const x = wrapParallax(i, spacing, camX, rate, level, width);
    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.quadraticCurveTo(x + width / 2, baseY - height - (i % 3) * 12, x + width, baseY);
    ctx.lineTo(x + width, VH);
    ctx.lineTo(x, VH);
    ctx.fill();
  }
}
function drawEmbers(camX) {
  ctx.fillStyle = '#ffd166';
  for (let i = 0; i < 18; i++) {
    const x = (i * 97 - camX * 0.2 + state.frame * 0.4) % (VW + 80);
    const y = 50 + ((i * 43 + state.frame) % 190);
    ctx.fillRect((x + VW + 80) % (VW + 80) - 40, y, 2, 2);
  }
}
function drawBackground(camX, level) {
  const theme = THEMES[level.biome] || THEMES.meadow;
  const sky = ctx.createLinearGradient(0, 0, 0, VH);
  sky.addColorStop(0, theme.skyTop || level.bg || '#6b8cff');
  sky.addColorStop(1, theme.skyBottom || level.bg || '#b9e6ff');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, VW, VH);

  if (theme.stars) drawStars(camX);
  drawOrb(theme);

  if (theme.ceiling) {
    ctx.fillStyle = theme.ceiling;
    ctx.fillRect(0, 0, VW, 26);
    for (let i = 0; i < 18; i++) {
      const x = wrapParallax(i, 48, camX, 0.18, level, 40);
      ctx.fillRect(x, 20, 14 + (i % 4) * 5, 8 + (i % 5) * 5);
    }
  }

  if (theme.cloud) {
    for (let i = 0; i < 7; i++) {
      const x = wrapParallax(i, 180, camX, 0.24, level, 90);
      drawCloudShape(x, 36 + (i % 3) * 26, theme.cloud);
    }
  }

  drawMounds(camX, level, theme.hillFar, 0.35, VH - 90, 70, 180, 160);
  drawMounds(camX, level, theme.hillNear, 0.55, VH - 42, 54, 130, 120);

  ctx.fillStyle = theme.deco;
  for (let i = 0; i < 12; i++) {
    const x = wrapParallax(i, 96, camX, 0.72, level, 60);
    ctx.fillRect(x | 0, VH - 26 - (i % 2) * 6, 18 + (i % 3) * 8, 8);
  }
  if (theme.embers) drawEmbers(camX);
}
function drawLevel(level, camX) {
  const x0 = Math.max(0, Math.floor(camX / TILE));
  const x1 = Math.min(level.w - 1, Math.ceil((camX + VW) / TILE));
  for (let y = 0; y < level.h; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = level.tiles[y][x];
      if (t) drawTile(t, x*TILE - camX, y*TILE + LEVEL_Y);
    }
  }
}

// -----------------------------------------------------------------------
// GAME STATE
// -----------------------------------------------------------------------
const state = {
  level: null,
  levelIndex: 0,
  player: null,
  entities: [],
  camX: 0,
  frame: 0,
  score: 0,
  coins: 0,
  lives: 3,
  paused: false,
  running: false,
  transition: 0,    // >0 = blocking transition (level clear/death)
  transitionType: ''
};

function updateHud() {
  hudScore.textContent = 'SCORE ' + state.score.toString().padStart(6, '0');
  hudCoins.textContent = 'x ' + state.coins.toString().padStart(2, '0');
  hudWorld.textContent = 'WORLD ' + (state.level?.name || '1-1');
  hudLives.textContent = 'LIVES ' + state.lives;
}

function loadLevel(i) {
  state.levelIndex = i;
  state.level = buildLevel(LEVELS[i]);
  state.entities = [];
  state.camX = 0;
  state.player = new Player(state.level.spawnX, state.level.spawnY);
  for (const e of state.level.enemies) {
    if (e.type === 'goomba') state.entities.push(new Goomba(e.x, e.y));
    if (e.type === 'koopa')  state.entities.push(new Koopa(e.x, e.y));
  }
  updateHud();
}

function startGame() {
  Input.reset();
  state.paused = false;
  state.transition = 0;
  state.transitionType = '';
  state.score = 0;
  state.coins = 0;
  state.lives = 3;
  loadLevel(0);
  state.running = true;
  overlay.querySelector('h1').textContent = 'SUPER PLUMBER BROS';
  startBtn.textContent = 'PRESS START';
  overlay.classList.add('hidden');
}

function loseLife() {
  state.lives--;
  Audio.die();
  state.player.dying = true;
  state.player.dyingTime = 0;
  state.transition = 120;
  state.transitionType = 'die';
}

function levelClear() {
  Audio.clear();
  state.score += 1000;
  state.player.winning = true;
  state.transition = 150;
  state.transitionType = 'clear';
}

// -----------------------------------------------------------------------
// COLLISION: player vs entities
// -----------------------------------------------------------------------
function isStomp(p, e) {
  return p.prevBottom <= e.y + STOMP_GRACE &&
         p.bottom >= e.y &&
         p.cy < e.cy + 6 &&
         p.vy >= -0.5;
}
function bounceAfterStomp(p) {
  p.vy = STOMP_BOUNCE;
  p.onGround = false;
  p.jumpFrames = 0;
}
function addScore(points, e, color = '#fff') {
  state.score += points;
  state.entities.push(new Popup(e.x, e.y, '+' + points, color));
  updateHud();
}
function handleEntityCollisions() {
  const p = state.player;
  if (p.dying || p.winning) return;
  for (const e of state.entities) {
    if (e.dead) continue;
    if (e instanceof Goomba) {
      if (!p.intersects(e)) continue;
      if (e.flat) continue;
      if (isStomp(p, e)) {
        e.stomp();
        bounceAfterStomp(p);
        addScore(100, e);
        Audio.stomp();
      } else if (p.invuln <= 0) {
        loseLife(); return;
      }
    } else if (e instanceof Koopa) {
      if (!p.intersects(e)) continue;
      const stomped = isStomp(p, e);
      if (e.shell && e.shellMoving && stomped) {
        e.shellMoving = false;
        e.shellCooldown = 10;
        e.vx = 0;
        bounceAfterStomp(p);
        addScore(100, e);
        Audio.stomp();
      } else if (e.shell && !e.shellMoving) {
        if (e.shellCooldown > 0) continue;
        const dir = p.cx < e.cx ? 1 : -1;
        e.kick(dir);
        p.invuln = Math.max(p.invuln, 10);
        if (stomped) bounceAfterStomp(p);
        addScore(400, e, '#ffe066');
      } else if (!e.shell && stomped) {
        e.stomp();
        bounceAfterStomp(p);
        addScore(200, e, '#ffe066');
        Audio.stomp();
      } else if (p.invuln <= 0) {
        loseLife(); return;
      }
    }
  }

  // shell vs goomba
  for (const e of state.entities) {
    if (!(e instanceof Koopa) || !e.shellMoving) continue;
    for (const o of state.entities) {
      if (o === e || o.dead) continue;
      if (o instanceof Goomba && !o.flat && e.intersects(o)) {
        o.stomp(); state.score += 100;
        state.entities.push(new Popup(o.x, o.y, '+100', '#fff'));
        updateHud();
      } else if (o instanceof Koopa && o !== e && !o.shellMoving && e.intersects(o)) {
        o.dead = true; state.score += 200;
        state.entities.push(new Popup(o.x, o.y, '+200', '#ffe066'));
        updateHud();
      }
    }
  }

  // coin tile pickup
  const tx0 = Math.floor(p.x / TILE), tx1 = Math.floor(p.right / TILE);
  const ty0 = Math.floor(p.y / TILE), ty1 = Math.floor(p.bottom / TILE);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (state.level.tiles[ty]?.[tx] === T_COIN) {
        state.level.tiles[ty][tx] = T_EMPTY;
        state.coins++;
        state.score += 100;
        state.entities.push(new Popup(tx*TILE, ty*TILE - 4, '+100', '#ffcc33'));
        Audio.coin();
        updateHud();
      }
    }
  }

  // flag check — touch flagpole
  const fx = state.level.flagX;
  if (!p.winning && p.right > fx && p.x < fx + TILE) {
    levelClear();
  }

  // fall in pit
  if (p.y > state.level.pixelH + 20 && !p.dying) {
    loseLife();
  }
}

// -----------------------------------------------------------------------
// MAIN LOOP
// -----------------------------------------------------------------------
function update() {
  state.frame++;
  if (Input.pausePressed()) state.paused = !state.paused;
  if (Input.mutePressed()) Audio.toggle();
  if (state.paused) { Input.flush(); return; }

  state.player.update(state.level);

  for (const e of state.entities) {
    if (e.update) e.update(state.level);
  }

  handleEntityCollisions();

  state.entities = state.entities.filter(e => !e.dead && (e.x === undefined || e.y < state.level.pixelH + 80));

  // camera follows player, never goes back
  const target = state.player.x - VW * 0.4;
  if (target > state.camX) state.camX = target;
  state.camX = Math.max(0, Math.min(state.level.pixelW - VW, state.camX));

  if (state.transition > 0) {
    state.transition--;
    if (state.transition === 0) {
      if (state.transitionType === 'die') {
        if (state.lives <= 0) {
          // Game over
          state.running = false;
          overlay.classList.remove('hidden');
          overlay.querySelector('h1').textContent = 'GAME OVER';
          startBtn.textContent = 'RETRY';
        } else {
          loadLevel(state.levelIndex);
        }
      } else if (state.transitionType === 'clear') {
        if (state.levelIndex + 1 < LEVELS.length) {
          loadLevel(state.levelIndex + 1);
        } else {
          state.running = false;
          overlay.classList.remove('hidden');
          overlay.querySelector('h1').textContent = 'YOU WIN! 🏆';
          startBtn.textContent = 'PLAY AGAIN';
        }
      }
    }
  }
  Input.flush();
}

function draw() {
  drawBackground(state.camX, state.level);
  drawLevel(state.level, state.camX);
  for (const e of state.entities) e.draw && e.draw(state.camX);
  state.player.draw(state.camX);
  if (state.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(0,0,VW,VH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 28px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VW/2, VH/2);
    ctx.textAlign = 'start';
  }
}

function loop() {
  if (state.running) { update(); draw(); }
  requestAnimationFrame(loop);
}

// -----------------------------------------------------------------------
// START
// -----------------------------------------------------------------------
startBtn.addEventListener('click', () => {
  startGame();
  // unlock audio context on user gesture
  Audio.jump();
});
window.addEventListener('keydown', e => {
  if (!state.running && (e.code === 'Enter' || e.code === 'Space')) {
    startBtn.click();
  }
});

// idle preview frame so canvas isn't blank behind overlay
ctx.fillStyle = '#6b8cff';
ctx.fillRect(0, 0, VW, VH);

requestAnimationFrame(loop);

})();
