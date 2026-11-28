// =====================================================================================
//  config.js  -  THE FILE TO EDIT FOR SMALL CHANGES
//  Rules numbers, character descriptions, colours and screen positions all live here.
//  (Every .js file is loaded by index.html in this order: config, board, art, render, input, rules, main.)
// =====================================================================================

// ---- Game settings you can change ----
const CONFIG = {
  LADDERS: 9, // how many ladders each board gets
  SNAKES: 9, // how many snakes each board gets (at most 1 more than the number of ordinary snake heads in manifest.json: the cobra + one head each)
  MIN_PLAYERS: 2, // fewest players allowed on the setup screen
  MAX_PLAYERS: 6, // most players allowed (the layout has room for 6 panels)
  STEP_MS: 350, // pause (milliseconds) after every piece movement so you can follow what happened
  RECONNECT_MS: 5000, // online: how long a disconnected player's turn waits for them to come back before it is skipped
};

// ---- Sounds. file = path inside assets/. skip = seconds of leading silence to cut so the sound lands exactly on the action.
//   volume = 0..1 (optional). Change which sound a name uses by editing "file" here; the events that use each name are in audio.js / rules.js / input.js.
const SOUNDS = {
  small: { file: "sounds/button_sound_small.mp3", skip: 0.028 }, // tabs, expand/close, ROLL, Move for me, picking up a pawn
  press: { file: "sounds/button_sound_medium_1.mp3", skip: 0.12 }, // the big choice buttons in the board log
  tock: { file: "sounds/button_sound_medium_2.mp3", skip: 0.06 }, // a piece landing / being dropped on a square
  big: { file: "sounds/button_sound_big.mp3", skip: 0.045 }, // Start game, winning
  dice: { file: "sounds/sound_dice_roll.mp3", skip: 0.028 }, // the dice roll (its last bounce is at ~0.93s, so a roll lasts ROLL_MS = 930)

  // ---- game-event sounds. Several files that share a name + number (snake_1, snake_2...) are ONE group: the game picks one of them at random each time. To add a variation, add a line like stone_3 (same name, next number).
  //   volume evens out the clips so they are about equally loud (it is a multiplier on top of the Settings volume).
  // energy drink used
  drink: { file: "sounds/sound_energy_drink.mp3", skip: 0.064, volume: 0.87 },
  // stick nudges a snake head / the Charmer moves one
  snake_1: { file: "sounds/sound_snake_1.mp3", skip: 0.07, volume: 0.64 },
  snake_2: { file: "sounds/sound_snake_2.mp3", skip: 0.045, volume: 1.76 },
  // a thrown stone hits a pawn
  stone_1: { file: "sounds/sound_stone_1.mp3", skip: 0.062, volume: 0.7 },
  stone_2: { file: "sounds/sound_stone_2.mp3", skip: 0.078, volume: 0.6 },
  stone_3: { file: "sounds/sound_stone_3.mp3", skip: 0.041, volume: 0.6 },
  // the cat knocks a player down
  cat_1: { file: "sounds/sound_cat_1.mp3", skip: 0.029, volume: 1.3 },
  // someone wins (plays once)
  win: { file: "sounds/sound_win.mp3", skip: 0.003, volume: 1.21 },
  // BAD sounds: the character's reaction when snake / stone / toy brick / Bully push or pull hits them
  bad_bully_1: {
    file: "sounds/sound_bully_bad_1.mp3",
    skip: 0.081,
    volume: 0.77,
  },
  bad_gambler_1: {
    file: "sounds/sound_gambler_bad_1.mp3",
    skip: 0.077,
    volume: 1.16,
  },
  bad_cat_1: {
    file: "sounds/sound_catlady_bad_1.mp3",
    skip: 0.081,
    volume: 0.89,
  },
  bad_cat_2: {
    file: "sounds/sound_catlady_bad_2.mp3",
    skip: 0.046,
    volume: 0.91,
  },
  bad_cat_3: {
    file: "sounds/sound_catlady_bad_3.mp3",
    skip: 0.05,
    volume: 0.84,
  },
  bad_struggler_1: {
    file: "sounds/sound_struggler_bad_1.mp3",
    skip: 0.085,
    volume: 1.88,
  },
  bad_struggler_2: {
    file: "sounds/sound_struggler_bad_2.mp3",
    skip: 0.07,
    volume: 1.15,
  },
  bad_struggler_3: {
    file: "sounds/sound_struggler_bad_3.mp3",
    skip: 0.074,
    volume: 2.0,
  },
  bad_oracle_1: {
    file: "sounds/sound_oracle_bad_1.mp3",
    skip: 0.086,
    volume: 1.06,
  },
  bad_oracle_2: {
    file: "sounds/sound_oracle_bad_2.mp3",
    skip: 0.058,
    volume: 0.99,
  },
  bad_oracle_3: {
    file: "sounds/sound_oracle_bad_3.mp3",
    skip: 0.055,
    volume: 0.9,
  },
  bad_charmer_1: {
    file: "sounds/sound_charmer_bad_1.mp3",
    skip: 0.028,
    volume: 0.69,
  },
  bad_charmer_2: {
    file: "sounds/sound_charmer_bad_2.mp3",
    skip: 0.061,
    volume: 2.6,
  },
  bad_charmer_3: {
    file: "sounds/sound_charmer_bad_3.mp3",
    skip: 0.037,
    volume: 0.93,
  },
  // the Bully nudges someone 1 square (2 variations)
  bully_nudge_1: {
    file: "sounds/sound_bully_nudge_1.mp3",
    skip: 0.106,
    volume: 1.05,
  },
  bully_nudge_2: {
    file: "sounds/sound_bully_nudge_2.mp3",
    skip: 0.083,
    volume: 1.25,
  },
  // HAPPY sounds: a ladder is climbed, an item is picked up, a 6 is rolled (not if it ends on a snake), the Struggler survives a forced effect
  happy_bully_1: {
    file: "sounds/sound_bully_happy_1.mp3",
    skip: 0.068,
    volume: 2.85,
  },
  happy_cat_1: {
    file: "sounds/sound_catlady_happy_1.mp3",
    skip: 0.109,
    volume: 0.99,
  },
  happy_charmer_1: {
    file: "sounds/sound_charmer_happy_1.mp3",
    skip: 0.072,
    volume: 1.25,
  },
  happy_gambler_1: {
    file: "sounds/sound_gambler_happy_1.mp3",
    skip: 0.116,
    volume: 0.65,
  },
  happy_oracle_1: {
    file: "sounds/sound_oracle_happy_1.mp3",
    skip: 0.056,
    volume: 0.94,
  },
  happy_struggler_1: {
    file: "sounds/sound_struggler_happy_1.mp3",
    skip: 0.062,
    volume: 0.82,
  },
  // the BOO button on the victory screen (the same sound for every character; it is a group of one, so it has no number). Lower "volume" if it is too loud next to the other sounds.
  boo: { file: "sounds/sound_boo.mp3", skip: 0.02, volume: 0.7 },
};
const BOO_SOUND = "boo"; // the name of the BOO button's sound in SOUNDS above (endgame.js plays it, network.js lets it through to the other players)
const STONE_PENALTY = 1; // a stone that hits a player takes this off their next roll (used by rules.js: the stone item and its log text)
const STONE_BAD_DELAY = 450; // milliseconds between a stone hitting a pawn and the victim's "bad" reaction sound (so the reaction comes after the impact sound)
const ROLL_MS = 930; // how long a dice roll animation lasts (milliseconds). Matches the dice sound so the dice stop with the last rattle.

