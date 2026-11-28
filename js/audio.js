// =====================================================================================
//  audio.js  -  sound effects AND background music.
//  * sfx("name") plays one of the short sounds listed in SOUNDS (config.js).
//    Sounds are decoded once into memory and played with the Web Audio API so they start the instant they are asked for.
//  * The MUSIC list below holds the songs. They play one after another, forever (the last song is followed by the first).
//  * A mute switch silences EVERYTHING (music and sound effects) without changing the volume bars.
//  Browsers keep audio silent until the player's first click/key press - unlockAudio() handles that, and the music starts at the same moment.
// =====================================================================================

// ---- THE SONGS (files are in assets/music/). To add a song: put the mp3 in assets/music/ and add a line here. "name" is what the player sees. ----
const MUSIC = [
  { file: "music/song_Catching_The_Sun.mp3", name: "Catching The Sun" },
  {
    file: "music/song_Storm_of_the_Iron_Sitar.mp3",
    name: "Storm of the Iron Sitar",
  },
  { file: "music/song_One_More_Round.mp3", name: "One More Round" },
  { file: "music/song_Button_Mash_Saturday.mp3", name: "Button Mash Saturday" },
  { file: "music/song_The_Last_Streetlight.mp3", name: "The Last Streetlight" },
  { file: "music/song_Cheeky_Business.mp3", name: "Cheeky Business" },
  {
    file: "music/song_Across_the_Painted_Board.mp3",
    name: "Across the Painted Board",
  },
];
// MUSIC_GAIN = how loud the music is compared with the sound effects (1 = same). Lower it if the music drowns out the effects, raise it if it is too quiet.
const MUSIC_GAIN = 0.6;

// VOLUME = sound-effects volume as a step from 0 (mute) to 10 (full). Set from the Settings tab (setVolume in main.js); remembered between visits when the browser allows it.
let VOLUME = DEFAULT_VOLUME;
// MUSIC_VOL = music volume, same 0-10 steps. MUTED = true when the mute switch is on (silences music and effects).
let MUSIC_VOL = DEFAULT_MUSIC_VOL;
let MUTED = false;
// SHUFFLE = the next song is picked at random instead of the next one in the list (ON by default). LOOP = the current song repeats instead of moving on (off by default). Both are remembered between visits.
let SHUFFLE = true;
let LOOP = false;
try {
  const v = parseInt(localStorage.getItem("snc_volume"), 10);
  if (v >= 0 && v <= VOLUME_MAX) VOLUME = v;
  const m = parseInt(localStorage.getItem("snc_music_vol"), 10);
  if (m >= 0 && m <= VOLUME_MAX) MUSIC_VOL = m;
  MUTED = localStorage.getItem("snc_muted") === "1";
  if (localStorage.getItem("snc_shuffle") !== null)
    SHUFFLE = localStorage.getItem("snc_shuffle") === "1";
  LOOP = localStorage.getItem("snc_loop") === "1";
} catch (e) {
  /* storage not available: keep the defaults */
}
let ACTX = null; // ACTX = the browser's audio engine (created on load; "suspended" until the first click or key press)
const BUF = {}; // BUF[name] = the decoded sound (filled by loadSounds)

// loadSounds(): read every file listed in SOUNDS and decode it. Called once from main.js at start-up.
async function loadSounds() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // very old browser: the game simply stays silent
  ACTX = new AC();
  for (const [name, s] of Object.entries(SOUNDS)) {
    try {
      let bytes;
      if (window.EMBED && EMBED[s.file]) {
        // single-file build: the sound is stored inside the page as base64 text
        const bin = atob(EMBED[s.file].split(",")[1]);
        bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        bytes = bytes.buffer;
      } else bytes = await (await fetch("assets/" + s.file)).arrayBuffer(); // normal folder: read the mp3 file
      BUF[name] = await ACTX.decodeAudioData(bytes);
    } catch (e) {
      console.warn("Could not load sound", name, e);
    }
  }
}
// unlockAudio(): wake the audio engine. Browsers only allow sound after the player has interacted, so this runs on the first click / key press.
// The same moment starts the music (or restarts it if the browser had blocked it).
function unlockAudio() {
  if (ACTX && ACTX.state === "suspended") ACTX.resume();
  if (!MUSIC_EL) startMusic();
  else if (MUSIC_EL.paused && !MUSIC_PAUSED) MUSIC_EL.play().catch(() => {}); // (but never restart music the player paused on purpose)
}
addEventListener("pointerdown", unlockAudio, { capture: true });
addEventListener("keydown", unlockAudio, { capture: true });

