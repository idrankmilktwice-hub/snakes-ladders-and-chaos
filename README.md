# Snakes, Ladders and Chaos!

A browser board game: Snakes and Ladders with six character classes that bend the rules, local play and
online multiplayer (2 to 6 players) with automatic reconnecting.
Plain HTML, CSS and JavaScript - no frameworks, no build step. The only outside script is PeerJS (loaded from unpkg in `index.html`).

Copyright (c) 2026 Hafiz Shaikh. All Rights Reserved. See `LICENSE.md`.

Live site: https://idrankmilktwice-hub.github.io/snakes-ladders-and-chaos/

## Run it

1. Install Python 3 (python.org).
2. In this folder run `python serve.py` - it opens http://localhost:8000.

(Opening `index.html` by double-click will not work: browsers block reading the `assets/` folder from a file.)
The live site is GitHub Pages (Settings > Pages publishes the branch). After pushing, wait a minute or two and hard-refresh (Ctrl+Shift+R).

## Project layout

```
index.html          page structure: every element the code looks up by id, and the script load order
LICENSE.md          the copyright / all-rights-reserved notice (the same text is shown at the bottom of the title screens)
README.md           this file
RULES.txt           the full rules: every class, items, bonus-roll rules
serve.py            tiny local web server; also relays online-game messages over HTTP/SSE when you play on your own network
css/
  style.css         all styling and screen positions (palette variables, buttons, panels, title screens, reconnect UI)
js/                 game code, loaded in THIS order by index.html (each file may only use things from the files above it)
  config.js         settings, class descriptions, colours, layout numbers, SOUNDS, helpers ($, d6, rnd, sleep, esc, log)   <- start here for small changes
  board.js          square numbering (rc, toN, xy, squareAt) and random snake/ladder generation (genBoard)
  art.js            loading the SVG art from assets/manifest.json (A(), T(), ART, loadAssets, assignKinds)
  audio.js          sound effects: sfx("name") (which file is which: SOUNDS in config.js); VOLUME
  preload.js        starts loading art / fonts / sounds at page open and drives the loading bar (list new art files in PRELOAD_SVGS)
  render.js         drawing: tiles, snakes, ladders, pawns, player panels, disconnected icon (render, buildBoard, buildPanels, placePawns, updateDisconnectLook, switchCat)
  network.js        ALL online multiplayer: connections, lobby, game sync, heartbeat, reconnect, host migration, switch-device codes (see "Online play" below)
  input.js          prompts/buttons, drag and drop, the dice, Space bar (rollDice, choose, awaitMove, awaitItemChoice, awaitTarget, launch, setPrompt)
  rules.js          class rules (LOGIC), items, flavour text (FLAVOR), snakes/ladders (slide), pushes (hit), the turn loop (play), state sync to guests (syncGameState)
  rulebook.js       the Rulebook tab text (RULES_HTML), built from config.js numbers
  main.js           start(), tabs (log / rulebook / chat / settings / about), Settings tab (volume + Switch Device), chat, window scaling (fit), start-up
  title.js          the title screen (logo, Play / Options / About, light/dark switch), its animations (TT, glide, pop), green buttons (gbBuild), the "Attempting to reconnect" card
  local.js          the Local, Host and Join screens (player lines), the class pick panels, joinPressed, leaveTitle; loads last
assets/             all SVG art (tiles, snake heads/bodies, ladders, 10 cats cat_1..cat_10, items, buttons, panels, disconnected.svg), the font, sounds/ (mp3), manifest.json
docs/               design mockups, title-screen references, colour palette (palette.svg)
tools/
  build_standalone.py   packs everything into one self-contained dist/snakes-ladders-and-chaos.html
```

Every function and variable in the JS files has a comment saying what it does and where it is used.

Cache busting: `index.html` loads every file as `file.js?v=NN`. When you change a file, raise the number (all of them is fine) so browsers do not keep the old copy.
Some files use Windows line endings (CRLF); keep the file's existing line endings when editing.

## The big pieces of live data (globals)

