const DEFAULT_SPREADSHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vStpYviM6z4JWn4dPGAHHYDOJCBtICdIshwoqeSWqAhlMrZPbxN_n6BrU6eit2qzHOFCt_vHfr57-C7/pubhtml?gid=0&single=true";
const RESPONSE_ENDPOINT_URL =
  "https://script.google.com/macros/s/AKfycbzH23eWrhkBizk52Qd29TEngdPxx0Sh-9-WwxwSu31A6ZwuKegVjCnnbgAhdZxVOuMMSg/exec";
const MAX_ACTIVE_QUESTIONS = 10;

const REQUIRED_COLUMNS = ["pertanyaan"];
const OPTION_COLUMNS = [
  ["A", "opsi_a"],
  ["B", "opsi_b"],
  ["C", "opsi_c"],
  ["D", "opsi_d"],
  ["E", "opsi_e"],
];

const state = {
  rows: [],
  questions: [],
  currentIndex: 0,
  answers: {},
  participant: null,
  isQuestionBankLoaded: false,
  activeThemePrograms: {},
  startedAt: null,
  finishedAt: null,
  timerId: null,
  durationSeconds: 0,
};

const elements = {
  participantForm: document.querySelector("#participant-form"),
  participantPanel: document.querySelector("#participant-panel"),
  fullName: document.querySelector("#full-name"),
  whatsappNumber: document.querySelector("#whatsapp-number"),
  companyName: document.querySelector("#company-name"),
  domicile: document.querySelector("#domicile"),
  activeModuleLabel: document.querySelector("#active-module-label"),
  sessionDate: document.querySelector("#session-date"),
  testSession: document.querySelector("#test-session"),
  testTheme: document.querySelector("#test-theme"),
  startButton: document.querySelector("#start-button"),
  bankStatus: document.querySelector("#bank-status"),
  quizPanel: document.querySelector("#quiz-panel"),
  confirmPanel: document.querySelector("#confirm-panel"),
  resultPanel: document.querySelector("#result-panel"),
  quizForm: document.querySelector("#quiz-form"),
  questionCount: document.querySelector("#question-count"),
  questionModule: document.querySelector("#question-module"),
  timerDisplay: document.querySelector("#timer-display"),
  questionText: document.querySelector("#question-text"),
  answerOptions: document.querySelector("#answer-options"),
  backButton: document.querySelector("#back-button"),
  nextButton: document.querySelector("#next-button"),
  restartButton: document.querySelector("#restart-button"),
  backToQuizButton: document.querySelector("#back-to-quiz-button"),
  submitAnswersButton: document.querySelector("#submit-answers-button"),
  closeButton: document.querySelector("#close-button"),
  answerChecklist: document.querySelector("#answer-checklist"),
  resultTitle: document.querySelector("#result-title"),
  resultSummary: document.querySelector("#result-summary"),
  durationSummary: document.querySelector("#duration-summary"),
  submitStatus: document.querySelector("#submit-status"),
  participantSummary: document.querySelector("#participant-summary"),
  reviewList: document.querySelector("#review-list"),
  message: document.querySelector("#message"),
};

window.addEventListener("DOMContentLoaded", () => {
  elements.sessionDate.textContent = `Sesi DIJAMIN tanggal ${formatLongDate(new Date())}`;
  loadQuestionsFromUrl(DEFAULT_SPREADSHEET_URL, { showQuizAfterLoad: false });
});

elements.participantForm.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!state.isQuestionBankLoaded) {
    showMessage("Bahan pemahaman masih dimuat. Coba lagi sebentar.");
    return;
  }

  state.participant = {
    fullName: elements.fullName.value.trim(),
    whatsappNumber: elements.whatsappNumber.value.trim(),
    companyName: elements.companyName.value.trim(),
    domicile: elements.domicile.value.trim(),
    testSession: elements.testSession.value,
    testTheme: elements.testTheme.value,
    testThemeLabel: getThemeLabel(elements.testTheme.value),
  };

  try {
    state.questions = normalizeQuestions(state.rows);
  } catch (error) {
    showMessage(error.message);
    return;
  }

  startQuiz();
});

