/* Leaf Crush - rewarded spots.
   The folder ships no ad SDK, so a rewarded call plays a mock spot: a fake
   "advertisement" card with a countdown, and the reward only pays when the
   countdown runs out. The seam is the point - pointing LeafAds.config at a
   live endpoint swaps the mock for a real network call without touching the
   game, the same way js/rank.js works:

     LeafAds.config.endpoint = 'https://example.com/ads/rewarded';
     LeafAds.config.appToken = 'app-token-from-the-network';

   With an endpoint set the mock never appears; the call goes out as a POST
   carrying { placement } and the token in the Authorization header. A JSON
   reply of { ok: true } pays the reward. A failed call, a timeout or any
   other reply resolves as false and the game keeps its reward - a player
   who skips the spot earns nothing, exactly like a real network.

   Placements: 'continue' (+5 moves after a lost chapter) and 'energy'
   (a free leaf when the meter is dry). */
(function (root) {
  'use strict';

  var SPOT_SECONDS = 5;   /* how long the mock spot runs before the claim */
  var SKIP_SECONDS = 1;   /* how soon the skip door opens */

  /* Fake sponsors for the mock creative. Nothing installs, nothing tracks -
     the stage is a stage, so it says so. */
  var SPONSORS = [
    { name: 'Compost & Sons', line: 'Rot happens. Do it well.' },
    { name: 'Snails On Wheels', line: 'Slow delivery, guaranteed.' },
    { name: 'The Dew Machine', line: 'Morning freshness, on tap.' },
    { name: 'Moss & Sons', line: 'Carpeting forests since 1812.' },
    { name: 'Yew-Nique Gym', line: 'Branch out. Train slow.' },
    { name: 'Ferns Together', line: 'Spore-mates found daily.' },
    { name: 'Lichen Housing', line: 'Grow where you like.' }
  ];

  var Ads = {
    config: { endpoint: '', appToken: '', timeout: 8000 },
    playing: false
  };

  /* A live ad transport (see js/ads-h5.js) takes over the whole reward flow
     and the mock never plays. */
  var activeTransport = null;

  /* Reward copy per placement, printed on the mock's claim button. */
  var LABELS = {
    continue: 'Claim +5 moves',
    energy: 'Claim 1 free leaf'
  };

  function leafStage() {
    /* A few drifting leaves behind the sponsor card when LeafArt is about. */
    if (!root.LeafArt || !root.LeafArt.svgFor) return '';
    var kinds = root.LeafArt.TYPES ? Math.min(root.LeafArt.TYPES.length, 7) : 5;
    var out = '<div class="ad-leafy">';
    for (var i = 0; i < 5; i++) {
      out += '<span class="ad-leaf ad-leaf-' + (i + 1) + '">'
        + root.LeafArt.svgFor((i * 3 + 1) % kinds) + '</span>';
    }
    return out + '</div>';
  }

  function mockLayer(placement) {
    var pick = SPONSORS[Math.floor(Math.random() * SPONSORS.length)];
    var shade = document.createElement('div');
    shade.className = 'ad-shade';
    shade.innerHTML =
      '<div class="ad-card">'
      + '<div class="ad-head"><span>Advertisement</span><span class="ad-tag">Sponsored</span>'
      + '<button class="ad-skip" type="button" disabled>Skip ad</button></div>'
      + '<div class="ad-stage">' + leafStage()
      + '<div class="ad-brand"><strong>' + pick.name + '</strong>'
      + '<em>' + pick.line + '</em></div>'
      + '<span class="ad-note">mock spot - nothing to install</span>'
      + '</div>'
      + '<div class="ad-foot"><div class="ad-count">Reward in ' + SPOT_SECONDS + 's</div>'
      + '<button class="btn btn-ad ad-claim" type="button" disabled>'
      + (LABELS[placement] || 'Claim reward') + '</button></div>'
      + '</div>';
    return shade;
  }

  function runMock(placement, done) {
    var shade = mockLayer(placement);
    var count = shade.querySelector('.ad-count');
    var claim = shade.querySelector('.ad-claim');
    var skip = shade.querySelector('.ad-skip');

    var settle = null;
    var closed = false;
    function finish(ok) {
      if (closed) return;
      closed = true;
      if (settle) root.clearInterval(settle);
      if (shade.parentNode) shade.parentNode.removeChild(shade);
      done(ok);
    }

    claim.addEventListener('click', function () { finish(true); });
    skip.addEventListener('click', function () { finish(false); });
    root.setTimeout(function () { skip.disabled = false; }, SKIP_SECONDS * 1000);
    document.body.appendChild(shade);

    var left = SPOT_SECONDS;
    var settle = root.setInterval(function () {
      left--;
      if (left > 0) { count.textContent = 'Reward in ' + left + 's'; return; }
      root.clearInterval(settle);
      count.textContent = 'Reward earned';
      count.classList.add('is-done');
      claim.disabled = false;
      claim.classList.add('is-hot');
    }, 1000);
  }

  function runNetwork(placement, done) {
    var cfg = Ads.config;
    var headers = { 'content-type': 'application/json' };
    if (cfg.appToken) headers.authorization = 'Bearer ' + cfg.appToken;
    var signal;
    if (typeof AbortController !== 'undefined') {
      var ctrl = new AbortController();
      signal = ctrl.signal;
      root.setTimeout(function () { ctrl.abort(); }, cfg.timeout);
    }
    root.fetch(cfg.endpoint, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({ placement: placement }),
      signal: signal
    }).then(function (res) { return res.json(); })
      .then(function (body) { done(!!(body && body.ok)); })
      .catch(function () { done(false); });
  }

  /* Plays one rewarded spot. Resolves true on the reward, false on a skip,
     a failure or a dead network. Returns false without starting anything
     when a spot is already on screen. */
  Ads.rewarded = function (placement, onDone) {
    if (Ads.playing || !LABELS[placement]) return false;
    Ads.playing = true;
    function finish(ok) {
      Ads.playing = false;
      if (onDone) onDone(ok);
    }
    if (activeTransport) { activeTransport(placement, finish); return true; }
    if (Ads.config.endpoint) { runNetwork(placement, finish); }
    else { runMock(placement, finish); }
    return true;
  };

  /* Swaps the mock or the bare endpoint for a fuller transport - same seam
     LeafRank.setTransport offers on the ladder. */
  Ads.setTransport = function (fn) { activeTransport = fn || null; };

  root.LeafAds = Ads;
})(typeof window !== 'undefined' ? window : globalThis);