| Name   | Defined in  | What it is |
|--------|-------------|------------|
| `G`    | config.js   | the running game: `players`, `items`, `L` (ladders), `S` (snakes), `cobra`, `kind`, `cat`, `catSkin`, `catNow`, `cur` (whose turn), `order`, `turnNo`, `winner`. `null` until a game starts |
| `S`    | config.js   | the setup/lobby screen state: `n` (players), `rows` (name + character per line), `mode` ("local" / "online"), `netState` |
| `NET`  | network.js  | everything about the online connection (see below). `NET.active` is true during an online game or lobby |
| `ART`  | art.js      | the loaded art: tiles, heads, cobra, digits, `cats` (list from manifest.json), items, ladders |
| `DICE` | input.js    | the dice currently on the rolling board |
| `TT`   | title.js    | the title screen state (`TT.instant` = skip animations) |

Each player in `G.players` is a plain object: `name, character, pos, color, items, cb` (buff), `pen` (debuff), `big`, `cd` (Charmer recharge), and online only `disconnected` / `missed`.

## Turn flow (rules.js)

`play()` loops over `G.order` (Snake Charmer first, cat owner last). For each player: item phase, then their class's `LOGIC` function (roll, move, abilities), then the cat's turn for the cat owner.
Player input is awaited through `rollDice`, `choose`/`ask`, `awaitMove`, `awaitItemChoice`, `awaitTarget` (input.js). Forced-effect rolls (Struggler, Bully) use `rollCheck` so the player throws the die themselves.
In online games only the host runs `play()`; guests mirror the state.

## Online play (network.js)

**Model.** One host runs the game and is the only authority. Guests send their actions (`ACTION_REQ`) and receive state (`STATE_SYNC`, `ACTION_SYNC`, `WAIT_*` prompts, `LOG_LINE`). The host only accepts an action from the seat the game is currently waiting for, identified by its connection, never by what the message claims.

**Transports (tried together, the first that works carries the traffic).** Direct WebRTC via PeerJS; the local `serve.py` HTTP/SSE relay; public MQTT-over-WebSocket brokers; the PeerJS socket relay. `createHybridConn(...).send()` picks the path. There is no TURN server, so some strict networks cannot connect at all.

**Addresses.** The room code is 5 letters. The host's address is `hostPeerId(code, epoch)`; epoch 0 is the original host and every host change gets the next epoch.

**Seats and tokens.** Each seat has a secret token, made by the host. Every player keeps only the sha256 hash of every seat's token (`NET.seatHash`), so any player can verify a returning player without learning anyone's secret. A player's own token and room are saved in the browser (`snc_session` in sessionStorage and localStorage: `saveSession`, `loadSession`, `pickAutoSession`, `clearSession`).

**Disconnects.**
- Guests ping the host every second (`startHeartbeat`); nothing heard for 2.8 s = lost (`monitorTick`). A closed tab says goodbye (`BYE` / `HOST_LEFT`) and is noticed at once.
- The host keeps a lost player's seat and marks `p.disconnected = true` (`onSeatLost`), unblocks anything waiting on them (`hostAutoResolve`) and tells everyone (`PLAYER_LEFT`).
- A disconnected player behaves like an ordinary pawn: no abilities, no prompts, no item pickups (checks of `p.disconnected` throughout rules.js).
- At the start of a disconnected player's turn the game waits `CONFIG.RECONNECT_MS` (5 s, config.js) with a countdown (`waitForReconnect`), then skips them; later turns are skipped at once until they return. The cat owner's cat is skipped too.

**Coming back.** A page that is reloaded or closed and reopened takes its seat back by itself (`autoRejoin`, called from main.js; the title screen waits up to 2 s for it, so the title animations never play). Otherwise typing the room code on the Join screen works, and so does the room box in the reconnect banner. Strangers are refused once a game has started (`hostRejoin`). Two pages for one seat: the newest wins and the older one is told to stop (`SEAT_TAKEN`).

**Host leaves.** Guests keep knocking on every possible host address (`recoveryTick`); the first connected seat in seat order becomes the new host (`maybeElect`, `becomeHost`) from the last state it received and resumes the interrupted turn (`play({ resume: true })`). If two hosts ever exist at once they compare notes and one steps down (`answerHostProbe`, `stepDown`). If nobody is hosting for 15 s the lobby is over (`endLobby`).

**Switch Device.** Settings tab > Switch Device > Generate Code shows `ROOM-SECRET` (for example `FGHD5-HHXQC1`, valid 2 minutes, one use). Typing it on another device's Join screen moves the seat there and stops the old device. The host's own seat can move too (`hostHandover`). Codes: `makeTransferCode`, `requestTransferCode`, `cancelTransferCode`, `hostRejoin`, `seatTakeover`. A device that repeats its already-used code gets the same answer again, never "wrong code".

