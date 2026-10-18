/* Leaf Crush ladder - a Cloudflare Worker.
   One endpoint, GET only, matching js/rank.js liveBoard() byte for byte:

     GET /ladder?id=...&stars=...&score=...&name=...&leaf=...
     -> 200 { entries: [{ name, leaf, stars, score, you?, rank }], updated }

   The player is upserted against their anonymous id on every request, keeps
   their best stars/score, and the board is top 25 with the caller pinned on
   if they fall outside it. Totals live in per-month buckets, so the 1st of
   the month starts a fresh season, same rule the offline roster follows.

   Deploy (Cloudflare account, free tier is far more than a ladder needs):

     npm i -g wrangler
     wrangler kv namespace create LADDER
     # copy the printed id into the kv_namespaces block below
     wrangler deploy

   Optional shared secret: `wrangler secret put TOKEN`, then set the same
   string as LeafRank.config.token in the game's js/config.js. Without it the
   endpoint is public, CORS-open, and accepts client-reported scores - fine
   for a maker ladder, which is why answers are never trusted beyond sanity
   caps. */

const BOARD_PREFIX = "board:";
const MAX_ROWS = 2000;      // hard ceiling of stored players per season
const MAX_STARS = 1200;     // 400 chapters x 3
const MAX_SCORE = 9000000;  // well past any honest run

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });

const clampInt = (value, max, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : fallback;
};

function sanitize(request) {
  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").replace(/[^a-z0-9-]/gi, "").slice(0, 64);
  if (!id) return null;
  const rawName = String(url.searchParams.get("name") || "You");
  const name = rawName.replace(/[^\p{L}\p{N} '[\]·\-.!?]/gu, "").trim().slice(0, 24) || "You";
  const leafRaw = Math.floor(Number(url.searchParams.get("leaf")));
  return {
    id,
    name,
    leaf: Number.isFinite(leafRaw) ? Math.max(0, Math.min(6, leafRaw)) : 3,
    stars: clampInt(url.searchParams.get("stars"), MAX_STARS),
    score: clampInt(url.searchParams.get("score"), MAX_SCORE),
    updated: Date.now(),
  };
}

export function seasonKey(now = Date.now()) {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* One KV value holds the whole season's board: a single read and a single
   conditional write per request. A snapshot model is fine for a casual
   ladder; two simultaneous submissions can clobber one another, which loses
   at most one entry update. */
async function readBoard(env, key) {
  const raw = await env.LADDER.get(key);
  if (raw) return JSON.parse(raw);
  return { season: key.slice(BOARD_PREFIX.length), rows: {} };
}

function mergeRow(board, player) {
  const prev = board.rows[player.id];
  const keep = Math.max;
  board.rows[player.id] = {
    name: player.name,
    leaf: player.leaf,
    stars: keep(prev ? prev.stars : 0, player.stars),
    score: keep(prev ? prev.score : 0, player.score),
    updated: player.updated,
  };
}

/* Anything from before the current season is simply dropped: the board
   object is written back under the current month's key only. */
export function buildEntries(board, callerId, limit = 25) {
  const rows = Object.entries(board.rows).map(([id, r]) => ({ id, ...r }));
  rows.sort((a, b) => b.stars - a.stars || b.score - a.score || a.name.localeCompare(b.name));
  const top = rows.slice(0, limit);
  const entries = top.map((r, i) => ({
    name: r.name,
    leaf: r.leaf,
    stars: r.stars,
    score: r.score,
    rank: i + 1,
    ...(r.id === callerId ? { you: true } : {}),
  }));
  const mine = rows.findIndex((r) => r.id === callerId);
  if (mine >= limit) {
    const r = rows[mine];
    entries.push({
      name: r.name, leaf: r.leaf, stars: r.stars, score: r.score,
      rank: mine + 1, you: true,
    });
  }
  return { rows: mine >= 0, total: rows.length, entries };
}

export default {
  async fetch(request, env) {
    if (request.method !== "GET") return json({ error: "GET only" }, 405);

    const token = env.TOKEN;
    if (token) {
      const sent = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      if (sent !== token) return json({ error: "bad token" }, 401);
    }
    if (!env.LADDER) return json({ error: "KV namespace LADDER is not bound" }, 500);

    const player = sanitize(request);
    if (!player) return json({ error: "need ?id= (stars, score, name, leaf optional)" }, 400);

    const key = BOARD_PREFIX + seasonKey(player.updated);
    const board = await readBoard(env, key);
    const before = JSON.stringify(board.rows[player.id] || null);
    mergeRow(board, player);
    const after = JSON.stringify(board.rows[player.id]);
    if (before !== after) {
      if (Object.keys(board.rows).length > MAX_ROWS) {
        /* keep the strongest players; a ladder that never trims would grow forever */
        const ranked = Object.entries(board.rows)
          .sort((a, b) => b[1].stars - a[1].stars || b[1].score - a[1].score)
          .slice(0, MAX_ROWS);
        board.rows = Object.fromEntries(ranked);
      }
      await env.LADDER.put(key, JSON.stringify(board));
    }

    const out = buildEntries(board, player.id);
    return json({
      entries: out.entries,
      updated: player.updated,
      season: key.slice(BOARD_PREFIX.length),
      players: out.total,
    });
  },
};
