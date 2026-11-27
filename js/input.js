// =====================================================================================
//  input.js  -  everything the PLAYER does with the mouse/finger:
//    1. the prompt box + choice buttons (floating over the board: a small banner at the top, or a dialog in the middle while the board is darkened)
//    2. drag-and-drop of pawns and snake heads
//    3. the dice: grab, throw, bounce around the rolling board (or just press ROLL)
//    4. clicking the cat to change its picture
//  rules.js calls: ask(), choose(), awaitMove(), rollDice(). Nothing here knows the game rules.
// =====================================================================================

// stagePt(e): mouse position converted to the 1920x1080 stage's own coordinates (works at any window size / zoom).
function stagePt(e) {
  const r = $("stage").getBoundingClientRect();
  return [(e.clientX - r.left) * STAGE_W / r.width, (e.clientY - r.top) * STAGE_H / r.height];
}

// ------------------------------------------------------------------ 1. PROMPT BOX + BUTTONS
// setPrompt(text): show a message in the prompt box (empty text clears it and hides the box) and remove old buttons.
// The box has two looks (css/style.css): a small BANNER at the top of the board (plain messages, the board stays clear), and a DIALOG in the middle of the board
// (CSS class "choice": used while the active player must pick something, hit Roll or throw the dice). The dialog darkens the board behind it - only on the screen of the player who has to act.
function setPrompt(t) {
  $("ptxt").textContent = t; $("evPtxt").textContent = t; $("btns").innerHTML = "";
  $("prompt").classList.remove("choice", "roll"); $("prompt").classList.toggle("has", !!t);   // (#prompt is only used for the game-over box now; plain messages show in the Current Event panel)
  $("evPanel").classList.toggle("prompting", !!t);                                          // the Current Event panel shows the message (and the helper button) instead of the log lines
  if (!t) closeSceneSoon();                                                                 // an empty message ends any prompt scene (see prompts.js)
  updateEvent();                                                                            // (the Current Event panel changes size when a message is shown, so it re-fits its lines)
}
// makeBtn(label, alt): a button drawn with the counter art (see .cbtn in css/style.css). alt = true gives the blue (debuff) version.
function makeBtn(label, alt) {
  const b = document.createElement("button");
  b.className = "cbtn" + (alt ? " alt" : "");
  b.innerHTML = `<span>${label}</span>`;
  return b;
}
// choose(msg, opts, p): show msg with one big button per option. Resolves with the clicked option's value.
// opts are strings or {label, value, alt}. While buttons are showing, the prompt is a dialog in the middle of a darkened board (CSS class "choice").
function choose(msg, opts, p) {
  const actor = p || (G && G.cur);
  if (actor && actor.disconnected) {
    const first = opts[0];
    return Promise.resolve(first ? (first.value ?? first) : 0);
  }
  const curIdx = actor && G ? G.players.indexOf(actor) : 0;
  const isMyTurn = !NET.active || !G || (curIdx === NET.myPlayerIndex);

  // If online and it's someone else's decision, wait for their choice
  if (NET.active && G && actor) {
    if (NET.isHost) {
      broadcast({ type: "WAIT_CHOOSE", playerIndex: curIdx, msg, opts });
    }
    if (!isMyTurn) {
      setPrompt(`${actor.name} is making a choice...`);
      NET.pendingActorIdx = curIdx;
      return new Promise(res => {
        NET.pendingChoiceRes = res;
      });
    }
  }

  // If currently on Chat tab when a choice arrives for us, switch to Board log so buttons are visible
  if (typeof TAB !== "undefined" && TAB === "chat" && typeof showTab === "function") {
    showTab("boardlog");
  }

  return new Promise(res => {
    setPrompt(msg);
    const kind = promptKindOf(msg, opts);                   // bully / oracle / struggler get their own prompt; everything else a plain panel (prompts.js)
    showChoiceScene(actor, kind, msg, opts, val => {
      setPrompt("");
      if (NET.active) sendAction({ type: "CHOOSE", val });
      res(val);
    });
  });
}
// ask(msg, opts, p): like choose(), BUT if there is only ONE option it is picked automatically with no prompt at all.
// (The caller should log a flavour line in that case - see rules.js.)
async function ask(msg, opts, p) {
  if (opts.length === 1) return opts[0].value ?? opts[0];
  return choose(msg, opts, p);
}

// ------------------------------------------------------------------ 2. DRAG AND DROP OF PIECES
// PEND = the move the game is waiting for right now: { pieces:[...], res:function }. null when nothing is pending.
// A "piece" = { key, el, targets:[squares it may land on], ghost:function(x,y)->svg text (snake heads only) }.
let PEND = null;
// DRAG = the piece being held by the mouse right now: { piece, moved }.
let DRAG = null;