const LIME = "#c3f73a"; // the bright lime used by the art (taken from tile_dark.svg). Used for the active-turn ring and tile highlights.

// ---- The six characters. "id" is used by the code, "name" is shown on screen, "text" is shown on the setup screen and in the Rulebook ----
const CHARACTERS = [
  {
    id: "bully",
    name: "Bully",
    text: "Land exactly on a player with your own roll: roll a die and push or pull them that many squares (choose before rolling). Pass over a player: nudge them 1 square forward or back. A 6 gives another turn.",
  },
  {
    id: "gambler",
    name: "Gambler",
    text: "Rolls 2 dice and moves the total. A 1 on either die sends him back by the other die (double 1s: stay put). Only double 6s give another turn. Past 100 he stays put; from 97-99 either die must show the exact number needed.",
  },
  {
    id: "cat",
    name: "The One with the Cat",
    text: "Goes last, then rolls for the cat, which wraps around the board and ignores snakes, ladders and items. Players the cat jumps over: -1 on their next roll. Players it lands on are knocked down 10 squares and give her +3 on her next roll each (an overshoot loses it).",
  },
  {
    id: "struggler",
    name: "Struggler",
    text: "Every forced effect (snakes, pushes, the cat) gets a die roll: even dodges, odd hits. At a ladder, pick two failure numbers first: roll one of them and he does not climb. A 6 gives another turn.",
  },
  {
    id: "oracle",
    name: "Oracle",
    text: "Calls a number from 1-6 before rolling. A right call adds a 3-sided bonus die to the move, and snakes cannot bite on that move. A wrong call costs nothing. A 6 gives another turn.",
  },
  {
    id: "charmer",
    name: "Snake Charmer",
    text: "Always goes first. Before rolling, may move the head of a snake on her row, or the row above or below, to another free square on that row, then must recharge for a turn. Players already on that square are safe. Never gets an extra turn, even on a 6.",
  },
];

// Which portrait file belongs to which character (files live in assets/). These are also the pawns on the board.
const PORT = {
  bully: "head_bully",
  gambler: "head_gambler",
  cat: "head_catlady",
  struggler: "head_struggler",
  oracle: "head_oracle",
  charmer: "head_charmer",
};

// Short info shown on the character pick panels (most important first). <b>..</b> highlights the key words. Full rules: CHARACTER_RULES in rulebook.js.
const CHARACTER_BRIEF = {
  bully: {
    tag: "Push, pull, nudge",
    pts: [
      "<b>Land on a player:</b> roll a die and push or pull them that many squares (choose before rolling).",
      "<b>Pass over a player:</b> nudge them 1 square forward or back.",
      "Works on your own roll, before snakes and ladders.",
      "A 6 gives another turn.",
    ],
  },
  gambler: {
    tag: "Two dice, big risks",
    pts: [
      "Rolls <b>2 dice</b> and moves the total.",
      "A <b>1</b> on either die sends you back by the other die. Double 1s: stay put.",
      "Extra turn only on <b>double 6s</b>.",
      "Past 100 you <b>stay put</b>. From 97-99 either die must show the exact number.",
    ],
  },
  cat: {
    tag: "A cat on the loose",
    pts: [
      "Goes <b>last</b>, then rolls for the <b>cat</b>, which wraps around the board.",
      "Players the cat jumps over: <b>-1</b> on their next roll.",
      "A player it lands on is knocked down <b>10 squares</b>; you get <b>+3</b> on your next roll for each.",
      "The cat ignores snakes, ladders and items.",
    ],
  },
  struggler: {
    tag: "Dodges, mostly",
    pts: [
      "Anything forced (snakes, pushes, the cat): roll a die. <b>Even dodges</b>, odd hits.",
      "Ladders: pick <b>2 failure numbers</b>, then roll. Hit one and you do not climb.",
      "Items work normally.",
      "A 6 gives another turn.",
    ],
  },
  oracle: {
    tag: "Calls the roll",
    pts: [
      "<b>Call a number</b> (1-6) before rolling.",
      "Right call: add a <b>d3 bonus</b>, and snakes cannot bite on that move.",
      "A wrong call costs nothing.",
      "A 6 gives another turn.",
    ],
  },
  charmer: {
    tag: "Moves snake heads",
    pts: [
      "Always goes <b>first</b>.",
      "Before rolling, drag a <b>snake head</b> on your row (or one row above or below) to another free square, then recharge for a turn.",
      "Players already on that square are safe.",
      "<b>Never</b> gets an extra turn, even on a 6.",
    ],
  },
};

