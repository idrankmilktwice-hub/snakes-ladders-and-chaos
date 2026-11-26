# Snakes, Ladders and Chaos!

A browser board game: Snakes and Ladders with six character classes that bend the rules.
Plain HTML, CSS and JavaScript - no frameworks, no build step. Play on one screen (Local) or online (Host / Join).

## Run it

1. Install Python 3 (python.org).
2. In this folder run `python serve.py` - it opens http://localhost:8000.

(Opening `index.html` by double-click will not work: browsers block reading the `assets/` folder from a file.)

## Project layout

```
index.html          page structure (what elements exist and where scripts load)
css/
  style.css         all styling and screen positions
js/                 game code, loaded in this order by index.html
  config.js         settings, character descriptions, colours, layout numbers, the SOUNDS list and every TUNING NUMBER (timings, sizes, rule values)   <- start here for small changes
  board.js          square numbering and random snake/ladder generation
  art.js            loading the SVG art (assets/manifest.json)
  audio.js          sound effects, the game-event "voice channel", the music player and the mute / music controls
  preload.js        starts loading art / fonts / sounds at page open and drives the loading bar (its own numbers are named at the top)
  render.js         drawing: snakes, ladders, tiles, pawns, player panels
  network.js        online play (PeerJS): lobby, the host runs the game and sends the state and sounds to the guests
  input.js          the message / helper button, drag and drop, the dice (each character's own design), Space bar, clicking the cat
  endgame.js        leaving a game: the Quit button, Play again (back to the lobby screen without reloading, so the music keeps playing), moving everybody into a new lobby, BOO / CHEER
  prompts.js        the prompt scenes: full-body character + panel (Bully, Oracle, Struggler, Snake Charmer, plain questions), the roll scene, the eye button, the helper button's width
  rules.js          character rules, ITEMS, flavour text, the turn loop, character reactions   <- edit character and item behaviour here
  rulebook.js       the Rulebook text (RULES_HTML), built from config.js numbers; shown in the small panel and the big window
  main.js           start screen, the right-hand panels (Current Event, Settings, Chat, Information, Rulebook, Board log), the bottom-right buttons, custom scroll bars, pop-up windows, window scaling
  title.js          the title screen (logo, Play / Options / About, light/dark switch, mute switch); loads after main.js
  local.js          the Local, Host and Join screens (player lines) and the character pick panels; loads after title.js
assets/             all SVG art (including game_icon.svg, the browser tab icon, and one dice_<character>.svg per dice design), the font and manifest.json, plus:
  sounds/           mp3 sound effects (buttons, dice, game events, character reactions)
  music/            the songs (song_<Name_With_Underscores>.mp3)
docs/mockup.jpg     the first design mockup
docs/mockup_v2.jpg  the mockup with the three containers and item slots
docs/Title_Screen.jpg, Play_Screen.jpg, Local_Screen.jpg  the title screen reference; docs/palette.svg  the colour palette
RULES.txt           the full rules: every class, prompts, items, bonus-roll rules, controls
serve.py            tiny local web server
```

Every function and variable in the JS files has a comment saying what it does and where it is used.

`index.html` loads every script and the stylesheet with a version number (`?v=30`). When you change a file, raise the number on every line so browsers do not keep using an old cached copy.

## Common changes

