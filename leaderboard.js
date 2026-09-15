const LEADERBOARD_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbzH23eWrhkBizk52Qd29TEngdPxx0Sh-9-WwxwSu31A6ZwuKegVjCnnbgAhdZxVOuMMSg/exec";

const elements = {
  subtitle: document.querySelector("#leaderboard-subtitle"),
  podium: document.querySelector("#podium"),
  rankList: document.querySelector("#rank-list"),
  empty: document.querySelector("#leaderboard-empty"),
  confettiLayer: document.querySelector("#confetti-layer"),
  message: document.querySelector("#message"),
};

window.addEventListener("DOMContentLoaded", () => {
  createConfetti();
  loadLeaderboard();
});

async function loadLeaderboard() {
  try {
    const response = await fetch(`${LEADERBOARD_ENDPOINT_URL}?sheet=jawaban&format=json`);

    if (!response.ok) {
      throw new Error(`Data leaderboard belum bisa dibaca (${response.status}).`);
    }

    const payload = await response.json();
    const rows = (Array.isArray(payload) ? payload : payload.rows || [])
      .map(normalizeRow)
      .filter((row) => row.name && row.sessionType === "post" && row.dateKey);
    const latestDate = rows.map((row) => row.dateKey).sort().at(-1);
    const winners = rows
      .filter((row) => row.dateKey === latestDate)
      .sort((first, second) => second.score - first.score || first.durationSeconds - second.durationSeconds)
      .slice(0, 10);

    renderLeaderboard(winners, latestDate);
  } catch (error) {
    elements.empty.classList.remove("hidden");
    showMessage("Leaderboard belum bisa dimuat. Pastikan Apps Script sudah aktif.");
  }
}

function normalizeRow(row) {
  const timestamp = row.timestamp || row.submittedAt || "";
  const score = toNumber(row.skor || row.score);
  const durationSeconds = toNumber(row.lama_pengerjaan_detik || row.durationSeconds);

  return {
    timestamp,
    dateKey: getDateKey(timestamp),
    name: row.nama_lengkap || row.fullName || "",
    company: row.nama_perusahaan || row.companyName || "",
    domicile: row.kota_domisili || row.domicile || "",
    session: row.sesi || row.testSession || "",
    sessionType: getSessionType(row.sesi || row.testSession || ""),
    theme: row.tema || row.testTheme || "",
    score,
    durationSeconds,
    durationText: row.lama_pengerjaan || row.durationText || formatDuration(durationSeconds),
  };
}

function renderLeaderboard(winners, latestDate) {
  elements.empty.classList.toggle("hidden", winners.length > 0);
  elements.subtitle.textContent = latestDate
    ? `Sesi Feedback tanggal ${formatDateOnly(latestDate)}`
    : "Menunggu data Feedback terbaru.";
  elements.podium.innerHTML = "";
  elements.rankList.innerHTML = "";

  winners.slice(0, 3).forEach((winner, index) => {
    const card = document.createElement("article");
    card.className = `podium-card rank-${index + 1}`;
    card.innerHTML = `
      <span class="podium-medal">#${index + 1}</span>
      <h2>${escapeHtml(winner.name)}</h2>
      <strong>${winner.score}</strong>
      <p>${escapeHtml(winner.durationText)} - ${escapeHtml(winner.theme || "-")}</p>
    `;
    elements.podium.append(card);
  });

  winners.forEach((winner, index) => {
    const item = document.createElement("li");
    item.className = index < 3 ? "rank-item top-rank" : "rank-item";
    item.innerHTML = `
      <span class="rank-number">${index + 1}</span>
      <div class="rank-person">
        <strong>${escapeHtml(winner.name)}</strong>
        <span>${escapeHtml(winner.company || winner.domicile || "-")}</span>
      </div>
      <span class="rank-theme">${escapeHtml(winner.theme || "-")}</span>
      <span class="rank-score">${winner.score} poin</span>
      <span class="rank-time">${escapeHtml(winner.durationText)}</span>
    `;
    elements.rankList.append(item);
  });
}

function createConfetti() {
  const colors = ["#f59e0b", "#008b72", "#e56b2f", "#1d9bf0", "#ef4e7b"];

  for (let index = 0; index < 72; index += 1) {
    const piece = document.createElement("span");
    piece.style.setProperty("--x", `${Math.random() * 100}vw`);
    piece.style.setProperty("--delay", `${Math.random() * 4}s`);
    piece.style.setProperty("--duration", `${4 + Math.random() * 4}s`);
    piece.style.setProperty("--rotation", `${Math.random() * 720}deg`);
    piece.style.background = colors[index % colors.length];
    elements.confettiLayer.append(piece);
  }
}

function getSessionType(value) {
  const session = String(value || "").trim().toLowerCase().replace(/\s+/g, "");

  if (["feedback", "posttest", "postest", "post"].includes(session)) {
    return "post";
  }

  return "";
}

function getDateKey(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnly(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatDuration(totalSeconds) {
  const secondsValue = Number(totalSeconds) || 0;
  const minutes = Math.floor(secondsValue / 60);
  const seconds = secondsValue % 60;

  if (minutes === 0) {
    return `${seconds} detik`;
  }

  return `${minutes} menit ${seconds} detik`;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.classList.remove("hidden");
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => {
    elements.message.classList.add("hidden");
  }, 4200);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
