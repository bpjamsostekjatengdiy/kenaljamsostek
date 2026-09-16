const CERTIFICATE_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vStpYviM6z4JWn4dPGAHHYDOJCBtICdIshwoqeSWqAhlMrZPbxN_n6BrU6eit2qzHOFCt_vHfr57-C7/pubhtml?gid=0&single=true";
const CERTIFICATE_RESPONSE_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbxMP8hBDJ_B41D74NHaY_Q97PwV23UVfvli_XQH629ZO6sbIjgyfDbORQFkXJcZq00U/exec";

const elements = {
  form: document.querySelector("#certificate-form"),
  phone: document.querySelector("#certificate-phone"),
  eventInfo: document.querySelector("#certificate-event-info"),
  stage: document.querySelector("#certificate-stage"),
  name: document.querySelector("#certificate-name"),
  episode: document.querySelector("#certificate-episode"),
  date: document.querySelector("#certificate-date"),
  serial: document.querySelector("#certificate-serial"),
  print: document.querySelector("#print-certificate"),
  status: document.querySelector("#certificate-status"),
  message: document.querySelector("#message"),
};

let responseRows = [];
let episodeRows = [];

window.addEventListener("DOMContentLoaded", () => {
  elements.date.textContent = formatLongDate(new Date());
  loadCertificateData();
});

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await generateCertificate();
});

elements.print.addEventListener("click", () => {
  window.print();
});

async function loadCertificateData() {
  const [responses, episodes] = await Promise.allSettled([loadResponses(), loadEpisodes()]);

  if (responses.status === "fulfilled") {
    responseRows = responses.value;
  } else {
    responseRows = [];
    showMessage("Data feedback belum bisa dimuat. Coba lagi sebentar.");
  }

  episodeRows = episodes.status === "fulfilled" ? episodes.value : [];
  renderEventInfo();
}

async function generateCertificate() {
  const phone = normalizePhone(elements.phone.value);
  elements.status.classList.add("hidden");
  elements.status.innerHTML = "";

  if (!phone) {
    showMessage("Masukkan nomor HP terlebih dahulu.");
    return;
  }

  if (responseRows.length === 0) {
    await loadCertificateData();
  }

  if (responseRows.length === 0) {
    showMessage("Data feedback belum tersedia untuk dicek.");
    return;
  }

  const todayKey = getDateKey(new Date());
  const participantFeedbackRows = findParticipantFeedbackRows(phone, todayKey);
  const participant = participantFeedbackRows.find(isBeforeCertificateCutoff);

  if (!participant) {
    elements.stage.classList.add("hidden");
    const message = participantFeedbackRows.length
      ? getLateFeedbackMessage()
      : getMissingFeedbackMessage(phone, todayKey);
    showCertificateStatus(message);
    showMessage(message);
    return;
  }

  const participantDate = getDateKey(participant.timestamp || participant.submittedAt);
  const participantDateObject = getDateObject(participant.timestamp || participant.submittedAt) || new Date();
  const episode = findEpisodeForDate(participantDate);
  const fallbackTheme = participant.tema || participant.testTheme || "Kegiatan Literasi New DIJAMIN";

  elements.name.textContent = (participant.nama_lengkap || participant.fullName || "").toUpperCase();
  elements.episode.textContent = episode || `"${fallbackTheme}"`;
  elements.date.textContent = formatLongDate(participantDateObject);
  elements.serial.textContent = `SERIAL: ${formatPhoneForSerial(phone)}-${formatSerialDate(participantDateObject)}`;
  elements.stage.classList.remove("hidden");
  elements.status.classList.add("hidden");
  elements.status.innerHTML = "";
  showMessage("Sertifikat siap dicetak.");
}

function findParticipantFeedbackRows(phone, dateKey) {
  return responseRows.filter((row) => {
    const rowPhone = normalizePhone(row.nomor_wa || row.whatsappNumber);
    const rowSession = getSessionType(row.sesi || row.testSession);
    const rowDate = getDateKey(row.timestamp || row.submittedAt);

    return rowPhone === phone && rowSession === "post" && rowDate === dateKey;
  });
}

function isBeforeCertificateCutoff(row) {
  const submittedAt = getDateObject(row.timestamp || row.submittedAt);

  if (!submittedAt) {
    return false;
  }

  const cutoff = new Date(submittedAt);
  cutoff.setHours(12, 0, 0, 0);
  return submittedAt < cutoff;
}

function getLateFeedbackMessage() {
  return "Anda terdeteksi melakukan pengisian feedback setelah kegiatan berakhir, sehingga tidak bisa cetak sertifikat.\n\nNantikan episode DIJAMIN berikutnya. Terima kasih";
}

