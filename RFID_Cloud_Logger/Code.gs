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

  // --- Read all attendance data ---
  var lastRow = logSheet.getLastRow();
  if (lastRow < 2) {
    Logger.log("No attendance data found. Generate mock data first.");
    return;
  }
  var allData = logSheet.getRange(2, 1, lastRow - 1, 9).getValues();
  // Columns: 0=Timestamp, 1=Date, 2=Time, 3=UID, 4=Name, 5=RSSI, 6=Uptime, 7=Scan#, 8=FreeHeap

  // --- Create or clear Dashboard ---
  var dash = ss.getSheetByName("Dashboard");
  if (dash) {
    dash.clear();
    var existingCharts = dash.getCharts();
    for (var i = 0; i < existingCharts.length; i++) {
      dash.removeChart(existingCharts[i]);
    }
  } else {
    dash = ss.insertSheet("Dashboard");
  }

  // Widen columns
  dash.setColumnWidth(1, 180);
  dash.setColumnWidth(2, 120);
  dash.setColumnWidth(3, 120);
  dash.setColumnWidth(4, 120);
  dash.setColumnWidth(5, 120);
  dash.setColumnWidth(6, 120);

  // =========================================
  //  ROW 1: Title
  // =========================================
  dash.getRange("A1").setValue("📊 ATTENDANCE DASHBOARD").setFontSize(16).setFontWeight("bold");
  dash.getRange("A2").setValue("Last refreshed: " + new Date().toString()).setFontColor("#888888");

  // =========================================
  //  ROW 4-5: Summary Scorecards
  // =========================================
  var totalScans = allData.length;
  var uniqueUIDs = {};
  var todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  var todayCount = 0;
  var lastScanTime = allData[allData.length - 1][0];
  var rssiSum = 0;
  var rssiCount = 0;

  for (var i = 0; i < allData.length; i++) {
    uniqueUIDs[allData[i][3]] = true;
    if (String(allData[i][1]) === todayStr) todayCount++;
    var r = Number(allData[i][5]);
    if (!isNaN(r) && r !== 0) { rssiSum += r; rssiCount++; }
  }
  var uniqueCount = Object.keys(uniqueUIDs).length;
  var avgRSSI = rssiCount > 0 ? Math.round(rssiSum / rssiCount) : "N/A";

  var labels = ["Total Scans", "Unique Students", "Today's Check-ins", "Last Scan", "Avg RSSI (dBm)"];
  var values = [totalScans, uniqueCount, todayCount, lastScanTime, avgRSSI];

  dash.getRange(4, 1, 1, 5).setValues([labels]).setFontWeight("bold").setBackground("#4285F4").setFontColor("white");
  dash.getRange(5, 1, 1, 5).setValues([values]).setFontSize(14).setFontWeight("bold");
  dash.getRange(5, 4).setNumberFormat("yyyy-MM-dd HH:mm");

  // =========================================
  //  DATA TABLE 1: Daily Attendance (Col A-B, Row 8+)
  // =========================================
  var dailyCounts = {};
  for (var i = 0; i < allData.length; i++) {
    var d = String(allData[i][1]);
    dailyCounts[d] = (dailyCounts[d] || 0) + 1;
  }
  var dailyKeys = Object.keys(dailyCounts).sort();
  var dailyTable = [["Date", "Check-ins"]];
  for (var i = 0; i < dailyKeys.length; i++) {
    dailyTable.push([dailyKeys[i], dailyCounts[dailyKeys[i]]]);
  }

  dash.getRange("A7").setValue("📈 Daily Attendance").setFontWeight("bold");
  dash.getRange(8, 1, dailyTable.length, 2).setValues(dailyTable);
  dash.getRange(8, 1, 1, 2).setFontWeight("bold").setBackground("#E8EAED");

  var dailyEndRow = 8 + dailyTable.length - 1;

  // CHART 1: Daily Attendance Line
  var chart1 = dash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dash.getRange(8, 1, dailyTable.length, 2))
    .setNumHeaders(1)
    .setOption("useFirstColumnAsDomain", true)
    .setPosition(7, 4, 0, 0)
    .setOption("title", "Daily Attendance Trend")
    .setOption("hAxis", {title: "Date", slantedText: true, slantedTextAngle: 45})
    .setOption("vAxis", {title: "Check-ins", minValue: 0})
    .setOption("legend", {position: "none"})
    .setOption("colors", ["#4285F4"])
    .setOption("curveType", "function")
    .setOption("pointSize", 5)
    .setOption("width", 600)
    .setOption("height", 350)
    .build();
  dash.insertChart(chart1);

  // =========================================
  //  DATA TABLE 2: Top Attendees (Col A-B, Row dailyEndRow+3)
  // =========================================
  var nameTable2Start = dailyEndRow + 3;

  var nameCounts = {};
  for (var i = 0; i < allData.length; i++) {
    var n = String(allData[i][4]);
    if (n && n !== "Unknown") nameCounts[n] = (nameCounts[n] || 0) + 1;
  }
  // Sort by count desc
  var nameKeys = Object.keys(nameCounts).sort(function(a, b) { return nameCounts[b] - nameCounts[a]; });
  var nameTableData = [["Student Name", "Total Scans"]];
  for (var i = 0; i < nameKeys.length; i++) {
    nameTableData.push([nameKeys[i], nameCounts[nameKeys[i]]]);
  }

  dash.getRange(nameTable2Start - 1, 1).setValue("🏆 Top Attendees").setFontWeight("bold");
  dash.getRange(nameTable2Start, 1, nameTableData.length, 2).setValues(nameTableData);
  dash.getRange(nameTable2Start, 1, 1, 2).setFontWeight("bold").setBackground("#E8EAED");

  // CHART 2: Top Attendees Bar
  var chart2 = dash.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(dash.getRange(nameTable2Start, 1, nameTableData.length, 2))
    .setNumHeaders(1)
    .setOption("useFirstColumnAsDomain", true)
    .setPosition(nameTable2Start - 1, 4, 0, 0)
    .setOption("title", "Scans per Student")
    .setOption("hAxis", {title: "Total Scans", minValue: 0})
    .setOption("vAxis", {title: ""})
    .setOption("legend", {position: "none"})
    .setOption("colors", ["#34A853"])
    .setOption("width", 600)
    .setOption("height", 400)
    .build();
  dash.insertChart(chart2);

  // =========================================
  //  DATA TABLE 3: Hourly Distribution (Col D-E, Row nameTable2Start + nameTableData.length + 3)
  // =========================================
  var hourlyStart = nameTable2Start + nameTableData.length + 3;

  var hourCounts = {};
  for (var h = 0; h < 24; h++) hourCounts[h] = 0;
  for (var i = 0; i < allData.length; i++) {
    var ts = allData[i][0];
    if (ts instanceof Date) {
      hourCounts[ts.getHours()] = (hourCounts[ts.getHours()] || 0) + 1;
    }
  }
  var hourlyTableData = [["Hour", "Check-ins"]];
  for (var h = 0; h < 24; h++) {
    var label = (h < 10 ? "0" : "") + h + ":00";
    hourlyTableData.push([label, hourCounts[h]]);
  }

  dash.getRange(hourlyStart - 1, 1).setValue("🕐 Hourly Check-in Distribution").setFontWeight("bold");
  dash.getRange(hourlyStart, 1, hourlyTableData.length, 2).setValues(hourlyTableData);
  dash.getRange(hourlyStart, 1, 1, 2).setFontWeight("bold").setBackground("#E8EAED");

  // CHART 3: Hourly Column
  var chart3 = dash.newChart()
    .setChartType(Charts.ChartType.COLUMN)
    .addRange(dash.getRange(hourlyStart, 1, hourlyTableData.length, 2))
    .setNumHeaders(1)
    .setOption("useFirstColumnAsDomain", true)
    .setPosition(hourlyStart - 1, 4, 0, 0)
    .setOption("title", "Check-ins by Hour of Day")
    .setOption("hAxis", {title: "Hour"})
    .setOption("vAxis", {title: "Count", minValue: 0})
    .setOption("legend", {position: "none"})
    .setOption("colors", ["#FBBC04"])
    .setOption("width", 600)
    .setOption("height", 350)
    .build();
  dash.insertChart(chart3);

  // =========================================
  //  DATA TABLE 4: Attendance by Class (Col A-B, after hourly)
  // =========================================
  var classStart = hourlyStart + hourlyTableData.length + 3;

  // Need Registry for class info
  var regSheet = ss.getSheetByName("StudentRegistry");
  var uidToClass = {};
  if (regSheet && regSheet.getLastRow() > 1) {
    var regData = regSheet.getRange(2, 1, regSheet.getLastRow() - 1, 4).getValues();
    for (var i = 0; i < regData.length; i++) {
      uidToClass[String(regData[i][0]).toUpperCase()] = String(regData[i][3]); // UID -> Class
    }
  }
  var classCounts = {};
  for (var i = 0; i < allData.length; i++) {
    var cls = uidToClass[String(allData[i][3]).toUpperCase()] || "Unregistered";
    classCounts[cls] = (classCounts[cls] || 0) + 1;
  }
  var classKeys = Object.keys(classCounts).sort();
  var classTableData = [["Class/Section", "Total Scans"]];
  for (var i = 0; i < classKeys.length; i++) {
    classTableData.push([classKeys[i], classCounts[classKeys[i]]]);
  }

  dash.getRange(classStart - 1, 1).setValue("🏫 Attendance by Class").setFontWeight("bold");
  dash.getRange(classStart, 1, classTableData.length, 2).setValues(classTableData);
  dash.getRange(classStart, 1, 1, 2).setFontWeight("bold").setBackground("#E8EAED");

  // CHART 4: Attendance by Class Pie
  var chart4 = dash.newChart()
    .setChartType(Charts.ChartType.PIE)
    .addRange(dash.getRange(classStart, 1, classTableData.length, 2))
    .setNumHeaders(1)
    .setOption("useFirstColumnAsDomain", true)
    .setPosition(classStart - 1, 4, 0, 0)
    .setOption("title", "Scans by Class/Section")
    .setOption("pieHole", 0.4)
    .setOption("colors", ["#4285F4", "#34A853", "#FBBC04", "#EA4335", "#9C27B0", "#00BCD4"])
    .setOption("width", 500)
    .setOption("height", 350)
    .build();
  dash.insertChart(chart4);

  // =========================================
  //  DATA TABLE 5: WiFi RSSI over time (Col A-B, after class)
  // =========================================
  var rssiStart = classStart + classTableData.length + 3;

  // Sample every Nth row to avoid huge chart data
  var sampleInterval = Math.max(1, Math.floor(allData.length / 100));
  var rssiTableData = [["Timestamp", "RSSI (dBm)"]];
  for (var i = 0; i < allData.length; i += sampleInterval) {
    var ts = allData[i][0];
    var rssiVal = Number(allData[i][5]);
    if (ts instanceof Date && !isNaN(rssiVal)) {
      rssiTableData.push([Utilities.formatDate(ts, Session.getScriptTimeZone(), "MM/dd HH:mm"), rssiVal]);
    }
  }

  dash.getRange(rssiStart - 1, 1).setValue("📡 Device WiFi Signal Over Time").setFontWeight("bold");
  dash.getRange(rssiStart, 1, rssiTableData.length, 2).setValues(rssiTableData);
  dash.getRange(rssiStart, 1, 1, 2).setFontWeight("bold").setBackground("#E8EAED");

  // CHART 5: RSSI Line
  var chart5 = dash.newChart()
    .setChartType(Charts.ChartType.LINE)
    .addRange(dash.getRange(rssiStart, 1, rssiTableData.length, 2))
    .setNumHeaders(1)
    .setOption("useFirstColumnAsDomain", true)
    .setPosition(rssiStart - 1, 4, 0, 0)
    .setOption("title", "WiFi Signal Strength (RSSI)")
    .setOption("hAxis", {title: "Time", slantedText: true, slantedTextAngle: 45})
    .setOption("vAxis", {title: "dBm"})
    .setOption("legend", {position: "none"})
    .setOption("colors", ["#EA4335"])
    .setOption("pointSize", 3)
    .setOption("width", 600)
    .setOption("height", 300)
    .build();
  dash.insertChart(chart5);

  Logger.log("Dashboard created: 5 scorecards + 5 charts. " + totalScans + " records processed.");
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
