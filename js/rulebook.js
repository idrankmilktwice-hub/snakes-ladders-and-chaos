// =====================================================================================
//  rulebook.js  -  the text of the Rulebook tab (and its Expand pop-up). Keep it in step with RULES.txt.
//  RULES_HTML() returns the finished HTML; numbers (players, snakes, items...) are read from config.js so they can never go out of date.
//  The look of it (headings, bullets, table, note box) is the ".rb" section of css/style.css.
// =====================================================================================

// ul(list): a bullet list from an array of HTML strings.
const ul = (list) =>
  "<ul>" + list.map((x) => `<li>${x}</li>`).join("") + "</ul>";
// k(text): highlights a key word (cream colour).
const k = (t) => `<span class="k">${t}</span>`;

// Who gets another turn after rolling a 6: [character, yes/no, note]
const BONUS_ROLL = [
  ["Bully", 1, "on a 6"],
  ["Struggler", 1, "on a 6"],
  ["Oracle", 1, "on a 6, right call or wrong"],
  ["Cat owner", 1, "for her own roll; the CAT also rolls again on its own 6"],
  ["Gambler", 0, "only on double 6s"],
  ["Snake Charmer", 0, "never, not even on a 6"],
];

// The detailed rules of every character, in the same order as CHARACTERS in config.js.
const CHARACTER_RULES = {
  bully: [
    "Before rolling: if another player is within 6 squares ahead, choose " +
      k("PUSH or PULL") +
      ". If nobody is, you are not asked.",
    k("Passing over") +
      " a player: for each one, nudge them forward 1 or back 1 (never below square 1).",
    k("Landing exactly") +
      " on a player: roll a die and push (or pull) them that many squares, in the direction you chose. A push past 100 does nothing. If two players share the square, pick one.",
    "The power works where you LAND with your own roll, before any snake or ladder. If a snake swallows you onto a tail with a player on it, it does NOT go off.",
    "A 6 gives another turn.",
  ],
  gambler: [
    "Rolls " +
      k("TWO dice") +
      " and moves the total (plus or minus any buff/debuff).",
    "If either die shows a " +
      k("1") +
      ", the gamble backfires: go BACK by the other die (never below 1) and the turn ends. Double 1s (snake eyes): stay put.",
    "No bonus roll for a single 6, only for " + k("double 6s") + ".",
    "Past 100 he " + k("stays put") + ", like everybody else (no bouncing back).",
    k("The finish:") +
      " from 97, 98 or 99 the total no longer counts. EITHER die must show the exact number needed (on 99, a 1 wins). If not, he stays - but a 1 still sends him back by the other die (double 1s: stay). From 96 and below the normal rule applies (an exact total of 100 wins; past 100 he stays).",
  ],
  cat: [
    "Her own turn is a plain roll (a 6 gives another turn). She goes " +
      k("LAST") +
      " in the turn order.",
    "Then the " +
      k("CAT") +
      " takes a turn: roll a die for it. It moves forward that many squares and " +
      k("wraps around") +
      " the board (past 100 it carries on from 1; exactly 100 sends it to 1). It rolls again on a 6.",
    "The cat ignores snakes, ladders and items, and cannot win. Items cannot be used on it or against it.",
    "Players the cat " +
      k("jumps over") +
      " are infatuated: -1 on their next roll.",
    "A player the cat " +
      k("lands on") +
      " is knocked down 10 squares (to square 1 if on 10 or below), then takes any snake or ladder there. Each player actually knocked down gives the owner " +
      k("+3") +
      " on her next roll (a Struggler who dodges doesn't count). If that roll overshoots 100, the bonus is lost.",
    "Click the cat any time to change its picture (you hear it meow, nobody else does). It also changes whenever the cat moves.",
  ],
  struggler: [
    "Plain roll; a 6 gives another turn.",
    "Every time something forced happens to him he rolls a die: " +
      k("EVEN = dodge, ODD = it hits him") +
      ". This covers snakes (even: he wriggles free and stays on the head), Bully pushes/pulls/nudges, cat knock-downs and cat infatuation.",
    k("Ladders work the other way round:") +
      " first he picks TWO failure numbers (1-6), then rolls. On one of them he does NOT climb; on any other number he climbs.",
    "Items work on him normally and never trigger his dodge.",
  ],
  oracle: [
    "Before rolling she " + k("calls a number") + " from 1 to 6.",
    "If the roll matches, she rolls a " +
      k("3-sided bonus die") +
      " and adds it to her move, and snakes cannot bite her on that move (ladders still work). A wrong call costs nothing.",
    "If the boosted move would go past 100 she stays put.",
    "A 6 gives another turn, right call or wrong.",
  ],
  charmer: [
    "Always goes " + k("FIRST") + " in every round.",
    "Before rolling she may drag the " +
      k("head of one snake") +
      " on her row, or the row above or below, to another free square on that same row. The square must be above the snake's tail and not used by any snake or ladder. The tail stays put; the body follows. Players already standing on the new head square are safe; only later arrivals are bitten.",
    'After moving a head she must wait one turn ("recharging"). She can always choose "Just roll" instead.',
    "No bonus roll on a 6, ever.",
  ],
};

