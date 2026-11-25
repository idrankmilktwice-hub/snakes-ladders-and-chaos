// =====================================================================================
//  endgame.js  -  everything about LEAVING a game: the Quit button, "Play again" (back to the lobby screen WITHOUT reloading the page, so the music keeps playing),
//  moving all connected players into a new lobby, and the BOO / CHEER reactions on the victory screen.
//  Numbers: NEW_LOBBY_*, QUIT_RELOAD_MS in config.js. The winner scene itself is in prompts.js; the network messages (REACT, NEW_LOBBY, LEAVE) are handled in network.js.
// =====================================================================================

// reactSound(group): BOO / CHEER. A random variation of the sound group (e.g. "bad_oracle") plays on THIS device and is sent to every other player, who play the same one.
// It uses the direct sound player (sfx), not the single "voice channel", so spammed reactions overlap instead of cutting each other off.
function reactSound(group) {
  const list = SFX_GROUPS[group], name = list ? pick(list) : group;
  sfx(name);
  if (!NET.active) return;
  const msg = { type: "REACT", name };
  if (NET.isHost) broadcast(msg);
  else if (NET.hostConn && NET.hostConn.open) NET.hostConn.send(msg);
}

// leaveGameScreen(): take the (finished) game screen away and bring the title screen back - exactly as it was when the game started (the Local / Host / Join lobby screen is still on it).
// The page is NOT reloaded, so the music goes on.
function leaveGameScreen() {
  if (SCENE.hideTimer) { clearTimeout(SCENE.hideTimer); SCENE.hideTimer = null; }
  SCENE.locked = false; SCENE.open = false; SCENE.actor = null; SCENE.peek = false;
  $("scene").classList.remove("on", "rollmode"); $("game").classList.remove("scened", "peek"); $("eyeBtn").classList.remove("on", "closed");
  $("quitBox").style.display = "none";
  if (DICE.hideTimer) { clearTimeout(DICE.hideTimer); DICE.hideTimer = null; }
  trayHide(); $("rollBtn").classList.remove("ready"); $("moveBtn").style.display = "none";
  setPrompt(""); $("log").innerHTML = ""; $("modal").style.display = "none";
  $("game").style.display = "none";                    // (main.js notices this: the tab buttons and panels go away)
  G = null;
  const t = $("title");
  t.classList.add("on"); document.body.classList.add("on-title"); document.documentElement.classList.add("on-title");
}

// playAgain(): the PLAY AGAIN button.
//  - single screen: back to the Local screen.
//  - online HOST: a NEW lobby with a NEW code is created at once and every connected player is told to follow (their names and characters come along).
//  - online guest: follows the host as soon as the new lobby exists (right now if the host already made it).
async function playAgain() {
  if (!NET.active) { leaveGameScreen(); return; }
  const me = G && G.players[NET.myPlayerIndex], name = me ? me.name : "Player", character = me ? me.character : null;
  if (NET.isHost) {
    const code = genRoomCode();
    broadcast({ type: "NEW_LOBBY", code });            // 1. tell everybody the new code while the old room is still open
    await sleep(NEW_LOBBY_FLUSH_MS);
    leaveGameScreen(); clearSession();
    await makeHostLobby(code, name, character);        // 2. open the new room (this closes the old one) and show the Host screen with the new code
  } else if (NET.nextLobby) followToNewLobby(NET.nextLobby);
  else {
    const b = document.querySelector("#sceneBtns .pbtn");     // the host has not opened the new lobby yet: say so and wait (NEW_LOBBY will arrive)
    if (b) { b.classList.add("off"); b.onclick = null; b.querySelector(".pbl").textContent = "Waiting for the host..."; }
  }
}
// makeHostLobby(code, name, character): the Host screen with a freshly created room that has the given code (hostGenerate() in local.js does the same with a random code).
async function makeHostLobby(code, name, character) {
  TT.net = true;
  try {
    if (NET.active) leaveOnlineLobby();
    S.mode = "online"; S.rows = []; initRows(); S.n = 1; NET.onLobbyUpdate = onlineLobbyUpdate;
    await initHost(code);
    S.netState = "lobby";
    S.rows[0].name = name; if (character) S.rows[0].character = character;
    $("hCode").textContent = NET.roomCode; $("hCode").classList.remove("empty"); gbLabel($("hGen"), "Generate Code"); $("hGen").disabled = false;
    onlineLobbyUpdate();
  } catch (err) { toast($("hGen"), "Could not create lobby!", false, "below"); }
  TT.net = false;
}
// followToNewLobby(code): a guest joins the host's new room. Their name and character are sent again once they are in. The new room may take a moment to open, so it keeps trying.
async function followToNewLobby(code) {
  const me = G && G.players[NET.myPlayerIndex], name = me ? me.name : "Player", character = me ? me.character : null;
  leaveGameScreen(); clearSession();
  for (let k = 0; k < NEW_LOBBY_TRIES; k++) {
    try {
      if (NET.active) leaveOnlineLobby();
      S.mode = "online"; S.rows = []; initRows(); S.n = 0; NET.onLobbyUpdate = onlineLobbyUpdate;
      await initGuest(code, "Player", {});
      S.netState = "lobby"; NET.following = false; NET.nextLobby = null;
      $("jCode").value = code; $("jCode").disabled = true; gbLabel($("jBtn"), "Joined"); $("jBtn").disabled = true;
      onlineLobbyUpdate();
      sendLobbyUpdate(name, character);
      return;
    } catch (err) { await sleep(NEW_LOBBY_RETRY_MS); }
  }
  NET.following = false; NET.nextLobby = null;
  if (NET.active) leaveOnlineLobby();
  toast($("jBtn"), "Can't find the new lobby!", false, "right");
}

// ---- QUIT ----
// askQuit(): the Quit button. Asks YES / NO in a light panel over the dark board.
function askQuit() {
  const box = $("quitBox"), online = NET.active && G && !G.winner;
  box.innerHTML = `<div class="lp"><div class="st">${PROMPT_TEXT.quit}</div><div class="sb2">${online ? PROMPT_TEXT.quitOnline : PROMPT_TEXT.quitLocal}</div><div class="qbtns"></div></div>`;
  const row = box.querySelector(".qbtns");
  row.appendChild(sceneButton(PROMPT_TEXT.yes, "long", () => doQuit()));
  row.appendChild(sceneButton(PROMPT_TEXT.no, "long", () => { box.style.display = "none"; }));
  box.style.display = "flex";
}
// doQuit(): YES. Online: the others are told (they see "<name> abandoned the game" and the panel and pawn disappear), then this page reloads to the title screen. Single screen: just back to the title.
function doQuit() {
  $("quitBox").style.display = "none";
  if (NET.active && G && !G.winner) {
    if (NET.isHost) abandonSeat(NET.myPlayerIndex);
    else if (NET.hostConn && NET.hostConn.open) NET.hostConn.send({ type: "LEAVE" });
  }
  clearSession();
  setTimeout(() => location.reload(), QUIT_RELOAD_MS);
}
