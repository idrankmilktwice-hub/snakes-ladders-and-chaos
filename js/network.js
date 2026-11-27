// =====================================================================================
//  network.js  -  Multiplayer Layer (WebRTC P2P + SSE/HTTP/WS Fallback)
//  Provides room creation, join handshakes, ordered action routing, live drag previews,
//  chat, disconnect recovery, and authoritative state synchronization.
//  RECONNECT SYSTEM (added): secret seat tokens, heartbeat loss detection, automatic rejoin,
//  host migration, "switch device" transfer codes and a 5-second turn grace. See section 4 onwards.
// =====================================================================================

var NET = {
  active: false,
  isHost: false,
  peer: null,
  myId: null,
  roomCode: null,
  myPlayerIndex: 0,
  joined: false,
  connections: [],     // Host: array of hybrid connections to guests
  peerMap: {},         // Host: peerId -> hybrid connection
  hostConn: null,      // Guest: single hybrid connection to host
  chatHistory: [],
  unreadChat: 0,
  onLobbyUpdate: null,
  onJoinAck: null,
  onJoinDenied: null,
  disconnectTimer: null,
  reconnecting: false,

  // ---- reconnect system ----
  epoch: 0,            // host generation: 0 = the original host, +1 every time the host role moves to someone else
  hostIdx: 0,          // seat number of whoever is host right now
  gameStarted: false,  // true once GAME_START happened (before that the lobby rules apply)
  retired: false,      // this page gave up its seat (other tab / other device / lobby ended)
  myToken: null,       // my secret seat token (never sent to anybody except the host that issued it)
  seatHash: [],        // sha256 of every seat's token (everybody holds these, so any player can become host and still check tokens)
  xferCodes: [],       // host: live "switch device" codes [{idx, secret, exp}]
  xferFails: 0,        // host: wrong transfer-code attempts (locks transfer codes after too many)
  xferLockUntil: 0,
  xferUsed: [],        // host: switch-device codes that were just used, and what the new device was answered (so repeats get the same answer)
  abandoned: false,    // the player pressed "Abandon Game" while trying to get back in
  xferWaiter: null,    // guest: waiting for the host to answer a transfer-code request
  pendingXfer: null,   // guest: transfer secret to present while joining
  lastRx: 0,           // guest: when something last arrived from the host
  joinedAt: 0,
  hostLost: false,     // guest: the host stopped answering, recovery is running
  hostLostAt: 0,
  noElectUntil: 0,
  selfLost: false,     // host: my own connection died
  recTimer: null,
  pingTimer: null,
  monTimer: null,
  probeTimer: null,
  selfTimer: null,
  rcTimer: null,
  lastMonTick: 0,
  waitMsg: null,       // host: the last WAIT_* prompt nobody answered yet (replayed to a player who rejoins)
  reconnectWaiter: null,
  sendJoinHandshake: null,
  linkUpSince: 0,
  linkWasDown: false,

  // Pending host resolvers (paired with active actor index so disconnects can unblock)
  pendingActorIdx: null,
  pendingMoveRes: null,
  pendingChoiceRes: null,
  pendingItemRes: null,
  pendingTargetRes: null,

  // Relay & ordering state
  sse: null,
  sseConnected: false,
  httpEnabled: true,
  httpSeq: 0,
  httpPollAbort: null,
  httpOutbox: [],
  httpFlushing: false,
  mqttSockets: [],
  mqttOutbox: [],
  mqttPingTimer: null,
  stateSeq: 0,
  seenMsgs: new Set(),
  earlyQueue: [],      // Guest: buffers in-game packets arriving slightly before GAME_START
  lastDragSentAt: 0,
};

// Public Cloud WSS MQTT brokers (zero-backend global room relay for GitHub Pages & Symmetric NAT)
const CLOUD_BROKERS = [
  { url: "wss://public.cloud.shiftr.io", user: "public", pass: "public" },   // Standard HTTPS port 443 (pierces strict firewalls)
  { url: "wss://broker.emqx.io:8084/mqtt", user: null, pass: null }          // High-capacity global EMQX cluster backup
];

const ICE_CONFIG = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" }
  ]
};

const IN_GAME_TYPES = new Set([
  "STATE_SYNC", "WAIT_ROLL", "WAIT_MOVE", "WAIT_CHOOSE",
  "WAIT_ITEM", "WAIT_TARGET", "LOG_LINE", "ACTION_SYNC",
  "FLY_ITEM", "DRAG_MOVE", "GAME_OVER", "PLAYER_LEFT", "PLAYER_BACK",
  "RECONNECT_WAIT", "RECONNECT_WAIT_END"
]);

function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function fullPeerId(code) {
  return "snc-" + code.toLowerCase();
}

function makeMsgId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}

// ---- reconnect system constants ----
const HB_PING_MS = 1000;          // guests ping the host this often
const HB_TIMEOUT_MS = 2800;       // nothing heard for this long = disconnected (a closed tab is noticed instantly, this is for dead connections)
const LOBBY_TIMEOUT_MS = 12000;   // the lobby is more forgiving (nobody is waiting for anybody)
const RECOVERY_GIVEUP_MS = 15000; // a player that cannot find any host for this long learns the lobby is over
const REJOIN_GIVEUP_MS = 15000;   // a page that is trying to get back into a game after a reload tries for this long (the countdown at the bottom right of the title screen)
const ELECT_BASE_MS = 1000;       // new-host election: first candidate takes over this long after the host is lost...
const ELECT_STEP_MS = 3500;       // ...each next candidate waits this much longer
const XFER_TTL_MS = 120000;       // a "switch device" code lives 2 minutes
const SESSION_KEY = "snc_session";

// ---- More network and timing numbers (all in milliseconds unless the name says otherwise) ----
const HOST_RECORD_FRESH_MS = 15000;   // a lobby's listing is only trusted if its host was heard from this recently
const MQTT_OUTBOX_MAX = 64;           // messages waiting to be sent over the relay: older ones are dropped beyond this
const SOCKET_RETRY_MS = 1800;         // wait before re-opening a lost relay connection
const SOCKET_PING_MS = 25000;         // how often the relay connection is pinged to keep it alive
const HTTP_BATCH_MAX = 32;            // most messages sent in one go over the backup (HTTP) channel
const HTTP_RETRY_PAUSE_MS = 600;      // pause before retrying the backup channel
const PEER_RECONNECT_MS = 600;        // wait before asking the peer server to reconnect
const HOST_START_WAIT_MS = 1200;      // how long hosting waits for a relay before going on without one
const RELAY_GRACE_MS = 1200;          // the relay may still be carrying a player: give them this extra time before calling them gone
const JOIN_HANDSHAKE_DELAY_MS = 60;   // short pause before the join handshake is sent
const KNOCK_FAST_MS = 500, KNOCK_SLOW_MS = 1200;   // a returning player knocks every 0.5s, a new player every 1.2s
const JOIN_GIVEUP_MS = 12000;         // a new player gives up joining after this long
const KNOCK_FAST_TRIES = 4;           // a returning player knocks fast for this many tries, then only every second try
const RTC_TRY_AT = [3, 6];            // direct (WebRTC) connections are attempted on these tries...
const RTC_RETURNING_TRY_AT = 12;      // ...and once more on this try for a returning player
const SESSION_SAVE_EVERY = 5;         // the seat held by a live tab is re-saved every this many monitor ticks
const MONITOR_TICK_MS = 500;          // how often connections are checked
const SLEEP_GAP_MS = 2500;            // a pause between two checks longer than this means the computer slept: everybody gets a fresh start
const RELOAD_DELAY_MS = 1500, RELOAD_SOON_MS = 600;   // short waits before the page reloads itself
const RECOVERY_TICK_MS = 1000;        // how often a lost player looks for a host
const EPOCH_SEARCH_SPAN = 5;          // a returning player tries this many host generations beyond the last known one
const BANNER_AFTER_MS = 8000;         // the "Connection lost" banner shows the form after this long
const LINK_UP_GRACE_MS = 2500;        // after my connection returns, wait this long for the host to answer before acting
const RESUME_GRACE_MS = 1500;         // after the host starts, wait this long so players can arrive before the first prompt
const PROBE_MAX = 15;                 // how many times an old host looks for a new host
const PROBE_EVERY_MS = 2000;          // ...and how often
const RECHECK_MS = 3000, RECHECK_FIRST_MS = 1000;   // waits used when double-checking a lost link before carrying on
const COUNTDOWN_TICK_MS = 250;        // the reconnect countdown refreshes this often
const SYNC_LOG_LINES = 80;            // log lines sent to a rejoining player
const SYNC_CHAT_LINES = 40;           // chat lines sent to a rejoining player
const XFER_ATTEMPT_MS = 60000;        // a switch-device attempt is valid for this long
const XFER_MAX_FAILS = 6;             // this many wrong codes lock switch-device for a while...
const XFER_LOCK_MS = 30000;           // ...for this long
const XFER_ANSWER_MS = 5000;          // the host must answer a switch-device request within this time
const SEEN_MSGS_MAX = 1200;           // how many message ids are remembered to ignore duplicates
const UNKNOWN_SEAT_GRACE_MS = 2500;   // a guest told "unknown seat" only acts after being in the game this long
const NO_ELECT_MS = 10000;            // after an election nobody starts another for this long
const DRAG_SEND_MIN_MS = 45;          // drag positions are sent to other players at most this often
const ROOM_CODE_LENGTH = 5;           // characters in a lobby code
const XFER_CODE_LENGTH = 6;           // characters in a switch-device code
const STANDIN_THROW = { vx: 1, vy: 0.4 };   // the throw used when the game rolls for a player (everybody sees the same roll)
const SESSION_HOURS = 6;              // a saved seat is forgotten after this many hours
const SESSION_MAX_AGE = SESSION_HOURS * 3600 * 1000;   // ...in milliseconds

// hostPeerId(code, epoch): the address of the host. Epoch 0 = the original host; every host change gets a fresh address so two hosts never share one.
function hostPeerId(code, epoch) {
  return fullPeerId(code) + (epoch ? "-e" + epoch : "");
}
function isHostPeerId(id) {
  if (typeof id !== "string" || !NET.roomCode) return false;
  const base = fullPeerId(NET.roomCode);
  return id.indexOf(base) === 0 && /^(-e\d+)?$/.test(id.slice(base.length));
}

// ---- secret tokens: sha256 (small synchronous implementation: crypto.subtle is missing on plain-http LAN pages) ----
const SHA_K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
function sha256hex(str) {
  const bytes = Array.from(new TextEncoder().encode(String(str)));
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i--) bytes.push(i >= 4 ? 0 : (bitLen >>> (i * 8)) & 255);
  const H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19], w = new Array(64);
  const rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < bytes.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[o + i * 4] << 24) | (bytes[o + i * 4 + 1] << 16) | (bytes[o + i * 4 + 2] << 8) | bytes[o + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const t1 = (h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + SHA_K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  return H.map(x => (x >>> 0).toString(16).padStart(8, "0")).join("");
}
function randomBytes(n) {
  const a = new Uint8Array(n);
  try { (self.crypto || self.msCrypto).getRandomValues(a); } catch (e) { for (let i = 0; i < n; i++) a[i] = Math.floor(Math.random() * 256); }
  return a;
}
function makeToken() { return Array.from(randomBytes(16), b => b.toString(16).padStart(2, "0")).join(""); }
function makeXferSecret() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", r = randomBytes(6);
  return Array.from(r, b => chars[b % chars.length]).join("");
}
function seatByToken(token) {
  if (!token || typeof token !== "string") return -1;
  return NET.seatHash.indexOf(sha256hex(token));
}