elements.testTheme.addEventListener("change", () => {
  if (!state.isQuestionBankLoaded) {
    return;
  }

  try {
    state.questions = normalizeQuestions(state.rows);
    updateBankStatus();
    updateActiveModuleLabel();
  } catch (error) {
    state.questions = [];
    elements.bankStatus.textContent = error.message;
  }
});

elements.quizForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = new FormData(elements.quizForm).get("answer");

  if (!selected) {
    showMessage("Pilih satu tanggapan dulu.");
    return;
  }

  state.answers[state.currentIndex] = selected;

  if (state.currentIndex === state.questions.length - 1) {
    renderConfirmation();
    return;
  }

  state.currentIndex += 1;
  renderQuestion();
});

elements.backButton.addEventListener("click", () => {
  if (state.currentIndex > 0) {
    state.currentIndex -= 1;
    renderQuestion();
  }
});

elements.restartButton.addEventListener("click", resetToSetup);

elements.backToQuizButton.addEventListener("click", () => {
  elements.confirmPanel.classList.add("hidden");
  elements.quizPanel.classList.remove("hidden");
  renderQuestion();
});

elements.submitAnswersButton.addEventListener("click", () => {
  const unanswered = state.questions.findIndex((_, index) => !state.answers[index]);

  if (unanswered >= 0) {
    state.currentIndex = unanswered;
    showMessage(`Butir nomor ${unanswered + 1} belum diisi.`);
    elements.confirmPanel.classList.add("hidden");
    elements.quizPanel.classList.remove("hidden");
    renderQuestion();
    return;
  }

  renderResult();
});

elements.closeButton.addEventListener("click", () => {
  window.close();
  showMessage("Halaman ini bisa ditutup.");
});

function normalizeSpreadsheetUrl(input) {
  const url = new URL(input, window.location.href);

  if (url.hostname.includes("docs.google.com") && url.pathname.includes("/spreadsheets/")) {
    const publishedMatch = url.pathname.match(/\/spreadsheets\/d\/e\/([^/]+)/);
    const documentMatch = url.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    const gid = url.searchParams.get("gid") || "0";

    if (publishedMatch) {
      return `https://docs.google.com/spreadsheets/d/e/${publishedMatch[1]}/pub?gid=${gid}&single=true&output=csv`;
    }

    if (documentMatch) {
      return `https://docs.google.com/spreadsheets/d/${documentMatch[1]}/export?format=csv&gid=${gid}`;
    }
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
    throw new Error("Spreadsheet perlu memiliki baris header dan minimal satu butir.");
  }

  const headers = rows[0].map((header) => cleanKey(header));
  return rows.slice(1).map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = (values[index] || "").trim();
      return record;
    }, {}),
  );
}

function normalizeQuestions(rows) {
  const selectedTheme = elements.testTheme?.value || "";
  const selectedPrograms = state.activeThemePrograms[selectedTheme] || [];
  const availableColumns = Object.keys(rows[0] || {});
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !availableColumns.includes(column));

  if (missingColumns.length > 0) {
    throw new Error(`Kolom wajib belum ada: ${missingColumns.join(", ")}.`);
  }

  if (!availableColumns.includes("jawaban_benar") && !availableColumns.includes("kunci")) {
    throw new Error("Kolom acuan belum ada. Gunakan jawaban_benar atau kunci.");
  }

  const questions = rows
    .filter((row) => (row.status || "").trim().toUpperCase() === "AKTIF")
    .filter((row) => (row.nama_modul || "").trim() === selectedTheme)
    .map((row, index) => {
      const options = OPTION_COLUMNS.map(([letter, key]) => ({
        originalLetter: letter,
        text: row[key] || "",
      })).filter((option) => option.text);

      return {
        id: row.id_soal || `${row.kode_modul || "SOAL"}-${row.no_soal || index + 1}`,
        number: index + 1,
        text: row.pertanyaan || "",
        originalCorrectAnswer: normalizeAnswer(row.jawaban_benar || row.kunci || ""),
        options,
        moduleName: row.nama_modul || row.program || "",
        program: (row.program || "").trim().toUpperCase(),
        explanation: row.pembahasan || "",
      };
    })
    .filter((question) => question.text && question.options.length >= 2);

  if (questions.length === 0) {
    throw new Error("Tidak ada bahan pemahaman aktif untuk tema yang dipilih.");
  }

  const invalid = questions.find(
    (question) => !question.options.some((option) => option.originalLetter === question.originalCorrectAnswer),
  );

  if (invalid) {
    throw new Error(`Acuan untuk butir nomor ${invalid.number} tidak cocok dengan opsi.`);
  }

  return selectBalancedQuestions(questions, selectedPrograms).map((question, index) => {
    const shuffledOptions = shuffleArray(question.options).map((option, optionIndex) => ({
      ...option,
      letter: OPTION_COLUMNS[optionIndex][0],
    }));
    const correctOption = shuffledOptions.find(
      (option) => option.originalLetter === question.originalCorrectAnswer,
    );

    return {
      ...question,
      number: index + 1,
      correctAnswer: correctOption.letter,
      correctAnswerText: correctOption.text,
      options: shuffledOptions,
    };
  });
}

