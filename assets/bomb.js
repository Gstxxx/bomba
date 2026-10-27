/* =====================================================================
   BOMBA · C4 tático — game logic, Web Audio, explosion FX, layout, hooks
   ===================================================================== */
(() => {
'use strict';

const TOTAL = 60000;            // 1 minute, wall-clock based
const ARM_MS = 1450;            // arming sequence length (<= 2 s)
const ROBOT_CODE_MS = 200;      // robot: one code every 200 ms -> 256 codes in 51 s
const ROBOT_KEY_MS = 36;        // robot: gap between the 4 key presses of a code
const KEY_ORDER = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'];
const SUBS = { 1: '', 2: 'ABC', 3: 'DEF', 4: 'GHI', 5: 'JKL', 6: 'MNO', 7: 'PQRS', 8: 'TUV', 9: 'WXYZ', 0: '+', DEL: '*', OK: '#' };

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const app = $('#app'), scene = $('#scene'), stageWrap = $('#stageWrap'), stage = $('#stage'), device = $('#device');
const hud = $('#hud'), hudMid = $('#hudMid'), robotBtn = $('#robotBtn'), muteBtn = $('#muteBtn'), muteIco = $('#muteIco');
const tw = $('#tw'), tLit = $('#tLit'), lcd = $('#lcd'), lcdWin = $('#lcdWin'), lA = $('#lA'), lB = $('#lB');
const ledArm = $('#ledArm'), ledSafe = $('#ledSafe'), armSw = $('#armSw'), modeSw = $('#modeSw'), keypad = $('#keypad');
const wiresEl = $('#wires');
const notes = $('#notes'), npScroll = $('#npScroll'), npLog = $('#npLog'), npMeta = $('#npMeta'), npIntro = $('#npIntro'), npEmpty = $('#npEmpty');
const npTitle = $('.np-title');
const npTable = $('#npTable'), npTableSec = $('#npTableSec'), npHardSec = $('#npHardSec'), npBack = $('#npBack'), npHint = $('#npHint');
const endEl = $('#end'), endCard = $('#endCard'), replayBtn = $('#replayBtn'), endModeBtn = $('#endMode'), endRobotBtn = $('#endRobot');
const glow = $('#glow'), flashEl = $('#flash'), live = $('#live');
const cellEls = $$('#lCode .c').map(el => ({ el, t: el.querySelector('.t') }));
const keyEls = {};
let tableCells = [];

/* ---------------- storage (must survive throwing storage) ---------------- */
const store = {
  get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
};

const rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let reduced = !!(rmq && rmq.matches);

/* ---------------- timers that reset() can cancel ---------------- */
const pending = new Set();
function later(ms, fn) { const id = setTimeout(() => { pending.delete(id); fn(); }, ms); pending.add(id); return id; }
function cancelLater() { pending.forEach(clearTimeout); pending.clear(); }

const two = n => String(n).padStart(2, '0');
const rnd = (a, b) => a + Math.random() * (b - a);

function vibrate(p) {
  try {
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(p);
  } catch (e) { /* ignore */ }
}
function say(msg) { live.textContent = ''; setTimeout(() => { live.textContent = msg; }, 30); }

/* =====================================================================
   Procedural textures (SVG turbulence -> data URIs, rasterised once)
   ===================================================================== */
function svgURL(w, h, body) {
  return 'url("data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`) + '")';
}
function setTextures() {
  const R = document.documentElement.style;
  R.setProperty('--tx-grain', svgURL(160, 160,
    `<filter id="f" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="4" stitchTiles="stitch"/>
     <feColorMatrix type="matrix" values=".5 0 0 0 .25  .5 0 0 0 .25  .5 0 0 0 .25  0 0 0 0 1"/></filter><rect width="160" height="160" filter="url(#f)"/>`));
  R.setProperty('--tx-concrete', svgURL(460, 460,
    `<filter id="c" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency=".62" numOctaves="4" seed="11" stitchTiles="stitch" result="n"/>
      <feDiffuseLighting in="n" surfaceScale="2.3" diffuseConstant="1.08" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="56"/></feDiffuseLighting>
      <feTurbulence type="fractalNoise" baseFrequency=".028" numOctaves="3" seed="5" stitchTiles="stitch" result="m"/>
      <feColorMatrix in="m" type="matrix" values=".7 0 0 0 .58  .7 0 0 0 .57  .7 0 0 0 .55  0 0 0 0 1" result="mm"/>
      <feComposite in="d" in2="mm" operator="arithmetic" k1="1" k2="0" k3="0" k4="0"/>
    </filter><rect width="460" height="460" filter="url(#c)"/>`));
  R.setProperty('--tx-specks', svgURL(300, 300,
    `<filter id="s" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="1" seed="21" stitchTiles="stitch" result="a"/>
      <feColorMatrix in="a" type="matrix" values="0 0 0 0 .08  0 0 0 0 .07  0 0 0 0 .05  -12 0 0 0 3.5" result="dk"/>
      <feTurbulence type="fractalNoise" baseFrequency=".75" numOctaves="1" seed="37" stitchTiles="stitch" result="b"/>
      <feColorMatrix in="b" type="matrix" values="0 0 0 0 .92  0 0 0 0 .9  0 0 0 0 .85  12 0 0 0 -8.7" result="lt"/>
      <feMerge><feMergeNode in="dk"/><feMergeNode in="lt"/></feMerge>
    </filter><rect width="300" height="300" filter="url(#s)" opacity=".32"/>`));
  // C-4 wrapper: gentle wrinkles + sharp plastic highlights on the crease faces
  R.setProperty('--tx-film', svgURL(420, 150,
    `<filter id="w" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".0055 .026" numOctaves="2" seed="8"/>
      <feDiffuseLighting surfaceScale="2.6" lighting-color="#fff"><feDistantLight azimuth="235" elevation="30"/></feDiffuseLighting></filter><rect width="420" height="150" filter="url(#w)"/>`));
  R.setProperty('--tx-spec', svgURL(420, 150,
    `<filter id="w" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".0055 .026" numOctaves="3" seed="8"/>
      <feSpecularLighting surfaceScale="4.5" specularConstant="1.1" specularExponent="42" lighting-color="#fffbea"><feDistantLight azimuth="235" elevation="34"/></feSpecularLighting>
      <feComponentTransfer><feFuncA type="linear" slope=".42"/></feComponentTransfer></filter><rect width="420" height="150" filter="url(#w)"/>`));
  R.setProperty('--tx-tape', svgURL(200, 200,
    `<filter id="t" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".06 .35" numOctaves="2" seed="6" stitchTiles="stitch"/>
      <feDiffuseLighting surfaceScale="1.6" lighting-color="#fff"><feDistantLight azimuth="235" elevation="30"/></feDiffuseLighting></filter><rect width="200" height="200" filter="url(#t)"/>`));
  R.setProperty('--tx-paper', svgURL(260, 260,
    `<filter id="p" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".04 .7" numOctaves="2" seed="3" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values=".22 0 0 0 .84  .22 0 0 0 .82  .22 0 0 0 .78  0 0 0 0 1"/></filter><rect width="260" height="260" filter="url(#p)"/>`));
  R.setProperty('--tx-wear', svgURL(240, 240,
    `<filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".07" numOctaves="4" seed="2" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  5.5 0 0 0 -1.75"/></filter><rect width="240" height="240" filter="url(#m)"/>`));
  // lighter wear: worn stencil paint, mostly intact, a few chips and a speckled grain
  R.setProperty('--tx-wear-lt', svgURL(240, 240,
    `<filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".11" numOctaves="4" seed="9" stitchTiles="stitch"/>
      <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  4.2 0 0 0 -.95"/></filter><rect width="240" height="240" filter="url(#m)"/>`));
}

/* =====================================================================
   Static DOM builders
   ===================================================================== */
function buildKeys() {
  KEY_ORDER.forEach((k, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key' + (k === 'DEL' ? ' fn del' : k === 'OK' ? ' fn ok' : '');
    b.dataset.k = k;
    b.style.gridRow = String(((i / 3) | 0) + 1);
    b.style.gridColumn = String((i % 3) + 1);
    b.setAttribute('aria-label', k === 'DEL' ? 'Apagar o último dígito' : k === 'OK' ? 'Confirmar o código' : 'Dígito ' + k);
    b.innerHTML = `<span class="kf"><b>${k === 'DEL' ? 'APAGA' : k}</b><small>${SUBS[k]}</small></span>`;
    keypad.appendChild(b);
    keyEls[k] = b;
  });
  [['t56', ''], ['t789', 'só 1–4'], ['t0', '']].forEach(([c, txt]) => {
    const t = document.createElement('div');
    t.className = 'tape ' + c;
    t.setAttribute('aria-hidden', 'true');
    if (txt) t.innerHTML = `<span>${txt}</span>`;
    keypad.appendChild(t);
  });
}

function buildWires() {
  const C = {
    red: ['#4f0905', '#cf2316', '#ff9b8a'], wht: ['#5b5a55', '#dcdad2', '#ffffff'],
    blu: ['#0a1a47', '#2352c2', '#a9c3ff'], yel: ['#584203', '#dcae16', '#fff0a0'],
  };
  const wire = (d, c) =>
    `<path d="${d}" stroke="rgba(0,0,0,.18)" stroke-width="10" transform="translate(4 8)"/>` +
    `<path d="${d}" stroke="rgba(0,0,0,.30)" stroke-width="6.5" transform="translate(2 4)"/>` +
    `<path d="${d}" stroke="${c[0]}" stroke-width="5.8"/>` +
    `<path d="${d}" stroke="${c[1]}" stroke-width="4.2"/>` +
    `<path d="${d}" stroke="${c[2]}" stroke-width="1.3" stroke-opacity=".8" transform="translate(-.8 -1)"/>`;
  const grom = (x, y) =>
    `<circle cx="${x}" cy="${y}" r="6.5" fill="#0b0b0b"/><circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#303233" stroke-width="2"/>` +
    `<circle cx="${x - 1.6}" cy="${y - 2}" r="1.8" fill="rgba(255,255,255,.16)"/>`;
  const P = [
    ['M91,64 C 86,82 112,86 132,92', C.red], ['M95,64 C 104,78 138,80 150,92', C.wht],
    ['M265,64 C 256,78 222,80 210,92', C.blu], ['M269,64 C 274,82 248,86 228,92', C.yel],
  ];
  const Lw = [
    ['M134,22 C 162,17 191,36 200,58', C.red], ['M134,28 C 156,47 209,40 218,58', C.wht],
    ['M558,22 C 530,17 501,36 492,58', C.blu], ['M558,28 C 536,47 483,40 474,58', C.yel],
  ];
  wiresEl.innerHTML =
    `<g class="wP">${[132, 150, 210, 228].map(x => grom(x, 92)).join('')}${P.map(([d, c]) => wire(d, c)).join('')}</g>` +
    `<g class="wL">${[200, 218, 474, 492].map(x => grom(x, 58)).join('')}${Lw.map(([d, c]) => wire(d, c)).join('')}</g>`;
}

function buildTable() {
  const pairs = [];
  for (let a = 1; a <= 4; a++) for (let b = 1; b <= 4; b++) pairs.push('' + a + b);
  const frag = document.createDocumentFragment();
  const mk = (cls, txt) => { const d = document.createElement('div'); d.className = cls; if (txt) d.textContent = txt; frag.appendChild(d); return d; };
  mk('hd', '');
  pairs.forEach(p => mk('hd', p));
  tableCells = [];
  pairs.forEach(r => {
    mk('hd', r);
    pairs.forEach(c => { const d = mk('cl'); d.title = r + c; tableCells.push(d); });
  });
  npTable.appendChild(frag);
}

/* =====================================================================
   Audio — everything synthesised with Web Audio
   ===================================================================== */
const Sfx = (() => {
  const MASTER = 0.95;
  let ctx = null, out = null, dry = null, master = null, muffle = null, noise = null, brown = null, shaper = null;
  let longNodes = [], tailNodes = [], boomBus = null;
  let muted = store.get('bomba.mute') === '1';

  // soft limiter: transparent below 0.8, rounds anything hotter off below full scale
  function limiterCurve() {
    const n = 4096, c = new Float32Array(n), K = 0.8;
    for (let i = 0; i < n; i++) {
      const y = ((i / (n - 1)) * 2 - 1) * 2, a = Math.abs(y);   // pre-gain 0.5: curve input x stands for 2x
      c[i] = Math.sign(y) * (a < K ? a : K + (1 - K) * Math.tanh((a - K) / (1 - K)));
    }
    return c;
  }
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { try { ctx = new AC(); } catch (e2) { ctx = null; return null; } }
      // sources -> out -> muffle (shell shock) -> compressor -> limiter -> master (mute) -> speakers
      //            dry ----------------------^ (tinnitus rings "inside your head", never muffled)
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
      out = ctx.createGain(); dry = ctx.createGain(); master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      muffle = ctx.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 20000; muffle.Q.value = 0.5;
      out.connect(muffle); muffle.connect(comp); dry.connect(comp);
      try {
        const pre = ctx.createGain(); pre.gain.value = 0.5;
        const lim = ctx.createWaveShaper(); lim.curve = limiterCurve();
        comp.connect(pre); pre.connect(lim); lim.connect(master);
      } catch (e) { comp.connect(master); }
      master.connect(ctx.destination);
      const sr = ctx.sampleRate;
      noise = ctx.createBuffer(1, sr * 2, sr);
      const nd = noise.getChannelData(0);
      for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
      brown = ctx.createBuffer(1, sr * 3, sr);
      const bd = brown.getChannelData(0);
      let l = 0;
      for (let i = 0; i < bd.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; bd[i] = l * 3.5; }
      const n = 1024, cv = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; cv[i] = Math.tanh(x * 2.4) / Math.tanh(2.4); }
      shaper = cv;
      try { // iOS unlock: a silent one-sample buffer inside the gesture
        const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, sr); s.connect(ctx.destination); s.start(0);
      } catch (e) { /* ignore */ }
    }
    if (ctx.state !== 'running') {
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
    return ctx;
  }
  const on = () => (muted ? null : ensure());
  const now = () => ctx.currentTime + 0.004;

  function env(g, t0, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    if (hold > 0) g.gain.setValueAtTime(peak, t0 + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + hold + rel);
    return t0 + a + hold + rel;
  }
  function osc(type, f, t0, a, peak, hold, rel, o) {
    o = o || {};
    const s = ctx.createOscillator();
    s.type = type;
    s.frequency.setValueAtTime(f, t0);
    if (o.f2) s.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || (a + hold + rel)));
    const g = ctx.createGain();
    const end = env(g, t0, a, peak, hold, rel);
    let n = s;
    if (o.lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = o.lp; fl.Q.value = o.q || 0.7; n.connect(fl); n = fl; }
    n.connect(g); g.connect(o.dest || out);
    s.start(t0); s.stop(end + 0.03);
    return s;
  }
  function nz(t0, a, peak, hold, rel, ft, f, q, o) {
    o = o || {};
    const s = ctx.createBufferSource();
    s.buffer = o.buf || noise; s.loop = true;
    const fl = ctx.createBiquadFilter();
    fl.type = ft; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t0 + (o.glide || (a + hold + rel)));
    const g = ctx.createGain();
    const end = env(g, t0, a, peak, hold, rel);
    s.connect(fl); fl.connect(g); g.connect(o.dest || out);
    s.start(t0, Math.random() * 1.5); s.stop(end + 0.03);
    return s;
  }
  function stopLong() {
    if (!ctx) return;
    longNodes.forEach(n => { try { n.stop(ctx.currentTime + 0.01); } catch (e) { /* already stopped */ } });
    longNodes = [];
  }

  return {
    ensure,
    get muted() { return muted; },
    setMuted(m, delay) {
      muted = !!m;
      store.set('bomba.mute', muted ? '1' : '0');
      if (ctx && master) {
        const t = ctx.currentTime + (delay || 0);
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
        master.gain.setTargetAtTime(muted ? 0 : MASTER, t, 0.012);
      }
      if (muted) stopLong();
    },
    stopLong,
    /* reset: fade out what is left of a blast and give the player their hearing back */
    calm() {
      if (!ctx) return;
      const t = ctx.currentTime;
      if (boomBus) {
        try { boomBus.gain.cancelScheduledValues(t); boomBus.gain.setValueAtTime(boomBus.gain.value, t); boomBus.gain.linearRampToValueAtTime(0.0001, t + 0.22); } catch (e) { /* ignore */ }
        boomBus = null;
      }
      tailNodes.forEach(n => { try { n.stop(t + 0.05); } catch (e) { /* ignore */ } });
      tailNodes = [];
      try {
        const f = muffle.frequency;
        f.cancelScheduledValues(t); f.setValueAtTime(Math.max(200, f.value), t); f.exponentialRampToValueAtTime(20000, t + 0.3);
      } catch (e) { /* ignore */ }
    },
    /* crisp keypad beep (~2.65 kHz, ~60 ms) + rubber-dome click */
    key(soft) {
      if (!on()) return; const t = now();
      if (soft) { osc('square', 2700, t, 0.002, 0.028, 0.01, 0.012, { lp: 5000 }); return; }
      osc('square', 2650, t, 0.002, 0.068, 0.04, 0.018, { lp: 5600 });
      osc('sine', 5300, t, 0.001, 0.011, 0.02, 0.02);
      nz(t, 0.001, 0.09, 0.002, 0.012, 'bandpass', 4200, 1.2);
      nz(t, 0.001, 0.07, 0, 0.03, 'lowpass', 900, 0.8);
    },
    /* generic control beep */
    ui(f) {
      if (!on()) return; const t = now();
      osc('square', f || 2300, t, 0.002, 0.056, 0.035, 0.018, { lp: 5200 });
      nz(t, 0.001, 0.068, 0.002, 0.012, 'bandpass', 3200, 1.1);
    },
    /* countdown beep: 2.0 kHz, 2.5 kHz in the last 10 s, 3.0 kHz in the last 3 s; heartbeat under the urgent ones */
    tick(level, beat) {
      if (!on()) return; const t = now();
      const f = [2000, 2500, 3000][level] || 2000, hold = [0.085, 0.05, 0.032][level] || 0.085;
      osc('sine', f, t, 0.002, 0.19, hold, 0.03);
      osc('square', f, t, 0.002, 0.026, hold, 0.03, { lp: 4800 });
      osc('sine', f * 2, t, 0.002, 0.018, hold * 0.6, 0.02);
      if (beat) { // sub-bass "lub-dub"
        osc('sine', 62, t, 0.008, 0.34, 0.03, 0.09, { f2: 45, glide: 0.12 });
        osc('sine', 58, t + 0.17, 0.008, 0.26, 0.03, 0.1, { f2: 42, glide: 0.13 });
      }
    },
    longTone(sec) {
      if (!on()) return; stopLong(); const t = now(); const d = Math.max(0.1, sec);
      longNodes = [
        osc('square', 2950, t, 0.004, 0.06, d, 0.04, { lp: 5200, f2: 3500, glide: d }),
        osc('sine', 2950, t, 0.004, 0.17, d, 0.04, { f2: 3500, glide: d }),
      ];
    },
    buzz() {
      if (!on()) return; const t = now();
      for (let i = 0; i < 2; i++) {
        const tt = t + i * 0.16;
        osc('sawtooth', 150, tt, 0.004, 0.17, 0.1, 0.03, { lp: 1600 });
        osc('square', 157, tt, 0.004, 0.1, 0.1, 0.03, { lp: 1200 });
      }
    },
    blip() { if (!on()) return; const t = now(); osc('square', 430, t, 0.002, 0.035, 0.02, 0.02, { lp: 1500 }); },
    denied() {
      if (!on()) return; const t = now();
      osc('square', 540, t, 0.002, 0.06, 0.05, 0.02, { lp: 2400 });
      osc('square', 400, t + 0.09, 0.002, 0.06, 0.06, 0.02, { lp: 2400 });
    },
    chime() {
      if (!on()) return; const t = now() + 0.06;
      [1046.5, 1318.5, 1568, 2093].forEach((f, i) => {
        osc('triangle', f, t + i * 0.085, 0.004, 0.2, 0.02, 0.65);
        osc('sine', f * 2, t + i * 0.085, 0.004, 0.04, 0.01, 0.3);
      });
      osc('sine', 523.25, t + 0.34, 0.03, 0.11, 0.2, 0.9);
    },
    relay() {
      if (!on()) return; const t = now();
      nz(t, 0.001, 0.3, 0.004, 0.02, 'highpass', 2500, 0.7);
      osc('sine', 190, t, 0.002, 0.24, 0.01, 0.06, { f2: 90 });
      osc('sine', 1200, t + 0.5, 0.004, 0.06, 0.08, 0.4, { f2: 260, glide: 0.45 }); // power-down sweep
    },
    /* relay pulling in at the end of the arming sequence */
    clack() {
      if (!on()) return; const t = now();
      nz(t, 0.001, 0.32, 0.004, 0.018, 'bandpass', 1600, 1.5);
      osc('triangle', 110, t, 0.002, 0.26, 0.01, 0.05, { f2: 60 });
    },
    /* charge-up whine under the 88:88 self-test */
    whine(d) {
      if (!on()) return; const t = now();
      d = Math.max(0.4, d || 0.75);
      osc('sine', 320, t, 0.18, 0.03, d - 0.3, 0.12, { f2: 5000, glide: d });
    },
    cover() {
      if (!on()) return; const t = now();
      nz(t, 0.001, 0.25, 0.005, 0.03, 'bandpass', 1800, 1.4);
      osc('square', 900, t, 0.001, 0.035, 0.004, 0.015, { lp: 3000 });
      osc('square', 2350, t, 0.002, 0.056, 0.035, 0.016, { lp: 5000 }); // control beep
    },
    toggle() {
      if (!on()) return; const t = now();
      nz(t, 0.001, 0.35, 0.003, 0.018, 'highpass', 3500, 0.8);
      osc('sine', 260, t, 0.001, 0.26, 0.004, 0.05, { f2: 120 });
    },
    armBeep(i) { if (!on()) return; const t = now(); osc('square', [1500, 1900, 2400][i] || 2000, t, 0.002, 0.08, 0.07, 0.02, { lp: 5000 }); },
    armed() {
      if (!on()) return; const t = now() + 0.05;
      osc('square', 2600, t, 0.002, 0.09, 0.09, 0.02, { lp: 5200 });
      osc('square', 2000, t + 0.13, 0.002, 0.09, 0.14, 0.03, { lp: 5200 });
    },
    explosion(rm) {
      if (!on()) return; const t = now();
      const bus = ctx.createGain(); bus.gain.value = 0.95; bus.connect(out); boomBus = bus;
      const ws = ctx.createWaveShaper(); ws.curve = shaper; ws.oversample = '2x'; ws.connect(bus);
      nz(t, 0.001, 1.0, 0.012, 0.13, 'highpass', 900, 0.6, { dest: bus });                       // crack
      nz(t, 0.004, 1.0, 0.06, 2.7, 'lowpass', 5200, 0.9, { dest: ws, f2: 150, glide: 2.3 });        // roar
      osc('sine', 125, t, 0.006, 1.2, 0.05, 1.05, { f2: 30, glide: 0.8, dest: ws });               // thump
      osc('triangle', 62, t, 0.01, 0.55, 0.1, 1.7, { f2: 24, glide: 1.5, dest: bus });              // sub
      nz(t + 0.02, 0.06, 0.9, 0.35, 3.5, 'lowpass', 170, 0.7, { buf: brown, dest: bus });          // rumble
      for (let i = 0; i < (rm ? 12 : 28); i++) {                                                   // debris
        const tt = t + 0.12 + Math.pow(Math.random(), 1.6) * 1.9;
        const v = 0.34 * (1 - (tt - t) / 2.3);
        if (v > 0.02) nz(tt, 0.001, v, 0.001, 0.01 + Math.random() * 0.035, 'bandpass', 1200 + Math.random() * 4500, 1.5, { dest: bus });
      }
      // ringing ears, then shell shock: the whole mix goes dull and hearing slowly comes back
      tailNodes.push(osc('sine', 3950, t + 0.2, 0.5, rm ? 0.012 : 0.028, 0.7, 2.2, { dest: dry }));
      try {
        const f = muffle.frequency;
        f.cancelScheduledValues(t);
        f.setValueAtTime(20000, t); f.setValueAtTime(20000, t + 0.12);
        f.exponentialRampToValueAtTime(650, t + 0.3); f.setValueAtTime(650, t + 0.9);
        f.exponentialRampToValueAtTime(20000, t + 3.4);
      } catch (e) { /* ignore */ }
    },
    stamp() { if (!on()) return; const t = now(); osc('sine', 140, t, 0.002, 0.5, 0.01, 0.12, { f2: 60 }); nz(t, 0.001, 0.32, 0.005, 0.07, 'lowpass', 900, 0.7); },
    thud() { if (!on()) return; const t = now(); osc('sine', 95, t, 0.003, 0.45, 0.02, 0.18, { f2: 48 }); nz(t, 0.002, 0.2, 0.01, 0.1, 'lowpass', 500, 0.7); },
    tapeRip() {
      if (!on()) return; const t = now();
      for (let i = 0; i < 3; i++) nz(t + i * 0.07, 0.01, 0.18, 0.12, 0.05, 'bandpass', 900, 0.9, { f2: 3600, glide: 0.18 });
    },
    tapeSlap() {
      if (!on()) return; const t = now();
      for (let i = 0; i < 3; i++) {
        const tt = t + 0.12 + i * 0.08;
        nz(tt, 0.001, 0.24, 0.01, 0.06, 'lowpass', 1400, 0.8);
        osc('sine', 160, tt, 0.002, 0.16, 0.005, 0.07, { f2: 80 });
      }
    },
    paper() { if (!on()) return; const t = now(); nz(t, 0.02, 0.1, 0.08, 0.1, 'bandpass', 2600, 0.6, { f2: 1600 }); },
    pop() { // two party poppers
      if (!on()) return; const t = now();
      [0, 0.07].forEach((d, i) => {
        nz(t + d, 0.001, 0.4, 0.004, 0.05, 'bandpass', i ? 1700 : 1300, 0.9);
        osc('sine', i ? 420 : 340, t + d, 0.001, 0.2, 0.005, 0.06, { f2: 120 });
        nz(t + d + 0.03, 0.02, 0.07, 0.15, 0.25, 'highpass', 5000, 0.5); // paper shower hiss
      });
    },
    slide() {
      if (!on()) return; const t = now();
      nz(t, 0.005, 0.14, 0.05, 0.03, 'bandpass', 1500, 2, { f2: 2600, glide: 0.08 });
      osc('square', 2250, t, 0.002, 0.056, 0.03, 0.015, { lp: 5000 });
    },
  };
})();

