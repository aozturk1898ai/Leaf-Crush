/* Leaf Crush - the ladder.
   There is no server yet, so the board is built locally: a fixed roster of
   rivals whose totals climb slowly through the current month, plus you. The
   whole thing sits behind fetchBoard(), so pointing CONFIG.endpoint at a real
   API - or handing setTransport() a function - swaps the source with no other
   change. Expected response shape:
     { entries: [{ name, leaf, stars, score, you? }, ...] } */
(function (root) {
  'use strict';

  var CONFIG = {
    endpoint: null,        /* e.g. 'https://ladder-worker.example.workers.dev/ladder' */
    token: null,           /* sent as a bearer token when set */
    pollMs: 60000
  };

  var transport = null;    /* custom loader, mainly for tests */

  /* An anonymous stable id for the ladder, kept in its own storage slot so a
     save reset does not strand a player's ladder entry. The server upserts
     against this, so it is a random token - nothing readable about you. */
  var ID_KEY = 'leafcrush-player-id';
  function playerId() {
    try {
      var id = root.localStorage.getItem(ID_KEY);
      if (!id) {
        id = 'p' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
        root.localStorage.setItem(ID_KEY, id);
      }
      return id;
    } catch (err) { return 'p-anon'; }
  }

  /* Twenty-four rivals. Names are cosmetic; the spread is generated below so
     the ladder has a couple of giants and a crowd worth climbing through. */
  var NAMES = [
    'Mossy Paws', 'Fern Whistle', 'Clover King', 'Acorn Amy', 'Thistle',
    'Bramble', 'Dewdrop', 'Quiet Oak', 'Petal', 'Rustle',
    'Sunny Sid', 'Ginkgo Grey', 'Willow', 'Ivy Loop', 'Twiglet',
    'Mushroom Mike', 'Pond Lily', 'Cedar', 'Holly', 'Nettle',
    'Maple Mo', 'Birchy', 'Lichen', 'Last Leaf'
  ];

  function hash(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roster() {
    var rand = hash(20260616);
    var out = [];
    for (var i = 0; i < NAMES.length; i++) {
      /* pow() biases the crowd low, so most rivals sit within reach. */
      var t = Math.pow(rand(), 1.75);
      out.push({
        name: NAMES[i],
        leaf: Math.floor(rand() * 7),
        base: Math.round(2 + t * 215),
        rate: 0.006 + rand() * 0.034        /* stars per hour */
      });
    }
    return out;
  }

  var RIVALS = roster();

  /* Totals reset on the first of the month, which gives the ladder a season
     and keeps the rivals from drifting permanently out of reach. */
  function monthStart(now) {
    var d = new Date(now);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  }

  function offlineBoard(player) {
    var now = Date.now();
    var hours = (now - monthStart(now)) / 3600000;
    var cap = root.LeafChapters.TOTAL * 3;
    var entries = RIVALS.map(function (rival) {
      var stars = Math.min(cap, Math.round(rival.base + rival.rate * hours));
      return {
        name: rival.name,
        leaf: rival.leaf,
        stars: stars,
        score: stars * 615 + rival.base * 37
      };
    });

    entries.push({
      name: player.name || 'You',
      leaf: player.leaf == null ? 3 : player.leaf,
      stars: player.stars || 0,
      score: player.score || 0,
      you: true
    });

    entries.sort(function (a, b) { return b.stars - a.stars || b.score - a.score; });
    for (var i = 0; i < entries.length; i++) entries[i].rank = i + 1;
    return Promise.resolve({ entries: entries, live: false, updated: now });
  }

  function liveBoard(player) {
    var url = CONFIG.endpoint
      + (CONFIG.endpoint.indexOf('?') < 0 ? '?' : '&')
      + 'id=' + encodeURIComponent(playerId())
      + '&stars=' + encodeURIComponent(player.stars || 0)
      + '&score=' + encodeURIComponent(player.score || 0)
      + '&name=' + encodeURIComponent(player.name || 'You')
      + '&leaf=' + encodeURIComponent(player.leaf == null ? 3 : player.leaf);
    var headers = {};
    if (CONFIG.token) headers.Authorization = 'Bearer ' + CONFIG.token;
    return root.fetch(url, { headers: headers })
      .then(function (response) {
        if (!response.ok) throw new Error('ladder ' + response.status);
        return response.json();
      })
      .then(function (data) {
        var entries = (data && data.entries ? data.entries : []).slice();
        entries.sort(function (a, b) { return (b.stars || 0) - (a.stars || 0); });
        for (var i = 0; i < entries.length; i++) if (!entries[i].rank) entries[i].rank = i + 1;
        return { entries: entries, live: true, updated: Date.now() };
      });
  }

  /* Falls back to the local board if a live call fails, so the screen never
     ends up empty. */
  function fetchBoard(player) {
    if (transport) return transport(player);
    if (CONFIG.endpoint) {
      return liveBoard(player).catch(function () { return offlineBoard(player); });
    }
    return offlineBoard(player);
  }

  function rankOf(entries) {
    for (var i = 0; i < entries.length; i++) if (entries[i].you) return entries[i];
    return null;
  }

  root.LeafRank = {
    config: CONFIG,
    isLive: function () { return !!(transport || CONFIG.endpoint); },
    setTransport: function (fn) { transport = fn || null; },
    fetchBoard: fetchBoard,
    rankOf: rankOf
  };
})(typeof window !== 'undefined' ? window : globalThis);
