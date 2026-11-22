// =====================================================================================
//  config.js  -  THE FILE TO EDIT FOR SMALL CHANGES
//  Rules numbers, character descriptions, colours and screen positions all live here.
//  (Every .js file is loaded by index.html in this order: config, board, art, render, input, rules, main.)
// =====================================================================================

// ---- Game settings you can change ----
const CONFIG = {
  LADDERS: 9,         // how many ladders each board gets
  SNAKES: 9,          // how many snakes each board gets (at most 1 more than the number of ordinary snake heads in manifest.json: the cobra + one head each)
  MIN_PLAYERS: 2,     // fewest players allowed on the setup screen
  MAX_PLAYERS: 6,     // most players allowed (the layout has room for 6 panels)
  STEP_MS: 350,       // pause (milliseconds) after every piece movement so you can follow what happened
  RECONNECT_MS: 5000  // online: how long a disconnected player's turn waits for them to come back before it is skipped
};

// ---- Sounds. file = path inside assets/. skip = seconds of leading silence to cut so the sound lands exactly on the action.
//   volume = 0..1 (optional). Change which sound a name uses by editing "file" here; the events that use each name are in audio.js / rules.js / input.js.
const SOUNDS = {
  small: { file: "sounds/button_sound_small.mp3",    skip: 0.028 },   // tabs, expand/close, ROLL, Move for me, picking up a pawn
  press: { file: "sounds/button_sound_medium_1.mp3", skip: 0.120 },   // the big choice buttons in the board log
  tock:  { file: "sounds/button_sound_medium_2.mp3", skip: 0.060 },   // a piece landing / being dropped on a square
  big:   { file: "sounds/button_sound_big.mp3",      skip: 0.045 },   // Start game, winning
  dice:  { file: "sounds/sound_dice_roll.mp3",       skip: 0.028 },   // the dice roll (its last bounce is at ~0.93s, so a roll lasts ROLL_MS = 930)

  // ---- game-event sounds. Several files that share a name + number (snake_1, snake_2...) are ONE group: the game picks one of them at random each time. To add a variation, add a line like stone_3 (same name, next number).
  //   volume evens out the clips so they are about equally loud (it is a multiplier on top of the Settings volume).
  // energy drink used
  drink: { file: "sounds/sound_energy_drink.mp3", skip: 0.064, volume: 0.87 },
  // stick nudges a snake head / the Charmer moves one
  snake_1: { file: "sounds/sound_snake_1.mp3", skip: 0.070, volume: 0.64 },
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
  bad_bully_1: { file: "sounds/sound_bully_bad_1.mp3", skip: 0.081, volume: 0.77 },
  bad_gambler_1: { file: "sounds/sound_gambler_bad_1.mp3", skip: 0.077, volume: 1.16 },
  bad_cat_1: { file: "sounds/sound_catlady_bad_1.mp3", skip: 0.081, volume: 0.89 },
  bad_cat_2: { file: "sounds/sound_catlady_bad_2.mp3", skip: 0.046, volume: 0.91 },
  bad_cat_3: { file: "sounds/sound_catlady_bad_3.mp3", skip: 0.050, volume: 0.84 },
  bad_struggler_1: { file: "sounds/sound_struggler_bad_1.mp3", skip: 0.085, volume: 1.88 },
  bad_struggler_2: { file: "sounds/sound_struggler_bad_2.mp3", skip: 0.070, volume: 1.15 },
  bad_struggler_3: { file: "sounds/sound_struggler_bad_3.mp3", skip: 0.074, volume: 2.0 },
  bad_oracle_1: { file: "sounds/sound_oracle_bad_1.mp3", skip: 0.086, volume: 1.06 },
  bad_oracle_2: { file: "sounds/sound_oracle_bad_2.mp3", skip: 0.058, volume: 0.99 },
  bad_oracle_3: { file: "sounds/sound_oracle_bad_3.mp3", skip: 0.055, volume: 0.9 },
  bad_charmer_1: { file: "sounds/sound_charmer_bad_1.mp3", skip: 0.028, volume: 0.69 },
  bad_charmer_2: { file: "sounds/sound_charmer_bad_2.mp3", skip: 0.061, volume: 2.6 },
  bad_charmer_3: { file: "sounds/sound_charmer_bad_3.mp3", skip: 0.037, volume: 0.93 },
  // the Bully nudges someone 1 square (2 variations)
  bully_nudge_1: { file: "sounds/sound_bully_nudge_1.mp3", skip: 0.106, volume: 1.05 },
  bully_nudge_2: { file: "sounds/sound_bully_nudge_2.mp3", skip: 0.083, volume: 1.25 },
  // HAPPY sounds: a ladder is climbed, an item is picked up, a 6 is rolled (not if it ends on a snake), the Struggler survives a forced effect
  happy_bully_1: { file: "sounds/sound_bully_happy_1.mp3", skip: 0.068, volume: 2.85 },
  happy_cat_1: { file: "sounds/sound_catlady_happy_1.mp3", skip: 0.109, volume: 0.99 },
  happy_charmer_1: { file: "sounds/sound_charmer_happy_1.mp3", skip: 0.072, volume: 1.25 },
  happy_gambler_1: { file: "sounds/sound_gambler_happy_1.mp3", skip: 0.116, volume: 0.65 },
  happy_oracle_1: { file: "sounds/sound_oracle_happy_1.mp3", skip: 0.056, volume: 0.94 },
  happy_struggler_1: { file: "sounds/sound_struggler_happy_1.mp3", skip: 0.062, volume: 0.82 }
};
const CAT_CLICK_COOLDOWN = 1500;   // milliseconds: clicking the cat makes its sound at most this often (the picture still changes on every click)
const STONE_BAD_DELAY = 450;   // milliseconds between a stone hitting a pawn and the victim's "bad" reaction sound (so the reaction comes after the impact sound)
const ROLL_MS = 930;   // how long a dice roll animation lasts (milliseconds). Matches the dice sound so the dice stop with the last rattle.