// awaitMove({pieces, text, button}): wait until the player drops one of the pieces on one of its allowed squares,
// OR presses the helper button on the rolling board (e.g. "Move for me") OR hits the Space bar. Resolves { key, to } for a drop, or null for the button.
async function awaitMove({ pieces, text, button }) {
  if (G && G.cur && G.cur.disconnected) return null;
  const curIdx = G && G.cur ? G.players.indexOf(G.cur) : 0;
  const isMyTurn = !NET.active || !G || (curIdx === NET.myPlayerIndex);

  if (NET.active && G && G.cur) {
    if (NET.isHost) {
      const isPawn = pieces.length === 1 && pieces[0].key === "pawn";
      broadcast({
        type: "WAIT_MOVE",
        playerIndex: curIdx,
        moveKind: isPawn ? "pawn" : "heads",
        targets: isPawn ? pieces[0].targets : [],
        heads: isPawn ? null : pieces.map(p => ({ h: p.key, targets: p.targets })),
        text,
        button: button ? button.label : null
      });
    }

    if (!isMyTurn) {
      setPrompt(`Waiting for ${G.cur.name} to make their move...`);
      NET.pendingActorIdx = curIdx;
      return new Promise(res => {
        NET.pendingMoveRes = res;
      });
    }
  }

  pieces.forEach(p => { if (p.el) p.el.classList.add("grab"); });
  setPrompt(text); showTab("event"); placeHelper();      // the message + "Move me" button are in the Current Event panel: make sure that panel is the one showing
  const mb = $("moveBtn");
  const pressed = new Promise(res => {
    if (!button) return;                                    // no helper button for this move: only a drop can finish it
    mb.querySelector(".lbl").textContent = button.label; mb.style.display = "block";
    fitHelperButton();                                      // widen the button to fit its label (e.g. "Just roll") with the same side space as the ROLL button
    mb.onclick = () => {
      mb.onclick = null;
      mb.style.display = "none";
      if (NET.active) sendAction({ type: "MOVE", result: null });
      res(null);
    };
  });
  const dropped = new Promise(res => {
    PEND = {
      pieces,
      res: dropRes => {
        if (NET.active) sendAction({ type: "MOVE", result: dropRes });
        res(dropRes);
      }
    };
  });
  const result = await Promise.race([dropped, pressed]);
  mb.style.display = "none"; mb.onclick = null;
  pieces.forEach(p => { if (p.el) p.el.classList.remove("grab"); });
  PEND = null; DRAG = null; setPrompt(""); setHL([]); $("gGhost").innerHTML = ""; $("gHandle").innerHTML = "";
  return result;
}

// Space bar: same as pressing the ROLL button (when the dice are waiting) or the helper button on the rolling board ("Move for me" / "Just roll").
window.addEventListener("keydown", e => {
  if (e.code !== "Space" || e.repeat) return;
  if (/INPUT|TEXTAREA|SELECT/.test((e.target.tagName || ""))) return;   // typing a name: leave Space alone
  if ($("quitBox").style.display === "flex") return;                   // the "Quit?" question is open: Space must not roll or press anything underneath it
  e.preventDefault();
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  if (DICE.waiting && !DICE.flying && DICE.canInteract) { sfx("small"); rollPressed(); }
  else if ($("moveBtn").style.display === "block" && $("moveBtn").onclick) { sfx("small"); $("moveBtn").click(); }
});

// Mouse pressed: grab a piece, throw a die, or click the cat.
window.addEventListener("pointerdown", e => {
  const t = e.target;
  const sl = t.closest && t.closest(".slot.usable");                                // clicking one of your glowing items (item phase)
  if (sl && ITEMWAIT) { e.preventDefault(); const fn = ITEMWAIT.res; ITEMWAIT = null; fn(+sl.dataset.i); return; }
  if (TGT) {                                                                        // choosing a target square for an item
    const [x, y] = stagePt(e), sq = squareAt(x, y);
    if (TGT.targets.includes(sq)) { e.preventDefault(); const fn = TGT.res; TGT = null; fn(sq); return; }
  }
  if (t.closest && t.closest(".cat")) {                                             // 4. clicking the cat changes its picture (any time, any player) and plays the cat's sound only for the player who clicked
    switchCat();                                                                    // (no cool-down and no extra click sound; a game sound that is playing is not interrupted)
    voiceIfFree("cat");
  }
  const die = t.closest && t.closest(".die");
  if (die && DICE.waiting && !DICE.flying && DICE.canInteract) { e.preventDefault(); hideRollText(); dieDown(+die.dataset.i, e); return; }   // 3. grab a die (only on your turn); the "throw the die" heading goes away at once
  const g = t.closest && t.closest(".grab");
  if (!g || !PEND) return;
  const piece = PEND.pieces.find(p => p.el === g);
  if (!piece) return;
  e.preventDefault();
  DRAG = { piece, moved: false };
  sfx("small");                                                                     // picked up
  setHL(piece.targets);                                                             // pulsing lime outlines on every legal square
  if (piece.ghost) { const [x, y] = stagePt(e); $("gGhost").innerHTML = piece.ghost(x, y); }   // snake heads: a copy follows the mouse
  else piece.el.classList.add("drag");                                              // pawns: the pawn itself follows the mouse
  dragTo(e);
});
// Mouse moved: drag the held piece / die along.
window.addEventListener("pointermove", e => { if (DRAG) dragTo(e); if (DD) dieMove(e); });
function dragTo(e) {
  if (!DRAG) return;
  DRAG.moved = true;
  const [x, y] = stagePt(e), p = DRAG.piece;
  if (p.ghost) {
    $("gGhost").innerHTML = p.ghost(x, y);
    sendDragPreview({ kind: "head", h: p.key, x, y, targets: p.targets });
  } else {
    p.el.style.transform = `translate(${f1(x)}px,${f1(y)}px) scale(.95)`;
    sendDragPreview({ kind: "pawn", x, y, targets: p.targets });
  }
}
// Mouse released: drop. Legal square -> the move is done. Anywhere else -> the piece slides back.
window.addEventListener("pointerup", e => {
  if (DD) { dieUp(e); return; }
  if (!DRAG) return;
  const [x, y] = stagePt(e), p = DRAG.piece, sq = squareAt(x, y);
  p.el.classList.remove("drag"); $("gGhost").innerHTML = ""; setHL([]);
  const ok = DRAG.moved && p.targets.includes(sq);
  DRAG = null;
  if (ok && PEND) {
    const fn = PEND.res;
    PEND = null;
    sfx("tock");
    // Optimistically lock guest's pawn onto the dropped tile so render() never rubber-bands it back
    if (NET.active && !NET.isHost && p.key === "pawn" && G && G.players[NET.myPlayerIndex]) {
      G.players[NET.myPlayerIndex].pos = sq;
      G._quietMove = { idx: NET.myPlayerIndex, pos: sq };
      render();
    }
    fn({ key: p.key, to: sq });
  } else {
    sendDragPreview({ kind: "end" });
    render();                                                                    // snap the pawn back to its square
  }
});

