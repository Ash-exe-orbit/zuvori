
document.getElementById("logout-btn").addEventListener("click", async () => {const sb = window.supabase.createClient();
  await sb.auth.signOut();
  location.href = "../login.html";
});

// ---------- Theme (shared with the landing page) ----------
document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
document.getElementById("theme-toggle").addEventListener("click", function () {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  localStorage.setItem("theme", next);
});

// ---------- Settings ----------
const MAX_ACCURACY_M = 25;       // ignore readings less accurate than 25 m
const MIN_MOVE_M = 5;            // ignore tiny movements (jitter while standing still)
const MAX_SPEED_MS = 12;         // ignore impossible jumps (over 12 m/s)
const MIN_PACE_DISTANCE_M = 30;  // show pace after 30 m...
const MIN_PACE_TIME_S = 20; //... and 20 seconds
const MAX_PACE_SEC = { walk: 1800, Run: 900}; //slower than this shows --:--
const SIGNAL_WAIT_MS = 15000;    // after 15 s with no good reading, tell the user
const DEBUG = location.search.includes("debug"); // add ?debug to the address

const $ = (id) => document.getElementById(id);

// ---------- Session state ----------
const state = {
  activity: "Walk",
  status: "idle",        // idle | active | paused | finished
  watchId: null,
  timerId: null,
  accumulatedMs: 0,
  resumedAt: 0,
  distanceM: 0,
  lastPoint: null,
  lastElapsedMs: 0,
  splits: [],
  accepted: 0,
  rejected: 0,
  rejectStreak: 0,
  goodReadings: 0,
  lastGoodAt: 0,
  signalSince: 0,
  blocked: false,
  wakeLock: null,
  lastSummary: null,
};

// ---------- Helpers ----------
const pad = (n) => String(n).padStart(2, "0");

function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatPace(secPerKm) {
  if (!isFinite(secPerKm) || secPerKm > 3600) return "--:--";
  const total = Math.round(secPerKm);
  return `${Math.floor(total / 60)}:${pad(total % 60)}`;
}

// Haversine: distance in metres between two GPS points
function haversine(a, b) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function getElapsedMs() {
  return state.accumulatedMs + (state.status === "active" ? Date.now() - state.resumedAt : 0);
}

function showScreen(name) {
  $("screen-start").hidden = name !== "start";
  $("screen-live").hidden = name !== "live";
  $("screen-summary").hidden = name !== "summary";
  document.body.classList.toggle("in-session", name === "live");
}

function setGps(text, kind) {
  const el = $("gps-status");
  el.textContent = text;
  el.className = "gps " + kind;
  el.style.visibility = (DEBUG || kind === "bad") ? "visible" : "hidden";
}

// ---------- Display ----------
function avgPaceSec() {
  const sec = getElapsedMs() / 1000;
  if (state.distanceM < MIN_PACE_DISTANCE_M || sec < MIN_PACE_TIME_S) return NaN;
  const pace = sec / (state.distanceM / 1000);
  return pace > MAX_PACE_SEC[state.activity] ? NaN : pace;
}

function updateDisplay() {
  $("time").textContent = formatTime(getElapsedMs());
  $("distance").textContent = (state.distanceM / 1000).toFixed(2);
  $("pace").textContent = formatPace(avgPaceSec());
  // Progress ring: how far through the current kilometre you are
  const fraction = (state.distanceM % 1000) / 1000;
  $("ring-fg").style.strokeDashoffset = 326.7 * (1 - fraction);
}

function renderSplits() {
  $("splits").innerHTML = state.splits
    .map((s, i) => `<li><span>Km ${i + 1}</span><span>${formatTime(s.durationMs)}</span></li>`)
    .join("");
  $("no-splits").hidden = state.splits.length > 0;
}

// ---------- GPS ----------
function startWatching() {
  state.watchId = navigator.geolocation.watchPosition(onPosition, onGpsError, {
    enableHighAccuracy: true,
    maximumAge: 0,
    timeout: 20000,
  });
}

function stopWatching() {
  if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  state.watchId = null;
}

function resetSignalTimer() {
  state.signalSince = Date.now();
  state.lastGoodAt = 0;
}

// Runs 4 times a second: decides which friendly GPS message to show
function checkSignal() {
  if (DEBUG || state.blocked || state.status !== "active") return;
  const quietMs = Date.now() - Math.max(state.lastGoodAt, state.signalSince);
  if (quietMs < SIGNAL_WAIT_MS) {
    if (!state.lastGoodAt) setGps("Finding your location…", "weak");
  } else {
    setGps("Still searching for GPS. Step outside or turn on precise location.", "weak");
  }
}