const LIME = "#c3f73a";   // the bright lime used by the art (taken from tile_dark.svg). Used for the active-turn ring and tile highlights.

// ---- The six characters. "id" is used by the code, "name" is shown on screen, "text" is shown on the setup screen and in the Rulebook ----
const CHARACTERS = [
  { id: "bully",     name: "Bully",         text: "Land exactly on a player with your own roll: roll a die and push or pull them that many squares (choose before rolling). Pass over a player: nudge them 1 square forward or back. A 6 gives another turn." },
  { id: "gambler",   name: "Gambler",       text: "Rolls 2 dice and moves the total. A 1 on either die sends him back by the other die (double 1s: stay put). Only double 6s give another turn. Past 100 he bounces back; from 97-99 either die must show the exact number needed." },
  { id: "cat",       name: "The One with the Cat", text: "Goes last, then rolls for the cat, which wraps around the board and ignores snakes, ladders and items. Players the cat jumps over: -1 on their next roll. Players it lands on are knocked down 10 squares and give her +3 on her next roll each (an overshoot loses it)." },
  { id: "struggler", name: "Struggler",     text: "Every forced effect (snakes, pushes, the cat) gets a die roll: even dodges, odd hits. At a ladder, pick two failure numbers first: roll one of them and he does not climb. A 6 gives another turn." },
  { id: "oracle",    name: "Oracle",        text: "Calls a number from 1-6 before rolling. A right call adds a 3-sided bonus die to the move, and snakes cannot bite on that move. A wrong call costs nothing. A 6 gives another turn." },
  { id: "charmer",   name: "Snake Charmer", text: "Always goes first. Before rolling, may move the head of a snake on her row, or the row above or below, to another free square on that row, then must recharge for a turn. Players already on that square are safe. Never gets an extra turn, even on a 6." }
];

// Which portrait file belongs to which character (files live in assets/). These are also the pawns on the board.
const PORT = { bully: "head_bully", gambler: "head_gambler", cat: "head_catlady", struggler: "head_struggler", oracle: "head_oracle", charmer: "head_charmer" };

