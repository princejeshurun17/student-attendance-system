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

  // === 1. GENERATE STUDENTS (100 students) ===
  var firstNames = ["Ahmad", "Siti", "Lim", "Priya", "Muhammad", "Tan", "Raj", "Nurul", "Jason", "Fatimah", "David", "Aisyah", "Kevin", "Sarah", "Chen", "Wei", "Mei", "John", "Kumar", "Lee"];
  var lastNames = ["Rizal", "Nurhaliza", "Wei Jie", "Sharma", "Aiman", "Mei Ling", "Kumar", "Izzah", "Ong", "Zahra", "Lee", "Rahman", "Tan", "Abdullah", "Wei", "Yiong", "Ling", "Doe", "Singh", "Chin"];
  var classes = ["CS301-A", "CS301-B", "CS302-A", "CS302-B", "CS303-A", "CS303-B", "CS304-A", "CS304-B"];
  
  var students = [];
  for (var i = 0; i < 100; i++) {
    var uid = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase();
    while (uid.length < 8) uid = "0" + uid;
    
    var fname = firstNames[Math.floor(Math.random() * firstNames.length)];
    var lname = lastNames[Math.floor(Math.random() * lastNames.length)];
    var sid = "2100" + (1000 + i);
    var cls = classes[Math.floor(Math.random() * classes.length)];
    
    students.push([uid, fname + " " + lname, sid, cls]);
  }

  // Clear & Write Registry
  if (regSheet.getLastRow() > 1) {
    regSheet.getRange(2, 1, regSheet.getLastRow() - 1, 4).clear();
  }
  regSheet.getRange(2, 1, students.length, 4).setValues(students);

  // === 2. GENERATE ATTENDANCE LOGS (~3000 records) ===
  var rows = [];
  var startDate = new Date();
  startDate.setDate(startDate.getDate() - 30); // Last 30 days

  var baseRSSI = -55;
  var baseHeap = 200000;
  var scanCounter = 0;

  // varied attendance rates
  var attendanceRates = students.map(function() { return 0.6 + Math.random() * 0.35; }); // 60% to 95%

  for (var day = 0; day < 30; day++) {
    var currentDate = new Date(startDate);
    currentDate.setDate(startDate.getDate() + day);

    // Skip weekends
    var dow = currentDate.getDay();
    if (dow === 0 || dow === 6) continue;

    var dateStr = Utilities.formatDate(currentDate, Session.getScriptTimeZone(), "yyyy-MM-dd");

    for (var s = 0; s < students.length; s++) {
      // Does student attend today?
      if (Math.random() > attendanceRates[s]) continue;

      scanCounter++;

      // Realistic Arrival Time Distribution (Bell curve-ish)
      // Target: 8:00 AM. 
      // 10% very early (7:30-7:50)
      // 40% early (7:50-8:00)
      // 30% on time (8:00-8:10)
      // 15% late (8:10-8:30)
      // 5% very late (8:30-9:30)
      
      var h, m;
      var r = Math.random();
      if (r < 0.10) { h=7; m=30 + Math.floor(Math.random()*20); }       // 7:30 - 7:49
      else if (r < 0.50) { h=7; m=50 + Math.floor(Math.random()*10); }  // 7:50 - 7:59
      else if (r < 0.80) { h=8; m=0 + Math.floor(Math.random()*10); }   // 8:00 - 8:09
      else if (r < 0.95) { h=8; m=10 + Math.floor(Math.random()*20); }  // 8:10 - 8:29
      else { h=8; m=30 + Math.floor(Math.random()*60); }                // 8:30 - 9:30 (inc. 9am)

      if (m >= 60) { h++; m -= 60; }
      
      var timestamp = new Date(currentDate);
      timestamp.setHours(h, m, Math.floor(Math.random() * 60));

      var timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "HH:mm:ss");

      // Metrics
      var rssi = baseRSSI + Math.floor(Math.random() * 30 - 15);    // -70 to -40
      var uptime = 3600 + scanCounter * 2 + Math.floor(Math.random() * 500);
      var freeHeap = baseHeap - Math.floor(Math.random() * 40000);

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

  // Sort chronologically
  rows.sort(function(a, b) { return a[0] - b[0]; });

  // Clear & Write Log
  if (logSheet.getLastRow() > 1) {
    logSheet.getRange(2, 1, logSheet.getLastRow() - 1, 9).clear();
  }
  
  // Write in chunks to avoid timeout if array is huge
  var chunkSize = 500;
  for (var i = 0; i < rows.length; i += chunkSize) {
    var chunk = rows.slice(i, i + chunkSize);
    logSheet.getRange(2 + i, 1, chunk.length, 9).setValues(chunk);
  }

  Logger.log("Generated: 100 students, " + rows.length + " attendance records.");
}