// makeHandles(heads): put a copy of each snake head the Charmer may grab on top of the board, with a lime outline that pulses in size
// (CSS classes .hd and .hpulse); returns the list of pieces for awaitMove. heads = [{ h: head square, targets: [squares], ghost: function }]
function makeHandles(heads) {
  let s = "";
  heads.forEach(o => {
    const kd = ART.kinds[G.kind[G.S[o.h]] % ART.kinds.length], [x, y] = xy(o.h);
    s += `<g class="grab hd" data-k="${o.h}"><circle cx="${f1(x)}" cy="${f1(y - 4)}" r="42" fill="rgba(255,255,255,.01)"/><g class="hpulse"><use href="#${kd.head.p}all" transform="${SNK.headTf[o.h]}"/></g></g>`;   // the invisible circle makes the head easy to grab
  });
  $("gHandle").innerHTML = s;
  return heads.map(o => ({ key: o.h, el: $("gHandle").querySelector(`[data-k="${o.h}"]`), targets: o.targets, ghost: o.ghost }));
}

// ------------------------------------------------------------------ ITEM INPUT (used by rules.js: itemPhase / useItem)
// ITEMWAIT = waiting for the player to click one of their glowing items: { res }. TGT = waiting for a click on one of the highlighted squares: { targets, res }.
let ITEMWAIT = null, TGT = null;
// showHelper(label, onclick): show the big helper button on the rolling board with a label (it doubles as the Space-bar action).
function showHelper(label, fn) {
  const mb = $("moveBtn");
  mb.querySelector(".lbl").textContent = label;
  mb.style.display = "block";
  mb.onclick = () => { mb.onclick = null; mb.style.display = "none"; fn(); };
  placeHelper();                                        // it sits in the prompt panel (if a scene is open) or in the Current Event panel; it also fits the button's width to its label
}
function hideHelper() { const mb = $("moveBtn"); mb.style.display = "none"; mb.onclick = null; }
// awaitItemChoice(p, text, label): make player p's items glow and wait. Resolves with the SLOT NUMBER of the item they click, or null if they press the helper button (label, e.g. "Roll").
async function awaitItemChoice(p, text, label) {
  if (p.disconnected) return null;
  const pIdx = G.players.indexOf(p);
  const isMyTurn = !NET.active || !G || (pIdx === NET.myPlayerIndex);

  if (NET.active && NET.isHost) {
    broadcast({ type: "WAIT_ITEM", playerIndex: pIdx, text, label });
  }

  if (!isMyTurn) {
    setPrompt(`Waiting for ${p.name} to choose items or roll...`);
    NET.pendingActorIdx = pIdx;
    return new Promise(res => {
      NET.pendingItemRes = res;
    });
  }

  const idx = pIdx;
  const slots = [...document.querySelectorAll(`.slot[data-p="${idx}"]`)].filter(s => s.dataset.t);
  slots.forEach(s => s.classList.add("usable"));                  // pulse + lime glow (CSS .slot.usable)
  setPrompt(text); showItemsScene(p, text);           // dialog in the middle of the darkened board; it clears as soon as an item is picked (then the board is clear for the item's target / animation)
  const pressed = new Promise(res => showHelper(label, () => {
    if (NET.active) sendAction({ type: "ITEM_CHOICE", val: null });
    res(null);
  }));
  const clicked = new Promise(res => {
    ITEMWAIT = {
      res: slotIdx => {
        if (NET.active) sendAction({ type: "ITEM_CHOICE", val: slotIdx });
        res(slotIdx);
      }
    };
  });
  const r = await Promise.race([pressed, clicked]);
  hideHelper(); ITEMWAIT = null; slots.forEach(s => s.classList.remove("usable")); setPrompt("");
  return r;
}
// awaitTarget({targets, text, label}): highlight squares (pulsing lime outline) and wait for a click on one of them. Resolves with the square, or null if "Cancel" (the helper button / Space) is pressed.
async function awaitTarget({ targets, text, label }) {
  if (G && G.cur && G.cur.disconnected) return null;
  const curIdx = G && G.cur ? G.players.indexOf(G.cur) : 0;
  const isMyTurn = !NET.active || !G || (curIdx === NET.myPlayerIndex);

  if (NET.active && G && G.cur) {
    if (NET.isHost) {
      broadcast({ type: "WAIT_TARGET", playerIndex: curIdx, targets, text, label });
    }
    if (!isMyTurn) {
      setPrompt(`Waiting for ${G.cur.name} to choose target...`);
      NET.pendingActorIdx = curIdx;
      return new Promise(res => {
        NET.pendingTargetRes = res;
      });
    }
  }

  setHL(targets); setPrompt(text); showTab("event");
  const pressed = new Promise(res => showHelper(label || "Cancel", () => {
    if (NET.active) sendAction({ type: "TARGET", val: null });
    res(null);
  }));
  const picked = new Promise(res => {
    TGT = {
      targets,
      res: sq => {
        if (NET.active) sendAction({ type: "TARGET", val: sq });
        res(sq);
      }
    };
  });
  const r = await Promise.race([pressed, picked]);
  hideHelper(); TGT = null; setHL([]); setPrompt("");
  return r;
}
// elCenter(el): centre of a page element in stage coordinates (to launch or land flying items on pawns).
function elCenter(el) { const r = el.getBoundingClientRect(), s = $("stage").getBoundingClientRect(); return [(r.x + r.width / 2 - s.left) * STAGE_W / s.width, (r.y + r.height / 2 - s.top) * STAGE_H / s.height]; }
// flyItem(type, from, to, mode): animate a copy of an item picture from one stage position to another. mode "toss" = a spinning arc (stone, stick, drink),
// "slide" = a flat glide (toy brick). Resolves when it lands (a stone plays its impact sound, a toy brick the landing "tock").
function flyItem(type, from, to, mode, isRemote) {
  if (NET.active && NET.isHost && !isRemote) {
    broadcast({ type: "FLY_ITEM", itemType: type, from, to, mode });
  }
  const f = itemFit(type, FLY_ITEM_SIZE, FLY_ITEM_SIZE), el = document.createElement("img"), toss = mode === "toss", dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
  el.src = A(ITEMS[type].file); el.className = "fly"; el.style.width = f.w + "px"; el.style.height = f.h + "px";
  $("fly").appendChild(el);
  const at = (p, rot, sc) => `translate(${f1(p[0] - f.w / 2)}px,${f1(p[1] - f.h / 2)}px) rotate(${rot}deg) scale(${sc})`;
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - (toss ? Math.min(TOSS_ARC.max, TOSS_ARC.base + dist * TOSS_ARC.perPixel) : 0)];   // the top of the arc
  const spin = toss ? (type === "stick" ? TOSS_SPIN.stick : TOSS_SPIN.other) : 0;
  const dur = toss ? FLY_MS.toss : FLY_MS.slide;
  const anim = el.animate([{ transform: at(from, 0, 1) }, { transform: at(mid, spin / 2, toss ? FLY_SCALE.tossPeak : FLY_SCALE.slidePeak), offset: .5 }, { transform: at(to, spin, toss ? 1 : FLY_SCALE.slideEnd) }],
    { duration: dur, easing: toss ? "ease-in-out" : "cubic-bezier(.45,.05,.4,1)", fill: "forwards" });
  sfx("small");
  // Race against sleep(dur + 80) so backgrounded tabs never hang awaiting Web Animations!
  return Promise.race([anim.finished.catch(() => {}), sleep(dur + ANIM_SAFETY_MS)]).then(() => { el.remove(); if (type === "stone") sfxPick("stone"); else if (type === "brick") sfx("tock"); });   // stone: its impact sound (random of 2); brick: the landing tock. The drink and the stick get their sounds from rules.js (useItem) right after they land
}