// The four items: [name, what it does]
const ITEM_RULES = [
  [
    "Stick",
    "Nudge ANY snake's head 1 square left or right (onto a free square on its row, still above its tail).",
  ],
  [
    "Toy brick",
    "Place it on any free square in your own row or the row above/below (not under a pawn, the cat or another item). The next player to step on it - you included - gets -3 on their next roll, and the brick is used up. Placed bricks glow red. The cat doesn't trigger bricks.",
  ],
  [
    "Energy drink",
    "+3 on your next roll, and your pawn grows a little for the rest of the turn. (Not for the cat.)",
  ],
  [
    "Stone",
    "Throw it at any other player: -1 on their next roll. (Not at the cat.)",
  ],
];

// RULES_HTML(): the whole rulebook as HTML.
const RULES_HTML = () => `<div class="rb">
<p>Throw the die (or press ROLL / Space), then drag your piece to the glowing square. First to land exactly on square 100 wins.</p>
<h2>The basics</h2>${ul([
  `${CONFIG.MIN_PLAYERS} to ${CONFIG.MAX_PLAYERS} players. Every player picks a different character. If two pick the same one they roll a die: the higher roll keeps it and the other picks again.`,
  "100 squares, numbered in a zig-zag (1 bottom-left, 100 top-left). Everyone starts on square 1.",
  `Every game has a random board: ${k(CONFIG.SNAKES + " snakes")} (one is the long cobra) and ${k(CONFIG.LADDERS + " ladders")}.`,
  "Land on the BOTTOM of a ladder to climb to its top. Land on a snake's HEAD to slide down to its tail.",
  "A turn: " +
    k("1)") +
    " use items if you want, " +
    k("2)") +
    " roll, " +
    k("3)") +
    ' drag your pawn to the glowing target square (or press "Move me" / Space). Throw the die by grabbing it, or use ROLL / Space.',
  "You win by landing on 100 " +
    k("EXACTLY") +
    ". If your roll would take you past 100 you stay where you are.",
  "Rolling a " +
    k("6") +
    " gives another turn, except where a character says otherwise.",
  "Turn order: the Snake Charmer first, the cat owner last, everyone else in the order they were added.",
  k("The number square") +
    " at the right end of each player's panel shows the bonus (" +
    k("orange") +
    ") or penalty (" +
    k("blue") +
    ") that is added to that player's NEXT roll and then cleared. Bonuses and penalties add together, so it shows the total (it is brown with a 0 when there is none). A move is never less than 0 squares.",
  "On the right, the player whose turn it is has the big panel on top. The other panels sit below it in a ring and glide round, one place at a time, as the turns pass.",
  "Anyone the game moves (pushed, pulled, nudged, knocked down, slid down a snake, climbed a ladder) takes snakes and ladders on the square they land on, just like a normal move - unless a character says otherwise.",
])}
<h2>Bonus roll on a 6</h2>
<table>${BONUS_ROLL.map((r) => `<tr><td>${r[0]}</td><td class="${r[1] ? "yes" : "no"}">${r[1] ? "Yes" : "No"}</td><td>${r[2]}</td></tr>`).join("")}</table>
<h2>The characters</h2>${CHARACTERS.map((c) => `<h3>${c.name}</h3>${ul(CHARACTER_RULES[c.id] || [c.text])}`).join("")}
<h2>Prompts</h2>${ul([
  "When you have to decide something, the board goes dark " + k("on your screen only") + " and your character steps in from the left. A panel next to them asks the question; press a button to answer.",
  k("Bully:") + " PUSH or PULL, before he rolls (only if somebody is within 6 squares ahead).",
  k("Oracle:") + " predict a number from 1 to 6 before she rolls.",
  k("Struggler:") + " pick two numbers to FAIL the climb when he lands on the bottom of a ladder.",
  "Before you roll (and when you hold items) the character stands next to the dice and the ROLL button. Glowing items on your panel can still be clicked; pressing one clears the board for its animation.",
  "The red " + k("QUIT") + " button (bottom right, next to the other buttons) asks YES or NO. If you quit an online game your panel and pawn are removed, the others see \"<name> abandoned the game\" in the log, and you go back to the title screen.",
  k("When somebody wins,") + " everybody sees the winner's character with " + k("WINNER!") + " and their name, and a PLAY AGAIN button. Players who did not win also get " + k("BOO") + " and " + k("CHEER") + ": they play a sad or happy sound of their own character that " + k("everybody") + " hears (sounds overlap, so spam away). In an online game " + k("PLAY AGAIN") + " takes the host to a new lobby with a new code and moves every connected player into it.",
  "The small " + k("eye button") + " at the top right of the board hides the prompt and the darkness so you can look at the board; press it again to bring the prompt back.",
  "Everybody else just reads the " + k("Current Event") + " panel. While the game waits for YOUR move (or a target), that panel shows the message and a " + k("MOVE ME") + " button.",
])}
<h2>Items</h2>${ul([
  `The game starts with ${ITEM_START} random items on empty squares, and a new one appears every ${ITEM_EVERY} turns. Items never appear on square 1 or 100, under a pawn, the cat or another item, or on a snake head or the bottom of a ladder.`,
  `Step on an item to pick it up. You can hold ${ITEM_MAX}; with full hands you may swap one of yours for the one on the ground, or leave it.`,
  "If an item and a snake head share a tile, you pick the item up before the snake bites.",
  "Use items only BEFORE rolling: click a glowing item, or press Roll / Space to go on without. You can use several. When an item asks for a target, Cancel / Space backs out without spending it.",
  "Items work on every character (they never trigger the Struggler's dodge) and never affect the cat.",
])}${ITEM_RULES.map((i) => `<h3>${i[0]}</h3><p>${i[1]}</p>`).join("")}
<h2>Helpful controls</h2>${ul([
  k("Space bar") +
    ': roll the dice, or press the helper button ("Move me", "Just roll", "Roll", "Cancel").',
  k("Buttons at the bottom right") +
    ": " + k("Settings") + " (Mute, SFX and Music volume from 0 to 10 with the arrows, song controls, and Switch Device in online games), " + k("Rulebook") + ", " + k("Board log") + " (everything that happens, with a bit of flavour text), " + k("Chat") + " (online games) and " + k("Information") + ". Press an open button again to go back to the Current Event panel.",
  "Rulebook, Board log and Information open in a small panel; its " + k("expand button") + " opens the same text in a big window. Close the big window with the X or by clicking outside it.",
  k("Current Event") + " panel: the latest events of the game, newest in big letters, plus the message when it is your turn to act.",
])}
</div>`;