// ---- the saved session: lets a page that was closed / reloaded / crashed find its way back to its seat ----
// sessionStorage belongs to THIS tab (a reload gets it back); localStorage is the fallback for a tab that was closed and reopened.
function saveSession() {
  if (!NET.active || NET.retired || !NET.roomCode || !NET.myToken || !NET.gameStarted) return;
  const s = JSON.stringify({ room: NET.roomCode, token: NET.myToken, idx: NET.myPlayerIndex, epoch: NET.epoch, ts: Date.now(), live: true });
  try { sessionStorage.setItem(SESSION_KEY, s); } catch (e) {}
  try { localStorage.setItem(SESSION_KEY, s); } catch (e) {}
}
function readSession(store) {
  try {
    const j = JSON.parse(store.getItem(SESSION_KEY) || "null");
    if (j && j.token && j.room && Date.now() - j.ts < SESSION_MAX_AGE) return j;
  } catch (e) {}
  return null;
}
// loadSession(room): the seat this device holds in that room (used when the player types the room code)
function loadSession(room) {
  const want = room ? String(room).toUpperCase() : null;
  for (const st of [window.sessionStorage, window.localStorage]) {
    let j = null;
    try { j = st && readSession(st); } catch (e) {}
    if (j && (!want || j.room === want)) return j;
  }
  return null;
}
// pickAutoSession(): the seat this page should take back by itself right now. This tab's own session always counts (page reload);
// the shared one counts only if no other live tab is refreshing it (this tab was closed and reopened).
function pickAutoSession() {
  let j = null;
  try { j = readSession(window.sessionStorage); } catch (e) {}
  if (j) return j;
  try { j = readSession(window.localStorage); } catch (e) {}
  if (j && (!j.live || Date.now() - j.ts > HOST_RECORD_FRESH_MS)) return j;
  return null;
}
function clearSession() {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function markSessionClosed() {   // this page is going away cleanly: let a new page take the seat back at once
  try {
    const j = readSession(window.localStorage);
    if (j && j.token === NET.myToken) { j.live = false; localStorage.setItem(SESSION_KEY, JSON.stringify(j)); }
  } catch (e) {}
}

// ------------------------------------------------------------------ 1. FALLBACK TRANSPORTS
// PeerJS signaling WebSocket fallback (used ONLY on static hosts when WebRTC is blocked)
function wsSend(dstPeerId, data) {
  if (!NET.peer || !dstPeerId) return false;
  const sock = NET.peer.socket || NET.peer._socket;
  if (!sock) return false;
  const packet = {
    type: "CANDIDATE",
    dst: dstPeerId,
    payload: {
      _sncRelay: true,
      connectionId: "snc_ws",
      src: NET.myId,
      data: data
    }
  };
  try {
    const rawWs = sock._socket;
    if (rawWs && rawWs.readyState === 1) {
      rawWs.send(JSON.stringify(packet));
      return true;
    }
    if (typeof sock.send === "function") {
      sock.send(packet);
      return true;
    }
  } catch (e) {}
  return false;
}

function setupSocketRelay(peer) {
  const sock = peer && (peer.socket || peer._socket);
  if (!sock) return;

  const onRawMsg = raw => {
    if (!raw || typeof raw !== "object") return;
    if (raw.payload && raw.payload._sncRelay && raw.payload.data) {
      const srcPeerId = raw.payload.src || raw.src;
      deliverRelayPacket(srcPeerId, raw.payload.data);
    }
  };

  const rawWs = sock._socket;
  if (typeof sock.on === "function" && !sock._sncHooked) {
    sock._sncHooked = true;
    sock.on("message", onRawMsg);
  } else if (rawWs && typeof rawWs.addEventListener === "function" && !rawWs._sncHooked) {
    rawWs._sncHooked = true;
    rawWs.addEventListener("message", ev => {
      try { onRawMsg(JSON.parse(ev.data)); } catch (e) {}
    });
  }
}

function deliverRelayPacket(srcPeerId, msg, mqttBrokerIdx) {
  if (!msg) return;
  if (NET.isHost && srcPeerId) {
    let hc = NET.peerMap[srcPeerId];
    if (!hc) {
      hc = createHybridConn(srcPeerId, null);
      NET.peerMap[srcPeerId] = hc;
    }
    if (mqttBrokerIdx !== undefined) hc.mqttIdx = mqttBrokerIdx;
    hc.open = true;
    handleNetData(msg, hc);
  } else if (!NET.isHost && NET.hostConn) {
    if (srcPeerId && !isHostPeerId(srcPeerId)) return;   // a guest only believes the host
    if (mqttBrokerIdx !== undefined) NET.hostConn.mqttIdx = mqttBrokerIdx;
    NET.hostConn.open = true;
    handleNetData(msg, NET.hostConn);
  }
}

// ---- Zero-Dependency MQTT 3.1.1 over WSS Cloud Relay (works on GitHub Pages & strict NATs) ----
const MQTT_ENC = new TextEncoder();
const MQTT_DEC = new TextDecoder();

function mqttVarLen(n) {
  const out = [];
  do {
    let b = n & 127;
    n >>>= 7;
    if (n > 0) b |= 128;
    out.push(b);
  } while (n > 0);
  return out;
}

function mqttStr(s) {
  const b = MQTT_ENC.encode(s);
  return [(b.length >> 8) & 255, b.length & 255, ...b];
}

function mqttPkt(type, body) {
  return new Uint8Array([type, ...mqttVarLen(body.length), ...body]);
}

function mqttConnectPkt(cid, user, pass) {
  let flags = 0x02;   // Clean session
  const pl = [...mqttStr(cid)];
  if (user) { flags |= 0x80; pl.push(...mqttStr(user)); }
  if (pass) { flags |= 0x40; pl.push(...mqttStr(pass)); }
  return mqttPkt(0x10, [0, 4, 77, 81, 84, 84, 4, flags, 0, 120, ...pl]);   // Keep-Alive = 120s
}

function mqttSubPkt(pktId, topics) {
  const b = [(pktId >> 8) & 255, pktId & 255];
  for (const t of topics) b.push(...mqttStr(t), 0);
  return mqttPkt(0x82, b);
}

function mqttPubPkt(topic, jsonStr) {
  const p = MQTT_ENC.encode(jsonStr);
  const t = mqttStr(topic);
  const bodyLen = t.length + p.length;
  const vl = mqttVarLen(bodyLen);
  const out = new Uint8Array(1 + vl.length + bodyLen);
  out[0] = 0x30;
  out.set(vl, 1);
  out.set(t, 1 + vl.length);
  out.set(p, 1 + vl.length + t.length);
  return out;
}

function mqttParse(buf, onMsg, onConnAck) {
  let i = 0;
  while (i < buf.length) {
    const type = buf[i] & 0xf0;
    let mul = 1, len = 0, idx = i + 1;
    while (idx < buf.length) {
      const d = buf[idx++];
      len += (d & 127) * mul;
      if ((d & 128) === 0) break;
      mul *= 128;
    }
    if (idx + len > buf.length) break;
    if (type === 0x20 && onConnAck) {
      onConnAck(buf[idx + 1]);
    } else if (type === 0x30) {
      const tLen = (buf[idx] << 8) | buf[idx + 1];
      const topic = MQTT_DEC.decode(buf.subarray(idx + 2, idx + 2 + tLen));
      let pStart = idx + 2 + tLen;
      if (((buf[i] >> 1) & 3) > 0) pStart += 2;
      const payload = MQTT_DEC.decode(buf.subarray(pStart, idx + len));
      onMsg(topic, payload);
    }
    i = idx + len;
  }
}

function mqttIsReady() {
  return NET.mqttSockets.some(s => s && s.ready && s.ws && s.ws.readyState === 1);
}

function mqttSend(dstPeerId, data, preferredIdx, allBrokers) {
  if (!NET.roomCode || !NET.myId || typeof WebSocket === "undefined") return false;
  const readyList = NET.mqttSockets.filter(s => s && s.ready && s.ws && s.ws.readyState === 1);
  if (!readyList.length) {
    if (data && data.type === "DRAG_MOVE") {
      for (let i = NET.mqttOutbox.length - 1; i >= 0; i--) {
        if (NET.mqttOutbox[i].dst === (dstPeerId || "*") && NET.mqttOutbox[i].data && NET.mqttOutbox[i].data.type === "DRAG_MOVE") {
          NET.mqttOutbox.splice(i, 1);
        }
      }
    }
    NET.mqttOutbox.push({ dst: dstPeerId || "*", data, preferredIdx, allBrokers });
    if (NET.mqttOutbox.length > MQTT_OUTBOX_MAX) NET.mqttOutbox.shift();
    return true;
  }

  const topic = (!dstPeerId || dstPeerId === "*")
    ? `snc-slc-v2/${NET.roomCode}/all`
    : `snc-slc-v2/${NET.roomCode}/${dstPeerId}`;
  const pkt = mqttPubPkt(topic, JSON.stringify({ src: NET.myId, dst: dstPeerId || "*", data }));

  if (allBrokers) {
    readyList.forEach(s => { try { s.ws.send(pkt); } catch (e) {} });
    return true;
  }

  const pref = (preferredIdx != null && NET.mqttSockets[preferredIdx] && NET.mqttSockets[preferredIdx].ready && NET.mqttSockets[preferredIdx].ws.readyState === 1)
    ? NET.mqttSockets[preferredIdx]
    : readyList[0];
  try {
    pref.ws.send(pkt);
    return true;
  } catch (e) {
    return false;
  }
}

function stopCloudRelay() {
  if (NET.mqttPingTimer) {
    clearInterval(NET.mqttPingTimer);
    NET.mqttPingTimer = null;
  }
  NET.mqttSockets.forEach(s => {
    if (!s) return;
    s.stopped = true;
    s.ready = false;
    if (s.reconnTimer) clearTimeout(s.reconnTimer);
    if (s.ws) { try { s.ws.close(); } catch (e) {} }
  });
  NET.mqttSockets = [];
  NET.mqttOutbox = [];
}

function startCloudRelay(onAnyBrokerReady) {
  stopCloudRelay();
  if (typeof WebSocket === "undefined" || !NET.roomCode || !NET.myId) return;

  const connectSlot = idx => {
    const cfg = CLOUD_BROKERS[idx];
    const slot = { idx, ws: null, ready: false, stopped: false, reconnTimer: null };
    NET.mqttSockets[idx] = slot;

    const openSocket = () => {
      if (slot.stopped || !NET.active || !NET.roomCode || !NET.myId) return;
      let ws;
      try {
        ws = new WebSocket(cfg.url, "mqtt");
      } catch (e) {
        return;
      }
      ws.binaryType = "arraybuffer";
      slot.ws = ws;

      ws.onopen = () => {
        if (slot.stopped) { try { ws.close(); } catch (e) {} return; }
        const cid = `snc_${NET.roomCode}_${idx}_${Math.random().toString(36).slice(2, 9)}`;
        try { ws.send(mqttConnectPkt(cid, cfg.user, cfg.pass)); } catch (e) {}
      };

      ws.onmessage = ev => {
        if (slot.stopped || !ev.data) return;
        mqttParse(
          new Uint8Array(ev.data),
          (_topic, payload) => {
            try {
              const env = JSON.parse(payload);
              if (!env || !env.src || env.src === NET.myId || !env.data) return;
              deliverRelayPacket(env.src, env.data, idx);
            } catch (e) {}
          },
          rc => {
            if (rc !== 0) return;
            slot.ready = true;
            try {
              ws.send(mqttSubPkt(1, [
                `snc-slc-v2/${NET.roomCode}/${NET.myId}`,
                `snc-slc-v2/${NET.roomCode}/all`
              ]));
            } catch (e) {}
            if (NET.mqttOutbox.length) {
              const queued = NET.mqttOutbox.splice(0);
              queued.forEach(item => mqttSend(item.dst, item.data, item.preferredIdx, item.allBrokers));
            }
            if (onAnyBrokerReady) onAnyBrokerReady(idx);
          }
        );
      };

      ws.onerror = () => {};
      ws.onclose = () => {
        slot.ready = false;
        if (!slot.stopped && NET.active) {
          slot.reconnTimer = setTimeout(openSocket, SOCKET_RETRY_MS);
        }
      };
    };

    openSocket();
  };

  for (let i = 0; i < CLOUD_BROKERS.length; i++) connectSlot(i);

  NET.mqttPingTimer = setInterval(() => {
    const ping = new Uint8Array([0xc0, 0x00]);
    NET.mqttSockets.forEach(s => {
      if (s && s.ready && s.ws && s.ws.readyState === 1) {
        try { s.ws.send(ping); } catch (e) {}
      }
    });
  }, SOCKET_PING_MS);
}

// Ordered, batched FIFO HTTP sender for serve.py (/api/send) - prevents out-of-order POST races
function enqueueHttpSend(dstPeerId, data) {
  if (!NET.httpEnabled || !NET.roomCode || !NET.myId) return;
  // Coalesce ephemeral DRAG_MOVE packets in the outbox so drag previews never build a queue
  if (data && data.type === "DRAG_MOVE") {
    for (let i = NET.httpOutbox.length - 1; i >= 0; i--) {
      if (NET.httpOutbox[i].dst === (dstPeerId || "*") && NET.httpOutbox[i].data && NET.httpOutbox[i].data.type === "DRAG_MOVE") {
        NET.httpOutbox.splice(i, 1);
      }
    }
  }
  NET.httpOutbox.push({ dst: dstPeerId || "*", data });
  flushHttpOutbox();
}

async function flushHttpOutbox() {
  if (NET.httpFlushing || !NET.httpEnabled || !NET.httpOutbox.length) return;
  NET.httpFlushing = true;
  while (NET.httpEnabled && NET.httpOutbox.length) {
    const batch = NET.httpOutbox.splice(0, HTTP_BATCH_MAX);
    try {
      const r = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room: NET.roomCode,
          src: NET.myId,
          batch
        })
      });
      if (r.status === 404 || r.status === 405) {
        NET.httpEnabled = false;
        const unsent = [...batch, ...NET.httpOutbox.splice(0)];
        unsent.forEach(it => {
          if (!mqttSend(it.dst, it.data)) {
            if (it.dst && it.dst !== "*") wsSend(it.dst, it.data);
            else if (NET.isHost) NET.connections.forEach(c => { if (c.open && !c.isRtcOpen()) wsSend(c.peer, it.data); });
          }
        });
        break;
      }
    } catch (e) {
      break;
    }
  }
  NET.httpFlushing = false;
}

function stopServerRelay() {
  if (NET.sse) {
    try { NET.sse.close(); } catch (e) {}
    NET.sse = null;
  }
  NET.sseConnected = false;
  if (NET.httpPollAbort) {
    NET.httpPollAbort.stopped = true;
    NET.httpPollAbort = null;
  }
  NET.httpOutbox.length = 0;
}

