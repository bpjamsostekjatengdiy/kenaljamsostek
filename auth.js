const STATIC_ACCESS_KEY = "Welcome123!";
const ACCESS_SESSION_KEY = "pemahaman_jdiy_access";
const ACCESS_EXPIRES_KEY = "pemahaman_jdiy_access_expires";
const ACCESS_DURATION_MS = 60 * 60 * 1000;

(function guardProtectedPage() {
  const isProtected = document.currentScript?.dataset.protected === "true";

  if (!isProtected) {
    return;
  }

  if (isAccessGranted()) {
    return;
  }

  const currentPage = `${window.location.pathname.split("/").pop()}${window.location.search}`;
  window.location.replace(`./login.html?next=${encodeURIComponent(currentPage)}`);
})();

function isAccessGranted() {
  const granted = sessionStorage.getItem(ACCESS_SESSION_KEY) === "granted";
  const expiresAt = Number(sessionStorage.getItem(ACCESS_EXPIRES_KEY) || 0);

  if (granted && expiresAt > Date.now()) {
    return true;
  }

  sessionStorage.removeItem(ACCESS_SESSION_KEY);
  sessionStorage.removeItem(ACCESS_EXPIRES_KEY);
  return false;
}

function setupLoginForm() {
  const form = document.querySelector("#login-form");
  const input = document.querySelector("#access-key");
  const status = document.querySelector("#login-status");

  if (!form || !input || !status) {
    return;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (input.value === STATIC_ACCESS_KEY) {
      sessionStorage.setItem(ACCESS_SESSION_KEY, "granted");
      sessionStorage.setItem(ACCESS_EXPIRES_KEY, String(Date.now() + ACCESS_DURATION_MS));
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") || "hasil.html";
      window.location.href = next;
      return;
    }

    status.textContent = "Key belum sesuai.";
    status.classList.remove("hidden");
    input.select();
  });
}

window.addEventListener("DOMContentLoaded", setupLoginForm);
