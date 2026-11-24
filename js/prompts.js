// =====================================================================================
//  prompts.js  -  the PROMPT SCENES: when the player whose turn it is must decide something (or is about to roll), the board goes dark and the full-body picture of their
//  character stands on the left. Special decisions get a light panel next to the character:
//     Bully "push or pull?"   Oracle "predict your future" (1-6)   Struggler "struggle to climb" (pick 2 numbers)   everything else: a plain panel with the question.
//  While rolling there is no panel: the character stands next to the dice and the ROLL button (see rollDice in input.js).
//  Only the player who must decide sees a scene; everybody else just reads the Current Event panel. A small EYE button lets the player peek at the board.
//  Positions and sizes: PROMPT_SCENE, PROMPT_BTN and FULL_ART in config.js; looks: the "scene" section of css/style.css.
//  Scenes are opened by choose() / awaitItemChoice() / rollDice() in input.js and closed by setPrompt("").
// =====================================================================================

// SCENE = what is on screen right now.
const SCENE = { open: false, actor: null, hideTimer: null, peek: false };

// The words on the prompts (capitals, like the mockups).
const PROMPT_TEXT = {
  turn: (name) => `${String(name).toUpperCase()}\u2019S TURN!`,
  bully: ["IF YOU LAND ON SOMEONE", "DO YOU WANT TO"],
  oracle: "PREDICT YOUR FUTURE",
  strugglerHead: "STRUGGLE TO CLIMB!",
  strugglerSmall: (left) => (left >= 2 ? "PICK 2 NUMBERS TO FAIL THE CLIMB" : "PICK 1 MORE NUMBER TO FAIL THE CLIMB"),
  items: "USE AN ITEM, OR ROLL",
  roll: "THROW THE DIE OR PRESS SPACE"
};

// promptKindOf(msg, opts): which special prompt a question is. The game asks plain questions (text + options); the kind is recognised from them, so the same code works for
// the player on the host AND for a guest in an online game (they receive the same text and options).
function promptKindOf(msg, opts) {
  const labels = opts.map((o) => String(o.label ?? o));
  if (labels.length === 2 && labels[0] === "Push" && labels[1] === "Pull") return "bully";
  if (/call the number you will roll/.test(msg)) return "oracle";
  if (/failure number/.test(msg)) return "struggler";
  return "generic";
}

// sceneButton(label, size, onClick, off): an orange prompt button made from the art (size = "long" or "short") with a white Blustrue label, an offset brown outline and a shine on hover.
function sceneButton(label, size, onClick, off) {
  const art = PROMPT_BTN[size], b = document.createElement("button");
  const base = size === "long" ? PROMPT_BTN.fontLong : PROMPT_BTN.fontShort;
  const fs = Math.min(base, (art.w * .86) / (Math.max(1, String(label).length) * PROMPT_BTN.labelWidth));   // long labels shrink to fit the button
  b.className = `pbtn ${size}` + (off ? " off" : "");
  b.innerHTML = `<img src="${A(art.file)}" alt=""><span class="pbl" style="font-size:${fs.toFixed(1)}px">${esc(String(label))}</span><i class="tb-shine"></i>`;
  if (!off) b.onclick = onClick;
  return b;
}