// Player colours (player 1 first). Each pawn gets a disc of its player's colour behind the face.
const COLORS = [
  "#d64545",
  "#3b82c4",
  "#e0a82e",
  "#8b5cc7",
  "#2f9e8f",
  "#e07a2e",
  "#c44a96",
  "#6b7280",
];

// ---- Screen layout numbers (the screen is a fixed 1920x1080 canvas). NEW LAYOUT:
//      LEFT = the board (a big container) | RIGHT = player panels (top), the brown Settings / Chat / Info box, and the round tab buttons (bottom right) ----
const BOXES = [
  // the container drawn behind the board (container_red.svg, 9-slice stretched; its thin frame width is set in .box in style.css)
  { id: "boxM", x: 8, y: 8, w: 1276, h: 1064 },
];
const BOARD_BOX = { x: 8, y: 8, w: 1276, h: 1064 }; // the board SVG / canvases cover the whole container (stage coordinates). The roll overlay (#tray) covers the same area.
// Tiles are RECTANGULAR now (wider than tall): the tile art (tile_dark.svg / tile_light.svg) is 113.48 x 95.54 with a 86.52-high top face and a ~9-high edge underneath.
const TW = 114; // drawn width of one tile (pixels). (A little smaller than the 126 pitch so a dark-brown shadow AND a thin orange gap fit between tiles.)
const TK = TW / 113.48; // scale from the tile SVG's own size to its drawn size (1.0575): every tile is drawn at exactly this scale
const TTH = 95.54 * TK; // drawn height of a WHOLE tile (top face + the edge underneath); the shadow in render.js is as tall as this
const TH = 86.52 * TK; // drawn height of the TOP FACE of a tile (about 91.5). Pawns, numbers and highlights are centred on / fitted to the face.
const CX = 126; // horizontal distance between the left edges of two neighbouring tiles (tile width + a small gap)
const CY = 105; // vertical distance between the tops of two neighbouring tiles (face + edge + a small gap)
const BX0 = 22; // left edge of the first board column
const BY0 = 17; // top edge of the first board row
const BS = 1.1; // BS = "board scale": everything drawn on the board (snakes, pawns, items) is sized relative to this
// ---- Player panels (right side). ONE panel art (assets/player_panel.svg, 510 x 220.89) is used for every panel and drawn at two sizes:
//      the ACTIVE player is big on top, everyone else is small and sits in a ring below, see panelSlot() in render.js. All numbers below are measured from the art (panel units). ----
const PANEL = {
  w: 510,
  h: 220.89,
  disc: 88, // disc = radius of the coloured pawn-colour disc behind the head (the panel's dark circle is 93.25 wide; same centre as the portrait)

  field: { x: 214.27, y: 40.18, w: 279.4, h: 59.88 }, // the dark name box
  portrait: { cx: 105.44, cy: 105.44, size: 196 }, // the round portrait area (the head may stick out of the circle a little)
  slots: [
    { x: 214.27, y: 110.84, w: 59.88, h: 59.88 },
    { x: 287.45, y: 110.84, w: 59.88, h: 59.88 },
    { x: 360.63, y: 110.84, w: 59.88, h: 59.88 },
  ], // the 3 item slots
  counter: { x: 433.8, y: 110.84, w: 59.88, h: 59.88 },
}; // the 4th square: the buff / debuff number
const PANEL_ZONE = {
  bigX: 1329,
  bigY: 16,
  bigScale: 1.07, // the big (active) panel: top-left corner and size (1.07 x the art)
  smallScale: 0.51,
  colL: 1330,
  colR: 1615,
  midX: 1472,
  rowY: 268,
  rowPitch: 124,
}; // small panels: size, left column x, right column x, centred x, first row y, distance between rows
const COUNTER_ORANGE = "#ff7529",
  COUNTER_BLUE = "#1b84b8",
  COUNTER_BROWN = "#2f2504"; // buff (positive) / debuff (negative) / zero colours of the number square
// ---- The strip of round tab buttons in the bottom-right CORNER OF THE WINDOW (not of the 1920x1080 stage: it is fixed to the real window corner, see #dockfix in css/style.css).
//      pad = space round the buttons, pitch = distance between two buttons ----
const DOCK = { pad: 14, padY: 10, pitch: 80 }; // pad = space left of the first button, padY = space above the buttons (the strip is 80 tall, see #dockfix in css), pitch = distance between buttons
// ---- Scroll bars (made by attachScrollbar in main.js; used by the chat, the small Rulebook / Board log / Information panels and the big pop-up windows). Sizes are in stage pixels. ----
const SCROLLBAR = {
  width: 24, // total width of the bar (the olive rounded strip)
  padding: 4, // space between the strip's edge and the arrow buttons / the track
  button: 16, // size of the square up / down arrow buttons
  gap: 4, // space between a button and the track
  thumbWidth: 8, // width of the lime handle
  thumbMin: 36, // the handle is never shorter than this, however long the text is
  step: 56, // how far an arrow click scrolls
  edge: 20, // distance between the bar and the right edge of a small panel: the same as the space left of the text, so both sides look equal
  chatEdge: 0, // the same for the Chat: the bar's right edge lines up exactly with the right edge of the send button (the chat area is as wide as the input row, see --chat-w in css)
  modalEdge: 0, // the same for the big pop-up windows (their text starts 34px from the window edge, and so does the bar)
  textGap: 16, // space kept free between the text and the bar, so words never run under it
  bottomGap: 14, // space between the bottom of the bar and the panel's edge: the same as the gap above the Expand button (top: 14px in css .xbtn)
};
// ---- Big pop-up windows (Rulebook, Board log, Information) ----
const MODAL = { width: 1200, maxHeight: 960, screenMargin: 60 }; // widest the window gets, tallest it gets, and the space kept free round it (all in stage pixels)

// =====================================================================================
//  TUNING NUMBERS  -  every adjustable number of the game's code lives here, with a name and a short explanation.
//  Change a value here and it changes everywhere that uses it. (Layout numbers of the screen are above; sound, network and timing numbers are further down.)
// =====================================================================================
// ---- The board itself ----
const BOARD_COLS = 10,
  BOARD_ROWS = 10; // the board is 10 squares wide and 10 squares tall...