| I want to...                         | Edit                                             |
|--------------------------------------|--------------------------------------------------|
| change number of snakes/ladders      | `CONFIG` in `js/config.js`                       |
| change a character description       | `CHARACTERS` in `js/config.js`                   |
| change item numbers (3 slots, start count, spawn every N turns) | `ITEM_*` in `js/config.js`      |
| change where the board / player panels sit, tile size | `BOXES`, `BOARD_BOX`, `PANEL`, `PANEL_ZONE`, `TW`, `CX`, `BX0`.. in `js/config.js` |
| change what the board log says       | `FLAVOR` in `js/rules.js`                        |
| change how a character plays         | `LOGIC` in `js/rules.js`                         |
| change pawn / snake / number sizes   | `PAWN_*`, `SNAKE_*`, `NUM_*` in `js/config.js` / `js/render.js` |
| change which sound plays             | `SOUNDS` in `js/config.js` (and `ROLL_MS` for the dice roll length) |
| add a variation of a sound           | add a line to `SOUNDS` with the same name and the next number, e.g. `stone_4` (the game picks one at random) |
| change when a sound plays            | the `gameSfx(...)` / `cheer(...)` calls in `js/rules.js`, `flyItem` in `js/input.js` |
| change how loud one sound is         | its `volume` in `SOUNDS` (a multiplier on top of the player's Settings volume) |
| change the delay before a stone victim reacts | `STONE_BAD_DELAY` in `js/config.js`    |
| change any number (a timing, size, distance, rule value) | the named constants in the "TUNING NUMBERS" part of `js/config.js` (network timings: top of `js/network.js`; loading bar: top of `js/preload.js`) |
| change where the prompt character / panel / dice sit | `PROMPT_SCENE`, `FULL_ART`, `PROMPT_BTN` in `js/config.js` |
| change a character's dice design     | put the new SVG in `assets/` (all 6 faces side by side, equal squares, in order 1-6) and edit `DICE_ART` in `js/config.js`; list the file in `PRELOAD_SVGS` in `js/preload.js` |
| change the browser tab icon          | replace `assets/game_icon.svg` (the `<link rel="icon">` in `index.html` points to it; browsers cache tab icons, so hard-refresh) |
| change the BOO sound                 | the `boo` entry in `SOUNDS` in `js/config.js` (`BOO_SOUND` names it) |
| change the scroll bar or the pop-up window size | `SCROLLBAR`, `MODAL` in `js/config.js` |
| change the words on the prompts      | `PROMPT_TEXT` in `js/prompts.js`                 |
| add or rename a song                 | put the mp3 in `assets/music/` and edit `MUSIC` at the top of `js/audio.js` |
| change how loud the music is compared with the effects | `MUSIC_GAIN` in `js/audio.js`  |
| change how fast an interrupted sound finishes | `VOICE_WRAP_S` in `js/audio.js`         |
| swap or add art                      | put the SVG in `assets/`, list it in `assets/manifest.json` |

## Sound and music

**Sound effects** are short mp3 files in `assets/sounds/`, listed in `SOUNDS` in `js/config.js`. Each entry has the file, `skip` (seconds of leading silence to cut so the sound lands exactly on the action) and an optional `volume`. They are decoded once at start-up and played with the Web Audio API. `sfx("name")` plays one directly (buttons, dice and the landing sounds use this).

**Sound groups.** Sounds whose names share a prefix and a number form a group (`snake_1`, `snake_2` = the group `snake`). Asking for the group plays one at random. A name without a number (`drink`, `win`) is a group of one.

**Game-event sounds**

| Event | Sound |
|-------|-------|
| Energy drink used | `drink` |
| A stick pokes a snake, or the Snake Charmer drops a head | `snake` (2 variations) |
| A thrown stone hits a pawn | `stone` (3 variations), then the victim's `bad_<character>` 450 ms later |
| The cat knocks a player down | `cat` |
| Something bad happens to a character: bitten by a snake, hit by a stone, steps on a toy brick, pushed or pulled by the Bully, or (Struggler) fails a ladder climb | `bad_<character>` (the character's own reaction) |
| The Bully nudges someone | `bully_nudge` (2 variations) |
| A character climbs a ladder, picks up or swaps an item, or rolls a 6 | `happy_<character>` |
| The Struggler survives a forced effect (dodges a snake, push, nudge or the cat's charm) | `happy_struggler` |
| Someone wins | `win` (plays once) |
| The BOO button on the victory screen | `boo` (`assets/sounds/sound_boo.mp3`, the same for every character; the CHEER button plays the character's own `happy_<character>`) |
| Clicking the cat | `cat`, no cooldown, heard only by the player who clicked (it is not sent to anybody else), only when no other game sound is playing; no extra click sound |

Rules for the reactions: a character cheers at most once per turn; a 6 cheers only after the move finishes and only if no snake bit that character (then the sad sound plays instead); the Gambler counts double 6s as his 6. `<character>` is `bully`, `gambler`, `cat`, `struggler`, `oracle` or `charmer`.

**The voice channel (no overlapping sounds).** All game-event sounds go through one channel that plays a single sound at a time (button clicks and the dice are separate). A newer event always wins: the sound still playing is sped up so it finishes in about a tenth of a second instead of being cut off, then the new sound starts. If several events pile up (the player taps Space very fast), only the newest waiting sound is kept. A "chained" sound (the victim's reaction after a stone) waits for the current sound to end normally and is dropped if a newer event arrives first. Muting stops the current sound at once.

**Online.** Guests do not run the rules, so the host picks each variation and sends it (`GAME_SFX` message in `js/network.js`); everyone hears the same sound. The stone's impact sound and the win sound are played by each guest's own page.

**Music.** The songs in `assets/music/` are streamed (not decoded up front) and play one after another through the whole game, starting on the player's first click (browsers block audio before that). Controls, on the title screen's Options page and in the board's Settings tab:

- **Mute** (the first setting) silences everything: music, effects and reactions. The same switch is under the light/dark switch on every title-side screen. All the mute switches stay in sync.
- **Sound effects** volume and **Music** volume are separate 10-step bars.
- **Now playing** shows the song name, with previous / next buttons.
- **Play / pause**, **loop** (repeat the current song) and **shuffle** (random next song, on by default).

The player's choices (effects volume, music volume, mute, loop, shuffle) are remembered in the browser (`snc_volume`, `snc_music_vol`, `snc_muted`, `snc_loop`, `snc_shuffle`).

## Screen layout

Everything is drawn on the fixed 1920x1080 stage (scaled to the window). The tab buttons are the exception: they stick to the bottom-right corner of the real window.

- **Left:** the board, on an orange rounded rectangle with a red outline. Tiles are rectangular (`tile_dark.svg` / `tile_light.svg`), the square numbers are drawn in the Blustrue font, and every tile has a dark-brown shadow.
- **Top right:** the player panels (`player_panel.svg`). The player whose turn it is is big on top; the others sit in a ring below and glide round (counter-clockwise) as turns pass. Each panel has a disc in the pawn's colour behind the head, three item slots and one number square (orange = bonus, blue = penalty).
- **Below the panels:** one view at a time, switched by the five buttons at the bottom right (press the open one again to go back to Current Event):
  - **Current Event** (default): the latest log lines (newest big), and the message + MOVE ME button while the game waits for you.
  - **Settings:** four orange panels (Switch Device in online games, Mute, SFX, Music).
  - **Chat**, **Information**, **Rulebook**, **Board log:** light-lime panels; Rulebook, Board log and Information have an Expand button that opens a big pop-up window. Panels slide in from the window edge and spring back.
- **Scroll bars** are custom (`attachScrollbar` in `js/main.js`) and only appear when there is something to scroll to.

## Prompt scenes

When the player whose turn it is has to decide something, the board darkens (on their screen only) and their full-body character (`full_<character>.svg`) steps in from the left. Bully (push / pull), Oracle (predict a number), Struggler (pick two failure numbers) and Snake Charmer (move a snake head / use an item - only if she holds one - / just roll, all in one prompt; "Back" returns to it from the head-drag or the item pick) get their own panel; every other question gets the same panel with the plain question. While rolling, the character stands next to the dice and the ROLL button. The small eye button at the top right of the board hides the prompt so the board can be seen. The end of the game uses the same scene (`showWinnerScene`): the winner's character, "WINNER! <name>", a PLAY AGAIN button sized to its label, and for players who did not win (online) BOO / CHEER buttons that play the BOO sound / a happy sound of their own character that everybody hears (the `REACT` network message; the sounds overlap, no cooldown). PLAY AGAIN returns to the lobby screen without reloading (so the music keeps playing); in an online game the host gets a new lobby with a new code and every connected player is moved into it (`NEW_LOBBY` message, announced three times so one lost message cannot leave a player behind; a guest follows only once, "host left" messages carry their room code so a late one from the old room is ignored, and the page address is updated to the new room so a reload does not return to the old one; a guest who is early sees a dimmed, widened "Waiting for the host..." button). The red Quit button asks YES / NO; online, quitting removes the player's panel and pawn (`LEAVE` message, `abandonSeat` in `js/network.js`). Orange prompt buttons use `button_prompt_long.svg` / `button_prompt_short.svg`. All of this is in `js/prompts.js`; the scene is recognised from the question text (`promptKindOf`), so online guests get the same scenes.

## Dice

The dice are 3D cubes (`spawnDiceElements` / `diceFaceHtml` in `js/input.js`). Every character throws dice in their own design: one SVG per die in `assets/` holding all six faces side by side as equal rounded squares, in order 1 to 6 (`dice_bully`, `dice_struggler`, `dice_oracle`, `dice_charmer`, `dice_catlady` - shared by the cat lady and her cat - and `dice_gambler_1` / `dice_gambler_2`, one for each of the Gambler's two dice). `DICE_ART` in `js/config.js` lists them. Each face is a box that shows one sixth of its file (the picture is made six times as wide and slid sideways). The design is chosen by who throws, not by whose turn it is, and every player's screen shows the same one. Keep everything inside each face's square (a shadow that spills out would show on the neighbouring face), and keep the opposite faces 1-6, 2-5, 3-4.

## Debugging online play

When a player is marked disconnected, or a guest loses its host, the browser console prints a `[net]` line with the reason (`timeout`, `bye`, `left`, `rtc`, `offline`, `unknown seat`). Open the console (F12) on the affected player before testing.

## Character pick

Two players can never hold the same character. On the pick screens (and the old setup chooser) a character another player already has is faded out and cannot be chosen. Online, the host decides: if two players pick the same character at almost the same moment, the first request wins and the other player's line goes back to "Pick a Character".

## Notes

- The game is drawn on a fixed 1920x1080 stage that is scaled to fit the window (`fit()` in `js/main.js`).
- Snake bodies and ladders use the art in `assets/`; a snake with no body picture falls back to a flat placeholder.
- Every snake gets its own head design (8 heads + the cobra = 9 snakes). If you raise `CONFIG.SNAKES`, add heads to `assets/manifest.json` first.
- The background is `assets/pattern.svg` (a square tile, 1 viewBox unit = 1 pixel) repeated over a flat colour. Replace that file with your design; no code change needed.
- Fonts: Minecraft (text), Little Monster (headings, `LM`), Blustrue (square numbers and the prompt panels). The tab buttons are one green SVG each (`button_<name>.svg`); the orange pressed look is made in code (`initTabArt` in `js/art.js`).
- `#setup` (the old start screen) is hidden in `index.html` itself, so nothing of it can flash while the scripts are still loading.
- Every adjustable number has a name: see the TUNING NUMBERS part of `js/config.js`. Numbers in the style sheet (positions, sizes) stay in `css/style.css`.
- Online play uses PeerJS, loaded from unpkg in `index.html`.
- `python tools/build_standalone.py` packs everything into one self-contained `dist/snakes-ladders-and-chaos.html` for quick sharing or previewing. The songs are large: if that script embeds everything in `assets/`, leave `assets/music/` out of it.