function getClosedFeedbackMessage() {
  return "Tidak bisa mencetak sertifikat dan mengisi feedback karena kegiatan sudah selesai.\n\nNantikan episode DIJAMIN berikutnya.\n\nTerima kasih";
}

function getMissingFeedbackMessage(phone, dateKey) {
  if (isAfterDailyCutoff(new Date())) {
    return getClosedFeedbackMessage();
  }

  const samePhoneRows = responseRows.filter(
    (row) => normalizePhone(row.nomor_wa || row.whatsappNumber) === phone,
  );

  if (samePhoneRows.length === 0) {
    return "Nomor HP belum ditemukan di data Feedback. Silakan isi Feedback terlebih dahulu agar sertifikat bisa dibuat.";
  }

  const hasPost = samePhoneRows.some((row) => getSessionType(row.sesi || row.testSession) === "post");

  if (!hasPost) {
    return "Nomor HP ditemukan, tetapi datanya baru Absensi. Silakan isi Feedback terlebih dahulu agar sertifikat bisa dibuat.";
  }

  const hasToday = samePhoneRows.some((row) => getDateKey(row.timestamp || row.submittedAt) === dateKey);

  if (!hasToday) {
    return "Nomor HP ditemukan, tetapi bukan data Feedback hari ini.";
  }

  return "Data feedback hari ini untuk nomor HP tersebut belum ditemukan.";
}

function isAfterDailyCutoff(date) {
  const cutoff = new Date(date);
  cutoff.setHours(12, 0, 0, 0);
  return date >= cutoff;
}

function showCertificateStatus(text) {
  elements.status.textContent = text;

  if (text.includes("Feedback")) {
    const link = document.createElement("a");
    link.href = "./feedback.html";
    link.textContent = "Buka halaman Feedback";
    elements.status.append(document.createElement("br"), link);
  }

  elements.status.classList.remove("hidden");
}

async function loadResponses() {
  const response = await fetch(`${CERTIFICATE_RESPONSE_ENDPOINT_URL}?sheet=jawaban&format=json`);

  if (!response.ok) {
    throw new Error("Gagal membaca jawaban.");
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload : payload.rows || [];
}

async function loadEpisodes() {
  const response = await fetch(`${CERTIFICATE_RESPONSE_ENDPOINT_URL}?sheet=episode&format=json`);

  if (!response.ok) {
    return [];
  }

  const payload = await response.json();
  const rows = Array.isArray(payload) ? payload : payload.rows || [];
  return rows.map(normalizeObjectKeys);
}

function findEpisodeForDate(dateKey) {
  const episode = episodeRows.find((row) => {
    const value =
      row.tanggal_pelaksanaan || row.tanggal || row.date || row.tgl || row.hari_tanggal || "";
    return getDateKey(value) === dateKey || normalizeDateText(value) === dateKey;
  });

  if (!episode) {
    return "";
  }

  return (
    episode.episode ||
    episode.topik ||
    episode.tema ||
    episode.judul ||
    episode.nama_episode ||
    episode.nama_modul ||
    ""
  );
}

function renderEventInfo() {
  const today = new Date();
  const todayKey = getDateKey(today);
  const episode = findEpisodeForDate(todayKey) || "Episode belum tersedia";
  elements.eventInfo.textContent = `Kegiatan DIJAMIN : ${episode} tanggal ${formatLongDate(today)}`;
}

function normalizeDateText(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);

  if (!match) {
    return "";
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}

function normalizeObjectKeys(row) {
  return Object.keys(row || {}).reduce((record, key) => {
    record[cleanKey(key)] = row[key];
    return record;
  }, {});
}

function normalizeSpreadsheetUrl(input, sheetName) {
  const url = new URL(input, window.location.href);
  const publishedMatch = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
  const documentMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);

  if (publishedMatch) {
    return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?output=csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  if (documentMatch) {
    return `https://docs.google.com/spreadsheets/d/${documentMatch[1]}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  }

  return url.href;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.trim() !== "")) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim() !== "")) {
    rows.push(row);
  }

  if (rows.length < 2) {
    return [];
  }

  const headers = rows[0].map((header) => cleanKey(header));
  return rows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = (values[index] || "").trim();
      return record;
    }, {}),
  );
}

function cleanKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("62")) {
    return `0${digits.slice(2)}`;
  }

  if (digits.startsWith("8")) {
    return `0${digits}`;
  }

  return digits;
}

function formatPhoneForSerial(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.startsWith("62")) {
    return digits.slice(2);
  }

  if (digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
}

function getSessionType(value) {
  const session = String(value || "").trim().toLowerCase().replace(/\s+/g, "");

  if (["feedback", "posttest", "postest", "post"].includes(session)) {
    return "post";
  }

  return "";
}

function getDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateObject(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatSerialDate(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.classList.remove("hidden");
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => {
    elements.message.classList.add("hidden");
  }, 4200);
}