/* =====================================================================
   Explosion particles (canvas 2D, time based, cached sprites).
   Soft stuff (fire, smoke, dust, light) renders at half resolution on
   #fx; sharp stuff (sparks, debris, embers) at device resolution on #fxs.
   ===================================================================== */
const FX = (() => {
  const cv = $('#fx'), cs = $('#fxs'), av = $('#after');
  let g = null, gs = null, ag = null, W = 0, H = 0, raf = 0, P = [], t0 = 0, last = 0, cx = 0, cy = 0, U = 1, spr = null, red = false;

  function size() {
    const dpr = Math.min(1.75, window.devicePixelRatio || 1), soft = 0.5;
    W = window.innerWidth; H = window.innerHeight;
    const setC = (c, k) => { c.width = Math.ceil(W * k); c.height = Math.ceil(H * k); c.style.width = W + 'px'; c.style.height = H + 'px'; const x = c.getContext('2d'); x.setTransform(k, 0, 0, k, 0, 0); x._k = k; return x; };
    g = setC(cv, soft); gs = setC(cs, dpr); ag = setC(av, dpr);
  }
  function radial(sz, stops) {
    const c = document.createElement('canvas'); c.width = c.height = sz;
    const x = c.getContext('2d'); const gr = x.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    x.fillStyle = gr; x.fillRect(0, 0, sz, sz);
    return c;
  }
  // a cluster of soft blobs -> turbulent, non-uniform puff
  function puff(sz, cols, n, spread, additive) {
    const c = document.createElement('canvas'); c.width = c.height = sz;
    const x = c.getContext('2d');
    if (additive) x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * 6.283, r = Math.pow(Math.random(), 0.7) * sz * spread;
      const px = sz / 2 + Math.cos(ang) * r, py = sz / 2 + Math.sin(ang) * r, rr = sz * rnd(0.1, 0.27);
      const col = cols[Math.min(cols.length - 1, Math.floor((r / (sz * spread)) * cols.length))];
      const gr = x.createRadialGradient(px, py, 0, px, py, rr);
      gr.addColorStop(0, col); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, rr, 0, 6.283); x.fill();
    }
    return c;
  }
  // smoke billow lit from the top-left: each lump has a lighter top and a darker underside
  function billow(sz, base, n) {
    const c = document.createElement('canvas'); c.width = c.height = sz;
    const x = c.getContext('2d');
    const [r, gg, b] = base;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * 6.283, d = Math.pow(Math.random(), 0.65) * sz * 0.24;
      const px = sz / 2 + Math.cos(ang) * d, py = sz / 2 + Math.sin(ang) * d, rr = sz * rnd(0.11, 0.25);
      const gr = x.createRadialGradient(px - rr * 0.35, py - rr * 0.4, rr * 0.05, px, py, rr);
      const L = rnd(1.15, 1.6), D = rnd(0.55, 0.8);
      gr.addColorStop(0, `rgba(${Math.min(255, r * L) | 0},${Math.min(255, gg * L) | 0},${Math.min(255, b * L) | 0},.26)`);
      gr.addColorStop(0.55, `rgba(${r},${gg},${b},.22)`);
      gr.addColorStop(0.85, `rgba(${(r * D) | 0},${(gg * D) | 0},${(b * D) | 0},.14)`);
      gr.addColorStop(1, `rgba(${(r * D) | 0},${(gg * D) | 0},${(b * D) | 0},0)`);
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, rr, 0, 6.283); x.fill();
    }
    return c;
  }
  function sprites() {
    if (spr) return;
    const hotC = ['rgba(255,255,240,.55)', 'rgba(255,240,190,.5)', 'rgba(255,214,120,.45)'];
    const fireC = ['rgba(255,226,150,.5)', 'rgba(255,170,70,.45)', 'rgba(240,110,30,.4)', 'rgba(200,60,15,.35)'];
    const deepC = ['rgba(255,160,70,.46)', 'rgba(230,95,25,.42)', 'rgba(170,48,12,.38)', 'rgba(105,24,6,.32)'];
    spr = {
      hot: radial(128, [[0, 'rgba(255,255,248,1)'], [0.22, 'rgba(255,244,200,.95)'], [0.5, 'rgba(255,190,90,.55)'], [0.78, 'rgba(255,110,30,.18)'], [1, 'rgba(255,80,0,0)']]),
      glow: radial(128, [[0, 'rgba(255,150,60,.75)'], [0.4, 'rgba(220,80,20,.4)'], [1, 'rgba(120,30,5,0)']]),
      fHot: [0, 1].map(() => puff(128, hotC, 18, 0.24, true)),
      fire: [0, 1, 2].map(() => puff(128, fireC, 22, 0.26, true)),
      deep: [0, 1, 2].map(() => puff(128, deepC, 22, 0.27, true)),
      smoke: [[58, 52, 46], [74, 67, 59], [40, 36, 32], [92, 84, 74]].map(c => billow(128, c, 30)),
      dust: [[150, 133, 112], [128, 114, 97]].map(c => billow(128, c, 26)),
      ember: radial(32, [[0, 'rgba(255,245,210,1)'], [0.35, 'rgba(255,170,70,.75)'], [1, 'rgba(255,80,0,0)']]),
      soot: radial(128, [[0, 'rgba(6,5,4,.9)'], [0.5, 'rgba(14,11,8,.5)'], [1, 'rgba(14,11,8,0)']]),
    };
  }

  function scorch() {
    const c = ag, R = 150 * U;
    c.clearRect(0, 0, W, H);
    c.save();
    for (let i = 0; i < 28; i++) {
      const a = rnd(0, 6.283), r = rnd(0, R * 0.55), rr = rnd(0.35, 0.85) * R;
      c.globalAlpha = rnd(0.25, 0.5);
      c.drawImage(spr.soot, cx + Math.cos(a) * r - rr, cy + Math.sin(a) * r - rr, rr * 2, rr * 2);
    }
    c.globalAlpha = 1; c.lineCap = 'round';
    for (let i = 0; i < 90; i++) {
      const a = rnd(0, 6.283), r0 = rnd(0.12, 0.4) * R, r1 = rnd(0.75, 1.8) * R;
      const x0 = cx + Math.cos(a) * r0, y0 = cy + Math.sin(a) * r0, x1 = cx + Math.cos(a) * r1, y1 = cy + Math.sin(a) * r1;
      const gr = c.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(10,8,5,.55)'); gr.addColorStop(1, 'rgba(10,8,5,0)');
      c.strokeStyle = gr; c.lineWidth = rnd(2, 10) * U;
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    const gr = c.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62);
    gr.addColorStop(0, 'rgba(4,3,2,.96)'); gr.addColorStop(0.55, 'rgba(14,10,7,.68)'); gr.addColorStop(1, 'rgba(14,10,7,0)');
    c.fillStyle = gr; c.beginPath(); c.arc(cx, cy, R * 0.62, 0, 6.283); c.fill();
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 22; i++) {
      const a = rnd(0, 6.283), r = rnd(0, R * 0.38), s = rnd(3, 9) * U;
      c.globalAlpha = rnd(0.3, 0.85);
      c.drawImage(spr.ember, cx + Math.cos(a) * r - s, cy + Math.sin(a) * r - s, s * 2, s * 2);
    }
    c.restore();
  }

  function poly(c, p, x, y, sc) {
    c.save(); c.translate(x, y); c.rotate(p.rot); c.scale(p.sz * sc, p.sz * sc * p.flat);
    c.beginPath();
    p.pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    c.closePath(); c.fill();
    c.restore();
  }

  function boom(x, y, rm) {
    sprites(); size();
    cx = x; cy = y; red = rm;
    U = Math.max(0.8, Math.min(2.1, Math.min(W, H) / 400));
    P = [];
    const k = rm ? 0.35 : 1;
    // white-hot core
    for (let i = 0; i < 5; i++) P.push({ t: 'core', x: x + rnd(-8, 8) * U, y: y + rnd(-8, 8) * U, vx: 0, vy: 0, s0: rnd(60, 100) * U, s1: rnd(260, 360) * U, life: rnd(0.3, 0.5), d: 0, v: i % 2 });
    // main fireball + a late secondary burst
    for (let i = 0; i < 84 * k; i++) {
      const late = i > 66 * k, a = rnd(0, 6.283), sp = (late ? rnd(60, 260) : rnd(110, 620)) * U, o = rnd(0, 26) * U;
      P.push({ t: 'fire', x: x + Math.cos(a) * o, y: y + Math.sin(a) * o, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        s0: rnd(30, 66) * U, s1: rnd(120, 250) * U, life: rnd(0.75, 1.9), d: late ? rnd(0.18, 0.45) : rnd(0, 0.12), v: (Math.random() * 3) | 0, sw: rnd(-1, 1),
        rot: rnd(0, 6.283), str: rnd(1.1, 1.7) });
    }
    // small fires left burning on the floor around the crater
    for (let i = 0; i < 9 * (rm ? 0.5 : 1); i++) {
      const a = rnd(0, 6.283), r = rnd(0.25, 1.15) * 150 * U;
      P.push({ t: 'gfire', x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, s: rnd(36, 84) * U, life: rnd(2.8, 5), d: rnd(0.25, 0.7), v: (Math.random() * 3) | 0, ph: rnd(0, 6.28) });
    }
    // ground dust thrown out in a ring
    for (let i = 0; i < 40 * k; i++) {
      const a = (i / (40 * k)) * 6.283 + rnd(-0.1, 0.1), sp = rnd(700, 1100) * U;
      P.push({ t: 'dust', x: x + Math.cos(a) * 20 * U, y: y + Math.sin(a) * 20 * U, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, s0: rnd(50, 90) * U, s1: rnd(190, 300) * U, life: rnd(1.6, 2.8), d: rnd(0.02, 0.08), v: i % 2, amax: rnd(0.45, 0.75) });
    }
    // smoke column
    for (let i = 0; i < 54 * k; i++) {
      const a = rnd(0, 6.283), sp = rnd(25, 190) * U, o = rnd(0, 40) * U;
      P.push({ t: 'smoke', x: x + Math.cos(a) * o, y: y + Math.sin(a) * o, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rnd(8, 30) * U,
        s0: rnd(70, 120) * U, s1: rnd(260, 470) * U, life: rnd(2.8, 5.2), d: rnd(0.08, 0.7), v: (Math.random() * 4) | 0, amax: rnd(0.55, 0.9) });
    }
    if (!rm) for (let i = 0; i < 90; i++) {
      const a = rnd(0, 6.283), sp = rnd(420, 1500) * U;
      P.push({ t: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(0.3, 0.95), d: rnd(0, 0.1), w: rnd(0.8, 2.2), px: x, py: y });
    }
    const dark = ['#121314', '#1b1d1e', '#26282a', '#303234', '#3d4030', '#4b4f2f', '#5b5f37'];
    const bits = ['#c9ccc7', '#b31c12', '#1f4fa8', '#c9a41c', '#8a8f92'];
    for (let i = 0; i < (rm ? 16 : 52); i++) {
      const big = i < 7, a = rnd(0, 6.283), sp = rnd(200, big ? 520 : 860) * U, n = 3 + ((Math.random() * 3) | 0), pts = [];
      for (let j = 0; j < n; j++) { const aa = (j / n) * 6.283 + rnd(-0.45, 0.45), rr = rnd(0.45, 1); pts.push([Math.cos(aa) * rr, Math.sin(aa) * rr]); }
      P.push({ t: 'deb', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, sz: (big ? rnd(7, 12) : rnd(2, 6)) * U, flat: rnd(0.4, 1),
        col: Math.random() < 0.12 ? bits[(Math.random() * bits.length) | 0] : dark[(Math.random() * dark.length) | 0],
        rot: rnd(0, 6.28), vr: rnd(-16, 16), life: rnd(0.6, 1.4), d: rnd(0, 0.06), pts, px: x, py: y });
    }
    for (let i = 0; i < 56 * k; i++) {
      const a = rnd(0, 6.283), sp = rnd(30, 240) * U;
      P.push({ t: 'ember', x: x + rnd(-30, 30) * U, y: y + rnd(-30, 30) * U, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: rnd(1.4, 3.6), d: rnd(0.2, 1.3), s: rnd(3, 9) * U, ph: rnd(0, 6.28) });
    }
    t0 = last = performance.now();
    scorch();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }

  function step() {
    raf = 0;
    try { draw(performance.now()); } catch (e) {               // a rendering hiccup must never break the game
      P = []; try { g.clearRect(0, 0, W, H); gs.clearRect(0, 0, W, H); } catch (e2) { /* ignore */ }
    }
  }
  function draw(nowT) {
    const T = Math.max(0, (nowT - t0) / 1000);
    const dt = Math.min(0.05, Math.max(0.001, (nowT - last) / 1000));
    last = Math.max(last, nowT);
    g.clearRect(0, 0, W, H); gs.clearRect(0, 0, W, H);
    let alive = 0;
    // light thrown on the floor / scene by the fireball
    if (T < 1.6) {
      const a = Math.pow(1 - T / 1.6, 1.6), s = (640 + 520 * T) * U;
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = a * (red ? 0.35 : 0.7);
      g.drawImage(spr.hot, cx - s / 2, cy - s / 2, s, s);
    }
    // dust ring + smoke (normal blend: they occlude)
    g.globalCompositeOperation = 'source-over';
    for (const p of P) {
      if ((p.t !== 'dust' && p.t !== 'smoke') || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      if (age > p.life) { p.dead = true; continue; }
      alive++;
      const f = Math.exp((p.t === 'dust' ? -4.2 : -1.2) * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt;
      const q = age / p.life, s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - q, 2));
      const a = Math.min(1, age / (p.t === 'dust' ? 0.08 : 0.3)) * (q > 0.4 ? 1 - (q - 0.4) / 0.6 : 1) * p.amax;
      g.globalAlpha = Math.max(0, a);
      g.drawImage(p.t === 'dust' ? spr.dust[p.v] : spr.smoke[p.v], p.x - s / 2, p.y - s / 2, s, s);
    }
    // fire (additive): white-hot -> orange -> deep red, swirling outward
    g.globalCompositeOperation = 'lighter';
    for (const p of P) {
      if ((p.t !== 'fire' && p.t !== 'core') || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      if (age > p.life) { p.dead = true; continue; }
      alive++;
      const f = Math.exp(-3.1 * dt); p.vx *= f; p.vy *= f;
      if (p.sw) { const sx = -p.vy * p.sw * 0.5 * dt, sy = p.vx * p.sw * 0.5 * dt; p.vx += sx; p.vy += sy; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const q = age / p.life, s = p.s0 + (p.s1 - p.s0) * (1 - Math.pow(1 - q, 2.2));
      if (p.t === 'core') {
        g.globalAlpha = Math.pow(1 - q, 1.4) * (red ? 0.45 : 1);
        g.drawImage(spr.hot, p.x - s / 2, p.y - s / 2, s, s);
        continue;
      }
      g.globalAlpha = Math.min(1, age / 0.05) * Math.pow(1 - q, 0.95) * 0.9;
      const im = q < 0.2 ? spr.fHot[p.v % 2] : q < 0.52 ? spr.fire[p.v] : spr.deep[p.v];
      // stretch each puff along its direction of travel so the fireball reads as tongues of flame
      const ang = Math.atan2(p.vy, p.vx), st = 1 + (p.str - 1) * Math.min(1, Math.hypot(p.vx, p.vy) / (220 * U));
      g.setTransform(g._k, 0, 0, g._k, p.x * g._k, p.y * g._k);
      g.rotate(ang + p.rot * 0.15);
      g.drawImage(im, -s * st / 2, -s / 2 / Math.sqrt(st), s * st, s / Math.sqrt(st));
      g.setTransform(g._k, 0, 0, g._k, 0, 0);
    }
    // the fireball keeps glowing inside the smoke for a while
    if (T > 0.25 && T < 2.6) {
      const a = (T < 0.6 ? (T - 0.25) / 0.35 : Math.pow(1 - (T - 0.6) / 2.0, 1.4)) * (red ? 0.35 : 0.55), s = (300 + 140 * T) * U;
      g.globalAlpha = Math.max(0, a);
      g.drawImage(spr.glow, cx - s / 2, cy - s / 2, s, s);
    }
    for (const p of P) {
      if (p.t !== 'gfire' || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      if (age > p.life) { p.dead = true; continue; }
      alive++;
      const q = age / p.life, fl = 0.75 + 0.25 * Math.sin(p.ph + age * 17) * Math.sin(p.ph * 2 + age * 7);
      const s = p.s * (0.6 + 0.4 * Math.min(1, age / 0.3)) * (1 - q * 0.5) * fl;
      g.globalAlpha = Math.min(1, age / 0.2) * Math.pow(1 - q, 0.8) * 0.9;
      g.drawImage(spr.fire[p.v], p.x - s / 2, p.y - s * 0.62, s, s);
      g.globalAlpha *= 0.7;
      g.drawImage(spr.fHot[p.v % 2], p.x - s * 0.22, p.y - s * 0.3, s * 0.44, s * 0.44);
    }
    // shock wave: bright refracting rim + dust shadow behind it
    if (T < 0.55) {
      const k = T / 0.55, e = 1 - Math.pow(1 - k, 3), r = e * Math.max(W, H) * 0.9;
      g.globalAlpha = 0.5 * (1 - k); g.strokeStyle = '#fff0d8'; g.lineWidth = (22 * (1 - k) + 2) * U;
      g.beginPath(); g.arc(cx, cy, r, 0, 6.283); g.stroke();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 0.22 * (1 - k); g.strokeStyle = '#4d4134'; g.lineWidth = (40 * (1 - k) + 6) * U;
      g.beginPath(); g.arc(cx, cy, r * 0.93, 0, 6.283); g.stroke();
    }
    // sparks (sharp canvas): hot streaks that curve and cool
    gs.globalCompositeOperation = 'lighter'; gs.lineCap = 'round';
    for (const p of P) {
      if (p.t !== 'spark' || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      if (age > p.life) { p.dead = true; continue; }
      alive++;
      p.px = p.x; p.py = p.y;
      const f = Math.exp(-2.6 * dt); p.vx *= f; p.vy *= f; p.vy += 260 * U * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const q = age / p.life, tl = 0.028;
      gs.globalAlpha = Math.max(0, 1 - q);
      gs.strokeStyle = q < 0.25 ? '#fffbe6' : q < 0.6 ? '#ffd070' : '#ff8a2e';
      gs.lineWidth = p.w * U * (1 - q * 0.6);
      gs.beginPath(); gs.moveTo(p.x - p.vx * tl, p.y - p.vy * tl); gs.lineTo(p.x, p.y); gs.stroke();
    }
    // embers
    for (const p of P) {
      if (p.t !== 'ember' || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      if (age > p.life) { p.dead = true; continue; }
      alive++;
      const f = Math.exp(-1.5 * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt + Math.sin(p.ph + age * 3) * 8 * U * dt; p.y += p.vy * dt - 12 * U * dt;
      const q = age / p.life;
      gs.globalAlpha = Math.max(0, (1 - q) * (0.5 + 0.5 * Math.sin(p.ph + age * 24)));
      gs.drawImage(spr.ember, p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    // debris: fly up toward the camera, motion-blurred, then land on the floor layer
    gs.globalCompositeOperation = 'source-over';
    for (const p of P) {
      if (p.t !== 'deb' || p.dead) continue;
      const age = T - p.d; if (age < 0) { alive++; continue; }
      p.px = p.x; p.py = p.y;
      const f = Math.exp(-2.5 * dt); p.vx *= f; p.vy *= f; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (age >= p.life) {
        p.dead = true;
        ag.globalAlpha = 0.45; ag.fillStyle = '#000'; poly(ag, p, p.x + 1.5 * U, p.y + 2 * U, 1);
        ag.globalAlpha = 1; ag.fillStyle = p.col; poly(ag, p, p.x, p.y, 1);
        continue;
      }
      alive++;
      const h = Math.sin(Math.PI * (age / p.life)), sc = 1 + 0.6 * h;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > 80 * U) { // motion trail
        gs.globalAlpha = Math.min(0.5, sp / (1600 * U)); gs.strokeStyle = 'rgba(20,18,16,1)'; gs.lineWidth = p.sz * 0.9 * sc; gs.lineCap = 'round';
        gs.beginPath(); gs.moveTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); gs.lineTo(p.x, p.y); gs.stroke();
      }
      gs.globalAlpha = 0.3; gs.fillStyle = '#000'; poly(gs, p, p.x + 12 * h * U, p.y + 18 * h * U, 1 + 0.3 * h);
      gs.globalAlpha = 1; gs.fillStyle = p.col; poly(gs, p, p.x, p.y, sc);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    gs.globalAlpha = 1; gs.globalCompositeOperation = 'source-over';
    if (alive || T < 1.7) raf = requestAnimationFrame(step);
    else { P = []; g.clearRect(0, 0, W, H); gs.clearRect(0, 0, W, H); }
  }

  function clear() {
    cancelAnimationFrame(raf); raf = 0; P = [];
    if (g) g.clearRect(0, 0, W, H);
    if (gs) gs.clearRect(0, 0, W, H);
    if (ag) ag.clearRect(0, 0, W, H);
  }
  return { boom, clear };
})();

/* ---------------- confetti for the win (paper bits + a few hearts) ---------------- */
const Confetti = (() => {
  const cv = $('#conf');
  let g = null, W = 0, H = 0, P = [], raf = 0, t0 = 0, last = 0;
  const COLS = ['#f6d743', '#4fc36a', '#ffffff', '#e8453c', '#3d7be0', '#f28fb5', '#ff9c38'];
  function heart(s) {
    g.beginPath();
    g.moveTo(0, s * 0.55);
    g.bezierCurveTo(-s * 1.05, -s * 0.05, -s * 0.5, -s * 0.85, 0, -s * 0.3);
    g.bezierCurveTo(s * 0.5, -s * 0.85, s * 1.05, -s * 0.05, 0, s * 0.55);
    g.fill();
  }
  function start() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px';
    g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const U = Math.max(0.8, Math.min(1.7, Math.min(W, H) / 420));
    P = [];
    [0, 1].forEach(side => {
      for (let i = 0; i < 48; i++) {
        const ang = side ? rnd(-2.3, -1.78) : rnd(-1.36, -0.84);
        const sp = rnd(700, 1300) * Math.max(0.75, H / 760);
        P.push({ x: side ? W + 8 : -8, y: H * 0.94, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
          w: rnd(5, 9) * U, h: rnd(8, 14) * U, rot: rnd(0, 6.28), vr: rnd(-9, 9), fl: rnd(0, 6.28), vf: rnd(6, 14),
          col: COLS[(Math.random() * COLS.length) | 0], heart: Math.random() < 0.15, d: rnd(0, 0.22), sway: rnd(0.6, 1.6), ph: rnd(0, 6.28) });
      }
    });
    t0 = last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }
  function step() { raf = 0; try { draw(performance.now()); } catch (e) { P = []; } }
  function draw(nowT) {
    const T = Math.max(0, (nowT - t0) / 1000), dt = Math.min(0.05, Math.max(0.001, (nowT - last) / 1000));
    last = Math.max(last, nowT);
    g.clearRect(0, 0, W, H);
    let alive = 0;
    for (const p of P) {
      if (T < p.d) { alive++; continue; }
      const drag = Math.exp(-2.4 * dt);
      p.vx *= drag; p.vy = p.vy * drag + 520 * dt;
      if (p.vy > 150) p.vy = 150 + (p.vy - 150) * 0.85;          // paper flutters, it doesn't drop
      p.x += (p.vx + Math.sin(p.ph + T * 3 * p.sway) * 38) * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt; p.fl += p.vf * dt;
      if (p.y > H + 30) continue;
      alive++;
      const fade = T > 3.3 ? Math.max(0, 1 - (T - 3.3) / 0.8) : 1, c = Math.cos(p.fl);
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.abs(c) < 0.08 ? 0.08 : c);
      g.globalAlpha = fade; g.fillStyle = p.col;
      if (p.heart) { g.fillStyle = '#e0262f'; heart(p.h * 0.75); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (c < 0) { g.globalAlpha = fade * 0.25; g.fillStyle = '#000'; if (p.heart) heart(p.h * 0.75); else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      g.restore();
    }
    if (alive && T < 4.2) raf = requestAnimationFrame(step);
    else { g.clearRect(0, 0, W, H); P = []; }
  }
  function stop() { cancelAnimationFrame(raf); raf = 0; P = []; if (g) g.clearRect(0, 0, W, H); }
  return { start, stop };
})();

/* =====================================================================
   Layout — one physical object, scaled to fit; P = portrait, L = wide
   ===================================================================== */
const LAY = { mode: 'P', s: 1, compact: false, desk: false, notes: null, notesOpen: null };
const saProbe = document.createElement('div');
saProbe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
document.body.appendChild(saProbe);
function insets() {
  const cs = getComputedStyle(saProbe);
  return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
}
function place(el, x, y, w, h) {
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  el.style.width = Math.round(w) + 'px'; el.style.height = Math.round(h) + 'px';
}
function layout() {
  const W = window.innerWidth, H = window.innerHeight, sa = insets();
  const land = W > H * 1.05;
  let s, sx, sy, sw, sh;
  LAY.mode = land ? 'L' : 'P';
  app.classList.toggle('P', !land); app.classList.toggle('L', land);
  if (!land) {
    const DW = 360, DH = 600, hudH = 54, minNotes = 58;
    const top = sa.t + 2;
    s = Math.min((W - sa.l - sa.r - 4) / DW, (H - top - hudH - minNotes - sa.b) / DH);
    s = Math.max(0.45, Math.min(s, 1.9));
    sw = DW * s; sh = DH * s;
    sx = (W - sw) / 2; sy = top + hudH;
    place(hud, sa.l + 10, top + 3, W - sa.l - sa.r - 20, 48);
    const ny = sy + sh + 8, nw = Math.min(W - 24 - sa.l - sa.r, 560);
    LAY.notes = { x: (W - nw) / 2, y: ny, w: nw, h: Math.max(64, H - ny) + 40 };
    notes.classList.toggle('short', H - ny < 100);
    const oy = Math.min(Math.max(sy + 240 * s, H * 0.2), H - 300);   // just below the timer
    LAY.notesOpen = { x: 8 + sa.l, y: oy, w: W - 16 - sa.l - sa.r, h: H - oy + 6 };
    LAY.compact = false; LAY.desk = false;
  } else {
    const DW = 692, DH = 372;
    const compact = H < 560;
    const pad = compact ? 8 : 26;
    const nW = compact ? Math.max(176, Math.min(250, W * 0.25)) : Math.max(320, Math.min(430, W * 0.3));
    const availW = W - sa.l - sa.r - nW - pad * 3, availH = H - sa.t - sa.b - pad * 2;
    s = Math.min(availW / DW, availH / DH);
    s = Math.max(0.4, Math.min(s, 1.7));
    sw = DW * s; sh = DH * s;
    sx = sa.l + pad + (availW - sw) / 2; sy = sa.t + pad + (availH - sh) / 2;
    const nx = W - sa.r - pad - nW;
    place(hud, nx, sa.t + pad, nW, 48);
    LAY.notes = { x: nx, y: sa.t + pad + 60, w: nW, h: H - sa.t - sa.b - pad * 2 - 60 };
    const ow = Math.min(470, W * 0.6);
    LAY.notesOpen = { x: W - sa.r - ow - 8, y: sa.t + 8, w: ow, h: H - sa.t - sa.b - 16 };
    LAY.compact = compact; LAY.desk = !compact;
  }
  app.classList.toggle('compact', LAY.compact); app.classList.toggle('desk', LAY.desk);
  LAY.s = s;
  place(stageWrap, sx, sy, sw, sh);
  stage.style.transform = `scale(${s.toFixed(4)})`;
  const r = S.notesOpen && !LAY.desk ? LAY.notesOpen : LAY.notes;
  place(notes, r.x, r.y, r.w, r.h);
  if (LAY.desk && S.notesOpen) { S.notesOpen = false; notes.classList.remove('open'); npBack.classList.remove('on'); }
  // lamp light / vignette follow the bomb
  const lx = ((sx + sw / 2) / W) * 100, ly = ((sy + sh * (land ? 0.5 : 0.42)) / H) * 100;
  const rs = document.documentElement.style;
  rs.setProperty('--lx', lx.toFixed(1) + '%');
  rs.setProperty('--ly', ly.toFixed(1) + '%');
  // the painted bombsite "A" (floor layer is inset by -60px)
  const fl = $('#floor').style;
  if (land) {
    fl.setProperty('--ax', Math.round(sx + sw * 0.16 + 60) + 'px');
    fl.setProperty('--ay', Math.round(sy + sh * 0.98 + 60) + 'px');
    fl.setProperty('--as', Math.round(Math.min(H * 0.62, sh * 1.25)) + 'px');
  } else {
    fl.setProperty('--ax', Math.round(W * 0.5 + 60) + 'px');
    fl.setProperty('--ay', Math.round(sy + sh * 0.55 + 60) + 'px');
    fl.setProperty('--as', Math.round(sh * 1.05) + 'px');
  }
  scrollNotes();
}
let layQueued = false;
function schedLayout() { if (layQueued) return; layQueued = true; requestAnimationFrame(() => { layQueued = false; layout(); }); }

/* =====================================================================
   Game state
   ===================================================================== */
const S = {
  phase: 'idle', mode: 4, secret: '', input: '', attempts: [], tried: new Set(),
  endAt: 0, frozen: TOTAL, endVisible: false, err: 0, robot: null, byRobot: false,
  lastSlot: null, urgent: false, critical: false, notesOpen: false, outcome: '', round: 0,
  statusUntil: 0, tStr: '', pendingLeft: null,
};

function randomCode(mode) {
  const digits = mode === 4 ? '1234' : '0123456789';
  const n = digits.length, lim = Math.floor(4294967296 / n) * n, buf = new Uint32Array(1);
  let out = '';
  while (out.length < 4) {
    crypto.getRandomValues(buf);
    if (buf[0] < lim) out += digits[buf[0] % n];
  }
  return out;
}
function codeAt(i) { let s = ''; for (let p = 3; p >= 0; p--) s += (Math.floor(i / 4 ** p) % 4) + 1; return s; }
function codeIndex(c) {
  if (!/^[1-4]{4}$/.test(c)) return -1;
  let i = 0; for (const ch of c) i = i * 4 + (ch.charCodeAt(0) - 49);
  return i;
}
function timeLeft() {
  if (S.phase === 'armed') return Math.max(0, S.endAt - performance.now());
  if (S.phase === 'idle' || S.phase === 'arming') return TOTAL;
  return S.frozen;
}

/* ---------------- rendering helpers ---------------- */
function fmtT(left, colon) {
  left = Math.max(0, left);
  if (left >= TOTAL) return '01:00';
  if (left >= 10000) return '00' + (colon ? ':' : ' ') + two(Math.floor(left / 1000));
  return two(Math.floor(left / 1000)) + '. ' + two(Math.floor((left % 1000) / 10));
}
function renderTimer(left, steady) {
  const colon = steady || S.phase !== 'armed' ? true : left % 1000 >= 500;
  const s = fmtT(left, colon);
  if (s !== S.tStr) { tLit.textContent = s; S.tStr = s; }
}
function setTimerRaw(s) { tLit.textContent = s; S.tStr = s; }
const pad9 = s => ((s || '').toUpperCase().replace(/ /g, '!') + '!!!!!!!!!').slice(0, 9);
function statusRows(a, b) { lA.textContent = pad9(a); lB.textContent = pad9(b); }
function renderStatus() {
  if (performance.now() < S.statusUntil) return;
  let a, b;
  switch (S.phase) {
    case 'idle': a = 'ARME A'; b = 'BOMBA'; break;
    case 'armed':
      if (S.err) return;
      if (S.robot) { a = 'MODO'; b = 'AUTO'; }
      else if (S.urgent) { a = 'TEMPO'; b = 'ACABANDO'; }
      else if (S.attempts.length) { a = 'TENTATIVA'; b = String(S.attempts.length + 1).padStart(3, '0'); }
      else { a = 'DIGITE A'; b = 'SENHA'; }
      break;
    case 'defusing': case 'defused': a = 'BOMBA'; b = 'DESARMADA'; break;
    default: return;
  }
  statusRows(a, b);
}
function flashStatus(a, b, ms) {
  S.statusUntil = performance.now() + ms;
  statusRows(a, b);
  setTimeout(() => { if (performance.now() >= S.statusUntil - 5) { S.statusUntil = 0; renderStatus(); } }, ms + 10);
}
function setCells(str, blink) {
  for (let i = 0; i < 4; i++) {
    const c = cellEls[i];
    c.t.textContent = str[i] || '!';
    c.el.classList.remove('cur');
    c.t.classList.toggle('blinkErr', !!blink);
  }
}
function renderCode() {
  if (S.err) return;
  const armed = S.phase === 'armed';
  for (let i = 0; i < 4; i++) {
    const c = cellEls[i];
    c.t.textContent = S.input[i] || '_';
    c.t.classList.remove('blinkErr');
    c.el.classList.toggle('cur', armed && i === S.input.length);
  }
}
function leds(arm, safe) { ledArm.classList.toggle('on', !!arm); ledSafe.classList.toggle('on', !!safe); }
function setPhaseClass() {
  const ph = S.phase;
  ['idle', 'arming', 'armed', 'defusing', 'defused', 'exploding', 'exploded'].forEach(p => app.classList.toggle(p, p === ph));
  if (ph !== 'armed') { S.urgent = S.critical = false; app.classList.remove('urgent', 'critical'); }
  app.classList.toggle('safe', ph === 'defusing' || ph === 'defused');
  const busy = ph === 'arming' || ph === 'armed' || ph === 'defusing' || ph === 'exploding';
  robotBtn.classList.toggle('off', busy && !S.robot);
  robotBtn.querySelector('span:last-child').textContent = S.robot ? 'parar' : 'robô';
}
function renderMute() {
  const m = Sfx.muted;
  muteIco.textContent = m ? '🔇' : '🔊';
  muteBtn.setAttribute('aria-pressed', m ? 'true' : 'false');
  muteBtn.setAttribute('aria-label', m ? 'Ligar o som' : 'Desligar o som');
}
function applyModeUI() {
  const hard = S.mode === 10;
  app.classList.toggle('hard', hard);
  ['5', '6', '7', '8', '9', '0'].forEach(k => keyEls[k].classList.toggle('taped', !hard));
  hudMid.innerHTML = hard ? '<b>DIFÍCIL · 0 a 9</b>10.000 combinações' : '<b>FÁCIL · 1 a 4</b>256 combinações';
  modeSw.setAttribute('aria-label', hard ? 'Dificuldade: Difícil, dígitos 0 a 9. Toque para trocar.' : 'Dificuldade: Fácil, dígitos 1 a 4. Toque para trocar.');
  npTableSec.hidden = hard; npHardSec.hidden = !hard;
  endModeBtn.innerHTML = hard ? 'Trocar p/ Fácil<small>dígitos 1–4</small>' : 'Trocar p/ Difícil<small>dígitos 0–9</small>';
}

/* ---------------- notepad ---------------- */
function renderNotesMeta() {
  const n = S.attempts.length, idle = S.phase === 'idle' && n === 0;
  npTitle.classList.toggle('inst', idle);
  npTitle.textContent = idle ? 'Levanta a tampa vermelha e arma ↑' : 'Caderninho';
  if (n) {
    npMeta.innerHTML = `<span class="np-c">${n}</span><span class="np-w"> tentativa${n > 1 ? 's' : ''}</span><span class="np-last"> · última ${S.attempts[n - 1]}</span>`;
  } else npMeta.textContent = 'nenhuma ainda';
  npIntro.hidden = !idle;
  npEmpty.hidden = !(S.phase !== 'idle' && n === 0);
}
function clearNotes() {
  npLog.textContent = '';
  tableCells.forEach(c => { c.className = 'cl'; });
  renderNotesMeta();
  npScroll.scrollTop = 0;
}
function scrollNotes() {
  const last = npLog.lastElementChild;
  if (!last) { npScroll.scrollTop = 0; return; }
  const want = last.offsetTop + last.offsetHeight - npScroll.clientHeight + 12;
  if (S.notesOpen || LAY.desk) { if (want > npScroll.scrollTop) npScroll.scrollTop = want; }
  else npScroll.scrollTop = Math.max(0, want);
}
function noteAdd(code, ok) {
  const w = document.createElement('span');
  w.className = 'w ' + (ok ? 'ok' : 'x') + (reduced ? '' : ' new');
  w.textContent = code;
  w.style.setProperty('--r', rnd(-2.5, 2.5).toFixed(1) + 'deg');
  w.style.setProperty('--y', rnd(-1.5, 1.5).toFixed(1) + 'px');
  w.style.setProperty('--sr', rnd(-7, 4).toFixed(1) + 'deg');
  npLog.appendChild(w);
  if (S.mode === 4) {
    const i = codeIndex(code);
    if (i >= 0) {
      const c = tableCells[i];
      c.classList.add(ok ? 'ok' : 'x');
      if (!ok) c.style.setProperty('--r', rnd(-18, 18).toFixed(0) + 'deg');
    }
  }
  renderNotesMeta();
  scrollNotes();
}
function openNotes() {
  if (LAY.desk || S.notesOpen) return;
  S.notesOpen = true;
  notes.classList.add('open'); npBack.classList.add('on');
  const r = LAY.notesOpen;
  place(notes, r.x, r.y, r.w, r.h);
  npScroll.scrollTop = 0;
  if (!reduced && notes.animate) {
    const from = LAY.mode === 'P' ? `translateY(${Math.round(r.h * 0.5)}px)` : `translateX(${Math.round(r.w * 0.45)}px)`;
    notes.animate([{ transform: from, opacity: 0.4 }, { transform: 'none', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.2,.9,.3,1)' });
  }
}
function closeNotes(silent) {
  if (!S.notesOpen) return;
  S.notesOpen = false;
  notes.classList.remove('open'); npBack.classList.remove('on');
  const r = LAY.notes;
  place(notes, r.x, r.y, r.w, r.h);
  scrollNotes();
  if (!silent && !reduced && notes.animate) notes.animate([{ opacity: 0.5, transform: 'translateY(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
}

/* ---------------- key feedback ---------------- */
function pressVisual(k, ms) {
  const el = keyEls[k]; if (!el) return;
  el.classList.add('down');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('down'), ms || 95);
}
function nudge(el) {
  if (reduced || !el.animate) return;
  el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 240 });
}
function ledBlink(ms) {
  ledArm.classList.add('on');
  clearTimeout(ledArm._t);
  ledArm._t = setTimeout(() => { if (S.phase === 'armed' && S.lastSlot !== 'L') ledArm.classList.remove('on'); }, ms);
}
function pulseGlow() {
  if (!glow.animate) return;
  glow.className = 'red';
  const base = S.critical ? 0.7 : S.urgent ? 0.45 : 0;
  glow.animate([{ opacity: reduced ? Math.max(base, 0.6) : 1 }, { opacity: base }], { duration: 420, easing: 'ease-out' });
}

/* =====================================================================
   Game flow
   ===================================================================== */
function arm(robot) {
  if (S.phase !== 'idle') return;
  Sfx.ensure();
  closeNotes(true);
  S.round++;
  S.phase = 'arming';
  S.secret = randomCode(S.mode);
  S.input = ''; S.attempts = []; S.tried = new Set(); S.frozen = TOTAL; S.lastSlot = null; S.err = 0;
  S.robot = robot ? { j: 0, t0: 0 } : null;
  setPhaseClass(); clearNotes();
  armSw.classList.add('open');
  Sfx.cover();
  say('Bomba armando…');
  later(170, () => { armSw.classList.add('on'); Sfx.toggle(); });
  later(330, () => {
    setTimerRaw('88.:88'); statusRows('~~~~~~~~~', '~~~~~~~~~'); setCells('~~~~');
    leds(true, true); lcd.classList.add('flicker'); Sfx.armBeep(0);
  });
  later(560, () => Sfx.armBeep(1));
  later(790, () => Sfx.armBeep(2));
  later(1000, () => {
    lcd.classList.remove('flicker');
    setTimerRaw('01:00'); statusRows('BOMBA', 'ARMADA'); setCells('----');
    leds(false, false); Sfx.armed();
  });
  later(ARM_MS, () => {
    S.phase = 'armed';
    const t = performance.now();
    S.endAt = t + (S.pendingLeft != null ? S.pendingLeft : TOTAL);
    S.pendingLeft = null;
    if (S.robot) S.robot.t0 = t + 120;
    setPhaseClass(); renderCode(); renderStatus(); renderNotesMeta();
    say('Bomba armada. Você tem 1 minuto.');
    kick();
  });
}

function handleKey(k, src) {
  Sfx.ensure();
  const fromRobot = src === 'robot';
  if (S.robot && !fromRobot && (S.phase === 'armed' || S.phase === 'arming')) {
    Sfx.denied(); flashStatus('MODO', 'AUTO', 700); return;
  }
  if (S.mode === 4 && /^[05-9]$/.test(k)) {           // a taped-over key
    Sfx.key(false);
    const tape = $(k === '0' ? '.tape.t0' : /[56]/.test(k) ? '.tape.t56' : '.tape.t789');
    if (tape) nudge(tape);
    if (S.phase === 'armed' || S.phase === 'idle') flashStatus('SOMENTE', '1 A 4', 900);
    return;
  }
  Sfx.key(fromRobot);
  if (src !== 'tap') pressVisual(k, fromRobot ? 30 : 95);
  if (S.phase === 'idle') { if (k !== 'DEL') arm(false); return; }
  if (S.phase !== 'armed') return;
  if (k === 'DEL') { if (S.err) clearErr(); S.input = S.input.slice(0, -1); renderCode(); return; }
  if (k === 'OK') {
    if (S.input.length === 4) submit();
    else { Sfx.denied(); flashStatus('SENHA', 'CURTA', 700); }
    return;
  }
  if (S.err) clearErr();
  if (S.input.length >= 4) return;
  S.input += k;
  renderCode();
  if (S.input.length === 4) submit();
}

function submit() {
  const code = S.input;
  S.input = '';
  S.attempts.push(code); S.tried.add(code);
  if (code === S.secret) { noteAdd(code, true); defuse(); return; }
  noteAdd(code, false);
  wrong(code);
}

function wrong(code) {
  const byRobot = !!S.robot;
  const id = performance.now();
  S.err = id;
  lcd.classList.add('err');
  setCells(code, true);
  statusRows('SENHA', 'ERRADA');
  if (byRobot) Sfx.blip();
  else {
    Sfx.buzz(); vibrate(80);
    if (!reduced && lcdWin.animate) {
      lcdWin.animate([
        { transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(6px)' },
        { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' },
      ], { duration: 380, easing: 'cubic-bezier(.36,.07,.19,.97)' });
    }
    pulseGlow();
    say('Senha errada');
  }
  setTimeout(() => { if (S.err === id && S.phase === 'armed') setCells('ERRO', true); }, byRobot ? 60 : 260);
  setTimeout(() => { if (S.err === id) clearErr(); }, byRobot ? 150 : 760);
}
function clearErr() {
  S.err = 0;
  lcd.classList.remove('err');
  renderCode(); renderStatus();
}

function defuse() {
  const t = performance.now();
  S.phase = 'defusing';
  S.frozen = Math.max(0, S.endAt - t);
  S.byRobot = !!S.robot; S.robot = null; S.err = 0;
  Sfx.stopLong(); Sfx.relay(); Sfx.chime(); vibrate([30, 60, 30]);
  setPhaseClass();
  renderTimer(S.frozen, true);
  tw.classList.remove('dim', 'freeze'); void tw.offsetWidth; tw.classList.add('freeze');
  leds(false, true);
  lcd.classList.remove('err'); lcd.classList.add('ok');
  setCells(S.secret); statusRows('BOMBA', 'DESARMADA');
  glow.className = ''; void glow.offsetWidth; glow.className = 'win';
  say('Bomba desarmada!');
  later(620, () => { armSw.classList.remove('on'); Sfx.toggle(); });
  later(900, () => armSw.classList.remove('open'));
  later(1500, () => showEnd('win'));
}

let shakeRaf = 0;
function shake() {
  if (reduced) return;
  const t0 = performance.now();
  const f = nowT => {
    const t = (nowT - t0) / 1000;
    if (t > 1.0) { scene.style.transform = ''; shakeRaf = 0; return; }
    const A = 26 * Math.exp(-t / 0.2) + 2.5 * Math.exp(-t / 0.6);
    const x = rnd(-1, 1) * A, y = rnd(-1, 1) * A, r = rnd(-1, 1) * A * 0.045, z = 1 + 0.05 * Math.exp(-t / 0.16);
    scene.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${r.toFixed(2)}deg) scale(${z.toFixed(3)})`;
    shakeRaf = requestAnimationFrame(f);
  };
  cancelAnimationFrame(shakeRaf);
  shakeRaf = requestAnimationFrame(f);
}
function stopShake() { cancelAnimationFrame(shakeRaf); shakeRaf = 0; scene.style.transform = ''; }

function explode() {
  if (S.phase !== 'armed') return;
  S.phase = 'exploding';
  S.frozen = 0; S.byRobot = !!S.robot; S.robot = null; S.err = 0;
  closeNotes(true);
  Sfx.stopLong(); Sfx.explosion(); vibrate([420, 70, 260, 70, 600]);
  setTimerRaw('00. 00');
  setPhaseClass();
  const r = device.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height * (LAY.mode === 'P' ? 0.4 : 0.5);
  flashEl.style.setProperty('--fx', cx.toFixed(0) + 'px');
  flashEl.style.setProperty('--fy', cy.toFixed(0) + 'px');
  flashEl.classList.remove('go'); void flashEl.offsetWidth; flashEl.classList.add('go');
  FX.boom(cx, cy, reduced);
  shake();
  later(45, () => app.classList.add('boomed'));
  say('BOOM! A bomba explodiu.');
  later(2000, () => showEnd('boom'));
}

function fmtSec(ms) {
  ms = Math.max(0, ms);
  if (ms >= 59950) return '1:00';
  return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
}
function fillEnd(kind) {
  const n = S.attempts.length, used = TOTAL - S.frozen;
  $('#endNo').textContent = 'Nº ' + String(S.round).padStart(3, '0');
  const rows = [];
  let title, sub, stamp, fun, tip = '';
  if (kind === 'win') {
    title = 'BOMBA DESARMADA'; sub = 'Os contra-terroristas venceram'; stamp = 'SUCESSO';
    rows.push(['Código', S.secret, 'code'], ['Tentativas', String(n), 'tries'], ['Tempo usado', fmtSec(used)], ['Sobrou', fmtSec(S.frozen)]);
    if (S.byRobot) {
      fun = 'Viu? Indo em ordem dá tempo… pro robô 🤖😏';
      const rate = n / Math.max(1, used / 1000);
      tip = `${n} códigos em ${fmtSec(used)} — uns ${rate.toFixed(1).replace('.', ',')} por segundo. Na mão, nem a pau!`;
    } else if (S.frozen < 5000) fun = 'No último segundo! Que nervos, amor 😅❤️';
    else if (used < 12000) fun = 'Rápida demais! Tá hackeando, é? 😳❤️';
    else fun = 'Você salvou o dia, amor ❤️';
  } else {
    title = '💥 BOOM'; sub = 'Os terroristas venceram'; stamp = 'FALHOU';
    rows.push(['O código era', S.secret, 'code'], ['Tentativas', String(n), 'tries'], ['Tempo', '1:00 — acabou']);
    if (S.mode === 4) rows.push(['Faltaram', `${256 - S.tried.size} códigos`]);
    else rows.push(['Combinações', '10.000']);
    fun = n === 0 ? 'Nem tentou, hein? 😏 Bora de novo, amor!' : n > 120 ? 'Quase! Faltou pouquinho… ❤️' : 'Não foi dessa vez… tenta de novo, amor ❤️';
    tip = S.mode === 4 ? 'Dica: vai em ordem, 1111 → 4444… ou chama o robô 🤖' : 'No difícil é sorte pura. Tenta o Fácil primeiro 😉';
  }
  $('#endTitle').textContent = title;
  $('#endSub').textContent = sub;
  $('#endStamp').textContent = stamp;
  $('#endFun').textContent = fun;
  $('#endTip').textContent = tip;
  const dl = $('#endStats');
  dl.textContent = '';
  rows.forEach(([k, v, cls]) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v; if (cls) dd.className = cls;
    dl.append(dt, dd);
  });
  applyModeUI();
}
function countUp(el, to, dur, delay) {
  if (reduced || to < 2) { el.textContent = String(to); return; }
  el.textContent = '0';
  const t0 = performance.now() + delay;
  const f = nowT => {
    const q = Math.min(1, Math.max(0, (nowT - t0) / dur));
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - q, 3))));
    if (q < 1 && S.endVisible) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}
function showEnd(kind) {
  S.phase = kind === 'win' ? 'defused' : 'exploded';
  S.outcome = kind;
  setPhaseClass();
  fillEnd(kind);
  endEl.hidden = false;
  endEl.className = kind;
  void endEl.offsetWidth;
  endEl.classList.add('in');
  endCard.classList.add('thump');
  endCard.scrollTop = 0;
  S.endVisible = true;
  const tries = $('#endStats dd.tries');
  if (tries) countUp(tries, S.attempts.length, 650, 450);
  later(reduced ? 300 : 880, () => Sfx.stamp());
  if (kind === 'win' && !reduced) later(380, () => { Confetti.start(); Sfx.pop(); });
}

function reset() {
  const wasBoom = app.classList.contains('boomed');
  cancelLater(); FX.clear(); Confetti.stop(); Sfx.stopLong(); stopShake();
  S.robot = null; S.byRobot = false;
  S.phase = 'idle'; S.secret = ''; S.input = ''; S.attempts = []; S.tried = new Set();
  S.frozen = TOTAL; S.err = 0; S.lastSlot = null; S.endVisible = false; S.outcome = ''; S.statusUntil = 0; S.pendingLeft = null;
  endEl.hidden = true; endEl.className = ''; endCard.classList.remove('thump');
  flashEl.classList.remove('go'); glow.className = '';
  armSw.classList.remove('open', 'on');
  lcd.className = 'lcd'; tw.className = 'tw';
  closeNotes(true);
  app.classList.remove('boomed');
  setPhaseClass(); clearNotes();
  renderTimer(TOTAL); renderCode(); renderStatus(); leds(false, true);
  if (wasBoom) {
    stageWrap.classList.remove('drop'); void stageWrap.offsetWidth; stageWrap.classList.add('drop');
    later(240, () => Sfx.thud());
    later(700, () => stageWrap.classList.remove('drop'));
  }
}

function setMode(m, fromUI) {
  m = Number(m) === 10 ? 10 : 4;
  const changed = m !== S.mode;
  reset();
  S.mode = m;
  applyModeUI();
  if (changed && fromUI) {
    if (m === 10) Sfx.tapeRip(); else Sfx.tapeSlap();
    flashStatus('MODO', m === 10 ? '0 A 9' : '1 A 4', 1000);
    say(m === 10 ? 'Modo difícil: dígitos de 0 a 9' : 'Modo fácil: dígitos de 1 a 4');
  }
}

/* ---------------- robot ---------------- */
function startRobot() {
  if (S.mode !== 4) setMode(4, true); else reset();
  arm(true);
}
function robotStep(nowT) {
  const R = S.robot;
  if (!R || !R.t0) return;
  while (S.phase === 'armed' && S.robot === R) {
    const ci = R.j >> 2, ki = R.j & 3;
    if (ci >= 256) { S.robot = null; setPhaseClass(); return; }
    const due = R.t0 + ci * ROBOT_CODE_MS + ki * ROBOT_KEY_MS;
    if (due > nowT) return;
    R.j++;
    handleKey(codeAt(ci)[ki], 'robot');
  }
}

/* ---------------- countdown loop (wall clock) ---------------- */
let rafId = 0;
function kick() { if (!rafId) rafId = requestAnimationFrame(frame); }
function frame(nowT) { rafId = 0; tick(performance.now()); if (S.phase === 'armed') kick(); }
function tick(nowT) {
  if (S.phase !== 'armed') return;
  if (S.robot) robotStep(nowT);
  if (S.phase !== 'armed') return;
  const left = S.endAt - nowT;
  if (left <= 0) { explode(); return; }
  renderTimer(left);
  beeps(left);
  const urgent = left < 10000, critical = left < 3000;
  if (urgent !== S.urgent || critical !== S.critical) {
    S.urgent = urgent; S.critical = critical;
    app.classList.toggle('urgent', urgent); app.classList.toggle('critical', critical);
    renderStatus();
  }
}
function beeps(left) {
  const sl = left >= 10000 ? 's' + Math.floor(left / 1000) : left >= 3000 ? 'h' + Math.floor(left / 500) : left >= 700 ? 'q' + Math.floor(left / 250) : 'L';
  if (sl === S.lastSlot) return;
  S.lastSlot = sl;
  if (sl === 'L') {
    Sfx.longTone(left / 1000);
    ledArm.classList.add('on'); tw.classList.remove('dim');
    pulseGlow();
    return;
  }
  const fast = left < 10000, crit = left < 3000;
  Sfx.tick(fast, crit);
  ledBlink(crit ? 70 : fast ? 110 : 150);
  if (fast) {
    tw.classList.remove('dim');
    clearTimeout(tw._t);
    tw._t = setTimeout(() => { if (S.phase === 'armed') tw.classList.add('dim'); }, crit ? 120 : 230);
    pulseGlow();
  }
}
setInterval(() => tick(performance.now()), 250);   // keeps time/robot/boom correct when rAF is throttled

/* =====================================================================
   Input
   ===================================================================== */
function bindCtl(el, fn, onDown) {
  let downAt = 0;
  const release = () => {
    const dt = performance.now() - downAt;
    setTimeout(() => el.classList.remove('down'), Math.max(0, 90 - dt));
  };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.cancelable) e.preventDefault();
    Sfx.ensure();
    downAt = performance.now();
    el.classList.add('down');
    if (onDown) fn(e);
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('pointerleave', release);
  el.addEventListener('click', e => {
    if (onDown && e.detail > 0 && window.PointerEvent) return; // already handled on pointerdown
    fn(e);
  });
}

function onArmTap() {
  if (S.phase === 'idle') { arm(false); return; }
  Sfx.ui(1800);
  if (S.phase === 'armed' && !S.robot) flashStatus('JA ESTA', 'ARMADA', 800);
}
function onModeTap() {
  Sfx.slide();
  if (S.phase !== 'idle') {
    Sfx.denied();
    if (!reduced && modeSw.animate) nudge(modeSw);
    flashStatus('MODO', 'TRAVADO', 900);
    return;
  }
  setMode(S.mode === 4 ? 10 : 4, true);
}
function onRobotTap() {
  Sfx.ui(1900);
  if (S.robot) { S.robot = null; setPhaseClass(); renderStatus(); flashStatus('ROBO', 'PAROU', 800); return; }
  if (S.phase === 'arming' || S.phase === 'armed' || S.phase === 'defusing' || S.phase === 'exploding') {
    Sfx.denied(); nudge(robotBtn); flashStatus('ROBO SO', 'DESARMADA', 900);
    return;
  }
  startRobot();
}
function onMuteTap() {
  if (Sfx.muted) { Sfx.setMuted(false); Sfx.ui(2400); }
  else { Sfx.ui(1700); Sfx.setMuted(true, 0.075); }   // let its own beep finish
  renderMute();
}
function onReplay() { Sfx.ui(2300); reset(); }

function bindAll() {
  KEY_ORDER.forEach(k => bindCtl(keyEls[k], () => handleKey(k, 'tap'), true));
  $$('.tape', keypad).forEach(t => t.addEventListener('pointerdown', e => {
    if (e.cancelable) e.preventDefault();
    const k = t.classList.contains('t0') ? '0' : t.classList.contains('t56') ? '5' : '7';
    handleKey(k, 'tap');
  }));
  bindCtl(armSw, onArmTap, true);
  bindCtl(modeSw, onModeTap, false);
  bindCtl(robotBtn, onRobotTap, false);
  bindCtl(muteBtn, onMuteTap, false);
  bindCtl($('#npOpen'), () => { Sfx.ui(2000); Sfx.paper(); openNotes(); }, false);
  bindCtl($('#npClose'), () => { Sfx.ui(1800); Sfx.paper(); closeNotes(); }, false);
  npBack.addEventListener('click', () => { Sfx.ui(1800); closeNotes(); });
  bindCtl(replayBtn, onReplay, false);
  bindCtl(endModeBtn, () => { Sfx.ui(2100); setMode(S.mode === 4 ? 10 : 4, true); }, false);
  bindCtl(endRobotBtn, () => { Sfx.ui(1900); startRobot(); }, false);

  // first gesture creates/resumes the AudioContext (iOS needs touchend/click)
  ['pointerdown', 'touchend', 'click', 'keydown'].forEach(t => window.addEventListener(t, () => Sfx.ensure(), { capture: true, passive: true }));
  app.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    if (S.endVisible) {
      const onBtn = document.activeElement && document.activeElement.closest && document.activeElement.closest('#end button');
      if ((k === 'Enter' || k === ' ') && !onBtn) { e.preventDefault(); if (!e.repeat) onReplay(); }
      return;
    }
    if (k === 'Escape') { if (S.notesOpen) { Sfx.ui(1800); closeNotes(); } return; }
    const isDigit = /^[0-9]$/.test(k);
    if (isDigit || k === 'Enter' || k === 'Backspace' || k === 'Delete') e.preventDefault();
    if (e.repeat) return;
    if (isDigit) handleKey(k, 'kbd');
    else if (k === 'Enter' || k === '#') handleKey('OK', 'kbd');
    else if (k === 'Backspace' || k === 'Delete' || k === '*') handleKey('DEL', 'kbd');
    else if (k === 'm' || k === 'M') onMuteTap();
  });

  window.addEventListener('resize', schedLayout);
  window.addEventListener('orientationchange', schedLayout);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', schedLayout);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { Sfx.ensure(); tick(performance.now()); kick(); }
  });
  if (rmq) {
    const onRM = () => { reduced = rmq.matches; app.classList.toggle('rm', reduced); };
    if (rmq.addEventListener) rmq.addEventListener('change', onRM); else if (rmq.addListener) rmq.addListener(onRM);
  }
}

/* =====================================================================
   Test hooks (contract)
   ===================================================================== */
function keyRect(k) {
  let el = null;
  if (k === 'ARM') { if (S.phase !== 'idle' || S.endVisible) return null; el = armSw; }
  else if (k === 'REPLAY') { if (!S.endVisible) return null; el = replayBtn; }
  else if (keyEls[k]) { if (S.mode === 4 && /^[05-9]$/.test(k)) return null; el = keyEls[k]; }
  else return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return null;
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== el && !el.contains(hit))) return null;
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}
window.__bomb = {
  state: () => ({
    phase: S.phase, secret: S.secret, timeLeftMs: timeLeft(), attempts: S.attempts.slice(),
    mode: S.mode, endScreenVisible: S.endVisible,
  }),
  arm: () => arm(false),
  press: k => handleKey(String(k), 'api'),
  setTimeLeft: ms => {
    ms = Math.max(0, Number(ms) || 0);
    if (S.phase === 'armed') { S.endAt = performance.now() + ms; tick(performance.now()); kick(); }
    else if (S.phase === 'arming') S.pendingLeft = ms;
  },
  setMode: m => setMode(m, false),
  reset: () => reset(),
  keyRect: k => keyRect(String(k)),
};

/* =====================================================================
   Boot
   ===================================================================== */
setTextures();
buildKeys(); buildWires(); buildTable();
app.classList.toggle('rm', reduced);
applyModeUI();
renderTimer(TOTAL); renderCode(); renderStatus(); leds(false, true); renderNotesMeta(); renderMute(); setPhaseClass();
layout();
bindAll();
if (document.fonts && document.fonts.load) {
  ['16px "Share Tech Mono"', '16px "Black Ops One"', '400 16px Caveat', '700 16px Caveat', '16px "Permanent Marker"', '600 16px Rajdhani', '700 16px Rajdhani', '16px DSEG7', '16px DSEG14']
    .forEach(f => { try { document.fonts.load(f).catch(() => {}); } catch (e) { /* ignore */ } });
  if (document.fonts.ready) document.fonts.ready.then(() => schedLayout()).catch(() => {});
}
})();