// sfx(name, delayMs): play a sound. delayMs = wait this long first (used to line a sound up with an animation).
// Each file starts with a little silence; SOUNDS[name].skip cuts it off so the sound hits exactly when sfx() is called.
function sfx(name, delayMs) {
  const buf = BUF[name],
    s = SOUNDS[name];
  if (MUTED || !ACTX || !buf) return; // muted: stay silent
  const src = ACTX.createBufferSource(),
    gain = ACTX.createGain();
  src.buffer = buf;
  gain.gain.value = ((s.volume || 1) * VOLUME) / VOLUME_MAX; // master volume from the Settings tab
  src.connect(gain);
  gain.connect(ACTX.destination);
  src.start(ACTX.currentTime + (delayMs || 0) / MS_PER_SECOND, s.skip || 0);
}

// ---- GAME-EVENT SOUNDS ----
// Sounds whose names share a prefix and a number (snake_1, snake_2, bad_cat_1 ...) form a GROUP named by the prefix ("snake", "bad_cat"). SFX_GROUPS is built from SOUNDS (config.js),
// so adding a new variation only needs a new line there. A name with no number (drink, win) is a group of one.
const SFX_GROUPS = {};
for (const n of Object.keys(SOUNDS)) {
  const m = n.match(/^(.+)_(\d+)$/);
  if (m) (SFX_GROUPS[m[1]] = SFX_GROUPS[m[1]] || []).push(n);
}
// ---- THE VOICE CHANNEL: game-event sounds never overlap ----
// Every game-event sound (the group sounds above, the stone impact, the win jingle) goes through ONE channel that holds a single sound at a time. UI clicks and the dice use sfx() directly and are not part of it.
//   * A NEW event always wins: the sound that is still playing is not chopped off, it is played out quickly (sped up, about VOICE_WRAP_S seconds), and the new sound starts right after it.
//   * Only the newest waiting sound is kept: if events pile up (the player taps Space very fast), the ones in between are dropped and the latest one plays.
//   * A "chained" sound (chain = true) is a follow-up of the SAME event (the victim's reaction after a stone impact). It waits for the current sound to finish normally instead of cutting it,
//     and is dropped if a newer event arrives first.
const VOICE_WRAP_S = 0.12; // how long (seconds) a cut-off sound takes to play out
let VOICE = null; // the sound playing now: { src, ends: audio-clock time when it will be over, wrapping }
let VOICE_NEXT = null; // name of the one sound waiting for the voice channel to become free
// voice(name, delayMs, chain): ask the channel to play sound `name` after delayMs. The decision is taken when the sound is due, not when it was asked for.
function voice(name, delayMs, chain) {
  if (delayMs > 0) setTimeout(() => voiceNow(name, chain), delayMs);
  else voiceNow(name, chain);
}
function voiceNow(name, chain) {
  if (MUTED || !ACTX || !BUF[name]) return;
  if (VOICE && VOICE.ends + VOICE_STALE_S < ACTX.currentTime) VOICE = null; // (safety: a sound that should long be over never blocks the channel)
  if (!VOICE) return startVoice(name); // channel free: play right away
  if (chain) {
    if (!VOICE_NEXT) VOICE_NEXT = name;
    return;
  } // same event: wait for the current sound to end by itself
  VOICE_NEXT = name; // a new event replaces whatever was waiting...
  wrapUpVoice(); // ...and the old sound is played out quickly; the new one starts when it is over (see startVoice)
}
// startVoice(name): play the sound now and remember it as the current voice. When it ends, the waiting sound (if any) starts.
function startVoice(name) {
  const buf = BUF[name],
    s = SOUNDS[name],
    skip = s.skip || 0;
  const src = ACTX.createBufferSource(),
    gain = ACTX.createGain(),
    t0 = ACTX.currentTime;
  src.buffer = buf;
  gain.gain.value = ((s.volume || 1) * VOLUME) / VOLUME_MAX;
  src.connect(gain);
  gain.connect(ACTX.destination);
  const v = {
    src,
    ends: t0 + Math.max(MIN_VOICE_S.start, buf.duration - skip),
    wrapping: false,
  };
  VOICE = v;
  src.onended = () => {
    if (VOICE === v) VOICE = null;
    if (!VOICE && VOICE_NEXT) {
      const n = VOICE_NEXT;
      VOICE_NEXT = null;
      startVoice(n);
    }
  };
  src.start(t0, skip);
}
// wrapUpVoice(): play the rest of the current sound quickly (faster playback) so it finishes in about VOICE_WRAP_S seconds instead of being cut off.
function wrapUpVoice() {
  const v = VOICE;
  if (!v || v.wrapping) return;
  v.wrapping = true;
  const now = ACTX.currentTime,
    left = Math.max(MIN_VOICE_S.left, v.ends - now); // seconds of sound still to come at normal speed
  const rate = Math.min(
    WRAP_RATE.max,
    Math.max(WRAP_RATE.min, left / VOICE_WRAP_S),
  );
  try {
    v.src.playbackRate.cancelScheduledValues(now);
    v.src.playbackRate.setValueAtTime(rate, now);
  } catch (e) {
    /* old browser: it simply plays on */
  }
  v.ends = now + left / rate;
}
// stopVoice(): silence the voice channel at once (used by the mute switch).
function stopVoice() {
  VOICE_NEXT = null;
  if (VOICE) {
    try {
      VOICE.src.onended = null;
      VOICE.src.stop();
    } catch (e) {
      /* already over */
    }
    VOICE = null;
  }
}
// voiceIfFree(group): play a random sound of the group through the voice channel, but ONLY if no game sound is playing or waiting right now. Returns true if it played.
// Used for toy sounds (clicking the cat) so they can never cut off or delay a real game sound.
function voiceIfFree(group) {
  if (MUTED || !ACTX || VOICE_NEXT || (VOICE && VOICE.ends > ACTX.currentTime))
    return false;
  const list = SFX_GROUPS[group],
    name = list ? pick(list) : group;
  if (!BUF[name]) return false;
  startVoice(name);
  return true;
}
// sfxPick(group, delayMs, chain): pick ONE random sound of the group (or the sound itself if it has no variations) and play it through the voice channel on this device only. Returns the name picked.
function sfxPick(group, delayMs, chain) {
  const list = SFX_GROUPS[group],
    name = list ? pick(list) : group;
  voice(name, delayMs, chain);
  return name;
}
// gameSfx(group, delayMs, chain): a sound for something that happened IN the game (drink, snake, stone, cat, a character reaction...).
// It plays here, and when this page is HOSTING an online game it also tells the guests to play the SAME variation (guests do not run the rules themselves, so they cannot trigger it).
function gameSfx(group, delayMs, chain) {
  const name = sfxPick(group, delayMs, chain);
  if (
    typeof NET !== "undefined" &&
    NET.active &&
    NET.isHost &&
    typeof broadcast === "function"
  )
    broadcast({ type: "GAME_SFX", name, delay: delayMs || 0, chain: !!chain });
}