// ------------------------------------------------------------------ 3. THE DICE
// The dice are real 3D cubes. The six faces come from ONE picture per die (DICE_ART in config.js: the faces side by side), each face showing its own sixth of it. Waiting dice spin slowly so you can see their different sides.
// A throw is PRE-CALCULATED: the game first simulates the whole roll (movement, wall bounces, dice bumping each other, tumbling) and decides
// the result, then adjusts the tumbling so the cube arrives exactly on the result as it stops - no snapping at the end.
// The roll is then played back over ROLL_MS milliseconds (config.js), matching the dice sound.
// The dice roll over the whole BOARD AREA (the #tray layer, see TRAY / DICE_AREA in config.js). While the active player waits to throw, the board is darkened and a dialog + ROLL button sit in the middle.
const DICE = { list: [], waiting: false, flying: false, canInteract: false, done: null, loop: false, play: null, slideTimer: null, finishTimer: null, hideTimer: null };
let DD = null;   // DD = the die being held by the mouse: { i, samples:[{t,x,y}] }
// FACE_ANGLES[v] = the [rx, ry] rotation that turns face v towards the player (opposite faces add up to 7).
const FACE_ANGLES = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

// trayShow() / trayHide(): fade the dice layer (#tray, which covers the board) in and out. The dark layer behind the prompt is separate (see "#prompt.choice ~ #shade" in css/style.css).
function trayShow() { $("tray").classList.add("on"); }
function trayHide() { $("tray").classList.remove("on"); }
// trayPt(e): mouse position relative to the top-left of the rolling board.
function trayPt(e) { const [x, y] = stagePt(e); return [x - TRAY.x, y - TRAY.y]; }
// dieClamp(d): keep a die fully inside the rolling board.
function dieClamp(d) {
  const h = DICE_SIZE / 2;
  d.x = cl(d.x, DICE_AREA.x1 + h, DICE_AREA.x2 - h); d.y = cl(d.y, DICE_AREA.y1 + h, DICE_AREA.y2 - h);
}
// dieDraw(d): move the die to its position and turn its cube to its current angles.
function dieDraw(d) {
  d.el.style.transform = `translate(${f1(d.x - DICE_SIZE / 2)}px,${f1(d.y - DICE_SIZE / 2)}px)`;
  d.cube.style.transform = `rotateX(${f1(d.rx)}deg) rotateY(${f1(d.ry)}deg)`;
}

