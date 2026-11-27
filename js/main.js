// =====================================================================================
//  main.js  -  the setup screen, the Start button, the bottom-right tab buttons (Settings / Chat / Info panel + Rulebook / Board log pop-ups), and window scaling.
//  This file runs LAST. At the very bottom it draws the setup screen and starts loading the art.
// =====================================================================================

// initRows(): make sure there is a setup row (name + character) for every possible player.
function initRows() { while (S.rows.length < CONFIG.MAX_PLAYERS) S.rows.push({ name: `Player ${S.rows.length + 1}`, character: "", locked: false }); }

// drawSetup(): (re)draw the start screen from S. Called at load, after any change on the screen, and when art finishes loading.
// S.pick = number of the player row whose character chooser is open (null = closed).
function drawSetup() {
  initRows();
  const setupEl = $("setup");
  const activeEl = document.activeElement;
  let savedInput = null;
  if (activeEl && activeEl.tagName === "INPUT" && setupEl && setupEl.contains(activeEl)) {
    savedInput = {
      id: activeEl.id || null,
      playerIdx: activeEl.dataset ? activeEl.dataset.playerInput : null,
      value: activeEl.value,
      selStart: activeEl.selectionStart,
      selEnd: activeEl.selectionEnd
    };
    if (savedInput.playerIdx != null && S.rows[+savedInput.playerIdx]) {
      S.rows[+savedInput.playerIdx].name = savedInput.value;
    }
  }

  let h = `<h2>Snakes, Ladders and Chaos!</h2>`;

  // Mode Switcher: Local Play vs Online Multiplayer
  h += `<div class="mode-toggle">
    <button class="cbtn mode-btn ${S.mode === 'local' ? '' : 'alt'}" onclick="setGameMode('local')"><span>Local Pass & Play</span></button>
    <button class="cbtn mode-btn ${S.mode === 'online' ? '' : 'alt'}" onclick="setGameMode('online')"><span>Online Multiplayer</span></button>
  </div>`;

  if (S.mode === "local") {
    h += `<div class="top">Players: <select id="cnt" onchange="S.n=+this.value;drawSetup()">`;
    for (let i = CONFIG.MIN_PLAYERS; i <= CONFIG.MAX_PLAYERS; i++) h += `<option ${i === S.n ? "selected" : ""}>${i}</option>`;
    h += "</select></div>";
    for (let i = 0; i < S.n; i++) {
      const r = S.rows[i], c = CHARACTERS.find(c => c.id === r.character);
      h += `<div class="row"><span class="dot" style="background:${COLORS[i]}"></span><input data-player-input="${i}" value="${esc(r.name)}" ${r.locked ? "disabled" : ""} oninput="S.rows[${i}].name=this.value" onchange="S.rows[${i}].name=this.value">
<button class="cls" ${r.locked ? "disabled" : ""} onclick="S.pick=${i};drawSetup()">${c ? `<img src="${A(PORT[c.id] + ".svg")}" alt="">${c.name}` : "Pick a character"}<small>${r.locked ? "locked in" : "click to choose"}</small></button></div>`;
    }
    h += `<div id="smsg">${S.msg}</div><button class="cbtn go" onclick="start()"><span>Start game</span></button>`;
  } else {
    // Online Multiplayer Setup
    if (S.netState === "idle") {
      h += `<div style="margin: 20px 0; display:flex; gap: 20px; align-items:center;">
        <button class="cbtn" style="--s:1.5; width:280px" onclick="startHosting()"><span>Host Game</span></button>
        <span style="font-size:28px; color:#fff3cf;">or</span>
        <input id="joinCodeInput" placeholder="ROOM CODE" maxlength="6" onkeydown="if(event.key==='Enter')joinRoomPressed()" style="text-transform:uppercase; width:220px; height:68px; font-size:32px; text-align:center;">
        <button class="cbtn alt" style="--s:1.5; width:240px" onclick="joinRoomPressed()"><span>Join Game</span></button>
      </div>`;
    } else if (S.netState === "hosting" || S.netState === "joining" || S.netState === "lobby") {
      const link = location.origin + location.pathname + "?room=" + NET.roomCode;
      h += `<div style="display:flex; align-items:center; gap:20px; margin-bottom:14px;">
        <div class="room-badge">Room Code: <b style="color:#c3f73a; letter-spacing:2px;">${NET.roomCode}</b></div>
        <button class="cbtn copy-btn" onclick="copyInviteLink('${link}')"><span>Copy Link</span></button>
        <span style="font-size:24px; color:#fff3cf;">${NET.isHost ? '(You are Host)' : '(Connected as Guest)'}</span>
        <button class="cbtn alt" style="--s:1.0; width:160px; margin-left:auto;" onclick="leaveOnlineLobby()"><span>Leave</span></button>
      </div>`;

      // Show connected player slots
      for (let i = 0; i < S.n; i++) {
        const r = S.rows[i] || { name: `Player ${i + 1}`, character: "", locked: false };
        const c = CHARACTERS.find(c => c.id === r.character);
        const isMe = (i === NET.myPlayerIndex);
        const canEdit = isMe;
        h += `<div class="row"><span class="dot" style="background:${COLORS[i]}"></span>
          <input data-player-input="${i}" value="${esc(r.name ?? `Player ${i + 1}`)}" ${canEdit ? "" : "disabled"} oninput="onPlayerNameInput(${i}, this.value)" onchange="onPlayerNameChanged(${i}, this.value)">
          <button class="cls" ${canEdit ? "" : "disabled"} onclick="${canEdit ? `S.pick=${i};drawSetup()` : ''}">
            ${c ? `<img src="${A(PORT[c.id] + ".svg")}" alt="">${c.name}` : "Pick a character"}
            <small>${isMe ? "(You - click to choose)" : "Player slot"}</small>
          </button>
        </div>`;
      }

      h += `<div id="smsg">${S.msg}</div>`;
      if (NET.isHost) {
        h += `<button class="cbtn go" onclick="startOnlineGame()"><span>Start game</span></button>`;
      } else {
        h += `<div style="font-size:30px; color:#c3f73a; margin-top:20px;">Waiting for host to start the game...</div>`;
      }
    }
  }

  if (S.pick != null) {   // the character chooser
    const takenIds = S.rows.slice(0, S.n).filter((r, i) => i !== S.pick && r.character).map(r => r.character);   // characters other players already have: shown faded and cannot be clicked
    h += `<div id="chooser" onclick="if(event.target===this){S.pick=null;drawSetup()}"><div class="grid">` +
      CHARACTERS.map(c => `<button class="card${takenIds.includes(c.id) ? " taken" : ""}" ${takenIds.includes(c.id) ? "disabled" : ""} onclick="onCharacterPicked('${c.id}')"><img src="${A(PORT[c.id] + ".svg")}" alt=""><div><b>${c.name}</b><span>${c.text}</span></div></button>`).join("") + `</div></div>`;
  }
  setupEl.innerHTML = h;

  // Restore focus & cursor position if a peer lobby update redrew the screen while typing
  if (savedInput && S.pick == null) {
    const restoreEl = savedInput.id
      ? $(savedInput.id)
      : (savedInput.playerIdx != null ? setupEl.querySelector(`input[data-player-input="${savedInput.playerIdx}"]`) : null);
    if (restoreEl && !restoreEl.disabled) {
      restoreEl.value = savedInput.value;
      restoreEl.focus();
      try {
        if (savedInput.selStart != null) restoreEl.setSelectionRange(savedInput.selStart, savedInput.selEnd);
      } catch (e) {}
    }
  }
}