**Reconnect screens.** Top banner while in a game (`showNetworkBanner`, `manualRejoin`); full-screen notice when a page gives up its seat (`retireSelf`); on the title screen a small card at the bottom right shows "Attempting to reconnect to the Lobby", a 15 s countdown and a green "Abandon Game" button (`showReconnectCard` in title.js, driven by `REJOIN_STATE`, `onRejoinTick`, `onRejoinEnd`, `abandonRejoin`).

**Screens and links.** An invite link `?room=CODE` opens the Join screen with no animations and joins (`initTitle` in title.js, `TT.instant`). The copyright notice sits at the bottom of the title screens (`#tCopy` in index.html).

## Common changes

| I want to...                         | Edit                                             |
|--------------------------------------|--------------------------------------------------|
| change number of snakes/ladders      | `CONFIG` in `js/config.js`                       |
| change how long a disconnected player's turn waits | `CONFIG.RECONNECT_MS` in `js/config.js`     |
| change a class description           | `CHARACTERS` (and `CHARACTER_BRIEF`) in `js/config.js`, rule text in `js/rulebook.js` |
| change item numbers (3 slots, start count, spawn every N turns) | `ITEM_*` in `js/config.js`      |
| change where the three containers / panels sit | `BOXES`, `BOARD_BOX`, `PANEL`, `BX0`.. in `js/config.js` |
| change what the board log says       | `FLAVOR` in `js/rules.js`                        |
| change how a class plays             | `LOGIC` in `js/rules.js`                         |
| change pawn / snake / number sizes   | `js/render.js` (`placePawns`, `SW`, `NUM_H`)     |
| change which sound plays             | `SOUNDS` in `js/config.js` (and `ROLL_MS` for the dice roll length) |
| swap or add art                      | put the SVG in `assets/`, list it in `assets/manifest.json` and in `PRELOAD_SVGS` in `js/preload.js` |
| add a cat picture                    | add `cat_N.svg` to `assets/`, list it under `"cats"` in `assets/manifest.json` and in `js/preload.js` (the code uses however many are listed) |
| change online timing (ping, timeout, give-up, election, code lifetime) | the constants near the top of `js/network.js` (`HB_*`, `RECOVERY_GIVEUP_MS`, `REJOIN_GIVEUP_MS`, `ELECT_*`, `XFER_TTL_MS`) |
| change the copyright text            | `#tCopy` in `index.html` and `LICENSE.md`        |
| change the Settings tab / Switch Device look | `drawSettings`, `swDeviceHtml` in `js/main.js`, `#settings ...` rules in `css/style.css` |

## Notes

- The game is drawn on a fixed 1920x1080 stage that is scaled to fit the window (`fit()` in `js/main.js`).
- Snake bodies and ladders use the art in `assets/`; a snake with no body picture falls back to a flat placeholder.
- Every snake gets its own head design (8 heads + the cobra = 9 snakes). If you raise `CONFIG.SNAKES`, add heads to `assets/manifest.json` first.
- The background is the flat blue with `assets/pattern.svg` (a square tile, 1 viewBox unit = 1 pixel) repeated over it. Replace that file with your design; no code change needed.
- Online messages are plain JSON with a `type` (for example `JOIN_REQ`, `GAME_START`, `STATE_SYNC`, `WAIT_ROLL`, `ACTION_REQ`, `PING`, `REJOIN_ACK`, `HOST_HANDOVER`, `HOST_MOVED`, `XFER_REQ`); the routing is one big `switch` in `handleNetData` (network.js).
- There is no automated test suite in the repo. After changes, check that the browser console is empty on load, then play a local game and a two-device online game, including a reload mid-game.
- A merge conflict once left `<<<<<<<` markers in the deployed files and broke the whole game. Before pushing, search the project for lines starting with `<<<<<<<`, `=======` or `>>>>>>>`; there must be none.
- `python tools/build_standalone.py` packs everything into one self-contained `dist/snakes-ladders-and-chaos.html` for quick sharing or previewing.

## Working on this project with Claude

When asking for a change, say which screen or feature it is about and attach the files named in the layout above that are involved (for example `network.js` + `title.js` + `local.js` for join/lobby behaviour). Ask for only the changed files back, in the repo's folder layout, and paste them over the existing ones.
