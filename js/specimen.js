/* Leaf Crush - collectible "specimen" artwork.
   Clearing a chapter presses its signature leaf into a card, drawn from the
   chapter's own seed so every one of the 400 cards looks a little different.
   Twenty cards make an album (one album per garden); a full album earns a
   full-page plate. Pure string builders - no DOM, no state. */
(function (root) {
  'use strict';

  var Art = root.LeafArt;
  var Data = root.LeafChapters;

  /* Small seeded PRNG, same shape as the one in chapters.js. */
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

  function n1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function n0(v) { return String(Math.round(v)); }

  function sparkle(x, y, r, fill, opacity) {
    var w = r * 0.3;
    return '<path d="M' + n1(x) + ' ' + n1(y - r) + ' L' + n1(x + w) + ' ' + n1(y - w)
      + ' L' + n1(x + r) + ' ' + n1(y) + ' L' + n1(x + w) + ' ' + n1(y + w)
      + ' L' + n1(x) + ' ' + n1(y + r) + ' L' + n1(x - w) + ' ' + n1(y + w)
      + ' L' + n1(x - r) + ' ' + n1(y) + ' L' + n1(x - w) + ' ' + n1(y - w)
      + ' Z" fill="' + fill + '" opacity="' + opacity + '"/>';
  }

  function starPath(cx, cy, r, fill) {
    var pts = [];
    for (var i = 0; i < 10; i++) {
      var ang = -Math.PI / 2 + i * Math.PI / 5;
      var rad = (i % 2) ? r * 0.44 : r;
      pts.push(n1(cx + Math.cos(ang) * rad) + ',' + n1(cy + Math.sin(ang) * rad));
    }
    return '<polygon points="' + pts.join(' ') + '" fill="' + fill + '"/>';
  }

  /* The leaf a chapter is "about": its collect goal when it has one, so the
     card matches the thing the board kept asking for. */
  function signatureLeaf(chapter) {
    var objectives = chapter.objectives || [];
    for (var i = 0; i < objectives.length; i++) {
      if (objectives[i].kind === 'collect') return objectives[i].leaf;
    }
    return (chapter.seed >>> 0) % 7;
  }

  /* ------------------------------------------------------------ the card */

  /* A pressed-leaf plate, square. Numbers and stars are drawn by the HTML
     around it so they stay crisp at any tile size. */
  function card(chapter) {
    var garden = Data.GARDENS[chapter.garden] || Data.GARDENS[0];
    var rand = hash((chapter.seed >>> 0) * 31 + chapter.num * 7 + 11);
    var accent = garden.accent;
    var leaf = signatureLeaf(chapter);
    var out = '<svg class="specimen-svg" viewBox="0 0 100 100" aria-hidden="true">';

    out += '<rect width="100" height="100" rx="15" fill="' + garden.sky + '"/>';
    out += '<circle cx="' + n0(16 + rand() * 68) + '" cy="' + n0(12 + rand() * 34)
      + '" r="' + n0(28 + rand() * 14) + '" fill="' + accent + '" opacity=".15"/>';
    out += '<rect x="5.5" y="5.5" width="89" height="89" rx="11" fill="rgba(255,255,255,.075)" '
      + 'stroke="' + accent + '" stroke-opacity=".5" stroke-width="1.2"/>';

    /* the ring the leaf is "pressed" inside */
    if (rand() < 0.5) {
      out += '<circle cx="50" cy="47" r="29" fill="none" stroke="' + accent
        + '" stroke-opacity=".3" stroke-width="1.1" stroke-dasharray="2 4"/>';
    } else {
      out += '<rect x="21" y="18" width="58" height="58" rx="16" fill="none" stroke="' + accent
        + '" stroke-opacity=".28" stroke-width="1.1" stroke-dasharray="3 4"/>';
    }

    /* mounted corners: little translucent tape strips */
    out += '<rect x="13" y="11" width="14" height="5" rx="2.4" fill="rgba(255,255,255,.16)" transform="rotate(-24 20 13.5)"/>';
    out += '<rect x="73" y="11" width="14" height="5" rx="2.4" fill="rgba(255,255,255,.16)" transform="rotate(24 80 13.5)"/>';

    out += '<ellipse cx="50" cy="74" rx="20" ry="4.6" fill="rgba(0,0,0,.26)"/>';
    out += '<g transform="translate(' + n1(27 + rand() * 2) + ',' + n1(26 + rand() * 2)
      + ') scale(0.44)">' + Art.innerFor(leaf, null, null) + '</g>';

    for (var i = 0; i < 3; i++) {
      out += sparkle(13 + rand() * 74, 13 + rand() * 74, 2.2 + rand() * 1.9, accent,
        n1(0.4 + rand() * 0.45));
    }
    return out + '</svg>';
  }

  /* -------------------------------------------------------- the album art */

  function albumArt(gardenIndex) {
    var garden = Data.GARDENS[gardenIndex] || Data.GARDENS[0];
    var rand = hash(9001 + gardenIndex * 733);
    var accent = garden.accent;
    var out = '<svg class="album-art-svg" viewBox="0 0 200 132" aria-hidden="true">';

    out += '<rect width="200" height="132" rx="18" fill="' + garden.sky + '"/>';
    out += '<circle cx="' + n0(40 + rand() * 120) + '" cy="' + n0(24 + rand() * 60)
      + '" r="' + n0(46 + rand() * 26) + '" fill="' + accent + '" opacity=".14"/>';
    out += '<rect x="7" y="7" width="186" height="118" rx="13" fill="none" stroke="' + accent
      + '" stroke-opacity=".5" stroke-width="1.4"/>';

    /* a fan of leaves across the plate */
    for (var i = 0; i < 5; i++) {
      var t = i / 4;
      var x = 24 + t * 152;
      var y = 84 - Math.sin(t * Math.PI) * 22;
      var rot = -26 + t * 52 + (rand() - 0.5) * 12;
      var scale = 0.24 + rand() * 0.1;
      out += '<g transform="translate(' + n1(x - 50 * scale) + ',' + n1(y - 50 * scale)
        + ') scale(' + n1(scale) + ') rotate(' + n1(rot) + ' 50 50)">'
        + Art.innerFor(Math.floor(rand() * 7), null, null) + '</g>';
    }

    for (var s = 0; s < 7; s++) {
      out += sparkle(16 + rand() * 168, 14 + rand() * 104, 1.8 + rand() * 2.4, accent,
        n1(0.35 + rand() * 0.5));
    }

    /* three gold stars: the album is only ever drawn when it is complete */
    for (var k = 0; k < 3; k++) out += starPath(86 + k * 14, 116, 6, '#ffd166');
    return out + '</svg>';
  }

  /* ------------------------------------------------------------- badge */

  /* A little emblem for a finished album, shown on the album shelf. */
  function badge(gardenIndex) {
    var garden = Data.GARDENS[gardenIndex] || Data.GARDENS[0];
    var accent = garden.accent;
    var out = '<svg class="album-badge-svg" viewBox="0 0 48 48" aria-hidden="true">';
    out += '<circle cx="24" cy="24" r="21" fill="' + garden.sky + '" stroke="' + accent + '" stroke-width="2.4"/>';
    out += '<circle cx="24" cy="24" r="16" fill="' + accent + '" opacity=".18"/>';
    out += '<g transform="translate(12,12) scale(0.24)">' + Art.innerFor(gardenIndex % 7, null, null) + '</g>';
    out += starPath(24, 39, 5, '#ffd166');
    return out + '</svg>';
  }

  root.LeafSpecimen = {
    card: card,
    albumArt: albumArt,
    badge: badge,
    signatureLeaf: signatureLeaf
  };
})(typeof window !== 'undefined' ? window : globalThis);