// Connects instant SSE stream (/api/events) with automatic long-poll fallback (/api/poll?wait=8)
function startServerRelay(keepSeq) {
  stopServerRelay();
  if (!keepSeq) NET.httpSeq = 0;
  if (/\.github\.io$/i.test(location.hostname)) {
    NET.httpEnabled = false;
    return;
  }
  NET.httpEnabled = true;

  const handleBatch = j => {
    if (!j) return;
    if (typeof j.seq === "number" && j.seq > NET.httpSeq) NET.httpSeq = j.seq;
    if (Array.isArray(j.msgs)) {
      for (const m of j.msgs) {
        if (m && m.data) deliverRelayPacket(m.src, m.data);
      }
    }
  };

  if (typeof EventSource !== "undefined") {
    const url = `/api/events?room=${encodeURIComponent(NET.roomCode)}&peer=${encodeURIComponent(NET.myId)}&after=${NET.httpSeq}`;
    const es = new EventSource(url);
    NET.sse = es;
    es.onopen = () => {
      NET.sseConnected = true;
    };
    es.onmessage = ev => {
      NET.sseConnected = true;
      try { handleBatch(JSON.parse(ev.data)); } catch (e) {}
    };
    es.onerror = () => {
      // If SSE fails to open (static host 404 or buffering proxy), fall back cleanly to long-polling
      if (!NET.sseConnected) {
        try { es.close(); } catch (e) {}
        NET.sse = null;
        startLongPollLoop(handleBatch);
      }
    };
  } else {
    startLongPollLoop(handleBatch);
  }
}

async function startLongPollLoop(handleBatch) {
  const token = { stopped: false };
  NET.httpPollAbort = token;
  while (!token.stopped && NET.active && NET.httpEnabled && NET.roomCode && NET.myId) {
    try {
      const r = await fetch(`/api/poll?room=${encodeURIComponent(NET.roomCode)}&peer=${encodeURIComponent(NET.myId)}&after=${NET.httpSeq}&wait=8`);
      if (token.stopped) break;
      if (!r.ok) {
        if (r.status === 404 || r.status === 405) NET.httpEnabled = false;
        break;
      }
      const j = await r.json();
      handleBatch(j);
    } catch (e) {
      await new Promise(res => setTimeout(res, HTTP_RETRY_PAUSE_MS));
    }
  }
}

// ------------------------------------------------------------------ 2. HYBRID CONNECTION
// Uses direct WebRTC DataChannel exclusively once open; falls back to SSE/HTTP, Cloud WSS, or PeerJS WS only when needed
function createHybridConn(peerId, rtcConn) {
  return {
    peer: peerId,
    rtcConn: rtcConn || null,
    mqttIdx: undefined,
    open: true,
    playerIndex: null,
    lastRx: 0,            // when this connection last delivered anything (heartbeat watching)
    isRtcOpen() {
      return !!(this.rtcConn && this.rtcConn.open);
    },
    send(msg, opts) {
      if (msg && typeof msg === "object" && !msg._mid && msg.type !== "DRAG_MOVE" && msg.type !== "PING" && msg.type !== "PONG") {
        msg._mid = makeMsgId();
      }
      // Fast path: direct WebRTC DataChannel is open -> send ONLY via WebRTC (zero server/WS load!)
      if (this.isRtcOpen()) {
        try {
          this.rtcConn.send(msg);
          return;
        } catch (e) {}
      }
      // Fallback path for Symmetric NAT / CGNAT / static GitHub Pages or while WebRTC is shaking hands
      if (NET.httpEnabled) {
        enqueueHttpSend(this.peer, msg);
      } else if (!mqttSend(this.peer, msg, this.mqttIdx, opts && opts.allBrokers)) {
        wsSend(this.peer, msg);
      }
    }
  };
}

// sendToPeer(peerId, msg): one message to a specific address (used to knock on several possible host addresses)
function sendToPeer(peerId, msg, opts) {
  const h = (NET.hostConn && NET.hostConn.peer === peerId) ? NET.hostConn : createHybridConn(peerId, null);
  h.send(msg, opts || { allBrokers: true });
}

// Keep PeerJS signaling & Cloud WSS relays alive across tab switches
document.addEventListener("visibilitychange", () => {
  if (document.hidden || !NET.active) return;
  ensureTransports();
  const ping = new Uint8Array([0xc0, 0x00]);
  NET.mqttSockets.forEach(s => {
    if (s && s.ready && s.ws && s.ws.readyState === 1) {
      try { s.ws.send(ping); } catch (e) {}
    }
  });
});

// ------------------------------------------------------------------ 3. HOST & GUEST INIT
// startHostTransport(pid, onIdTaken): bring up everything a host needs to be reachable at address pid (relays + PeerJS). Used for a new room and when the host role moves.
function startHostTransport(pid, onIdTaken) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finishHost = () => {
      if (!settled) { settled = true; resolve(NET.roomCode); }
    };

    startServerRelay();
    startCloudRelay(() => finishHost());

    if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} }
    NET.peer = new Peer(pid, { debug: 0, config: ICE_CONFIG });

    NET.peer.on("open", id => {
      NET.myId = id;
      setupSocketRelay(NET.peer);
      finishHost();
    });

    // Auto-reconnect signaling socket if 0.peerjs.com drops idle/backgrounded host!
    NET.peer.on("disconnected", () => {
      if (NET.active && NET.peer && !NET.peer.destroyed) {
        setTimeout(() => {
          if (NET.active && NET.peer && NET.peer.disconnected && !NET.peer.destroyed) {
            try { NET.peer.reconnect(); } catch (e) {}
          }
        }, PEER_RECONNECT_MS);
      }
    });

    setTimeout(() => {
      if (NET.httpEnabled || mqttIsReady()) finishHost();
    }, HOST_START_WAIT_MS);

    NET.peer.on("connection", conn => {
      handleIncomingConnection(conn);
    });

    NET.peer.on("error", err => {
      if (err.type === "unavailable-id" && !settled && onIdTaken) {
        settled = true;
        onIdTaken();
      } else if (!settled && (NET.httpEnabled || mqttIsReady())) {
        finishHost();
      } else if (!settled) {
        // Give Cloud WSS relay a moment before failing
        setTimeout(() => {
          if (!settled) {
            if (mqttIsReady() || NET.httpEnabled) finishHost();
            else { settled = true; reject(err); }
          }
        }, HOST_START_WAIT_MS);
      }
    });
  });
}

function initHost(customCode) {
  return new Promise((resolve, reject) => {
    initRows();
    NET.roomCode = (customCode || genRoomCode()).toUpperCase();
    const pid = hostPeerId(NET.roomCode, 0);
    NET.isHost = true;
    NET.active = true;
    NET.myPlayerIndex = 0;
    NET.joined = true;
    NET.connections = [];
    NET.peerMap = {};
    NET.seenMsgs.clear();
    NET.earlyQueue = [];
    NET.stateSeq = 0;
    NET.myId = pid;
    NET.epoch = 0;
    NET.hostIdx = 0;
    NET.gameStarted = false;
    NET.retired = false;
    NET.hostLost = false;
    NET.selfLost = false;
    NET.waitMsg = null;
    NET.xferCodes = [];
    NET.myToken = makeToken();                      // the host's own secret seat token
    NET.seatHash = [sha256hex(NET.myToken)];

    startHostTransport(pid, () => {
      stopCloudRelay();
      try { NET.peer.destroy(); } catch (e) {}
      initHost().then(resolve).catch(reject);
    }).then(code => {
      startHeartbeat();
      resolve(code);
    }).catch(reject);
  });
}

// guestConnectRtc(): open the direct WebRTC channel to the current host address (the relays carry everything until it is open)
function guestConnectRtc() {
  const hc = NET.hostConn;
  if (!hc || !NET.peer || NET.peer.disconnected || NET.peer.destroyed || hc.isRtcOpen()) return;
  try {
    const rtcConn = NET.peer.connect(hc.peer, { reliable: true });
    hc.rtcConn = rtcConn;
    rtcConn.on("open", () => {
      if (!NET.joined && NET.sendJoinHandshake) NET.sendJoinHandshake();
    });
    rtcConn.on("data", data => handleNetData(data, hc));
    rtcConn.on("close", () => {
      if (hc.rtcConn !== rtcConn || NET.hostConn !== hc) return;
      if (!NET.httpEnabled && !mqttIsReady()) { if (NET.joined) onHostLost("rtc"); }
      else NET.lastRx = Math.min(NET.lastRx || 0, performance.now() - HB_TIMEOUT_MS + RELAY_GRACE_MS);   // the relay may still be carrying us: give it a moment
    });
    rtcConn.on("error", () => {});
  } catch (e) {}
}

// initGuest(code, playerName, opts): join a room. opts = { token, epoch, rejoin, xfer }:
//   token  = the secret seat token of a returning player; xfer = a "switch device" secret; epoch = last host generation this device knew.
function initGuest(code, playerName, opts) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    NET.roomCode = code.toUpperCase().trim();
    NET.isHost = false;
    NET.active = true;
    NET.joined = false;
    NET.retired = false;
    NET.hostLost = false;
    NET.gameStarted = false;
    NET.seenMsgs.clear();
    NET.earlyQueue = [];
    NET.myId = "guest-" + Math.random().toString(36).slice(2, 10);
    NET.myToken = opts.token || null;
    NET.pendingXfer = opts.xfer || null;
    NET.epoch = opts.epoch || 0;

    const returning = !!(opts.token || opts.xfer || opts.rejoin);
    const epochs = returning ? Array.from({ length: EPOCH_SEARCH_SPAN + 1 }, (_, i) => NET.epoch + i) : [0];   // a returning player does not know which generation of host is alive
    const hc = createHybridConn(hostPeerId(NET.roomCode, NET.epoch), null);
    NET.hostConn = hc;

    let settled = false;
    let joinRetryTimer = null;

    const cleanupRetry = () => {
      if (joinRetryTimer) { clearInterval(joinRetryTimer); joinRetryTimer = null; }
      NET.sendJoinHandshake = null;
    };

    NET.onJoinAck = () => {
      cleanupRetry();
      if (!settled) { settled = true; resolve(hc); }
    };
    NET.onJoinDenied = reason => {
      cleanupRetry();
      if (!settled) { settled = true; reject(new Error(reason || "Join denied")); }
    };

    const joinMsg = () => ({ type: "JOIN_REQ", name: playerName || "Guest", token: opts.token || undefined, xfer: opts.xfer || undefined });
    const sendJoinHandshake = () => {
      if (NET.joined) { cleanupRetry(); return; }
      epochs.forEach(e => sendToPeer(hostPeerId(NET.roomCode, e), joinMsg()));
    };
    NET.sendJoinHandshake = sendJoinHandshake;

    startServerRelay();
    startCloudRelay(() => {
      if (!NET.joined) sendJoinHandshake();
    });

    // Immediate attempt over HTTP/SSE if served by serve.py
    if (NET.httpEnabled) setTimeout(sendJoinHandshake, JOIN_HANDSHAKE_DELAY_MS);

    let tries = 0;
    const tickMs = returning ? KNOCK_FAST_MS : KNOCK_SLOW_MS;                                       // a returning player knocks faster...
    const giveUpMs = opts.giveUpMs || (returning ? REJOIN_GIVEUP_MS : JOIN_GIVEUP_MS);    // ...and gives up after this long
    const maxTries = Math.ceil(giveUpMs / tickMs);
    joinRetryTimer = setInterval(() => {
      tries++;
      if (NET.joined) { cleanupRetry(); return; }
      if (tries > maxTries) {
        cleanupRetry();
        if (!settled) { settled = true; reject(new Error("Timed out waiting for Host response. Check room code.")); }
        return;
      }
      if (opts.onTick) opts.onTick(Math.max(0, giveUpMs - tries * tickMs));      // lets the screen show "15, 14, 13..."
      if (returning && tries > KNOCK_FAST_TRIES && tries % 2) return;                           // first 2 seconds: knock every 0.5s, after that every 1s
      sendJoinHandshake();
      if (!hc.isRtcOpen() && !NET.httpEnabled) {
        epochs.forEach(e => wsSend(hostPeerId(NET.roomCode, e), { _mid: makeMsgId(), type: "JOIN_REQ", name: playerName || "Guest", token: opts.token || undefined, xfer: opts.xfer || undefined }));
        if (RTC_TRY_AT.includes(tries) || (returning && tries === RTC_RETURNING_TRY_AT)) guestConnectRtc();
      }
    }, tickMs);

    if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} }
    NET.peer = new Peer(NET.myId, { debug: 0, config: ICE_CONFIG });

    NET.peer.on("open", id => {
      NET.myId = id;
      setupSocketRelay(NET.peer);
      guestConnectRtc();
    });

    NET.peer.on("disconnected", () => {
      if (NET.active && NET.peer && !NET.peer.destroyed) {
        try { NET.peer.reconnect(); } catch (e) {}
      }
    });

    NET.peer.on("error", () => {
      // PeerJS P2P errors (e.g. Symmetric NAT / EXPIRE) are non-fatal: Cloud WSS / HTTP relay handles the session seamlessly
    });
  });
}

// ensureTransports(): wake up whatever relay channel went to sleep (called when the tab comes back, the network returns, or recovery runs)
function ensureTransports() {
  if (!NET.active || NET.retired) return;
  if (NET.peer && NET.peer.disconnected && !NET.peer.destroyed) {
    try { NET.peer.reconnect(); } catch (e) {}
  }
  if (NET.sse && NET.sse.readyState === 2 && NET.httpEnabled) startServerRelay(true);   // the event stream died for good: open a new one, keeping our place
  if (!NET.mqttSockets.length && NET.roomCode && NET.myId) startCloudRelay();
  if (!NET.isHost && NET.hostConn && !NET.hostConn.isRtcOpen()) guestConnectRtc();
}

// linkAlive(): does this device seem to have a working connection at all? (used so a device that is itself offline never blames - or replaces - the others)
function linkAlive() {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const peerOk = !!(NET.peer && !NET.peer.disconnected && !NET.peer.destroyed);
  return !!((NET.httpEnabled && NET.sseConnected) || mqttIsReady() || peerOk);
}

