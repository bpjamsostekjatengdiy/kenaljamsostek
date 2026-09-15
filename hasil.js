const RESULTS_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbzH23eWrhkBizk52Qd29TEngdPxx0Sh-9-WwxwSu31A6ZwuKegVjCnnbgAhdZxVOuMMSg/exec";

const state = {
  rows: [],
  filteredRows: [],
};

const elements = {
  resultPageDate: document.querySelector("#result-page-date"),
  metricParticipants: document.querySelector("#metric-participants"),
  metricAverage: document.querySelector("#metric-average"),
  metricHighest: document.querySelector("#metric-highest"),
  metricDuration: document.querySelector("#metric-duration"),
  filterSession: document.querySelector("#filter-session"),
  filterTheme: document.querySelector("#filter-theme"),
  refreshResults: document.querySelector("#refresh-results"),
  resultEmpty: document.querySelector("#result-empty"),
  resultsBody: document.querySelector("#results-body"),
  message: document.querySelector("#message"),
};

window.addEventListener("DOMContentLoaded", () => {
  elements.resultPageDate.textContent = `Data diperbarui ${formatLongDate(new Date())}`;
  loadResults();
});

elements.refreshResults.addEventListener("click", loadResults);
elements.filterSession.addEventListener("change", applyFilters);
elements.filterTheme.addEventListener("change", applyFilters);

async function loadResults() {
  setLoading(true);

  try {
    const response = await fetch(`${RESULTS_ENDPOINT_URL}?sheet=jawaban&format=json`);

    if (!response.ok) {
      throw new Error(`Data hasil belum bisa dibaca (${response.status}).`);
    }

    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.rows || [];

    state.rows = rows.map(normalizeResultRow).filter((row) => row.name);
    populateFilters(state.rows);
    applyFilters();
    showMessage(`${state.rows.length} data hasil dimuat.`);
  } catch (error) {
    state.rows = [];
    state.filteredRows = [];
    renderMetrics([]);
    renderRows([]);
    showMessage(
      "Data hasil belum bisa dibaca. Pastikan Apps Script sudah diperbarui dan deploy ulang.",
    );
  } finally {
    setLoading(false);
  }
}

function normalizeResultRow(row) {
  const detail = parseDetail(row.detail_jawaban);
  const totalQuestions = toNumber(row.jumlah_soal) || detail.length || 0;
  const correct = detail.length
    ? detail.filter((answer) => answer.isCorrect === true || answer.isCorrect === "true").length
    : Math.round((toNumber(row.skor) || 0) / 10);

  return {
    timestamp: row.timestamp || row.submittedAt || "",
    name: row.nama_lengkap || row.fullName || "",
    whatsapp: row.nomor_wa || row.whatsappNumber || "",
    company: row.nama_perusahaan || row.companyName || "",
    domicile: row.kota_domisili || row.domicile || "",
    session: row.sesi || row.testSession || "",
    theme: row.tema || row.testTheme || "",
    durationSeconds: toNumber(row.lama_pengerjaan_detik || row.durationSeconds),
    durationText: row.lama_pengerjaan || row.durationText || "",
    score: toNumber(row.skor || row.score),
    totalQuestions,
    correct,
  };
}

function populateFilters(rows) {
  const currentSession = elements.filterSession.value;
  const currentTheme = elements.filterTheme.value;
  const sessions = uniqueSorted(rows.map((row) => row.session));
  const themes = uniqueSorted(rows.map((row) => row.theme));

  fillSelect(elements.filterSession, "Semua sesi", sessions);
  fillSelect(elements.filterTheme, "Semua tema", themes);

  elements.filterSession.value = sessions.includes(currentSession) ? currentSession : "";
  elements.filterTheme.value = themes.includes(currentTheme) ? currentTheme : "";
}

function applyFilters() {
  const session = elements.filterSession.value;
  const theme = elements.filterTheme.value;

  state.filteredRows = state.rows.filter((row) => {
    const matchSession = !session || row.session === session;
    const matchTheme = !theme || row.theme === theme;
    return matchSession && matchTheme;
  });

  renderMetrics(state.filteredRows);
  renderRows(state.filteredRows);
}

function renderMetrics(rows) {
  const scores = rows.map((row) => row.score).filter(Number.isFinite);
  const durations = rows.map((row) => row.durationSeconds).filter((duration) => duration > 0);
  const average = scores.length ? Math.round(sum(scores) / scores.length) : 0;
  const highest = scores.length ? Math.max(...scores) : 0;
  const averageDuration = durations.length ? Math.round(sum(durations) / durations.length) : 0;

  elements.metricParticipants.textContent = rows.length;
  elements.metricAverage.textContent = average;
  elements.metricHighest.textContent = highest;
  elements.metricDuration.textContent = formatDuration(averageDuration);
}

function renderRows(rows) {
  elements.resultsBody.innerHTML = "";
  elements.resultEmpty.classList.toggle("hidden", rows.length > 0);

  rows
    .slice()
    .sort((first, second) => new Date(second.timestamp) - new Date(first.timestamp))
    .forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(formatDateTime(row.timestamp))}</td>
        <td>
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.company || "-")}</span>
        </td>
        <td>${escapeHtml(row.domicile || "-")}</td>
        <td>${escapeHtml(row.session || "-")}</td>
        <td>${escapeHtml(row.theme || "-")}</td>
        <td><strong>${row.score || 0}</strong></td>
        <td>${row.correct || 0}/${row.totalQuestions || 0}</td>
        <td>${escapeHtml(row.durationText || formatDuration(row.durationSeconds))}</td>
      `;
      elements.resultsBody.append(tr);
    });
}

function setLoading(isLoading) {
  elements.refreshResults.disabled = isLoading;
  elements.refreshResults.textContent = isLoading ? "Memuat..." : "Segarkan";
}

function fillSelect(select, placeholder, options) {
  select.innerHTML = `<option value="">${placeholder}</option>`;

  options.forEach((option) => {
    const item = document.createElement("option");
    item.value = option;
    item.textContent = option;
    select.append(item);
  });
}

function parseDetail(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((first, second) =>
    first.localeCompare(second, "id"),
  );
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function formatDateTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
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