function selectBalancedQuestions(questions, selectedPrograms) {
  const programs = selectedPrograms.length
    ? selectedPrograms
    : [...new Set(questions.map((question) => question.program).filter(Boolean))];
  const groups = programs.map((program) => ({
    program,
    questions: shuffleArray(questions.filter((question) => question.program === program)),
  }));
  const baseQuota = Math.floor(MAX_ACTIVE_QUESTIONS / groups.length);
  let remainder = MAX_ACTIVE_QUESTIONS % groups.length;
  const selected = [];

  groups.forEach((group) => {
    const quota = baseQuota + (remainder > 0 ? 1 : 0);
    remainder -= 1;
    selected.push(...group.questions.slice(0, quota));
  });

  if (selected.length < MAX_ACTIVE_QUESTIONS) {
    const selectedIds = new Set(selected.map((question) => question.id));
    const leftovers = shuffleArray(
      questions.filter((question) => !selectedIds.has(question.id)),
    ).slice(0, MAX_ACTIVE_QUESTIONS - selected.length);
    selected.push(...leftovers);
  }

  return shuffleArray(selected).slice(0, MAX_ACTIVE_QUESTIONS);
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  const selectedAnswer = state.answers[state.currentIndex];

  elements.questionCount.textContent = `Butir ${state.currentIndex + 1} dari ${state.questions.length}`;
  elements.questionModule.textContent = question.moduleName;
  elements.questionText.textContent = question.text;
  elements.backButton.disabled = state.currentIndex === 0;
  elements.nextButton.textContent =
    state.currentIndex === state.questions.length - 1 ? "Lihat Ringkasan" : "Lanjut";

  elements.answerOptions.innerHTML = "";

  question.options.forEach((option) => {
    const label = document.createElement("label");
    label.className = "option-card";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "answer";
    input.value = option.letter;
    input.checked = selectedAnswer === option.letter;

    const text = document.createElement("span");
    text.innerHTML = `<span class="option-letter">${option.letter}.</span> ${escapeHtml(option.text)}`;

    label.append(input, text);
    elements.answerOptions.append(label);
  });
}

function renderConfirmation() {
  elements.quizPanel.classList.add("hidden");
  elements.confirmPanel.classList.remove("hidden");
  elements.answerChecklist.innerHTML = "";

  state.questions.forEach((question, index) => {
    const selected = state.answers[index];
    const item = document.createElement("li");
    item.className = selected ? "" : "missing";
    item.innerHTML = selected
      ? `<span class="answer-icon" aria-hidden="true">✓</span><span><span class="sr-only">Terisi</span>Butir ${index + 1}: ${escapeHtml(selected)}</span>`
      : `<span class="answer-icon" aria-hidden="true">-</span><span><span class="sr-only">Belum diisi</span>Butir ${index + 1}</span>`;
    elements.answerChecklist.append(item);
  });
}

