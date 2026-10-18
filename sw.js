/* Leaf Crush - offline shell.
   Precaches every game file so the chapter map, boards, albums and the
   ladder all work with the network gone - the ladder already builds its
   roster locally and the rewarded-seam endpoints are only called when
   configured. Bump CACHE whenever the game ships an update; the old cache
   is dropped on activate so players pick up the new files on the next open. */

var CACHE = "leaf-crush-v2";

var SHELL = [
  "./",
  "./index.html",
  "./css/style.css",
  "./manifest.webmanifest",
  "./js/leaves.js",
  "./js/engine.js",
  "./js/chapters.js",
  "./js/specimen.js",
  "./js/rank.js",
  "./js/market.js",
  "./js/ads.js",
  "./js/ads-h5.js",
  "./js/config.js",
  "./js/game.js",
  "./icons/icon-64.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(SHELL); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.map(function (k) {
          return k === CACHE ? null : caches.delete(k);
        }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

/* Cache-first with a network fallback. Only same-origin GETs are served from
   the cache; anything else (an ad or ladder endpoint if it is configured)
   goes straight to the network, which is also where offline failures land. */
self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  var url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then(function (hit) {
      if (hit) return hit;
      return fetch(event.request).then(function (res) {
        if (res && res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        }
        return res;
      });
    })
  );
});