const SQUARES = BOARD_COLS * BOARD_ROWS; // ...so it has 100 squares (the last one is the finish)
const LAST_COL = BOARD_COLS - 1,
  LAST_ROW = BOARD_ROWS - 1; // index of the last column / row (columns and rows are counted from 0)
// ---- Snake drawing (render.js) ----
const SNAKE_FLAT_WIDTH = 26; // thickness of a snake drawn as a flat colour (before the board scale BS is applied)
const SNAKE_BEND_RADIUS = 40; // how round the bends of a snake are (bigger = rounder)
const SNAKE_BODY_HEAD_WIDTH = 38; // thickness of the head end of a snake drawn from picture art (it tapers towards the tail)
const SNAKE_TIP_WIDTH = 9; // width of the very tip of a flat snake's tail
const SNAKE_TAPER_FRACTION = 0.6; // the tail tapers over this share of the snake's length...
const SNAKE_TAPER_MAX = 300; // ...but never over more than this many pixels
const SNAKE_OUTLINE_WIDTH = 3.5; // thickness of the black outline round a flat snake
const SNAKE_POINT_SPACING = 14; // a snake's path is split into points this many pixels apart
const CORNER_STEPS = 8; // each rounded corner of a snake is drawn as this many little straight pieces
const TIP_CAP_STEPS = 8; // the round end of a flat snake's tail is drawn as this many little pieces
const SLICE_STEP = 1.5; // snakes made from art are drawn in slices this many pixels long (thin = smooth bends)
const SLICE_OVERLAP = 1.5; // neighbouring slices overlap by this much so no gaps show
const HEAD_DIRECTION_POINT = 4; // the head looks towards the 5th point of the snake's path (counting from 0)
const HEAD_FLIP_DEADZONE = 8; // the head only turns round when the path points sideways by more than this many pixels
// ---- Snake route planning (render.js route()) ----
const OVERLAP_SAMPLES_PER_SQUARE = 4; // when measuring how much a route overlaps others, this many points are checked per square of length
const OVERLAP_NEAR = 0.6; // a checked point counts as overlapping when it is closer than this many squares to another route
const MIN_ROUTE_LENGTH = 5; // a snake's route is never shorter than this many squares...
const ROUTE_LENGTH_PER_DISTANCE = 1.1; // ...and is at least this many times the straight distance between head and tail...
const ROUTE_LENGTH_EXTRA = 1.5; // ...plus this many extra squares
const ROUTE_MARGIN = 2; // extra waypoints may be placed up to this many squares outside the head-to-tail box
const ROUTE_TRIES = 500; // how many random routes are tried before settling for the best one found
const SHORT_SNAKE_DISTANCE = 3; // a snake whose head and tail are closer than this (in squares) counts as short...
const WAYPOINTS_SHORT = [2, 3]; // ...and gets this many (min, max) extra waypoints so it curls...
const WAYPOINTS_LONG = [1, 2]; // ...a longer snake gets this many
const NECK_SIDEWAYS = [1, 2]; // the first corner after a head is this many squares (min, max) to the side
// ---- Ladder drawing (render.js) ----
const LADDER_STRAIGHT_DX = 4; // a ladder whose two ends are less than this many pixels apart sideways is drawn with the straight picture
const LADDER_EXTRA_LENGTH = 36; // ladders are drawn this much longer than the distance between the two square centres
const LADDER_SCALE = 0.96; // size of the ladder picture on the board
const LADDER_PIECE_HEIGHT = 100; // height of one ladder picture in its own units
const LADDER_BORDER_ROOM = 40; // room kept round a ladder bitmap for its outline
const LADDER_END_TRIM = 22; // when number placement checks ladders, the ladder ends are shortened by this many pixels
const OUTLINE_STEPS = 20; // the black outline round pictures is made by stamping them in this many directions
const OUTLINE_PX = 3; // thickness of that outline in pixels
// ---- Numbers on tiles, tiles, pawns, items (render.js) ----
const NUM_PAD = 6; // gap between a tile's edge and its number
const NUM_NEAR = 60; // snakes / ladders farther than this many pixels from a number's corner are ignored when choosing its corner
const NUM_CLEARANCE = 3; // extra space kept between a snake's outline and a number
const TILE_PICK_MUL = 37,
  TILE_PICK_MOD = 11; // formula that picks which tile picture is used on which square (a fixed pattern, so every game looks the same)
const PAWN_CELL = 82; // room (pixels, before BS) one square offers its pawns...
const PAWN_SIZE = 72; // ...and the size of one pawn drawn alone on a square
const PAWN_CROWD = 1.08; // when pawns share a square they may grow to this share of their cell
const ITEM_BOARD_W = 60,
  ITEM_BOARD_H = 52; // size of an item lying on a square (before BS)
// ---- Player panels (render.js) ----
const FIT_CHAR_WIDTH = 0.62; // average width of a character as a share of the font size (used to shrink long names)
const FIT_MIN_FONT = 9; // names are never shrunk below this font size
const NAME_MAX_FONT = 40; // biggest font size of a player's name in the panel's name box
const NAME_PAD = 32; // space kept free inside the name box
const PANEL_Z_ACTIVE = 3,
  PANEL_Z_OTHER = 2; // stacking order: the big active panel is drawn above the small ones
const SLOT_ITEM_W = 54,
  SLOT_ITEM_H = 50; // biggest size an item picture may have inside a panel slot