function renderResult() {
  stopTimer();
  const score = calculateScore();
  const pointScore = score.correct * 10;

  elements.confirmPanel.classList.add("hidden");
  elements.quizPanel.classList.add("hidden");
  elements.resultPanel.classList.remove("hidden");
  elements.resultTitle.textContent = `${pointScore} poin`;
  elements.submitStatus.textContent = "Menyimpan refleksi...";
  elements.participantSummary.innerHTML = `
    <p><strong>Nama:</strong> ${escapeHtml(state.participant.fullName)}</p>
    <p><strong>Nomor WA:</strong> ${escapeHtml(state.participant.whatsappNumber)}</p>
    <p><strong>Perusahaan:</strong> ${escapeHtml(state.participant.companyName || "-")}</p>
    <p><strong>Kota Domisili:</strong> ${escapeHtml(state.participant.domicile)}</p>
    <p><strong>Sesi:</strong> ${escapeHtml(state.participant.testSession)}</p>
    <p><strong>Tema:</strong> ${escapeHtml(state.participant.testThemeLabel)}</p>
  `;
  elements.resultSummary.textContent = `${score.correct} dari ${state.questions.length} tanggapan sesuai acuan. Nilai pemahaman ${pointScore} dari 100 poin.`;
  elements.durationSummary.textContent = `Lama pengerjaan: ${formatDuration(state.durationSeconds)}.`;
  elements.reviewList.innerHTML = "";

  state.questions.forEach((question, index) => {
    const userAnswer = state.answers[index];
    const isCorrect = userAnswer === question.correctAnswer;
    const item = document.createElement("article");
    item.className = `review-item${isCorrect ? "" : " wrong"}`;
    item.innerHTML = `
      <p class="review-question">${question.number}. ${escapeHtml(question.text)}</p>
      <p class="review-meta">Pilihan Anda: ${userAnswer || "-"} - ${escapeHtml(getAnswerText(question, userAnswer) || "-")}</p>
      <p class="review-meta">Acuan: ${question.correctAnswer} - ${escapeHtml(question.correctAnswerText || "-")}</p>
      ${question.explanation ? `<p class="review-meta"><strong>Pembahasan:</strong> ${escapeHtml(question.explanation)}</p>` : ""}
    `;
    elements.reviewList.append(item);
  });

  submitResult({ score: pointScore, correct: score.correct, percentage: pointScore });
}

function calculateScore() {
  const correct = state.questions.reduce((total, question, index) => {
    return total + (state.answers[index] === question.correctAnswer ? 1 : 0);
  }, 0);

  return { correct };
}

async function submitResult(result) {
  if (!RESPONSE_ENDPOINT_URL) {
    elements.submitStatus.textContent = "Perekaman ke spreadsheet belum aktif.";
    return;
  }

  const payload = {
    submittedAt: new Date().toISOString(),
    participant: state.participant,
    score: result.score,
    correctAnswers: result.correct,
    totalQuestions: state.questions.length,
    percentage: result.percentage,
    durationSeconds: state.durationSeconds,
    durationText: formatDuration(state.durationSeconds),
    startedAt: state.startedAt ? state.startedAt.toISOString() : "",
    finishedAt: state.finishedAt ? state.finishedAt.toISOString() : "",
    testSession: state.participant.testSession,
    testTheme: state.participant.testThemeLabel,
    answers: state.questions.map((question, index) => ({
      order: index + 1,
      questionId: question.id,
      questionNumber: question.number,
      moduleName: question.moduleName,
      question: question.text,
      selectedAnswer: state.answers[index] || "",
      selectedAnswerText:
        question.options.find((option) => option.letter === state.answers[index])?.text || "",
      correctAnswer: question.correctAnswer,
      correctAnswerText: question.correctAnswerText || "",
      originalCorrectAnswer: question.originalCorrectAnswer,
      isCorrect: state.answers[index] === question.correctAnswer,
    })),
  };

  try {
    await fetch(RESPONSE_ENDPOINT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(payload),
    });

    elements.submitStatus.textContent = "Refleksi dikirim ke spreadsheet.";
  } catch (error) {
    elements.submitStatus.textContent = "Refleksi belum berhasil dikirim.";
  }
}

function resetToSetup() {
  stopTimer();
  state.currentIndex = 0;
  state.answers = {};
  state.participant = null;
  elements.confirmPanel.classList.add("hidden");
  elements.quizPanel.classList.add("hidden");
  elements.resultPanel.classList.add("hidden");
  elements.participantPanel.classList.remove("hidden");
}

function startQuiz() {
  startTimer();
  state.currentIndex = 0;
  state.answers = {};
  elements.participantPanel.classList.add("hidden");
  elements.confirmPanel.classList.add("hidden");
  elements.resultPanel.classList.add("hidden");
  elements.quizPanel.classList.remove("hidden");
  renderQuestion();
}

