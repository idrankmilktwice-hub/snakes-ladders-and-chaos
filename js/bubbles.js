// =====================================================================================
//  bubbles.js  -  the CHAT SPEECH BUBBLES that pop up over a player's pawn when that player chats.
//  - The newest message of a player stays CHAT_BUBBLE.showMs. If the same player chats again, the older bubble is pushed away from the pawn and vanishes
//    in CHAT_BUBBLE.pushedFadeMs, even if its own time was not up. Only the newest bubble stays for the full time.
//  - A bubble normally sits ABOVE the pawn (the pointer points down at it). If there is no room above (a pawn on the top edge of the board) it sits BELOW. It is
//    also slid sideways so it never leaves the board (a pawn on the left / right edge gets its bubble pushed inward); the pointer keeps pointing at the pawn.
//  - A short message makes a rounded pill; a longer one stretches the pill; a very long one gets a smaller text, wrapped into a rectangle with small rounded corners.
//  - Everything is drawn in the #chatLayer (same place and size as the board, so a bubble can never cover the panels on the right).
//  Numbers: CHAT_BUBBLE in config.js. Looks: the "chat bubbles" part of css/style.css. Called from appendChatMessage() in network.js; cleaned up by leaveGameScreen() in endgame.js.
// =====================================================================================

// BUBBLES = what is on screen. byPlayer[i] = that player's bubbles, oldest first (the last one is the newest).
const BUBBLES = { byPlayer: {}, running: false, last: 0 };
let _bubbleCtx = null; // a hidden canvas, only used to measure how wide a text is

// bubbleTextWidth(text, px): how wide the text is in the bubble font.
function bubbleTextWidth(text, px) {
  _bubbleCtx = _bubbleCtx || document.createElement("canvas").getContext("2d");
  _bubbleCtx.font = `${px}px Blustrue`;
  return _bubbleCtx.measureText(text).width;
}
// bubbleWrap(text, px, maxW): split the text into lines no wider than maxW (breaking between words; a single word that is too long is broken wherever it must be).
function bubbleWrap(text, px, maxW) {
  const lines = [];
  let line = "";
  text
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      while (bubbleTextWidth(word, px) > maxW) {
        // one huge word: cut off as many letters as fit
        let k = word.length - 1;
        while (k > 1 && bubbleTextWidth(word.slice(0, k), px) > maxW) k--;
        if (line) {
          lines.push(line);
          line = "";
        }
        lines.push(word.slice(0, k));
        word = word.slice(k);
      }
      const tryLine = line ? line + " " + word : word;
      if (bubbleTextWidth(tryLine, px) <= maxW) line = tryLine;
      else {
        lines.push(line);
        line = word;
      }
    });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
