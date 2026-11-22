// =====================================================================================
//  main.js  -  the setup screen, the Start button, the bottom-right tab buttons (Settings / Chat / Info panel + Rulebook / Combat log pop-ups), and window scaling.
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

function leaveOnlineLobby() {
  if (nameSyncTimer) { clearTimeout(nameSyncTimer); nameSyncTimer = null; }
  if (NET.active) {
    try {
      if (NET.isHost) {
        broadcast({ type: "HOST_LEFT" });
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
  }, 240);
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

// ---- the five round buttons at the bottom right. Settings, Chat and Info are TABS: the selected one (light, pressed down) decides what the brown box above them shows.
//      Rulebook and Combat log are not tabs: they open straight into a big window in the middle of the screen. ----
// openModal(title, html): show a big pop-up window centred on the SCREEN. It closes with the small X at its top right or by clicking anywhere outside the window.
function openModal(title, html) {
  const m = $("modal");
  m.innerHTML = `<div><button class="mclose" onclick="$('modal').style.display='none'" title="Close" aria-label="Close"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg></button><h2>${title}</h2>${html}</div>`;
  m.style.display = "flex";
}
// openRulebook() / openLog(): the Rulebook and Combat log icons. (The log window keeps filling live: log() in config.js also writes to #biglog.)
function openRulebook() { openModal("Rulebook", `<div class="big">${RULES_HTML()}</div>`); }
function openLog() { openModal("Combat log", `<div class="big biglog" id="biglog">${$("log").innerHTML}</div>`); $("biglog").scrollTop = 1e6; }
// TOP = [ file-name part, tab title ]. The order here is the order on screen.
const TOP = [["settings", "Settings"], ["rulebook", "Rulebook"], ["boardlog", "Combat log"], ["chat", "Chat"], ["about", "Information"]];
// The rulebook text itself lives in js/rulebook.js (RULES_HTML). The Information panel text (edit here):
$("about").innerHTML = "<p><b>Snakes, Ladders and Chaos!</b></p><p>Made by Hafiz Shaikh.</p><p>No AI assets were used in the design, Claude wrote the code with a few changes here and there from me.</p>";
// ---- Settings tab: Sound Effects volume bar (10 steps). Orange = selected volume, blue = the whole bar, lime outline on every step. ----
// drawSettings(): (re)draw the Settings panel from VOLUME (audio.js): the Mute switch on top, then two columns:
// left = Sound effects bar (+ Switch Device in online games), right = Music (volume, song name, play / loop / shuffle). The two columns are laid out by css/style.css (".st-cols").
function drawSettings() {
  let bar = "";
  for (let i = 1; i <= 10; i++) bar += `<div class="seg${i <= VOLUME ? " on" : ""}" title="${i * 10}%" onclick="setVolume(${i})"></div>`;
  const sfxHtml = `<div class="sfxrow"><span>Sound effects</span><span class="volnum">${VOLUME ? VOLUME * 10 + "%" : "Muted"}</span></div><div class="volbar">${bar}</div>`;
  $("settings").innerHTML = `<div class="st-mute">${muteRowHtml()}</div><div class="st-cols"><div class="st-col">${sfxHtml}${NET.active && NET.gameStarted && !NET.retired ? swDeviceHtml() : ""}</div><div class="st-col">${musicPanelHtml("tab")}</div></div>`;
}
// ---- Switch Device (online games): a one-time code that lets this player carry on from another device ----
const XFER_UI = { code: null, until: 0, timer: null, busy: false, err: "" };
const fmtLeft = s => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
function swDeviceHtml() {
  const x = XFER_UI, live = !!(x.code && performance.now() < x.until);
  // header row: "Switch Device" on the left, the 2-minute countdown on the right (same layout as "Sound effects" / 30%)
  const head = `<div class="sfxrow swhead"><span>Switch Device</span><span class="volnum" id="swLeft">${live ? fmtLeft(Math.ceil((x.until - performance.now()) / 1000)) : ""}</span></div>`;
  const body = live
    ? `<div class="swrow"><div class="swcodebox">${x.code.room}-${x.code.secret}</div><button class="swx" onclick="switchDeviceCancel()" title="Cancel" aria-label="Cancel"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 4L16 16M16 4L4 16" fill="none" stroke="#2f2504" stroke-width="3.6" stroke-linecap="round"/></svg></button></div>`
    : `<div class="swrow"><button class="swgen" onclick="switchDevicePressed()">Generate Code</button></div>${x.err ? `<p class="swerr">${esc(x.err)}</p>` : ""}`;
  return `<div class="swbox">${head}${body}</div>`;
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
      const left = Math.ceil((XFER_UI.until - performance.now()) / 1000);
      if (left <= 0) { clearInterval(XFER_UI.timer); XFER_UI.timer = null; XFER_UI.code = null; if (TAB === "settings") drawSettings(); }
      else { const el = $("swLeft"); if (el) el.textContent = fmtLeft(left); }
    }, 500);
  } catch (e) { XFER_UI.err = (e && e.message) || "Could not make a code."; }
  XFER_UI.busy = false; drawSettings();
}
// setVolume(n): called when step n of the bar is clicked. Clicking step 1 while it is the only one lit mutes; any other step selects that volume.
function setVolume(n) {
  VOLUME = (n === 1 && VOLUME === 1) ? 0 : n;
  try { localStorage.setItem("snc_volume", VOLUME); } catch (e) { /* not saved: fine */ }
  drawSettings(); sfx("small");   // play a click so you can hear the new level
}
drawSettings();
let TAB = "settings";   // the tab being shown in the brown box (Settings is the default until the new "latest event" panel exists)
// showTab(k): switch the brown box to tab k (settings / chat / about), and update the buttons (active = light + pressed, others = dark + raised).
// Other code (network.js, input.js) still calls showTab("boardlog") to leave the Chat tab; that is no longer needed (choices now appear over the board), so it does nothing.
function showTab(k) {
  if (k !== "settings" && k !== "chat" && k !== "about") return;
  TAB = k;
  ["settings", "chat", "about"].forEach(t => {
    const on = t === k;
    $("tb_" + t).classList.toggle("on", on);
    $("tb_" + t).querySelector(".face").src = A(`button_${t}_${on ? "light" : "dark"}.svg`);
  });
  $("about").style.display = k === "about" ? "block" : "none";
  $("settings").style.display = k === "settings" ? "block" : "none";
  if (k === "settings") drawSettings();                       // (the Switch Device part only exists during an online game)
  $("chatView").style.display = k === "chat" ? "block" : "none";
  $("chatInputBar").style.display = k === "chat" ? "flex" : "none";
  $("expand").style.display = k === "about" ? "block" : "none";   // only the Information panel can expand
  if (k === "chat") {
    NET.unreadChat = 0;
    const btn = $("tb_chat");
    if (btn) btn.classList.remove("unread");
  }
}