function handleIncomingConnection(rtcConn) {
  const peerId = rtcConn.peer;
  let hc = NET.peerMap[peerId];
  if (!hc) {
    hc = createHybridConn(peerId, rtcConn);
    NET.peerMap[peerId] = hc;
  } else {
    hc.rtcConn = rtcConn;
  }
  hc.open = true;

  rtcConn.on("data", data => handleNetData(data, hc));
  rtcConn.on("close", () => {
    if (hc.rtcConn !== rtcConn) return;   // an older channel closing after a newer one took over
    if (!NET.httpEnabled && !mqttIsReady()) {
      seatLost(hc, "rtc");                // no other way to reach them: they are gone
    } else if (hc.lastRx) {
      hc.lastRx = Math.min(hc.lastRx, performance.now() - HB_TIMEOUT_MS + RELAY_GRACE_MS);   // the relay may still carry them: if nothing arrives within ~1s they are gone
    }
  });
}

// removeGuestConnection(hc): LOBBY only - the player's slot disappears. (In a running game a lost player keeps their seat: see seatLost.)
function removeGuestConnection(hc) {
  if (!hc) return;
  const idx = NET.connections.indexOf(hc);
  if (idx !== -1) NET.connections.splice(idx, 1);
  if (hc.peer && NET.peerMap[hc.peer] === hc) delete NET.peerMap[hc.peer];
  const pi = hc.playerIndex;
  hc.playerIndex = null;
  if (pi != null) handlePlayerLeave(pi);
}

// Notify peers cleanly when tab closes or reloads
window.addEventListener("beforeunload", () => {
  if (!NET.active || NET.retired) return;
  try {
    markSessionClosed();
    if (NET.isHost) {
      broadcast({ type: "HOST_LEFT", room: NET.roomCode });
    } else if (NET.hostConn) {
      const bye = { _mid: makeMsgId(), type: "BYE", playerIndex: NET.myPlayerIndex };
      if (NET.hostConn.isRtcOpen()) NET.hostConn.rtcConn.send(bye);
      else mqttSend(NET.hostConn.peer, bye, NET.hostConn.mqttIdx, true);
      if (NET.httpEnabled && navigator.sendBeacon && NET.roomCode && NET.myId) {
        navigator.sendBeacon("/api/send", JSON.stringify({
          room: NET.roomCode,
          src: NET.myId,
          dst: NET.hostConn.peer,
          data: bye
        }));
      }
    }
  } catch (e) {}
});

// The device itself went offline / came back: react at once instead of waiting for the heartbeat
window.addEventListener("offline", () => {
  if (!NET.active || NET.retired || !NET.gameStarted || !G || G.winner) return;
  if (NET.isHost) onHostSelfLost();
  else onHostLost("offline");
});
window.addEventListener("online", () => {
  if (!NET.active || NET.retired) return;
  ensureTransports();
  if (NET.hostLost) recoveryTick();
});
// ------------------------------------------------------------------ 4. HEARTBEAT, LOSS DETECTION, RECOVERY, HOST MIGRATION
// How it works:
//  * Every guest pings the host once a second and the host answers. Anything that arrives counts as proof of life.
//  * Nothing heard for HB_TIMEOUT_MS = disconnected. (A closed tab / reload is noticed at once through the BYE message instead.)
//  * The host keeps a lost player's SEAT (their secret token still opens it) and marks the player "disconnected".
//  * A guest that loses the host keeps knocking on every possible host address; the first living player in seat order becomes the new host.

function startHeartbeat() {
  stopHeartbeat();
  NET.lastMonTick = performance.now();
  NET.lastRx = performance.now();
  let n = 0;
  NET.pingTimer = setInterval(() => {
    if (!NET.active || NET.retired) return;
    n++;
    if (n % SESSION_SAVE_EVERY === 0) saveSession();                                   // keeps "this seat is held by a live tab" fresh
    if (!NET.isHost && NET.joined && NET.hostConn && !NET.hostLost) NET.hostConn.send({ type: "PING" });
  }, HB_PING_MS);
  NET.monTimer = setInterval(monitorTick, MONITOR_TICK_MS);
}
function stopHeartbeat() {
  if (NET.pingTimer) { clearInterval(NET.pingTimer); NET.pingTimer = null; }
  if (NET.monTimer) { clearInterval(NET.monTimer); NET.monTimer = null; }
}

function monitorTick() {
  if (!NET.active || NET.retired) return;
  const now = performance.now();
  const gap = now - NET.lastMonTick;
  NET.lastMonTick = now;
  if (gap > SLEEP_GAP_MS) {            // this computer slept / the tab was frozen: everybody gets a fresh start instead of a mass false alarm
    NET.lastRx = now;
    NET.connections.forEach(c => { c.lastRx = now; });
    return;
  }
  if (G && G.winner) return;
  if (NET.isHost) {
    if (NET.selfLost) return;
    const lim = NET.gameStarted ? HB_TIMEOUT_MS : LOBBY_TIMEOUT_MS;
    const seated = NET.connections.filter(c => c.playerIndex != null && c.lastRx);
    // if EVERY guest went quiet at once and my own link looks dead, the problem is mine - do not blame them
    if (NET.gameStarted && seated.length && seated.every(c => now - c.lastRx > lim) && !linkAlive()) { onHostSelfLost(); return; }
    seated.forEach(c => { if (now - c.lastRx > lim) seatLost(c, "timeout"); });
  } else if (NET.joined && !NET.hostLost && NET.lastRx) {
    if (now - NET.lastRx > (NET.gameStarted ? HB_TIMEOUT_MS : LOBBY_TIMEOUT_MS)) onHostLost("timeout");
  }
}

// ---- host side: a player's connection died ----
function seatLost(hc, why) {
  if (!hc) return;
  const idx = hc.playerIndex;
  if (idx == null) { dropConnection(hc); return; }
  if (!NET.gameStarted) { removeGuestConnection(hc); return; }       // still in the lobby: the slot is removed
  onSeatLost(idx, why);
}
function dropConnection(hc) {
  const i = NET.connections.indexOf(hc);
  if (i !== -1) NET.connections.splice(i, 1);
  if (hc.peer && NET.peerMap[hc.peer] === hc) delete NET.peerMap[hc.peer];
  hc.playerIndex = null;          // anything this connection still says is ignored
  hc.open = false;
}
function onSeatLost(idx, why) {
  if (!NET.isHost || !G || G.winner) return;
  const p = G.players[idx];
  if (!p || idx === NET.myPlayerIndex) return;
  const hc = NET.connections.find(c => c.playerIndex === idx);
  if (hc) dropConnection(hc);
  if (p.disconnected) return;
  console.info(`[net] ${p.name} marked disconnected, reason: ${why}`);   // reason: "timeout" (nothing heard from them), "bye" (their page closed / reloaded), ... - handy when a disconnect looks unexplained
  p.disconnected = true;
  p.missed = false;
  log(`<b>${esc(p.name)} disconnected.</b>`);
  broadcast({ type: "PLAYER_LEFT", index: idx, name: p.name });
  hostAutoResolve(idx);           // if the game was waiting for them, let it carry on without them
  render();
  if (typeof syncGameState === "function") syncGameState();
}

// abandonSeat(idx): the player quit on purpose (Quit button). Unlike a dropped connection their panel and pawn are REMOVED, the game goes on without them and the log says so.
function abandonSeat(idx) {
  const p = G && G.players[idx];
  if (!NET.isHost || !p || p.abandoned) return;
  const hc = NET.connections.find(c => c.playerIndex === idx);
  if (hc) dropConnection(hc);
  p.abandoned = true; p.disconnected = true; p.missed = true; p.pos = 0; p.items = [];
  log(`<b>${esc(p.name)} abandoned the game.</b>`);
  broadcast({ type: "PLAYER_LEFT", index: idx, name: p.name, abandoned: true });
  hostAutoResolve(idx);           // if the game was waiting for them, let it carry on without them
  render();
  if (typeof syncGameState === "function") syncGameState();
}
// REACT_SOUND: the only sounds a REACT message may ask for (a character's sad / happy reactions), so nobody can make others play anything else.
const REACT_SOUND = /^(bad|happy)_(bully|gambler|cat|struggler|oracle|charmer)(_\d+)?$/;
const isReactSound = name => REACT_SOUND.test(name) || name === BOO_SOUND;   // ...plus the BOO button's own sound (BOO_SOUND in config.js)

// hostAutoResolve(idx): the game was waiting on a player who just vanished: finish what is pending with neutral defaults.
function hostAutoResolve(idx) {
  if (NET.pendingActorIdx !== idx) return;
  NET.waitMsg = null;
  if (DICE.waiting && !DICE.flying && DICE.done) {
    const vals = DICE.list.map(() => d6());
    const snap = DICE.list.map(d => ({ x: d.x, y: d.y, rx: d.rx, ry: d.ry }));
    sendAction({ type: "ROLL_LAUNCH", vx: STANDIN_THROW.vx, vy: STANDIN_THROW.vy, vals, startDice: snap });   // everybody sees the same roll
    launch(STANDIN_THROW.vx, STANDIN_THROW.vy, vals, snap);
  }
  if (NET.pendingMoveRes) { const fn = NET.pendingMoveRes; NET.pendingMoveRes = null; fn(null); }
  if (NET.pendingChoiceRes) { const fn = NET.pendingChoiceRes; NET.pendingChoiceRes = null; fn(0); }
  if (NET.pendingItemRes) { const fn = NET.pendingItemRes; NET.pendingItemRes = null; fn(null); }
  if (NET.pendingTargetRes) { const fn = NET.pendingTargetRes; NET.pendingTargetRes = null; fn(null); }
  NET.pendingActorIdx = null;
  setPrompt("");
}

// handlePlayerLeave(idx): old entry point. Lobby = remove the slot, game = the seat stays and the player is marked disconnected.
function handlePlayerLeave(playerIdx) {
  if (playerIdx == null) return;
  if (!G) {
    const pName = (S.rows[playerIdx] && S.rows[playerIdx].name) || `Player ${playerIdx + 1}`;
    S.rows.splice(playerIdx, 1);
    NET.seatHash.splice(playerIdx, 1);
    S.n = Math.max(1, S.n - 1);
    // Re-index remaining guest connections above playerIdx
    NET.connections.forEach(c => {
      if (c.playerIndex > playerIdx) {
        c.playerIndex--;
        c.send({ type: "JOIN_ACK", yourIndex: c.playerIndex, rows: S.rows, n: S.n, roomCode: NET.roomCode, token: c.token });
      }
    });
    S.msg = `${pName} left the lobby.`;
    broadcastLobby();
    if (NET.onLobbyUpdate) NET.onLobbyUpdate();
    return;
  }
  onSeatLost(playerIdx, "left");
}

// ---- guest side: the host stopped answering ----
function onHostLost(why) {
  if (NET.hostLost || NET.retired || !NET.active || NET.isHost) return;
  if (G && G.winner) return;
  console.info(`[net] host lost, reason: ${why} (room ${NET.roomCode}, in game: ${!!G})`);   // reason: "timeout" (nothing heard), "left" (host said goodbye), "rtc", "offline", "unknown seat" - handy when it looks unexplained
  if (!G || !NET.gameStarted) {      // lobby: nothing to save, back to the start screen
    showNetworkBanner("Host disconnected. Returning to lobby...");
    setTimeout(() => location.reload(), RELOAD_DELAY_MS);
    return;
  }
  NET.hostLost = true;
  NET.hostLostAt = performance.now();
  showNetworkBanner("Connection lost. Reconnecting...");
  startRecovery();
}
function startRecovery() {
  stopRecovery();
  NET.linkUpSince = 0;
  NET.linkWasDown = false;
  recoveryTick();
  NET.recTimer = setInterval(recoveryTick, RECOVERY_TICK_MS);
}
function stopRecovery() {
  if (NET.recTimer) { clearInterval(NET.recTimer); NET.recTimer = null; }
}
function myName() {
  return (G && G.players[NET.myPlayerIndex] && G.players[NET.myPlayerIndex].name) || "Player";
}
function recoveryTick() {
  if (!NET.active || NET.retired || !NET.hostLost || NET.isHost) { stopRecovery(); return; }
  const el = performance.now() - NET.hostLostAt;
  ensureTransports();
  // knock on every address a host could be using right now (the original one, and the next few generations)
  for (let e = NET.epoch; e <= NET.epoch + EPOCH_SEARCH_SPAN; e++) {
    sendToPeer(hostPeerId(NET.roomCode, e), { type: "JOIN_REQ", name: myName(), token: NET.myToken || undefined, xfer: NET.pendingXfer || undefined });
  }
  if (el > BANNER_AFTER_MS) showNetworkBanner(`Connection lost. Reconnecting... (${Math.floor(el / 1000)}s)`, { form: true });
  maybeElect(el);
  if (el > RECOVERY_GIVEUP_MS && NET.hostLost) endLobby("The lobby has ended: nobody is hosting it any more.");
}

// maybeElect(el): the first living player in seat order becomes the new host, the next one only if the first never appears.
function maybeElect(el) {
  const now = performance.now();
  if (!linkAlive()) { NET.linkUpSince = 0; NET.linkWasDown = true; return; }   // my own connection is down: I must not replace anybody
  if (NET.linkWasDown) {
    if (!NET.linkUpSince) NET.linkUpSince = now;
    if (now - NET.linkUpSince < LINK_UP_GRACE_MS) return;                         // my connection only just came back: give the host time to answer my knock first
  }
  if (now < NET.noElectUntil || !G) return;
  const me = NET.myPlayerIndex;
  const cands = [];
  G.players.forEach((p, i) => { if (i !== NET.hostIdx && (i === me || !p.disconnected)) cands.push(i); });
  const rank = cands.indexOf(me);
  if (rank < 0) return;
  if (el < ELECT_BASE_MS + rank * ELECT_STEP_MS) return;
  becomeHost(NET.epoch + 1 + rank);        // every rank has its own address, so two hosts can never share one
}

