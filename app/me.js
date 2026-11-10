document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";

const A = ZuvoriAvatar;
const config = Object.assign({}, A.DEFAULT);
let activeTab = 0;

// The whole controls screen is described here: tabs, each with groups of options
const TABS = [
  { name: "Looks", groups: [{ label: "Starting looks", key: "preset", type: "chip", options: A.PRESETS.map((p) => p.name) }] },
  { name: "Body", groups: [
    { label: "Body type", key: "body", type: "chip", options: A.BODY.map((b) => b.n) },
    { label: "Skin tone", key: "skin", type: "swatch", options: A.SK.map((s) => s[0]) },
    { label: "Skin features", key: "feat", type: "chip", options: A.FEAT },
  ] },
  { name: "Face", groups: [
    { label: "Jaw", key: "jaw", type: "chip", options: A.JAWS },
    { label: "Lips", key: "lips", type: "chip", options: A.LIPS },
    { label: "Eye size", key: "eyes", type: "chip", options: ["Small", "Medium", "Large"] },
    { label: "Eye spacing", key: "gap", type: "chip", options: ["Close", "Average", "Wide"] },
    { label: "Expression", key: "face", type: "chip", options: A.FACES },
    { label: "Facial hair", key: "beard", type: "chip", options: A.BEARD },
    { label: "Details", toggles: [["lash", "Lashes"]] },
  ] },
  { name: "Hair", groups: [
    { label: "Style", key: "hair", type: "chip", options: A.HAIRS },
    { label: "Colour", key: "hc", type: "swatch", options: A.HC },
  ] },
  { name: "Outfit", groups: [
    { label: "Top", key: "top", type: "chip", options: A.TOPS },
    { label: "Top colour", key: "tc", type: "swatch", options: A.PAL },
    { label: "Bottom", key: "bot", type: "chip", options: A.BOTS },
    { label: "Bottom colour", key: "bc", type: "swatch", options: A.PAL },
  ] },
  { name: "Extras", groups: [
    { label: "Accessories", toggles: [["glasses", "Glasses"], ["hoops", "Hoops"], ["pods", "Earbuds"], ["wrap", "Headwrap"], ["cap", "Cap"], ["watch", "Watch"]] },
    { label: "Backdrop", key: "bg", type: "swatch", options: A.BG },
  ] },
];

// Turn one group into buttons
function groupHTML(g) {
  let inner;
  if (g.toggles) {
    inner = g.toggles.map((t) => '<button type="button" class="cc-chip" data-toggle="' + t[0] + '">' + t[1] + "</button>").join("");
  } else {
    inner = g.options.map((o, i) => g.type === "swatch"
      ? '<button type="button" class="cc-sw" data-key="' + g.key + '" data-i="' + i + '" aria-label="' + g.label + " " + (i + 1) + '" style="background:' + o + '"></button>'
      : '<button type="button" class="cc-chip" data-key="' + g.key + '" data-i="' + i + '">' + o + "</button>"
    ).join("");
  }
  return '<div class="cc-row"><div class="cc-lab">' + g.label + '</div><div class="cc-opts">' + inner + "</div></div>";
}

// Build the tab buttons and the panes of controls (once)
document.getElementById("tabs").innerHTML = TABS
  .map((t, i) => '<button type="button" class="cc-tab" data-tab="' + i + '">' + t.name + "</button>").join("");
document.getElementById("controls").innerHTML = TABS
  .map((t) => '<div class="cc-pane">' + t.groups.map(groupHTML).join("") + "</div>").join("");

// Redraw the character and update which buttons look "selected"
function refresh() {
  document.getElementById("avatar").innerHTML = A.build(config);
  document.querySelectorAll("#controls button").forEach((b) => {
    let on = false;
    if (b.dataset.toggle) on = !!config[b.dataset.toggle];
    else if (b.dataset.key && b.dataset.key !== "preset") on = config[b.dataset.key] === +b.dataset.i;
    b.setAttribute("aria-pressed", on ? "true" : "false");
  });
  document.querySelectorAll(".cc-pane").forEach((p, i) => { p.hidden = i !== activeTab; });
  document.querySelectorAll(".cc-tab").forEach((t, i) => t.setAttribute("aria-pressed", i === activeTab ? "true" : "false"));
}

// One click listener for all the controls
document.getElementById("controls").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.toggle) config[b.dataset.toggle] = !config[b.dataset.toggle];
  else if (b.dataset.key === "preset") Object.assign(config, A.DEFAULT, A.PRESETS[+b.dataset.i].set);
  else if (b.dataset.key) config[b.dataset.key] = +b.dataset.i;
  else return;
  refresh();
});

document.getElementById("tabs").addEventListener("click", (e) => {
  const t = e.target.closest("[data-tab]");
  if (!t) return;
  activeTab = +t.dataset.tab;
  refresh();
});

document.getElementById("rnd").addEventListener("click", () => {
  const R = (n) => Math.floor(Math.random() * n);
  Object.assign(config, {
    body: R(A.BODY.length), skin: R(A.SK.length), feat: R(A.FEAT.length), jaw: R(A.JAWS.length),
    lips: R(A.LIPS.length), face: R(A.FACES.length), beard: R(A.BEARD.length), hair: R(A.HAIRS.length),
    hc: R(A.HC.length), top: R(A.TOPS.length), tc: R(A.PAL.length), bot: R(A.BOTS.length),
    bc: R(A.PAL.length), bg: R(A.BG.length),
    lash: Math.random() < 0.4, glasses: Math.random() < 0.3, hoops: Math.random() < 0.4,
    pods: Math.random() < 0.3, wrap: Math.random() < 0.1, cap: Math.random() < 0.15, watch: Math.random() < 0.3,
  });
  refresh();
});
document.getElementById("party").addEventListener("click", () => {
  const c = document.querySelector(".zv-char");
  c.classList.remove("celebrate");
  void c.getBoundingClientRect(); // lets the animation restart if you press it twice
  c.classList.add("celebrate");
});
refresh();

const SUPABASE_URL = "" ;
const SUPABASE_KEY = "" ;
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
const note = document.getElementById("save-note");

// Open the page: show the default character straight away, then load the saved one
async function init() {
  refresh();
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    note.innerHTML = 'Log in to save your character. <a href="../login.html">Log in</a>';
    return;
  }
  const { data: p } = await sb.from("profiles").select("avatar")
    .eq("id", data.session.user.id).maybeSingle();
  if (p && p.avatar) {
    Object.assign(config, p.avatar); // saved choices replace the defaults
    refresh();
  }
}

document.getElementById("save-char").addEventListener("click", async () => {
  note.textContent = "Saving…";
  const { data } = await sb.auth.getSession();
  if (!data.session) {
    note.innerHTML = 'Log in to save your character. <a href="../login.html">Log in</a>';
    return;
  }
  const { error } = await sb.from("profiles").upsert({ id: data.session.user.id, avatar: config });
  if (error) console.log("Save error:", error);
  note.textContent = error ? "Couldn't save your character." : "Saved. It'll be here next time.";
});

init();