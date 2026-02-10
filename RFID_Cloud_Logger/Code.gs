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

// ---- PASTE YOUR GOOGLE SHEET URL BELOW ----
var SHEET_URL = "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit";

function getSpreadsheet() {
  return SpreadsheetApp.openByUrl(SHEET_URL);
}

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
    var ss = getSpreadsheet();
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
  var ss = getSpreadsheet();

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

  Logger.log("Setup complete! Add students to the StudentRegistry sheet.");
}

// ---- Dashboard Builder (run manually from editor) ----

function setupDashboard() {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("AttendanceLog");
  if (!logSheet) {
    Logger.log("Error: Run setupSheets() first.");
    return;
  }

  // Create or clear Dashboard sheet
  var dash = ss.getSheetByName("Dashboard");
  if (dash) {
    dash.clear();
    // Remove existing charts
    var existingCharts = dash.getCharts();
    for (var i = 0; i < existingCharts.length; i++) {
      dash.removeChart(existingCharts[i]);
    }
  } else {
    dash = ss.insertSheet("Dashboard");
  }

  // ==============================
  // SECTION 1: Summary Scorecards
  // ==============================
  dash.getRange("A1").setValue("📊 ATTENDANCE DASHBOARD").setFontSize(16).setFontWeight("bold");
  dash.getRange("A1:F1").merge();

  // Labels (Row 3)
  var labels = ["Total Scans", "Unique Students", "Today's Check-ins", "Last Scan Time", "Avg WiFi RSSI"];
  dash.getRange(3, 1, 1, labels.length).setValues([labels]).setFontWeight("bold").setBackground("#4285F4").setFontColor("white");

  // Formulas (Row 4)
  var formulas = [
    '=COUNTA(AttendanceLog!D:D)-1',
    '=IFERROR(COUNTUNIQUE(AttendanceLog!D2:D), 0)',
    '=COUNTIFS(AttendanceLog!B:B, TEXT(TODAY(),"yyyy-mm-dd"))',
    '=IFERROR(INDEX(AttendanceLog!A:A, COUNTA(AttendanceLog!A:A)), "No data")',
    '=IFERROR(AVERAGE(AttendanceLog!F2:F), "N/A")'
  ];
  for (var i = 0; i < formulas.length; i++) {
    dash.getRange(4, i + 1).setFormula(formulas[i]).setFontSize(14).setFontWeight("bold");
  }

  // Column widths
  dash.setColumnWidth(1, 150);
  dash.setColumnWidth(2, 150);
  dash.setColumnWidth(3, 150);
  dash.setColumnWidth(4, 200);
  dash.setColumnWidth(5, 150);

  // ==============================
  // SECTION 2: Attendance by Date
  // ==============================
  // Helper table: Row 7+
  dash.getRange("A7").setValue("📈 Daily Attendance (auto-generated from data)").setFontWeight("bold");
  dash.getRange("A8").setValue("Date").setFontWeight("bold").setBackground("#E8EAED");
  dash.getRange("B8").setValue("Count").setFontWeight("bold").setBackground("#E8EAED");
  dash.getRange("A9").setFormula('=IFERROR(SORT(UNIQUE(AttendanceLog!B2:B)), "")');
  // Fill count formulas for up to 100 rows
  for (var r = 9; r <= 108; r++) {
    dash.getRange(r, 2).setFormula('=IF(A' + r + '="","",COUNTIF(AttendanceLog!B:B,A' + r + '))');
  }

  // Chart 1: Daily Attendance Line
  var chart1 = dash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dash.getRange("A8:B108"))
    .setPosition(7, 4, 0, 0) // Row 7, Col D
    .setOption("title", "Daily Attendance Trend")
    .setOption("hAxis.title", "Date")
    .setOption("vAxis.title", "Check-ins")
    .setOption("legend.position", "none")
    .setOption("colors", ["#4285F4"])
    .setOption("width", 500)
    .setOption("height", 300)
    .build();
  dash.insertChart(chart1);

  // ==============================
  // SECTION 3: Top Attendees
  // ==============================
  dash.getRange("A25").setValue("🏆 Top Attendees").setFontWeight("bold");
  dash.getRange("A26").setValue("Name").setFontWeight("bold").setBackground("#E8EAED");
  dash.getRange("B26").setValue("Scans").setFontWeight("bold").setBackground("#E8EAED");
  // QUERY to count by name, sorted desc
  dash.getRange("A27").setFormula(
    '=IFERROR(QUERY(AttendanceLog!E2:E, "SELECT E, COUNT(E) WHERE E IS NOT NULL GROUP BY E ORDER BY COUNT(E) DESC LABEL COUNT(E) \'Scans\'"), "")'
  );

  // Chart 2: Top Attendees Bar
  var chart2 = dash.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dash.getRange("A26:B46"))
    .setPosition(25, 4, 0, 0)
    .setOption("title", "Scans by Student")
    .setOption("legend.position", "none")
    .setOption("colors", ["#34A853"])
    .setOption("width", 500)
    .setOption("height", 300)
    .build();
  dash.insertChart(chart2);

  // ==============================
  // SECTION 4: Hourly Distribution
  // ==============================
  dash.getRange("A43").setValue("🕐 Hourly Check-in Distribution").setFontWeight("bold");
  dash.getRange("A44").setValue("Hour").setFontWeight("bold").setBackground("#E8EAED");
  dash.getRange("B44").setValue("Count").setFontWeight("bold").setBackground("#E8EAED");
  // Hours 0-23
  for (var h = 0; h <= 23; h++) {
    dash.getRange(45 + h, 1).setValue(h + ":00");
    dash.getRange(45 + h, 2).setFormula(
      '=COUNTIF(ARRAYFORMULA(IF(AttendanceLog!C2:C<>"",HOUR(AttendanceLog!C2:C),"")), ' + h + ')'
    );
  }

  // Chart 3: Hourly Column
  var chart3 = dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange("A44:B68"))
    .setPosition(43, 4, 0, 0)
    .setOption("title", "Check-ins by Hour of Day")
    .setOption("hAxis.title", "Hour")
    .setOption("vAxis.title", "Count")
    .setOption("legend.position", "none")
    .setOption("colors", ["#FBBC04"])
    .setOption("width", 500)
    .setOption("height", 300)
    .build();
  dash.insertChart(chart3);

  // ==============================
  // SECTION 5: Device Health
  // ==============================
  dash.getRange("A70").setValue("📡 Device WiFi Signal").setFontWeight("bold");

  // Chart 4: WiFi RSSI over time
  var chart4 = dash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(logSheet.getRange("A1:A"))  // Timestamp
    .addRange(logSheet.getRange("F1:F"))  // RSSI
    .setPosition(71, 1, 0, 0)
    .setOption("title", "WiFi Signal Strength (RSSI) Over Time")
    .setOption("hAxis.title", "Time")
    .setOption("vAxis.title", "RSSI (dBm)")
    .setOption("legend.position", "none")
    .setOption("colors", ["#EA4335"])
    .setOption("width", 800)
    .setOption("height", 300)
    .build();
  dash.insertChart(chart4);

  Logger.log("Dashboard created with 4 charts and summary scorecards.");
}
