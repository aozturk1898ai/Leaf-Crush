# Leaf Crush

A match-three puzzle in the spirit of Candy Crush, but nothing here is candy:
every piece is a leaf. Swap two neighbouring leaves to line up three or more of
the same kind, and clear your way through **400 chapters** across twenty gardens.

Opens straight from the file system — plain scripts, no build step, no
dependencies, no network calls.

```
leaf-crush/
  index.html          chapter map, board, album, ladder and dev panel
  css/style.css       forest theme, mobile-first, per-garden tints
  js/leaves.js        the seven leaf silhouettes and the special-piece art
  js/engine.js        the rules: matching, specials, rocks, frost, gravity
  js/chapters.js      all 400 chapters, generated from a fixed seed
  js/specimen.js      the collectible card art and the album plates
  js/rank.js          the ladder: offline rivals behind an API-ready seam
  js/market.js        the shop's wares, priced in seeds
  js/ads.js           rewarded spots behind an API-ready seam
  js/ads-h5.js        Google H5 Games Ads transport, inert until enabled
  js/config.js        launch values: ladder endpoint, rewarded-ad style
  js/game.js          screens, rendering, input and the cascade timing
  server/             the deployable ladder (a Cloudflare Worker) and the go-live guide
  sw.js               the offline shell, precached on install
  manifest.webmanifest   install identity: name, colours, portrait, icons
  icons/              app icons for Android's launcher, plus a maskable variant
```

## Running it

Double-click `index.html`, or serve the folder if you prefer:

```sh
python -m http.server 8124 --bind 127.0.0.1
# then open http://127.0.0.1:8124/leaf-crush/index.html
```

`python -m http.server` sends no cache headers, so the browser is free to reuse
`style.css` and the `js/*.js` files after you edit them: after changing a file, do
a hard refresh (`Ctrl`+`F5`, or `Cmd`+`Shift`+`R`). `file://` has the same quirk.

Progress is kept in `localStorage` — stars and best scores per chapter, the
specimens you have pressed, which albums are complete, your seeds, the special
pieces in your bag, your energy and top-up timer, sound on/off, which tutorial
cards you have seen, and the developer flag. It survives a reload. If storage is
blocked the game still plays, it just will not remember anything.

## Android

The folder is a Progressive Web App. Serve the `leaf-crush/` folder over
**https** (any static host works) and Android Chrome will offer
**Install app** / *Add to Home screen*:

- `manifest.webmanifest` carries the identity — standalone display, portrait
  lock, theme and background colours, and the icon set in `icons/` (a regular
  set plus a maskable variant, both drawn in the game's palette).
- `sw.js` precaches the whole shell, so an installed copy plays with **no
  network at all** — the chapter data, boards, albums and ladder are all local.
  Bump the `CACHE` version string in `sw.js` whenever the game ships content
  changes; the worker swaps caches on activate and the next open picks up the
  new files.
- The register call in `index.html` no-ops quietly on `file://`, so the
  double-clicked desktop copy behaves exactly as before.

For a Play Store listing, wrap the live site as a **Trusted Web Activity** —
the site is already the app. The complete go-live guide — hosting options, the
ladder worker, ads enrollment, and the bubblewrap commands — lives in
**`server/README.md`**.

```sh
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://your-host.example/leaf-crush/manifest.webmanifest
bubblewrap build      # produces the signed app bundle
```

That needs an https origin you control, plus the `assetlinks.json` file
Bubblewrap prints for it. The two outsourced services are wired through
`js/config.js` as documented below (and in full in `server/README.md`): set
`LeafRank.config.endpoint` for the ladder and the rewarded-ad style for spots
once real endpoints exist.

## The leaves

Seven kinds, each drawn as an SVG silhouette so they stay sharp at any size:

| Leaf | Colour | Notes |
| --- | --- | --- |
| Maple | red | five-lobed |
| Clover | green | three round lobes |
| Fern | teal | curved frond |
| Ginkgo | gold | notched fan |
| Birch | lime | pointed oval |
| Beech | violet | long and narrow |
| Lotus | pink | round lily pad |

Sprout Meadow alone uses five kinds; Dewdrop Ferns adds a sixth, Elder Forest
from garden six on uses all seven, and more kinds means matches are much
harder to find.

## How a chapter works

Each chapter has a board (8×8), a set number of **moves**, and two or three
**objectives**:

- **Score** — reach the target.
- **Collect** — clear *n* leaves of a named kind.
- **Clear frost** — break every frost layer on the board.
- **Break rocks** — smash every rock.

You win the moment every objective is ticked, even with moves to spare. Run out
of moves first and the chapter is lost.

### The score target

The target is drawn from the chapter's own **move budget rather than from its
chapter number**: points per clear are the same in chapter 400 as in chapter 1,
so a target that grew with the number would eventually be more than a board can
pay for. Instead the target is a share of what a solid run of that chapter
earns — the share climbs from about half on the opening boards to four fifths
at the end, which is where sweeter play really pays. Targets were tuned against
simulated play, not guesswork.

The opening gardens are also a couple of moves lighter than they used to be, and
the second garden already brings a sixth leaf.

### Scoring and stars

Points come from matched leaves, specials going off, breaking rocks, thawing
frost and making new special pieces — the later a cascade runs, the bigger its
multiplier.

When you clear a chapter, everything still in hand is cashed in first:

- **Every unused move is worth 60 points.**
- **Any special pieces still on the board go off in one last sweep.**

Only then is the star score worked out, so a quick, efficient clear pays off:

| Stars | Score |
| --- | --- |
| ★ | clear the chapter |
| ★★ | ~1.45× the score target |
| ★★★ | ~1.95× the score target |

The result card shows the final score, how much of it was bonus, and the exact
point totals needed for the next two stars.

### Special pieces

| Made by | Piece | What it does |
| --- | --- | --- |
| 4 in a line | Line leaf | Fires along its row or column |
| 5 in a line | Golden leaf | Swap it onto any leaf to clear every leaf of that colour (two golden leaves clear the board) |
| An L or T shape | Seed bomb | Blows up the 3×3 around itself |

The first time you make each one, a card pops up with an animated demo showing
the shape to match and what the piece does. Each card appears once; the fact
that you have seen it is stored alongside your stars.

Specials that get caught in another special's blast chain off, and they damage
nearby rocks as they go.

### Special combos

Swapping two special pieces onto each other fuses them into a bigger blast:

| Combo | Result |
| --- | --- |
| Line + line | Clears the whole row *and* column through the swap point |
| Line + boom | Clears three rows and three columns in a fat cross |
| Boom + boom | 5×5 blast |
| Golden + any leaf | Clears every leaf of that colour |
| Golden + line | Sweeps that colour and the full row or column |
| Golden + boom | Sweeps that colour and a 5×5 block |
| Golden + golden | Clears the whole board |

Every blast throws a bright sweep across the area it clears, so you can see
exactly what a piece did.

### Obstacles

- **Rocks** are immovable and block tiles from falling past them. A match made
  next to a rock chips it; explosions smash them outright. Tougher rocks take
  two hits (they show a crack after the first).
- **Frost** sits on a *cell*, not on a leaf. Any match made on that cell thaws
  one layer, so double-thick frost needs two matches.

## Difficulty curve

| Chapters | Garden | Twist |
| --- | --- | --- |
| 1–20 | Sprout Meadow | five leaves, score and collect only |
| 21–40 | Dewdrop Ferns | a sixth leaf, frost on nine of the twenty |
| 41–60 | Autumn Hollow | rocks appear and a second collect goal |
| 61–80 | Ginkgo Grove | double-thick frost arrives |
| 81–100 | Clover Canyon | rocks with two faces |
| 101–120 | Elder Forest | all seven leaves |
| 121–140 | Misty Marsh | all seven leaves, tighter rock counts |
| 141–240 | Sunflower Fields to Ember Wastes | more of each chapter carries frost |
| 241–260 | Moonlit Fen | frost and rocks on every chapter |
| 261–320 | Salt Flats to Petrified Wood | every chapter carries both, bigger goals |
| 321–360 | Aurora Tundra to Volcanic Slope | rocks take up to three hits |
| 361–380 | Skyfall Glade | first three-layer frost |
| 381–400 | World Tree | three-layer frost and three-hit rocks |

Chapters unlock one at a time, in order. The last chapters ask for a mix of
three-layer frost, three-hit rocks, two collect goals and a score target well
into four figures, in twenty moves.

## Collecting specimens

Clearing a chapter presses its signature leaf into a **specimen card**. The
card art is generated from the chapter's own seed, so all 400 look a little
different — different leaf, different frame, different sparkles. The number and
stars sit on top of it in a little phone-friendly badge.

A freshly won card plays a one-shot pop-and-shine on the map, and the result
card shows it the moment you clear the chapter.

Cards are filed into **twenty albums, one per garden** (twenty cards each). Open
the album screen from the map — the **Albums** button, or the album strip on
the garden banner — to flick through a garden's cards. Tapping a card opens it
full size with its best score and a *Play* button.

Fill all twenty cards in an album and the album completes:

- a full-page illustration for that garden, added to your shelf;
- a **badge** on the album header;
- **energy refilled to full**, plus 20 seeds.

## Energy

Playing costs energy. You hold up to **5 leaves**, each attempt costs one, and
one grows back every **30 minutes**. The pill in the corner of the map and the
board header shows what you have and counts down to the next leaf.

Run dry and the game offers to wait, to refill instantly for **30 seeds**, or to
watch a short ad for one free leaf (see *Rewarded spots* below). Seeds are
earned by clearing chapters (6 plus 4 per star), and twenty more come
with every album you finish. Finishing an album refills you outright.

## The market

Every balance on the map — the seed count in the corner — is also the way into
the **Market**. Inside there are three shelves:

| Shelf | Item | Seeds | What you get |
| --- | --- | --- | --- |
| Energy | One leaf | 12 | One life, right now |
| Energy | Full tank | 30 | The meter topped up to five |
| Specials | Line leaf | 20 | A ready-made line piece |
| Specials | Seed bomb | 28 | A ready-made seed bomb |
| Specials | Golden leaf | 42 | A ready-made golden leaf |
| Bundles | Gardener's crate | 66 | A full tank, a line leaf and a seed bomb |

Anything you cannot afford is dimmed and will not take your seeds. Buying lives
tops the meter up without resetting the regrowth clock unless the meter ends up
full; a life bought for an already-full meter is refused rather than quietly
taking the seeds. The crate still sells at a full meter, since its special pieces
are the real purchase.

Special pieces go into **your bag**. You can also open the market mid-chapter
from the bag row under the objectives, and buying there drops you straight back
onto the board with your moves intact.

### Using a piece

The bag row sits under the objectives on the board:

```
[ line ×2 ] [ bomb ×0 ] [ golden ×1 ] [ Market ]
```

Tap a piece to arm it (the board glows), then tap any leaf to drop it there. A
line leaf lets you choose **Row** or **Col** first. The piece keeps the leaf it
lands on so it can still be matched normally, except the golden leaf, which
arrives uncoloured. If dropping it would complete a line on arrival it is
recoloured instead, so it never gets eaten by the next cascade.

Dropping a piece is **free** — it costs no move. Tapping a piece you have none
of, or the empty-looking chip, opens the market.

## Game feel

The board is meant to answer back. A pass of polish runs through the whole game:

- **Every garden tints the world.** Twenty accents, one per garden, repaint the page
  backdrop and the app column, and fourteen leaves drift slowly across the
  background — so the empty margins on a desktop are scenery, not dead space.
- **Chapters open with the leaves falling in**, row by row; input is held until
  the last row lands so a tap cannot read a moving tile.
- **Screens fade or slide in** instead of cutting, each with a short swoosh.
- **The score rolls up** to its new total instead of jumping, and the score meter
  punches on every tick.
- **Objectives react**: a chip nudges when its count ticks up, and celebrates
  when it is finished.
- **Deep cascades shout** — `Nice!`, `Great!`, `Awesome!`, `Incredible!`,
  `Unbelievable!` land across the middle of the board, and the clear sound climbs
  with the cascade depth.
- **Blasts shake the screen**, scaled from a line sweep up to a whole-board
  golden clear, each with a short hit-stop before it lands.
- **The last three moves are tense**: the board pulses, the moves meter beats,
  and a `3 moves left` / `Last move!` callout lands.
- **The win card is a small ceremony**: the score counts up, then the stars drop
  in one at a time. Tapping the card — or `Esc` — skips to the end.
- **Light haptics** on clears, specials, goals, stars and the win, behind the
  same switch as the sound.

There is no server configured by default, so the board is built locally by
`js/rank.js`: a fixed</think><tool_call>edit<arg_key>newString</arg_key><arg_value>## The ladder

The **Ranking** screen is a monthly ladder: twenty-five players sorted by stars,
then by total score, with your row highlighted so you can see who you are
chasing.

With no server configured, the board is built locally by `js/rank.js`: a fixed
roster of rivals whose totals climb slowly through the current month, which
resets on the 1st so the ladder always has a season. Your own figures are your
real star count and the sum of your best scores.

Going live is a paste into `js/config.js`. `server/ladder-worker.mjs` (deploy
steps in `server/README.md`) is a Cloudflare Worker that matches this screen's
contract: each open screen upserts you against an anonymous id, keeps your best
stars and score for the month, and returns the top 25 with your row pinned on
even when you rank lower. If the call fails, the screen quietly falls back to
the offline ladder.

## Rewarded spots

Running out of moves turns one door into money: the fail card offers
**Watch a short ad — +5 moves**. A mock spot plays — a fake sponsor card with a
five-second countdown, a skip that pays nothing — and claiming it brings the
stalled chapter back to life without touching the board. One spot per attempt;
run out again and the card is back to *Try again* and *Chapters*. The second
place a spot plays is the energy card: **Watch a short ad — 1 free leaf** when
the meter is dry, which then starts the chapter you were opening.

Both sit behind the same seam as the ladder, configured from `js/config.js`.
Pick either style — Google **H5 Games Ads** (`js/ads-h5.js`, the one that works
inside the packaged Android build, enabled with `LeafH5Ads.activate()`), or
your own endpoint:

```js
// js/config.js
LeafAds.config.endpoint = 'https://example.com/ads/rewarded';
LeafAds.config.appToken = 'app-token-from-the-network';
```

With a live transport set the mock never appears; otherwise it plays on, so
review and testing behave exactly as on the desktop. A bare endpoint call is a
`POST` carrying `{ placement }` with the token in the Authorization header;
`{ ok: true }` pays the reward, anything else — a skip, a timeout, a failed
call — pays nothing. Placements in use: `continue` and `energy`.

## Developer mode

A panel for trying any chapter without unlocking it. Open it with **`D`**, or by
tapping the **STARS** total on the map three times.

- **Jump to chapter** — plays any of the 400 immediately, bypassing the unlock
  order and without spending energy.
- **God mode** — opens every chapter and makes attempts free. It persists.
- **Refill energy**, **+40 seeds**, **Special pieces**, **Clear next**,
  **Fill album** — shortcuts for testing the collection, album, market and
  ladder screens.
- **Reset save** — the same as *Reset progress*, but also clears specimens,
  albums, bag and energy.

## Controls

- **Drag** a leaf onto a neighbour, or **tap one leaf then tap its neighbour**.
- **Tap a piece in the bag row** to arm it, then tap a leaf to drop it.
- **Hint** highlights a working move; the game also offers one if you idle.
- If the board ever runs out of possible moves it reshuffles itself.
- **Tap the win card** to skip its opening animation and jump to the buttons.
- `H` shows a hint, `D` opens the developer panel, `Esc` leaves a screen, skips a
  reward animation, cancels a piece in hand and closes any dialog.

## Debug handle

`window.LeafCrush` is exposed for poking at a live chapter from the console:

```js
LeafCrush.start(43)          // jump to any chapter, unlocked or not
LeafCrush.board().snapshot() // plain-text view of the grid
LeafCrush.board().anyMoves() // a legal swap right now
LeafCrush.board().comboInfo(a, b) // what two specials would do together
LeafCrush.refresh()          // redraw every tile from the model
LeafCrush.game.score         // live score / moves / objectives
LeafCrush.hint()             // flash a legal move

LeafCrush.save()             // the whole save object
LeafCrush.energy()           // { lives, next, seeds }
LeafCrush.seeds(40)          // add seeds
LeafCrush.god(true)          // unlock everything, free attempts
LeafCrush.album(2)           // open an album
LeafCrush.rank()             // open the ladder
LeafCrush.market()           // open the market
LeafCrush.bag()              // { line, bomb, golden }
LeafCrush.give('line', 2)    // add special pieces (no kind = one of each)
LeafCrush.specimen(7)        // view one card
LeafCrush.dev(true)          // open the developer panel
```

`snapshot()` prints one row per line, e.g. `0 1 R1 2 L2i ..` where `R1` is a
rock with one hit left, `L2` a line special on a leaf-2 cell, and `i` marks
frost.
