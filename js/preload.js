// =====================================================================================
//  preload.js  -  starts loading the game's art, fonts and sounds the moment the page opens, and drives the little loading bar
//  (#tLoad, bottom-left of the title / play / local / host / join screens). New art files: add their names to PRELOAD_SVGS.
// =====================================================================================
// ---- Loading numbers (all in one place) ----
const PRELOAD_FONTS = ["20px MC", "20px LM", "40px Blustrue"];   // fonts loaded up front (the 20px / 40px is only a size to make the browser fetch the font)
const PRELOAD_SOUNDS = 5;               // how many sounds loadSounds() in audio.js decodes at start; the bar waits for this many
const PRELOAD_SOUND_POLL_MS = 150;      // how often the bar checks how many sounds are ready
const PRELOAD_DONE_HOLD_MS = 1000;      // "Assets loaded" stays on screen this long before the bar slides away
const PRELOAD_GIVEUP_MS = 30000;        // safety: after this long the bar finishes anyway, whatever is still loading
const PERCENT = 100;                    // (for the bar's width)
const PRELOAD_SVGS = [
  "button_about.svg",
  "button_back.svg",
  "button_boardlog.svg",
  "button_chat.svg",
  "button_home.svg",
  "button_playscreen_description.svg",
  "button_prompt_long.svg",
  "button_prompt_short.svg",
  "button_roll.svg",
  "button_roll_shadow.svg",
  "button_rulebook.svg",
  "button_settings.svg",
  "cat_1.svg",
  "cat_2.svg",
  "cat_3.svg",
  "cat_4.svg",
  "cat_5.svg",
  "cat_6.svg",
  "cat_7.svg",
  "cat_8.svg",
  "cat_9.svg",
  "cat_10.svg",
  "counter_buff.svg",
  "counter_debuff.svg",
  "dice_bully.svg",
  "dice_catlady.svg",
  "dice_charmer.svg",
  "dice_gambler_1.svg",
  "dice_gambler_2.svg",
  "dice_oracle.svg",
  "dice_struggler.svg",
  "full_bully.svg",
  "full_catlady.svg",
  "full_charmer.svg",
  "full_gambler.svg",
  "full_oracle.svg",
  "full_struggler.svg",
  "head_bully.svg",
  "head_catlady.svg",
  "head_charmer.svg",
  "head_gambler.svg",
  "head_oracle.svg",
  "head_struggler.svg",
  "item_energy_drink.svg",
  "item_stick.svg",
  "item_stone.svg",
  "item_toy_brick.svg",
  "ladder_slanted.svg",
  "ladder_straight.svg",
  "logo.svg",
  "panel_pick_dark.svg",
  "panel_pick_light.svg",
  "pattern.svg",
  "player_panel.svg",
  "screen_bg.svg",
  "snake_body_2.svg",
  "snake_body_3.svg",
  "snake_body_4.svg",
  "snake_body_5.svg",
  "snake_body_6.svg",
  "snake_body_7.svg",
  "snake_body_8.svg",
  "snake_body_9.svg",
  "snake_body_cobra.svg",
  "snake_head_2.svg",
  "snake_head_3.svg",
  "snake_head_4.svg",
  "snake_head_5.svg",
  "snake_head_6.svg",
  "snake_head_7.svg",
  "snake_head_8.svg",
  "snake_head_9.svg",
  "snake_head_cobra.svg",
  "tile_dark.svg",
  "tile_light.svg",
];
const PRELOAD_HOLD = []; // keeps the decoded pictures in memory so they show instantly later
(function preload() {
  const total = PRELOAD_SVGS.length + PRELOAD_FONTS.length + PRELOAD_SOUNDS;
  let done = 0; // pictures + fonts + sounds
  const tick = () => {
    done++;
    const el = document.getElementById("tLoad");
    if (!el) return;
    el.querySelector("i").style.width =
      Math.min(PERCENT, (done / total) * PERCENT) + "%";
    if (done >= total && !el.classList.contains("done")) {
      el.classList.add("done");
      setTimeout(() => el.classList.add("gone"), PRELOAD_DONE_HOLD_MS);
    } // the bar vanishes, "Assets loaded" shows for a second, then slides off the screen
  };
  PRELOAD_SVGS.forEach((f) => {
    const im = new Image();
    PRELOAD_HOLD.push(im);
    new Promise((res) => {
      im.onload = res;
      im.onerror = res;
      im.src = A(f);
    })
      .then(() => (im.decode ? im.decode().catch(() => {}) : 0))
      .then(tick);
  });
  PRELOAD_FONTS.forEach((fnt) =>
    document.fonts
      .load(fnt)
      .catch(() => {})
      .then(tick),
  );
  let snd = 0;
  const hasAudio = window.AudioContext || window.webkitAudioContext; // sounds are decoded by loadSounds() in audio.js; we just watch BUF
  const iv = setInterval(() => {
    const n = hasAudio ? Math.min(PRELOAD_SOUNDS, Object.keys(BUF).length) : PRELOAD_SOUNDS;
    while (snd < n) {
      snd++;
      tick();
    }
    if (snd >= PRELOAD_SOUNDS) clearInterval(iv);
  }, PRELOAD_SOUND_POLL_MS);
  setTimeout(() => {
    done = total - 1;
    tick();
  }, PRELOAD_GIVEUP_MS); // safety: never leave the bar hanging
})();