function reject(reason, accuracy) {
  state.rejected++;
  state.reasons = state.reasons || {};
  state.reasons[reason] = (state.reasons[reason] || 0) + 1;
  console.log("GPS reading ignored:", reason, accuracy);
  if (DEBUG) setGps(`Ignored: ${reason} (±${Math.round(accuracy || 0)} m)`, "weak");
  // Weak readings never reset our reference point. Only a run of impossible "jumps" does.
  if (reason === "jump") {
    state.rejectStreak++;
    if (state.rejectStreak >= 5) { state.lastPoint = null; state.rejectStreak = 0; }
  }
}

function onPosition(pos) {
  if (state.status !== "active") return; // late callbacks can't change a paused/finished session

  const { latitude, longitude, accuracy } = pos.coords;
  const point = { lat: latitude, lon: longitude, t: pos.timestamp };

  if (accuracy > MAX_ACCURACY_M) return reject("weak signal", accuracy);

  state.lastGoodAt = Date.now();
  state.goodReadings++;
  setGps(DEBUG ? `GPS ready (±${Math.round(accuracy)} m)` : "GPS ready", "good");

  if (!state.lastPoint) {
    state.lastPoint = point;
    state.lastElapsedMs = getElapsedMs();
    return;
  }

  const d = haversine(state.lastPoint, point);
  const seconds = (point.t - state.lastPoint.t) / 1000;
  if (seconds <= 0) return reject("bad timestamp", accuracy);
 if (d < Math.max(2, accuracy * 0.5)) return; // standing still, or just noise
  if (d / seconds > MAX_SPEED_MS) return reject("jump", accuracy);

  state.rejectStreak = 0;
  state.accepted++;
  const prevDist = state.distanceM;
  state.distanceM += d;
  const nowElapsed = getElapsedMs();

  // Record a split each time we pass a full kilometre
  while (state.distanceM >= (state.splits.length + 1) * 1000) {
    const target = (state.splits.length + 1) * 1000;
    const fraction = (target - prevDist) / d;
    const crossedAt = state.lastElapsedMs + fraction * (nowElapsed - state.lastElapsedMs);
    const prevTotal = state.splits.length ? state.splits[state.splits.length - 1].atMs : 0;
    state.splits.push({ atMs: crossedAt, durationMs: crossedAt - prevTotal });
    renderSplits();
  }

  state.lastPoint = point;
  state.lastElapsedMs = nowElapsed;
}

function onGpsError(err) {
  console.log("GPS error:", err.code, err.message);
  if (err.code === 1) {
    state.blocked = true;
    setGps("Location is blocked. Allow location for this site in your browser settings.", "bad");
  }
  // Other errors: checkSignal() shows the friendly "still searching" message
}

// ---------- Keep the screen awake ----------
async function requestWakeLock() {
  try {
    if ("wakeLock" in navigator) state.wakeLock = await navigator.wakeLock.request("screen");
  } catch (e) { console.log("Wake lock unavailable:", e); }
}
function releaseWakeLock() {
  if (state.wakeLock) state.wakeLock.release();
  state.wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.status === "active") requestWakeLock();
});

// ---------- Session controls ----------
function startSession() {
  if (!("geolocation" in navigator)) {
    $("start-note").textContent = "This browser doesn't support GPS.";
    return;
  }
  if (!window.isSecureContext) {
    $("start-note").textContent = "GPS needs a secure (https) page. Open the online version of the site.";
    return;
  }
  Object.assign(state, {
    status: "active", accumulatedMs: 0, resumedAt: Date.now(), distanceM: 0,
    lastPoint: null, lastElapsedMs: 0, splits: [], accepted: 0, rejected: 0,
    rejectStreak: 0, goodReadings: 0, blocked: false,
  });
  resetSignalTimer();
  renderSplits();
  $("pause-btn").textContent = "Pause";
  setGps("Finding your location…", "weak");
  showScreen("live");
  startWatching();
  state.timerId = setInterval(() => { updateDisplay(); checkSignal(); }, 250);
  requestWakeLock();
  updateDisplay();
}

function togglePause() {
  if (state.status === "active") {
    state.accumulatedMs += Date.now() - state.resumedAt;
    state.status = "paused";
    stopWatching();
    state.lastPoint = null; // resuming can't create a false distance jump
    $("pause-btn").textContent = "Resume";
    setGps("Paused", "weak");
  } else if (state.status === "paused") {
    state.status = "active";
    state.resumedAt = Date.now();
    resetSignalTimer();
    $("pause-btn").textContent = "Pause";
    setGps("Finding your location…", "weak");
    startWatching();
  }
}

