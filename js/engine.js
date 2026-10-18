/* Leaf Crush - board engine.
   Pure logic: no DOM, no timers, no globals beyond LeafEngine. The renderer
   drives it step by step (find a match -> clear it -> drop -> refill) so the
   animation can be interleaved with the model changes.

   Cell shape: { tile: Tile|null, stone: int, ice: int }
     stone  - hit points left on an immovable rock; 0 means empty cell.
              Rocks block tiles from falling past them.
     ice    - frost layers left on the *cell*; a match made on that cell
              removes one layer. Tiles still fall through normally.
   Tile shape: { id, leaf, special, dir }
     leaf   - index into LeafArt.TYPES, or -1 for an uncoloured golden leaf.
     special- null | 'line' | 'bomb' | 'golden'
     dir    - 'h' | 'v', only meaningful for a line special. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.LeafEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LINE = 'line';
  var BOMB = 'bomb';
  var GOLDEN = 'golden';

  function mulberry32(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function key(r, c) { return r + ':' + c; }

  function neighbours(r, c) {
    return [{ r: r - 1, c: c }, { r: r + 1, c: c }, { r: r, c: c - 1 }, { r: r, c: c + 1 }];
  }

  function LeafBoard(cfg) {
    cfg = cfg || {};
    this.rows = cfg.rows || 8;
    this.cols = cfg.cols || 8;
    this.typeCount = cfg.typeCount || 6;
    this.seed = cfg.seed == null ? 1 : cfg.seed;
    this.rng = mulberry32(this.seed);
    this.nextId = 1;
    this.shuffles = 0;

    var r, c, i;
    this.cells = [];
    for (r = 0; r < this.rows; r++) {
      var row = [];
      for (c = 0; c < this.cols; c++) row.push({ tile: null, stone: 0, ice: 0 });
      this.cells.push(row);
    }

    var stones = cfg.stones || [];
    for (i = 0; i < stones.length; i++) {
      var s = stones[i];
      if (this.inBounds(s[0], s[1])) this.cells[s[0]][s[1]].stone = s[2] || 1;
    }
    var ice = cfg.ice || [];
    for (i = 0; i < ice.length; i++) {
      var v = ice[i];
      if (this.inBounds(v[0], v[1])) this.cells[v[0]][v[1]].ice = v[2] || 1;
    }

    this.fill();
    this.ensurePlayable();
  }

  LeafBoard.prototype = {
    constructor: LeafBoard,

    inBounds: function (r, c) {
      return r >= 0 && c >= 0 && r < this.rows && c < this.cols;
    },

    cell: function (r, c) {
      return this.inBounds(r, c) ? this.cells[r][c] : null;
    },

    tile: function (r, c) {
      var cell = this.cell(r, c);
      return cell ? cell.tile : null;
    },

    leafAt: function (r, c) {
      var tile = this.tile(r, c);
      return tile ? tile.leaf : null;
    },

    newTile: function (leaf, special, dir) {
      return { id: this.nextId++, leaf: leaf, special: special || null, dir: dir || null };
    },

    randomLeaf: function () {
      return Math.floor(this.rng() * this.typeCount) % this.typeCount;
    },

    /* Pick a leaf for (r,c) that does not complete a line with the tiles
       already placed to the left or above it. Used for the opening board. */
    pickLeafAt: function (r, c) {
      var tried = {};
      for (var n = 0; n < 16; n++) {
        var leaf = this.randomLeaf();
        if (tried[leaf]) continue;
        tried[leaf] = 1;
        var ok = true;
        if (this.leafAt(r, c - 1) === leaf && this.leafAt(r, c - 2) === leaf) ok = false;
        if (this.leafAt(r - 1, c) === leaf && this.leafAt(r - 2, c) === leaf) ok = false;
        if (ok) return leaf;
      }
      return this.randomLeaf();
    },

    fill: function () {
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var cell = this.cells[r][c];
          if (cell.stone || cell.tile) continue;
          cell.tile = this.newTile(this.pickLeafAt(r, c), null);
        }
      }
    },

    /* --------------------------------------------------------- matching */

    sameLeaf: function (r, c, leaf) {
      var t = this.tile(r, c);
      return !!t && t.leaf === leaf && leaf >= 0;
    },

    /* Does this cell sit inside a run of three or more? */
    matchAt: function (r, c) {
      var tile = this.tile(r, c);
      if (!tile || tile.leaf < 0) return false;
      var leaf = tile.leaf;
      var n = 1, i;
      for (i = c - 1; this.sameLeaf(r, i, leaf); i--) n++;
      for (i = c + 1; this.sameLeaf(r, i, leaf); i++) n++;
      if (n >= 3) return true;
      n = 1;
      for (i = r - 1; this.sameLeaf(i, c, leaf); i--) n++;
      for (i = r + 1; this.sameLeaf(i, c, leaf); i++) n++;
      return n >= 3;
    },

    /* Every run of three or more, merged into groups, with the special piece
       each group should leave behind. `prefer` is the cell the player just
       moved, so the reward lands under their finger. */
    findMatches: function (prefer) {
      var runs = [], r, c, i;

      for (r = 0; r < this.rows; r++) {
        c = 0;
        while (c < this.cols) {
          var t = this.tile(r, c);
          if (!t || t.leaf < 0) { c++; continue; }
          var leaf = t.leaf, end = c + 1;
          while (end < this.cols) {
            var t2 = this.tile(r, end);
            if (!t2 || t2.leaf !== leaf) break;
            end++;
          }
          if (end - c >= 3) {
            var cells = [];
            for (i = c; i < end; i++) cells.push({ r: r, c: i });
            runs.push({ dir: 'h', leaf: leaf, cells: cells });
          }
          c = end;
        }
      }

      for (c = 0; c < this.cols; c++) {
        r = 0;
        while (r < this.rows) {
          var tv = this.tile(r, c);
          if (!tv || tv.leaf < 0) { r++; continue; }
          var lf = tv.leaf, re = r + 1;
          while (re < this.rows) {
            var tv2 = this.tile(re, c);
            if (!tv2 || tv2.leaf !== lf) break;
            re++;
          }
          if (re - r >= 3) {
            var vcells = [];
            for (i = r; i < re; i++) vcells.push({ r: i, c: c });
            runs.push({ dir: 'v', leaf: lf, cells: vcells });
          }
          r = re;
        }
      }

      /* Merge runs that share a cell: an L or T shape becomes one group.
         `owner` maps a cell to the group object that owns it. */
      var groups = [], owner = {};
      for (i = 0; i < runs.length; i++) {
        var run = runs[i];
        var target = null;
        var k;
        for (k = 0; k < run.cells.length; k++) {
          var found = owner[key(run.cells[k].r, run.cells[k].c)];
          if (!found) continue;
          if (target === null) {
            target = found;
          } else if (target !== found) {
            for (var m = 0; m < found.cells.length; m++) {
              var oc = found.cells[m];
              var ok = key(oc.r, oc.c);
              if (!target.seen[ok]) { target.seen[ok] = 1; target.cells.push(oc); }
            }
            target.runs = target.runs.concat(found.runs);
            owner = rebind(owner, found, target);
          }
        }
        if (!target) {
          target = { cells: [], seen: {}, runs: [] };
          groups.push(target);
        }
        for (k = 0; k < run.cells.length; k++) {
          var cc = run.cells[k], kk = key(cc.r, cc.c);
          if (!target.seen[kk]) { target.seen[kk] = 1; target.cells.push(cc); }
          owner[kk] = target;
        }
        target.runs.push(run);
      }

      var out = [], all = [];
      for (i = 0; i < groups.length; i++) {
        var grp = groups[i];
        var hasH = false, hasV = false, maxLen = 0, best = null;
        for (var q = 0; q < grp.runs.length; q++) {
          var rn = grp.runs[q];
          if (rn.dir === 'h') hasH = true; else hasV = true;
          if (rn.cells.length > maxLen) { maxLen = rn.cells.length; best = rn; }
        }
        var special = null, dir = null, at = null;
        if (hasH && hasV) {
          special = BOMB;
          at = intersection(grp);
        } else if (maxLen >= 5) {
          special = GOLDEN;
        } else if (maxLen === 4) {
          special = LINE;
          dir = best.dir;
        }
        if (special) {
          if (prefer && grp.seen[key(prefer.r, prefer.c)]) at = { r: prefer.r, c: prefer.c };
          if (!at) at = best.cells[Math.floor(best.cells.length / 2)];
        }
        grp.special = special;
        grp.dir = dir;
        grp.at = at;
        grp.leaf = best.leaf;
        for (var z = 0; z < grp.cells.length; z++) {
          all.push({ r: grp.cells[z].r, c: grp.cells[z].c, leaf: grp.leaf });
        }
        out.push(grp);
      }
      return { groups: out, cells: all };
    },

    /* ------------------------------------------------------------ moves */

    canSwap: function (a, b) {
      if (!a || !b) return false;
      if (!this.inBounds(a.r, a.c) || !this.inBounds(b.r, b.c)) return false;
      if (Math.abs(a.r - b.r) + Math.abs(a.c - b.c) !== 1) return false;
      return !!this.tile(a.r, a.c) && !!this.tile(b.r, b.c);
    },

    swapTiles: function (a, b) {
      var ca = this.cells[a.r][a.c], cb = this.cells[b.r][b.c];
      var t = ca.tile;
      ca.tile = cb.tile;
      cb.tile = t;
    },

    /* Would swapping these make a line, fire a golden leaf, or combine two
       special pieces? */
    swapMakesMatch: function (a, b) {
      var ta = this.tile(a.r, a.c), tb = this.tile(b.r, b.c);
      if (!ta || !tb) return false;
      if (ta.special && tb.special) return true;   /* any pair of specials combines */
      if (ta.special === GOLDEN || tb.special === GOLDEN) return true;
      this.swapTiles(a, b);
      var hit = this.matchAt(a.r, a.c) || this.matchAt(b.r, b.c);
      this.swapTiles(a, b);
      return hit;
    },

    /* First playable swap, or null when the board is stuck. */
    anyMoves: function () {
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          if (!this.cells[r][c].tile) continue;
          if (c + 1 < this.cols) {
            var a = { r: r, c: c }, b = { r: r, c: c + 1 };
            if (this.canSwap(a, b) && this.swapMakesMatch(a, b)) return { a: a, b: b };
          }
          if (r + 1 < this.rows) {
            var a2 = { r: r, c: c }, b2 = { r: r + 1, c: c };
            if (this.canSwap(a2, b2) && this.swapMakesMatch(a2, b2)) return { a: a2, b: b2 };
          }
        }
      }
      return null;
    },

    /* Shuffle the leaves that are already on the board until nothing matches
       and at least one move exists. Specials keep their identity. */
    shuffle: function () {
      var tiles = [], r, c, i;
      for (r = 0; r < this.rows; r++) {
        for (c = 0; c < this.cols; c++) {
          var t = this.cells[r][c].tile;
          if (t && !t.special) tiles.push(t);
        }
      }
      for (i = tiles.length - 1; i > 0; i--) {
        var j = Math.floor(this.rng() * (i + 1));
        var tmp = tiles[i].leaf;
        tiles[i].leaf = tiles[j].leaf;
        tiles[j].leaf = tmp;
      }
      this.shuffles++;
      this.ensurePlayable();
      return { tiles: tiles.length };
    },

    /* Break up any accidental lines (cheaply) and guarantee a playable board. */
    ensurePlayable: function () {
      var guard = 0;
      var matches = this.findMatches();
      while (matches.cells.length && guard++ < 80) {
        var pick = matches.cells[Math.floor(this.rng() * matches.cells.length)];
        var cell = this.cells[pick.r][pick.c];
        if (cell.tile && !cell.tile.special) cell.tile.leaf = this.randomLeaf();
        matches = this.findMatches();
      }
      guard = 0;
      while (!this.anyMoves() && guard++ < 60) {
        for (var r = 0; r < this.rows; r++) {
          for (var c = 0; c < this.cols; c++) {
            var t = this.cells[r][c].tile;
            if (t && !t.special) t.leaf = this.randomLeaf();
          }
        }
        var m2 = this.findMatches();
        var g2 = 0;
        while (m2.cells.length && g2++ < 80) {
          var p2 = m2.cells[Math.floor(this.rng() * m2.cells.length)];
          var c2 = this.cells[p2.r][p2.c];
          if (c2.tile && !c2.tile.special) c2.tile.leaf = this.randomLeaf();
          m2 = this.findMatches();
        }
      }
    },

    /* ---------------------------------------------------------- clearing */

    /* Every cell in a row ('h') or a column ('v'). */
    lineCells: function (r, c, dir) {
      var out = [], i;
      if (!this.inBounds(r, c)) return out;
      if (dir === 'v') { for (i = 0; i < this.rows; i++) out.push({ r: i, c: c }); }
      else { for (i = 0; i < this.cols; i++) out.push({ r: r, c: i }); }
      return out;
    },

    /* A square block centred on a cell. */
    areaCells: function (r, c, radius) {
      var out = [];
      for (var dr = -radius; dr <= radius; dr++) {
        for (var dc = -radius; dc <= radius; dc++) {
          if (this.inBounds(r + dr, c + dc)) out.push({ r: r + dr, c: c + dc });
        }
      }
      return out;
    },

    cellsWithLeaf: function (leaf) {
      var out = [];
      if (leaf < 0) return out;
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) {
          var t = this.tile(r, c);
          if (t && t.leaf === leaf) out.push({ r: r, c: c });
        }
      }
      return out;
    },

    allTileCells: function () {
      var out = [];
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) if (this.tile(r, c)) out.push({ r: r, c: c });
      }
      return out;
    },

    /* Cells a special piece reaches when it goes off. */
    specialTargets: function (tile, r, c) {
      if (tile.special === LINE) return this.lineCells(r, c, tile.dir === 'v' ? 'v' : 'h');
      if (tile.special === BOMB) return this.areaCells(r, c, 1);
      if (tile.special === GOLDEN) return this.cellsWithLeaf(tile.leaf);
      return [];
    },

    /* Remove a set of cells, firing any specials that get caught in the
       blast (and the ones those fire, and so on). Damages neighbouring rocks
       and thins the frost. Returns a report for scoring and animation. */
    resolveClear: function (list) {
      var queue = [], i;
      for (i = 0; i < list.length; i++) queue.push({ r: list[i].r, c: list[i].c });

      var visited = {};
      var cleared = [], activated = [], stoneHits = [], stoneSeen = {};
      var iceCleared = 0;

      while (queue.length) {
        var cur = queue.shift();
        if (!this.inBounds(cur.r, cur.c)) continue;
        var k = key(cur.r, cur.c);
        if (visited[k]) continue;
        visited[k] = 1;

        var cell = this.cells[cur.r][cur.c];
        if (cell.stone) {
          if (!stoneSeen[k]) { stoneSeen[k] = 1; stoneHits.push({ r: cur.r, c: cur.c }); }
          continue;
        }
        var tile = cell.tile;
        if (!tile) continue;

        cleared.push({ r: cur.r, c: cur.c, leaf: tile.leaf, special: tile.special, id: tile.id });
        if (cell.ice > 0) iceCleared++;

        if (tile.special) {
          activated.push({ r: cur.r, c: cur.c, special: tile.special, leaf: tile.leaf, dir: tile.dir });
          var blast = this.specialTargets(tile, cur.r, cur.c);
          for (i = 0; i < blast.length; i++) {
            if (!visited[key(blast[i].r, blast[i].c)]) queue.push(blast[i]);
          }
        }
      }

      /* A match that happens next to a rock chips it. */
      for (i = 0; i < cleared.length; i++) {
        var adj = neighbours(cleared[i].r, cleared[i].c);
        for (var j = 0; j < adj.length; j++) {
          var a = adj[j];
          if (!this.inBounds(a.r, a.c)) continue;
          var ak = key(a.r, a.c);
          if (this.cells[a.r][a.c].stone && !stoneSeen[ak]) {
            stoneSeen[ak] = 1;
            stoneHits.push({ r: a.r, c: a.c });
          }
        }
      }

      var brokenStones = [];
      for (i = 0; i < stoneHits.length; i++) {
        var sc = this.cells[stoneHits[i].r][stoneHits[i].c];
        sc.stone -= 1;
        if (sc.stone <= 0) {
          sc.stone = 0;
          brokenStones.push({ r: stoneHits[i].r, c: stoneHits[i].c });
        }
      }

      for (i = 0; i < cleared.length; i++) {
        var cl = this.cells[cleared[i].r][cleared[i].c];
        cl.tile = null;
        if (cl.ice > 0) cl.ice -= 1;
      }

      return {
        cleared: cleared,
        activated: activated,
        stoneHits: stoneHits,
        brokenStones: brokenStones,
        iceCleared: iceCleared
      };
    },

    /* One full match pass: find the lines, clear them, leave the rewards.
       Returns null when nothing matches. */
    resolveStep: function (prefer) {
      var found = this.findMatches(prefer);
      if (!found.cells.length) return null;

      var res = this.resolveClear(found.cells);
      res.groups = found.groups;
      res.created = [];

      for (var i = 0; i < found.groups.length; i++) {
        var g = found.groups[i];
        if (!g.special || !g.at) continue;
        var cell = this.cells[g.at.r][g.at.c];
        if (cell.stone) continue;
        var leaf = g.special === GOLDEN ? -1 : g.leaf;
        var tile = this.newTile(leaf, g.special, g.dir);
        cell.tile = tile;
        res.created.push({ r: g.at.r, c: g.at.c, tile: tile });
      }
      return res;
    },

    /* Swapping two special pieces together sets both of them off. Returns the
       cells to clear plus a label for the on-screen shout-out, or null when
       neither side is special. */
    comboInfo: function (a, b) {
      var ta = this.tile(a.r, a.c), tb = this.tile(b.r, b.c);
      if (!ta || !tb) return null;
      var sa = ta.special, sb = tb.special;
      if (!sa && !sb) return null;

      var list = [], r, c, i;

      /* Effects are centred on where the player dropped the piece. */
      var r0 = b.r, c0 = b.c;

      if (sa === GOLDEN && sb === GOLDEN) {
        return { kind: 'golden', label: 'Whole board!', cells: this.allTileCells() };
      }

      if (sa === GOLDEN || sb === GOLDEN) {
        var goldenCell = sa === GOLDEN ? a : b;
        var other = sa === GOLDEN ? tb : ta;
        var oc = sa === GOLDEN ? b : a;
        var label = 'Colour wipe!';

        if (other.special === LINE) {
          list = list.concat(this.lineCells(oc.r, oc.c, other.dir === 'v' ? 'v' : 'h'));
          label = 'Cross wipe!';
        } else if (other.special === BOMB) {
          list = list.concat(this.areaCells(oc.r, oc.c, 2));
          label = 'Mega blast!';
        }
        if (other.leaf >= 0) list = list.concat(this.cellsWithLeaf(other.leaf));
        list.push({ r: goldenCell.r, c: goldenCell.c });
        return { kind: 'golden', label: label, cells: list };
      }

      if (sa === LINE && sb === LINE) {
        list = this.lineCells(r0, c0, 'h').concat(this.lineCells(r0, c0, 'v'));
        return { kind: 'cross', label: 'Cross blast!', cells: list };
      }

      if ((sa === LINE && sb === BOMB) || (sa === BOMB && sb === LINE)) {
        for (i = -1; i <= 1; i++) {
          list = list.concat(this.lineCells(r0 + i, c0, 'h'));
          list = list.concat(this.lineCells(r0, c0 + i, 'v'));
        }
        return { kind: 'mega', label: 'Mega cross!', cells: list };
      }

      if (sa === BOMB && sb === BOMB) {
        return { kind: 'boom', label: 'Big boom!', cells: this.areaCells(r0, c0, 2) };
      }

      return null;
    },

    /* --------------------------------------------------------- gravity */

    /* Drop every tile into the gaps and spawn replacements from the top of
       each column segment (rocks split a column in two). Returns the moves
       the renderer has to animate. */
    gravity: function () {
      var moves = [];
      for (var c = 0; c < this.cols; c++) {
        var top = 0;
        for (var r = 0; r <= this.rows; r++) {
          if (r === this.rows || this.cells[r][c].stone) {
            if (r > top) this.collapseSegment(c, top, r - 1, moves);
            top = r + 1;
          }
        }
      }
      return { moves: moves };
    },

    collapseSegment: function (c, top, bottom, moves) {
      var write = bottom;
      for (var r = bottom; r >= top; r--) {
        var cell = this.cells[r][c];
        if (!cell.tile) continue;
        if (write !== r) {
          moves.push({ tile: cell.tile, from: { r: r, c: c }, to: { r: write, c: c } });
          this.cells[write][c].tile = cell.tile;
          cell.tile = null;
        }
        write--;
      }
      var k = 0;
      for (var r2 = top; r2 <= write; r2++) {
        k++;
        var tile = this.newTile(this.randomLeaf(), null);
        this.cells[r2][c].tile = tile;
        moves.push({
          tile: tile,
          from: { r: top - 1 - k, c: c },
          to: { r: r2, c: c },
          isNew: true
        });
      }
    },

    /* ---------------------------------------------------------- helpers */

    countIce: function () {
      var n = 0;
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) n += this.cells[r][c].ice;
      }
      return n;
    },

    countStones: function () {
      var n = 0;
      for (var r = 0; r < this.rows; r++) {
        for (var c = 0; c < this.cols; c++) if (this.cells[r][c].stone) n++;
      }
      return n;
    },

    /* Flat, plain-data view of the board: handy for tests and debugging. */
    snapshot: function () {
      var out = [];
      for (var r = 0; r < this.rows; r++) {
        var row = [];
        for (var c = 0; c < this.cols; c++) {
          var cell = this.cells[r][c];
          if (cell.stone) row.push('R' + cell.stone);
          else if (!cell.tile) row.push('..');
          else {
            var mark = cell.tile.leaf < 0 ? 'G' : String(cell.tile.leaf);
            if (cell.tile.special) mark = cell.tile.special.charAt(0).toUpperCase() + mark;
            if (cell.ice) mark += 'i';
            row.push(mark);
          }
        }
        out.push(row.join(' '));
      }
      return out;
    }
  };

  /* Helper for merging two match groups: repoint every owner entry that
     pointed at `from` so it points at `to` instead. */
  function rebind(owner, from, to) {
    for (var k in owner) {
      if (owner[k] === from) owner[k] = to;
    }
    return owner;
  }

  function intersection(grp) {
    var hCells = {}, vCells = {}, i, k;
    for (i = 0; i < grp.runs.length; i++) {
      var run = grp.runs[i];
      for (k = 0; k < run.cells.length; k++) {
        var kk = key(run.cells[k].r, run.cells[k].c);
        if (run.dir === 'h') hCells[kk] = 1; else vCells[kk] = 1;
      }
    }
    for (var m = 0; m < grp.cells.length; m++) {
      var mk = key(grp.cells[m].r, grp.cells[m].c);
      if (hCells[mk] && vCells[mk]) return { r: grp.cells[m].r, c: grp.cells[m].c };
    }
    return null;
  }

  return {
    LeafBoard: LeafBoard,
    mulberry32: mulberry32,
    SPECIAL: { LINE: LINE, BOMB: BOMB, GOLDEN: GOLDEN }
  };
});