// openScene(actor, mode): bring the scene on screen for this player's character (mode "panel" = with a panel, "roll" = character + dice only).
// If a scene is already open for the same character (e.g. the roll scene right after a question) it stays: only its content changes, nothing flickers.
function openScene(actor, mode) {
  if (SCENE.hideTimer) { clearTimeout(SCENE.hideTimer); SCENE.hideTimer = null; }
  const art = FULL_ART[actor.character], ch = $("sceneChar");
  if (art && ch.dataset.c !== actor.character) {
    ch.dataset.c = actor.character;
    ch.src = A(art.file);
    ch.style.width = art.w + "px"; ch.style.height = art.h + "px";
    ch.style.left = (PROMPT_SCENE.charCenterX - art.w / 2) + "px"; ch.style.top = (PROMPT_SCENE.charBottom - art.h) + "px";
  }
  SCENE.open = true; SCENE.actor = actor;
  $("scene").classList.add("on"); $("scene").classList.toggle("rollmode", mode === "roll");
  $("game").classList.add("scened"); $("eyeBtn").classList.add("on");
  placeHelper();
}
// closeSceneSoon(): called by setPrompt(""). The scene fades out quickly, after a very short grace time (see PROMPT_SCENE.closeGraceMs) in case another scene follows at once.
function closeSceneSoon() {
  if (!SCENE.open || SCENE.hideTimer) return;
  SCENE.hideTimer = setTimeout(() => {
    SCENE.hideTimer = null; SCENE.open = false; SCENE.actor = null;
    $("scene").classList.remove("on"); $("game").classList.remove("scened", "peek"); $("eyeBtn").classList.remove("on");
    SCENE.peek = false; $("eyeBtn").classList.remove("closed");
    placeHelper();
  }, PROMPT_SCENE.closeGraceMs);
}
// toggleEye(): the eye button. Hides the dark layer and the character / panel so the board can be seen; press again to bring the prompt back.
function toggleEye() {
  SCENE.peek = !SCENE.peek;
  $("game").classList.toggle("peek", SCENE.peek);
  $("eyeBtn").classList.toggle("closed", SCENE.peek);
}
// placeHelper(): the helper button ("Move me", "Roll", "Cancel") sits in the prompt panel while a scene is open, otherwise in the Current Event panel.
function placeHelper() {
  const mb = $("moveBtn"), dest = SCENE.open ? $("sceneBtns") : $("evAct");
  if (mb.parentElement !== dest) dest.appendChild(mb);
  mb.style.setProperty("--k", SCENE.open ? PROMPT_BTN.sceneScale : PROMPT_BTN.eventScale);
}

// panelHtml parts -----------------------------------------------------------------
const sceneLine = (cls, text) => `<div class="${cls}">${text}</div>`;
// fillPanel(actor, kind, msg, opts): write the panel's texts for this kind of prompt (the buttons are added by showChoiceScene).
function fillPanel(actor, kind, msg, opts) {
  let h = sceneLine("st", PROMPT_TEXT.turn(actor.name));
  if (kind === "bully") h += sceneLine("sb2", PROMPT_TEXT.bully.join("<br>"));
  else if (kind === "oracle") h += sceneLine("sh", PROMPT_TEXT.oracle);
  else if (kind === "struggler") h += sceneLine("sh", PROMPT_TEXT.strugglerHead) + sceneLine("ss", PROMPT_TEXT.strugglerSmall(opts.length));
  else if (kind === "items") h += sceneLine("sb2", PROMPT_TEXT.items);
  else h += sceneLine("sb2", esc(msg.replace(new RegExp("^" + actor.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ":\\s*"), "")).toUpperCase());   // (the "Name: " at the start is dropped: the title already says whose turn it is)
  $("sceneText").innerHTML = h;
  $("sceneBtns").className = kind === "bully" || kind === "generic" || kind === "items" ? "row" : "grid";
}
// showChoiceScene(actor, kind, msg, opts, pick): the panel with its option buttons; pick(value) is called when one is pressed.
function showChoiceScene(actor, kind, msg, opts, pick) {
  openScene(actor, "panel");
  fillPanel(actor, kind, msg, opts);
  const box = $("sceneBtns"), mb = $("moveBtn");
  [...box.children].forEach((e) => { if (e !== mb) e.remove(); });
  const norm = opts.map((o) => ({ label: o.label ?? o, value: o.value ?? o }));
  if (kind === "oracle" || kind === "struggler") {
    // numbers 1-6 on short buttons (a number that is not offered any more, e.g. the first pick of the Struggler, stays visible but dimmed)
    DIE_FACE_LIST.forEach((n) => {
      const o = norm.find((x) => x.value === n);
      box.insertBefore(sceneButton(n, "short", () => pick(o.value), !o), mb);
    });
  } else {
    norm.forEach((o) => box.insertBefore(sceneButton(o.label, "long", () => pick(o.value)), mb));
  }
}
// showItemsScene(actor): the "use an item or roll" panel (its Roll button is the helper button; the player's glowing items are clicked in their own panel on the right).
function showItemsScene(actor, text) {
  openScene(actor, "panel");
  fillPanel(actor, "items", text, []);
  const box = $("sceneBtns"), mb = $("moveBtn");
  [...box.children].forEach((e) => { if (e !== mb) e.remove(); });
}
// showRollScene(actor): the character stands next to the dice and ROLL button; a heading above them.
function showRollScene(actor) {
  openScene(actor, "roll");
  $("sceneRoll").innerHTML = sceneLine("st", PROMPT_TEXT.turn(actor.name)) + sceneLine("ss", PROMPT_TEXT.roll);
}