function finishSession() {
  if (state.status === "active") state.accumulatedMs += Date.now() - state.resumedAt;
  state.status = "finished";
  stopWatching();
  clearInterval(state.timerId);
  releaseWakeLock();
  showSummary();
}

function showSummary() {
  const totalMs = state.accumulatedMs;
  const km = (state.distanceM / 1000).toFixed(2);
  const pace = formatPace(avgPaceSec());
  const splitRows = state.splits
    .map((s, i) => `<div class="row"><span>Km ${i + 1}</span><strong>${formatTime(s.durationMs)}</strong></div>`)
    .join("") || `<p class="note">No full kilometre completed.</p>`;

  let warning = "";
  if (state.goodReadings === 0 && totalMs > 30000) {
    warning = "We couldn't get a strong GPS signal, so no distance was recorded. Turn on precise location and try outdoors with a clear view of the sky.";
  } else if (state.distanceM < 50 && totalMs > 60000) {
    warning = "GPS recorded ve  ry little distance, so this result may be wrong. Try again outdoors with a clear view of the sky.";
  }

  $("summary-body").innerHTML = `
    ${warning ? `<p class="warning">${warning}</p>` : ""}
    <div class="row"><span>Activity</span><strong>${state.activity}</strong></div>
    <div class="row"><span>Time</span><strong>${formatTime(totalMs)}</strong></div>
    <div class="row"><span>Distance</span><strong>${km} km</strong></div>
    <div class="row"><span>Average pace</span><strong>${pace} /km</strong></div>
    <h2>Splits</h2>
    ${splitRows}`;
  console.log(`GPS check: ${state.accepted} readings used, ${state.rejected} ignored`);

  state.lastSummary = { activity: state.activity, time: formatTime(totalMs), km, pace };
  drawShareCard();
  saveRun (totalMs);
  showScreen("summary");
}

// ---------- Buttons ----------
document.querySelectorAll(".toggle-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".toggle-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    state.activity = btn.dataset.activity;
  });
});
$("start-btn").addEventListener("click", startSession);
$("pause-btn").addEventListener("click", togglePause);

// Our own "Finish?" popup (replaces the browser's confirm box)
$("finish-btn").addEventListener("click", () => { $("confirm").hidden = false; });
$("confirm-no").addEventListener("click", () => { $("confirm").hidden = true; });
$("confirm-yes").addEventListener("click", () => { $("confirm").hidden = true; finishSession(); });

$("again-btn").addEventListener("click", () => {
  state.status = "idle";
  sharePhoto = null;
  $("photo-input").value = "";
  $("camera-input").value = "";
  showScreen("start");
});

// ---------- Share card ----------
let sharePhoto = null;

async function drawShareCard() {
  const s = state.lastSummary;
  if (!s) return;
  await document.fonts.load("800 100px Inter");

  const c = $("share-canvas");
  const ctx = c.getContext("2d");
  const W = c.width;
  const photoH = 800;

  ctx.fillStyle = "#0B0B0F";
  ctx.fillRect(0, 0, W, c.height);

  if (sharePhoto) {
    const scale = Math.max(W / sharePhoto.width, photoH / sharePhoto.height);
    const w = sharePhoto.width * scale;
    const h = sharePhoto.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, photoH);
    ctx.clip();
    ctx.drawImage(sharePhoto, (W - w) / 2, (photoH - h) / 2, w, h);
    ctx.restore();
  } else {
    const g = ctx.createLinearGradient(0, 0, W, photoH);
    g.addColorStop(0, "#C4172F");
    g.addColorStop(1, "#8E0E22");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, photoH);
  }

  const top = ctx.createLinearGradient(0, 0, 0, 220);
  top.addColorStop(0, "rgba(0,0,0,.55)");
  top.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, W, 220);

  const fade = ctx.createLinearGradient(0, photoH - 300, 0, photoH);
  fade.addColorStop(0, "rgba(11,11,15,0)");
  fade.addColorStop(1, "#0B0B0F");
  ctx.fillStyle = fade;
  ctx.fillRect(0, photoH - 300, W, 300);


  // The character, standing on the right side of the card
  if (avatarImg) ctx.drawImage(avatarImg, 750, 330, 300, 500);
  ctx.font = "800 72px Inter, sans-serif";
  ctx.fillStyle = "#F5F3F1";
  ctx.fillText("Zuvori", 60, 120);
  const logoW = ctx.measureText("Zuvori").width;
  ctx.fillStyle = "#F02E4A";
  ctx.fillText(".", 60 + logoW, 120);

  ctx.font = "700 40px Inter, sans-serif";
  ctx.fillStyle = "#F02E4A";
  ctx.fillText(s.activity.toUpperCase(), 60, 800);

  ctx.font = "800 240px Inter, sans-serif";
  ctx.fillStyle = "#F5F3F1";
  ctx.fillText(s.km, 60, 1020);
  const kmW = ctx.measureText(s.km).width;
  ctx.font = "700 60px Inter, sans-serif";
  ctx.fillText("km", 60 + kmW + 20, 1020);

  ctx.font = "600 30px Inter, sans-serif";
  ctx.fillStyle = "rgba(245,243,241,.6)";
  ctx.fillText("TIME", 60, 1120);
  ctx.fillText("AVG PACE", 560, 1120);
  ctx.font = "800 72px Inter, sans-serif";
  ctx.fillStyle = "#F5F3F1";
  ctx.fillText(s.time, 60, 1200);
  ctx.fillText(s.pace + " /km", 560, 1200);

  ctx.font = "600 32px Inter, sans-serif";
  ctx.fillStyle = "rgba(245,243,241,.5)";
  ctx.fillText("Every pace belongs.", 60, 1295);
}

function loadPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => { sharePhoto = img; drawShareCard(); };
  img.src = URL.createObjectURL(file);
}
$("photo-input").addEventListener("change", loadPhoto);
$("camera-input").addEventListener("change", loadPhoto);

$("share-btn").addEventListener("click", () => {
  $("share-canvas").toBlob(async (blob) => {
    const file = new File([blob], "zuvori-run.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My Zuvori run" }); } catch (e) {}
    } else {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "zuvori-run.png";
      a.click();
    }
  }, "image/png");
});
// ---------- Save the run to the user's account ----------
async function saveRun(totalMs) {
  const note = $("save-note");
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    note.innerHTML = 'Log in to save your runs. <a href="../login.html">Log in</a>';
    return;
  }
 if (totalMs < 10000 || state.distanceM < 20) { note.textContent = ""; return; } // too short, or GPS recorded nothing

  note.textContent = "Saving…";
  const pace = avgPaceSec();
  const { error } = await sb.from("runs").insert({
    activity: state.activity,
    duration_s: Math.round(totalMs / 1000),
    distance_m: Math.round(state.distanceM),
    avg_pace_s: isFinite(pace) ? Math.round(pace) : null,
    splits: state.splits.map((s) => Math.round(s.durationMs / 1000)),
  });
  if (error) console.log("Save error:", error);
  note.textContent = error ? "Couldn't save this run." : "Saved to your account.";
}

// Quietly start finding satellites while the person is still on the start screen
let warmId = null;
function warmUp() {
  if (warmId !== null || !("geolocation" in navigator) || !window.isSecureContext) return;
  warmId = navigator.geolocation.watchPosition(() => {}, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  setTimeout(stopWarmUp, 120000); // stop after 2 minutes to save battery
}
function stopWarmUp() {
  if (warmId !== null) { navigator.geolocation.clearWatch(warmId); warmId = null; }
}
// Only if location is already allowed, so we never ask unprompted
if (navigator.permissions) {
  navigator.permissions.query({ name: "geolocation" }).then((r) => { if (r.state === "granted") warmUp(); }).catch(() => {});
}
document.querySelectorAll(".toggle-btn").forEach((b) => b.addEventListener("click", warmUp));

// ---------- Share card character ----------
let avatarImg = null;

// Turn a character (a set of choices) into a picture the canvas can draw
function avatarToImage(cfg) {
  const svg = ZuvoriAvatar.build(cfg)
    .replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')
    .replace('width="100%"', 'width="480" height="800"')
    .replace(/<rect width="240" height="400"[^>]*\/>/, ""); // no backdrop box
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("the picture failed to build"));
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

async function loadAvatar() {
  console.log("AVATAR: starting");
  try {
    if (!window.ZuvoriAvatar) { console.log("AVATAR: avatar.js did not load"); return; }
    const { data } = await sb.auth.getSession();
    if (!data.session) { console.log("AVATAR: not logged in"); return; }

    const { data: p, error } = await sb.from("profiles").select("avatar")
      .eq("id", data.session.user.id).maybeSingle();
    if (error) { console.log("AVATAR: database error", error); return; }
    if (!p || !p.avatar) { console.log("AVATAR: no saved character on this account"); return; }

    avatarImg = await avatarToImage(Object.assign({}, ZuvoriAvatar.DEFAULT, p.avatar));
    console.log("AVATAR: loaded");
    if (state.lastSummary) drawShareCard(); // redraw if the card is already showing
  } catch (e) { console.log("AVATAR: error", e); }
}

loadAvatar();