// ---- button sounds: ONE listener plays the right sound for every kind of button (so new buttons only need the right CSS class) ----
// pointerdown (not click) so the sound is instant. See SOUNDS in config.js for which file is which.
addEventListener("pointerdown", (e) => {
  const t = e.target.closest ? e.target.closest("button") : null;
  if (!t || t.disabled) return;
  if (t.classList.contains("go"))
    sfx("big"); // Start game
  else if (
    t.classList.contains("tbtn") ||
    t.classList.contains("obtn") ||
    t.classList.contains("pkbtn")
  )
    sfx("press"); // title screen Play / Options / About
  else if (t.closest("#btns"))
    sfx("press"); // choice buttons in the board log (numbers, Push/Pull...)
  else sfx("small"); // everything else: tabs, expand, close, ROLL, Move for me, character buttons
});

// =====================================================================================
//  MUSIC PLAYER
// =====================================================================================
let SONG = 0; // SONG = position in MUSIC of the song that is playing now
let MUSIC_PAUSED = false; // true while the player has paused the music with the play/pause button
const SONG_HISTORY = []; // the songs played before this one (most recent last), so the "previous" button can go back to them
let MUSIC_EL = null; // MUSIC_EL = the hidden audio player that streams the songs (made on the first click, see startMusic)
let MUSIC_NODE = null; // MUSIC_NODE = the volume knob the music passes through (Web Audio), so the volume also works on phones
let MUSIC_FAILS = 0; // how many songs in a row failed to load (stops us skipping forever if the folder is missing)

