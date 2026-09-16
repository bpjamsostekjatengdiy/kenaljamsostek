const RESULTS_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbxMP8hBDJ_B41D74NHaY_Q97PwV23UVfvli_XQH629ZO6sbIjgyfDbORQFkXJcZq00U/exec";

const state = {
  rows: [],
  filteredRows: [],
  sortedRows: [],
  currentPage: 1,
  rowsPerPage: 10,
  sortKey: "timestamp",
  sortDirection: "desc",
};

const elements = {
  resultPageDate: document.querySelector("#result-page-date"),
  metricParticipantsPre: document.querySelector("#metric-participants-pre"),
  metricParticipantsPost: document.querySelector("#metric-participants-post"),
  metricAveragePre: document.querySelector("#metric-average-pre"),
  metricAveragePost: document.querySelector("#metric-average-post"),
  metricHighestPre: document.querySelector("#metric-highest-pre"),
  metricHighestPost: document.querySelector("#metric-highest-post"),
  metricDurationPre: document.querySelector("#metric-duration-pre"),
  metricDurationPost: document.querySelector("#metric-duration-post"),
  filterDateStart: document.querySelector("#filter-date-start"),
  filterDateEnd: document.querySelector("#filter-date-end"),
  filterSession: document.querySelector("#filter-session"),
  filterTheme: document.querySelector("#filter-theme"),
  refreshResults: document.querySelector("#refresh-results"),
  comparisonEmpty: document.querySelector("#comparison-empty"),
  comparisonChart: document.querySelector("#comparison-chart"),
  resultEmpty: document.querySelector("#result-empty"),
  resultsBody: document.querySelector("#results-body"),
  paginationInfo: document.querySelector("#pagination-info"),
  prevPage: document.querySelector("#prev-page"),
  nextPage: document.querySelector("#next-page"),
  sortButtons: document.querySelectorAll(".sort-button"),
  message: document.querySelector("#message"),
};

window.addEventListener("DOMContentLoaded", () => {
  elements.resultPageDate.textContent = `Data diperbarui ${formatLongDate(new Date())}`;
  loadResults();
});

