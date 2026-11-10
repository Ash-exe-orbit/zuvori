const SUPABASE_URL = "";
const SUPABASE_KEY = "";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";
const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, "0");

function formatTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
function formatPace(s) {
  return s ? `${Math.floor(s / 60)}:${pad(s % 60)} /km` : "--:-- /km";
}

async function init() {
  renderProgress([]); // show the empty week instantly, then fill it in below

  const { data } = await sb.auth.getSession();
  if (!data.session) { location.href = "../login.html"; return; }
  const user = data.session.user;

  // Ask for the profile and the runs at the same time
  const [profileRes, runsRes] = await Promise.all([
    sb.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    sb.from("runs").select("*").order("created_at", { ascending: false }).limit(50),
  ]);

  const profile = profileRes.data;
  if (profile && profile.display_name) {
    $("display-name").value = profile.display_name;
    $("greeting").textContent = profile.display_name + "’s runs";
  }

  if (runsRes.error) { console.log("Load error:", runsRes.error); return; }
  renderRuns(runsRes.data);
  renderProgress(runsRes.data);
}

function renderRuns(runs) {
  const list = $("history");
  list.innerHTML = "";
  $("empty").hidden = runs.length > 0;

  let totalM = 0;
  runs.forEach((r) => {
    totalM += r.distance_m;
    const li = document.createElement("li");
    const date = new Date(r.created_at).toLocaleDateString(undefined,
      { weekday: "short", day: "numeric", month: "short" });

    const top = document.createElement("div");
    top.className = "hist-top";
    const left = document.createElement("strong");
    left.textContent = `${r.activity} · ${(r.distance_m / 1000).toFixed(2)} km`;
    const right = document.createElement("span");
    right.textContent = date;
    top.append(left, right);

    const sub = document.createElement("div");
    sub.className = "hist-sub";
    sub.textContent = `${formatTime(r.duration_s)} · ${formatPace(r.avg_pace_s)}`;

    li.append(top, sub);
    list.append(li);
  });

  $("total-sessions").textContent = runs.length;
  $("total-km").textContent = (totalM / 1000).toFixed(1);
}

function dayKey(d) { return d.toLocaleDateString("en-CA"); } // YYYY-MM-DD, local time
function dayNum(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000; // whole days since 1970
}

function renderProgress(runs) {
  // Days you moved (50 m or more), newest first
  const days = [...new Set(
    runs.filter((r) => r.distance_m >= 50).map((r) => dayKey(new Date(r.created_at)))
  )].map(dayNum).sort((a, b) => b - a);

  const today = dayNum(dayKey(new Date()));

  // Last 7 days as dots
  const week = $("week");
  week.innerHTML = "";
  let movedThisWeek = 0;
  for (let i = 6; i >= 0; i--) {
    const n = today - i;
    const moved = days.includes(n);
    if (moved) movedThisWeek++;
    const label = new Date(n * 86400000)
      .toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" });
    const box = document.createElement("div");
    box.className = "day";
    const dot = document.createElement("div");
    dot.className = "dot" + (moved ? " on" : "");
    const txt = document.createElement("span");
    txt.textContent = label;
    box.append(dot, txt);
    week.append(box);
  }

  // Streak: each active day within 3 days of the next counts
  let streak = 0;
  if (days.length && today - days[0] <= 3) {
    streak = 1;
    for (let i = 1; i < days.length; i++) {
      if (days[i - 1] - days[i] <= 3) streak++; else break;
    }
  }
  let msg;
  if (streak) {
    msg = `${streak} active day${streak === 1 ? "" : "s"} in your streak · ${movedThisWeek} this week`;
  } else if (days.length) {
    msg = "Welcome back. Every comeback counts. Your next move starts a new streak.";
  } else {
    msg = "Start your streak with your next move.";
  }
  $("streak").textContent = msg;
}

$("name-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("display-name").value.trim();
  const { data } = await sb.auth.getSession();
  const { error } = await sb.from("profiles")
    .upsert({ id: data.session.user.id, display_name: name });
  $("name-note").textContent = error ? "Couldn't save your name." : "Name saved.";
  if (!error && name) $("greeting").textContent = name + "’s runs";
});

init();