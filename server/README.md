# Going live — ladder, ads, hosting

One deployable (`server/`), one config file (`js/config.js`), and a host.
Total live cost: **$0** on Cloudflare's free tiers.

## 1. The ladder — `ladder-worker.mjs`

A single Cloudflare Worker function. Storage is one KV namespace; every
request upserts the caller against their stable anonymous id (kept in the
browser's own slot, never reset by the game save), keeps their best
stars/score for the current month, and returns the top 25 with the caller's
row pinned on. Seasons roll on the 1st automatically.

Deploy:

```sh
npm i -g wrangler
cd server
wrangler login
wrangler kv namespace create LADDER     # copy the printed id into wrangler.toml
wrangler deploy                         # prints https://leafcrush-ladder.YOURNAME.workers.dev
```

Then in `js/config.js`:

```js
LeafRank.config.endpoint = 'https://leafcrush-ladder.YOURNAME.workers.dev/ladder';
```

Notes:

- `wrangler secret put TOKEN` arms a shared secret; the game must then send
  the same string via `LeafRank.config.token`.
- Steam it isn't: scores are **client-reported**, sanity-capped only
  (stars ≤ 1200, score ≤ 9,000,000, name ≤ 24 chars, stripped). Fine for a
  maker game; not an anti-cheat claim.
- Free-tier limits: 1 KV write per changed request (write-on-change logic),
  reads well within the 100k/day allowance even with the 60-second ladder
  poll while the screen is open.

Checkout alternative: the same contract works on any host that can answer
`GET ?id=&stars=&score=&name=&leaf=` with `{ entries: [...] }` — the shape is
also in `js/rank.js`'s header.

## 2. Rewarded ads

Two supported styles; pick one in `js/config.js`.

**Style A — Google H5 Games Ads (recommended for the Android build).**
Works on the web **and** inside the TWA — this is the program Google built
for web games boxed as Android apps.

1. Publish the site (step 3) on your own domain or a Netlify/GitHub Pages
   URL you own.
2. Sign up at AdSense, add the site, and request **H5 Games Ads**.
3. After approval:

   ```js
   // js/config.js
   LeafH5Ads.config.enabled = true;
   LeafH5Ads.config.twa = true;   // in the packaged Android build
   LeafH5Ads.activate();
   ```

   `js/ads-h5.js` loads `gpt.js` lazily and maps both placements
   (`continue`, `energy`) to rewarded breaks; until then the mock spot runs
   unchanged, so nothing breaks during review or testing.

**Style B — your own rewarded endpoint.** Any server that answers
`POST {placement}` + bearer token with `{ ok: true }`:

```js
LeafAds.config.endpoint = 'https://your-host/ads/rewarded';
LeafAds.config.appToken = 'app-token';
```

## 3. An https origin

Both the TWA and H5 Games Ads require a real https site. Quickest options,
best first:

**Netlify Drop (minutes, no git):** drag the `leaf-crush/` folder onto
<https://app.netlify.com/drop> → instant URL like
`https://leaf-crush.netlify.app`. Custom domain optional. Free tier fits.

**GitHub Pages (if the repo moves to GitHub):**

```sh
git init && git add . && git commit -m "Leaf Crush"
git remote add origin https://github.com/USERNAME/leafcrush.git
git push -u origin main
# then: repo Settings → Pages → Source: Deploy from branch → main /[root]
```

Site appears at `https://USERNAME.github.io/leafcrush/leaf-crush/` (the
manifest uses relative URLs, so the subfolder works as-is).

**Cloudflare Pages:** `npx wrangler pages deploy leaf-crush --project-name leaf-crush`
(also hosts the ladder next door on the same account).

The game needs **no build step** — deploy the folder as it sits.

## 4. The Android shell (TWA → Play Store)

Once the https URL is known:

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://YOUR-SITE/leaf-crush/manifest.webmanifest
bubblewrap build        # signs app-release-bundle.aab with your key
```

- `bubblewrap init` asks for a package id (`com.youname.leafcrush`) and
  generates the Play signing flow; it prints `assetlinks.json` — drop that
  at `https://YOUR-SITE/.well-known/assetlinks.json`.
- On first upload Play generates the signing key: follow the prompts, keep
  the keystore file and password safe — losing them means losing app
  updates.
- Statement-only TWAs run the site full-screen; our manifest's standalone
  mode + portrait + theme colours carry over unchanged.

## 5. Go-live checklist

1. hosting done (https URL in hand)
2. `js/config.js`: ladder endpoint (+ token if armed)
3. ladder live: open the game, Ranking shows **"Loading…" → live server
   badge, entries**
4. ads enrolled and `LeafH5Ads.activate()` uncommented; test a reward on a
   dev device before submitting
5. `bubblewrap build` → Play Console → internal testing track → rollout
6. after future content updates: bump `CACHE` in `sw.js`
   (`leaf-crush-v2` → `v3`) so installs refresh
