const RESPONSE_SHEET_NAME = "jawaban";

function doGet(event) {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const requestedSheetName = event?.parameter?.sheet || RESPONSE_SHEET_NAME;
  const sheet =
    requestedSheetName === RESPONSE_SHEET_NAME
      ? getOrCreateResponseSheet_(spreadsheet)
      : spreadsheet.getSheetByName(requestedSheetName);

  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ rows: [] }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const rows = sheetToObjects_(sheet);

  return ContentService.createTextOutput(JSON.stringify({ rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(event) {
  const payload = JSON.parse(event.postData.contents || "{}");
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateResponseSheet_(spreadsheet);

  sheet.appendRow([
    new Date(),
    payload.participant?.fullName || "",
    payload.participant?.whatsappNumber || "",
    payload.participant?.companyName || "",
    payload.participant?.domicile || "",
    payload.testSession || payload.participant?.testSession || "",
    payload.testTheme || payload.participant?.testThemeLabel || "",
    payload.durationSeconds || 0,
    payload.durationText || "",
    payload.startedAt || "",
    payload.finishedAt || "",
    payload.score || 0,
    payload.totalQuestions || 0,
    payload.percentage || 0,
    JSON.stringify(payload.answers || []),
  ]);

  return ContentService.createTextOutput(JSON.stringify({ ok: true })).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getOrCreateResponseSheet_(spreadsheet) {
  const sheet =
    spreadsheet.getSheetByName(RESPONSE_SHEET_NAME) || spreadsheet.insertSheet(RESPONSE_SHEET_NAME);
  const headers = [
    "timestamp",
    "nama_lengkap",
    "nomor_wa",
    "nama_perusahaan",
    "kota_domisili",
    "sesi",
    "tema",
    "lama_pengerjaan_detik",
    "lama_pengerjaan",
    "mulai_pengerjaan",
    "selesai_pengerjaan",
    "skor",
    "jumlah_soal",
    "persentase",
    "detail_jawaban",
  ];

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sheet;
}

function sheetToObjects_(sheet) {
  const values = sheet.getDataRange().getValues();

  if (values.length < 2) {
    return [];
  }

  const headers = values[0].map(function (header) {
    return String(header || "").trim();
  });

  return values.slice(1).map(function (row) {
    return headers.reduce(function (record, header, index) {
      const value = row[index];
      record[header] = value instanceof Date ? value.toISOString() : value;
      return record;
    }, {});
  });
}