const SLOT_FALLBACK = [1600, 140]; // where thrown items start if a slot cannot be found
const COUNTER_TWO_DIGITS = 10; // numbers from this value up use the smaller two-digit font in the buff/debuff square
const FLASH_MS = { short: 900, long: 2600 }; // how long a panel flashes (normal / when a player reconnects)
// ---- Random board generation (board.js): how the snakes and ladders are placed. Square numbers are 1-100; rows and columns are counted from 0 (row 0 = bottom). ----
const TOP_HEAD_1 = [91, 95]; // the short top snake's head lands on one of these squares (min, max)
const TOP_HEAD_GAP = 4; // the second top head is at least this many squares after the first...
const TOP_HEAD_2_MAX = 99; // ...and at most on this square
const TOP_LADDER_MARGIN = 2; // the top ladder ends this many squares away from both top snake heads
const SHORT_SNAKE_DROP = [8, 14]; // the short top snake slides down this many squares (min, max)
const LONG_SNAKE_DROP = [35, 55]; // the long top snake (the cobra) slides down this many squares
const TOP_LADDER_RISE = [20, 50]; // the ladder reaching the top starts this many squares below its end
const TOP_LADDER_MAX_COLS = 4; // ...and no more than this many columns to the side
const TOP_LADDER_TRIES = 60; // attempts to place that ladder
const MIN_GAP_STRICT = 2,
  MIN_GAP_RELAXED = 1; // snake / ladder squares must be at least this many squares apart (strict first, relaxed after RELAX_AFTER tries)
const RELAX_AFTER = 40; // after this many failed tries the gap rule is relaxed
const PLACE_TRIES = 80; // attempts to place each other snake / ladder before giving up on the whole board
const SNAKE_HEAD_ROWS = 8; // other snake heads may be on rows 1 to this (higher rows are more likely; how much more is SNAKE_ROW_BIAS_POWER below)
const SNAKE_ROW_BIAS_POWER = 1.6; // how strongly higher rows are favoured for a snake head (was a fixed x*x, i.e. 2; a smaller number spreads heads over more rows)
const MAX_SNAKES_PER_ROW = 2; // at most this many snake heads on the same row at first (prevents several snakes bunching on one row); relaxed by 1 after RELAX_AFTER tries, same as the gap rule below, so the board generator doesn't give up
const SNAKE_DROP_ROWS = [1, 4]; // other snakes drop this many rows (min, max)
const SNAKE_TAIL_SHIFT = 4; // ...and their tail is up to this many columns to the left or right
const SNAKE_MIN_DROP = 6; // every snake must slide down at least this many squares
const WIDE_LADDER_CHANCE = 0.15; // chance that a ladder is a wide (mostly sideways) one (at most one per board)
const LADDER_START_ROW_MAX = 7; // other ladders start on rows 0 to this
const WIDE_LADDER_RISE = [1, 2]; // a wide ladder climbs this many rows...
const WIDE_LADDER_SHIFT = [6, 9]; // ...and moves this many columns sideways
const TALL_LADDER_RISE = [2, 5]; // an ordinary ladder climbs this many rows...
const TALL_LADDER_SHIFT = [-3, 3]; // ...and moves this many columns sideways (negative = left)
const LADDER_TOP_ROW_MAX = 8; // no other ladder reaches above this row
const WIDE_LADDER_MIN_SHIFT = 5; // a wide ladder must really be wide: at least this many columns
const COLUMN_THIRDS = [3, 7]; // columns below 3 = left third, below 7 = middle, the rest = right third
const MIN_PER_THIRD = 5; // every third of the board needs at least this many snake / ladder ends
const LOW_ROW_LIMIT = 5; // snake heads on rows below this are "low"...
const MAX_LOW_SNAKES = 2; // ...and there may be at most this many of them
const BOARD_TRIES = 3000; // random boards tried before the generator starts over
const STAGE_W = 1920,
  STAGE_H = 1080; // the game screen is a fixed canvas this big (pixels); main.js scales it to fit the window
// ---- Item flights and dice (input.js) ----
const TAU = Math.PI * 2; // a full circle in radians
const FLY_ITEM_SIZE = 56; // size of an item picture while it flies (thrown or slid)
const TOSS_ARC = { base: 70, perPixel: 0.25, max: 200 }; // how high a thrown item arcs: base + perPixel x distance, never more than max pixels
const TOSS_SPIN = { stick: 720, other: 540 }; // degrees a thrown item spins on its way (a stick spins more)
const FLY_MS = { toss: 750, slide: 650 }; // how long a thrown / slid item takes to arrive
const FLY_SCALE = { tossPeak: 1.3, slidePeak: 1.05, slideEnd: 0.95 }; // size of the item at the top of its arc / end of a slide (1 = normal)
const ANIM_SAFETY_MS = 80; // extra wait after an animation so a hidden browser tab can never freeze the game
const DICE_START_ANGLE_MAX = 359; // a new die starts at a random angle from 0 to this
const DICE_FADE_DELAY_MS = 1100; // after a roll, the result stays on the table this long before the dice fade away
const DICE_SLIDE_MS = 280; // time the dice take to glide to the middle after a roll
const DICE_FRAME_MAX_MS = 32; // a long pause between frames is cut to this (so dice never jump)
const DICE_IDLE_SPIN = { x: 0.1, y: 0.15 }; // degrees per millisecond a waiting die turns
const DICE_SEPARATE_PASSES = 3; // how many times per frame overlapping dice are pushed apart
const DICE_BOUNCE_KEEP = 0.9; // share of speed two flying dice keep when they collide
const DICE_PUSH_AWAY = 1.8; // how hard a flying die is pushed away by a resting / held one
const ROLL_BUTTON_SPEED = { min: 0.85, range: 0.6 }; // the ROLL button throws the die with a random speed between min and min+range
const DRAG_SAMPLES = 8; // mouse positions remembered while dragging a die (the throw uses the last ones)
const WEAK_FLICK_SPEED = 0.25; // a flick slower than this counts as "barely moved"...
const WEAK_FLICK_PUSH = 1; // ...and the die gets this gentle random push instead
const THROW_SPEED = { min: 0.8, max: 2.2 }; // thrown dice are kept between these speeds
const ROLL_SIM_MAX_FRAMES = 900; // longest roll that is pre-calculated (frames)
const ROLL_SIM_FRAME_MS = 16.7; // length of one pre-calculated frame in milliseconds (about 60 per second)
const ROLL_FALLBACK_MS = 60; // extra time after a roll before the safety timer finishes it
const FULL_TURN = 360; // degrees in a full turn
// ---- Right-hand panels and screen (main.js) ----
const VOLUME_MAX = 10; // volume steps: 0 (silent) to this (full)
const EVENT_LINES = 8; // the Current Event panel considers this many of the latest log lines (it then drops the oldest ones until the rest fit in the panel)
const PANEL_OFFSCREEN_MARGIN = 760; // right-hand panels wait this many pixels beyond the right edge of the window (more than their width)
const NAME_SYNC_MS = 240; // typing a name in the lobby is sent to the other players after this pause (so every key press is not sent)
const SWITCH_TICK_MS = 500; // the Switch Device code countdown refreshes this often
const SECONDS_PER_MINUTE = 60,
  MS_PER_SECOND = 1000;