function setGameMode(m) {
  S.mode = m;
  S.msg = "";
  drawSetup();
}

async function startHosting() {
  S.n = 1;
  initRows();
  S.msg = "Connecting to Peer network...";
  drawSetup();
  try {
    NET.onLobbyUpdate = () => drawSetup();
    await initHost();
    S.netState = "lobby";
    S.msg = `Room ${NET.roomCode} ready! Share the code or link with friends.`;
    drawSetup();
  } catch (err) {
    S.msg = "Failed to create room: " + (err.message || err);
    S.netState = "idle";
    drawSetup();
  }
}

async function joinRoomPressed() {
  const code = ($("joinCodeInput") && $("joinCodeInput").value) || "";
  if (!code.trim()) { S.msg = "Please enter a room code."; return drawSetup(); }
  await joinRoom(code.trim());
}

async function joinRoom(code) {
  initRows();
  S.msg = `Joining room ${code.toUpperCase()}...`;
  drawSetup();
  try {
    NET.onLobbyUpdate = () => drawSetup();
    const myName = "Player";   // the host assigns the real name (Player 2, 3, ...)
    await initGuest(code, myName);
    S.netState = "lobby";
    S.msg = `Connected to room ${NET.roomCode}!`;
    drawSetup();
  } catch (err) {
    S.msg = "Failed to connect to room " + code.toUpperCase();
    S.netState = "idle";
    drawSetup();
  }
}