// diceFaceHtml(character, i): the six faces of die number i (0 = first) for this character. The picture holds all faces in a row, so every face is a box that shows one sixth of it:
// the picture is made DIE_FACES times as wide as the box, and slid sideways so the right sixth is in view (0% = the first face ... 100% = the last face).
function diceFaceHtml(character, i) {
  const files = DICE_ART[character] || DICE_ART[DICE_ART_DEFAULT];
  const picture = A(files[i % files.length]);                        // (a character with one design uses it for every die)
  return DIE_FACE_LIST.map(v => {
    const shift = (v - 1) / (DIE_FACES - 1) * PERCENT_FULL;
    return `<div class="df df${v}" style="background-image:url('${picture}');background-size:${DIE_FACES * PERCENT_FULL}% 100%;background-position:${shift}% 0"></div>`;
  }).join("");
}
// spawnDiceElements(n, canGrab, character): put n dice on the table, in the design of the character who throws them.
function spawnDiceElements(n, canGrab, character) {
  $("dice").innerHTML = "";
  DICE.list = [];
  DICE.character = character;                                         // (remembered: a late-arriving roll message may have to rebuild the dice, see launch())
  for (let i = 0; i < n; i++) {
    const el = document.createElement("div"); el.className = "die"; el.dataset.i = i;
    el.style.pointerEvents = canGrab ? "auto" : "none";
    el.style.cursor = canGrab ? "grab" : "default";
    // waiting dice are centred above the ROLL button: one die exactly in the middle, two dice (Gambler) side by side, DICE_GAP apart
    const idlePos = [ROLL_SCENE_X - TRAY.x + (i - (n - 1) / 2) * DICE_GAP, DICE_IDLE_Y];
    el.innerHTML = `<div class="cube">${diceFaceHtml(character, i)}</div><div class="die-shine"></div>`;
    el.style.setProperty("--die-radius", (DICE_SIZE * DICE_FACE_RADIUS_RATIO).toFixed(1) + "px");   // (the shine's corners match the face's)
    el.style.setProperty("--die-shine-ms", DICE_SHINE_MS + "ms");
    el.style.setProperty("--die-shine-delay", (i * DICE_SHINE_STAGGER_MS) + "ms");
    $("dice").appendChild(el);
    const d = { el, cube: el.firstChild, x: idlePos[0], y: idlePos[1], vx: 0, vy: 0, rx: rnd(0, DICE_START_ANGLE_MAX), ry: rnd(0, DICE_START_ANGLE_MAX), mode: "idle", val: 1 };
    dieDraw(d); DICE.list.push(d);
  }
}