// becomeHost(epoch): this page takes over running the game from the last state it received.
function becomeHost(epoch) {
  if (!G || NET.retired) return;
  stopRecovery();
  const me = NET.myPlayerIndex;
  NET.isHost = true;
  NET.epoch = epoch;
  NET.hostIdx = me;
  NET.hostLost = false;
  NET.selfLost = false;
  NET.joined = true;
  NET.gameStarted = true;
  NET.hostConn = null;
  NET.connections = [];
  NET.peerMap = {};
  NET.seenMsgs.clear();
  NET.earlyQueue = [];
  NET.waitMsg = null;
  NET.xferCodes = [];
  NET.pendingActorIdx = null;
  NET.myId = hostPeerId(NET.roomCode, epoch);
  NET.stateSeq = G._stateSeq || 0;
  G.players.forEach((p, i) => {            // everybody else has to come back to me; until then they count as disconnected
    p.missed = false;
    if (i === me) p.disconnected = false;
    else p.disconnected = true;
  });
  stopServerRelay();
  stopCloudRelay();
  startHostTransport(NET.myId).catch(() => {});
  startHeartbeat();
  saveSession();
  hideNetworkBanner();
  log(`<b>${esc(myName())} is the new host.</b>`);
  render();
  watchOldHosts();
  // a short grace so most players have found me before the first prompt goes out
  setTimeout(() => {
    if (!NET.isHost || NET.retired || !G || G.winner) return;
    if (typeof play === "function") play({ resume: true });
  }, RESUME_GRACE_MS);
}

// ---- two hosts alive at once (rare: a host that was only cut off for a while, or a wrong election): they compare notes and one steps down ----
function hostTuple() {
  const now = performance.now();
  const live = 1 + NET.connections.filter(c => c.playerIndex != null && c.lastRx && now - c.lastRx < HB_TIMEOUT_MS).length;
  return { live, seq: NET.stateSeq, epoch: NET.epoch };
}
// iLose(mine, theirs): more live players wins, then the one that played further, then the older host
function iLose(mine, theirs) {
  if (mine.live !== theirs.live) return mine.live < theirs.live;
  if (mine.seq !== theirs.seq) return mine.seq < theirs.seq;
  return mine.epoch > theirs.epoch;
}
// watchOldHosts(): for a while after taking over, check that the previous host really is gone
function watchOldHosts() {
  if (NET.probeTimer) clearInterval(NET.probeTimer);
  let n = 0;
  NET.probeTimer = setInterval(() => {
    if (!NET.isHost || NET.retired || ++n > PROBE_MAX) { clearInterval(NET.probeTimer); NET.probeTimer = null; return; }
    probeOtherHosts(0, NET.epoch - 1);
  }, PROBE_EVERY_MS);
}
function probeOtherHosts(fromEpoch, toEpoch) {
  for (let e = fromEpoch; e <= toEpoch; e++) {
    if (e === NET.epoch) continue;
    createHybridConn(hostPeerId(NET.roomCode, e), null).send({ type: "HOST_PROBE", tuple: hostTuple() }, { allBrokers: true });
  }
}
// a page that has to give up its host role (or seat) comes back as an ordinary player: the saved session lets it rejoin by itself
function stepDown() {
  if (NET.retired) return;
  saveSession();
  NET.retired = true;
  stopHeartbeat();
  showNetworkBanner("Another host is running this game. Rejoining...");
  setTimeout(() => location.reload(), RELOAD_SOON_MS);
}

// onHostSelfLost(): the HOST's own connection died. Keep the game as it is, do not blame the guests; when the link returns check whether somebody took over meanwhile.
function onHostSelfLost() {
  if (NET.selfLost || !NET.isHost || NET.retired) return;
  NET.selfLost = true;
  showNetworkBanner("Connection lost. Reconnecting...");
  if (NET.selfTimer) clearInterval(NET.selfTimer);
  NET.selfTimer = setInterval(() => {
    ensureTransports();
    if (!linkAlive()) return;
    clearInterval(NET.selfTimer);
    NET.selfTimer = null;
    probeOtherHosts(NET.epoch + 1, NET.epoch + 6);     // did somebody take over while I was gone?
    probeOtherHosts(0, NET.epoch - 1);
    setTimeout(() => {
      if (NET.retired || !NET.selfLost) return;
      NET.selfLost = false;                             // nobody did: carry on
      const now = performance.now();
      NET.connections.forEach(c => { c.lastRx = now; });
      hideNetworkBanner();
    }, RECHECK_MS);
  }, RECHECK_FIRST_MS);
}

// endLobby(text): nobody is left to host: the saved seat is useless now
function endLobby(text) {
  clearSession();
  retireSelf(text, { button: "Back to the start screen", clear: true });
}

// retireSelf(text, opts): this page stops playing for good (its seat is used elsewhere, or the lobby is over)
function retireSelf(text, opts) {
  opts = opts || {};
  if (NET.retired) return;
  NET.retired = true;
  stopHeartbeat();
  stopRecovery();
  hideReconnectCountdown();
  if (NET.probeTimer) { clearInterval(NET.probeTimer); NET.probeTimer = null; }
  if (NET.selfTimer) { clearInterval(NET.selfTimer); NET.selfTimer = null; }
  try { stopServerRelay(); } catch (e) {}
  try { stopCloudRelay(); } catch (e) {}
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} NET.peer = null; }
  NET.connections = [];
  NET.peerMap = {};
  hideNetworkBanner();
  let ov = $("netOverlay");
  if (!ov) {
    ov = document.createElement("div");
    ov.id = "netOverlay";
    $("stage").appendChild(ov);
  }
  ov.innerHTML = `<div class="nbox"><p>${esc(text)}</p>${opts.button ? `<button class="cbtn" style="--s:1.4;width:380px" id="netOvBtn"><span>${esc(opts.button)}</span></button>` : ""}</div>`;
  ov.style.display = "flex";
  const b = $("netOvBtn");
  if (b) b.onclick = () => location.reload();
}

// ---- banner shown while this page is reconnecting ----
function showNetworkBanner(text, opts) {
  let el = $("netBanner");
  if (!el) {
    el = document.createElement("div");
    el.id = "netBanner";
    el.innerHTML = `<span id="nbText"></span><span id="nbForm"><input id="nbCode" maxlength="13" placeholder="ROOM CODE" autocomplete="off" spellcheck="false"><button id="nbGo" class="cbtn" style="--s:.7;width:130px"><span>Rejoin</span></button></span>`;
    $("stage").appendChild(el);
    $("nbGo").onclick = () => manualRejoin($("nbCode").value);
    $("nbCode").onkeydown = e => { if (e.key === "Enter") manualRejoin($("nbCode").value); };
  }
  if (!text) { el.style.display = "none"; return; }
  $("nbText").textContent = text;
  const form = !!(opts && opts.form);
  $("nbForm").style.display = form ? "inline-flex" : "none";
  if (form && !$("nbCode").value) $("nbCode").value = NET.roomCode || "";
  el.style.display = "block";
}
function hideNetworkBanner() {
  if (NET.disconnectTimer) { clearInterval(NET.disconnectTimer); NET.disconnectTimer = null; }
  const el = $("netBanner");
  if (el) el.style.display = "none";
}

// manualRejoin(raw): the player typed a room code (optionally followed by a switch-device code) into the banner
function manualRejoin(raw) {
  const s = String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length < ROOM_CODE_LENGTH) return;
  const room = s.slice(0, ROOM_CODE_LENGTH), xfer = s.length >= ROOM_CODE_LENGTH + XFER_CODE_LENGTH ? s.slice(ROOM_CODE_LENGTH, ROOM_CODE_LENGTH + XFER_CODE_LENGTH) : null;
  if (room !== NET.roomCode) {       // another lobby: start a fresh page, the start screen joins it (with this device's seat there, if it has one)
    location.href = location.pathname + "?room=" + room;
    return;
  }
  NET.pendingXfer = xfer;
  if (!NET.hostLost) { NET.hostLost = true; NET.hostLostAt = performance.now(); startRecovery(); }
  else recoveryTick();
}

// ---- the 5-second wait when a disconnected player's turn comes ----
// waitForReconnect(p, ms): host. Resolves true if p comes back within ms, false if not. Everybody sees a countdown.
function waitForReconnect(p, ms) {
  if (!p.disconnected) return Promise.resolve(true);
  const idx = G.players.indexOf(p);
  broadcast({ type: "RECONNECT_WAIT", idx, ms });
  showReconnectCountdown(idx, ms);
  return new Promise(resolve => {
    let done = false, t = null;
    const fin = ok => {
      if (done) return;
      done = true;
      clearTimeout(t);
      NET.reconnectWaiter = null;
      broadcast({ type: "RECONNECT_WAIT_END" });
      hideReconnectCountdown();
      resolve(ok);
    };
    t = setTimeout(() => fin(!p.disconnected), ms);
    NET.reconnectWaiter = i => { if (i === idx) fin(true); };
  });
}
function showReconnectCountdown(idx, ms) {
  hideReconnectCountdown();
  const name = G && G.players[idx] ? G.players[idx].name : "Player";
  const end = performance.now() + ms;
  const tick = () => {
    const s = Math.max(0, Math.ceil((end - performance.now()) / 1000));
    setPrompt(`Waiting for ${name} to reconnect... ${s}`);
  };
  tick();
  NET.rcTimer = setInterval(tick, COUNTDOWN_TICK_MS);
}
function hideReconnectCountdown() {
  if (NET.rcTimer) {
    clearInterval(NET.rcTimer);
    NET.rcTimer = null;
    setPrompt("");
  }
}
// ------------------------------------------------------------------ 5. SEATS: REJOIN, TWO-TAB RULE, SWITCH DEVICE, SNAPSHOTS
// logTailHtml(n): the last n lines of the board log (a rejoining player gets these)
function logTailHtml(n) {
  const l = $("log");
  if (!l) return "";
  return Array.from(l.children).slice(-n).map(k => k.outerHTML).join("");
}

// buildSnapshot(): everything a player needs to pick the game up from nothing (sent to a rejoiner, or to the page taking over as host)
function buildSnapshot() {
  return {
    roomCode: NET.roomCode,
    epoch: NET.epoch,
    hostIdx: NET.myPlayerIndex,
    hashes: NET.seatHash.slice(0, G.players.length),
    stateSeq: NET.stateSeq,
    players: G.players.map(p => ({ name: p.name, character: p.character, pos: p.pos, color: p.color, items: (p.items || []).slice(), cb: p.cb || 0, pen: p.pen || 0, big: !!p.big, cd: p.cd || 0, disconnected: !!p.disconnected })),
    items: G.items,
    turnNo: G.turnNo || 0,
    L: G.L, S: G.S, cobra: G.cobra, kind: G.kind,
    cat: G.cat, catSkin: G.catSkin, catNow: !!G.catNow,
    curIndex: G.cur ? G.players.indexOf(G.cur) : null,
    winnerIndex: G.winner ? G.players.indexOf(G.winner) : null,
    logHtml: logTailHtml(SYNC_LOG_LINES),
    chat: NET.chatHistory.slice(-SYNC_CHAT_LINES).map(c => ({ sender: c.sender, text: c.text, color: c.color }))
  };
}

// applyJoinSnapshot(snap): a fresh page builds the game from it; a page that already has the game updates it in place
function applyJoinSnapshot(snap) {
  const fresh = !G;
  if (fresh) {
    if (typeof leaveTitle === "function") leaveTitle();
    G = { players: snap.players, items: snap.items, turnNo: snap.turnNo, L: snap.L, S: snap.S, cobra: snap.cobra, kind: snap.kind, cat: snap.cat, catSkin: snap.catSkin, catNow: snap.catNow, winner: null, cur: null, built: 0, _stateSeq: snap.stateSeq || 0 };
    G.cur = snap.curIndex != null ? G.players[snap.curIndex] : null;
    G.winner = snap.winnerIndex != null ? G.players[snap.winnerIndex] : null;
    const rk = p => p.character === "charmer" ? -1 : p.character === "cat" ? 1 : 0;
    G.order = [...G.players].sort((a, b) => rk(a) - rk(b));
    const co = G.players.find(p => p.character === "cat");
    if (co) G.catOwner = co;
    $("setup").style.display = "none";
    $("game").style.display = "block";
    setPrompt("");
  } else {
    G._stateSeq = snap.stateSeq || 0;        // the host's numbering is the truth now (a new host may count from a different place)
    applyStateSync({
      stateSeq: snap.stateSeq || 0, turnNo: snap.turnNo,
      players: snap.players.map(p => ({ pos: p.pos, cb: p.cb, pen: p.pen, items: p.items, big: p.big, cd: p.cd, disc: p.disconnected, ab: p.abandoned })),
      S: snap.S, L: snap.L, items: snap.items, cat: snap.cat, catSkin: snap.catSkin, catNow: snap.catNow,
      curIndex: snap.curIndex, winnerIndex: snap.winnerIndex
    });
  }
  const l = $("log"); if (l) { l.innerHTML = snap.logHtml || ""; l.scrollTop = 1e6; }
  const big = $("biglog"); if (big) { big.innerHTML = snap.logHtml || ""; big.scrollTop = 1e6; }
  if (fresh && Array.isArray(snap.chat)) snap.chat.forEach(c => appendChatMessage(c.sender, c.text, c.color, true));
  render();
  if (fresh && NET.earlyQueue.length) {
    const q = NET.earlyQueue.splice(0);
    q.forEach(item => handleNetData(item.msg, item.fromConn));
  }
  if (G.winner) showLocalGameOverPrompt();
}

