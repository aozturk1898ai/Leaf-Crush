/* Leaf Crush - the chapter list.
   400 chapters, grouped into twenty gardens of twenty. Every chapter is built
   once at load time from a seeded generator, so the same chapter always has
   the same board, objectives and rock/frost layout.

   The difficulty comes from three dials that move together as the run goes on:
   fewer leaf kinds early and all seven later, a move budget that opens wide at
   the start of a garden and tightens towards its end, and frost and rock that
   get thicker and take more hits. The score goal is deliberately tied to the
   move budget instead of the chapter number - see buildChapter. */
(function (root) {
  'use strict';

  var GARDENS = [
    {
      name: 'Sprout Meadow',
      blurb: 'Warm sun, soft grass, and no rocks in sight.',
      accent: '#8ceb85',
      sky: '#1b3a23',
      names: [
        'First Sprout', 'Morning Dew', 'Gentle Breeze', 'Green Whisper', 'Sunny Patch',
        'Tiny Buds', 'Clover Path', 'Grass Whistle', 'Dewdrop Trail', 'Spring Shower',
        'Petal Drift', 'Meadow Song', 'Honeybee Lane', 'Willow Shade', 'Fresh Cut Grass',
        "Robin's Nest", 'Daisy Chain', 'Warm Sunbeam', 'Quiet Thicket', "Meadow's Edge"
      ]
    },
    {
      name: 'Dewdrop Ferns',
      blurb: 'Frost settles on the fronds and the leaves lock up.',
      accent: '#7fe7db',
      sky: '#12333a',
      names: [
        'Frosty Fronds', 'Silver Mist', 'Cool Rain', 'Mossy Steps', 'Fern Hollow',
        'Cold Spring', 'Shivering Leaves', 'Ice Lattice', 'Pale Moonlight', 'Snowmelt Creek',
        'Crystal Veins', 'Wintergreen', 'Frozen Pond', 'Whispering Reeds', 'Glass Petals',
        'Hailstone Path', 'Deep Mist', 'Sleet Hollow', 'The Thaw', 'Fern Crown'
      ]
    },
    {
      name: 'Autumn Hollow',
      blurb: 'Old rock walls, and a wind that will not stop.',
      accent: '#ffb072',
      sky: '#3a2417',
      names: [
        'Amber Fall', 'Rustling Wind', 'Red Maple Way', 'Acorn Hollow', 'Chestnut Lane',
        'Golden Hour', 'Copper Ridge', 'Falling Embers', 'Bramble Patch', 'Scarecrow Field',
        'Harvest Moon', 'Pumpkin Vine', 'Haystack Maze', 'Cider Mill', 'Windfall Orchard',
        'Twig Snare', "Squirrel's Cache", 'Burnt Orange', 'Late Harvest', "Hollow's Heart"
      ]
    },
    {
      name: 'Ginkgo Grove',
      blurb: 'Golden fans over stone paths and frozen pools.',
      accent: '#ffe680',
      sky: '#3a3316',
      names: [
        'Fan of Gold', 'Temple Steps', 'Ancient Grove', 'Ginkgo Rain', 'Bronze Lantern',
        'Stone Garden', 'Quiet Monks', 'Paper Lanterns', 'Bonsai Court', 'Moss Temple',
        'Golden Fan', 'Drum Bridge', 'Lantern Path', 'Zen Pebbles', 'Silent Bell',
        'Koi Pond', 'Bamboo Fence', 'Moon Gate', 'Meditation Rock', 'Grove Keeper'
      ]
    },
    {
      name: 'Clover Canyon',
      blurb: 'Sun-baked clay, rope bridges, and lucky strikes.',
      accent: '#d2f57a',
      sky: '#3a2f1b',
      names: [
        'Four Leaf Fortune', 'Lucky Leap', 'Red Rock', 'Canyon Echo', 'Dust Devil',
        'Sunbaked Clay', "Lizard's Perch", 'Dry Creek', 'Mesquite Trail', 'Lucky Charm',
        'Copper Canyon', 'Rope Bridge', 'Cliff Hanger', "Rattler's Rest", 'Sunset Mesa',
        'Cactus Bloom', 'Painted Cliffs', 'Wind Carved', 'Echo Chamber', 'Canyon Crown'
      ]
    },
    {
      name: 'Elder Forest',
      blurb: 'Seven leaves, deep shade, and the hardest boards yet.',
      accent: '#ceaaf5',
      sky: '#251b3a',
      names: [
        'Old Growth', 'Root Tangle', 'Deep Canopy', "Owl's Watch", 'Ancient Bark',
        'Shadow Moss', 'Wolf Trail', 'Elder Bloom', 'Thornwall', 'Hidden Glade',
        'Moonlit Firs', 'Bitter Root', 'Wild Heart', 'Storm Fallen', 'Timber Line',
        'Night Ferns', 'Forest Primeval', 'Heartwood', 'Last Light', 'The Great Oak'
      ]
    },
    {
      name: 'Misty Marsh',
      blurb: 'Slow water, drowned stumps, and fog that hides the board.',
      accent: '#7fd1e8',
      sky: '#16303a',
      names: [
        'Marsh Lights', 'Reed Beds', 'Drowned Stumps', 'Fog Bank', 'Slow Water',
        'Mudflat', 'Heron Watch', 'Bog Cotton', 'Sunken Path', 'Mist Net',
        'Quiet Ripple', 'Sedge Maze', 'Willow Island', 'Peat Hollow', 'Marsh Wren',
        'Duckweed Drift', 'Sinking Steps', 'Cold Seep', 'Lost Boots', 'Marsh Heart'
      ]
    },
    {
      name: 'Sunflower Fields',
      blurb: 'Head-high blooms all turning to face the sun.',
      accent: '#ffd447',
      sky: '#3a3216',
      names: [
        'First Bloom', 'Tall Stalks', 'Bee Lines', 'Turning Heads', 'Golden Row',
        'Seed Head', 'Open Sky', 'Pollen Drift', 'Scarecrow Duty', 'Wide Furrow',
        'Hot Noon', 'Honey Light', 'Sun Chaser', 'Harvest Cart', 'Field Mouse Run',
        'Long Shadows', 'Dusty Road', 'Windrow', 'Last Petals', 'Field Crown'
      ]
    },
    {
      name: 'Bramble Thicket',
      blurb: 'Thorns in every gap and no straight way through.',
      accent: '#f08a7a',
      sky: '#3a1a18',
      names: [
        'Thorn Gate', 'Tangled Path', 'Blackberry Row', 'Scratch Alley', 'Woven Wall',
        'Cut and Bleed', 'Briar Patch', 'Snagged Sleeve', 'Nettle Hollow', 'Hidden Gap',
        'Raspberry Tangle', 'Dead End', 'Bramble Crown', 'Knot of Wire', 'Rose Hips',
        'Deep Scratches', "Warden's Trail", 'Thistle Watch', 'Old Fence', 'Bramble Heart'
      ]
    },
    {
      name: 'Crystal Caverns',
      blurb: 'Cold gems in the dark, and frost that never melts.',
      accent: '#9fd8ff',
      sky: '#14263a',
      names: [
        'First Vein', 'Dripstone', 'Glitter Wall', 'Cold Facets', 'Deep Shaft',
        'Lantern Low', 'Quartz Hall', 'Still Air', 'Frozen Falls', 'Amethyst Row',
        'Narrow Fissure', 'Cave Pearls', 'Torch Stub', 'Bottomless Pit', 'Geode Room',
        'Silver Seam', 'Chill Draft', 'Cavern Roof', 'Blind Fish Run', 'Crystal Heart'
      ]
    },
    {
      name: 'Ember Wastes',
      blurb: 'Scorched ground and a wind like a furnace.',
      accent: '#ff8a5c',
      sky: '#3a1c14',
      names: [
        'Ash Plain', 'Cracked Earth', 'Heat Shimmer', 'Charred Stump', 'Lava Rill',
        'Smoke Line', 'Scorched Track', 'Cinder Field', 'Dry Lightning', 'Baked Hard',
        'Glowing Coals', 'Soot Trail', 'Far Horizon', 'Burnt Ridge', 'Fireweed',
        'Warm Stones', 'Last Water', 'Undying Flame', 'Sun Bleached', 'Ember Heart'
      ]
    },
    {
      name: 'Moonlit Fen',
      blurb: 'Pale light on black water, and everything watching.',
      accent: '#b9c7ff',
      sky: '#181a33',
      names: [
        'Pale Water', 'Night Reeds', 'Moon Path', 'Silver Frogs', 'Cold Mist',
        'Will-o-Wisp', 'Black Pool', 'Quiet Bank', 'Owl Call', 'Star Reflection',
        'Fen Lights', 'Sleepy Heron', 'Drowned Willow', 'Ghost Grass', 'Half Light',
        'Cricket Song', 'Midnight Sedge', 'Fading Banks', 'Dark Current', 'Fen Heart'
      ]
    },
    {
      name: 'Salt Flats',
      blurb: 'White plains cracked into tiles. Nothing grows here.',
      accent: '#eae2c8',
      sky: '#33312a',
      names: [
        'White Crust', 'Cracked Pan', 'Brine Pool', 'No Shade', 'Salt Wind',
        'Hard Ground', 'Mirage Line', 'Bleached Bone', 'Dry Basin', 'Flat Glare',
        'Dead Straight', 'Empty Mile', 'Salt Pillar', 'Wide Nothing', 'Last Marker',
        'Heat Haze', 'Crust Edge', 'Bitter Well', 'Salt Crown', 'Flats Heart'
      ]
    },
    {
      name: 'Thunder Ridge',
      blurb: 'Exposed rock, and storms that arrive without warning.',
      accent: '#8fb4ff',
      sky: '#1c2440',
      names: [
        'Storm Watch', 'Exposed Rock', 'First Thunder', 'Lightning Rod', 'Wet Stone',
        'Ridge Line', 'Cold Front', 'Sheet Rain', 'Wind Shear', 'Static Air',
        'Split Pine', 'Distant Rumble', 'High Pass', 'Storm Cell', 'Bare Summit',
        'Rain Shadow', 'Grounded', 'Thunder Head', 'The Long Climb', 'Ridge Crown'
      ]
    },
    {
      name: 'Orchid Terrace',
      blurb: 'Stepped hills of rare blooms, kept by patient hands.',
      accent: '#f2a0d8',
      sky: '#33203a',
      names: [
        'First Orchard', 'Stepped Hills', 'Glass House', 'Rare Bloom', 'Hand Pollinated',
        'Root Basket', 'Damp Moss Wall', 'Petal Show', 'Terraced Row', 'Prize Stem',
        'Shade Cloth', 'Cutting Pot', 'New Hybrid', 'Careful Watering', 'Long Wait',
        'Pink Cascade', 'Hidden Orchid', 'Garden Prize', 'Show Bench', 'Terrace Heart'
      ]
    },
    {
      name: 'Petrified Wood',
      blurb: 'A forest turned to stone that is still standing.',
      accent: '#c9b98f',
      sky: '#2b2820',
      names: [
        'Stone Trunks', 'Fossil Bark', 'Mineral Rings', 'Standing Dead', 'Silica Dust',
        'Hard Grain', 'Ancient Fall', 'Quarry Edge', 'Grey Canopy', 'No Shade Here',
        'Bone White Log', 'Petrified Grove', 'Slow Bones', 'Split Boulder', 'Wind Cut',
        'Long Silence', 'Deep Strata', 'Stone Sap', 'Root of Rock', 'Stonewood Heart'
      ]
    },
    {
      name: 'Aurora Tundra',
      blurb: 'Light on the snow that moves like water.',
      accent: '#8ef0c8',
      sky: '#16283a',
      names: [
        'First Frost Line', 'Aurora Veil', 'Green Sky', 'Violet Curtain', 'Frozen Ground',
        'No Horizon', 'Ice Fog', 'Snow Crust', 'Cold Snap', 'Lights Above',
        'Silent Plain', 'Polar Wind', 'Rime Branches', 'Frozen Moss', 'Long Night',
        'Dancing Lights', 'Bitter Cold', 'White Silence', 'Edge of Ice', 'Tundra Heart'
      ]
    },
    {
      name: 'Volcanic Slope',
      blurb: 'Ash underfoot and hot stone that will not cool.',
      accent: '#ff7a6a',
      sky: '#2c1414',
      names: [
        'Ash Fall', 'Hot Stone', 'Vent Field', 'Slow Lava', 'Black Sand',
        'Steam Crack', 'Cinder Cone', 'Molten Vein', 'Sulphur Air', 'Climbing Heat',
        'Obsidian Shard', 'Fumarole', 'Burnt Slope', 'Red Glow', 'Hard Climb',
        'Rockslide', 'Fire Fountain', 'Last Cool Air', 'Crater Rim', 'Volcano Heart'
      ]
    },
    {
      name: 'Skyfall Glade',
      blurb: 'Islands of root and moss adrift in thin air.',
      accent: '#a8e8ff',
      sky: '#1a2c3c',
      names: [
        'Thin Air', 'Floating Roots', 'Drifting Isle', 'Cloud Bank', 'Wind Bridge',
        'Open Drop', 'Moss Balloon', 'Swaying Chain', 'Far Below', 'Sky Garden',
        'Sun Above Clouds', 'Birds Passing', 'Long Fall', 'Anchored Rock', 'Rain Maker',
        'High Meadow', 'Air Roots', 'Falling Water', 'Gentian Blue', 'Glade Heart'
      ]
    },
    {
      name: 'World Tree',
      blurb: 'The oldest leaf in the world. All roots lead here.',
      accent: '#ffd98a',
      sky: '#241a38',
      names: [
        'Deep Root', 'First Branch', 'Bark of Ages', 'Sap Rising', 'Ring of Years',
        'Canopy Sea', 'All Paths Meet', 'Oldest Leaf', 'Green Crown', 'Trunk of the World',
        'Under the Canopy', 'Roots Below', 'Sap Lines', 'Keeper of Rings', 'Living Pillar',
        'The Long Growth', 'Throne of Rings', 'Held Up High', 'Last Light Above', 'World Tree'
      ]
    }
  ];

  /* Small seeded PRNG so chapter layouts are reproducible without pulling in
     the engine module. */
  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var PER_GARDEN = 20;
  var TOTAL = GARDENS.length * PER_GARDEN;

  function round50(n) { return Math.round(n / 50) * 50; }

  /* A word per garden, warm to fierce. */
  var DIFFICULTY = [
    'Warm-up', 'Easy', 'Easy', 'Steady', 'Steady',
    'Tricky', 'Tricky', 'Hard', 'Hard', 'Tough',
    'Tough', 'Fierce', 'Fierce', 'Expert', 'Expert',
    'Brutal', 'Brutal', 'Savage', 'Savage', 'Legendary'
  ];

  function difficultyOf(garden) {
    return DIFFICULTY[garden] || 'Legendary';
  }

  /* Roughly what one move of a full game is worth, per leaf kind. Five kinds
     make for easy matches and long cascades; seven make you work for every
     line. Measured from simulated play rather than guessed. */
  var PER_MOVE = { 5: 340, 6: 210, 7: 165 };

  /* And roughly how many leaves a move clears, which is what a "collect this
     many" goal is actually drawn from. Thicker boards pay less. */
  function leavesPerMove(typeCount, blockers) {
    return 6.2 - (typeCount - 5) * 0.75 - blockers * 0.03;
  }

  function pickCells(rand, rows, cols, count, taken) {
    var out = [], guard = 0;
    while (out.length < count && guard++ < count * 60) {
      var r = Math.floor(rand() * rows);
      var c = Math.floor(rand() * cols);
      var k = r + ':' + c;
      if (taken[k]) continue;
      taken[k] = 1;
      out.push([r, c]);
    }
    return out;
  }

  function buildChapter(i) {
    var garden = Math.floor(i / PER_GARDEN);
    var k = i % PER_GARDEN;
    var def = GARDENS[garden];
    var rand = rng(90210 + i * 7919);

    var rows = 8, cols = 8;

    /* One garden to learn on, three with a sixth leaf, then all seven. */
    var typeCount = garden === 0 ? 5 : (garden <= 4 ? 6 : 7);

    /* A garden opens with room and tightens as it goes, and the opening
       gardens start a couple of moves lighter than the seven they used to
       have. From the fourth garden on every chapter keeps the same budget. */
    var moves = 34 - Math.floor(k / 2) - Math.min(garden + 2, 5);

    /* How far through the whole run this chapter sits, 0 at the first and 1 at
       the last. */
    var ramp = Math.sqrt(i / (TOTAL - 1));

    /* The score goal is a per-move budget rather than a pile that grows with
       the chapter number. A clear is worth the same points in chapter 400 as
       it is in chapter 1, so a target that grew with the number would sail
       past anything a board can pay - a simulated player clears around
       three hundred points a move with five leaf kinds on an open board and
       under half that with seven on a frosted one. This one asks for a share
       of what a solid run earns, and that share climbs from a real ask for a
       careful player to a demanding four fifths across the whole run. */
    var target = round50(moves * (PER_MOVE[typeCount] || 165)
      * (0.42 + 0.36 * ramp) * (0.94 + rand() * 0.12));
    var objectives = [{ kind: 'score', target: target }];

    var taken = {};
    var ice = [];
    var stones = [];
    var layers = 1;
    var hp = 1;
    var iceCount = 0;
    var stoneCount = 0;

    /* Frost starts in the second garden and thickens from there. From the
       tenth garden on every chapter has some. */
    if (garden >= 1 && (garden >= 9 || k % 3 === 1 || k % 7 === 4)) {
      iceCount = Math.min(16, 4 + Math.floor(k / 2) + (garden - 1) * 2);
      if (garden >= 3 && k % 4 === 1) layers = 2;
      else if (garden >= 11 && k % 5 === 2) layers = 2;
      else if (garden >= 18 && k % 11 === 3) layers = 3;
      var iceCells = pickCells(rand, rows, cols, iceCount, taken);
      iceCount = iceCells.length;
      for (var a = 0; a < iceCells.length; a++) ice.push([iceCells[a][0], iceCells[a][1], layers]);
      objectives.push({ kind: 'ice', count: iceCells.length * layers });
    }

    /* Rocks start in the third garden. From the twelfth on every chapter
       carries some. */
    if (garden >= 2 && (garden >= 11 || k % 4 === 2 || k % 9 === 7)) {
      stoneCount = Math.min(9, 3 + Math.floor(k / 4) + (garden - 2));
      if (garden >= 4 && k % 5 === 0) hp = 2;
      else if (garden >= 8 && k % 6 === 3) hp = 2;
      else if (garden >= 17 && k % 13 === 5) hp = 3;
      var stoneCells = pickCells(rand, rows, cols, stoneCount, taken);
      stoneCount = stoneCells.length;
      for (var b = 0; b < stoneCells.length; b++) stones.push([stoneCells[b][0], stoneCells[b][1], hp]);
      objectives.push({ kind: 'stone', count: stoneCells.length, hp: hp });
    }

    /* One collect goal everywhere, a second one from the third garden on. The
       count is capped against the move budget: fewer moves and more leaf kinds
       mean less of any one kind falls out of the board, so a bigger number
       would be a wall rather than a puzzle. */
    var share = moves * leavesPerMove(typeCount, iceCount + stoneCount) / typeCount;
    var count = Math.max(6, Math.round(share * (0.44 + 0.28 * ramp)));
    var wanted = 1 + (garden >= 2 && k % 3 === 0 ? 1 : 0);
    var used = {};
    for (var w = 0; w < wanted; w++) {
      var leaf = Math.floor(rand() * typeCount);
      var guard = 0;
      while (used[leaf] && guard++ < 20) leaf = Math.floor(rand() * typeCount);
      used[leaf] = 1;
      objectives.push({ kind: 'collect', leaf: leaf, count: count });
    }

    return {
      num: i + 1,
      id: i + 1,
      garden: garden,
      gardenName: def.name,
      name: def.names[k] || ('Chapter ' + (i + 1)),
      index: k,
      rows: rows,
      cols: cols,
      typeCount: typeCount,
      moves: moves,
      seed: 4242 + i * 977,
      objectives: objectives,
      scoreTarget: target,
      stars: [target, round50(target * 1.45), round50(target * 1.95)],
      ice: ice,
      stones: stones,
      difficulty: difficultyOf(garden)
    };
  }

  var CHAPTERS = [];
  for (var i = 0; i < TOTAL; i++) CHAPTERS.push(buildChapter(i));

  root.LeafChapters = {
    GARDENS: GARDENS,
    CHAPTERS: CHAPTERS,
    PER_GARDEN: PER_GARDEN,
    TOTAL: CHAPTERS.length
  };
})(typeof window !== 'undefined' ? window : globalThis);