// rollDice(n, who): put n dice at their waiting spot (slowly spinning) and wait for a throw or the ROLL button. Resolves with the list of results.
// who = the player who must throw (optional). Normally it is the player whose turn it is; rules.js passes someone else when a rule makes
// another player roll during this turn (e.g. a Struggler being pushed by the Bully).
function rollDice(n, who) {
  const roller = who || (G && G.cur);
  if (roller && roller.disconnected) {
    return Promise.resolve(Array.from({ length: n }, () => d6()));
  }
  const curIdx = roller && G ? G.players.indexOf(roller) : 0;
  const isMyTurn = !NET.active || !G || (curIdx === NET.myPlayerIndex);

  if (NET.active && NET.isHost) {
    broadcast({
      type: "WAIT_ROLL",
      n,
      playerIndex: curIdx,
      catNow: !!(G && G.catNow),
      prompt: $("ptxt") ? $("ptxt").textContent : ""
    });
  }

  return new Promise(res => {
    if (DICE.slideTimer) { clearTimeout(DICE.slideTimer); DICE.slideTimer = null; }
    if (DICE.finishTimer) { clearTimeout(DICE.finishTimer); DICE.finishTimer = null; }
    DICE.play = null;
    DD = null;
    if (DICE.hideTimer) { clearTimeout(DICE.hideTimer); DICE.hideTimer = null; }
    spawnDiceElements(n, isMyTurn, roller && roller.character);   // (everybody sees the dice in the design of the player who throws, not of whoever's turn it is)
    if (isMyTurn) trayShow(); else trayHide();        // only the player who throws sees the waiting dice; everybody else sees them once the roll is thrown (launch() shows the layer)
    DICE.waiting = true; DICE.flying = false; DICE.canInteract = isMyTurn;

    if (isMyTurn) {
      if (!$("ptxt").textContent) setPrompt(`${roller ? roller.name : "Player"}: grab the die and throw it, or press ROLL / Space.`);
      showRollScene(roller || G.cur);                 // the board darkens (for the player who must throw only) and the character stands next to the dice
      $("rollBtn").classList.add("ready");   // the ROLL button appears only for the active player
    } else {
      $("rollBtn").classList.remove("ready");
      NET.pendingActorIdx = curIdx;
      setPrompt(`Waiting for ${roller ? roller.name : 'player'} to roll...`);
    }

    DICE.done = res;
    if (!DICE.loop) { DICE.loop = true; requestAnimationFrame(diceTick); }
  });
}

// stepDice(list, dt): advance a list of dice by dt milliseconds of physics: move, bounce off the walls, slow down (friction), tumble, bump each other.
function stepDice(list, dt) {
  let moving = false;
  list.forEach(d => {
    if (d.mode !== "fly") return;
    if (Math.hypot(d.vx, d.vy) < .04) { d.mode = "rest"; return; }   // slow enough: this die has stopped
    moving = true;
    d.x += d.vx * dt; d.y += d.vy * dt;
    const h = DICE_SIZE / 2;                                          // bounce off the four walls of the rolling board
    if (d.x < DICE_AREA.x1 + h) { d.x = DICE_AREA.x1 + h; d.vx = Math.abs(d.vx) * .8; }
    if (d.x > DICE_AREA.x2 - h) { d.x = DICE_AREA.x2 - h; d.vx = -Math.abs(d.vx) * .8; }
    if (d.y < DICE_AREA.y1 + h) { d.y = DICE_AREA.y1 + h; d.vy = Math.abs(d.vy) * .8; }
    if (d.y > DICE_AREA.y2 - h) { d.y = DICE_AREA.y2 - h; d.vy = -Math.abs(d.vy) * .8; }
    const f = Math.pow(.9965, dt); d.vx *= f; d.vy *= f;              // friction: the die slows down
    d.ry += d.vx * dt * .9; d.rx -= d.vy * dt * .9;                   // the cube rolls in the direction it travels
  });
  separateDice(list);                                                  // dice can never overlap: they bounce off each other
  return moving;
}

// finishRollPlayback(P): settles dice on their exact final frame, slides to centre, and resolves rollDice().
// Safe to call from either diceTick or the background-tab-safe setTimeout; runs only once per roll.
function finishRollPlayback(P) {
  if (!P || P.completed) return;
  P.completed = true;
  if (DICE.finishTimer) { clearTimeout(DICE.finishTimer); DICE.finishTimer = null; }
  if (DICE.play === P) DICE.play = null;
  DICE.flying = false;
  const last = P.frames[P.frames.length - 1];
  DICE.list.forEach((d, i) => {
    if (last && last[i]) { d.x = last[i].x; d.y = last[i].y; d.rx = last[i].rx; d.ry = last[i].ry; }
    d.mode = "rest";
    dieDraw(d);
    const shine = d.el.querySelector(".die-shine");                 // the die has stopped and shows its number: let the shine sweep over it
    if (shine) { shine.classList.remove("go"); void shine.offsetWidth; shine.classList.add("go"); }   // (the forced reflow restarts the animation if it ran before)
  });
  if (DICE.slideTimer) clearTimeout(DICE.slideTimer);
  DICE.slideTimer = setTimeout(() => {
    DICE.slideTimer = null;
    slideDiceToCenter();
    DICE.list.forEach(dieDraw);
    if (DICE.done) {
      const cb = DICE.done;
      DICE.done = null;
      NET.pendingActorIdx = null;
      DICE.hideTimer = setTimeout(() => { DICE.hideTimer = null; trayHide(); }, DICE_FADE_DELAY_MS);   // the result stays in view a moment, then the dice fade away
      cb(P.vals);
    }
  }, DICE_SLIDE_MS);
}

