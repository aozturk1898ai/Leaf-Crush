/* Leaf Crush - screens, board renderer, input and the cascade loop.
   The engine owns the rules; this file owns the pixels and the timing. */
(function (root) {
  'use strict';

  var E = root.LeafEngine;
  var Art = root.LeafArt;
  var Data = root.LeafChapters;
  var Spec = root.LeafSpecimen;
  var Rank = root.LeafRank;
  var Market = root.LeafMarket;

  var SAVE_KEY = 'leafcrush.save.v1';
  var SWAP_MS = 170;        /* slide time for a swap */
  var CLEAR_MS = 320;       /* how long a leaf takes to pop */
  var FALL_BASE = 150;      /* drop time for a one-row fall */
  var FALL_PER_ROW = 46;    /* extra drop time per row travelled */
  var MOVE_BONUS = 60;      /* points an unused move is worth at the end */
  var HINT_IDLE_MS = 7000;
  var MAX_LIVES = 5;             /* energy cap */
  var AD_MOVE_BONUS = 5;         /* moves a watched rewarded spot grants */
  var AD_CONTINUE_LIMIT = 1;     /* rewarded spots allowed per chapter attempt */
  var LIFE_MS = 30 * 60 * 1000;  /* one leaf every half hour */
  /* The full tank in the market is the one true price for a refill, so the
     energy dialog and the shop can never drift apart. */
  var REFILL_SEEDS = (Market && Market.find('tank') ? Market.find('tank').cost : 30);
  var LADDER_NAME = 'You';
  /* How deep a cascade goes before the game starts shouting about it. */
  var COMBO_WORDS = ['', '', 'Nice!', 'Great!', 'Awesome!', 'Incredible!', 'Unbelievable!'];

  var el = {};
  var board = null;
  var cfg = null;
  var tileEls = {};         /* tile id -> element */
  var cellEls = [];         /* [r][c] -> background element */
  var iceEls = [];          /* [r][c] -> frost overlay */
  var stoneEls = {};        /* "r:c" -> rock element */
  var metrics = { size: 40, gap: 3 };
  var save = loadSave();
  var actx = null;
  var hintTimer = null;
  var toastTimer = null;
  var energyTimer = null;
  var pendingStart = 0;     /* chapter waiting on an energy refill */
  var newCards = {};        /* chapters cleared this session: play the reveal once */
  var devOpen = false;
  var starsTaps = 0;
  var starsTapTimer = null;

  var game = {
    num: 1,
    score: 0,
    moves: 0,
    busy: false,
    over: false,
    collect: {},
    iceDone: 0,
    stoneDone: 0,
    origin: null,
    pending: null,
    drag: null,
    activeGarden: 0,
    albumGarden: 0,
    run: 0,
    arm: null,          /* the special waiting to be dropped on the board */
    armDir: 'h',        /* row or column for a line piece */
    marketFrom: 'map',  /* where the market was opened from */
    shown: 0,           /* the score the HUD is currently displaying */
    scoreTimer: null,   /* the count-up ticker */
    lowWarned: -1       /* the last moves count we shouted about */
  };

  var ICONS = {
    score: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 6.2 6.8.8-5 4.6 1.3 6.8L12 17.6 6 20.8l1.3-6.8-5-4.6 6.8-.8z" fill="#ffd166"/></svg>',
    ice: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" fill="#bfe9ff"/><path d="M8 8l8 8M16 8l-8 8M12 3v18M3 12h18" stroke="#ffffff" stroke-width="1.4" opacity=".85"/></svg>',
    stone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 19l2.8-8.5L11 6l6.8 4.6L20.5 19z" fill="#9a9c96"/><path d="M9 12l3.4 3.6L16 9.4" stroke="#5d605a" stroke-width="1.5" fill="none"/></svg>'
  };

  /* ============================ persistence ============================ */

  function loadSave() {
    var base = {
      stars: {}, sound: true, seen: {}, best: {}, albums: {}, seeds: 0, dev: false,
      bag: emptyBag(),
      energy: { lives: MAX_LIVES, at: Date.now() }
    };
    try {
      var raw = root.localStorage && root.localStorage.getItem(SAVE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          base.stars = parsed.stars || {};
          base.sound = parsed.sound !== false;
          base.seen = parsed.seen || {};
          base.best = parsed.best || {};
          base.albums = parsed.albums || {};
          base.seeds = parsed.seeds || 0;
          base.dev = !!parsed.dev;
          if (parsed.bag && typeof parsed.bag === 'object') {
            var kinds = Market.SPECIALS;
            for (var i = 0; i < kinds.length; i++) {
              base.bag[kinds[i]] = Math.max(0, parsed.bag[kinds[i]] || 0);
            }
          }
          if (parsed.energy && typeof parsed.energy === 'object') {
            base.energy.lives = Math.max(0, Math.min(MAX_LIVES, parsed.energy.lives == null ? MAX_LIVES : parsed.energy.lives));
            base.energy.at = parsed.energy.at || Date.now();
          }
        }
      }
    } catch (e) { /* private mode: progress simply will not persist */ }
    return base;
  }

  function emptyBag() {
    var bag = {};
    var kinds = Market.SPECIALS;
    for (var i = 0; i < kinds.length; i++) bag[kinds[i]] = 0;
    return bag;
  }

  function persist() {
    try {
      root.localStorage.setItem(SAVE_KEY, JSON.stringify({
        stars: save.stars,
        sound: save.sound,
        seen: save.seen,
        best: save.best,
        albums: save.albums,
        seeds: save.seeds,
        bag: save.bag,
        dev: save.dev,
        energy: save.energy
      }));
    } catch (e) { /* ignore */ }
  }

  function starsFor(num) { return save.stars[num] || 0; }
  function bestFor(num) { return save.best[num] || 0; }

  function totalStars() {
    var n = 0;
    for (var k in save.stars) if (save.stars[k]) n += save.stars[k];
    return n;
  }

  function totalBest() {
    var n = 0;
    for (var k in save.best) n += save.best[k] || 0;
    return n;
  }

  function clearedCount() {
    var n = 0;
    for (var k in save.stars) if (save.stars[k] > 0) n++;
    return n;
  }

  /* Chapters unlock one at a time: the first is always open. God mode opens
     the lot, which is what the developer panel leans on. */
  function unlockedCount() {
    if (save.dev) return Data.TOTAL;
    var n = 1;
    for (var i = 0; i < Data.CHAPTERS.length; i++) {
      if (starsFor(Data.CHAPTERS[i].num) > 0) n = i + 2; else break;
    }
    return Math.min(n, Data.TOTAL);
  }

  function nextChapter() { return Math.min(unlockedCount(), Data.TOTAL); }

  /* ============================== albums ============================== */

  /* One album per garden: twenty specimens each. */
  function albumCollected(garden) {
    var first = garden * Data.PER_GARDEN + 1;
    var n = 0;
    for (var i = 0; i < Data.PER_GARDEN; i++) if (starsFor(first + i) > 0) n++;
    return n;
  }

  function albumComplete(garden) { return albumCollected(garden) >= Data.PER_GARDEN; }

  function albumStars(garden) {
    var first = garden * Data.PER_GARDEN + 1;
    var n = 0;
    for (var i = 0; i < Data.PER_GARDEN; i++) n += starsFor(first + i);
    return n;
  }

  function albumsDone() {
    var n = 0;
    for (var g = 0; g < Data.GARDENS.length; g++) if (save.albums[g]) n++;
    return n;
  }

  /* ============================== energy ============================== */

  function energyTick() {
    var e = save.energy;
    var now = Date.now();
    if (!e.at) { e.at = now; return false; }
    if (e.lives >= MAX_LIVES) { e.at = now; return false; }
    var gained = Math.floor((now - e.at) / LIFE_MS);
    if (gained <= 0) return false;
    e.lives = Math.min(MAX_LIVES, e.lives + gained);
    e.at += gained * LIFE_MS;
    if (e.lives >= MAX_LIVES) e.at = now;
    return true;
  }

  function msToNextLife() {
    energyTick();
    if (save.energy.lives >= MAX_LIVES) return 0;
    return Math.max(0, save.energy.at + LIFE_MS - Date.now());
  }

  function spendLife() {
    energyTick();
    if (save.dev) return true;
    if (save.energy.lives <= 0) return false;
    if (save.energy.lives === MAX_LIVES) save.energy.at = Date.now();
    save.energy.lives--;
    persist();
    renderEnergy();
    return true;
  }

  function refillEnergy() {
    save.energy.lives = MAX_LIVES;
    save.energy.at = Date.now();
    persist();
    renderEnergy();
  }

  /* Buying leaves tops the meter up without disturbing the regen clock unless
     the meter is now full. */
  function addLives(n) {
    energyTick();
    if (n <= 0) return 0;
    var before = save.energy.lives;
    save.energy.lives = Math.min(MAX_LIVES, before + n);
    if (save.energy.lives >= MAX_LIVES) save.energy.at = Date.now();
    else if (!save.energy.at) save.energy.at = Date.now();
    persist();
    renderEnergy();
    return save.energy.lives - before;
  }

  /* ============================== helpers ============================== */

  function $(id) { return document.getElementById(id); }

  function wait(ms) {
    return new Promise(function (resolve) { root.setTimeout(resolve, ms); });
  }

  function fmt(n) {
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }

  /* "29:58" under an hour, "1h 04m" above it. */
  function fmtClock(ms) {
    var total = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(total / 60);
    var s = total % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60);
      m = m % 60;
      return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
    }
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  var HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.2s-7.6-4.8-9.4-9.3C.9 8 3.1 4.6 6.6 4.6c2.1 0 3.7 1.2 4.5 2.9l.9 1.9.9-1.9c.8-1.7 2.4-2.9 4.5-2.9 3.5 0 5.7 3.4 4 7.3-1.8 4.5-9.4 9.3-9.4 9.3z" fill="currentColor"/></svg>';

  function toast(message) {
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    root.clearTimeout(toastTimer);
    toastTimer = root.setTimeout(function () { el.toast.classList.remove('is-on'); }, 1700);
  }

  /* Every place the seed balance shows up, in one place. */
  function updateSeedDisplays() {
    var text = fmt(save.seeds);
    if (el.statSeeds) el.statSeeds.textContent = text;
    if (el.marketSeeds) el.marketSeeds.textContent = text;
    if (el.btnMarket) {
      var label = 'Market — ' + save.seeds + (save.seeds === 1 ? ' seed' : ' seeds');
      el.btnMarket.setAttribute('aria-label', label);
      el.btnMarket.title = label + '. Buy leaves and special pieces.';
    }
  }

  function flashWallet() {
    if (!el.marketWallet) return;
    el.marketWallet.classList.remove('is-flash');
    void el.marketWallet.offsetWidth;
    el.marketWallet.classList.add('is-flash');
  }

  /* =============================== sound =============================== */

  function ensureAudio() {
    if (actx) return actx;
    try {
      var Ctx = root.AudioContext || root.webkitAudioContext;
      if (Ctx) actx = new Ctx();
    } catch (e) { actx = null; }
    return actx;
  }

  function tone(freq, dur, vol, type, delay) {
    if (!save.sound) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    var t0 = ctx.currentTime + (delay || 0);
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.06 : vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  /* A short frequency slide — used for swooshes and stingers that a plain
     note cannot do. */
  function sweep(from, to, dur, vol, type) {
    if (!save.sound) return;
    var ctx = ensureAudio();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
    var t0 = ctx.currentTime;
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol == null ? 0.04 : vol, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function sfx(name, param) {
    if (!save.sound) return;
    if (name === 'swap') tone(330, 0.08, 0.04, 'sine');
    else if (name === 'clear') tone(520 + Math.min(param || 1, 6) * 70, 0.15, 0.045, 'triangle');
    else if (name === 'special') { tone(780, 0.15, 0.05, 'square'); tone(1060, 0.18, 0.04, 'square', 0.07); }
    else if (name === 'win') { tone(523, 0.18, 0.06); tone(659, 0.18, 0.06, 'triangle', 0.1); tone(784, 0.32, 0.06, 'triangle', 0.2); }
    else if (name === 'lose') { tone(300, 0.2, 0.05, 'sawtooth'); tone(200, 0.34, 0.05, 'sawtooth', 0.14); }
    else if (name === 'tap') tone(660, 0.05, 0.028, 'sine');
    else if (name === 'buy') { tone(880, 0.08, 0.05, 'triangle'); tone(1180, 0.13, 0.045, 'triangle', 0.07); }
    else if (name === 'error') tone(180, 0.16, 0.045, 'sawtooth');
    else if (name === 'back') { tone(430, 0.08, 0.035, 'sine'); tone(300, 0.12, 0.03, 'sine', 0.06); }
    else if (name === 'star') tone(700 + Math.min(param || 1, 3) * 170, 0.16, 0.05, 'triangle');
    else if (name === 'goal') { tone(720, 0.1, 0.045, 'triangle'); tone(980, 0.15, 0.04, 'triangle', 0.07); }
    else if (name === 'warn') tone(250, 0.18, 0.05, 'square');
    else if (name === 'swoosh') sweep(880, 300, 0.22, 0.03);
  }

  /* Haptics ride on the same switch as the sound, so muting the game also
     stops it drumming on the phone. */
  function buzz(pattern) {
    if (!save.sound) return;
    try {
      if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(pattern);
    } catch (e) { /* ignore */ }
  }

  /* ============================== screens ============================== */

  var screensBooted = false;   /* the first render is silent, later ones swoosh */

  function showScreen(name) {
    el.screenMap.classList.toggle('is-active', name === 'map');
    el.screenGame.classList.toggle('is-active', name === 'game');
    el.screenAlbum.classList.toggle('is-active', name === 'album');
    el.screenRank.classList.toggle('is-active', name === 'rank');
    el.screenMarket.classList.toggle('is-active', name === 'market');
    if (screensBooted) sfx('swoosh');
  }

  /* One place paints the world for a garden: the page backdrop and the app
     column both read from the vars this switches. */
  function setGardenTheme(garden) {
    var index = Math.max(0, Math.min(Data.GARDENS.length - 1, garden || 0));
    document.documentElement.setAttribute('data-garden', String(index));
  }

  /* A slow snowfall of leaves behind the app, so the desktop margins are
     scenery instead of dead space. Built once, then left to loop. */
  function buildAmbient() {
    if (el.ambient) return;
    var types = (Art.TYPES && Art.TYPES.length) || 7;
    var node = document.createElement('div');
    node.className = 'ambient';
    node.setAttribute('aria-hidden', 'true');
    var html = '';
    for (var i = 0; i < 14; i++) {
      var leaf = (i * 3 + 1) % types;
      var left = (i * 7.3 + 3) % 94;
      var dur = 26 + (i * 4.7) % 26;
      var delay = -((i * 3.3) % 34);
      var size = 13 + (i * 5) % 20;
      var spin = (i % 2 ? 1 : -1) * (180 + i * 37);
      html += '<span class="ambient-leaf" style="'
        + '--left:' + left.toFixed(1) + '%;'
        + '--size:' + size + 'px;'
        + '--dur:' + dur.toFixed(1) + 's;'
        + '--delay:' + delay.toFixed(1) + 's;'
        + '--spin:' + spin + 'deg;">'
        + Art.svgFor(leaf, null, null) + '</span>';
    }
    node.innerHTML = html;
    document.body.appendChild(node);
    el.ambient = node;
  }

  function renderMap() {
    setGardenTheme(game.activeGarden);
    el.statStars.textContent = totalStars();
    el.statCleared.textContent = clearedCount();
    el.statTotal.textContent = Data.TOTAL;
    el.statAlbums.textContent = albumsDone() + '/' + Data.GARDENS.length;
    updateSeedDisplays();
    renderEnergy();
    renderGardenTabs();
    renderGardenBanner();
    renderChapterGrid();
  }

  /* ------------------------------- energy ------------------------------- */

  function renderEnergy() {
    var changes = energyTick();
    if (changes) persist();
    var lives = save.dev ? MAX_LIVES : save.energy.lives;
    var full = lives >= MAX_LIVES;
    var left = msToNextLife();
    var text = lives + '/' + MAX_LIVES;

    [el.energyCountMap, el.energyCountGame].forEach(function (node) {
      if (node) node.textContent = String(lives);
    });
    if (el.energyTimerMap) el.energyTimerMap.textContent = full ? 'full' : fmtClock(left);
    [el.energyPillMap, el.energyPillGame].forEach(function (pill) {
      if (!pill) return;
      pill.classList.toggle('is-full', full);
      pill.classList.toggle('is-empty', !full && lives <= 0);
      pill.title = 'Energy ' + text + (full ? '' : ' · next leaf in ' + fmtClock(left));
    });
  }

  function startEnergyClock() {
    if (energyTimer) return;
    energyTimer = root.setInterval(function () {
      if (document.hidden) return;
      if (save.energy.lives < MAX_LIVES || save.dev) renderEnergy();
    }, 1000);
  }

  /* -------------------------------- map -------------------------------- */

  function renderGardenTabs() {
    el.gardenTabs.innerHTML = '';
    Data.GARDENS.forEach(function (garden, i) {
      var btn = document.createElement('button');
      btn.className = 'garden-tab' + (i === game.activeGarden ? ' is-active' : '');
      btn.textContent = (i * Data.PER_GARDEN + 1) + '–' + ((i + 1) * Data.PER_GARDEN);
      btn.addEventListener('click', function () {
        game.activeGarden = i;
        renderMap();
      });
      el.gardenTabs.appendChild(btn);
    });
  }

  function renderGardenBanner() {
    var g = game.activeGarden;
    var garden = Data.GARDENS[g];
    var first = g * Data.PER_GARDEN + 1;
    var last = first + Data.PER_GARDEN - 1;
    var got = albumCollected(g);
    var full = got >= Data.PER_GARDEN;
    var claimed = !!save.albums[g];
    var label = full ? (claimed ? 'Album ✓' : 'Reward ready') : 'Album';

    el.gardenBanner.innerHTML =
      '<div class="banner-row">'
      + '<strong>' + garden.name + '</strong>'
      + '<button class="banner-btn' + (full && !claimed ? ' is-ready' : '')
      + '" data-action="album">' + label + '</button>'
      + '</div>'
      + '<span class="banner-sub">' + garden.blurb + ' · chapters ' + first + '–' + last
      + ' · ' + albumStars(g) + '/' + (Data.PER_GARDEN * 3) + ' stars</span>'
      + '<div class="banner-album">'
      + '<span class="banner-count">' + got + '/' + Data.PER_GARDEN + ' specimens</span>'
      + '<span class="banner-bar"><i style="width:' + Math.round(got / Data.PER_GARDEN * 100) + '%"></i></span>'
      + '</div>';
  }

  function renderChapterGrid() {
    var first = game.activeGarden * Data.PER_GARDEN;
    var next = nextChapter();
    /* Anything freshly won gets its reveal animation exactly once. */
    var fresh = {};
    for (var key in newCards) fresh[key] = 1;
    newCards = {};
    el.chapterGrid.innerHTML = '';

    for (var i = first; i < first + Data.PER_GARDEN && i < Data.TOTAL; i++) {
      var chapter = Data.CHAPTERS[i];
      var stars = starsFor(chapter.num);
      var done = stars > 0;
      var locked = chapter.num > unlockedCount();
      var btn = document.createElement('button');
      btn.className = 'chapter'
        + (locked ? ' is-locked' : '')
        + (chapter.num === next && !locked ? ' is-next' : '')
        + (done ? ' card-tile is-done' : '')
        + (fresh[chapter.num] ? ' is-new' : '');
      btn.setAttribute('aria-label', 'Chapter ' + chapter.num + ' — ' + chapter.name);

      var starRow = '';
      for (var s = 1; s <= 3; s++) starRow += s <= stars ? '<span class="on">★</span>' : '<span>★</span>';

      if (locked) {
        btn.innerHTML = '<span class="chapter-no">🔒</span>';
      } else if (done) {
        btn.innerHTML = Spec.card(chapter)
          + '<span class="tile-no">' + chapter.num + '</span>'
          + '<span class="tile-stars">' + starRow + '</span>';
      } else {
        btn.innerHTML = '<span class="chapter-no">' + chapter.num + '</span>'
          + '<span class="chapter-stars">' + starRow + '</span>';
      }

      if (!locked) {
        (function (num) {
          btn.addEventListener('click', function () { startChapter(num); });
        })(chapter.num);
      }
      el.chapterGrid.appendChild(btn);
    }
  }

  /* ============================== chapter ============================== */

  function startChapter(num, force) {
    var chapter = Data.CHAPTERS[num - 1];
    if (!chapter) return;
    if (!force && num > unlockedCount()) return;
    /* Every attempt costs a leaf. God mode and dev jumps are free. */
    if (!force && !spendLife()) { pendingStart = num; showEnergyOverlay(); return; }

    cfg = chapter;
    game.num = num;
    game.run++;
    pendingStart = 0;
    game.activeGarden = chapter.garden;
    game.score = 0;
    tutorialQueue.length = 0;      /* a restart cancels any pending first-time card */
    resolveTutorial();
    game.moves = chapter.moves;
    game.busy = false;
    game.over = false;
    game.origin = null;
    game.pending = null;
    game.drag = null;
    game.iceDone = 0;
    game.stoneDone = 0;
    game.collect = {};
    game.arm = null;
    game.shown = 0;
    game.scoreTimer = null;
    game.lowWarned = -1;
    game.adContinues = 0;
    setGardenTheme(chapter.garden);

    for (var i = 0; i < chapter.objectives.length; i++) {
      var objective = chapter.objectives[i];
      if (objective.kind === 'collect') game.collect[objective.leaf] = 0;
    }

    board = new E.LeafBoard({
      rows: chapter.rows,
      cols: chapter.cols,
      typeCount: chapter.typeCount,
      seed: chapter.seed,
      stones: chapter.stones,
      ice: chapter.ice
    });

    el.gameNum.textContent = 'Chapter ' + num;
    el.gameName.textContent = chapter.name;
    el.scoreTarget.textContent = '/ ' + fmt(chapter.scoreTarget);

    hideOverlay();
    showScreen('game');          /* the board can only be measured once it is visible */
    buildBoard();
    renderObjectives();
    updateHud();
    if (el.board) el.board.classList.remove('is-placing');
    renderBag();
    armHint();
    relayoutSoon();
    dropInBoard();
  }

  /* One more measure after the browser has painted, in case fonts or the
     viewport settled after the first layout. */
  function relayoutSoon() {
    var raf = root.requestAnimationFrame || function (fn) { return root.setTimeout(fn, 16); };
    raf(function () { onResize(); });
  }

  /* The leaves rain in from above when a chapter opens. Queued after
     relayoutSoon's frame, so the board is measured first; input is held until
     the last row lands, because a tap on a moving tile would read the wrong
     cell. */
  function dropInBoard() {
    if (!board || !el.board) return;
    var token = game.run;
    var raf = root.requestAnimationFrame || function (fn) { return root.setTimeout(fn, 16); };
    game.busy = true;

    raf(function () {
      if (token !== game.run || !board || !el.board) return;
      var size = metrics.size, gap = metrics.gap;
      var fullH = size * board.rows + gap * (board.rows + 1);
      var r, c, tile, node;

      /* Park every tile just above the board in one silent frame... */
      el.board.classList.add('no-anim');
      for (r = 0; r < board.rows; r++) {
        for (c = 0; c < board.cols; c++) {
          tile = board.cells[r][c].tile;
          node = tile ? tileEls[tile.id] : null;
          if (!node) continue;
          node.style.transform = 'translate(' + (gap + c * (size + gap)) + 'px,'
            + (gap + r * (size + gap) - fullH) + 'px)';
        }
      }
      void el.board.offsetHeight;
      el.board.classList.remove('no-anim');

      /* ...then let each row fall in, one after the other. */
      var last = 0;
      for (r = 0; r < board.rows; r++) {
        (function (row) {
          var delay = row * 28;
          if (delay > last) last = delay;
          root.setTimeout(function () {
            if (token !== game.run || !board) return;
            for (var cc = 0; cc < board.cols; cc++) {
              var cell = board.cells[row] && board.cells[row][cc];
              var t = cell ? cell.tile : null;
              var n = t ? tileEls[t.id] : null;
              if (!n) continue;
              n.style.setProperty('--sw', (330 + row * 22) + 'ms');
              setTilePos(n, row, cc);
            }
          }, delay);
        })(r);
      }

      root.setTimeout(function () {
        if (token !== game.run) return;
        game.busy = false;
        armHint();
      }, last + 420);
    });
  }

  /* =============================== board =============================== */

  function buildBoard() {
    el.board.innerHTML = '';
    tileEls = {};
    stoneEls = {};
    cellEls = [];
    iceEls = [];
    el.board.style.background = '';

    for (var r = 0; r < board.rows; r++) {
      cellEls[r] = [];
      iceEls[r] = [];
      for (var c = 0; c < board.cols; c++) {
        var cellEl = document.createElement('div');
        cellEl.className = 'cell';
        el.board.appendChild(cellEl);
        cellEls[r][c] = cellEl;

        var cell = board.cells[r][c];
        if (cell.stone) createStone(r, c, cell.stone);

        var iceEl = document.createElement('div');
        iceEl.className = 'ice';
        el.board.appendChild(iceEl);
        iceEls[r][c] = iceEl;

        if (cell.tile) createTile(cell.tile, r, c);
      }
    }
    syncIce(false);
    layoutBoard();
  }

  function createStone(r, c, hp) {
    var node = document.createElement('div');
    node.className = 'stone' + (hp === 1 && maxStoneHp(r, c) > 1 ? ' is-cracked' : '');
    node.dataset.cell = r + ':' + c;
    el.board.appendChild(node);
    stoneEls[r + ':' + c] = node;
    return node;
  }

  function maxStoneHp(r, c) {
    for (var i = 0; i < cfg.stones.length; i++) {
      if (cfg.stones[i][0] === r && cfg.stones[i][1] === c) return cfg.stones[i][2] || 1;
    }
    return 1;
  }

  function createTile(tile, r, c) {
    var node = document.createElement('div');
    node.className = 'tile' + (tile.special === 'golden' ? ' leaf-golden' : '');
    node.dataset.id = String(tile.id);
    node.__tile = tile;
    node.innerHTML = '<div class="tile-inner">' + Art.svgFor(tile.leaf, tile.special, tile.dir) + '</div>';
    node.style.width = metrics.size + 'px';
    node.style.height = metrics.size + 'px';
    el.board.appendChild(node);
    tileEls[tile.id] = node;
    setTilePos(node, r, c);
    return node;
  }

  function setTilePos(node, r, c) {
    var x = metrics.gap + c * (metrics.size + metrics.gap);
    var y = metrics.gap + r * (metrics.size + metrics.gap);
    node.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }

  function slideTile(tile, cell) {
    var node = tileEls[tile.id];
    if (!node) return;
    node.style.setProperty('--sw', SWAP_MS + 'ms');
    setTilePos(node, cell.r, cell.c);
  }

  function layoutBoard() {
    var wrap = el.boardWrap;
    var cols = board.cols;
    var rows = board.rows;
    var availW = Math.max(120, wrap.clientWidth - 8);
    var availH = Math.max(120, wrap.clientHeight - 8);
    var gap = 3;
    var size = Math.floor(Math.min(
      (availW - gap * (cols + 1)) / cols,
      (availH - gap * (rows + 1)) / rows,
      68
    ));
    if (!(size > 12)) size = 24;
    metrics.size = size;
    metrics.gap = gap;

    el.board.style.width = (size * cols + gap * (cols + 1)) + 'px';
    el.board.style.height = (size * rows + gap * (rows + 1)) + 'px';
    el.board.classList.add('no-anim');

    var r, c, x, y, node;
    for (r = 0; r < rows; r++) {
      for (c = 0; c < cols; c++) {
        x = gap + c * (size + gap);
        y = gap + r * (size + gap);
        node = cellEls[r][c];
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        node.style.width = size + 'px';
        node.style.height = size + 'px';
        node = iceEls[r][c];
        node.style.left = x + 'px';
        node.style.top = y + 'px';
        node.style.width = size + 'px';
        node.style.height = size + 'px';
        node = stoneEls[r + ':' + c];
        if (node) {
          node.style.left = x + 'px';
          node.style.top = y + 'px';
          node.style.width = size + 'px';
          node.style.height = size + 'px';
        }
      }
    }

    for (var id in tileEls) {
      node = tileEls[id];
      node.style.width = size + 'px';
      node.style.height = size + 'px';
    }
    positionAllTiles();

    void el.board.offsetHeight;
    el.board.classList.remove('no-anim');
  }

  function positionAllTiles() {
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        var tile = board.cells[r][c].tile;
        if (tile && tileEls[tile.id]) setTilePos(tileEls[tile.id], r, c);
      }
    }
  }

  /* Frost lives on the cell, so the overlay is refreshed from the model. */
  function applyIceState(node, layers, animate) {
    if (layers > 0) {
      node.classList.remove('is-breaking');
      node.classList.remove('hidden');
      node.classList.toggle('ice-2', layers >= 2);
      return;
    }
    if (node.classList.contains('hidden') || node.classList.contains('is-breaking')) return;
    if (!animate) {
      node.classList.add('hidden');
      return;
    }
    node.classList.add('is-breaking');
    (function (n) {
      root.setTimeout(function () {
        n.classList.add('hidden');
        n.classList.remove('is-breaking');
      }, 320);
    })(node);
  }

  function syncIce(animate) {
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        applyIceState(iceEls[r][c], board.cells[r][c].ice, animate);
      }
    }
  }

  /* Redraw every tile from the model: used after a shuffle. */
  function refreshTileArt() {
    for (var r = 0; r < board.rows; r++) {
      for (var c = 0; c < board.cols; c++) {
        var tile = board.cells[r][c].tile;
        if (!tile) continue;
        var node = tileEls[tile.id];
        if (!node) { createTile(tile, r, c); continue; }
        node.__tile = tile;
        node.classList.toggle('leaf-golden', tile.special === 'golden');
        node.innerHTML = '<div class="tile-inner">' + Art.svgFor(tile.leaf, tile.special, tile.dir) + '</div>';
      }
    }
  }

  /* ============================== HUD ============================== */

  function renderObjectives() {
    el.objectives.innerHTML = '';
    cfg.objectives.forEach(function (objective, i) {
      var chip = document.createElement('div');
      chip.className = 'objective';
      chip.dataset.index = String(i);

      var icon;
      if (objective.kind === 'collect') icon = Art.svgFor(objective.leaf, null, null);
      else icon = ICONS[objective.kind] || ICONS.score;

      chip.innerHTML = '<span class="obj-icon">' + icon + '</span><span class="obj-text"></span>';
      el.objectives.appendChild(chip);
    });
  }

  function objectiveText(objective) {
    if (objective.kind === 'score') return fmt(Math.min(game.score, objective.target)) + '/' + fmt(objective.target);
    if (objective.kind === 'collect') return Math.min(game.collect[objective.leaf] || 0, objective.count) + '/' + objective.count;
    if (objective.kind === 'ice') return Math.min(game.iceDone, objective.count) + '/' + objective.count;
    return Math.min(game.stoneDone, objective.count) + '/' + objective.count;
  }

  function objectiveDone(objective) {
    if (objective.kind === 'score') return game.score >= objective.target;
    if (objective.kind === 'collect') return (game.collect[objective.leaf] || 0) >= objective.count;
    if (objective.kind === 'ice') return game.iceDone >= objective.count;
    return game.stoneDone >= objective.count;
  }

  function allObjectivesDone() {
    for (var i = 0; i < cfg.objectives.length; i++) {
      if (!objectiveDone(cfg.objectives[i])) return false;
    }
    return true;
  }

  /* Restart a CSS animation by name, and clear it once it has played. */
  function flashClass(node, cls, ms) {
    if (!node) return;
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    root.setTimeout(function () { node.classList.remove(cls); }, ms);
  }

  /* Rattle the app column. Bigger blasts shake harder. */
  function shakeApp(strength) {
    var app = el.app;
    if (!app) return;
    var cls = 'shake-' + (strength || 'sm');
    app.classList.remove('shake-sm', 'shake-md', 'shake-lg');
    void app.offsetWidth;
    app.classList.add(cls);
    root.setTimeout(function () { app.classList.remove(cls); }, 520);
  }

  /* The board's big centred shout-out: cascade words and move warnings. */
  function callout(text, extra) {
    if (!el.board || !text) return;
    var node = document.createElement('div');
    node.className = 'combo-call' + (extra ? ' ' + extra : '');
    node.textContent = text;
    el.board.appendChild(node);
    root.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 1000);
  }

  /* Speed up to a target rather than snapping, so points have weight. */
  function scoreTick() {
    game.scoreTimer = null;
    if (!el.score) return;
    var diff = game.score - game.shown;
    if (!diff) return;
    var step = Math.max(1, Math.ceil(Math.abs(diff) * 0.28));
    game.shown += diff > 0 ? Math.min(step, diff) : -Math.min(step, -diff);
    el.score.textContent = fmt(game.shown);
    if (game.shown !== game.score) game.scoreTimer = root.setTimeout(scoreTick, 34);
  }

  function tenseBoard(moves) {
    flashClass(el.board, 'is-tense', 2300);
    callout(moves === 1 ? 'Last move!' : moves + ' moves left', 'is-warn');
    sfx('warn');
    buzz(18);
  }

  function updateHud() {
    el.movesLeft.textContent = game.moves;
    el.meterMoves.classList.toggle('is-low', game.moves <= 5);

    if (game.score !== game.shown && !game.scoreTimer) {
      game.scoreTimer = root.setTimeout(scoreTick, 34);
    }
    if (game.score !== game.shown) flashClass(el.meterScore, 'is-bump', 320);

    if (game.moves > 0 && game.moves <= 3 && game.moves !== game.lowWarned) {
      game.lowWarned = game.moves;
      tenseBoard(game.moves);
    }

    var chips = el.objectives.children;
    for (var i = 0; i < chips.length; i++) {
      var objective = cfg.objectives[i];
      if (!objective) continue;
      var chip = chips[i];
      var text = chip.querySelector('.obj-text');
      var line = objectiveText(objective);
      var done = objectiveDone(objective);
      var wasDone = chip.classList.contains('is-done');

      if (text && text.textContent !== line) {
        text.textContent = line;
        if (!wasDone) flashClass(chip, 'is-bump', 380);
      }
      chip.classList.toggle('is-done', done);
      if (done && !wasDone) {
        flashClass(chip, 'is-cheer', 700);
        sfx('goal');
        buzz(14);
      }
    }
  }

  /* ============================== scoring ============================== */

  function applyResult(res, combo) {
    var gained = res.cleared.length * 25 * combo;
    if (res.activated && res.activated.length) gained += res.activated.length * 60;
    if (res.created && res.created.length) gained += res.created.length * 100;
    if (res.iceCleared) gained += res.iceCleared * 40;
    if (res.brokenStones && res.brokenStones.length) gained += res.brokenStones.length * 90;
    game.score += gained;

    for (var i = 0; i < res.cleared.length; i++) {
      var leaf = res.cleared[i].leaf;
      if (leaf >= 0 && game.collect[leaf] !== undefined) game.collect[leaf]++;
    }
    game.iceDone += res.iceCleared || 0;
    game.stoneDone += (res.brokenStones || []).length;
    return gained;
  }

  function spawnPopup(r, c, text, extra) {
    var node = document.createElement('div');
    node.className = 'pop-up' + (extra ? ' ' + extra : '');
    node.textContent = text;
    var x = metrics.gap + c * (metrics.size + metrics.gap);
    var y = metrics.gap + r * (metrics.size + metrics.gap);
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.width = metrics.size + 'px';
    node.style.textAlign = 'center';
    el.board.appendChild(node);
    root.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 900);
  }

  function spawnBadge(r, c, text) {
    spawnPopup(r, c, text, 'is-badge');
  }

  var SPECIAL_NAMES = { line: 'Line leaf!', bomb: 'Seed bomb!', golden: 'Golden leaf!' };

  /* Paint the reach of a special that just went off. */
  function spawnBlast(r, c, kind, dir) {
    var size = metrics.size, gap = metrics.gap;
    var fullW = size * board.cols + gap * (board.cols + 1);
    var fullH = size * board.rows + gap * (board.rows + 1);
    var x = gap + c * (size + gap);
    var y = gap + r * (size + gap);
    var node = document.createElement('div');
    node.className = 'blast';

    if (kind === 'line') {
      node.className += ' blast-line' + (dir === 'v' ? ' is-v' : '');
      if (dir === 'v') {
        node.style.left = x + 'px';
        node.style.top = '0px';
        node.style.width = size + 'px';
        node.style.height = fullH + 'px';
      } else {
        node.style.left = '0px';
        node.style.top = y + 'px';
        node.style.width = fullW + 'px';
        node.style.height = size + 'px';
      }
    } else if (kind === 'bomb') {
      var span = size * 3 + gap * 2;
      node.className += ' blast-ring';
      node.style.left = (x + size / 2 - span / 2) + 'px';
      node.style.top = (y + size / 2 - span / 2) + 'px';
      node.style.width = span + 'px';
      node.style.height = span + 'px';
    } else {
      node.className += ' blast-board';
      node.style.left = '0px';
      node.style.top = '0px';
      node.style.width = fullW + 'px';
      node.style.height = fullH + 'px';
    }

    el.board.appendChild(node);
    /* Rattle the column, scaled to how much of the board it just took. */
    shakeApp(kind === 'line' ? 'sm' : (kind === 'bomb' ? 'md' : 'lg'));
    buzz(kind === 'line' ? 12 : 24);
    root.setTimeout(function () {
      if (node.parentNode) node.parentNode.removeChild(node);
    }, 640);
  }

  /* Pop the cleared leaves and report how long the renderer should wait. */
  function animateClear(res, combo, gained) {
    var nodes = [];
    var maxDelay = 0;
    var sumR = 0, sumC = 0, n = 0;

    /* Every special that went off throws its sweep before the leaves pop. */
    (res.activated || []).forEach(function (sp) {
      spawnBlast(sp.r, sp.c, sp.special, sp.dir);
    });

    for (var i = 0; i < res.cleared.length; i++) {
      var cl = res.cleared[i];
      var node = tileEls[cl.id];
      if (!node) continue;
      delete tileEls[cl.id];
      nodes.push(node);

      var delay = 0;
      if (game.origin) {
        var dist = Math.abs(cl.r - game.origin.r) + Math.abs(cl.c - game.origin.c);
        delay = Math.min(240, dist * 30);
      }
      node.style.setProperty('--sw', '0ms');
      node.classList.add('is-clear');
      var inner = node.firstChild;
      if (inner) inner.style.animationDelay = delay + 'ms';
      if (delay > maxDelay) maxDelay = delay;

      sumR += cl.r;
      sumC += cl.c;
      n++;
    }

    if (n) {
      var label = '+' + fmt(gained);
      if (combo > 1) label += ' x' + combo;
      spawnPopup(Math.round(sumR / n), Math.round(sumC / n), label);
    }

    if (res.comboLabel) {
      var at = game.origin || { r: Math.round(sumR / Math.max(1, n)), c: Math.round(sumC / Math.max(1, n)) };
      spawnBadge(at.r, at.c, res.comboLabel);
    }

    /* A deep cascade earns a word across the middle of the board. */
    if (combo > 1) {
      callout(COMBO_WORDS[Math.min(combo, COMBO_WORDS.length - 1)]);
      if (combo >= 3) buzz(12);
    }

    syncIce(true);
    syncStones(res);
    return { delay: maxDelay, nodes: nodes };
  }

  function syncStones(res) {
    if (!res) return;
    (res.brokenStones || []).forEach(function (broken) {
      var k = broken.r + ':' + broken.c;
      var node = stoneEls[k];
      if (!node) return;
      delete stoneEls[k];
      node.classList.add('is-breaking');
      root.setTimeout(function () { if (node.parentNode) node.parentNode.removeChild(node); }, 320);
    });
    (res.stoneHits || []).forEach(function (hit) {
      var node = stoneEls[hit.r + ':' + hit.c];
      var cell = board.cells[hit.r][hit.c];
      if (node && cell.stone === 1) node.classList.add('is-cracked');
    });
  }

  /* Pop a freshly created tile, then drop the class so the clear animation
     can still play if it is matched again straight away. */
  function spawnPop(node) {
    node.classList.add('is-spawn');
    root.setTimeout(function () { node.classList.remove('is-spawn'); }, 360);
  }

  /* Slide every tile gravity moved, and drop in the new ones. */
  function animateMoves(moves) {
    var maxDur = 0;
    var plan = [];

    for (var i = 0; i < moves.length; i++) {
      var mv = moves[i];
      var node = tileEls[mv.tile.id];
      if (!node) node = createTile(mv.tile, mv.from.r, mv.from.c);
      var dist = Math.abs(mv.to.r - mv.from.r) + Math.abs(mv.to.c - mv.from.c);
      var dur = FALL_BASE + dist * FALL_PER_ROW;
      if (dur > maxDur) maxDur = dur;
      node.style.setProperty('--sw', dur + 'ms');
      if (mv.isNew) spawnPop(node);
      plan.push({ node: node, r: mv.to.r, c: mv.to.c });
    }

    void el.board.offsetHeight;              /* commit the start positions */
    for (var j = 0; j < plan.length; j++) setTilePos(plan[j].node, plan[j].r, plan[j].c);
    return maxDur;
  }

  /* ============================ the cascade ============================ */

  /* Two special pieces swapped together: hand the work to the engine and keep
     the shout-out label for the renderer. */
  function comboBlast(combo) {
    var res = board.resolveClear(combo.cells);
    res.created = [];
    res.groups = [];
    res.comboLabel = combo.label;
    sfx('special');
    return res;
  }

  async function runCascade(first, origin) {
    var res = first;
    var combo = 0;
    var prefer = origin;
    var token = game.run;

    while (res) {
      combo++;
      var gained = applyResult(res, combo);
      updateHud();

      /* A moment of stillness before a big clear lands: the hit-stop is what
         makes a bomb or a long cascade feel heavy. */
      if (res.cleared.length >= 6 || (res.activated && res.activated.length)) {
        await wait(70);
        if (token !== game.run) return;
      }

      var info = animateClear(res, combo, gained);
      if (res.cleared.length) sfx('clear', combo);
      if (res.created && res.created.length) sfx('special');

      await wait(info.delay + CLEAR_MS);
      for (var i = 0; i < info.nodes.length; i++) {
        if (info.nodes[i].parentNode) info.nodes[i].parentNode.removeChild(info.nodes[i]);
      }

      if (res.created) {
        res.created.forEach(function (made) {
          spawnPop(createTile(made.tile, made.r, made.c));
          spawnBadge(made.r, made.c, SPECIAL_NAMES[made.tile.special] || 'Special!');
          noteTutorial(made.tile.special);
        });
      }
      syncIce(false);

      var drop = board.gravity();
      if (drop.moves.length) await wait(animateMoves(drop.moves) + 20);

      if (!res.cleared.length && !(res.created && res.created.length)) break;
      res = board.resolveStep(prefer);
      prefer = null;
    }

    if (game.over) return;
    if (!board.anyMoves()) {
      toast('No moves left — reshuffling');
      await wait(340);
      board.shuffle();
      refreshTileArt();
    }
  }

  async function attemptSwap(a, b) {
    if (game.busy || game.over || !board) return;
    clearHint();
    var token = game.run;

    if (!board.canSwap(a, b)) {
      shakeCell(a);
      return;
    }

    var ta = board.tile(a.r, a.c);
    var tb = board.tile(b.r, b.c);
    var combo = board.comboInfo(a, b);

    game.busy = true;
    game.pending = null;
    setSelection(null);

    board.swapTiles(a, b);
    slideTile(ta, b);
    slideTile(tb, a);
    sfx('swap');
    await wait(SWAP_MS);

    game.origin = b;
    var res = combo ? comboBlast(combo) : board.resolveStep(b);

    if (!res) {
      board.swapTiles(a, b);
      slideTile(ta, a);
      slideTile(tb, b);
      await wait(SWAP_MS);
      shakeCell(a);
      shakeCell(b);
      game.origin = null;
      game.busy = false;
      armHint();
      return;
    }

    game.moves = Math.max(0, game.moves - 1);
    updateHud();

    await runCascade(res, b);
    await showTutorials();                 /* first-time cards pause the board */
    if (game.run !== token) return;        /* the chapter was restarted mid-card */
    game.origin = null;
    game.busy = false;

    if (!game.over) {
      checkEnd();
      if (!game.over) armHint();
    }
  }

  /* ============================ end of chapter ============================ */

  function checkEnd() {
    if (game.over) return;
    if (allObjectivesDone()) { win(); return; }
    if (game.moves <= 0) { lose(); }
  }

  function starRow(stars) {
    var out = '';
    for (var s = 1; s <= 3; s++) out += '<span class="' + (s <= stars ? 'on' : '') + '">★</span>';
    return out;
  }

  /* Everything still in hand is cashed in before the stars are handed out:
     every unused move is worth points, and any special pieces left on the
     board go off in one last sweep. Returns the bonus that was awarded. */
  async function finishBonus(token) {
    var none = { total: 0, moves: 0, sweep: 0 };
    var movesBonus = 0, sweepBonus = 0, r, c;

    if (game.moves > 0) {
      movesBonus = game.moves * MOVE_BONUS;
      game.score += movesBonus;
      updateHud();
      toast(game.moves + ' moves left — bonus ' + fmt(movesBonus));
      sfx('special');
      await wait(780);
      if (token !== game.run) return none;      /* the chapter was restarted */
    }

    var specials = [];
    for (r = 0; r < board.rows; r++) {
      for (c = 0; c < board.cols; c++) {
        var tile = board.tile(r, c);
        if (tile && tile.special) specials.push({ r: r, c: c });
      }
    }

    if (specials.length) {
      var before = game.score;
      var res = board.resolveClear(specials);
      res.created = [];
      res.groups = [];
      game.origin = null;
      await runCascade(res, null);              /* the game is over, so it just plays out */
      sweepBonus = game.score - before;
      if (token !== game.run) return none;
    }

    return { total: movesBonus + sweepBonus, moves: movesBonus, sweep: sweepBonus };
  }

  async function win() {
    game.over = true;
    clearHint();
    cancelArm();
    sfx('win');
    buzz([0, 26, 46, 26]);
    shakeApp('md');

    var token = game.run;
    var bonus = { total: 0, moves: 0, sweep: 0 };
    try {
      bonus = await finishBonus(token);
    } catch (e) { /* never withhold the result screen because of a bonus */ }
    if (token !== game.run) return;              /* restarted mid-bonus */

    var stars = 1;
    if (game.score >= cfg.stars[2]) stars = 3;
    else if (game.score >= cfg.stars[1]) stars = 2;

    var had = starsFor(game.num);
    var isNew = had === 0;
    if (stars > had) save.stars[game.num] = stars;
    if (game.score > bestFor(game.num)) save.best[game.num] = game.score;
    if (isNew) newCards[game.num] = 1;

    var seeds = 6 + stars * 4;
    save.seeds += seeds;

    var garden = cfg.garden;
    var got = albumCollected(garden);
    var albumJustDone = false;
    if (!save.albums[garden] && got >= Data.PER_GARDEN) {
      save.albums[garden] = 1;
      albumJustDone = true;
    }
    persist();
    if (albumJustDone) refillEnergy();      /* the album reward: a full tank */
    renderEnergy();

    var hasNext = game.num < Data.TOTAL;
    /* The card opens empty: the score rolls up, then the stars drop in one at
       a time, then everything else arrives together. */
    showOverlay(
      '<h2>Chapter cleared</h2>'
      + '<p>' + cfg.name + ' — ' + cfg.gardenName + '</p>'
      + '<div class="overlay-stars" data-star-row>' + starRow(0) + '</div>'
      + '<div class="overlay-score is-live">Score <b data-score>0</b> · best '
      + fmt(bestFor(game.num)) + '</div>'
      + '<div class="overlay-stage" hidden>'
      + (isNew ? '<div class="overlay-new">New specimen</div>' : '')
      + '<div class="overlay-specimen"><div class="specimen-holder">' + Spec.card(cfg) + '</div></div>'
      + '<div class="overlay-meta">' + Data.GARDENS[garden].name + ' album · '
      + got + '/' + Data.PER_GARDEN + ' specimens · +' + seeds + ' seeds</div>'
      + (bonus.total > 0
        ? '<div class="overlay-bonus">Includes <b>' + fmt(bonus.total) + '</b> bonus'
          + (bonus.moves ? ' · ' + game.moves + ' unused moves' : '')
          + (bonus.sweep ? ' · leftover specials' : '') + '</div>'
        : '')
      + (albumJustDone
        ? '<div class="overlay-album">' + Spec.albumArt(garden) + '</div>'
          + '<div class="overlay-reward"><strong>Album complete!</strong> '
          + Data.GARDENS[garden].name + ' is full — energy refilled and its plate added to the shelf.</div>'
        : '')
      + '<div class="overlay-goal">★★ from ' + fmt(cfg.stars[1]) + ' · ★★★ from ' + fmt(cfg.stars[2]) + '</div>'
      + '<div class="overlay-actions">'
      + (hasNext ? '<button class="btn btn-primary btn-wide" data-action="next">Next chapter</button>' : '')
      + '<div class="overlay-row">'
      + '<button class="btn btn-ghost" data-action="album">Album</button>'
      + '<button class="btn btn-ghost" data-action="retry">Replay</button>'
      + '<button class="btn btn-ghost" data-action="map">Gardens</button>'
      + '</div></div>'
      + '</div>'
    );

    revealWin(stars, token);
  }

  /* The win card's opening: a rolling score, then one star at a time. A tap or
     Escape skips straight to the end. */
  var reveal = { active: false, skipping: false };

  function skipReveal() {
    if (reveal.active) reveal.skipping = true;
  }

  async function revealWin(stars, token) {
    reveal.active = true;
    reveal.skipping = false;

    var alive = function () {
      return token === game.run && !el.overlay.classList.contains('hidden');
    };
    /* Always clear the flag, even when the card is torn down mid-reveal:
       otherwise Escape would be swallowed by a reveal that is already over. */
    var stop = function () {
      reveal.active = false;
      reveal.skipping = false;
    };
    var target = game.score;
    var scoreNode = el.overlayCard.querySelector('[data-score]');

    if (scoreNode) {
      var dur = 520;
      var t0 = Date.now();
      while (!reveal.skipping) {
        var elapsed = Date.now() - t0;
        if (elapsed >= dur) break;
        var k = elapsed / dur;
        scoreNode.textContent = fmt(Math.round(target * (1 - Math.pow(1 - k, 3))));
        await wait(16);
        if (!alive()) { stop(); return; }
      }
      scoreNode.textContent = fmt(target);
    }

    var row = el.overlayCard.querySelector('[data-star-row]');
    var spans = row ? row.children : [];
    for (var s = 1; s <= stars; s++) {
      var star = spans[s - 1];
      if (star) {
        star.classList.add('on');
        flashClass(star, 'is-pop', 520);
      }
      sfx('star', s);
      buzz(16);
      if (!reveal.skipping && s < stars) {
        await wait(230);
        if (!alive()) { stop(); return; }
      }
    }

    var stage = el.overlayCard.querySelector('.overlay-stage');
    if (stage) stage.hidden = false;
    stop();
  }

  function lose() {
    game.over = true;
    clearHint();
    cancelArm();
    sfx('lose');
    buzz([0, 60, 60, 60]);
    shakeApp('md');
    var missing = [];
    for (var i = 0; i < cfg.objectives.length; i++) {
      if (!objectiveDone(cfg.objectives[i])) missing.push(objectiveText(cfg.objectives[i]));
    }
    var spot = game.adContinues < AD_CONTINUE_LIMIT
      ? '<button class="btn btn-ad btn-wide" data-action="ad-continue">&#9654; Watch a short ad &mdash; +'
        + AD_MOVE_BONUS + ' moves</button>'
      : '';
    showOverlay(
      '<h2>Out of moves</h2>'
      + '<p>Still needed: ' + (missing.join(' · ') || 'a little more luck') + '</p>'
      + '<div class="overlay-score">Score <b>' + fmt(game.score) + '</b> of ' + fmt(cfg.scoreTarget) + '</div>'
      + '<div class="overlay-actions">'
      + spot
      + '<button class="btn btn-primary btn-wide" data-action="retry">Try again</button>'
      + '<button class="btn btn-ghost" data-action="map">Chapters</button>'
      + '</div>'
    );
  }

  /* A watched spot paid out: breathe on the embers and hand the chapter
     a few more moves. The board is still standing - lose() never touches it
     - so the run resumes where it stalled. */
  function grantMoves() {
    game.adContinues++;
    game.over = false;
    game.busy = false;
    game.moves += AD_MOVE_BONUS;
    game.lowWarned = -1;
    hideOverlay();
    updateHud();
    callout('+' + AD_MOVE_BONUS + ' moves');
    sfx('goal');
    buzz(16);
    armHint();
  }

  function showOverlay(html) {
    el.overlayCard.innerHTML = html;
    el.overlay.classList.remove('hidden');
  }

  function hideOverlay() {
    reveal.active = false;
    reveal.skipping = false;
    el.overlay.classList.add('hidden');
    el.overlayCard.innerHTML = '';
  }

  /* ============================ energy dialog ============================ */

  function showEnergyOverlay() {
    energyTick();
    var canRefill = save.seeds >= REFILL_SEEDS;
    var canWatch = save.energy.lives < MAX_LIVES;
    showOverlay(
      '<h2>Out of energy</h2>'
      + '<p>Each attempt costs one leaf.</p>'
      + '<div class="overlay-energy">'
      + '<span class="energy-big">' + save.energy.lives + '<i>/' + MAX_LIVES + '</i></span>'
      + '<span class="energy-eta">Next leaf in <b>' + fmtClock(msToNextLife()) + '</b></span>'
      + '</div>'
      + '<div class="overlay-meta">Seeds: <b>' + fmt(save.seeds) + '</b> · a refill costs ' + REFILL_SEEDS + '</div>'
      + '<div class="overlay-actions">'
      + (canWatch
        ? '<button class="btn btn-ad btn-wide" data-action="ad-energy">&#9654; Watch a short ad &mdash; 1 free leaf</button>'
        : '')
      + '<button class="btn btn-primary btn-wide' + (canRefill ? '' : ' is-muted')
      + '" data-action="refill">Refill — ' + REFILL_SEEDS + ' seeds</button>'
      + '<div class="overlay-row">'
      + '<button class="btn btn-ghost" data-action="market">Market</button>'
      + '<button class="btn btn-ghost" data-action="map">Gardens</button>'
      + '</div></div>'
    );
  }

  /* ========================= market and bag ========================= */

  /* Opened from the map nav chip or the bag strip. */
  function showMarket(from) {
    game.marketFrom = from || (el.screenGame.classList.contains('is-active') ? 'game' : 'map');
    renderMarket();
    showScreen('market');
  }

  function closeMarket() {
    /* Coming back from a chapter: the board kept its state, it just had no
       size while the screen was hidden, so re-measure it. */
    if (game.marketFrom === 'game' && board && cfg && !game.over) {
      showScreen('game');
      layoutBoard();
      renderBag();
      return;
    }
    renderMap();
    showScreen('map');
  }

  function renderMarket() {
    updateSeedDisplays();
    el.marketBackLabel.textContent = game.marketFrom === 'game' ? 'Board' : 'Gardens';
    el.marketSub.textContent = save.seeds > 0
      ? 'Spend your seeds'
      : 'Earn seeds by clearing chapters';

    var groups = Market.groups();
    var html = '';
    for (var g = 0; g < groups.length; g++) {
      html += '<section class="market-group"><h3>' + esc(groups[g].name) + '</h3>';
      for (var i = 0; i < groups[g].items.length; i++) html += marketItemHTML(groups[g].items[i]);
      html += '</section>';
    }
    el.marketBody.innerHTML = html;
  }

  function marketItemHTML(item) {
    var affordable = save.seeds >= item.cost;
    var stock;

    if (item.special) {
      var owned = save.bag[item.special] || 0;
      stock = owned ? 'In your bag ×' + owned : 'None in your bag yet';
    } else if (item.specials) {
      var parts = [];
      if (item.lives) parts.push(item.lives + ' leaves');
      for (var k in item.specials) {
        if (!hasOwn(item.specials, k) || !item.specials[k]) continue;
        parts.push(item.specials[k] + ' × ' + Market.ITEM_NAME[k]);
      }
      stock = parts.join(' · ');
    } else {
      stock = 'Meter ' + save.energy.lives + '/' + MAX_LIVES;
    }

    return '<div class="market-item' + (affordable ? '' : ' is-poor') + '">'
      + '<span class="market-icon">' + Market.iconFor(item) + '</span>'
      + '<span class="market-main">'
      + '<span class="market-name">' + esc(item.name)
      + (item.deal ? '<em>' + esc(item.deal) + '</em>' : '') + '</span>'
      + '<span class="market-blurb">' + esc(item.blurb) + '</span>'
      + '<span class="market-owned">' + esc(stock) + '</span>'
      + '</span>'
      + '<button class="buy-btn' + (affordable ? '' : ' is-muted') + '" data-buy="' + item.id + '"'
      + (affordable ? '' : ' aria-disabled="true"')
      + ' aria-label="Buy ' + esc(item.name) + ' for ' + item.cost + ' seeds">'
      + '<span class="wallet-icon">' + Market.seedIcon() + '</span>' + item.cost
      + '</button>'
      + '</div>';
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function buyItem(id) {
    var item = Market.find(id);
    if (!item) return;
    if (save.seeds < item.cost) {
      toast('Not enough seeds — ' + item.cost + ' needed');
      sfx('error');
      return;
    }
    /* Leaves bought for a meter that is already full would be spent for
       nothing, so refuse rather than quietly take the seeds. */
    if (item.lives && !item.special && !item.specials && save.energy.lives >= MAX_LIVES && !save.dev) {
      toast('Energy is already full');
      sfx('error');
      return;
    }

    save.seeds -= item.cost;
    var got = [];

    if (item.lives) {
      var added = addLives(item.lives);
      got.push(added + (added === 1 ? ' leaf' : ' leaves'));
    }
    if (item.special) {
      save.bag[item.special] = (save.bag[item.special] || 0) + 1;
      got.push('1 × ' + Market.ITEM_NAME[item.special]);
    }
    if (item.specials) {
      for (var k in item.specials) {
        if (!hasOwn(item.specials, k) || !item.specials[k]) continue;
        save.bag[k] = (save.bag[k] || 0) + item.specials[k];
        got.push(item.specials[k] + ' × ' + Market.ITEM_NAME[k]);
      }
    }

    persist();
    renderEnergy();
    renderMarket();
    /* little pop on the button that was just used */
    var bought = el.marketBody.querySelector('[data-buy="' + item.id + '"]');
    if (bought) bought.classList.add('is-bought');
    updateSeedDisplays();
    renderBag();
    flashWallet();
    sfx('buy');
    buzz(10);
    toast('Bought ' + item.name + ' — ' + got.join(', '));
  }

  /* ------------------------------- the bag ------------------------------- */

  function renderBag() {
    if (!el.bagStrip) return;
    var kinds = Market.SPECIALS;
    var html = '';

    if (game.arm) {
      html += '<span class="bag-hint">Tap a leaf to drop the '
        + esc(Market.ITEM_NAME[game.arm]) + '</span>';
      if (game.arm === 'line') {
        html += '<button class="bag-chip' + (game.armDir === 'h' ? ' is-armed' : '') + '" data-arm-dir="h">Row</button>'
          + '<button class="bag-chip' + (game.armDir === 'v' ? ' is-armed' : '') + '" data-arm-dir="v">Col</button>';
      }
      html += '<button class="bag-chip bag-chip-cancel" data-arm-cancel="1">Cancel</button>';
    } else {
      for (var i = 0; i < kinds.length; i++) {
        var item = Market.find(kinds[i]);
        var owned = save.bag[kinds[i]] || 0;
        html += '<button class="bag-chip' + (owned ? '' : ' is-empty') + '" data-arm="' + kinds[i] + '"'
          + ' title="' + esc(item.name) + '">'
          + '<span class="bag-icon">' + Market.iconFor(item) + '</span><b>' + owned + '</b></button>';
      }
      html += '<button class="bag-chip bag-chip-market" data-market="1">Market</button>';
    }

    el.bagStrip.innerHTML = html;
    el.bagStrip.classList.toggle('is-armed', !!game.arm);
  }

  function armSpecial(kind) {
    if (!board || !cfg || game.over) return;
    if (!(save.bag[kind] > 0)) {
      toast('None left — buy more in the market');
      showMarket('game');
      return;
    }
    if (game.arm === kind) { cancelArm(); return; }
    clearHint();
    game.arm = kind;
    game.armDir = 'h';
    game.pending = null;
    game.drag = null;
    setSelection(null);
    el.board.classList.add('is-placing');
    renderBag();
    toast('Tap a leaf to drop the ' + Market.ITEM_NAME[kind]);
  }

  function cancelArm() {
    if (!game.arm) return;
    game.arm = null;
    if (el.board) el.board.classList.remove('is-placing');
    renderBag();
  }

  /* Drop the piece on (r,c). A line or bomb keeps the leaf it lands on so it
     can still be matched normally; the golden leaf is uncoloured by design. */
  function dropSpecial(kind, r, c) {
    var cell = board.cell(r, c);
    if (!cell || cell.stone || !cell.tile) { toast('Drop it on a leaf'); return false; }
    if (!(save.bag[kind] > 0)) { cancelArm(); return false; }

    var tile = cell.tile;
    if (tile.special) { toast('That leaf is already special'); return false; }

    if (kind === 'golden') {
      tile.leaf = -1;
      tile.special = 'golden';
      tile.dir = null;
    } else {
      tile.special = kind;
      tile.dir = kind === 'line' ? game.armDir : null;
      /* A dropped piece must not complete a line on arrival, or the very next
         cascade would eat it. Nudge it to a leaf colour that does not match. */
      if (board.matchAt(r, c)) recolorSafe(r, c, tile);
    }

    save.bag[kind]--;
    persist();

    var node = tileEls[tile.id] || createTile(tile, r, c);
    node.classList.toggle('leaf-golden', kind === 'golden');
    node.innerHTML = '<div class="tile-inner">' + Art.svgFor(tile.leaf, tile.special, tile.dir) + '</div>';
    spawnPop(node);
    spawnBadge(r, c, SPECIAL_NAMES[kind]);
    sfx('special');
    buzz(16);

    cancelArm();
    armHint();
    return true;
  }

  function recolorSafe(r, c, tile) {
    var original = tile.leaf;
    for (var i = 1; i <= board.typeCount; i++) {
      tile.leaf = (original + i) % board.typeCount;
      if (!board.matchAt(r, c)) return;
    }
    tile.leaf = original;
  }

  /* ============================== albums ============================== */

  function showAlbum(garden) {
    if (garden != null) {
      game.albumGarden = Math.max(0, Math.min(Data.GARDENS.length - 1, garden));
    }
    renderAlbum();
    showScreen('album');
  }

  function renderAlbum() {
    var g = game.albumGarden;
    setGardenTheme(g);
    var garden = Data.GARDENS[g];
    var got = albumCollected(g);
    var full = got >= Data.PER_GARDEN;
    var claimed = !!save.albums[g];

    el.albumTitle.textContent = garden.name;
    el.albumSub.textContent = 'Album ' + (g + 1) + ' of ' + Data.GARDENS.length
      + (claimed ? ' · complete' : '');
    el.albumBadgeSlot.innerHTML = claimed ? Spec.badge(g) : '';

    el.albumTabs.innerHTML = '';
    Data.GARDENS.forEach(function (entry, i) {
      var btn = document.createElement('button');
      btn.className = 'album-tab' + (i === g ? ' is-active' : '') + (save.albums[i] ? ' is-full' : '');
      btn.innerHTML = '<span class="dot"></span>' + (i + 1) + '. ' + esc(entry.name)
        + ' <b style="opacity:.72">' + albumCollected(i) + '</b>';
      btn.addEventListener('click', function () { game.albumGarden = i; renderAlbum(); });
      el.albumTabs.appendChild(btn);
    });

    el.albumProgress.innerHTML =
      '<div class="album-bar"><i style="width:' + Math.round(got / Data.PER_GARDEN * 100) + '%"></i></div>'
      + '<p><b>' + got + '</b> of ' + Data.PER_GARDEN + ' specimens · '
      + albumStars(g) + '/' + (Data.PER_GARDEN * 3) + ' stars</p>';

    el.albumGrid.innerHTML = '';
    for (var i = 0; i < Data.PER_GARDEN; i++) {
      var chapter = Data.CHAPTERS[g * Data.PER_GARDEN + i];
      if (!chapter) break;
      var stars = starsFor(chapter.num);
      var slot;

      if (stars > 0) {
        slot = document.createElement('button');
        slot.className = 'album-slot card-tile is-filled';
        slot.setAttribute('aria-label', 'Chapter ' + chapter.num + ' specimen');
        slot.innerHTML = Spec.card(chapter)
          + '<span class="tile-no">' + chapter.num + '</span>'
          + '<span class="tile-stars">' + starRow(stars) + '</span>';
        (function (num) {
          slot.addEventListener('click', function () { showSpecimen(num); });
        })(chapter.num);
      } else {
        slot = document.createElement('div');
        slot.className = 'album-slot is-empty';
        slot.setAttribute('aria-label', 'Chapter ' + chapter.num + ' not collected');
        slot.innerHTML = '<span class="slot-no">' + chapter.num + '</span>'
          + '<span class="slot-leaf">' + Art.svgFor(Spec.signatureLeaf(chapter), null, null) + '</span>';
      }
      el.albumGrid.appendChild(slot);
    }

    if (claimed) {
      el.albumFoot.innerHTML = '<div class="album-reward is-taken">'
        + '<span class="reward-badge">' + Spec.badge(g) + '</span>'
        + '<span><strong>' + esc(garden.name) + ' complete.</strong> Reward collected — energy refilled.</span>'
        + '</div>';
    } else if (full) {
      el.albumFoot.innerHTML = '<div class="album-reward">'
        + '<span>' + esc(garden.name) + ' is full!</span>'
        + '<button class="btn btn-primary btn-sm" data-action="claim">Claim reward</button>'
        + '</div>';
    } else {
      el.albumFoot.innerHTML = '<div class="album-reward is-taken">'
        + '<span>' + (Data.PER_GARDEN - got) + ' specimens to go — clear chapters '
        + (g * Data.PER_GARDEN + 1) + '–' + ((g + 1) * Data.PER_GARDEN) + ' to fill this album.</span>'
        + '</div>';
    }
  }

  function claimAlbum(g) {
    if (save.albums[g] || !albumComplete(g)) return;
    save.albums[g] = 1;
    save.seeds += 20;
    persist();
    refillEnergy();
    renderAlbum();
    buzz([0, 20, 30, 20]);
    toast('Album complete! Energy refilled');
  }

  function celebrateAlbum(g) {
    sfx('win');
    showOverlay(
      '<h2>Album complete</h2>'
      + '<p>' + esc(Data.GARDENS[g].name) + '</p>'
      + '<div class="overlay-album">' + Spec.albumArt(g) + '</div>'
      + '<div class="overlay-reward"><strong>Reward</strong> — full energy, +20 seeds, and the '
      + esc(Data.GARDENS[g].name) + ' plate for your shelf.</div>'
      + '<div class="overlay-actions"><div class="overlay-row">'
      + '<button class="btn btn-primary" data-action="rank">Ladder</button>'
      + '<button class="btn btn-ghost" data-action="close">Close</button>'
      + '</div></div>'
    );
  }

  function showSpecimen(num) {
    var chapter = Data.CHAPTERS[num - 1];
    if (!chapter) return;
    showOverlay(
      '<h2>' + esc(chapter.name) + '</h2>'
      + '<p>Chapter ' + num + ' · ' + esc(chapter.gardenName) + '</p>'
      + '<div class="overlay-specimen big"><div class="specimen-holder">' + Spec.card(chapter) + '</div></div>'
      + '<div class="overlay-stars">' + starRow(starsFor(num)) + '</div>'
      + '<div class="overlay-meta">Best score ' + fmt(bestFor(num)) + ' · ' + esc(chapter.difficulty) + '</div>'
      + '<div class="overlay-actions"><div class="overlay-row">'
      + '<button class="btn btn-primary" data-action="play" data-num="' + num + '">Play</button>'
      + '<button class="btn btn-ghost" data-action="close">Close</button>'
      + '</div></div>'
    );
  }

  /* ============================== ladder ============================== */

  function showRank() {
    showScreen('rank');
    el.rankSub.textContent = Rank.isLive() ? 'Live' : 'This month';
    el.rankNote.textContent = 'Loading the ladder…';
    el.rankMe.innerHTML = '';
    el.rankList.innerHTML = '';

    Rank.fetchBoard({
      name: LADDER_NAME,
      leaf: 3,
      stars: totalStars(),
      score: totalBest()
    }).then(renderRank, function () {
      el.rankNote.textContent = 'The ladder could not be loaded.';
    });
  }

  function renderRank(data) {
    var entries = data.entries || [];
    var me = null;
    for (var i = 0; i < entries.length; i++) if (entries[i].you) me = entries[i];
    if (me && !me.rank) me.rank = i + 1;

    if (me) {
      el.rankMe.innerHTML =
        '<span class="rank-pos">#' + me.rank + '</span>'
        + '<span class="rank-avatar">' + Art.svgFor(me.leaf, null, null) + '</span>'
        + '<span class="rank-main"><span class="rank-name">' + esc(LADDER_NAME)
        + '</span><span class="rank-sub">' + fmt(me.score || 0) + ' total score</span></span>'
        + '<span class="rank-stars">' + (me.stars || 0) + ' ★</span>';
    }

    el.rankList.innerHTML = '';
    entries.forEach(function (entry, index) {
      var row = document.createElement('div');
      row.className = 'rank-row' + (entry.you ? ' is-you' : '');
      row.style.animationDelay = Math.min(index * 16, 280) + 'ms';
      row.innerHTML = '<span class="rank-no">' + entry.rank + '</span>'
        + '<span class="rank-avatar">' + Art.svgFor(entry.leaf, null, null) + '</span>'
        + '<span class="rank-main"><span class="rank-name">' + esc(entry.name)
        + '</span><span class="rank-sub">' + fmt(entry.score || 0) + ' score</span></span>'
        + '<span class="rank-stars">' + (entry.stars || 0) + ' ★</span>';
      el.rankList.appendChild(row);
    });

    var when = data.updated ? new Date(data.updated) : new Date();
    el.rankNote.innerHTML = entries.length + ' players · '
      + (data.live ? 'live server' : 'offline ladder — connect an API in <b>js/rank.js</b>')
      + ' · updated ' + when.toLocaleTimeString();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ========================== developer panel ========================== */

  function toggleDev(force) {
    devOpen = force == null ? !devOpen : !!force;
    el.devPanel.classList.toggle('hidden', !devOpen);
    if (devOpen) refreshDevInfo();
  }

  function bagSummary() {
    var out = [];
    var kinds = Market.SPECIALS;
    for (var i = 0; i < kinds.length; i++) out.push(kinds[i] + ' ' + (save.bag[kinds[i]] || 0));
    return out.join(' · ');
  }

  function refreshDevInfo() {
    el.devChapter.max = String(Data.TOTAL);
    el.devInfo.innerHTML = 'god mode <b>' + (save.dev ? 'on' : 'off') + '</b> · energy <b>'
      + save.energy.lives + '/' + MAX_LIVES + '</b> · seeds <b>' + fmt(save.seeds)
      + '</b> · stars <b>' + totalStars() + '</b> · chapters <b>' + clearedCount() + '/'
      + Data.TOTAL + '</b> · albums <b>' + albumsDone() + '/' + Data.GARDENS.length + '</b>'
      + '<br>bag <b>' + bagSummary() + '</b>';
    el.devUnlock.textContent = save.dev ? 'God mode: on' : 'God mode: off';
    el.devUnlock.classList.toggle('is-on', save.dev);
  }

  function devGo() {
    var num = parseInt(el.devChapter.value, 10);
    if (!(num >= 1)) num = 1;
    if (num > Data.TOTAL) num = Data.TOTAL;
    el.devChapter.value = String(num);
    hideOverlay();
    toggleDev(false);
    startChapter(num, true);
  }

  function devClearNext() {
    var num = nextChapter();
    save.stars[num] = 3;
    var chapter = Data.CHAPTERS[num - 1];
    if ((save.best[num] || 0) < chapter.scoreTarget * 2) save.best[num] = chapter.scoreTarget * 2;
    persist();
    renderMap();
    refreshDevInfo();
    toast('Chapter ' + num + ' cleared 3★');
  }

  function devFillAlbum() {
    var g = game.activeGarden;
    var first = g * Data.PER_GARDEN + 1;
    for (var i = 0; i < Data.PER_GARDEN; i++) {
      var num = first + i;
      var chapter = Data.CHAPTERS[num - 1];
      if (!save.stars[num]) save.stars[num] = 3;
      if ((save.best[num] || 0) < chapter.scoreTarget * 2) save.best[num] = chapter.scoreTarget * 2;
    }
    persist();
    renderMap();
    refreshDevInfo();
    toast(Data.GARDENS[g].name + ' album filled');
  }

  function devReset() {
    if (!root.confirm('Reset the whole save — stars, specimens, albums and energy?')) return;
    var sound = save.sound;
    save = {
      stars: {}, sound: sound, seen: {}, best: {}, albums: {}, seeds: 0, dev: false,
      bag: emptyBag(),
      energy: { lives: MAX_LIVES, at: Date.now() }
    };
    persist();
    game.activeGarden = 0;
    game.albumGarden = 0;
    game.num = 1;
    renderMap();
    refreshDevInfo();
    toast('Save reset');
  }

  /* ============================== tutorials ============================== */

  /* Shown the first time each special is actually made, so nobody has to guess
     what the new piece in their hand is for. */
  var SPECIAL_INFO = {
    line: {
      name: 'Line leaf',
      leaf: 0,
      pattern: [[0, 0], [0, 1], [0, 2], [0, 3]],
      how: 'Match 4 leaves in a line',
      what: 'It sweeps its whole row or column when it goes off.'
    },
    bomb: {
      name: 'Seed bomb',
      leaf: 2,
      pattern: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]],
      how: 'Match an L or a T shape',
      what: 'It blows up the 3×3 block around itself.'
    },
    golden: {
      name: 'Golden leaf',
      leaf: 3,
      pattern: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]],
      how: 'Match 5 leaves in a line',
      what: 'Swap it onto any leaf to clear every leaf of that colour. Two of them clear the whole board.'
    }
  };

  var tutorialQueue = [];
  var tutorialDone = null;

  /* Remember the piece the moment it is made; the card waits for the cascade. */
  function noteTutorial(kind) {
    if (game.over) return;                         /* pieces made in the closing sweep */
    if (!SPECIAL_INFO[kind] || save.seen[kind]) return;
    if (tutorialQueue.indexOf(kind) < 0) tutorialQueue.push(kind);
  }

  function resolveTutorial() {
    if (!tutorialDone) return;
    var done = tutorialDone;
    tutorialDone = null;
    done();
  }

  function demoRows(cells) {
    var rows = 1;
    for (var i = 0; i < cells.length; i++) rows = Math.max(rows, cells[i][0] + 1);
    return rows;
  }

  /* "How to make it": the leaves of the shape light up one after another. */
  function patternDemoHTML(kind) {
    var info = SPECIAL_INFO[kind];
    var out = '<div class="demo demo-pattern" style="--rows:' + demoRows(info.pattern) + '">';
    for (var i = 0; i < info.pattern.length; i++) {
      out += '<span class="demo-tile" style="--r:' + info.pattern[i][0]
        + ';--c:' + info.pattern[i][1] + ';--i:' + i + '">'
        + Art.svgFor(info.leaf, null, null) + '</span>';
    }
    return out + '</div>';
  }

  /* "What it does": a small board with the piece in the middle, then the effect. */
  function effectDemoHTML(kind) {
    var info = SPECIAL_INFO[kind];
    var cells = [], r, c, special, dist;

    if (kind === 'bomb') {
      for (r = 0; r < 3; r++) {
        for (c = 0; c < 3; c++) {
          special = (r === 1 && c === 1);
          dist = Math.max(Math.abs(r - 1), Math.abs(c - 1));
          cells.push('<span class="demo-tile ' + (special ? 'fx-piece' : 'fx-leaf')
            + '" style="--r:' + r + ';--c:' + c + ';--i:' + dist + '">'
            + Art.svgFor(special ? info.leaf : (r * 3 + c) % 4, special ? 'bomb' : null, null)
            + '</span>');
        }
      }
      return '<div class="demo demo-fx is-bomb" style="--rows:3">'
        + cells.join('') + '<span class="demo-ring"></span></div>';
    }

    for (c = 0; c < 5; c++) {
      special = (c === 2);
      dist = Math.abs(c - 2);
      cells.push('<span class="demo-tile ' + (special ? 'fx-piece' : 'fx-leaf')
        + '" style="--r:0;--c:' + c + ';--i:' + dist + '">'
        + Art.svgFor(special ? info.leaf : (c + 1) % 4, special ? kind : null,
          special && kind === 'line' ? 'h' : null)
        + '</span>');
    }
    return '<div class="demo demo-fx is-' + kind + '" style="--rows:1">'
      + cells.join('')
      + (kind === 'line' ? '<span class="demo-beam"></span>' : '<span class="demo-halo"></span>')
      + '</div>';
  }

  function tutorialHTML(kind) {
    var info = SPECIAL_INFO[kind];
    return '<h2>New piece</h2>'
      + '<p>' + info.name + '</p>'
      + '<div class="tut-row">'
      +   '<div class="tut-label">How to make it</div>'
      +   patternDemoHTML(kind)
      +   '<div class="tut-text">' + info.how + '</div>'
      + '</div>'
      + '<div class="tut-row">'
      +   '<div class="tut-label">What it does</div>'
      +   effectDemoHTML(kind)
      +   '<div class="tut-text">' + info.what + '</div>'
      + '</div>'
      + '<button class="btn btn-primary btn-wide" data-action="tutorial-ok">Got it</button>';
  }

  function showTutorial(kind) {
    return new Promise(function (resolve) {
      tutorialDone = resolve;
      showOverlay(tutorialHTML(kind));
      sfx('special');
    });
  }

  /* Runs after a cascade: one card per newly made piece, in order. */
  async function showTutorials() {
    var token = game.run;
    while (tutorialQueue.length) {
      var kind = tutorialQueue.shift();
      if (save.seen[kind] || !SPECIAL_INFO[kind]) continue;
      save.seen[kind] = 1;
      persist();
      await showTutorial(kind);
      if (token !== game.run) return;
    }
  }

  /* =============================== hint =============================== */

  function clearHint() {
    root.clearTimeout(hintTimer);
    for (var id in tileEls) tileEls[id].classList.remove('is-hint');
  }

  function showHint() {
    if (!board || game.busy || game.over) return;
    var move = board.anyMoves();
    if (!move) return;
    [move.a, move.b].forEach(function (cell) {
      var tile = board.tile(cell.r, cell.c);
      if (tile && tileEls[tile.id]) tileEls[tile.id].classList.add('is-hint');
    });
    root.setTimeout(clearHint, 2600);
  }

  function armHint() {
    root.clearTimeout(hintTimer);
    hintTimer = root.setTimeout(showHint, HINT_IDLE_MS);
  }

  /* ============================== input ============================== */

  function setSelection(cell) {
    for (var id in tileEls) tileEls[id].classList.remove('is-sel');
    if (!cell) return;
    var tile = board.tile(cell.r, cell.c);
    if (tile && tileEls[tile.id]) tileEls[tile.id].classList.add('is-sel');
  }

  function shakeCell(cell) {
    var tile = board && board.tile(cell.r, cell.c);
    if (!tile || !tileEls[tile.id]) return;
    var node = tileEls[tile.id];
    node.classList.remove('is-shake');
    void node.offsetWidth;
    node.classList.add('is-shake');
    root.setTimeout(function () { node.classList.remove('is-shake'); }, 320);
  }

  function cellFromPoint(clientX, clientY) {
    var rect = el.board.getBoundingClientRect();
    var step = metrics.size + metrics.gap;
    var c = Math.floor((clientX - rect.left) / step);
    var r = Math.floor((clientY - rect.top) / step);
    if (!board || !board.inBounds(r, c)) return null;
    return { r: r, c: c };
  }

  function isAdjacent(a, b) {
    return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
  }

  function onPointerDown(event) {
    if (!board || game.busy || game.over) return;
    if (event.button && event.button !== 0) return;
    var cell = cellFromPoint(event.clientX, event.clientY);
    if (!cell) return;
    event.preventDefault();
    clearHint();

    /* A piece from the bag is placed, not swapped */
    if (game.arm) {
      dropSpecial(game.arm, cell.r, cell.c);
      return;
    }

    if (game.pending && isAdjacent(game.pending, cell)) {
      var from = game.pending;
      game.pending = null;
      setSelection(null);
      attemptSwap(from, cell);
    } else if (game.pending && game.pending.r === cell.r && game.pending.c === cell.c) {
      game.pending = null;
      setSelection(null);
    } else {
      game.pending = cell;
      setSelection(cell);
    }
    game.drag = { cell: cell, x: event.clientX, y: event.clientY, fired: false };
  }

  function onPointerMove(event) {
    var drag = game.drag;
    if (!drag || drag.fired || game.busy || game.over) return;
    var dx = event.clientX - drag.x;
    var dy = event.clientY - drag.y;
    var need = Math.max(8, metrics.size * 0.34);
    if (Math.abs(dx) < need && Math.abs(dy) < need) return;

    var target;
    if (Math.abs(dx) > Math.abs(dy)) {
      target = { r: drag.cell.r, c: drag.cell.c + (dx > 0 ? 1 : -1) };
    } else {
      target = { r: drag.cell.r + (dy > 0 ? 1 : -1), c: drag.cell.c };
    }
    drag.fired = true;
    game.pending = null;
    setSelection(null);
    if (board.inBounds(target.r, target.c)) attemptSwap(drag.cell, target);
  }

  function onPointerUp() { game.drag = null; }

  function onResize() {
    if (board && el.screenGame.classList.contains('is-active')) layoutBoard();
  }

  /* ============================== wiring ============================== */

  function cacheDom() {
    el.app = $('app');
    el.screenMap = $('screen-map');
    el.screenGame = $('screen-game');
    el.screenAlbum = $('screen-album');
    el.screenRank = $('screen-rank');
    el.screenMarket = $('screen-market');
    el.statStars = $('stat-stars');
    el.statCleared = $('stat-cleared');
    el.statTotal = $('stat-total');
    el.statAlbums = $('stat-albums');
    el.statSeeds = $('stat-seeds');
    el.energyPillMap = $('energy-pill-map');
    el.energyCountMap = $('energy-count-map');
    el.energyTimerMap = $('energy-timer-map');
    el.energyPillGame = $('energy-pill-game');
    el.energyCountGame = $('energy-count-game');
    el.btnAlbum = $('btn-album');
    el.btnRank = $('btn-rank');
    el.gardenTabs = $('garden-tabs');
    el.gardenBanner = $('garden-banner');
    el.chapterGrid = $('chapter-grid');
    el.btnContinue = $('btn-continue');
    el.btnReset = $('btn-reset');
    el.btnSoundMap = $('btn-sound-map');
    el.gameNum = $('game-num');
    el.gameName = $('game-name');
    el.objectives = $('objectives');
    el.bagStrip = $('bag-strip');
    el.boardWrap = $('board-wrap');
    el.board = $('board');
    el.movesLeft = $('moves-left');
    el.meterMoves = $('meter-moves');
    el.meterScore = document.querySelector('.meter-score');
    el.score = $('score');
    el.scoreTarget = $('score-target');
    el.btnHint = $('btn-hint');
    el.btnRestart = $('btn-restart');
    el.btnBack = $('btn-back');
    el.btnSound = $('btn-sound');
    el.overlay = $('overlay');
    el.overlayCard = $('overlay-card');
    el.toast = $('toast');
    el.logoLeaf = $('logo-leaf');
    el.btnAlbumBack = $('btn-album-back');
    el.albumTitle = $('album-title');
    el.albumSub = $('album-sub');
    el.albumBadgeSlot = $('album-badge-slot');
    el.albumTabs = $('album-tabs');
    el.albumProgress = $('album-progress');
    el.albumGrid = $('album-grid');
    el.albumFoot = $('album-foot');
    el.btnRankBack = $('btn-rank-back');
    el.rankSub = $('rank-sub');
    el.rankMe = $('rank-me');
    el.rankList = $('rank-list');
    el.rankNote = $('rank-note');
    el.btnMarket = $('btn-market');
    el.btnMarketBack = $('btn-market-back');
    el.marketBackLabel = $('market-back-label');
    el.marketSub = $('market-sub');
    el.marketWallet = $('market-wallet');
    el.marketSeeds = $('market-seeds');
    el.marketBody = $('market-body');
    el.devPanel = $('dev-panel');
    el.devInfo = $('dev-info');
    el.devChapter = $('dev-chapter');
    el.devGo = $('dev-go');
    el.devUnlock = $('dev-unlock');
    el.devLives = $('dev-lives');
    el.devClear = $('dev-clear');
    el.devAlbums = $('dev-albums');
    el.devSeeds = $('dev-seeds');
    el.devBag = $('dev-bag');
    el.devResetBtn = $('dev-reset');
    el.devClose = $('dev-close');
  }

  function soundLabel() {
    var text = 'Sound: ' + (save.sound ? 'on' : 'off');
    if (el.btnSoundMap) el.btnSoundMap.textContent = text;
    if (el.btnSound) el.btnSound.innerHTML = save.sound ? '&#128266;' : '&#128263;';
  }

  /* Every button that carries data-action routes through here, so the overlay,
     the album footer and the garden banner all behave the same way. */
  function onActionClick(event) {
    var button = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!button) return;
    var action = button.dataset.action;

    if (action === 'next') { var n = Math.min(game.num + 1, Data.TOTAL); hideOverlay(); startChapter(n); }
    else if (action === 'retry') { hideOverlay(); startChapter(game.num); }
    else if (action === 'map') { hideOverlay(); renderMap(); showScreen('map'); }
    else if (action === 'close') { hideOverlay(); }
    else if (action === 'tutorial-ok') { hideOverlay(); resolveTutorial(); }
    else if (action === 'album') { hideOverlay(); showAlbum(game.activeGarden); }
    else if (action === 'claim') { claimAlbum(game.albumGarden); celebrateAlbum(game.albumGarden); }
    else if (action === 'rank') { hideOverlay(); showRank(); }
    else if (action === 'market') { hideOverlay(); showMarket(); }
    else if (action === 'play') { hideOverlay(); startChapter(parseInt(button.dataset.num, 10)); }
    else if (action === 'ad-continue') {
      var spot = root.LeafAds.rewarded('continue', function (paid) {
        if (!paid) { toast('The spot did not finish — no extra moves'); sfx('error'); return; }
        grantMoves();
      });
      if (!spot) { toast('An ad is already playing'); sfx('error'); }
    }
    else if (action === 'ad-energy') {
      if (save.energy.lives >= MAX_LIVES) { toast('Energy is already full'); return; }
      var watch = root.LeafAds.rewarded('energy', function (paid) {
        if (!paid) { toast('The spot did not finish — no free leaf'); sfx('error'); return; }
        addLives(1);
        sfx('buy');
        buzz(12);
        if (pendingStart) { var go = pendingStart; pendingStart = 0; hideOverlay(); startChapter(go); }
        else { hideOverlay(); renderEnergy(); toast('+1 leaf'); }
      });
      if (!watch) { toast('An ad is already playing'); sfx('error'); }
    }
    else if (action === 'refill') {
      if (save.seeds < REFILL_SEEDS) { toast('Not enough seeds — ' + REFILL_SEEDS + ' needed'); sfx('error'); return; }
      save.seeds -= REFILL_SEEDS;
      persist();
      refillEnergy();
      sfx('buy');
      buzz(12);
      var go = pendingStart || game.num;
      hideOverlay();
      startChapter(go);
    }
  }

  function bindEvents() {
    el.btnContinue.addEventListener('click', function () { startChapter(nextChapter()); });

    el.btnReset.addEventListener('click', function () {
      if (!root.confirm('Erase all stars, specimens and albums?')) return;
      save.stars = {};
      save.best = {};
      save.albums = {};
      save.seeds = 0;
      save.bag = emptyBag();
      persist();
      game.activeGarden = 0;
      game.albumGarden = 0;
      renderMap();
      toast('Progress reset');
    });

    function toggleSound() {
      save.sound = !save.sound;
      persist();
      soundLabel();
      if (save.sound) { ensureAudio(); sfx('swap'); }
    }
    el.btnSoundMap.addEventListener('click', toggleSound);
    el.btnSound.addEventListener('click', toggleSound);

    el.btnBack.addEventListener('click', function () {
      hideOverlay();
      renderMap();
      showScreen('map');
    });
    el.btnRestart.addEventListener('click', function () { startChapter(game.num); });
    el.btnHint.addEventListener('click', function () { clearHint(); showHint(); });

    /* ------------------------- album and ladder ------------------------- */

    el.btnAlbum.addEventListener('click', function () { showAlbum(game.activeGarden); });
    el.btnRank.addEventListener('click', function () { showRank(); });
    el.btnAlbumBack.addEventListener('click', function () { renderMap(); showScreen('map'); });
    el.btnRankBack.addEventListener('click', function () { renderMap(); showScreen('map'); });

    /* ------------------------------ market ------------------------------ */

    el.btnMarket.addEventListener('click', function () { showMarket('map'); });
    el.btnMarketBack.addEventListener('click', closeMarket);
    el.marketBody.addEventListener('click', function (event) {
      var button = event.target.closest ? event.target.closest('[data-buy]') : null;
      if (button) buyItem(button.dataset.buy);
    });

    /* ------------------------------- bag -------------------------------- */

    el.bagStrip.addEventListener('click', function (event) {
      var chip = event.target.closest ? event.target.closest('[data-arm]') : null;
      if (chip) { sfx('tap'); armSpecial(chip.dataset.arm); return; }
      var dir = event.target.closest ? event.target.closest('[data-arm-dir]') : null;
      if (dir) { sfx('tap'); game.armDir = dir.dataset.armDir; renderBag(); return; }
      if (event.target.closest && event.target.closest('[data-arm-cancel]')) { sfx('back'); cancelArm(); return; }
      if (event.target.closest && event.target.closest('[data-market]')) { sfx('tap'); showMarket('game'); }
    });

    el.gardenBanner.addEventListener('click', onActionClick);

    el.energyPillMap.addEventListener('click', function () {
      energyTick();
      if (save.dev || save.energy.lives >= MAX_LIVES) { toast('Energy is full'); return; }
      if (save.energy.lives <= 0) { pendingStart = 0; showEnergyOverlay(); return; }
      toast('Next leaf in ' + fmtClock(msToNextLife()));
    });

    el.energyPillGame.addEventListener('click', function () {
      energyTick();
      if (save.dev || save.energy.lives >= MAX_LIVES) { toast('Energy is full'); return; }
      toast(save.energy.lives + ' of ' + MAX_LIVES + ' leaves · next in ' + fmtClock(msToNextLife()));
    });

    /* -------------------------- overlay actions -------------------------- */

    el.overlayCard.addEventListener('click', onActionClick);
    /* A tap anywhere on an open reward card skips straight to the end. */
    el.overlay.addEventListener('click', function () { skipReveal(); });
    el.albumFoot.addEventListener('click', onActionClick);

    /* --------------------------- developer panel --------------------------- */

    el.devClose.addEventListener('click', function () { toggleDev(false); });
    el.devGo.addEventListener('click', devGo);
    el.devChapter.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') { event.preventDefault(); devGo(); }
    });
    el.devUnlock.addEventListener('click', function () {
      save.dev = !save.dev;
      persist();
      renderMap();
      refreshDevInfo();
      toast(save.dev ? 'God mode on — every chapter is open' : 'God mode off');
    });
    el.devLives.addEventListener('click', function () {
      refillEnergy();
      refreshDevInfo();
      toast('Energy refilled');
    });
    el.devClear.addEventListener('click', devClearNext);
    el.devAlbums.addEventListener('click', devFillAlbum);
    el.devSeeds.addEventListener('click', function () {
      save.seeds += 40;
      persist();
      renderMap();
      refreshDevInfo();
      toast('+40 seeds');
    });
    el.devBag.addEventListener('click', function () {
      var kinds = Market.SPECIALS;
      for (var i = 0; i < kinds.length; i++) save.bag[kinds[i]] = (save.bag[kinds[i]] || 0) + 1;
      persist();
      renderBag();
      refreshDevInfo();
      toast('+1 of each special piece');
    });
    el.devResetBtn.addEventListener('click', devReset);

    /* Tap the star total three times to open the same panel. */
    el.statStars.addEventListener('click', function () {
      starsTaps++;
      root.clearTimeout(starsTapTimer);
      starsTapTimer = root.setTimeout(function () { starsTaps = 0; }, 900);
      if (starsTaps >= 3) { starsTaps = 0; toggleDev(true); }
    });

    el.board.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerUp);

    root.addEventListener('resize', onResize);
    root.addEventListener('orientationchange', function () { root.setTimeout(onResize, 120); });
    root.addEventListener('keydown', function (event) {
      var typing = event.target && /^(input|textarea|select)$/i.test(event.target.tagName);
      if (event.key === 'Escape') {
        if (devOpen) { toggleDev(false); return; }
        if (game.arm) { cancelArm(); return; }
        if (reveal.active) { skipReveal(); return; }
        if (!el.overlay.classList.contains('hidden')) { hideOverlay(); resolveTutorial(); return; }
        if (el.screenMarket.classList.contains('is-active')) { closeMarket(); return; }
        if (el.screenAlbum.classList.contains('is-active') || el.screenRank.classList.contains('is-active')) {
          renderMap();
          showScreen('map');
          return;
        }
        if (el.screenGame.classList.contains('is-active')) { renderMap(); showScreen('map'); }
        return;
      }
      if (typing) return;
      if (event.key === 'd' || event.key === 'D') { toggleDev(); return; }
      if (event.key === 'h' || event.key === 'H') { clearHint(); showHint(); }
    });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) root.clearTimeout(hintTimer);
      else {
        renderEnergy();
        if (el.screenGame.classList.contains('is-active')) armHint();
      }
    });
  }

  /* Small debug handle: poke at the live board from the console. */
  root.LeafCrush = {
    game: game,
    board: function () { return board; },
    chapter: function () { return cfg; },
    start: function (num) { startChapter(num, true); },
    refresh: function () { refreshTileArt(); },
    hint: function () { clearHint(); showHint(); },
    save: function () { return save; },
    dev: function (on) { toggleDev(on); },
    god: function (on) {
      save.dev = on == null ? !save.dev : !!on;
      persist();
      renderMap();
      return save.dev;
    },
    energy: function () {
      energyTick();
      return { lives: save.energy.lives, next: msToNextLife(), seeds: save.seeds };
    },
    seeds: function (n) { save.seeds += (n || 40); persist(); renderMap(); return save.seeds; },
    album: function (g) { showAlbum(g); },
    rank: function () { showRank(); },
    market: function () { showMarket(el.screenGame.classList.contains('is-active') ? 'game' : 'map'); },
    bag: function () { return save.bag; },
    give: function (kind, n) {
      var kinds = Market.SPECIALS;
      if (!kind) { for (var i = 0; i < kinds.length; i++) save.bag[kinds[i]] += (n || 1); }
      else if (save.bag[kind] != null || kinds.indexOf(kind) >= 0) save.bag[kind] = (save.bag[kind] || 0) + (n || 1);
      persist();
      renderBag();
      return save.bag;
    },
    specimen: function (num) { showSpecimen(num); },
    openChapter: function (num) { startChapter(num, true); }
  };

  function init() {
    cacheDom();
    document.body.insertAdjacentHTML('beforeend', Art.defsSVG());
    el.logoLeaf.innerHTML = Art.svgFor(3, null, null);   /* the ginkgo fan */
    el.statTotal.textContent = Data.TOTAL;

    /* the little heart on every energy pill */
    var hearts = document.querySelectorAll('.energy-pill .energy-heart');
    for (var h = 0; h < hearts.length; h++) hearts[h].innerHTML = HEART_SVG;

    game.activeGarden = Math.max(0, Math.min(
      Data.GARDENS.length - 1,
      Math.floor((nextChapter() - 1) / Data.PER_GARDEN)
    ));
    game.albumGarden = game.activeGarden;
    soundLabel();
    buildAmbient();
    renderMap();
    renderBag();
    bindEvents();
    startEnergyClock();
    showScreen('map');
    screensBooted = true;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
