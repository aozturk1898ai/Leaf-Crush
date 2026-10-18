/* Leaf Crush - Google H5 Games Ads transport for the rewarded seam.
   H5 Games Ads is Google's ad program for web games, and the only rewarded
   path that works both on the open web AND inside a packaged Trusted Web
   Activity, which is this game's Android shape. It is inert until it is
   enabled from js/config.js:

     LeafH5Ads.config.enabled = true;   // after the site is enrolled
     LeafH5Ads.config.twa = true;       // when running inside the TWA build
     LeafH5Ads.activate();              // hands the transport to LeafAds

   Enrollment (owner of the site, in AdSense): add the site, choose
   "H5 Games Ads", pass the review. No ad unit id lives in this file -
   Google decides what to serve from the site itself.

   Until activated, LeafAds keeps playing its internal mock spot, so the
   game behaves identically in development and testing. */
(function (root) {
  'use strict';

  var H5 = {
    config: {
      enabled: false,
      twa: false,             /* inside the packaged Android shell */
      minInterval: 30000      /* rewarded spots only every 30s */
    },
    ready: false
  };

  var lastBreak = 0;
  var GPT_URL = 'https://securepubads.g.doubleclick.net/tag/js/gpt.js';

  /* Loads gpt.js once. Calls queue through googletag.cmd, which the
     library drains as soon as it arrives. Resolves anyway after a timeout
     so a blocked network pays nothing instead of hanging the game. */
  function loadSdk() {
    return new Promise(function (resolve) {
      if (root.googletag && typeof root.googletag.adBreak === 'function') return resolve();
      root.googletag = root.googletag || { cmd: [] };
      var probe = root.setInterval(function () {
        if (root.googletag && typeof root.googletag.adBreak === 'function') {
          root.clearInterval(probe);
          resolve();
        }
      }, 120);
      root.setTimeout(function () { root.clearInterval(probe); resolve(); }, 9000);
      var tag = document.createElement('script');
      tag.async = true;
      tag.src = GPT_URL;
      document.head.appendChild(tag);
    });
  }

  /* Maps the game's placement to an H5 ad break. One call, one verdict:
     paid exactly once, through the first of the callbacks that speaks. */
  function breakReward(onDone) {
    var settled = false;
    function finish(ok) {
      if (settled) return;
      settled = true;
      onDone(ok);
    }

    root.googletag.cmd.push(function () {
      if (typeof root.googletag.adBreak !== 'function') return finish(false);
      root.googletag.adBreak({
        type: 'reward',
        /* H5 first asks whether the player wants the spot; the game's own
           fail card is the offer screen, so confirm immediately. */
        beforeReward: function (showAdFn) { showAdFn(); },
        adDismissed: function () { finish(false); },
        adCompleted: function () { finish(true); },
        adBreakDone: function (info) {
          lastBreak = Date.now();
          /* The done callback is the safety net; only plays its part when
             an earlier callback never arrived. */
          if (!settled) finish(!!(info && info.outcome === 'granted'));
        }
      });
    });
  }

  /* The transport LeafAds will call once activated. */
  function transport(placement, onDone) {
    var wait = Date.now() - lastBreak;
    if (wait < H5.config.minInterval) return onDone(false);
    loadSdk().then(function () {
      H5.ready = true;
      breakReward(onDone);
    });
  }

  /* Hands the transport to LeafAds when - and only when - enabled. */
  H5.activate = function () {
    if (H5.config.enabled && root.LeafAds && !H5.activated) {
      H5.activated = true;
      root.LeafAds.setTransport(transport);
    }
    return !!H5.activated;
  };

  root.LeafH5Ads = H5;
})(typeof window !== 'undefined' ? window : globalThis);