let diceLast = 0;
function diceTick(now) {
  requestAnimationFrame(diceTick);
  try {
    const dt = Math.min(DICE_FRAME_MAX_MS, Math.max(0, now - (diceLast || now))); diceLast = now;
    DICE.list.forEach(d => { if (d.mode === "idle" || d.mode === "held") { d.rx += DICE_IDLE_SPIN.x * dt; d.ry += DICE_IDLE_SPIN.y * dt; } });
    separateDice(DICE.list);                                             // also keeps a held die from being dragged onto the other one
    const P = DICE.play;
    if (P) {                                                             // a roll is being played back
      const k = Math.min(1, Math.max(0, (performance.now() - P.t0) / ROLL_MS)), f = P.frames[Math.min(P.frames.length - 1, Math.floor(k * (P.frames.length - 1)))];
      DICE.list.forEach((d, i) => { if (f[i]) { d.x = f[i].x; d.y = f[i].y; d.rx = f[i].rx; d.ry = f[i].ry; } });
      if (k >= 1) finishRollPlayback(P);
    }
    DICE.list.forEach(dieDraw);
  } catch (err) { console.error("Dice loop error:", err); }
}

// slideDiceToCenter(): after a roll, glide the resting dice to the middle of the rolling board so the result stays in plain view
// while the "Move for me" button sits at the bottom. DICE_GAP apart if there are two dice.
function slideDiceToCenter() {
  const n = DICE.list.length, cx = (DICE_AREA.x1 + DICE_AREA.x2) / 2, cy = DICE_REST_Y;
  DICE.list.forEach((d, i) => { d.x = cx + (i - (n - 1) / 2) * DICE_GAP; d.y = cy; d.el.style.transition = "transform .55s cubic-bezier(.4, 0, .2, 1)"; });
}

function separateDice(L) {
  for (let pass = 0; pass < DICE_SEPARATE_PASSES; pass++) {
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
      const a = L[i], b = L[j];
      let dx = b.x - a.x, dy = b.y - a.y, dist = Math.hypot(dx, dy);
      if (dist >= DICE_GAP) continue;
      if (dist < 1) { dx = 1; dy = 0; dist = 1; }
      const nx = dx / dist, ny = dy / dist, ov = DICE_GAP - dist;
      const mv = d => d.mode === "held" ? 0 : d.mode === "rest" ? .25 : 1;
      const ma = mv(a), mb = mv(b), tot = (ma + mb) || 1;
      a.x -= nx * ov * ma / tot; a.y -= ny * ov * ma / tot; b.x += nx * ov * mb / tot; b.y += ny * ov * mb / tot;
      if (pass === 0) {
        const va = a.vx * nx + a.vy * ny, vb = b.vx * nx + b.vy * ny;
        if (a.mode === "fly" && b.mode === "fly") { if (va - vb > 0) { const d = (va - vb) * DICE_BOUNCE_KEEP; a.vx -= d * nx; a.vy -= d * ny; b.vx += d * nx; b.vy += d * ny; } }
        else if (a.mode === "fly" && va > 0) { a.vx -= DICE_PUSH_AWAY * va * nx; a.vy -= DICE_PUSH_AWAY * va * ny; }
        else if (b.mode === "fly" && vb < 0) { b.vx -= DICE_PUSH_AWAY * vb * nx; b.vy -= DICE_PUSH_AWAY * vb * ny; }
      }
      dieClamp(a); dieClamp(b);
      const d2 = Math.hypot(b.x - a.x, b.y - a.y);
      if (d2 < DICE_GAP - .5) { const k = DICE_GAP - d2; b.x += nx * k; b.y += ny * k; dieClamp(b); if (Math.hypot(b.x - a.x, b.y - a.y) < DICE_GAP - .5) { a.x -= nx * k; a.y -= ny * k; dieClamp(a); } }
    }
  }
}