function startTimer() {
  stopTimer();
  state.startedAt = new Date();
  state.finishedAt = null;
  state.durationSeconds = 0;
  elements.timerDisplay.textContent = formatClock(0);
  state.timerId = window.setInterval(updateTimerDisplay, 1000);
}

function updateTimerDisplay() {
  if (!state.startedAt) {
    return;
  }

  state.durationSeconds = Math.floor((Date.now() - state.startedAt.getTime()) / 1000);
  elements.timerDisplay.textContent = formatClock(state.durationSeconds);
}

function stopTimer() {
  if (state.timerId) {
    window.clearInterval(state.timerId);
    state.timerId = null;
  }

  if (state.startedAt && !state.finishedAt) {
    state.finishedAt = new Date();
    state.durationSeconds = Math.floor((state.finishedAt.getTime() - state.startedAt.getTime()) / 1000);
  }
}

async function loadQuestionsFromUrl(url, options = {}) {
  const { showQuizAfterLoad = false } = options;
  setLoading(true);

  try {
    const csvUrl = normalizeSpreadsheetUrl(url);
    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(`Spreadsheet tidak bisa dibaca (${response.status}).`);
    }

    const csvText = await response.text();
    const rows = parseCsv(csvText);

    state.rows = rows;
    populateThemeOptions(rows);
    state.questions = normalizeQuestions(rows);
    state.currentIndex = 0;
    state.answers = {};
    state.isQuestionBankLoaded = true;
    updateBankStatus();

    if (showQuizAfterLoad) {
      startQuiz();
    }

    showMessage(`${state.questions.length} butir berhasil dimuat.`);
  } catch (error) {
    state.isQuestionBankLoaded = false;
    elements.bankStatus.textContent = "Bahan pemahaman belum bisa dimuat.";
    showMessage(error.message || "Gagal memuat spreadsheet.");
  } finally {
    setLoading(false);
  }
}

function updateBankStatus() {
  elements.bankStatus.textContent = "";
}

function populateThemeOptions(rows) {
  const activeModules = rows
    .filter((row) => (row.status || "").trim().toUpperCase() === "AKTIF")
    .reduce((modules, row) => {
      const moduleName = (row.nama_modul || "").trim();
      const program = (row.program || "").trim().toUpperCase();

      if (!moduleName) {
        return modules;
      }

      if (!modules.has(moduleName)) {
        modules.set(moduleName, new Set());
      }

      if (program) {
        modules.get(moduleName).add(program);
      }

      return modules;
    }, new Map());
  const options = [...activeModules.entries()]
    .map(([moduleName, programs]) => ({
      value: moduleName,
      label: moduleName,
      programs: [...programs],
    }))
    .sort((first, second) => first.label.localeCompare(second.label, "id"));

  state.activeThemePrograms = {};
  elements.testTheme.innerHTML = "";

  options.forEach((option) => {
    state.activeThemePrograms[option.value] = option.programs;
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    elements.testTheme.append(item);
  });

  elements.testTheme.disabled = options.length === 0;
  updateActiveModuleLabel();
}

function getThemeLabel(value) {
  return elements.testTheme.selectedOptions[0]?.textContent || value;
}

function setLoading(isLoading) {
  elements.startButton.disabled = isLoading;
  elements.startButton.textContent = isLoading ? "Memuat Bahan..." : "Yuk Mulai";
}

function updateActiveModuleLabel() {
  elements.activeModuleLabel.textContent = getThemeLabel(elements.testTheme.value) || "Modul aktif";
}

function showMessage(text) {
  elements.message.textContent = text;
  elements.message.classList.remove("hidden");
  window.clearTimeout(showMessage.timeout);
  showMessage.timeout = window.setTimeout(() => {
    elements.message.classList.add("hidden");
  }, 4200);
}

function cleanKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeAnswer(value) {
  return value.trim().toUpperCase().replace(/[^A-E]/g, "").slice(0, 1);
}

function getAnswerText(question, letter) {
  return question.options.find((option) => option.letter === letter)?.text || "";
}

function shuffleArray(items) {
  const shuffled = [...items];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }

  return shuffled;
}

function formatClock(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatDuration(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} detik`;
  }

  return `${minutes} menit ${seconds} detik`;
}

function formatLongDate(date) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
