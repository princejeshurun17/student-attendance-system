// ==============================================
// RFID Attendance System — Google Apps Script
// ==============================================
// Sheets: AttendanceLog (auto), StudentRegistry (manual)
//
// SETUP:
// 1. Paste this into Extensions > Apps Script
// 2. Run setupSheets() ONCE from the editor (▶ button)
// 3. Deploy > New Deployment > Web App
//    - Execute as: Me
//    - Who has access: Anyone
// 4. Copy the Web App URL into your ESP32 code
// 5. Manually add students to the "StudentRegistry" sheet

// ---- Entry Points ----

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

// ---- Core Handler ----

function handleRequest(e) {
  var lock = LockService.getScriptLock();
  lock.tryLock(10000);

  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var logSheet = ss.getSheetByName("AttendanceLog");
    var regSheet = ss.getSheetByName("StudentRegistry");

    if (!logSheet || !regSheet) {
      return jsonResponse({ result: "error", message: "Run setupSheets() first!" });
    }

    // --- Parse Parameters ---
    var uid      = e.parameter.uid       || "";
    var rssi     = e.parameter.rssi      || "";
    var uptime   = e.parameter.uptime    || "";
    var scanNum  = e.parameter.scanCount || "";
    var freeHeap = e.parameter.freeHeap  || "";

    if (!uid) {
      return jsonResponse({ result: "error", message: "No UID provided" });
    }

    // --- Timestamp ---
    var now  = new Date();
    var date = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
    var time = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");

    // --- Lookup Student Name ---
    var name = lookupName(regSheet, uid);

    // --- Append to AttendanceLog ---
    logSheet.appendRow([
      now,          // A: Timestamp
      date,         // B: Date
      time,         // C: Time
      uid,          // D: UID
      name,         // E: Name
      rssi,         // F: WiFi RSSI
      uptime,       // G: Uptime (s)
      scanNum,      // H: Scan #
      freeHeap      // I: Free Heap
    ]);

    // --- Response for ESP32 OLED ---
    return jsonResponse({
      result: "success",
      name: name,
      time: time
    });

  } catch (err) {
    return jsonResponse({ result: "error", error: err.toString() });
  } finally {
    lock.releaseLock();
  }
}

// ---- Helpers ----

function lookupName(regSheet, uid) {
  var data = regSheet.getDataRange().getValues();
  // Column A = UID, Column B = Name (skip header row)
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).toUpperCase() === uid.toUpperCase()) {
      return data[i][1]; // Name
    }
  }
  return "Unknown";
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---- One-Time Setup (run manually from editor) ----

function setupSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- AttendanceLog ---
  var log = ss.getSheetByName("AttendanceLog");
  if (!log) {
    log = ss.insertSheet("AttendanceLog");
  }
  var logHeaders = ["Timestamp", "Date", "Time", "UID", "Name", "WiFi RSSI", "Uptime (s)", "Scan #", "Free Heap"];
  log.getRange(1, 1, 1, logHeaders.length).setValues([logHeaders]);
  log.setFrozenRows(1);
  log.getRange(1, 1, 1, logHeaders.length).setFontWeight("bold");

  // --- StudentRegistry ---
  var reg = ss.getSheetByName("StudentRegistry");
  if (!reg) {
    reg = ss.insertSheet("StudentRegistry");
  }
  var regHeaders = ["UID", "Name", "Student ID", "Class/Section"];
  reg.getRange(1, 1, 1, regHeaders.length).setValues([regHeaders]);
  reg.setFrozenRows(1);
  reg.getRange(1, 1, 1, regHeaders.length).setFontWeight("bold");

  SpreadsheetApp.getUi().alert("Setup complete! Add students to the StudentRegistry sheet.");
}