// songName(): the name of the current song, for the screen.
function songName() {
  return MUSIC.length ? MUSIC[SONG].name : "No songs found";
}
// applyMusicVolume(): set the music loudness from MUSIC_VOL, MUSIC_GAIN and the mute switch.
function applyMusicVolume() {
  const v = MUTED ? 0 : (MUSIC_VOL / VOLUME_MAX) * MUSIC_GAIN;
  if (MUSIC_NODE) MUSIC_NODE.gain.value = v;
  else if (MUSIC_EL) MUSIC_EL.volume = Math.min(1, v);
}
// startMusic(): create the music player and play the first song. Called once, on the player's first click / key press.
function startMusic() {
  if (MUSIC_EL || !MUSIC.length) return;
  MUSIC_EL = new Audio();
  MUSIC_EL.preload = "auto";
  MUSIC_EL.loop = LOOP; // loop on: the browser repeats the same song by itself (so "ended" below only fires when loop is off)
  MUSIC_EL.addEventListener("ended", () => playSong(nextIndex())); // song finished: the next one (random when shuffle is on, otherwise the next in the list; after the last comes the first)
  MUSIC_EL.addEventListener("playing", () => {
    MUSIC_FAILS = 0;
  });
  MUSIC_EL.addEventListener("error", () => {
    if (++MUSIC_FAILS < MUSIC.length) playSong(SONG + 1, true);
  }); // a file is missing: skip it (in list order, so it always moves on)
  if (ACTX) {
    try {
      const src = ACTX.createMediaElementSource(MUSIC_EL);
      MUSIC_NODE = ACTX.createGain();
      src.connect(MUSIC_NODE);
      MUSIC_NODE.connect(ACTX.destination);
    } catch (e) {
      MUSIC_NODE = null; // fall back to the player's own volume
    }
  }
  applyMusicVolume();
  if (SHUFFLE && MUSIC.length > 1)
    SONG = Math.floor(Math.random() * MUSIC.length); // shuffle: begin with a random song
  playSong(SONG);
}
// nextIndex(): which song comes next: a random OTHER song when shuffle is on, otherwise the next one in the list (after the last comes the first).
function nextIndex() {
  const n = MUSIC.length;
  if (n < 2) return 0;
  if (SHUFFLE) {
    let k;
    do {
      k = Math.floor(Math.random() * n);
    } while (k === SONG);
    return k;
  }
  return (SONG + 1) % n;
}
// playSong(i, back): play song number i of MUSIC (numbers wrap around: -1 = the last song). back = true when going BACK to an earlier song (so it is not added to the history again).
function playSong(i, back) {
  if (!MUSIC.length) return;
  if (!MUSIC_EL) {
    SONG = ((i % MUSIC.length) + MUSIC.length) % MUSIC.length;
    return startMusic();
  }
  if (!back && MUSIC_EL.getAttribute("src")) {
    SONG_HISTORY.push(SONG);
    if (SONG_HISTORY.length > SONG_HISTORY_MAX) SONG_HISTORY.shift();
  } // remember the song we are leaving
  SONG = ((i % MUSIC.length) + MUSIC.length) % MUSIC.length;
  MUSIC_PAUSED = false; // choosing a song always plays it
  MUSIC_EL.loop = LOOP;
  MUSIC_EL.src = "assets/" + MUSIC[SONG].file;
  MUSIC_EL.play().catch(() => {}); // (if the browser still blocks it, the next click starts it - see unlockAudio)
  refreshMusicUi();
}
// changeSong(step): the next / previous buttons. Next = the next song (random when shuffling). Previous = the song that played before this one.
function changeSong(step) {
  if (!MUSIC_EL) return startMusic();
  if (step > 0) playSong(nextIndex());
  else if (SONG_HISTORY.length) playSong(SONG_HISTORY.pop(), true);
  else playSong(SONG - 1, true);
}
// togglePlay(): the play / pause button.
function togglePlay() {
  if (!MUSIC_EL) return startMusic();
  if (MUSIC_EL.paused) {
    MUSIC_PAUSED = false;
    MUSIC_EL.play().catch(() => {});
  } else {
    MUSIC_PAUSED = true;
    MUSIC_EL.pause();
  }
  refreshMusicUi();
}
// toggleLoop() / toggleShuffle(): the loop and shuffle buttons (remembered between visits).
function toggleLoop() {
  LOOP = !LOOP;
  try {
    localStorage.setItem("snc_loop", LOOP ? "1" : "0");
  } catch (e) {
    /* not saved: fine */
  }
  if (MUSIC_EL) MUSIC_EL.loop = LOOP;
  refreshMusicUi();
}
function toggleShuffle() {
  SHUFFLE = !SHUFFLE;
  try {
    localStorage.setItem("snc_shuffle", SHUFFLE ? "1" : "0");
  } catch (e) {
    /* not saved: fine */
  }
  refreshMusicUi();
}
// setMusicVol(n): the music volume bar. Clicking step 1 while it is the only one lit turns the music off (same as the effects bar).
function setMusicVol(n) {
  MUSIC_VOL = n === 1 && MUSIC_VOL === 1 ? 0 : n;
  try {
    localStorage.setItem("snc_music_vol", MUSIC_VOL);
  } catch (e) {
    /* not saved: fine */
  }
  applyMusicVolume();
  refreshMusicUi();
}
// toggleMute(): the mute switch. Silences music and effects; the volume bars keep their positions.
function toggleMute() {
  MUTED = !MUTED;
  if (MUTED) stopVoice(); // silence a game sound that is playing right now
  try {
    localStorage.setItem("snc_muted", MUTED ? "1" : "0");
  } catch (e) {
    /* not saved: fine */
  }
  applyMusicVolume();
  refreshMusicUi();
}