let nameSyncTimer = null;

// leaveOnlineLobby(opts): leave the current room. opts.silent = true: say nothing to the other players (no "host left" / "bye" message): used when the whole group is moving to a new lobby (Play again).
function leaveOnlineLobby(opts) {
  const silent = !!(opts && opts.silent);
  if (nameSyncTimer) { clearTimeout(nameSyncTimer); nameSyncTimer = null; }
  if (NET.active && !silent) {
    try {
      if (NET.isHost) {
        broadcast({ type: "HOST_LEFT", room: NET.roomCode });   // (room: so a late copy of this message can never be mistaken for news about a different, newer room)
      } else if (NET.hostConn) {
        const bye = { _mid: makeMsgId(), type: "BYE", playerIndex: NET.myPlayerIndex };
        if (NET.hostConn.isRtcOpen()) NET.hostConn.rtcConn.send(bye);
        else {
          if (typeof mqttSend === "function") mqttSend(NET.hostConn.peer, bye, NET.hostConn.mqttIdx, true);
          if (NET.httpEnabled && NET.roomCode && NET.myId) {
            fetch("/api/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ room: NET.roomCode, src: NET.myId, dst: NET.hostConn.peer, data: bye })
            }).catch(() => {});
          }
        }
      }
    } catch (e) {}
  }
  if (typeof stopHeartbeat === "function") { stopHeartbeat(); stopRecovery(); }
  NET.gameStarted = false; NET.hostLost = false; NET.selfLost = false; NET.retired = false; NET.myToken = null; NET.seatHash = []; NET.waitMsg = null;
  if (typeof stopServerRelay === "function") stopServerRelay();
  if (typeof stopCloudRelay === "function") stopCloudRelay();
  if (NET.peer) {
    try { NET.peer.destroy(); } catch (e) {}
    NET.peer = null;
  }
  NET.active = false;
  NET.isHost = false;
  NET.joined = false;
  NET.connections = [];
  NET.peerMap = {};
  NET.hostConn = null;
  S.netState = "idle";
  S.rows = [];
  S.n = 2;
  S.msg = "";
  drawSetup();
}

function copyInviteLink(link) {
  navigator.clipboard.writeText(link).then(() => {
    S.msg = "Invite link copied to clipboard!";
    drawSetup();
  }).catch(() => {
    prompt("Copy invite link:", link);
  });
}

function onPlayerNameInput(idx, val) {
  initRows();
  if (S.rows[idx]) S.rows[idx].name = val;
  if (!NET.active) return;
  if (nameSyncTimer) clearTimeout(nameSyncTimer);
  nameSyncTimer = setTimeout(() => {
    nameSyncTimer = null;
    sendLobbyUpdate(val, undefined);
  }, NAME_SYNC_MS);
}

function onPlayerNameChanged(idx, val) {
  if (nameSyncTimer) { clearTimeout(nameSyncTimer); nameSyncTimer = null; }
  initRows();
  const clean = val.trim() || `Player ${idx + 1}`;
  if (S.rows[idx]) S.rows[idx].name = clean;
  if (NET.active) sendLobbyUpdate(clean, undefined);
}

function onCharacterPicked(characterId) {
  initRows();
  const idx = S.pick;
  if (S.rows[idx]) S.rows[idx].character = characterId;
  S.pick = null;
  if (NET.active) sendLobbyUpdate(undefined, characterId);
  drawSetup();
}

function startOnlineGame() {
  if (!NET.isHost) return;
  if (nameSyncTimer) { clearTimeout(nameSyncTimer); nameSyncTimer = null; }
  if (S.n < CONFIG.MIN_PLAYERS) {
    S.msg = `Waiting for at least ${CONFIG.MIN_PLAYERS} players to start.`;
    return drawSetup();
  }
  start();
}