// Short info shown on the character pick panels (most important first). <b>..</b> highlights the key words. Full rules: CHARACTER_RULES in rulebook.js.
const CHARACTER_BRIEF = {
  bully: { tag: "Push, pull, nudge", pts: ["<b>Land on a player:</b> roll a die and push or pull them that many squares (choose before rolling).", "<b>Pass over a player:</b> nudge them 1 square forward or back.", "Works on your own roll, before snakes and ladders.", "A 6 gives another turn."] },
  gambler: { tag: "Two dice, big risks", pts: ["Rolls <b>2 dice</b> and moves the total.", "A <b>1</b> on either die sends you back by the other die. Double 1s: stay put.", "Extra turn only on <b>double 6s</b>.", "Past 100 you <b>bounce back</b>. From 97-99 either die must show the exact number."] },
  cat: { tag: "A cat on the loose", pts: ["Goes <b>last</b>, then rolls for the <b>cat</b>, which wraps around the board.", "Players the cat jumps over: <b>-1</b> on their next roll.", "A player it lands on is knocked down <b>10 squares</b>; you get <b>+3</b> on your next roll for each.", "The cat ignores snakes, ladders and items."] },
  struggler: { tag: "Dodges, mostly", pts: ["Anything forced (snakes, pushes, the cat): roll a die. <b>Even dodges</b>, odd hits.", "Ladders: pick <b>2 failure numbers</b>, then roll. Hit one and you do not climb.", "Items work normally.", "A 6 gives another turn."] },
  oracle: { tag: "Calls the roll", pts: ["<b>Call a number</b> (1-6) before rolling.", "Right call: add a <b>d3 bonus</b>, and snakes cannot bite on that move.", "A wrong call costs nothing.", "A 6 gives another turn."] },
  charmer: { tag: "Moves snake heads", pts: ["Always goes <b>first</b>.", "Before rolling, drag a <b>snake head</b> on your row (or one row above or below) to another free square, then recharge for a turn.", "Players already on that square are safe.", "<b>Never</b> gets an extra turn, even on a 6."] }
};

// Player colours (player 1 first). Each pawn gets a disc of its player's colour behind the face.
const COLORS = ["#d64545", "#3b82c4", "#e0a82e", "#8b5cc7", "#2f9e8f", "#e07a2e", "#c44a96", "#6b7280"];

// ---- Screen layout numbers (the screen is a fixed 1920x1080 canvas). NEW LAYOUT:
//      LEFT = the board (a big container) | RIGHT = player panels (top), the brown Settings / Chat / Info box, and the round tab buttons (bottom right) ----
const BOXES = [                                   // the container drawn behind the board (container_red.svg, 9-slice stretched; its thin frame width is set in .box in style.css)
  { id: "boxM", x: 8, y: 8, w: 1276, h: 1064 }
];
const BOARD_BOX = { x: 8, y: 8, w: 1276, h: 1064 };   // the board SVG / canvases cover the whole container (stage coordinates). The roll overlay (#tray) covers the same area.
// Tiles are RECTANGULAR now (wider than tall): the tile art (tile_dark.svg / tile_light.svg) is 113.48 x 95.54 with a 86.52-high top face and a ~9-high edge underneath.
const TW = 120;                 // drawn width of one tile (pixels)
const TK = TW / 113.48;         // scale from the tile SVG's own size to its drawn size (1.0575): every tile is drawn at exactly this scale
const TH = 86.52 * TK;          // drawn height of the TOP FACE of a tile (about 91.5). Pawns, numbers and highlights are centred on / fitted to the face.
const CX = 126;                 // horizontal distance between the left edges of two neighbouring tiles (tile width + a small gap)
const CY = 105;                 // vertical distance between the tops of two neighbouring tiles (face + edge + a small gap)
const BX0 = 19;                 // left edge of the first board column
const BY0 = 16;                 // top edge of the first board row
const BS = 1.1;                 // BS = "board scale": everything drawn on the board (snakes, pawns, items) is sized relative to this
// ---- Player panels (right side). ONE panel art (assets/player_panel.svg, 510 x 220.89) is used for every panel and drawn at two sizes:
//      the ACTIVE player is big on top, everyone else is small and sits in a ring below, see panelSlot() in render.js. All numbers below are measured from the art (panel units). ----
const PANEL = { w: 510, h: 220.89,
  field: { x: 214.27, y: 40.18, w: 279.4, h: 59.88 },                       // the dark name box
  portrait: { cx: 105.44, cy: 108, size: 200 },                              // the round portrait area (the head may stick out of the circle a little)
  slots: [{ x: 214.27, y: 110.84, w: 59.88, h: 59.88 }, { x: 287.45, y: 110.84, w: 59.88, h: 59.88 }, { x: 360.63, y: 110.84, w: 59.88, h: 59.88 }],   // the 3 item slots
  counter: { x: 433.8, y: 110.84, w: 59.88, h: 59.88 } };                    // the 4th square: the buff / debuff number