// ---- Snake head art (art.js) ----
const HEAD_SIZE = 82,
  COBRA_HEAD_SIZE = 100; // drawn size of an ordinary snake head / the cobra's bigger head (before BS)
const SHORT_SNAKE_POOL = 3; // the "short" head design is given to the closest-to-start of this many shortest snakes
// ---- Game rules numbers (rules.js). Change these to change how the game plays (the rulebook text in rulebook.js is written separately: update it too). ----
const FINISH_SQUARE = SQUARES; // the square that wins the game when landed on exactly
// Dice designs: every character throws their OWN dice. Each file in assets/ holds ALL the faces of ONE die: DIE_FACES equal squares side by side, in order 1 to 6 (left to right).
// One entry per die: the Gambler throws two dice, each with its own design (the first file is his first die, the second file his second die). The cat lady and her cat share one design.
const DICE_ART = {
  bully: ["dice_bully.svg"],
  gambler: ["dice_gambler_1.svg", "dice_gambler_2.svg"],
  cat: ["dice_catlady.svg"],
  struggler: ["dice_struggler.svg"],
  oracle: ["dice_oracle.svg"],
  charmer: ["dice_charmer.svg"],
};
const DICE_FACE_RADIUS_RATIO = 10 / 187.1; // a face's corner roundness as a share of its side (10 on a 187.1 wide square in the dice art): the shine is clipped to the same rounded shape
const DICE_SHINE_MS = 550; // the shine that sweeps over a die when it stops and shows its number (the same speed as the button shine)
const DICE_SHINE_STAGGER_MS = 120; // with two dice (Gambler) the second one's shine starts this much later
const DICE_ART_DEFAULT = "bully"; // a die thrown for nobody in particular (should not happen) uses this character's design
const PERCENT_FULL = 100; // (for sizes and positions given in percent)
const DIE_FACES = 6; // sides of a normal die...
const DIE_FACE_LIST = [1, 2, 3, 4, 5, 6]; // ...and its faces (used for the Oracle's call and the Struggler's failure numbers)
const BONUS_FACE = 6; // rolling this gives another turn (for the characters who get a bonus roll)
const BULLY_RANGE = 6; // the Bully may push / pull players up to this many squares ahead
const GAMBLER_EXACT_WINDOW = 4; // the Gambler is "near the end" when fewer than this many squares from the finish (then an exact number is needed)
const ORACLE_BONUS_DIE = [1, 3]; // the Oracle's bonus die for a right call gives this much (min, max)
const CAT_KNOCKDOWN = 10; // the cat knocks a player down this many squares
const CAT_BONUS_PER_HIT = 3; // the cat owner gains this much on her next roll for every player knocked down
const ENERGY_DRINK_BONUS = 3; // an energy drink adds this to the next roll
const BRICK_PENALTY = 3; // stepping on a toy brick takes this off the next roll
const CHARMER_ROW_REACH = 1; // the Snake Charmer can move snake heads on her own row and this many rows above / below
const ITEM_START_ROWS = 5; // new items are a little more likely on rows below this (near the start)...
const ITEM_START_WEIGHT = 1.25; // ...by this factor (1 = no difference)
const ITEM_NEAR_BOOST = 0.6; // items are more likely near the last player: up to this much extra weight...
const ITEM_NEAR_SQUARES = 30; // ...fading to nothing at this many squares away
const FIRST_ITEM_SQUARE = 2,
  LAST_ITEM_SQUARE = SQUARES - 1; // items never appear on the first or last square
const LAND_TOCK_DELAY_MS = 270; // the "tock" sound of a pawn landing is delayed this long
const TRAP_YELP_DELAY_MS = 150; // delay before a character yelps after stepping on a toy brick
const RECONNECT_DEFAULT_MS = 5000; // how long the game waits for a dropped player when no other time is set
const CRASH_LIMIT = 3; // after this many errors in a row the game stops and tells the players
const CRASH_PAUSE_MS = 800; // short pause after an error before the next try
// ---- Title screen, lobby and character-pick screens (title.js, local.js): sizes and animation times ----
const BUTTON_ART_H = 165; // height of the big green title buttons in their own art units; smaller buttons are scaled from this
// ---- Chat speech bubbles on the pawns (js/bubbles.js). Sizes are in stage pixels, times in milliseconds.
const CHAT_BUBBLE = {
  showMs: 1500, // how long the newest message of a player stays on screen
  endFadeMs: 250, // ...it fades out during the last bit of that time
  pushedFadeMs: 500, // when the same player chats again, the older bubble is pushed away and vanishes in this time (even if its own time was not up)
  fontPx: 32, // text size of a normal (one line) bubble
  lineEm: 1.1, // line height as a multiple of the text size
  pad: 14, // space between the text and the border, the same on all sides (a one-line pill gets a little more at the left / right, see padPillMul)
  padPillMul: 1.6, // a one-line pill: the left / right space is this many times "pad"
  border: 5, // thickness of the brown outline
  shadow: 5, // how far the brown outline is offset downwards (like the light panels)
  stretchMaxW: 620, // a message up to this wide stays on ONE line and the bubble just stretches...
  rectFontScale: 0.8, // ...a longer one gets a smaller text (this share of the normal size)...
  rectMaxW: 440, // ...wrapped into lines no wider than this, in a rectangle with small rounded corners
  rectRadius: 16, // the rectangle's corner roundness
  tailLen: 22,
  tailW: 30, // the little pointer towards the pawn: its length and the width of its base
  tailGap: 4, // empty space between the pointer's tip and the pawn
  stackGap: 12, // space between a bubble and the older one pushed above (or below) it
  edgeMargin: 8, // a bubble never comes closer than this to the edge of the board
  easeMs: 90, // how quickly an older bubble glides to its new place (smaller = quicker)
  popMs: 140, // the little pop when a bubble appears
  fill: "#ebffad",
  ink: "#2f2504", // light lime fill; brown outline and text
};
const ROOM_URL_PREFIX = "?room="; // how an invite link carries the room code in the page address (also used to keep that address in step with the room we are really in)
const NEW_LOBBY_REPEATS = 3; // the host announces the new lobby this many times (a message can get lost on a slow connection; a repeat is ignored by anybody who already follows)
const NEW_LOBBY_FLUSH_MS = 400; // the host waits this long after announcing the new lobby, so the message reaches everybody before the old room closes
const NEW_LOBBY_TRIES = 14,
  NEW_LOBBY_RETRY_MS = 1200; // a guest following the host to the new lobby tries this many times, this far apart, until the new room is up