// start(): the Start button. Checks the setup (every player has a character, nobody shares one), then builds the game and begins play().
function start() {
  S.pick = null; const t0 = performance.now();   // (timing: see the console line after render() below)
  if (!ART.ready) { S.msg = ART.error || "The art is still loading, try again in a moment."; return drawSetup(); }
  const rows = S.rows.slice(0, S.n); S.msg = "";
  if (rows.some(r => !r.character)) { S.msg = "Every player needs a character."; return drawSetup(); }
  // Two players can never hold the same character: the pick screens fade out characters that are already taken.
  // This check is only a safety net (it should never trigger); it stops the game instead of letting two players share a character.
  if (new Set(rows.map(r => r.character)).size < rows.length) { S.msg = "Two players have the same character."; return drawSetup(); }
  // G = the new game. players: name/character/position(pos)/colour. L = ladders, S = snakes, cobra = long snake's tail.
  // cat = the cat token (or null), catSkin = which cat picture is showing, catNow = true while the cat's own turn is running.
  G = { players: rows.map((r, i) => ({ name: r.name || `Player ${i + 1}`, character: r.character, pos: 1, color: COLORS[i], items: [] })), items: [], turnNo: 0, ...genBoard(), cat: null, catSkin: rnd(0, ART.cats.length - 1), catNow: false, winner: null, cur: null };
  assignKinds();
  const co = G.players.find(p => p.character === "cat");
  if (co) { G.cat = { pos: 1 }; G.catOwner = co; }
  $("setup").style.display = "none"; $("game").style.display = "block";
  $("log").innerHTML = "";
  setPrompt(""); log("<b>Welcome to Snakes, Ladders and Chaos! May the best player win.</b>");
  render();
  console.log(`start(): board generated + drawn in ${Math.round(performance.now() - t0)} ms`);
  for (let i = 0; i < ITEM_START; i++) spawnItem(true);                       // the game starts with a few items lying around
  log("Items are scattered across the board: step on one to pick it up!");

  if (NET.active && NET.isHost) {
    NET.gameStarted = true; NET.epoch = 0; NET.hostIdx = 0;                      // from now on the "reconnect" rules apply (see network.js)
    NET.seatHash = NET.seatHash.slice(0, G.players.length);                      // sha256 of every seat's secret token
    NET.connections.forEach(c => { delete c.token; c.lastRx = performance.now(); });
    // Send a clean snapshot of the game state (without circular / DOM references)
    const snapshot = {
      hashes: NET.seatHash, epoch: 0, hostIdx: 0, roomCode: NET.roomCode,
      players: G.players,
      items: G.items,
      turnNo: G.turnNo,
      L: G.L,
      S: G.S,
      cobra: G.cobra,
      kind: G.kind,
      cat: G.cat,
      catSkin: G.catSkin,
      catNow: G.catNow,
      winner: null,
      cur: G.cur
    };
    broadcast({ type: "GAME_START", G: snapshot, logHtml: $("log").innerHTML });
    saveSession();
  }

  play();
}

