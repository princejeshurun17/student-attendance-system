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

// ---- Mock Data Generator (run manually from editor) ----

function generateMockData() {
  var ss = getSpreadsheet();
  var logSheet = ss.getSheetByName("AttendanceLog");
  var regSheet = ss.getSheetByName("StudentRegistry");

  if (!logSheet || !regSheet) {
    Logger.log("Error: Run setupSheets() first.");
    return;
  }

  // === STUDENT REGISTRY ===
  var students = [
    ["A1B2C3D4", "Ahmad Rizal",      "21001001", "CS301-A"],
    ["E5F6A7B8", "Siti Nurhaliza",   "21001002", "CS301-A"],
    ["C9D0E1F2", "Lim Wei Jie",      "21001003", "CS301-A"],
    ["12345678", "Priya Sharma",      "21001004", "CS301-B"],
    ["AABBCCDD", "Muhammad Aiman",    "21001005", "CS301-B"],
    ["11223344", "Tan Mei Ling",      "21001006", "CS301-B"],
    ["55667788", "Raj Kumar",         "21001007", "CS302-A"],
    ["99AABB00", "Nurul Izzah",       "21001008", "CS302-A"],
    ["DDEEFF11", "Jason Ong",         "21001009", "CS302-A"],
    ["22334455", "Fatimah Zahra",     "21001010", "CS302-B"],
    ["66778899", "David Lee",         "21001011", "CS302-B"],
    ["AABB1122", "Aisyah Rahman",     "21001012", "CS302-B"],
    ["CCDD3344", "Kevin Tan",         "21001013", "CS303-A"],
    ["EEFF5566", "Sarah Abdullah",    "21001014", "CS303-A"],
    ["77889900", "Chen Wei",          "21001015", "CS303-A"]
  ];

  // Clear existing registry data (keep header)
  if (regSheet.getLastRow() > 1) {
    regSheet.getRange(2, 1, regSheet.getLastRow() - 1, 4).clear();
  }
  regSheet.getRange(2, 1, students.length, 4).setValues(students);

  // === ATTENDANCE LOG ===
  // Generate 21 days of data (3 weeks, weekdays only)
  var rows = [];
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - 25); // Start 25 days ago

  // Attendance probability per student (some students attend more than others)
  var attendanceRate = [0.95, 0.90, 0.85, 0.80, 0.75, 0.90, 0.70, 0.85, 0.60, 0.95, 0.50, 0.88, 0.78, 0.92, 0.65];

  var baseRSSI = -55;
  var baseHeap = 200000;
  var scanCounter = 0;

  for (var day = 0; day < 30; day++) {
    var currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    // Skip weekends
    var dow = currentDate.getDay();
    if (dow === 0 || dow === 6) continue;

    var dateStr = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "yyyy-MM-dd");

    for (var s = 0; s < students.length; s++) {
      // Decide if student attends today
      if (Math.random() > attendanceRate[s]) continue;

      scanCounter++;

      // Random arrival time: 7:30 AM to 9:15 AM (most between 8:00-8:30)
      var hour = 8;
      var minute = Math.floor(Math.random() * 60);
      var arrivalRand = Math.random();
      if (arrivalRand < 0.15) {
        hour = 7; minute = 30 + Math.floor(Math.random() * 30); // 7:30-7:59
      } else if (arrivalRand < 0.75) {
        hour = 8; minute = Math.floor(Math.random() * 30);       // 8:00-8:29
      } else if (arrivalRand < 0.90) {
        hour = 8; minute = 30 + Math.floor(Math.random() * 30); // 8:30-8:59
      } else {
        hour = 9; minute = Math.floor(Math.random() * 15);       // 9:00-9:14
      }

      var timestamp = new Date(currentDate);
      timestamp.setHours(hour, minute, Math.floor(Math.random() * 60));

      var timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm:ss");

      // Device metrics with slight variation
      var rssi = baseRSSI + Math.floor(Math.random() * 20 - 10);    // -65 to -45
      var uptime = 3600 + scanCounter * 5 + Math.floor(Math.random() * 100);
      var freeHeap = baseHeap - Math.floor(Math.random() * 30000);   // 170k-200k

      rows.push([
        timestamp,
        dateStr,
        timeStr,
        students[s][0],  // UID
        students[s][1],  // Name
        rssi,
        uptime,
        scanCounter,
        freeHeap
      ]);
    }
  }

  // Sort by timestamp
  rows.sort(function(a, b) { return a[0] - b[0]; });

  // Clear existing log data (keep header)
  if (logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).clear();
  }

  // Write all at once (much faster than appendRow in a loop)
  if (rows.length > 0) {
    logSheet.getRange(2, 1, rows.length, 9).setValues(rows);
  }

  Logger.log("Mock data generated: " + students.length + " students, " + rows.length + " attendance records across ~3 weeks.");
}