// rollPressed(): the ROLL button (or Space bar) -> throw with a random direction and strength.
function rollPressed() {
  if (!DICE.waiting || DICE.flying || !DICE.canInteract) return;
  const a = Math.random() * TAU, sp = ROLL_BUTTON_SPEED.min + Math.random() * ROLL_BUTTON_SPEED.range;
  launch(Math.cos(a) * sp, Math.sin(a) * sp);
}
// A die is grabbed: start recording the mouse path so the throw direction/speed can be measured on release.
function dieDown(i, e) {
  if (!DICE.canInteract) return;
  const [x, y] = trayPt(e);
  DD = { i, samples: [{ t: performance.now(), x, y }] };
  DICE.list[i].mode = "held";
  dieMove(e);
}
function dieMove(e) {
  const [x, y] = trayPt(e), d = DICE.list[DD.i];
  d.x = x; d.y = y; dieClamp(d);
  sendDragPreview({ kind: "die", i: DD.i, x: d.x, y: d.y });
  DD.samples.push({ t: performance.now(), x, y });
  if (DD.samples.length > DRAG_SAMPLES) DD.samples.shift();
}
// Die released: speed and direction = how the mouse moved over the last ~100ms. A weak flick still rolls (with a default push).
function dieUp(e) {
  const s = DD.samples, a = s[0], b = s[s.length - 1], dt = Math.max(1, b.t - a.t);
  let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt, sp = Math.hypot(vx, vy);
  DD = null;
  if (sp < WEAK_FLICK_SPEED) { const ang = Math.random() * TAU; vx = Math.cos(ang); vy = Math.sin(ang); sp = WEAK_FLICK_PUSH; }   // barely moved: gentle random roll
  const k = cl(sp, THROW_SPEED.min, THROW_SPEED.max) / sp;                                                                       // keep the throw within sensible speeds
  launch(vx * k, vy * k);
}

// launch(vx,vy,forceVals,startDice): start a roll. Speeds are in pixels per millisecond.
// Syncs exact initial positions/rotations across peers and guarantees background-tab-safe completion.
function launch(vx, vy, forceVals, startDice) {
  // Ensure dice DOM matches the roll count even if WAIT_ROLL arrived late
  if (forceVals && DICE.list.length !== forceVals.length) {
    spawnDiceElements(forceVals.length, false, DICE.character || (G && G.cur && G.cur.character));
    if (!DICE.loop) { DICE.loop = true; requestAnimationFrame(diceTick); }
  }
  if (!DICE.list.length) return;

  DICE.waiting = false; DICE.flying = true; DICE.canInteract = false;
  DICE.list.forEach(d => { d.el.style.pointerEvents = "none"; d.el.style.cursor = "default"; });
  $("rollBtn").classList.remove("ready");
  if (DICE.hideTimer) { clearTimeout(DICE.hideTimer); DICE.hideTimer = null; }
  hideRollText(); trayShow(); setPrompt("");                  // the dice tumble over a CLEAR board: the heading, the dark layer and the roll prompt go away

  if (Array.isArray(startDice)) {
    DICE.list.forEach((d, idx) => {
      const sd = startDice[idx];
      if (sd) { d.x = sd.x; d.y = sd.y; d.rx = sd.rx; d.ry = sd.ry; }
    });
  }

  const base = Math.atan2(vy, vx), sp = Math.hypot(vx, vy);
  const vals = forceVals || DICE.list.map(() => d6());

  if (NET.active && !forceVals) {
    const snap = DICE.list.map(d => ({ x: +d.x.toFixed(1), y: +d.y.toFixed(1), rx: +d.rx.toFixed(1), ry: +d.ry.toFixed(1) }));
    sendAction({ type: "ROLL_LAUNCH", vx, vy, vals, startDice: snap });
  }

  const sim = DICE.list.map((d, j) => {
    const a = base + (j ? (j % 2 ? .45 : -.45) : 0), s = sp * (1 - .12 * j);
    return { x: d.x, y: d.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, rx: d.rx, ry: d.ry, mode: "fly" };
  });
  const frames = [sim.map(d => ({ x: d.x, y: d.y, rx: d.rx, ry: d.ry }))];
  for (let n = 0; n < ROLL_SIM_MAX_FRAMES; n++) {
    const moving = stepDice(sim, ROLL_SIM_FRAME_MS);
    frames.push(sim.map(d => ({ x: d.x, y: d.y, rx: d.rx, ry: d.ry })));
    if (!moving && sim.every(d => d.mode === "rest")) break;
  }
  sim.forEach((d, i) => {
    const [X, Y] = FACE_ANGLES[vals[i]], last = frames[frames.length - 1][i];
    const tx = Math.round((last.rx - X) / FULL_TURN) * FULL_TURN + X, ty = Math.round((last.ry - Y) / FULL_TURN) * FULL_TURN + Y, dx = tx - last.rx, dy = ty - last.ry;
    const cum = [0];
    for (let n = 1; n < frames.length; n++) cum.push(cum[n - 1] + Math.abs(frames[n][i].rx - frames[n - 1][i].rx) + Math.abs(frames[n][i].ry - frames[n - 1][i].ry));
    frames.forEach((f, n) => { const q = cum[cum.length - 1] > 1 ? cum[n] / cum[cum.length - 1] : n / (frames.length - 1); f[i].rx += dx * q; f[i].ry += dy * q; });
  });
  DICE.list.forEach(d => { d.mode = "fly"; d.cube.style.transition = "none"; d.el.style.transition = "none"; });
  const P = { t0: performance.now(), frames, vals, completed: false };
  DICE.play = P;
  if (DICE.finishTimer) clearTimeout(DICE.finishTimer);
  // Fallback completion timer so unfocused/backgrounded tabs never stall the game loop!
  DICE.finishTimer = setTimeout(() => finishRollPlayback(P), ROLL_MS + ROLL_FALLBACK_MS);
  sfx("dice");
}