// ---- the five buttons at the bottom right. Each one opens a view in the right-hand column (Settings, Rulebook, Board log, Chat, Information): the selected one is pressed down and orange.
// openModal(title, html): show a big pop-up window centred on the SCREEN. It closes with the small X at its top right or by clicking anywhere outside the window.
function openModal(title, html) {
  const m = $("modal");
  m.innerHTML = `<div style="width:min(${MODAL.width}px, calc(100vw / var(--fit, 1) - ${MODAL.screenMargin * 2}px)); max-height:min(${MODAL.maxHeight}px, calc(100vh / var(--fit, 1) - ${MODAL.screenMargin}px))"><button class="mclose" onclick="$('modal').style.display='none'" title="Close" aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg></button><h2>${title}</h2><div class="mbody">${html}</div></div>`;
  m.style.display = "flex";
  attachScrollbar(m.querySelector(".mbody"), SCROLLBAR.modalEdge, 0);
}
// openRulebook() / openLog(): the big windows (opened by the Expand buttons of the small Rulebook / Board log panels). (The log window keeps filling live: log() in config.js also writes to #biglog.)
function openRulebook() { openModal("Rulebook", `<div class="big">${RULES_HTML()}</div>`); }
function openLog() { openModal("Board log", `<div class="big biglog" id="biglog">${$("log").innerHTML}</div>`); $("biglog").parentElement.scrollTop = 1e9; }   // (1e9 = "as far down as it goes")
// ---- attachScrollbar(el): a custom scroll bar for a scrolling area, drawn like the mockup (olive strip, dark arrow buttons, lime handle). ----
// It appears ONLY when there is something to scroll to, and follows the text as it grows. The element's parent must be positioned (position:absolute / relative).
// The browser's own scroll bar is hidden (class "scr" in css/style.css). All sizes come from SCROLLBAR in config.js.
function attachScrollbar(el, edge, bottom) {
  if (el._sbUpdate) return el._sbUpdate;
  bottom = bottom ?? SCROLLBAR.bottomGap;                   // gap between the bar and the panel edge below it (the same as the gap above the Expand button)
  edge = edge ?? SCROLLBAR.edge;                           // distance between the bar and the right edge of the area (small panels and pop-up windows use different values)
  const S = SCROLLBAR, parent = el.parentElement, fit = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fit")) || 1;
  const chev = (d) => `<svg viewBox="0 0 14 14" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const bar = document.createElement("div");
  bar.className = "sb";
  bar.style.cssText = `width:${S.width}px;padding:${S.padding}px;gap:${S.gap}px`;
  bar.innerHTML = `<button class="sbb up" tabindex="-1" aria-label="Scroll up" style="width:${S.button}px;height:${S.button}px">${chev("M2 9.5L7 4.5L12 9.5")}</button><div class="sbt"><i class="sbh" style="width:${S.thumbWidth}px;margin-left:${-S.thumbWidth / 2}px"></i></div><button class="sbb dn" tabindex="-1" aria-label="Scroll down" style="width:${S.button}px;height:${S.button}px">${chev("M2 4.5L7 9.5L12 4.5")}</button>`;
  parent.appendChild(bar);
  el.classList.add("scr");
  el.style.paddingRight = Math.max(parseFloat(getComputedStyle(el).paddingRight) || 0, S.width + edge + S.textGap) + "px";   // keep text clear of the bar (but never less padding than the area already had)
  const track = bar.querySelector(".sbt"), thumb = bar.querySelector(".sbh");
  // update(): show / hide the bar, place it at the right edge of the area, and size + move the handle to match the text position.
  function update() {
    const can = el.scrollHeight > el.clientHeight + 1;
    bar.style.display = can ? "flex" : "none";
    if (!can) return;
    bar.style.left = (el.offsetLeft + el.offsetWidth - S.width - edge) + "px";
    bar.style.top = (el.offsetTop + SCROLLBAR.gap) + "px";
    bar.style.height = (el.clientHeight - SCROLLBAR.gap - bottom) + "px";
    const room = track.clientHeight, max = el.scrollHeight - el.clientHeight;
    const h = Math.min(room, Math.max(S.thumbMin, room * el.clientHeight / el.scrollHeight));
    thumb.style.height = h + "px";
    thumb.style.top = (max ? el.scrollTop / max * (room - h) : 0) + "px";
  }
  el.addEventListener("scroll", update);
  new ResizeObserver(update).observe(el);
  new MutationObserver(update).observe(el, { childList: true, subtree: true, characterData: true });
  bar.querySelector(".up").onclick = () => el.scrollBy({ top: -S.step });
  bar.querySelector(".dn").onclick = () => el.scrollBy({ top: S.step });
  track.addEventListener("pointerdown", (e) => {            // click on the strip: jump one page towards the click (unless the handle itself was grabbed)
    if (e.target === thumb) return;
    const r = thumb.getBoundingClientRect();
    el.scrollBy({ top: (e.clientY < r.top ? -1 : 1) * el.clientHeight * .9 });
  });
  thumb.addEventListener("pointerdown", (e) => {            // drag the handle
    e.preventDefault(); thumb.setPointerCapture(e.pointerId);
    const y0 = e.clientY, top0 = el.scrollTop;
    const move = (ev) => {
      const room = track.clientHeight - thumb.offsetHeight, max = el.scrollHeight - el.clientHeight;
      el.scrollTop = top0 + (ev.clientY - y0) / fit() * (room ? max / room : 0);
    };
    const stop = () => { thumb.removeEventListener("pointermove", move); thumb.removeEventListener("pointerup", stop); };
    thumb.addEventListener("pointermove", move); thumb.addEventListener("pointerup", stop);
  });
  el._sbUpdate = update; update();
  return update;
}
// TOP = [ file-name part, tab title ]. The order here is the order on screen.
const TOP = [["settings", "Settings"], ["rulebook", "Rulebook"], ["boardlog", "Board log"], ["chat", "Chat"], ["about", "About"]];
// The rulebook text itself lives in js/rulebook.js (RULES_HTML). The About panel text (edit here):
$("about").innerHTML = "<p><b>Snakes, Ladders and Chaos!</b></p><p>Made by Hafiz 'idrankmilktwice' Shaikh.</p><p>No AI assets were used in the design, Claude wrote the code with a few changes here and there from me.</p><p>For business, bug reports or suggestions to the game: <a href=\"mailto:idrankmilktwice@gmail.com\">idrankmilktwice@gmail.com</a></p>";
$("ruleView").innerHTML = RULES_HTML();                     // the small Rulebook panel (the big window calls RULES_HTML() again)
["ruleView", "log", "about"].forEach(id => attachScrollbar($(id)));   // custom scroll bars for every scrolling panel (they appear only when needed)
attachScrollbar($("chatView"), SCROLLBAR.chatEdge);                  // the Chat's bar sits flush with the right edge of the send button (the chat area is as wide as the input row)
// ---- RIGHT-HAND PANELS (below the player panels) ----
// The right column shows ONE "view" at a time: the Current Event panel (the default), Settings, Chat or Information. Every view is a set of panels (class "rp") that slide in from
// beyond the right edge of the screen, overshoot a little and spring back (see ".rp.in" in css/style.css), and slide out again when another view replaces them.
// Settings is four separate orange panels that arrive one after another. Opening a view a second time plays the same animation, only faster.
const VIEWS = { event: ["evPanel"], settings: ["opSw", "opMute", "opSfx", "opMusic"], chat: ["chatPanel"], about: ["aboutPanel"], rulebook: ["rulePanel"], boardlog: ["logPanel"] };
// small helpers for the Settings panels: arrow icons and a "< 10 >" stepper (a number box with an arrow on each side)
const arrowSvg = d => `<svg viewBox="0 0 14 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const stepper = (id, minus, plus, val) => `<div class="stp"><button class="arr" onclick="${minus}" aria-label="Lower">${arrowSvg("M11 2.5L3 10L11 17.5")}</button><b class="stp-num" id="${id}">${val}</b><button class="arr" onclick="${plus}" aria-label="Raise">${arrowSvg("M3 2.5L11 10L3 17.5")}</button></div>`;
// drawSettings(): (re)fill the Settings panels from the current sound state (VOLUME, MUSIC_VOL, MUTED in audio.js). The panels themselves stay in place (so their animation is not restarted).
// The music buttons (previous / next song, play, loop, shuffle) are taken from audio.js's musicPanelHtml so they keep working with its click handler.
function drawSettings() {
  const t = document.createElement("div"); t.innerHTML = musicPanelHtml("tab");
  $("opMute").innerHTML = `<span class="oph">Mute</span>${muteSwitchHtml()}`;
  $("opSfx").innerHTML = `<span class="oph">SFX</span>${stepper("sfxNum", "stepSfx(-1)", "stepSfx(1)", VOLUME)}`;
  $("opMusic").innerHTML = `<div class="mrow"><span class="oph">Music</span>${stepper("musNum", "stepMusic(-1)", "stepMusic(1)", MUSIC_VOL)}</div>${t.querySelector(".mu-now").outerHTML}${t.querySelector(".mu-ctl").outerHTML}`;
  const online = NET.active && NET.gameStarted && !NET.retired;      // the Switch Device panel only exists during an online game
  $("opSw").style.display = online ? "" : "none";
  $("opSw").classList.toggle("live", !!(XFER_UI.code && performance.now() < XFER_UI.until));   // with a code showing, the panel uses smaller lettering so everything fits evenly
  if (online) $("opSw").innerHTML = swDeviceHtml();
  refreshMusicUi();                                                  // fills in the song name, play / loop / shuffle states
}
// stepSfx(d) / stepMusic(d): the arrows next to SFX and MUSIC change the volume by one step (0-10; 10 = full).
function stepSfx(d) {
  VOLUME = Math.max(0, Math.min(VOLUME_MAX, VOLUME + d));
  try { localStorage.setItem("snc_volume", VOLUME); } catch (e) { /* not saved: fine */ }
  $("sfxNum").textContent = VOLUME; sfx("small");                    // a click so you can hear the new level
}
function stepMusic(d) { setMusicVol(Math.max(0, Math.min(VOLUME_MAX, MUSIC_VOL + d))); $("musNum").textContent = MUSIC_VOL; }
// ---- Switch Device (online games): a one-time code that lets this player carry on from another device ----
const XFER_UI = { code: null, until: 0, timer: null, busy: false, err: "" };
const fmtLeft = s => Math.floor(s / SECONDS_PER_MINUTE) + ":" + String(s % SECONDS_PER_MINUTE).padStart(2, "0");
function swDeviceHtml() {
  const x = XFER_UI, live = !!(x.code && performance.now() < x.until);
  const body = live
    ? `<div class="swrow"><div class="swcodebox">${x.code.room}-${x.code.secret}</div><button class="swx" onclick="switchDeviceCancel()" title="Cancel" aria-label="Cancel"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg></button></div><div class="swleft" id="swLeft">${fmtLeft(Math.ceil((x.until - performance.now()) / MS_PER_SECOND))}</div>`
    : `<button class="swgen" onclick="switchDevicePressed()">Generate Code</button>${x.err ? `<p class="swerr">${esc(x.err)}</p>` : ""}`;
  return `<div class="oph">Switch Device</div>${body}`;
}
// switchDeviceCancel(): the X next to the code - the code stops working and the "Generate Code" box comes back
function switchDeviceCancel() {
  if (XFER_UI.timer) { clearInterval(XFER_UI.timer); XFER_UI.timer = null; }
  XFER_UI.code = null; XFER_UI.until = 0; XFER_UI.err = "";
  cancelTransferCode();
  drawSettings();
}
async function switchDevicePressed() {
  if (XFER_UI.busy) return;
  XFER_UI.busy = true; XFER_UI.err = "";
  try {
    const c = await requestTransferCode();
    XFER_UI.code = { room: c.room, secret: c.secret }; XFER_UI.until = performance.now() + c.ms;
    if (XFER_UI.timer) clearInterval(XFER_UI.timer);
    XFER_UI.timer = setInterval(() => {                          // count down; when it runs out the button comes back
      const left = Math.ceil((XFER_UI.until - performance.now()) / MS_PER_SECOND);
      if (left <= 0) { clearInterval(XFER_UI.timer); XFER_UI.timer = null; XFER_UI.code = null; if (TAB === "settings") drawSettings(); }
      else { const el = $("swLeft"); if (el) el.textContent = fmtLeft(left); }
    }, SWITCH_TICK_MS);
  } catch (e) { XFER_UI.err = (e && e.message) || "Could not make a code."; }
  XFER_UI.busy = false; drawSettings();
}
// setVolume(n): called when step n of the bar is clicked. Clicking step 1 while it is the only one lit mutes; any other step selects that volume.
function setVolume(n) {
  VOLUME = (n === 1 && VOLUME === 1) ? 0 : n;
  try { localStorage.setItem("snc_volume", VOLUME); } catch (e) { /* not saved: fine */ }
  drawSettings(); sfx("small");   // play a click so you can hear the new level
}
let TAB = "event";   // the view being shown (event / settings / chat / about); network.js reads this to count unread chat messages
let SHOWN = null;    // the view that is currently on screen (null = none yet)
const OPENED = {};   // which views have been opened before (a repeat opening plays a faster animation)
// showTab(k): switch the right column to view k. Clicking the tab that is already open goes back to the Current Event panel.
// (network.js / input.js still call showTab("boardlog") to leave the Chat tab; that is no longer needed, so unknown names are ignored.)
function showTab(k) {
  if (!VIEWS[k]) return;
  if (k === TAB && k !== "event" && SHOWN === k) k = "event";
  if (k === SHOWN) return;
  const leaving = SHOWN;
  if (leaving) VIEWS[leaving].forEach(id => $(id).classList.remove("in"));   // the old panels slide out to the right (fast)
  TAB = k; SHOWN = k;
  $("sidebox").classList.toggle("again", !!OPENED[k]); OPENED[k] = true;      // class "again" = the quicker version of the entrance
  if (k === "settings") drawSettings();
  VIEWS[k].forEach((id, i) => {                                              // the new panels slide in, one after another
    const el = $(id);
    el.style.setProperty("--d", ((leaving ? .12 : 0) + i * .05) + "s");
    el.classList.add("in");
  });
  ["settings", "rulebook", "boardlog", "chat", "about"].forEach(t => {       // pressed-down look for the open tab's button
    const on = t === k;
    $("tb_" + t).classList.toggle("on", on);
    const ta = ART.tabs && ART.tabs[t];                                      // green normally, orange when pressed (made in art.js initTabArt)
    if (ta) $("tb_" + t).querySelector(".face").src = on ? ta.p : ta.n;
  });
  if (k === "chat") {
    NET.unreadChat = 0;
    const btn = $("tb_chat");
    if (btn) btn.classList.remove("unread");
    // put the cursor in the typing field. The panel is still hidden for a moment while it slides in (a hidden field cannot take the cursor), so wait CHAT_FOCUS_DELAY_MS first.
    setTimeout(() => { const inp = $("chatInput"); if (TAB === "chat" && inp) inp.focus({ preventScroll: true }); }, CHAT_FOCUS_DELAY_MS);
  }
}
// ---- Current Event panel: shows the latest lines of the log (the flavour text) in a big font. A watcher on the hidden #log fills it, so lines from every source appear (host, guests, game rules). ----
function updateEvent() {
  const box = $("evText"), lines = [...$("log").children].slice(-EVENT_LINES);
  const html = (l, i, n) => `<div class="evl${i === n - 1 ? " new" : ""}">${l.innerHTML}</div>`;   // the newest line is big, the ones before it small (css ".evl")
  box.innerHTML = lines.map((l, i) => html(l, i, lines.length)).join("");
  // The panel shows as many of the latest lines as fit (in order, oldest at the top, centred vertically): drop the oldest until nothing is cut off.
  while (box.children.length > 1 && box.scrollHeight > box.clientHeight + 1) box.removeChild(box.firstChild);
}
new MutationObserver(updateEvent).observe($("log"), { childList: true });
// ---- The game screen appears (or disappears): show / hide the tab buttons in the window corner, and play the first panel animation. ----
let GAME_ON = false;
new MutationObserver(() => {
  const on = getComputedStyle($("game")).display !== "none";
  if (on === GAME_ON) return;
  GAME_ON = on;
  $("dockfix").style.display = on ? "block" : "none";
  $("stage").classList.toggle("ingame", on);                       // during a game the stage no longer clips, so the right-hand panels can fly in from the real window edge
  if (on) { SHOWN = null; TAB = "event"; showTab("event"); updateEvent(); }
  else { Object.values(VIEWS).flat().forEach(id => $(id).classList.remove("in")); SHOWN = null; TAB = "event"; }
}).observe($("game"), { attributes: true, attributeFilter: ["style", "class"] });
function chatSendPressed() {
  const inp = $("chatInput");
  if (!inp || !inp.value.trim()) return;
  sendChatMessage(inp.value);
  inp.value = "";
}
// expandPanel(): the Expand button of the Information panel - show its text in a big window.
function expandPanel() {   // the Expand button of the small Information / Rulebook / Board log panels: the same content in a big pop-up window
  if (TAB === "rulebook") openRulebook();
  else if (TAB === "boardlog") openLog();
  else openModal("About", `<div class="big">${$("about").innerHTML}</div>`);
}
$("topbtns").innerHTML = TOP.map((b, i) => `<button class="ib" id="tb_${b[0]}" style="left:${DOCK.pad + i * DOCK.pitch}px;top:${DOCK.padY}px" title="${b[1]}" onclick="showTab('${b[0]}')"><img class="face" src="${A(`button_${b[0]}.svg`)}" alt="${b[1]}"></button>`).join("");

// applyLayoutVars(): hand the prompt-scene positions from config.js to the style sheet (as CSS variables) so both always agree.
function applyLayoutVars() {
  const r = document.documentElement.style, P = PROMPT_SCENE;
  r.setProperty("--scene-x", P.rollCenterX + "px");                 // centre of the dice + ROLL button while rolling
  r.setProperty("--sb-w", SCROLLBAR.width + "px"); r.setProperty("--sb-edge", SCROLLBAR.edge + "px"); r.setProperty("--sb-edge-modal", SCROLLBAR.modalEdge + "px");   // scroll bar size + distance from the edge: the Expand and X buttons line up with it
  r.setProperty("--panel-x", P.panelCenterX + "px"); r.setProperty("--panel-y", P.panelCenterY + "px"); r.setProperty("--panel-w", P.panelWidth + "px");
}
applyLayoutVars();
// fit(): scale the fixed 1920x1080 stage to fill the window (with bars at the sides/top if the window isn't 16:9). Runs on load and whenever the window is resized.
function fit() { const s = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H); document.documentElement.style.setProperty("--fit", s);
  document.documentElement.style.setProperty("--off", ((innerWidth - STAGE_W * s) / 2 / s + PANEL_OFFSCREEN_MARGIN) + "px");   // --off = how far (in stage pixels) a right-hand panel must sit to be completely beyond the window's right edge   // --fit = the stage scale, also used by the character pick panels (css)
  $("stage").style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`; }
addEventListener("resize", fit); fit();

// ---- the three containers behind the sections ----
$("boxes").innerHTML = BOXES.map(b => `<div class="box" id="${b.id}" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"></div>`).join("");

// ---- start-up ----
loadSounds();                   // decode the sound effects in the background (see audio.js)
drawSetup();                    // show the setup screen straight away
window.REJOIN_P = loadAssets().then(async () => {
  drawSetup();
  if (typeof autoRejoin === "function" && await autoRejoin()) return true;   // the page was reloaded or crashed in the middle of an online game: back to the seat (title.js waits for this, so the title animations never play)
  // Auto-join room from URL query param ?room=CODE
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get("room");
  if (roomParam && !window.TITLE_ACTIVE) {   // (with the new title screen, js/title.js opens the Join screen for invite links instead)
    setGameMode("online");
    joinRoom(roomParam);
  }
  return false;
});