// ---- host: somebody asks to take a seat in the running game ----
function hostRejoin(msg, hc) {
  if (!G || NET.retired) return;
  const now = performance.now();
  let idx = -1, viaXfer = false;
  let rec = null;                                   // remembers how a used code was answered (see below)
  if (msg.xfer) {                                   // "switch device" code
    const secret = String(msg.xfer).toUpperCase().replace(/[^A-Z0-9]/g, "");
    // A joining page keeps knocking every half second until it gets an answer, and the code is single use. When its first knock was already
    // accepted but the (big) answer is still on its way, the repeat knock must get the SAME answer again - NOT "wrong code".
    NET.xferUsed = (NET.xferUsed || []).filter(u => u.exp > Date.now());
    const used = NET.xferUsed.find(u => u.secret === secret && u.peer === hc.peer);
    if (used) {
      if (used.handover) { if (used.reply) hc.send(Object.assign({}, used.reply, { _mid: undefined })); }   // host seat: send the hand-over again
      else seatTakeover(used.idx, hc, false, used);                                                           // normal seat: answer again with the same token
      return;
    }
    if (now < NET.xferLockUntil) { hc.send({ type: "JOIN_DENIED", reason: "Too many wrong codes. Try again in a moment." }); return; }
    const k = NET.xferCodes.findIndex(c => c.secret === secret && c.exp > Date.now());
    if (k >= 0) {
      idx = NET.xferCodes[k].idx; NET.xferCodes.splice(k, 1); viaXfer = true; NET.xferFails = 0;
      rec = { secret, idx, peer: hc.peer, exp: Date.now() + XFER_ATTEMPT_MS, token: null, reply: null, handover: idx === NET.myPlayerIndex };
      NET.xferUsed.push(rec);
    }
    else {
      if (++NET.xferFails >= XFER_MAX_FAILS) { NET.xferCodes = []; NET.xferFails = 0; NET.xferLockUntil = now + XFER_LOCK_MS; }
      hc.send({ type: "JOIN_DENIED", reason: "That code is wrong or has expired." });
      return;
    }
  } else if (msg.token) {                           // the player's own secret seat token
    idx = seatByToken(msg.token);
  }
  if (idx < 0 || idx >= G.players.length) {
    hc.send({ type: "JOIN_DENIED", reason: "Game already started. Only the players who started it can come back." });
    return;
  }
  if (idx === NET.myPlayerIndex && hc.peer !== NET.myId) {     // somebody claims the HOST's own seat from another page/device: the host role moves there
    hostHandover(hc, viaXfer, rec);
    return;
  }
  seatTakeover(idx, hc, viaXfer, rec);
}

// seatTakeover(idx, hc, viaXfer): connection hc is now the one and only connection of seat idx
function seatTakeover(idx, hc, viaXfer, rec) {
  const now = performance.now();
  const old = NET.connections.find(c => c.playerIndex === idx && c !== hc);
  if (old) {                                        // two pages for one seat: the NEWEST wins, the older one is told to stop
    try { old.send({ type: "SEAT_TAKEN", reason: viaXfer ? "switched" : "other" }); } catch (e) {}
    dropConnection(old);
  }
  hc.playerIndex = idx;
  hc.lastRx = now;
  hc.open = true;
  if (!NET.connections.includes(hc)) NET.connections.push(hc);
  NET.peerMap[hc.peer] = hc;

  let newToken;
  if (viaXfer) {                                    // the new device gets its own token; the old device's token stops working
    newToken = makeToken();
    NET.seatHash[idx] = sha256hex(newToken);
    if (rec) rec.token = newToken;
    broadcast({ type: "SEAT_HASHES", hashes: NET.seatHash.slice(0, G.players.length) });
  } else if (rec && rec.token) newToken = rec.token;   // the same device asking again: the token it was already given
  const p = G.players[idx];
  const wasDown = !!p.disconnected;
  p.disconnected = false;
  p.missed = false;
  hc.send({ type: "REJOIN_ACK", yourIndex: idx, token: newToken, epoch: NET.epoch, hostIdx: NET.myPlayerIndex, hostId: NET.myId, snap: buildSnapshot() });
  if (NET.waitMsg) hc.send(NET.waitMsg);             // whatever the game is waiting for is shown to them again
  if (wasDown) {
    log(`<b>${esc(p.name)} reconnected.</b>`);
    broadcast({ type: "PLAYER_BACK", index: idx, name: p.name });
  } else if (viaXfer) {
    log(`<b>${esc(p.name)} switched device.</b>`);
  }
  render();
  if (typeof syncGameState === "function") syncGameState();
  if (NET.reconnectWaiter) NET.reconnectWaiter(idx);
}

// ---- the host's own seat is claimed from another page/device: hand the host role over ----
function hostHandover(hc, viaXfer, rec) {
  const idx = NET.myPlayerIndex;
  const newEpoch = NET.epoch + 1;
  let newToken = null;
  if (viaXfer) { newToken = makeToken(); NET.seatHash[idx] = sha256hex(newToken); }
  const snap = buildSnapshot();
  snap.epoch = newEpoch;
  snap.hostIdx = idx;
  const reply = { type: "HOST_HANDOVER", snap, token: newToken, yourIndex: idx, epoch: newEpoch };
  if (rec) { rec.token = newToken; rec.reply = reply; }   // kept so a repeat knock can be answered again
  hc.send(Object.assign({}, reply));
  broadcast({ type: "HOST_MOVED", epoch: newEpoch, hostId: hostPeerId(NET.roomCode, newEpoch), hostIdx: idx });
  setTimeout(() => retireSelf(viaXfer ? "This game continues on your other device." : "This game was opened in another tab or device.", viaXfer ? { clear: true } : { button: "Play here instead" }), 700);
  if (viaXfer) clearSession();
}

// ---- "Switch device": the player asks for a one-time code ----
function makeTransferCode(idx) {
  NET.xferCodes = NET.xferCodes.filter(c => c.idx !== idx && c.exp > Date.now());
  const secret = makeXferSecret();
  NET.xferCodes.push({ idx, secret, exp: Date.now() + XFER_TTL_MS });
  return { room: NET.roomCode, secret, ms: XFER_TTL_MS };
}
function requestTransferCode() {
  return new Promise((resolve, reject) => {
    if (!NET.active || !NET.gameStarted || NET.retired) return reject(new Error("Only available in an online game."));
    if (NET.isHost) return resolve(makeTransferCode(NET.myPlayerIndex));
    if (!NET.hostConn || NET.hostLost) return reject(new Error("Not connected right now."));
    if (NET.xferWaiter) clearTimeout(NET.xferWaiter.t);
    NET.xferWaiter = { resolve, reject, t: setTimeout(() => { NET.xferWaiter = null; reject(new Error("The host did not answer.")); }, XFER_ANSWER_MS) };
    NET.hostConn.send({ type: "XFER_REQ" });
  });
}

// cancelTransferCode(): the player pressed X on the code: it stops working immediately
function cancelTransferCode() {
  if (!NET.active || !NET.gameStarted) return;
  if (NET.isHost) NET.xferCodes = NET.xferCodes.filter(c => c.idx !== NET.myPlayerIndex);
  else if (NET.hostConn && !NET.hostLost) NET.hostConn.send({ type: "XFER_CANCEL" });
}

// ---- guest: the host accepted me back (or I just switched device) ----
function applyRejoinAck(msg) {
  if (NET.isHost || !msg.snap) return;
  if (NET.joined && !NET.hostLost && G && NET.gameStarted) return;     // a duplicate answer from the same host
  NET.joined = true;
  NET.gameStarted = true;
  NET.myPlayerIndex = msg.yourIndex;
  NET.epoch = msg.epoch;
  NET.hostIdx = msg.hostIdx;
  NET.roomCode = msg.snap.roomCode || NET.roomCode;
  NET.seatHash = msg.snap.hashes || NET.seatHash;
  if (msg.token) NET.myToken = msg.token;
  if (NET.hostConn) { NET.hostConn.peer = msg.hostId; NET.hostConn.rtcConn = null; NET.hostConn.lastRx = performance.now(); }
  NET.hostLost = false;
  NET.pendingXfer = null;
  NET.lastRx = performance.now();
  NET.joinedAt = performance.now();
  stopRecovery();
  hideNetworkBanner();
  applyJoinSnapshot(msg.snap);
  saveSession();
  startHeartbeat();
  guestConnectRtc();
  if (NET.onJoinAck) { const fn = NET.onJoinAck; NET.onJoinAck = null; fn(); }
}

// ---- this page was asked to become the host (the old host handed over) ----
function applyHostHandover(msg) {
  if (NET.isHost || !msg.snap) return;
  NET.joined = true;
  NET.gameStarted = true;
  NET.myPlayerIndex = msg.yourIndex;
  NET.roomCode = msg.snap.roomCode || NET.roomCode;
  NET.seatHash = msg.snap.hashes || NET.seatHash;
  if (msg.token) NET.myToken = msg.token;
  NET.hostLost = false;
  NET.pendingXfer = null;
  stopRecovery();
  hideNetworkBanner();
  applyJoinSnapshot(msg.snap);
  if (NET.onJoinAck) { const fn = NET.onJoinAck; NET.onJoinAck = null; fn(); }
  becomeHost(msg.epoch);
}