const QUIT_RELOAD_MS = 250; // after telling the others, a quitting player waits this long before the page reloads to the title screen
const GB_TEXT_SIZE = 70.9,
  GB_ICON_GAP = 14,
  GB_SIDE_ROOM = 60; // button text size, gap after an icon, and room left and right of the text (art units)
const GB_MIN_SHRINK = 0.4; // button text is never squeezed below this share of its size
const GB_MIN_WIDTH = 174; // a button is never narrower than this (art units): its two corners need the room
const GLIDE_SAFETY_MS = 100; // extra wait after a gliding animation so a hidden tab can never freeze the screen
const POP_MS = { in: 450, out: 280 },
  POP_SAFETY_MS = 600; // a panel popping in / out, and its safety wait
const POP_BACK = [-40, 0],
  POP_CARD = [0, 70]; // how far the Back button and the card move while popping
const TITLE_MS = {
  btnExit: 320,
  btnExitStagger: 50, // the title buttons slide off one after another
  logoExit: 380, // the logo slides up off the top
  toTitleSpot: 700, // the pressed button travels to the title spot at the top left
  bounce: 650, // buttons springing back into place
  btnReturnDelay: 250,
  btnReturnStagger: 110, // buttons return one after another
  logoReturn: 800,
  logoReturnDelay: 200, // the logo drops back from the top
  homeSettle: 1050, // pause after everything is back on the home screen
  rowOut: 320,
  rowIn: 650, // lobby rows sliding out / in
  rowStaggerIn: 120,
  rowStaggerOut: 60, // delay between rows
  playExit: 320,
  playExitDelay: 180,
  playExitX: -700, // the PLAY title leaves last
  playReturnDelay: 150, // ...and returns first
  lobbySettle: 1150, // pause after the lobby rows are back
  homeTail: 0.9,
  homeSafety: 300, // safety net timing after the home animation (seconds + ms)
};
const BANNER_HIDE_MS = 2500; // a notice on the title screen disappears after this long
const REJOIN_TITLE_WAIT_MS = 2000; // the title waits this long for a returning player to get back into a game before showing itself
const LOBBY_SLIDE_MS = { in: 380, out: 260 }; // lobby items sliding in / out
const LOBBY_SLIDE_DX = 160; // ...from this far to the side
const LOBBY_STAGGER = { in: 60, out: 50 }; // delay between lobby items
const LOBBY_SLIDE_TIMEOUT_MS = { in: 1200, out: 900 }; // safety waits
const NEED_FLASH_MS = 1500; // players who have not picked a character flash this long
const BTN_H = { badge: 99, field: 95, start: 110, close: 74 }; // heights of lobby buttons (art units)
const BTN_MIN_W = { badge: 112, start: 235, close: 74 },
  PICK_BTN_MAX_W = 378,
  PICK_ICON_MAX_W = 70; // widths of lobby buttons
const CODE_BOX_W = 232,
  CODE_LONG_LEN = 6,
  CODE_MAX_FONT = 56,
  CODE_FONT_PAD = 4,
  CODE_CHAR_WIDTH = 0.6; // the join-code box: width, length from which the font shrinks, biggest font, padding, character width share
const JOIN_CODE_MAX_CHARS = 13; // most characters accepted in the join box
const TIP = { gapSide: 18, gapBelow: 12, above: 64, height: 52, ms: 2300 }; // little pointer notes: distances and how long they stay
const PICK_SCREEN_FILL = 0.88; // the character-pick panels use this share of the window height at most
const PICK_MS = {
  dim: 150,
  dimOpacity: 0.5,
  in: 280,
  inStagger: 55,
  out: 110,
  outStagger: 14,
  shine: 220,
  choose: 130,
}; // character-pick animations
// ---- Sound (audio.js) ----
const DEFAULT_VOLUME = 7,
  DEFAULT_MUSIC_VOL = 5; // starting volumes (0-10) for sound effects and music
