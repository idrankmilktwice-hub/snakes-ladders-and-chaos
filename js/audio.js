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
  { file: "music/song_Catching_The_Sun.mp3",          name: "Catching The Sun" },
  { file: "music/song_Storm_of_the_Iron_Sitar.mp3",   name: "Storm of the Iron Sitar" },
  { file: "music/song_One_More_Round.mp3",            name: "One More Round" },
  { file: "music/song_Button_Mash_Saturday.mp3",      name: "Button Mash Saturday" },
  { file: "music/song_The_Last_Streetlight.mp3",      name: "The Last Streetlight" },
  { file: "music/song_Cheeky_Business.mp3",           name: "Cheeky Business" },
  { file: "music/song_Across_the_Painted_Board.mp3",  name: "Across the Painted Board" }
];
// MUSIC_GAIN = how loud the music is compared with the sound effects (1 = same). Lower it if the music drowns out the effects, raise it if it is too quiet.
const MUSIC_GAIN = 0.6;

// VOLUME = sound-effects volume as a step from 0 (mute) to 10 (full). Set from the Settings tab (setVolume in main.js); remembered between visits when the browser allows it.
let VOLUME = 7;
// MUSIC_VOL = music volume, same 0-10 steps. MUTED = true when the mute switch is on (silences music and effects).
let MUSIC_VOL = 5;
let MUTED = false;
try {
  const v = parseInt(localStorage.getItem("snc_volume"), 10);
  if (v >= 0 && v <= 10) VOLUME = v;
  const m = parseInt(localStorage.getItem("snc_music_vol"), 10);
  if (m >= 0 && m <= 10) MUSIC_VOL = m;
  MUTED = localStorage.getItem("snc_muted") === "1";
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
  else if (MUSIC_EL.paused) MUSIC_EL.play().catch(() => {});
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
  gain.gain.value = ((s.volume || 1) * VOLUME) / 10; // master volume from the Settings tab
  src.connect(gain);
  gain.connect(ACTX.destination);
  src.start(ACTX.currentTime + (delayMs || 0) / 1000, s.skip || 0);
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
let MUSIC_EL = null; // MUSIC_EL = the hidden audio player that streams the songs (made on the first click, see startMusic)
let MUSIC_NODE = null; // MUSIC_NODE = the volume knob the music passes through (Web Audio), so the volume also works on phones
let MUSIC_FAILS = 0; // how many songs in a row failed to load (stops us skipping forever if the folder is missing)

// songName(): the name of the current song, for the screen.
function songName() {
  return MUSIC.length ? MUSIC[SONG].name : "No songs found";
}
// applyMusicVolume(): set the music loudness from MUSIC_VOL, MUSIC_GAIN and the mute switch.
function applyMusicVolume() {
  const v = MUTED ? 0 : (MUSIC_VOL / 10) * MUSIC_GAIN;
  if (MUSIC_NODE) MUSIC_NODE.gain.value = v;
  else if (MUSIC_EL) MUSIC_EL.volume = Math.min(1, v);
}
// startMusic(): create the music player and play the first song. Called once, on the player's first click / key press.
function startMusic() {
  if (MUSIC_EL || !MUSIC.length) return;
  MUSIC_EL = new Audio();
  MUSIC_EL.preload = "auto";
  MUSIC_EL.addEventListener("ended", () => playSong(SONG + 1)); // song finished: next one (after the last comes the first)
  MUSIC_EL.addEventListener("playing", () => { MUSIC_FAILS = 0; });
  MUSIC_EL.addEventListener("error", () => { if (++MUSIC_FAILS < MUSIC.length) playSong(SONG + 1); }); // a file is missing: skip it
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
  playSong(SONG);
}
// playSong(i): play song number i of MUSIC (numbers wrap around: -1 = the last song, one past the last = the first).
function playSong(i) {
  if (!MUSIC.length) return;
  SONG = ((i % MUSIC.length) + MUSIC.length) % MUSIC.length;
  if (!MUSIC_EL) return startMusic();
  MUSIC_EL.src = "assets/" + MUSIC[SONG].file;
  MUSIC_EL.play().catch(() => {}); // (if the browser still blocks it, the next click starts it - see unlockAudio)
  refreshMusicUi();
}
// changeSong(step): the next / previous buttons. step = +1 or -1.
function changeSong(step) {
  if (!MUSIC_EL) { SONG = ((SONG + step) % MUSIC.length + MUSIC.length) % MUSIC.length; return startMusic(); }
  playSong(SONG + step);
}
// setMusicVol(n): the music volume bar. Clicking step 1 while it is the only one lit turns the music off (same as the effects bar).
function setMusicVol(n) {
  MUSIC_VOL = (n === 1 && MUSIC_VOL === 1) ? 0 : n;
  try { localStorage.setItem("snc_music_vol", MUSIC_VOL); } catch (e) { /* not saved: fine */ }
  applyMusicVolume();
  refreshMusicUi();
}
// toggleMute(): the mute switch. Silences music and effects; the volume bars keep their positions.
function toggleMute() {
  MUTED = !MUTED;
  try { localStorage.setItem("snc_muted", MUTED ? "1" : "0"); } catch (e) { /* not saved: fine */ }
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
  return `<button class="msw" data-mu="mute" role="switch" aria-label="Mute all sound" aria-checked="${MUTED}"><svg viewBox="0 0 121 72"><rect class="ms-rim" width="121" height="72" rx="36"/><rect class="ms-trk" x="6" y="6" width="109" height="60" rx="30"/><g class="ms-knob"><circle cx="31" cy="39" r="23.5" fill="#e2330a"/><circle class="ms-ring" cx="31" cy="32" r="23.5" fill="#ff7529" stroke-width="3"/><circle cx="24" cy="22" r="11" fill="#fff" opacity=".5"/></g></svg></button>`;
}
// musicPanelHtml(kind): the HTML for: Music volume bar, "Now playing" with previous / next buttons, and the mute switch.
// kind = "tt" for the title screen Options page, anything else for the Settings tab (only the look differs, see css/style.css "MUSIC").
function musicPanelHtml(kind) {
  const tt = kind === "tt";
  let bar = "";
  for (let i = 1; i <= 10; i++)
    bar += `<div class="${tt ? "tt-seg" : "seg"} mu-seg${i <= MUSIC_VOL ? " on" : ""}" data-mu="vol" data-v="${i}" title="${i * 10}%"></div>`;
  const chev = (d) => `<svg viewBox="0 0 14 20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const speaker = speakerHtml;
  const sw = muteSwitchHtml();
  return `<div class="mu-wrap">
    <div class="mu-head"><span class="mu-title">Music</span><span class="mu-num">${MUSIC_VOL ? MUSIC_VOL * 10 + "%" : "Off"}</span></div>
    <div class="${tt ? "tt-vol" : "volbar"}">${bar}</div>
    <div class="mu-now">
      <button class="mu-btn" data-mu="prev" title="Previous song" aria-label="Previous song">${chev("M11 2.5L3 10l8 7.5")}</button>
      <div class="mu-song"><small>Now playing</small><b class="mu-name">${esc(songName())}</b></div>
      <button class="mu-btn" data-mu="next" title="Next song" aria-label="Next song">${chev("M3 2.5L11 10L3 17.5")}</button>
    </div>
    <div class="mu-mute"><span class="mu-mlabel">Mute all sound</span>${speaker(false)}${sw}${speaker(true)}</div>
  </div>`;
}
// refreshMusicUi(): update every music control that is on screen (song name, volume bar, switch position). Called after anything changes.
function refreshMusicUi() {
  document.querySelectorAll(".mu-name").forEach((el) => (el.textContent = songName()));
  document.querySelectorAll(".mu-num").forEach((el) => (el.textContent = MUSIC_VOL ? MUSIC_VOL * 10 + "%" : "Off"));
  document.querySelectorAll(".mu-seg").forEach((el) => el.classList.toggle("on", +el.dataset.v <= MUSIC_VOL));
  document.querySelectorAll(".msw").forEach((el) => el.setAttribute("aria-checked", MUTED));
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
});
