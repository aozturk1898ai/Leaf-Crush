/* Leaf Crush - the market.
   One table of wares, priced in seeds - the same currency the energy dialog
   and the album rewards already use. Everything here is data plus a couple of
   icon builders, so the shop screen is pure rendering and the buy logic lives
   in game.js. Prices are balanced against seed income: a three-star chapter
   pays 18, a finished album pays 20. */
(function (root) {
  'use strict';

  var Art = root.LeafArt;

  var SPECIALS = ['line', 'bomb', 'golden'];

  var ITEM_NAME = {
    line: 'line leaf',
    bomb: 'seed bomb',
    golden: 'golden leaf'
  };

  /* ------------------------------------------------------------ icons */

  function seedIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 3c4.4 2.6 7 6.4 7 10.2A7 7 0 0 1 12 21a7 7 0 0 1-7-7.8C5 9.4 7.6 5.6 12 3z" '
      + 'fill="none" stroke="currentColor" stroke-width="1.7"/>'
      + '<path d="M12 21V9.6M12 14.4l3.2-2.6M12 12l-3.2-2.4" stroke="currentColor" '
      + 'stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>';
  }

  function heartIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M12 21.2s-7.6-4.8-9.4-9.3C.9 8 3.1 4.6 6.6 4.6c2.1 0 3.7 1.2 4.5 2.9l.9 1.9.9-1.9'
      + 'c.8-1.7 2.4-2.9 4.5-2.9 3.5 0 5.7 3.4 4 7.3-1.8 4.5-9.4 9.3-9.4 9.3z" fill="currentColor"/></svg>';
  }

  function crateIcon() {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">'
      + '<path d="M4 10.6 12 7.2l8 3.4v8.1a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 18.7z" '
      + 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>'
      + '<path d="M4 10.6 12 14.1l8-3.5M12 14.1v6" fill="none" stroke="currentColor" '
      + 'stroke-width="1.5" stroke-linejoin="round" opacity=".75"/>'
      + '<path d="M12.4 6.9c2.2-2.5 4.3-3 5.6-2.5.5 1.9-.7 4.2-3.2 4.9-1 .2-1.9.1-2.4-.1z" '
      + 'fill="currentColor" opacity=".9"/></svg>';
  }

  /* ------------------------------------------------------------ wares */

  var ITEMS = [
    {
      id: 'life',
      group: 'Energy',
      name: 'One leaf',
      kind: 'life',
      lives: 1,
      cost: 12,
      blurb: 'Back on the board right now.'
    },
    {
      id: 'tank',
      group: 'Energy',
      name: 'Full tank',
      kind: 'life',
      lives: 5,
      cost: 30,
      deal: '6 each',
      blurb: 'Top the meter all the way up.'
    },
    {
      id: 'line',
      group: 'Special pieces',
      name: 'Line leaf',
      kind: 'special',
      special: 'line',
      leaf: 0,
      dir: 'h',
      cost: 20,
      blurb: 'Drop it on any leaf, then fire it along a row or column.'
    },
    {
      id: 'bomb',
      group: 'Special pieces',
      name: 'Seed bomb',
      kind: 'special',
      special: 'bomb',
      leaf: 2,
      cost: 28,
      blurb: 'Blows up the three-by-three around it.'
    },
    {
      id: 'golden',
      group: 'Special pieces',
      name: 'Golden leaf',
      kind: 'special',
      special: 'golden',
      leaf: 3,
      cost: 42,
      blurb: 'Clears every leaf of one colour.'
    },
    {
      id: 'crate',
      group: 'Bundles',
      name: "Gardener's crate",
      kind: 'bundle',
      cost: 66,
      deal: 'save 12',
      lives: 5,
      specials: { line: 1, bomb: 1 },
      blurb: 'A full tank, a line leaf and a seed bomb.'
    }
  ];

  function find(id) {
    for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].id === id) return ITEMS[i];
    return null;
  }

  /* The wares in display order, grouped by their `group` label. */
  function groups() {
    var out = [], seen = {};
    for (var i = 0; i < ITEMS.length; i++) {
      var item = ITEMS[i];
      if (!seen[item.group]) {
        seen[item.group] = { name: item.group, items: [] };
        out.push(seen[item.group]);
      }
      seen[item.group].items.push(item);
    }
    return out;
  }

  function iconFor(item) {
    if (!item) return heartIcon();
    if (item.special) return Art.svgFor(item.leaf, item.special, item.dir || null);
    if (item.kind === 'bundle') return crateIcon();
    return heartIcon();
  }

  root.LeafMarket = {
    SPECIALS: SPECIALS,
    ITEM_NAME: ITEM_NAME,
    ITEMS: ITEMS,
    find: find,
    groups: groups,
    iconFor: iconFor,
    seedIcon: seedIcon,
    heartIcon: heartIcon
  };
})(typeof window !== 'undefined' ? window : globalThis);