// ---- host: the answer to another host probing us (two hosts alive) ----
function answerHostProbe(msg, hc) {
  if (!NET.isHost || NET.retired || !msg.tuple) return;
  const mine = hostTuple();
  const iLoseNow = iLose(mine, msg.tuple);
  hc.send({ type: "HOST_PROBE_ACK", tuple: mine, youLose: !iLoseNow });
  if (iLoseNow) stepDown();
}
// ------------------------------------------------------------------ 5. MESSAGE ROUTING
function handleNetData(msg, fromConn) {
  if (!msg || typeof msg !== "object") return;
  if (NET.retired) return;
  // proof of life (heartbeat): anything that arrives counts
  const nowT = performance.now();
  if (fromConn) fromConn.lastRx = nowT;
  if (!NET.isHost) NET.lastRx = nowT;

  // If Guest receives in-game events milliseconds before GAME_START arrives, buffer instead of dropping!
  if (!NET.isHost && !G && IN_GAME_TYPES.has(msg.type)) {
    NET.earlyQueue.push({ msg, fromConn });
    return;
  }

  if (msg._mid) {
    if (NET.seenMsgs.has(msg._mid)) return;
    NET.seenMsgs.add(msg._mid);
    if (NET.seenMsgs.size > SEEN_MSGS_MAX) {
      const first = NET.seenMsgs.values().next().value;
      NET.seenMsgs.delete(first);
    }
  }

  switch (msg.type) {
    case "JOIN_REQ": {
      if (!NET.isHost) return;
      if (NET.gameStarted) { hostRejoin(msg, fromConn); return; }          // game running: only the players who started it may come back
      initRows();
      if (fromConn.playerIndex != null) {
        fromConn.send({ type: "JOIN_ACK", yourIndex: fromConn.playerIndex, rows: S.rows, n: S.n, roomCode: NET.roomCode, token: fromConn.token });
        return;
      }
      if (S.n >= CONFIG.MAX_PLAYERS) {
        fromConn.send({ type: "JOIN_DENIED", reason: "Room is full or game already started." });
        return;
      }
      const pIdx = S.n++;
      fromConn.playerIndex = pIdx;
      fromConn.lastRx = nowT;
      fromConn.token = makeToken();                                       // this player's secret seat token (the host keeps only its hash)
      NET.seatHash[pIdx] = sha256hex(fromConn.token);
      if (!NET.connections.includes(fromConn)) {
        NET.connections.push(fromConn);
      }
      if (!S.rows[pIdx]) {
        S.rows[pIdx] = { name: `Player ${pIdx + 1}`, character: "", locked: false };
      } else {
        S.rows[pIdx].name = `Player ${pIdx + 1}`;
        S.rows[pIdx].character = "";
        S.rows[pIdx].locked = false;
      }
      fromConn.send({ type: "JOIN_ACK", yourIndex: pIdx, rows: S.rows, n: S.n, roomCode: NET.roomCode, token: fromConn.token });
      broadcastLobby();
      if (NET.onLobbyUpdate) NET.onLobbyUpdate();
      break;
    }
    case "JOIN_ACK": {
      NET.joined = true;
      NET.myPlayerIndex = msg.yourIndex;
      NET.roomCode = msg.roomCode;
      if (msg.token) NET.myToken = msg.token;
      if (Array.isArray(msg.rows)) S.rows = msg.rows;
      if (typeof msg.n === "number") S.n = msg.n;
      NET.joinedAt = nowT;
      startHeartbeat();
      hideNetworkBanner();
      if (NET.onJoinAck) {
        const fn = NET.onJoinAck;
        NET.onJoinAck = null;
        fn();
      }
      if (NET.onLobbyUpdate) NET.onLobbyUpdate();
      break;
    }
    case "JOIN_DENIED": {
      if (NET.onJoinDenied) {
        const fn = NET.onJoinDenied;
        NET.onJoinDenied = null;
        fn(msg.reason);
      }
      break;
    }
    case "LOBBY_STATE": {
      if (!NET.joined) { NET.joined = true; startHeartbeat(); }
      if (Array.isArray(msg.rows)) S.rows = msg.rows;
      if (typeof msg.n === "number") S.n = msg.n;
      if (typeof msg.smsg === "string") S.msg = msg.smsg;
      if (NET.onJoinAck) {
        const fn = NET.onJoinAck;
        NET.onJoinAck = null;
        fn();
      }
      if (NET.onLobbyUpdate) NET.onLobbyUpdate();
      break;
    }
    case "LOBBY_ROW_UPDATE": {
      if (NET.isHost) {
        initRows();
        const idx = fromConn ? fromConn.playerIndex : null;       // a player can only change their OWN row
        if (idx != null && S.rows[idx]) {
          if (msg.name !== undefined && msg.name !== null) S.rows[idx].name = msg.name;
          // the host decides who gets a character: if another player already has it (two picked at nearly the same moment), the request is ignored
          // and the broadcast below puts the sender's line back to what the host has
          if (msg.character !== undefined && msg.character !== null && !charTakenByOther(msg.character, idx)) S.rows[idx].character = msg.character;
          broadcastLobby();
          if (NET.onLobbyUpdate) NET.onLobbyUpdate();
        }
      }
      break;
    }
    case "BYE": {
      if (NET.isHost && fromConn && fromConn.playerIndex != null) seatLost(fromConn, "bye");
      break;
    }
    case "HOST_LEFT": {
      if (typeof msg.room === "string" && msg.room !== NET.roomCode) break;   // a late message from an OLD room (e.g. before Play again moved everybody): not about this lobby, ignore it
      if (!NET.isHost && !NET.following) onHostLost("left");   // (not when the host is only moving everybody to a new lobby)
      break;
    }
    case "PING": {
      if (!NET.isHost) return;
      // a connection that is not a seat (any more) learns that it is not known: it will try to rejoin
      fromConn.send({ type: "PONG", unknown: fromConn.playerIndex == null && NET.gameStarted ? true : undefined });
      break;
    }
    case "PONG": {
      if (!NET.isHost && msg.unknown && G && NET.gameStarted && nowT - NET.joinedAt > UNKNOWN_SEAT_GRACE_MS) onHostLost("unknown seat");
      break;
    }
    case "REJOIN_ACK": {
      applyRejoinAck(msg);
      break;
    }
    case "HOST_HANDOVER": {
      applyHostHandover(msg);
      break;
    }
    case "HOST_MOVED": {
      if (NET.isHost || !G || !msg.hostId) break;
      NET.epoch = msg.epoch;
      NET.hostIdx = msg.hostIdx;
      NET.noElectUntil = nowT + NO_ELECT_MS;
      if (NET.hostConn) { NET.hostConn.peer = msg.hostId; NET.hostConn.rtcConn = null; }
      NET.hostLost = true;
      NET.hostLostAt = nowT;
      showNetworkBanner("Host switched device. Reconnecting...");
      startRecovery();
      break;
    }
    case "SEAT_TAKEN": {
      if (NET.isHost && msg.reason !== "other" && msg.reason !== "switched") break;
      retireSelf(msg.reason === "switched" ? "This game continues on your other device." : "This game was opened in another tab or device.", msg.reason === "switched" ? { clear: true } : { button: "Play here instead" });
      if (msg.reason === "switched") clearSession();
      break;
    }
    case "SEAT_HASHES": {
      if (!NET.isHost && Array.isArray(msg.hashes)) NET.seatHash = msg.hashes;
      break;
    }
    case "XFER_REQ": {
      if (!NET.isHost || !NET.gameStarted || fromConn.playerIndex == null) break;
      const c = makeTransferCode(fromConn.playerIndex);
      fromConn.send({ type: "XFER_CODE", secret: c.secret, ms: c.ms });
      break;
    }
    case "XFER_CANCEL": {
      if (NET.isHost && fromConn && fromConn.playerIndex != null) NET.xferCodes = NET.xferCodes.filter(c => c.idx !== fromConn.playerIndex);
      break;
    }
    case "XFER_CODE": {
      if (NET.xferWaiter) {
        const w = NET.xferWaiter; NET.xferWaiter = null; clearTimeout(w.t);
        w.resolve({ room: NET.roomCode, secret: msg.secret, ms: msg.ms });
      }
      break;
    }
    case "HOST_PROBE": {
      if (NET.isHost) answerHostProbe(msg, fromConn);
      break;
    }
    case "HOST_PROBE_ACK": {
      if (NET.isHost && msg.youLose) stepDown();
      break;
    }
    case "RECONNECT_WAIT": {
      if (!NET.isHost && G) showReconnectCountdown(msg.idx, msg.ms);
      break;
    }
    case "RECONNECT_WAIT_END": {
      if (!NET.isHost) hideReconnectCountdown();
      break;
    }
    case "PLAYER_BACK": {
      if (!NET.isHost && G && G.players[msg.index]) { G.players[msg.index].disconnected = false; render(); }
      break;
    }
    case "GAME_START": {
      hideNetworkBanner();
      applyRemoteGameStart(msg);
      break;
    }
    case "ACTION_REQ": {
      if (!NET.isHost || !fromConn) return;
      const pIdx = fromConn.playerIndex;                  // who the CONNECTION belongs to (never what the message claims)
      if (pIdx == null || NET.pendingActorIdx !== pIdx) return;   // only the seat the game is waiting for may act
      handleRemoteAction(msg.action, pIdx);
      break;
    }
    case "ACTION_SYNC": {
      // Never re-apply our own echoed action!
      if (!NET.isHost && msg.playerIndex !== NET.myPlayerIndex) {
        handleRemoteAction(msg.action, msg.playerIndex);
      }
      break;
    }
    case "DRAG_MOVE": {
      if (NET.isHost) {
        if (!fromConn || fromConn.playerIndex == null) return;
        msg.playerIndex = fromConn.playerIndex;           // the host trusts the connection, not the message
      }
      if (msg.playerIndex !== NET.myPlayerIndex) {
        if (NET.isHost) {
          // Forward live drag to other guests
          forwardToOtherGuests(msg, msg.playerIndex);
        }
        applyRemoteDrag(msg);
      }
      break;
    }
    case "WAIT_ROLL": {
      if (!NET.isHost && G) {
        clearRemoteDragVisuals();
        G.cur = G.players[msg.playerIndex];
        if (msg.catNow !== undefined) G.catNow = msg.catNow;
        render();
        if (msg.playerIndex === NET.myPlayerIndex) {
          setPrompt(msg.prompt || `${G.cur ? G.cur.name : 'Player'}: grab the die and throw it, or press ROLL / Space.`);
        }
        rollDice(msg.n);
      }
      break;
    }
    case "WAIT_MOVE": {
      if (!NET.isHost && G) {
        clearRemoteDragVisuals();
        G.cur = G.players[msg.playerIndex];
        render();
        const isMyTurn = (msg.playerIndex === NET.myPlayerIndex);
        if (isMyTurn) {
          let pieces;
          if (msg.moveKind === "heads" && Array.isArray(msg.heads)) {
            pieces = makeHandles(msg.heads.map(o => ({ h: o.h, targets: o.targets, ghost: (x, y) => ghostSvg(o.h, x, y) })));
          } else {
            const el = $("pw" + msg.playerIndex);
            pieces = [{ key: "pawn", el, targets: msg.targets || [] }];
          }
          const button = msg.button ? { label: msg.button, value: 1 } : null;
          awaitMove({ pieces, text: msg.text, button });
        } else {
          setPrompt(`Waiting for ${G.cur ? G.cur.name : 'player'} to make their move...`);
        }
      }
      break;
    }
    case "WAIT_CHOOSE": {
      if (!NET.isHost && G) {
        clearRemoteDragVisuals();
        const actor = G.players[msg.playerIndex] || G.cur;
        render();
        const isMyTurn = (msg.playerIndex === NET.myPlayerIndex);
        if (isMyTurn) {
          choose(msg.msg, msg.opts, actor);
        } else {
          setPrompt(`${actor ? actor.name : 'Player'} is making a choice...`);
        }
      }
      break;
    }
    case "WAIT_ITEM": {
      if (!NET.isHost && G) {
        clearRemoteDragVisuals();
        G.cur = G.players[msg.playerIndex];
        render();
        const isMyTurn = (msg.playerIndex === NET.myPlayerIndex);
        if (isMyTurn) {
          awaitItemChoice(G.players[msg.playerIndex], msg.text, msg.label);
        } else {
          setPrompt(`Waiting for ${G.cur ? G.cur.name : 'player'} to choose items or roll...`);
        }
      }
      break;
    }
    case "WAIT_TARGET": {
      if (!NET.isHost && G) {
        clearRemoteDragVisuals();
        G.cur = G.players[msg.playerIndex];
        render();
        const isMyTurn = (msg.playerIndex === NET.myPlayerIndex);
        if (isMyTurn) {
          awaitTarget({ targets: msg.targets, text: msg.text, label: msg.label });
        } else {
          setPrompt(`Waiting for ${G.cur ? G.cur.name : 'player'} to choose target...`);
        }
      }
      break;
    }
    case "LOG_LINE": {
      if (!NET.isHost) {
        const l = $("log");
        if (l) { l.insertAdjacentHTML("beforeend", `<div>${msg.html}</div>`); l.scrollTop = l.scrollHeight; }
        const big = $("biglog");
        if (big) { big.insertAdjacentHTML("beforeend", `<div>${msg.html}</div>`); big.scrollTop = big.scrollHeight; }
      }
      break;
    }
    case "GAME_SFX": {                                               // the host says a game sound happened (drink, snake, a character reaction...): guests play the same one
      if (!NET.isHost && typeof msg.name === "string") voice(msg.name, +msg.delay || 0, !!msg.chain);
      break;
    }
    case "FLY_ITEM": {
      if (!NET.isHost) {
        flyItem(msg.itemType, msg.from, msg.to, msg.mode, true);
      }
      break;
    }
    case "STATE_SYNC": {
      applyStateSync(msg);
      break;
    }
    case "GAME_OVER": {
      if (!NET.isHost && G) {
        if (msg.winnerIndex != null && G.players[msg.winnerIndex]) {
          G.winner = G.players[msg.winnerIndex];
          voice("win");
        }
        render();
        showLocalGameOverPrompt();
      }
      break;
    }
    case "REACT": {                                                  // BOO / CHEER on the victory screen: everybody hears it, and the sounds may overlap
      if (typeof msg.name === "string" && isReactSound(msg.name)) sfx(msg.name);
      if (NET.isHost) forwardToOtherGuests(msg, fromConn ? fromConn.playerIndex : -1);
      break;
    }
    case "NEW_LOBBY": {                                              // the host opened a new lobby (new code): everybody follows
      if (!NET.isHost && typeof msg.code === "string") {
        if (msg.code === NET.roomCode || FOLLOWING_NOW) break;     // repeat of the announcement: already in that lobby, or already on the way (see endgame.js)
        NET.following = true; NET.nextLobby = msg.code; followToNewLobby(msg.code);
      }
      break;
    }
    case "LEAVE": {                                                  // a guest quit the game
      if (NET.isHost && fromConn && fromConn.playerIndex != null) abandonSeat(fromConn.playerIndex);
      break;
    }
    case "CHAT": {
      if (NET.isHost && fromConn && fromConn.playerIndex != null) msg.playerIndex = fromConn.playerIndex;   // the host knows who really sent it (a guest cannot chat "as" somebody else)
      appendChatMessage(msg.sender, msg.text, msg.color, false, msg.playerIndex);
      if (NET.isHost) {
        forwardToOtherGuests(msg, fromConn ? fromConn.playerIndex : -1);
      }
      break;
    }
    case "PLAYER_LEFT": {
      if (!NET.isHost && G && G.players[msg.index]) {
        G.players[msg.index].disconnected = true;
        if (msg.abandoned) { G.players[msg.index].abandoned = true; G.players[msg.index].pos = 0; }   // the player quit: panel and pawn go
        render();
      }
      break;
    }
  }
}

function forwardToOtherGuests(msg, excludePlayerIdx) {
  if (!NET.isHost) return;
  let needHttp = false;
  NET.connections.forEach(c => {
    if (!c.open || c.playerIndex === excludePlayerIdx) return;
    if (c.isRtcOpen()) {
      try { c.rtcConn.send(msg); } catch (e) {}
    } else if (NET.httpEnabled) {
      needHttp = true;
    } else if (!mqttSend(c.peer, msg, c.mqttIdx)) {
      wsSend(c.peer, msg);
    }
  });
  if (needHttp) enqueueHttpSend("*", msg);
}

// ------------------------------------------------------------------ 6. LIVE DRAG PREVIEWS & REMOTE ACTIONS
function sendDragPreview(payload) {
  if (!NET.active) return;
  const now = performance.now();
  if (payload.kind !== "end" && now - NET.lastDragSentAt < DRAG_SEND_MIN_MS) return;
  NET.lastDragSentAt = now;
  const msg = { type: "DRAG_MOVE", playerIndex: NET.myPlayerIndex, ...payload };
  if (NET.isHost) {
    forwardToOtherGuests(msg, NET.myPlayerIndex);
  } else if (NET.hostConn && NET.hostConn.open) {
    NET.hostConn.send(msg);
  }
}

function clearRemoteDragVisuals() {
  document.querySelectorAll(".pw.rdrag").forEach(el => el.classList.remove("rdrag"));
  if (!DRAG && !TGT) {
    if ($("gGhost")) $("gGhost").innerHTML = "";
    if (G && G.built) setHL([]);
  }
}