elements.refreshResults.addEventListener("click", loadResults);
elements.filterDateStart.addEventListener("change", applyFilters);
elements.filterDateEnd.addEventListener("change", applyFilters);
elements.filterSession.addEventListener("change", applyFilters);
elements.filterTheme.addEventListener("change", applyFilters);
elements.prevPage.addEventListener("click", () => {
  if (state.currentPage > 1) {
    state.currentPage -= 1;
    renderRows();
  }
});
elements.nextPage.addEventListener("click", () => {
  const totalPages = getTotalPages();

  if (state.currentPage < totalPages) {
    state.currentPage += 1;
    renderRows();
  }
});
elements.sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const nextKey = button.dataset.sort;

    if (state.sortKey === nextKey) {
      state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
    } else {
      state.sortKey = nextKey;
      state.sortDirection = getDefaultSortDirection(nextKey);
    }

    state.currentPage = 1;
    renderRows();
  });
});

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
    setDefaultLatestDateFilter(state.rows);
    applyFilters();
    showMessage(`${state.rows.length} data hasil dimuat.`);
  } catch (error) {
    state.rows = [];
    state.filteredRows = [];
    state.sortedRows = [];
    renderMetrics([]);
    renderComparison([]);
    renderRows();
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
    dateKey: getDateKey(row.timestamp || row.submittedAt || ""),
    sessionType: getSessionType(row.sesi || row.testSession || ""),
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

function setDefaultLatestDateFilter(rows) {
  if (elements.filterDateStart.value || elements.filterDateEnd.value) {
    return;
  }

  const latestDate = rows
    .map((row) => row.dateKey)
    .filter(Boolean)
    .sort()
    .at(-1);

  if (!latestDate) {
    return;
  }

  elements.filterDateStart.value = latestDate;
  elements.filterDateEnd.value = latestDate;
}

function applyFilters() {
  const startDate = elements.filterDateStart.value;
  const endDate = elements.filterDateEnd.value;
  const session = elements.filterSession.value;
  const theme = elements.filterTheme.value;

  state.filteredRows = state.rows.filter((row) => {
    const matchStart = !startDate || row.dateKey >= startDate;
    const matchEnd = !endDate || row.dateKey <= endDate;
    const matchSession = !session || row.session === session;
    const matchTheme = !theme || row.theme === theme;
    return matchStart && matchEnd && matchSession && matchTheme;
  });

  renderMetrics(state.filteredRows);
  renderComparison(getComparisonRows());
  state.currentPage = 1;
  renderRows();
}

function getComparisonRows() {
  const startDate = elements.filterDateStart.value;
  const endDate = elements.filterDateEnd.value;
  const theme = elements.filterTheme.value;

  return state.rows.filter((row) => {
    const matchStart = !startDate || row.dateKey >= startDate;
    const matchEnd = !endDate || row.dateKey <= endDate;
    const matchTheme = !theme || row.theme === theme;
    return matchStart && matchEnd && matchTheme;
  });
}

function renderMetrics(rows) {
  const preRows = rows.filter((row) => row.sessionType === "pre");
  const postRows = rows.filter((row) => row.sessionType === "post");

  elements.metricParticipantsPre.textContent = preRows.length;
  elements.metricParticipantsPost.textContent = postRows.length;
  elements.metricAveragePre.textContent = averageScore(preRows);
  elements.metricAveragePost.textContent = averageScore(postRows);
  elements.metricHighestPre.textContent = highestScore(preRows);
  elements.metricHighestPost.textContent = highestScore(postRows);
  elements.metricDurationPre.textContent = averageDuration(preRows);
  elements.metricDurationPost.textContent = averageDuration(postRows);
}

function averageScore(rows) {
  const scores = rows.map((row) => row.score).filter(Number.isFinite);
  return scores.length ? Math.round(sum(scores) / scores.length) : 0;
}

function highestScore(rows) {
  const scores = rows.map((row) => row.score).filter(Number.isFinite);
  return scores.length ? Math.max(...scores) : 0;
}

function averageDuration(rows) {
  const durations = rows.map((row) => row.durationSeconds).filter((duration) => duration > 0);
  return durations.length ? formatDuration(Math.round(sum(durations) / durations.length)) : "0 detik";
}

function renderComparison(rows) {
  const groups = buildComparisonGroups(rows);

  elements.comparisonChart.innerHTML = "";
  elements.comparisonEmpty.classList.toggle("hidden", groups.length > 0);

  if (groups.length === 0) {
    return;
  }

  elements.comparisonChart.innerHTML = `
    <div class="bar-chart-scale" aria-hidden="true">
      <span>100</span>
      <span>75</span>
      <span>50</span>
      <span>25</span>
      <span>0</span>
    </div>
  `;

  groups.forEach((group) => {
    const item = document.createElement("article");
    item.className = "chart-group";
    const deltaClass = group.delta >= 0 ? "positive" : "negative";
    const deltaText = group.hasPair ? (group.delta >= 0 ? `+${group.delta}` : `${group.delta}`) : "-";

    item.innerHTML = `
      <small class="delta-pill ${deltaClass}">${deltaText}${group.hasPair ? " poin" : ""}</small>
      <div class="chart-bars" aria-label="Awal sesi ${group.preAverage}, setelah literasi ${group.postAverage}">
        <div class="chart-bar-wrap">
          <strong>${group.preAverage ?? "-"}</strong>
          <div class="chart-bar bar-pre" style="height: ${group.preAverage ?? 0}%"></div>
          <span>Awal</span>
        </div>
        <div class="chart-bar-wrap">
          <strong>${group.postAverage ?? "-"}</strong>
          <div class="chart-bar bar-post" style="height: ${group.postAverage ?? 0}%"></div>
          <span>Akhir</span>
        </div>
      </div>
      <div class="chart-caption">
        <strong>${escapeHtml(group.theme)}</strong>
        <span>${escapeHtml(group.dateLabel)}</span>
        <span class="chart-count">
          Partisipan<br />
          Awal : ${group.preCount}<br />
          Akhir : ${group.postCount}
        </span>
      </div>
    `;
    elements.comparisonChart.append(item);
  });
}

function buildComparisonGroups(rows) {
  const grouped = rows.reduce((groups, row) => {
    const dateKey = getDateKey(row.timestamp);
    const sessionType = getSessionType(row.session);

    if (!dateKey || !row.theme || !sessionType) {
      return groups;
    }

    const key = `${dateKey}||${row.theme}`;

    if (!groups.has(key)) {
      groups.set(key, {
        dateKey,
        dateLabel: formatDateOnly(row.timestamp),
        theme: row.theme,
        pre: [],
        post: [],
      });
    }

    groups.get(key)[sessionType].push(row.score);
    return groups;
  }, new Map());

  return [...grouped.values()]
    .map((group) => {
      const preAverage = group.pre.length ? Math.round(sum(group.pre) / group.pre.length) : null;
      const postAverage = group.post.length ? Math.round(sum(group.post) / group.post.length) : null;
      const hasPair = preAverage !== null && postAverage !== null;

      return {
        ...group,
        preAverage,
        postAverage,
        preCount: group.pre.length,
        postCount: group.post.length,
        hasPair,
        delta: hasPair ? postAverage - preAverage : 0,
      };
    })
    .sort((first, second) => {
      const dateOrder = new Date(second.dateKey) - new Date(first.dateKey);
      return dateOrder || first.theme.localeCompare(second.theme, "id");
    });
}

function renderRows() {
  state.sortedRows = sortRows(state.filteredRows);
  const rows = getPaginatedRows();
  elements.resultsBody.innerHTML = "";
  elements.resultEmpty.classList.toggle("hidden", state.filteredRows.length > 0);
  updateSortButtons();
  updatePagination();

  rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(formatDateTime(row.timestamp))}</td>
        <td>
          <strong>${escapeHtml(row.name)}</strong>
          <span>${escapeHtml(row.company || "-")}</span>
        </td>
        <td>${escapeHtml(formatPhone(row.whatsapp))}</td>
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

function sortRows(rows) {
  return rows.slice().sort((first, second) => {
    const firstValue = getSortValue(first, state.sortKey);
    const secondValue = getSortValue(second, state.sortKey);
    const direction = state.sortDirection === "asc" ? 1 : -1;

    if (typeof firstValue === "number" && typeof secondValue === "number") {
      return (firstValue - secondValue) * direction;
    }

    return String(firstValue).localeCompare(String(secondValue), "id", {
      numeric: true,
      sensitivity: "base",
    }) * direction;
  });
}

function getSortValue(row, key) {
  if (key === "timestamp") {
    return new Date(row.timestamp).getTime() || 0;
  }

  if (key === "whatsapp") {
    return formatPhone(row.whatsapp);
  }

  return row[key] ?? "";
}

function getPaginatedRows() {
  const start = (state.currentPage - 1) * state.rowsPerPage;
  return state.sortedRows.slice(start, start + state.rowsPerPage);
}

function getTotalPages() {
  return Math.max(1, Math.ceil(state.filteredRows.length / state.rowsPerPage));
}

function updatePagination() {
  const totalRows = state.filteredRows.length;
  const totalPages = getTotalPages();
  const start = totalRows === 0 ? 0 : (state.currentPage - 1) * state.rowsPerPage + 1;
  const end = Math.min(state.currentPage * state.rowsPerPage, totalRows);

  elements.paginationInfo.textContent =
    totalRows === 0 ? "0 data" : `${start}-${end} dari ${totalRows} data`;
  elements.prevPage.disabled = state.currentPage <= 1;
  elements.nextPage.disabled = state.currentPage >= totalPages;
}

function updateSortButtons() {
  elements.sortButtons.forEach((button) => {
    const isActive = button.dataset.sort === state.sortKey;
    button.classList.toggle("active", isActive);
    button.dataset.direction = isActive ? state.sortDirection : "";
  });
}

function getDefaultSortDirection(key) {
  return ["timestamp", "score", "correct", "durationSeconds"].includes(key) ? "desc" : "asc";
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

function formatDateOnly(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value || "-";
  }

  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
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

function getSessionType(value) {
  const session = String(value || "").trim().toLowerCase().replace(/\s+/g, "");

  if (["absensi", "pretest", "pretes", "pre"].includes(session)) {
    return "pre";
  }

  if (["feedback", "posttest", "postest", "post"].includes(session)) {
    return "post";
  }

  return "";
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

function formatPhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "-";
  }

  if (digits.startsWith("62")) {
    return `0${digits.slice(2)}`;
  }

  if (digits.startsWith("8")) {
    return `0${digits}`;
  }

  return digits;
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
