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
  config.js         settings, character descriptions, colours, layout numbers, the SOUNDS list   <- start here for small changes
  board.js          square numbering and random snake/ladder generation
  art.js            loading the SVG art (assets/manifest.json)
  audio.js          sound effects, the game-event "voice channel", the music player and the mute / music controls
  preload.js        starts loading art / fonts / sounds at page open and drives the loading bar
  render.js         drawing: snakes, ladders, tiles, pawns, player panels
  network.js        online play (PeerJS): lobby, the host runs the game and sends the state and sounds to the guests
  input.js          prompts/buttons, drag and drop, the dice, Space bar, clicking the cat
  rules.js          character rules, ITEMS, flavour text, the turn loop, character reactions   <- edit character and item behaviour here
  rulebook.js       the Rulebook tab text (RULES_HTML), built from config.js numbers
  main.js           start screen, tabs (log / rulebook / settings / about), window scaling
  title.js          the title screen (logo, Play / Options / About, light/dark switch, mute switch); loads after main.js
  local.js          the Local, Host and Join screens (player lines) and the character pick panels; loads after title.js
assets/             all SVG art, the font and manifest.json, plus:
  sounds/           mp3 sound effects (buttons, dice, game events, character reactions)
  music/            the songs (song_<Name_With_Underscores>.mp3)
docs/mockup.jpg     the first design mockup
docs/mockup_v2.jpg  the mockup with the three containers and item slots
docs/Title_Screen.jpg, Play_Screen.jpg, Local_Screen.jpg  the title screen reference; docs/palette.svg  the colour palette
RULES.txt           the full rules: every class, items, bonus-roll rules
serve.py            tiny local web server
```

Every function and variable in the JS files has a comment saying what it does and where it is used.

`index.html` loads every script and the stylesheet with a version number (`?v=21`). When you change a file, raise the number on every line so browsers do not keep using an old cached copy.

## Common changes

| I want to...                         | Edit                                             |
|--------------------------------------|--------------------------------------------------|
| change number of snakes/ladders      | `CONFIG` in `js/config.js`                       |
| change a character description       | `CHARACTERS` in `js/config.js`                   |
| change item numbers (3 slots, start count, spawn every N turns) | `ITEM_*` in `js/config.js`      |
| change where the three containers / panels sit | `BOXES`, `BOARD_BOX`, `PANEL`, `BX0`.. in `js/config.js` |
| change what the board log says       | `FLAVOR` in `js/rules.js`                        |
| change how a character plays         | `LOGIC` in `js/rules.js`                         |
| change pawn / snake / number sizes   | `render.js` (`placePawns`, `SW`, `NUM_H`)        |
| change which sound plays             | `SOUNDS` in `js/config.js` (and `ROLL_MS` for the dice roll length) |
| add a variation of a sound           | add a line to `SOUNDS` with the same name and the next number, e.g. `stone_4` (the game picks one at random) |
| change when a sound plays            | the `gameSfx(...)` / `cheer(...)` calls in `js/rules.js`, `flyItem` in `js/input.js` |
| change how loud one sound is         | its `volume` in `SOUNDS` (a multiplier on top of the player's Settings volume) |
| change the delay before a stone victim reacts | `STONE_BAD_DELAY` in `js/config.js`    |
| change the cat click cooldown        | `CAT_CLICK_COOLDOWN` in `js/config.js`           |
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
| Something bad happens to a character: bitten by a snake, hit by a stone, steps on a toy brick, pushed or pulled by the Bully | `bad_<character>` (the character's own reaction) |
| The Bully nudges someone | `bully_nudge` (2 variations) |
| A character climbs a ladder, picks up or swaps an item, or rolls a 6 | `happy_<character>` |
| The Struggler survives a forced effect (dodges a snake, push, nudge or the cat's charm) | `happy_struggler` |
| Someone wins | `win` (plays once) |
| Clicking the cat | `cat`, at most once every `CAT_CLICK_COOLDOWN`, only when no other game sound is playing |

Rules for the reactions: a character cheers at most once per turn; a 6 cheers only after the move finishes and only if no snake bit that character (then the sad sound plays instead); the Gambler counts double 6s as his 6. `<character>` is `bully`, `gambler`, `cat`, `struggler`, `oracle` or `charmer`.

**The voice channel (no overlapping sounds).** All game-event sounds go through one channel that plays a single sound at a time (button clicks and the dice are separate). A newer event always wins: the sound still playing is sped up so it finishes in about a tenth of a second instead of being cut off, then the new sound starts. If several events pile up (the player taps Space very fast), only the newest waiting sound is kept. A "chained" sound (the victim's reaction after a stone) waits for the current sound to end normally and is dropped if a newer event arrives first. Muting stops the current sound at once.

**Online.** Guests do not run the rules, so the host picks each variation and sends it (`GAME_SFX` message in `js/network.js`); everyone hears the same sound. The stone's impact sound and the win sound are played by each guest's own page.

**Music.** The songs in `assets/music/` are streamed (not decoded up front) and play one after another through the whole game, starting on the player's first click (browsers block audio before that). Controls, on the title screen's Options page and in the board's Settings tab:

- **Mute** (the first setting) silences everything: music, effects and reactions. The same switch is under the light/dark switch on every title-side screen. All the mute switches stay in sync.
- **Sound effects** volume and **Music** volume are separate 10-step bars.
- **Now playing** shows the song name, with previous / next buttons.
- **Play / pause**, **loop** (repeat the current song) and **shuffle** (random next song, on by default).

The player's choices (effects volume, music volume, mute, loop, shuffle) are remembered in the browser (`snc_volume`, `snc_music_vol`, `snc_muted`, `snc_loop`, `snc_shuffle`).

## Character pick

Two players can never hold the same character. On the pick screens (and the old setup chooser) a character another player already has is faded out and cannot be chosen. Online, the host decides: if two players pick the same character at almost the same moment, the first request wins and the other player's line goes back to "Pick a Character".

## Notes

- The game is drawn on a fixed 1920x1080 stage that is scaled to fit the window (`fit()` in `js/main.js`).
- Snake bodies and ladders use the art in `assets/`; a snake with no body picture falls back to a flat placeholder.
- Every snake gets its own head design (8 heads + the cobra = 9 snakes). If you raise `CONFIG.SNAKES`, add heads to `assets/manifest.json` first.
- The background is the flat blue with `assets/pattern.svg` (a square tile, 1 viewBox unit = 1 pixel) repeated over it. Replace that file with your design; no code change needed.
- Online play uses PeerJS, loaded from unpkg in `index.html`.
- `python tools/build_standalone.py` packs everything into one self-contained `dist/snakes-ladders-and-chaos.html` for quick sharing or previewing. The songs are large: if that script embeds everything in `assets/`, leave `assets/music/` out of it.