function chatSendPressed() {
  const inp = $("chatInput");
  if (!inp || !inp.value.trim()) return;
  sendChatMessage(inp.value);
  inp.value = "";
}
// expandPanel(): the Expand button of the Information panel - show its text in a big window.
function expandPanel() { if (TAB === "about") openModal("Information", `<div class="big">${$("about").innerHTML}</div>`); }
// The five buttons: Rulebook and Combat log open their big window directly, the other three switch the brown box.
const TAB_ACTION = { rulebook: "openRulebook()", boardlog: "openLog()" };
$("topbtns").innerHTML = TOP.map((b, i) => `<button class="ib" id="tb_${b[0]}" style="left:${DOCK.x + 14 + i * DOCK.pitch}px;top:${DOCK.y + 8}px" title="${b[1]}" onclick="${TAB_ACTION[b[0]] || `showTab('${b[0]}')`}"><img class="bsh" src="${A("button_shadow.svg")}" alt=""><img class="face" src="${A("button_" + b[0] + "_dark.svg")}" alt="${b[1]}"></button>`).join("");
showTab("settings");

// fit(): scale the fixed 1920x1080 stage to fill the window (with bars at the sides/top if the window isn't 16:9). Runs on load and whenever the window is resized.
function fit() { const s = Math.min(innerWidth / 1920, innerHeight / 1080); document.documentElement.style.setProperty("--fit", s);   // --fit = the stage scale, also used by the character pick panels (css)
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
