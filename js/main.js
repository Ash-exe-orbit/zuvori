const root = document.documentElement;
root.dataset.theme = localStorage.getItem("theme") || "dark";

document.getElementById("theme-toggle").addEventListener("click", function () {
  const next = root.dataset.theme === "dark" ? "light" : "dark";
  root.dataset.theme = next;
  localStorage.setItem("theme", next); // remembers the choice
});

const SUPABASE_URL = "";
const SUPABASE_KEY = "";

const form = document.getElementById("waitlist-form");
const message = document.getElementById("form-message");

form.addEventListener("submit", async function (event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const button = form.querySelector("button");
  button.disabled = true;
  message.textContent = "Adding you…";

  try {
    const res = await fetch(SUPABASE_URL + "/rest/v1/waitlist", {
      method: "POST",
      headers: {
        "apikey": SUPABASE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
      },
      body: JSON.stringify({ email: email })
    });

    if (res.ok) {
      message.textContent = "You're on the list. Welcome to Zuvori.";
      form.reset();
    } else if (res.status === 409) {
      message.textContent = "You're already on the list.";
    } else {
      message.textContent = "Something went wrong. Please try again.";
    }
  } catch (err) {
    message.textContent = "No connection. Please try again.";
  }
  button.disabled = false;
});