// ---- the music controls on screen (the same block is used on the title screen's Options page and in the Settings tab) ----
// speakerHtml(off): the small orange speaker picture. off = false: sound waves (sound on); off = true: a cross (muted).
function speakerHtml(off) {
  return `<svg class="mu-ico" viewBox="0 0 48 48" aria-hidden="true"><path d="M4 18h8l10-8v28l-10-8H4z"/>${off ? '<path d="M30 18l12 12M42 18L30 30" fill="none"/>' : '<path d="M29 17c3 4 3 10 0 14M34 12c6 7 6 17 0 24" fill="none"/>'}</svg>`;
}
// muteSwitchHtml(): the mute switch (same shape as the light/dark switch). Knob left = sound on, knob right = muted. Its click is handled by the listener at the bottom of this file.
function muteSwitchHtml() {
  return `<button class="msw" data-mu="mute" role="switch" aria-label="Mute" aria-checked="${MUTED}"><svg viewBox="0 0 121 72"><rect class="ms-rim" width="121" height="72" rx="36"/><rect class="ms-trk" x="6" y="6" width="109" height="60" rx="30"/><g class="ms-knob"><circle cx="31" cy="39" r="23.5" fill="#e2330a"/><circle class="ms-ring" cx="31" cy="32" r="23.5" fill="#ff7529" stroke-width="3"/><circle cx="24" cy="22" r="11" fill="#fff" opacity=".5"/></g></svg></button>`;
}
// musicPanelHtml(kind): the HTML for: Music volume bar, "Now playing" with previous / next buttons, and the mute switch.
// kind = "tt" for the title screen Options page, anything else for the Settings tab (only the look differs, see css/style.css "MUSIC").
function musicPanelHtml(kind) {
  const tt = kind === "tt";
  let bar = "";
  for (let i = 1; i <= VOLUME_MAX; i++)
    bar += `<div class="${tt ? "tt-seg" : "seg"} mu-seg${i <= MUSIC_VOL ? " on" : ""}" data-mu="vol" data-v="${i}" title="${i * 10}%"></div>`;
  const chev = (d) =>
    `<svg viewBox="0 0 14 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ico = (d, extra) =>
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>${extra || ""}</svg>`;
  const playIco = `<svg class="i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5l13 7.5-13 7.5z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const pauseIco = `<svg class="i-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4.5h3.6v15H7zM13.4 4.5H17v15h-3.6z" fill="currentColor" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const loopIco = ico(
    "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
    `<path d="M11 10h1v4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  ); // "repeat one" arrows
  const shufIco = ico(
    "M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22M18 2l4 4-4 4M2 6h1.9c1.5 0 2.9.9 3.6 2.2M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8M18 14l4 4-4 4",
  ); // crossing arrows
  return `<div class="mu-wrap">
    <div class="mu-head"><span class="mu-title">Music</span><span class="mu-num">${MUSIC_VOL ? MUSIC_VOL * VOLUME_STEP_PERCENT + "%" : "Off"}</span></div>
    <div class="${tt ? "tt-vol" : "volbar"}">${bar}</div>
    <div class="mu-now">
      <button class="mu-btn" data-mu="prev" title="Previous song" aria-label="Previous song">${chev("M11 2.5L3 10l8 7.5")}</button>
      <div class="mu-song"><small>Now playing</small><b class="mu-name">${esc(songName())}</b></div>
      <button class="mu-btn" data-mu="next" title="Next song" aria-label="Next song">${chev("M3 2.5L11 10L3 17.5")}</button>
    </div>
    <div class="mu-ctl">
      <button class="mu-btn mu-play" data-mu="play" data-paused="${MUSIC_PAUSED}" title="Play / pause" aria-label="Play or pause the music">${playIco}${pauseIco}</button>
      <button class="mu-btn mu-loop" data-mu="loop" aria-pressed="${LOOP}" title="Loop: keep repeating this song" aria-label="Loop the current song">${loopIco}</button>
      <button class="mu-btn mu-shuf" data-mu="shuffle" aria-pressed="${SHUFFLE}" title="Shuffle: play the songs in random order" aria-label="Shuffle the songs">${shufIco}</button>
    </div>
  </div>`;
}
// muteRowHtml(): the "Mute" heading with the mute switch (speaker with waves on the left, muted speaker on the right). It is the first setting on the Options page and in the Settings tab.
function muteRowHtml() {
  return `<div class="mu-mute"><span class="mu-title">Mute</span>${speakerHtml(false)}${muteSwitchHtml()}${speakerHtml(true)}</div>`;
}
// refreshMusicUi(): update every music control that is on screen (song name, volume bar, switch position). Called after anything changes.
function refreshMusicUi() {
  document
    .querySelectorAll(".mu-name")
    .forEach((el) => (el.textContent = songName()));
  document
    .querySelectorAll(".mu-num")
    .forEach(
      (el) =>
        (el.textContent = MUSIC_VOL
          ? MUSIC_VOL * VOLUME_STEP_PERCENT + "%"
          : "Off"),
    );
  document
    .querySelectorAll(".mu-seg")
    .forEach((el) => el.classList.toggle("on", +el.dataset.v <= MUSIC_VOL));
  document
    .querySelectorAll(".msw")
    .forEach((el) => el.setAttribute("aria-checked", MUTED));
  document
    .querySelectorAll(".mu-play")
    .forEach((el) => el.setAttribute("data-paused", MUSIC_PAUSED)); // shows the play or the pause picture
  document
    .querySelectorAll(".mu-loop")
    .forEach((el) => el.setAttribute("aria-pressed", LOOP));
  document
    .querySelectorAll(".mu-shuf")
    .forEach((el) => el.setAttribute("aria-pressed", SHUFFLE));
}
// ONE click listener for all the music controls (so the title screen and the Settings tab share the same code).
document.addEventListener("click", (e) => {
  const t = e.target.closest ? e.target.closest("[data-mu]") : null;
  if (!t) return;
  const a = t.dataset.mu;
  if (a === "vol") setMusicVol(+t.dataset.v);
  else if (a === "mute") toggleMute();
  else if (a === "next") changeSong(1);
  else if (a === "prev") changeSong(-1);
  else if (a === "play") togglePlay();
  else if (a === "loop") toggleLoop();
  else if (a === "shuffle") toggleShuffle();
});
