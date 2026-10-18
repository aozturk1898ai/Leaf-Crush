/* Leaf Crush - leaf artwork.
   Pure string builders, no DOM access at load time: the engine and the board
   renderer both use these to draw a leaf of a given type, with optional
   special-piece decoration. Loaded after nothing; everything hangs off
   window.LeafArt. */
(function (root) {
  'use strict';

  /* The seven leaves a chapter can use. `c1`/`c2`/`dark` drive the gradient
     that fills the silhouette, so every type is instantly distinguishable. */
  var TYPES = [
    { id: 'maple',  name: 'Maple',  c1: '#ffb072', c2: '#dd4423', dark: '#8f2413' },
    { id: 'clover', name: 'Clover', c1: '#8ceb85', c2: '#1f8f3e', dark: '#0f5c27' },
    { id: 'fern',   name: 'Fern',   c1: '#7fe7db', c2: '#0d7c8a', dark: '#075a66' },
    { id: 'ginkgo', name: 'Ginkgo', c1: '#ffe680', c2: '#e59b0f', dark: '#a06505' },
    { id: 'birch',  name: 'Birch',  c1: '#d2f57a', c2: '#63a10b', dark: '#406b04' },
    { id: 'beech',  name: 'Beech',  c1: '#ceaaf5', c2: '#6b39c0', dark: '#452680' },
    { id: 'lotus',  name: 'Lotus',  c1: '#ffb8d4', c2: '#dd3486', dark: '#961a58' }
  ];

  var OUTLINE = 'rgba(0,0,0,.30)';
  var VEIN = 'rgba(255,255,255,.34)';

  /* ---------------------------------------------------------------- shapes */

  /* A five-lobed maple silhouette with a stem. */
  function maple(fill) {
    return ''
      + '<path d="M50 7 L58 27 L75 18 L69 39 L89 36 L77 52 L93 63 L72 65 L74 85 '
      + 'L58 73 L50 93 L42 73 L26 85 L28 65 L7 63 L23 52 L11 36 L31 39 L25 18 L42 27 Z" '
      + 'fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="2.4" stroke-linejoin="round"/>'
      + '<path d="M50 88 L50 98" stroke="' + OUTLINE + '" stroke-width="3" stroke-linecap="round"/>'
      + '<path d="M50 84 L50 30 M50 60 L30 44 M50 60 L70 44" stroke="' + VEIN +
      '" stroke-width="1.6" fill="none" stroke-linecap="round"/>';
  }

  /* Three round lobes plus a stem: the classic lucky clover. */
  function clover(fill) {
    return ''
      + '<path d="M50 74 L50 97" stroke="' + fill + '" stroke-width="5" stroke-linecap="round"/>'
      + '<circle cx="50" cy="33" r="19" fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="2.2"/>'
      + '<circle cx="30" cy="60" r="19" fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="2.2"/>'
      + '<circle cx="70" cy="60" r="19" fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="2.2"/>'
      + '<circle cx="50" cy="52" r="9" fill="rgba(0,0,0,.12)"/>';
  }

  /* A curved stem with leaflets on both sides. */
  function fern(fill) {
    var s = '<path d="M52 96 C53 70 51 42 40 10" fill="none" stroke="' + fill +
      '" stroke-width="5" stroke-linecap="round"/>';
    for (var i = 0; i < 7; i++) {
      var t = i / 6;                       // 0 at the base, 1 at the tip
      var y = 90 - t * 76;
      var x = 52 - t * 10;
      var len = 9 + 22 * (1 - t * 0.72);
      var ang = 34 - t * 6;
      var lx = x - len / 2 - 1;
      var rx = x + len / 2 + 1;
      s += '<ellipse cx="' + lx.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + (len / 2).toFixed(1) +
        '" ry="4.4" transform="rotate(' + (-ang).toFixed(1) + ' ' + lx.toFixed(1) + ' ' + y.toFixed(1) +
        ')" fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="1.4"/>';
      s += '<ellipse cx="' + rx.toFixed(1) + '" cy="' + y.toFixed(1) + '" rx="' + (len / 2).toFixed(1) +
        '" ry="4.4" transform="rotate(' + ang.toFixed(1) + ' ' + rx.toFixed(1) + ' ' + y.toFixed(1) +
        ')" fill="' + fill + '" stroke="' + OUTLINE + '" stroke-width="1.4"/>';
    }
    return s;
  }

  /* The fan-shaped ginkgo, notched in the middle of the top edge. */
  function ginkgo(fill) {
    return ''
      + '<path d="M50 96 L50 54 C24 54 7 36 9 17 C28 27 39 32 50 32 C61 32 72 27 91 17 '
      + 'C93 36 76 54 50 54 Z" fill="' + fill + '" stroke="' + OUTLINE +
      '" stroke-width="2.4" stroke-linejoin="round"/>'
      + '<path d="M50 60 L32 34 M50 58 L68 32 M50 62 L50 34" stroke="' + VEIN +
      '" stroke-width="1.5" fill="none" stroke-linecap="round"/>'
      + '<path d="M50 92 L50 98" stroke="' + OUTLINE + '" stroke-width="3" stroke-linecap="round"/>';
  }

  /* A pointed oval leaf with a midrib and side veins. */
  function birch(fill) {
    return ''
      + '<path d="M50 3 C75 28 87 58 50 97 C13 58 25 28 50 3 Z" fill="' + fill +
      '" stroke="' + OUTLINE + '" stroke-width="2.4" stroke-linejoin="round"/>'
      + '<path d="M50 12 L50 90" stroke="' + VEIN + '" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M50 30 L36 40 M50 44 L33 55 M50 58 L36 68 M50 30 L64 40 M50 44 L67 55 M50 58 L64 68" '
      + 'stroke="' + VEIN + '" stroke-width="1.5" fill="none" stroke-linecap="round"/>';
  }

  /* A long, narrow leaf: the copper beech. */
  function beech(fill) {
    return ''
      + '<path d="M50 3 C63 30 65 68 50 97 C35 68 37 30 50 3 Z" fill="' + fill +
      '" stroke="' + OUTLINE + '" stroke-width="2.4" stroke-linejoin="round"/>'
      + '<path d="M50 10 L50 92" stroke="' + VEIN + '" stroke-width="1.8" stroke-linecap="round"/>'
      + '<path d="M50 26 L41 33 M50 42 L39 49 M50 58 L41 65 M50 26 L59 33 M50 42 L61 49 M50 58 L59 65" '
      + 'stroke="' + VEIN + '" stroke-width="1.4" fill="none" stroke-linecap="round"/>';
  }

  /* A round lily pad with a notch and radiating ribs. */
  function lotus(fill) {
    var veins = '<g stroke="rgba(0,0,0,.20)" stroke-width="1.7" stroke-linecap="round">';
    var angles = [-105, -75, -40, 0, 30, 62, 100];
    for (var i = 0; i < angles.length; i++) {
      var a = angles[i] * Math.PI / 180;
      var x = 50 + Math.cos(a) * 34;
      var y = 50 + Math.sin(a) * 34;
      veins += '<line x1="50" y1="50" x2="' + x.toFixed(1) + '" y2="' + y.toFixed(1) + '"/>';
    }
    veins += '</g>';
    return ''
      + '<path d="M50 50 L50 8 A42 42 0 1 1 17 79 Z" fill="' + fill +
      '" stroke="' + OUTLINE + '" stroke-width="2.4" stroke-linejoin="round"/>'
      + veins;
  }

  var BODIES = { maple: maple, clover: clover, fern: fern, ginkgo: ginkgo, birch: birch, beech: beech, lotus: lotus };

  /* ------------------------------------------------------------ decoration */

  function lineOverlay(dir) {
    var inner = '<rect x="4" y="40" width="92" height="20" rx="10" fill="rgba(255,255,255,.85)"/>'
      + '<path d="M28 50 L40 42 L40 58 Z" fill="rgba(20,40,20,.55)"/>'
      + '<path d="M72 50 L60 42 L60 58 Z" fill="rgba(20,40,20,.55)"/>';
    if (dir === 'v') return '<g transform="rotate(90 50 50)">' + inner + '</g>';
    return inner;
  }

  function bombOverlay() {
    return '<circle cx="50" cy="50" r="34" fill="none" stroke="rgba(255,255,255,.9)" '
      + 'stroke-width="4.5" stroke-dasharray="7 7" stroke-linecap="round"/>'
      + '<circle cx="50" cy="50" r="19" fill="rgba(255,255,255,.30)"/>';
  }

  function goldenOverlay() {
    return '<path d="M50 2 L55 16 L69 21 L55 26 L50 40 L45 26 L31 21 L45 16 Z" fill="#ffffff" opacity=".92"/>'
      + '<path d="M84 62 L87 70 L95 73 L87 76 L84 84 L81 76 L73 73 L81 70 Z" fill="#ffffff" opacity=".75"/>'
      + '<path d="M15 60 L17 66 L23 68 L17 70 L15 76 L13 70 L7 68 L13 66 Z" fill="#ffffff" opacity=".7"/>';
  }

  /* ---------------------------------------------------------------- public */

  function grads() {
    var out = '';
    for (var i = 0; i < TYPES.length; i++) {
      var t = TYPES[i];
      out += '<linearGradient id="lc-' + t.id + '" x1="0.15" y1="0.05" x2="0.72" y2="1">'
        + '<stop offset="0" stop-color="' + t.c1 + '"/>'
        + '<stop offset="0.55" stop-color="' + t.c2 + '"/>'
        + '<stop offset="1" stop-color="' + t.dark + '"/>'
        + '</linearGradient>';
    }
    out += '<linearGradient id="lc-rainbow" x1="0" y1="0" x2="1" y2="1">'
      + '<stop offset="0" stop-color="#ff5f6d"/><stop offset="0.2" stop-color="#ffc371"/>'
      + '<stop offset="0.4" stop-color="#7ee787"/><stop offset="0.6" stop-color="#4dd0e1"/>'
      + '<stop offset="0.8" stop-color="#7c6cf0"/><stop offset="1" stop-color="#f45fd0"/>'
      + '</linearGradient>';
    return out;
  }

  /* One shared <defs> block for the whole document: gradients are referenced
     by id from every tile, so they only need to exist once. */
  function defsSVG() {
    return '<svg class="lc-defs" width="0" height="0" aria-hidden="true" focusable="false">'
      + '<defs>' + grads() + '</defs></svg>';
  }

  /* The shape markup on its own, drawn in a 0..100 box. Specimen cards embed
     this inside their own <svg>, so they get a leaf without a nested document. */
  function innerFor(leaf, special, dir) {
    var type = TYPES[leaf] || TYPES[0];
    var shape = type.id;
    var fill = 'url(#lc-' + type.id + ')';
    if (special === 'golden') {
      shape = 'maple';
      fill = 'url(#lc-rainbow)';
    }
    var body = (BODIES[shape] || maple)(fill);
    var gloss = '<ellipse cx="37" cy="33" rx="12" ry="8" fill="rgba(255,255,255,.20)" '
      + 'transform="rotate(-30 37 33)"/>';
    var overlay = '';
    if (special === 'line') overlay = lineOverlay(dir);
    else if (special === 'bomb') overlay = bombOverlay();
    else if (special === 'golden') overlay = goldenOverlay();
    return body + gloss + overlay;
  }

  function svgFor(leaf, special, dir) {
    var cls = 'leaf-svg';
    if (special === 'golden') cls += ' leaf-golden';
    if (special === 'line' || special === 'bomb') cls += ' leaf-charged';
    return '<svg class="' + cls + '" viewBox="0 0 100 100" aria-hidden="true">'
      + innerFor(leaf, special, dir) + '</svg>';
  }

  root.LeafArt = {
    TYPES: TYPES,
    defsSVG: defsSVG,
    svgFor: svgFor,
    innerFor: innerFor,
    nameOf: function (leaf) { return (TYPES[leaf] || TYPES[0]).name; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