function applyRemoteDrag(msg) {
  if (!G || !G.built) return;
  if (msg.kind === "end") {
    clearRemoteDragVisuals();
    render();
    return;
  }
  if (msg.kind === "die") {
    const d = DICE.list[msg.i];
    if (d && DICE.waiting && !DICE.flying) {
      d.mode = "held";
      d.x = msg.x;
      d.y = msg.y;
      dieClamp(d);
    }
  } else if (msg.kind === "pawn") {
    const pw = $("pw" + msg.playerIndex);
    if (pw) {
      pw.classList.add("rdrag");
      pw.style.transform = `translate(${f1(msg.x)}px,${f1(msg.y)}px) scale(.95)`;
      if (Array.isArray(msg.targets)) setHL(msg.targets);
    }
  } else if (msg.kind === "head") {
    if ($("gGhost") && msg.h) {
      $("gGhost").innerHTML = ghostSvg(msg.h, msg.x, msg.y);
      if (Array.isArray(msg.targets)) setHL(msg.targets);
    }
  }
}

function handleRemoteAction(action, playerIdx) {
  if (NET.isHost) {
    forwardToOtherGuests({ _mid: makeMsgId(), type: "ACTION_SYNC", action, playerIndex: playerIdx }, playerIdx);
  }

  clearRemoteDragVisuals();
  if (NET.isHost) NET.waitMsg = null;                  // the prompt that was waiting has been answered

  if (action.type === "ROLL_LAUNCH") {
    launch(action.vx, action.vy, action.vals, action.startDice);
  } else if (action.type === "MOVE") {
    setPrompt("");
    if (NET.pendingMoveRes) {
      const res = NET.pendingMoveRes;
      NET.pendingMoveRes = null;
      NET.pendingActorIdx = null;
      res(action.result);
    }
  } else if (action.type === "CHOOSE") {
    setPrompt("");
    if (NET.pendingChoiceRes) {
      const res = NET.pendingChoiceRes;
      NET.pendingChoiceRes = null;
      NET.pendingActorIdx = null;
      res(action.val);
    }
  } else if (action.type === "ITEM_CHOICE") {
    setPrompt("");
    if (NET.pendingItemRes) {
      const res = NET.pendingItemRes;
      NET.pendingItemRes = null;
      NET.pendingActorIdx = null;
      res(action.val);
    }
  } else if (action.type === "TARGET") {
    setPrompt("");
    if (NET.pendingTargetRes) {
      const res = NET.pendingTargetRes;
      NET.pendingTargetRes = null;
      NET.pendingActorIdx = null;
      res(action.val);
    }
  }
}

// ------------------------------------------------------------------ 7. BROADCAST, LOBBY, CHAT, STATE SYNC
function broadcast(msg) {
  if (!NET.isHost || NET.retired) return;
  if (msg && typeof msg.type === "string" && msg.type.indexOf("WAIT_") === 0) NET.waitMsg = msg;   // replayed to a player who rejoins
  if (!NET.connections.length) return;
  if (msg && typeof msg === "object" && !msg._mid) {
    msg._mid = makeMsgId();
  }
  let needHttp = false;
  const mqttBrokers = new Set();
  NET.connections.forEach(conn => {
    if (!conn.open) return;
    if (conn.isRtcOpen()) {
      try { conn.rtcConn.send(msg); } catch (e) {}
    } else if (NET.httpEnabled) {
      needHttp = true;
    } else if (mqttIsReady()) {
      mqttBrokers.add(conn.mqttIdx != null ? conn.mqttIdx : 0);
    } else {
      wsSend(conn.peer, msg);
    }
  });
  if (needHttp) enqueueHttpSend("*", msg);
  mqttBrokers.forEach(bIdx => mqttSend("*", msg, bIdx));
}

function broadcastLobby() {
  if (NET.isHost) {
    broadcast({ type: "LOBBY_STATE", rows: S.rows, n: S.n, smsg: S.msg || "" });
  }
}

// charTakenByOther(id, idx): true if a player other than number idx already has character id.
function charTakenByOther(id, idx) {
  return S.rows.slice(0, S.n).some((r, i) => i !== idx && r && r.character === id);
}

function sendLobbyUpdate(name, character) {
  initRows();
  const idx = NET.myPlayerIndex;
  if (NET.isHost) {
    if (name !== undefined && name !== null) S.rows[0].name = name;
    if (character !== undefined && character !== null) S.rows[0].character = character;
    broadcastLobby();
    if (NET.onLobbyUpdate) NET.onLobbyUpdate();
  } else if (NET.hostConn && NET.hostConn.open) {
    const payload = { type: "LOBBY_ROW_UPDATE", index: idx };
    if (name !== undefined && name !== null) payload.name = name;
    if (character !== undefined && character !== null) payload.character = character;
    NET.hostConn.send(payload);
  }
}

function sendAction(action) {
  if (NET.isHost) {
    NET.waitMsg = null;
    broadcast({ type: "ACTION_SYNC", action, playerIndex: NET.myPlayerIndex });
  } else if (NET.hostConn && NET.hostConn.open) {
    NET.hostConn.send({ type: "ACTION_REQ", action, playerIndex: NET.myPlayerIndex });
  }
}

function sendChatMessage(text) {
  if (!text || !text.trim()) return;
  const pIdx = NET.myPlayerIndex;
  const sender = (G && G.players[pIdx] && G.players[pIdx].name) || (S.rows[pIdx] && S.rows[pIdx].name) || `Player ${pIdx + 1}`;
  const color = COLORS[pIdx % COLORS.length];
  const msg = { type: "CHAT", sender, text: text.trim(), color, playerIndex: pIdx };   // (playerIndex: whose pawn the speech bubble goes over)
  appendChatMessage(sender, text.trim(), color, true, pIdx);
  if (NET.isHost) {
    broadcast(msg);
  } else if (NET.hostConn && NET.hostConn.open) {
    NET.hostConn.send(msg);
  }
}

// appendChatMessage(sender, text, color, isLocal, playerIndex): add a line to the chat. With a playerIndex (a live message, not a replay of old history) a speech bubble pops up over that player's pawn too.
function appendChatMessage(sender, text, color, isLocal, playerIndex) {
  NET.chatHistory.push({ sender, text, color, time: new Date() });
  if (Number.isInteger(playerIndex)) showChatBubble(playerIndex, text);
  const chatView = $("chatView");
  if (chatView) {
    const d = document.createElement("div");
    d.className = "cmsg";
    d.innerHTML = `<span style="color:${color || '#fff3cf'}">${esc(sender)}:</span> ${esc(text)}`;
    chatView.appendChild(d);
    chatView.scrollTop = chatView.scrollHeight;
  }
  if (!isLocal && typeof TAB !== "undefined" && TAB !== "chat") {
    NET.unreadChat++;
    const btn = $("tb_chat");
    if (btn) btn.classList.add("unread");
    sfx("small");
  }
}

function showLocalGameOverPrompt() {
  if (!G || !G.winner) return;
  clearSession();            // the game is over: nothing to come back to
  stopHeartbeat();
  setPrompt("");             // (no plain message: the winner scene below says it all)
  showWinnerScene();         // the winner's character + "WINNER! name" + Play again (and BOO / CHEER for everybody who did not win); see prompts.js
}

function applyRemoteGameStart(msg) {
  if (typeof leaveTitle === "function") leaveTitle();   // the host started: remove the title/lobby screens
  G = msg.G;
  NET.gameStarted = true;
  NET.seatHash = G.hashes || [];
  NET.epoch = G.epoch || 0;
  NET.hostIdx = G.hostIdx || 0;
  NET.joinedAt = performance.now();
  delete G.hashes; delete G.epoch; delete G.hostIdx; delete G.roomCode;
  G.built = 0;
  G._stateSeq = 0;
  delete G.snkKey;
  delete G.numKey;
  delete G.itemKey;
  const rk = p => p.character === "charmer" ? -1 : p.character === "cat" ? 1 : 0;
  G.order = [...G.players].sort((a, b) => rk(a) - rk(b));
  const co = G.players.find(p => p.character === "cat");
  if (co) G.catOwner = co;

  $("setup").style.display = "none";
  $("game").style.display = "block";
  setPrompt("");
  const l = $("log"); if (l) { l.innerHTML = msg.logHtml || ""; l.scrollTop = 1e6; }
  const big = $("biglog"); if (big) { big.innerHTML = msg.logHtml || ""; big.scrollTop = 1e6; }
  render();
  saveSession();

  // Flush any in-game packets that arrived slightly ahead of GAME_START
  if (NET.earlyQueue.length) {
    const q = NET.earlyQueue.splice(0);
    q.forEach(item => handleNetData(item.msg, item.fromConn));
  }
}

function applyStateSync(msg) {
  if (!G) return;
  if (typeof msg.stateSeq === "number") {
    if (G._stateSeq && msg.stateSeq < G._stateSeq) return;
    G._stateSeq = msg.stateSeq;
  }

  clearRemoteDragVisuals();
  let movedRemotely = false;

  if (msg.players) {
    msg.players.forEach((mp, i) => {
      const gp = G.players[i];
      if (gp) {
        if (gp.pos !== mp.pos) {
          const quiet = G._quietMove && G._quietMove.idx === i && G._quietMove.pos === mp.pos;
          if (!quiet) movedRemotely = true;
          gp.pos = mp.pos;
        }
        gp.cb = mp.cb;
        gp.pen = mp.pen;
        gp.items = mp.items;
        gp.big = mp.big;
        if (mp.cd !== undefined) gp.cd = mp.cd;
        if (mp.disc !== undefined) gp.disconnected = !!mp.disc;
        if (mp.ab !== undefined) { gp.abandoned = !!mp.ab; if (gp.abandoned) gp.pos = 0; }   // a player who quit
      }
    });
  }
  G._quietMove = null;

  if (msg.cat && G.cat) {
    if (G.cat.pos !== msg.cat.pos) movedRemotely = true;
    G.cat = msg.cat;
  }
  if (msg.catSkin !== undefined && G.catSkin !== msg.catSkin) {
    G.catSkin = msg.catSkin;
    if ($("catimg") && ART.cats.length) $("catimg").setAttribute("href", catHref());
  }
  if (msg.S) G.S = msg.S;
  if (msg.L) G.L = msg.L;
  if (msg.items) G.items = msg.items;
  if (msg.catNow !== undefined) G.catNow = msg.catNow;
  if (typeof msg.turnNo === "number") G.turnNo = msg.turnNo;
  if (msg.curIndex != null) G.cur = G.players[msg.curIndex];
  if (msg.winnerIndex != null) G.winner = G.players[msg.winnerIndex];

  if (movedRemotely) sfx("tock", LAND_TOCK_DELAY_MS);
  render();
}


// ------------------------------------------------------------------ 8. AUTOMATIC REJOIN AFTER A RELOAD / CRASH
// autoRejoin(): called once at start-up. If this page holds a seat in a game that is still going, take it back (no clicks needed).
// sessionForAutoRejoin(): the saved seat this page should take back right now (null = start normally). An invite link to a different room wins over an old seat.
function sessionForAutoRejoin() {
  const sess = pickAutoSession();
  if (!sess) return null;
  let room = null;
  try { room = new URLSearchParams(location.search).get("room"); } catch (e) {}
  if (room && room.toUpperCase() !== sess.room) return null;
  return sess;
}
async function autoRejoin() {
  const sess = sessionForAutoRejoin();
  if (!sess) return false;
  NET.abandoned = false;
  // REJOIN_STATE / onRejoinTick / onRejoinEnd are how title.js learns about the attempt (it shows "Attempting to reconnect..." + countdown + Abandon Game)
  window.REJOIN_STATE = { active: true, msLeft: REJOIN_GIVEUP_MS };
  const say = (fn, arg) => { try { if (typeof window[fn] === "function") window[fn](arg); } catch (e) { /* the screen is optional */ } };
  try {
    NET.onLobbyUpdate = null;
    await initGuest(sess.room, "Player", {
      token: sess.token, epoch: sess.epoch || 0, rejoin: true, giveUpMs: REJOIN_GIVEUP_MS,
      onTick: ms => { window.REJOIN_STATE.msLeft = ms; say("onRejoinTick", ms); }
    });
    window.REJOIN_STATE.active = false;
    say("onRejoinEnd", "ok");
    return true;
  } catch (err) {
    const abandoned = !!NET.abandoned;
    clearSession();                                  // the game is gone (everybody left) or this seat is no longer ours
    teardownNet();
    window.REJOIN_STATE.active = false;
    say("onRejoinEnd", abandoned ? "abandoned" : "ended");
    return false;
  }
}
// abandonRejoin(): the player pressed "Abandon Game": stop trying, forget the saved seat, and let them start something new
function abandonRejoin() {
  NET.abandoned = true;
  if (NET.onJoinDenied) NET.onJoinDenied("Abandoned");   // makes the attempt in autoRejoin() end at once
  else { clearSession(); teardownNet(); }
}
// teardownNet(): drop every connection and timer (no screen changes)
function teardownNet() {
  stopHeartbeat(); stopRecovery();
  try { stopServerRelay(); } catch (e) {}
  try { stopCloudRelay(); } catch (e) {}
  if (NET.peer) { try { NET.peer.destroy(); } catch (e) {} NET.peer = null; }
  NET.active = false; NET.isHost = false; NET.joined = false; NET.gameStarted = false; NET.hostLost = false;
  NET.connections = []; NET.peerMap = {}; NET.hostConn = null; NET.myToken = null; NET.seatHash = [];
}
