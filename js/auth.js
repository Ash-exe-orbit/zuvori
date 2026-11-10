const SUPABASE_URL = "";
const SUPABASE_KEY = "";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

document.documentElement.dataset.theme = localStorage.getItem("theme") || "dark";

const $ = (id) => document.getElementById(id);
let mode = "login"; // "login" or "signup"

// Already logged in? Go straight to the tracker.
sb.auth.getSession().then(({ data }) => {
  if (data.session) location.href = "app/index.html";
});

$("switch-btn").addEventListener("click", () => {
  mode = mode === "login" ? "signup" : "login";
  const signup = mode === "signup";
  $("auth-title").textContent = signup ? "Join Zuvori" : "Welcome back";
  $("auth-submit").textContent = signup ? "Create account" : "Log in";
  $("switch-text").textContent = signup ? "Already have an account?" : "New here?";
  $("switch-btn").textContent = signup ? "Log in" : "Create an account";
  $("password").autocomplete = signup ? "new-password" : "current-password";
  $("auth-message").textContent = "";
});

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("email").value.trim();
  const password = $("password").value;
  const msg = $("auth-message");
  const btn = $("auth-submit");
  btn.disabled = true;
  msg.textContent = "One moment…";

  const { data, error } = mode === "signup"
    ? await sb.auth.signUp({ email, password })
    : await sb.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  if (error) {
    msg.textContent = error.message;
    return;
  }
  if (data.session) {
    location.href = "app/index.html";
  } else {
    msg.textContent = "Check your email to confirm your account.";
  }
});