// bubbleShape(text): decide the look of a message: { lines, fontPx, w, h, radius, pill }.
function bubbleShape(text) {
  const C = CHAT_BUBBLE,
    t = text.toUpperCase();
  const pill = bubbleTextWidth(t, C.fontPx) <= C.stretchMaxW; // fits on one line: a stretched pill, otherwise a rectangle with smaller text
  const fontPx = pill ? C.fontPx : C.fontPx * C.rectFontScale;
  const lines = pill ? [t] : bubbleWrap(t, fontPx, C.rectMaxW);
  const lineH = fontPx * C.lineEm;
  const textW = Math.max(...lines.map((l) => bubbleTextWidth(l, fontPx)));
  const padX = pill ? C.pad * C.padPillMul : C.pad; // (a rectangle has the same space on all four sides)
  const h = Math.ceil(lines.length * lineH + 2 * (C.pad + C.border));
  const w = Math.ceil(Math.max(textW + 2 * (padX + C.border), pill ? h : 0)); // (a one-letter pill is a circle at the narrowest)
  return {
    lines,
    fontPx,
    lineH,
    w,
    h,
    pill,
    radius: pill ? h / 2 : C.rectRadius,
  };
}
// bubbleTailSvg(dir, tailX): the little pointer. dir "up" = the bubble is above the pawn (pointer on the bottom, pointing down); "down" = bubble below the pawn (pointer on top).
// Drawn as: a brown copy pushed down (the offset outline), the lime pointer with a brown outline on its two slanted sides, and a lime patch that hides the bubble's border where the pointer joins it.
function bubbleTailSvg(dir) {
  const C = CHAT_BUBBLE,
    L = C.tailLen,
    mw = C.tailW,
    B = C.border,
    SH = C.shadow,
    half = mw / 2,
    cx = half + B;
  const slope = (Math.sqrt(1 + (half / L) ** 2) * B) / 2; // how far inside the slanted outline lines the lime patch must stay
  const edgeL = (y) => cx - half * (1 - y / L) + slope,
    edgeR = (y) => cx + half * (1 - y / L) - slope; // the pointer's inner edge at height y
  const coverBottom = dir === "up" ? SH + 0.5 : 0.5; // (only a bubble's bottom has the offset outline under it)
  const tri = (dy) => `${cx - half},${dy} ${cx},${L + dy} ${cx + half},${dy}`;
  const svg =
    `<svg class="ctail" width="${mw + 2 * B}" height="${L + B}" viewBox="0 0 ${mw + 2 * B} ${L + B}" aria-hidden="true">` +
    (dir === "up"
      ? `<polygon points="${tri(SH)}" fill="${C.ink}" stroke="${C.ink}" stroke-width="${B}" stroke-linejoin="round"/>`
      : "") + // (the offset outline only belongs under a pointer that hangs below its bubble)
    `<polygon points="${tri(0)}" fill="${C.fill}"/>` +
    `<polyline points="${tri(0)}" fill="none" stroke="${C.ink}" stroke-width="${B}" stroke-linejoin="round" stroke-linecap="round"/>` + // (only the two slanted sides get an outline: the base is open, where the pointer joins the bubble)
    `<polygon points="${edgeL(-B - 1)},${-B - 1} ${edgeR(-B - 1)},${-B - 1} ${edgeR(coverBottom)},${coverBottom} ${edgeL(coverBottom)},${coverBottom}" fill="${C.fill}"/></svg>`;
  return svg;
}
// pawnAnchor(i): where player i's pawn is, in #chatLayer coordinates: { cx, top, bottom } (null if there is no pawn to point at).
function pawnAnchor(i) {
  const layer = $("chatLayer"),
    body = document.querySelector(`#pw${i} .bob > circle`);
  if (!layer || !body || (G && G.players[i] && G.players[i].abandoned))
    return null;
  const lr = layer.getBoundingClientRect(),
    pr = body.getBoundingClientRect(),
    s = lr.width / layer.offsetWidth || 1; // (s = how much the window scaled the stage)
  return {
    cx: (pr.left + pr.width / 2 - lr.left) / s,
    top: (pr.top - lr.top) / s,
    bottom: (pr.bottom - lr.top) / s,
    layerW: layer.offsetWidth,
  };
}
// showChatBubble(i, text): player i just chatted: pop a bubble up over their pawn.
function showChatBubble(i, text) {
  const C = CHAT_BUBBLE,
    layer = $("chatLayer");
  if (!layer || !G || !G.players[i] || $("game").style.display === "none")
    return; // no game on screen (a chat from the lobby)
  const a = pawnAnchor(i);
  if (!a) return;
  const now = performance.now(),
    list = (BUBBLES.byPlayer[i] = BUBBLES.byPlayer[i] || []);
  list.forEach((b) => {
    // the older bubbles: lose their pointer and vanish within pushedFadeMs
    if (b.tail) {
      b.tail.remove();
      b.tail = null;
    }
    if (b.fadeStart == null || b.fadeStart + b.fadeMs > now + C.pushedFadeMs) {
      b.fadeStart = now;
      b.fadeMs = C.pushedFadeMs;
    }
  });
  const s = bubbleShape(text);
  const dir =
    a.top - C.tailGap - C.tailLen - s.h >= C.edgeMargin ? "up" : "down"; // room above the pawn? otherwise the bubble goes below it
  const el = document.createElement("div");
  el.className = "cbub";
  el.style.width = s.w + "px";
  el.style.height = s.h + "px";
  el.innerHTML = `<div class="cin"><div class="cbody" style="border:${C.border}px solid ${C.ink};border-radius:${s.radius}px;box-shadow:0 ${C.shadow}px 0 ${C.ink};background:${C.fill};color:${C.ink};font-size:${s.fontPx.toFixed(1)}px;line-height:${s.lineH.toFixed(1)}px">${s.lines.map(esc).join("<br>")}</div>${bubbleTailSvg(dir)}</div>`;
  const tail = el.querySelector(".ctail");
  tail.style.top = dir === "up" ? s.h + "px" : "0px"; // the pointer hangs under the bubble, or rises from its top (flipped)
  if (dir === "down") tail.style.transform = "scaleY(-1)";
  el.querySelector(".cin").style.animationDuration = C.popMs + "ms";
  layer.appendChild(el);
  list.push({
    el,
    tail,
    w: s.w,
    h: s.h,
    radius: s.radius,
    dir,
    born: now,
    fadeStart: null,
    fadeMs: 0,
    y: null,
  });
  startBubbleLoop();
}
// clearChatBubbles(): remove every bubble at once (the game screen is leaving).
function clearChatBubbles() {
  BUBBLES.byPlayer = {};
  const layer = $("chatLayer");
  if (layer) layer.innerHTML = "";
}
function startBubbleLoop() {
  if (BUBBLES.running) return;
  BUBBLES.running = true;
  BUBBLES.last = performance.now();
  requestAnimationFrame(bubbleFrame);
}
// bubbleFrame(): runs once per screen refresh while there are bubbles: fades them, follows the pawns, stacks the older ones away from the pawn.
function bubbleFrame(now) {
  const C = CHAT_BUBBLE,
    dt = Math.min(now - BUBBLES.last, 100);
  BUBBLES.last = now;
  let any = false;
  for (const key of Object.keys(BUBBLES.byPlayer)) {
    let list = BUBBLES.byPlayer[key];
    const a = pawnAnchor(+key);
    list.forEach((b) => {
      // the natural end of the newest bubble: it fades during its last endFadeMs
      if (b.fadeStart == null && now >= b.born + C.showMs - C.endFadeMs) {
        b.fadeStart = b.born + C.showMs - C.endFadeMs;
        b.fadeMs = C.endFadeMs;
      }
    });
    list = BUBBLES.byPlayer[key] = list.filter((b) => {
      const gone = !a || (b.fadeStart != null && now >= b.fadeStart + b.fadeMs);
      if (gone) b.el.remove();
      return !gone;
    });
    if (!list.length) {
      delete BUBBLES.byPlayer[key];
      continue;
    }
    any = true;
    const newest = list[list.length - 1],
      dir = newest.dir;
    let edge =
      dir === "up"
        ? a.top - C.tailGap - C.tailLen
        : a.bottom + C.tailGap + C.tailLen; // where the newest bubble touches the pointer; older ones stack beyond it
    for (let k = list.length - 1; k >= 0; k--) {
      const b = list[k],
        targetY = dir === "up" ? edge - b.h : edge;
      edge = dir === "up" ? targetY - C.stackGap : targetY + b.h + C.stackGap;
      b.y =
        b.y == null || k === list.length - 1
          ? targetY
          : b.y + (targetY - b.y) * (1 - Math.exp(-dt / C.easeMs)); // the newest sits exactly in place, older ones glide
      const x = Math.min(
        Math.max(a.cx - b.w / 2, C.edgeMargin),
        Math.max(C.edgeMargin, a.layerW - b.w - C.edgeMargin),
      ); // slid sideways to stay on the board
      b.el.style.transform = `translate(${x.toFixed(1)}px,${b.y.toFixed(1)}px)`;
      b.el.style.opacity =
        b.fadeStart == null
          ? 1
          : Math.max(0, 1 - (now - b.fadeStart) / b.fadeMs).toFixed(3);
      if (b.tail) {
        // the pointer keeps pointing at the pawn, but stays on the straight part of the bubble's edge
        const tailMin = Math.min(b.radius + C.tailW / 2, b.w / 2),
          tx = Math.min(Math.max(a.cx - x, tailMin), b.w - tailMin);
        b.tail.style.left = tx - C.tailW / 2 - C.border + "px";
        b.el.firstChild.style.transformOrigin = `${tx}px ${dir === "up" ? "100%" : "0%"}`;
      }
    }
  }
  if (any) requestAnimationFrame(bubbleFrame);
  else BUBBLES.running = false;
}