const VOLUME_STEP_PERCENT = 10; // one volume step is this many percent
const VOICE_STALE_S = 0.5; // a sound that should have ended this long ago no longer blocks the sound channel
const WRAP_RATE = { min: 1.5, max: 8 }; // a cut-off sound plays out at this speed range
const MIN_VOICE_S = { start: 0.01, left: 0.02 }; // smallest sound lengths the sound code accepts
const SONG_HISTORY_MAX = 30; // songs remembered for the "previous song" button
// ---- Prompt scenes (prompts.js): the full-body character and the light panel that appear over the darkened board ----
const FULL_ART = {
  // full-body picture of every character (file in assets/, and its size in its own units: drawn 1:1)
  bully: { file: "full_bully.svg", w: 450.77, h: 827.6 },
  gambler: { file: "full_gambler.svg", w: 365.88, h: 852.97 },
  cat: { file: "full_catlady.svg", w: 474.2, h: 778.4 },
  struggler: { file: "full_struggler.svg", w: 269.07, h: 781.02 },
  oracle: { file: "full_oracle.svg", w: 315.16, h: 750.06 },
  charmer: { file: "full_charmer.svg", w: 231.4, h: 823.78 },
};
const PROMPT_SCENE = {
  charCenterX: 348,
  charBottom: 956, // the character stands with its centre at this x and its feet at this y (stage pixels)
  panelCenterX: 810,
  panelCenterY: 610,
  panelWidth: 660, // the light panel: centre of its middle and its width
  rollCenterX: 860, // while rolling, the dice and the ROLL button are centred on this x (right of the character)
  panelPadX: 30,
  panelBorder: 6, // the light panel's side padding and border (must match "#scenePanel" in css/style.css): they decide how wide a button inside it may get
  closeGraceMs: 40, // a closing scene waits this long, so a prompt that follows straight after reuses it without flicker
};
const CHARMER_CHOICE = { move: "move", item: "item", roll: "roll" }; // what the Snake Charmer's prompt hands back to the game for each of its three buttons
const CHARMER_FULL_OPTIONS = 3; // the Snake Charmer's prompt has this many buttons when she holds an item (move / use item / just roll); without an item it has one less
const ROLL_SCENE_X = PROMPT_SCENE.rollCenterX; // (short name used by the dice code)
const PROMPT_BTN = {
  labelPad: 22, // space kept free left and right of a label inside a button (long labels shrink to stay inside)
  widePad: 46, // a button made wider to fit its label (e.g. PLAY AGAIN) gets this much space left and right of the label                    // the orange prompt buttons (assets/button_prompt_long.svg / _short.svg): size, and how tall the lit "face" is (the rest is the dark-red base)
  long: { file: "button_prompt_long.svg", w: 225.43, h: 80.4, faceH: 70.59 },
  short: {
    file: "button_prompt_short.svg",
    w: 129.13,
    h: 114.63,
    faceH: 100.64,
  },
  sceneScale: 1, // size of the helper button when it sits in a prompt panel...
  eventScale: 0.72, // ...and when it sits in the Current Event panel
  fontLong: 54,
  fontShort: 80, // biggest label size (Blustrue) on a long / short button
  cornerR: 10,
  baseColor: "#930934",
  faceColor: "#ff7529", // the drawing of a stretched button: corner roundness, dark-red base colour, orange face colour (copied from the art)
  wideMax:
    PROMPT_SCENE.panelWidth -
    2 * (PROMPT_SCENE.panelPadX + PROMPT_SCENE.panelBorder), // a wide button (PLAY AGAIN, "Waiting for the host...") never gets wider than the room inside the panel: a longer label shrinks instead
  labelWidth: 0.52, // average width of a label character as a share of the font size (used to shrink long labels)
};
// ---- Maths helpers ----
const GEOM_EPS = 1e-9; // "close enough to zero" for line-crossing maths
const POINT_EPS = 1e-6; // two points closer than this are the same point

// ---- Roll overlay: while a player rolls, the board area becomes the dice tray. TRAY = its position on screen; DICE_AREA = where dice may roll (relative to the tray's top-left) ----
const TRAY = { x: 8, y: 8, w: 1276, h: 1064 };
const DICE_AREA = { x1: 70, y1: 70, x2: 1206, y2: 994 }; // dice stay inside this rectangle
const DICE_GAP = 116; // dice are never allowed closer than this (centre to centre), so they cannot overlap
const DICE_SIZE = 90; // drawn size of a die (a 3D cube) in pixels
const DICE_IDLE_Y = 430; // height where waiting dice sit and spin. They are centred above the ROLL button: one die in the middle, two dice side by side (DICE_GAP apart)
const DICE_REST_Y = 520; // after a roll the dice glide to this height (centre of the board) so the result is in plain view

// ---- Items (see the Items section of rules.js). file = art in assets/, w/h = art size (used to fit it in slots and on tiles) ----
const ITEMS = {
  stick: { name: "Stick", file: "item_stick.svg", w: 64.16, h: 74.04 },
  brick: { name: "Toy brick", file: "item_toy_brick.svg", w: 84.66, h: 61.72 },
  drink: {
    name: "Energy drink",
    file: "item_energy_drink.svg",
    w: 66.48,
    h: 81.67,
  },
  stone: { name: "Stone", file: "item_stone.svg", w: 77.28, h: 50.04 },
};
const ITEM_START = 6; // how many items are lying on the board when a game starts
const ITEM_EVERY = 3; // a new item appears every this-many turns
const ITEM_MAX = 3; // most items a player can hold
const BROWN = "#2f2504"; // the dark brown used for outlines (ladder border)
const ITEM_BOARD_SCALE = { drink: 1.3, brick: 1.3 }; // items lying on the board are drawn this many times bigger than the default (others = 1)

// ---- Small helper functions used everywhere ----
const $ = (id) => document.getElementById(id); // $("log") = find the page element with id "log"
const d6 = () => 1 + Math.floor(Math.random() * 6); // roll one six-sided die (returns 1-6)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1)); // random whole number from a to b (both included)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); // wait for ms milliseconds (used as: await sleep(300))
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]; // choose one random item from a list (used for flavour text)
const f1 = (v) => v.toFixed(1); // round a number to 1 decimal (keeps drawing code short)
const cl = (v, a, b) => Math.max(a, Math.min(b, v)); // clamp: keep v between a and b
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c],
  ); // make player-typed names safe to show

// ---- The two big pieces of live data ----
var G = null; // G = the running GAME (players, snakes, ladders, cat...). null until Start is pressed.
var S = {
  n: 2,
  rows: [],
  msg: "",
  pick: null,
  mode: "local",
  netState: "idle",
}; // S = the SETUP screen state (mode: "local"|"online", netState: "idle"|"hosting"|"joining"|"lobby")

// ---- The board log (right side). log("text") adds one line; HTML like <b> is allowed ----
function log(t) {
  const l = $("log");
  if (l) {
    l.insertAdjacentHTML("beforeend", `<div>${t}</div>`);
    l.scrollTop = l.scrollHeight;
  } // keep the newest line in view
  const big = $("biglog"); // if the log is open in the big pop-up, add the line there too
  if (big) {
    big.insertAdjacentHTML("beforeend", `<div>${t}</div>`);
    big.scrollTop = big.scrollHeight;
  }
  if (typeof NET !== "undefined" && NET.active && NET.isHost) {
    broadcast({ type: "LOG_LINE", html: t });
  }
}