const PANEL_ZONE = { bigX: 1329, bigY: 16, bigScale: 1.07,                   // the big (active) panel: top-left corner and size (1.07 x the art)
  smallScale: 0.51, colL: 1330, colR: 1615, midX: 1472, rowY: 268, rowPitch: 124 };   // small panels: size, left column x, right column x, centred x, first row y, distance between rows
const COUNTER_ORANGE = "#ff7529", COUNTER_BLUE = "#1b84b8", COUNTER_BROWN = "#2f2504";   // buff (positive) / debuff (negative) / zero colours of the number square
// ---- The brown box on the right that shows Settings, Chat or Info (one at a time) and the strip of round tab buttons below it ----
const SIDEBOX = { x: 1318, y: 652, w: 590, h: 336 };
const DOCK = { x: 1506, y: 1000, pitch: 80 };           // x of the first tab button (dock strip starts here), y of the buttons' strip, distance between buttons
// ---- Roll overlay: while a player rolls, the board area becomes the dice tray. TRAY = its position on screen; DICE_AREA = where dice may roll (relative to the tray's top-left) ----
const TRAY = { x: 8, y: 8, w: 1276, h: 1064 };
const DICE_AREA = { x1: 70, y1: 70, x2: 1206, y2: 994 };   // dice stay inside this rectangle
const DICE_GAP = 116;                                       // dice are never allowed closer than this (centre to centre), so they cannot overlap
const DICE_SIZE = 90;                                       // drawn size of a die (a 3D cube) in pixels
const DICE_IDLE = [[696, 430], [580, 430]];                // where waiting dice sit and spin (one or two dice), just above the ROLL button
const DICE_REST_Y = 520;                                    // after a roll the dice glide to this height (centre of the board) so the result is in plain view

// ---- Items (see the Items section of rules.js). file = art in assets/, w/h = art size (used to fit it in slots and on tiles) ----
const ITEMS = {
  stick: { name: "Stick",       file: "item_stick.svg",        w: 64.16, h: 74.04 },
  brick: { name: "Toy brick",   file: "item_toy_brick.svg",    w: 84.66, h: 61.72 },
  drink: { name: "Energy drink", file: "item_energy_drink.svg", w: 66.48, h: 81.67 },
  stone: { name: "Stone",       file: "item_stone.svg",        w: 77.28, h: 50.04 }
};
const ITEM_START = 6;        // how many items are lying on the board when a game starts
const ITEM_EVERY = 3;        // a new item appears every this-many turns
const ITEM_MAX = 3;          // most items a player can hold
const BROWN = "#2f2504";     // the dark brown used for outlines (ladder border)
const ITEM_BOARD_SCALE = { drink: 1.3, brick: 1.3 };   // items lying on the board are drawn this many times bigger than the default (others = 1)

// ---- Small helper functions used everywhere ----
const $ = id => document.getElementById(id);                         // $("log") = find the page element with id "log"
const d6 = () => 1 + Math.floor(Math.random() * 6);                  // roll one six-sided die (returns 1-6)
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));   // random whole number from a to b (both included)
const sleep = ms => new Promise(r => setTimeout(r, ms));             // wait for ms milliseconds (used as: await sleep(300))
const pick = arr => arr[Math.floor(Math.random() * arr.length)];     // choose one random item from a list (used for flavour text)
const f1 = v => v.toFixed(1);                                        // round a number to 1 decimal (keeps drawing code short)
const cl = (v, a, b) => Math.max(a, Math.min(b, v));                 // clamp: keep v between a and b
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));   // make player-typed names safe to show

// ---- The two big pieces of live data ----
var G = null;                                  // G = the running GAME (players, snakes, ladders, cat...). null until Start is pressed.
var S = { n: 2, rows: [], msg: "", pick: null, mode: "local", netState: "idle" };   // S = the SETUP screen state (mode: "local"|"online", netState: "idle"|"hosting"|"joining"|"lobby")

// ---- The board log (right side). log("text") adds one line; HTML like <b> is allowed ----
function log(t) {
  const l = $("log");
  if (l) { l.insertAdjacentHTML("beforeend", `<div>${t}</div>`); l.scrollTop = l.scrollHeight; }   // keep the newest line in view
  const big = $("biglog");        // if the log is open in the big pop-up, add the line there too
  if (big) { big.insertAdjacentHTML("beforeend", `<div>${t}</div>`); big.scrollTop = big.scrollHeight; }
  if (typeof NET !== "undefined" && NET.active && NET.isHost) {
    broadcast({ type: "LOG_LINE", html: t });
  }
}
