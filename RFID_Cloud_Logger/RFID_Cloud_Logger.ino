/*
 * RFID Attendance Logger
 * Hardware: NodeMCU ESP32 (38-pin), SH1106 OLED, RC522 RFID, Buzzer
 *
 * Pinout:
 * RC522 (VSPI): SS(5), SCK(18), MOSI(23), MISO(19), RST(27)
 * OLED (I2C):   SDA(21), SCL(22)
 * Buzzer:       GPIO 4
 *
 * Sends: uid, rssi, uptime, scanCount, freeHeap
 * Receives: name, time (JSON)
 */

#include <Adafruit_GFX.h>
#include <Adafruit_SH110X.h>
#include <ArduinoJson.h> // Install via Library Manager
#include <HTTPClient.h>
#include <MFRC522.h>
#include <SPI.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <Wire.h>

// --- Configuration ---
#include "secrets.h"

// Credentials from secrets.h
const char *ssid = WIFI_SSID;
const char *password = WIFI_PASSWORD;
const char *scriptURL = WEB_APP_URL;

// --- Pins ---
#define BUZZER_PIN 4
#define SS_PIN 5
#define RST_PIN 27

// --- Objects ---
MFRC522 mfrc522(SS_PIN, RST_PIN);
Adafruit_SH1106G display = Adafruit_SH1106G(128, 64, &Wire, -1);

// --- State ---
unsigned long scanCount = 0;

void setup() {
  Serial.begin(115200);

  // Buzzer
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // OLED
  display.begin(0x3C, true);
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SH110X_WHITE);
  display.setCursor(0, 0);
  display.println("Booting...");
  display.display();

  // SPI & RFID
  SPI.begin();
  mfrc522.PCD_Init();

  // WiFi
  connectWiFi();

  // Ready
  drawIdle();
}

void loop() {
  // Check for card
  if (!mfrc522.PICC_IsNewCardPresent())
    return;
  if (!mfrc522.PICC_ReadCardSerial())
    return;

  // --- Card Detected ---
  beep(100);
  scanCount++;

  // Read UID
  String uid = "";
  for (byte i = 0; i < mfrc522.uid.size; i++) {
    if (mfrc522.uid.uidByte[i] < 0x10)
      uid += "0";
    uid += String(mfrc522.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();

  Serial.println("Scanned: " + uid);

  // Show processing
  drawProcessing(uid);

  // Send to Cloud
  sendToCloud(uid);

  // Halt
  mfrc522.PICC_HaltA();
  mfrc522.PCD_StopCrypto1();

  // Show result for 3 seconds, then back to idle
  delay(3000);
  drawIdle();
}

// =============================================
//  NETWORK
// =============================================

void connectWiFi() {
  display.clearDisplay();
  display.setCursor(0, 0);
  display.println("Connecting WiFi...");
  display.display();

  WiFi.begin(ssid, password);
  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    display.print(".");
    display.display();
    dots++;
    if (dots > 20) {
      display.clearDisplay();
      display.setCursor(0, 0);
      display.println("Still connecting...");
      display.display();
      dots = 0;
    }
  }
  Serial.println("\nWiFi OK: " + WiFi.localIP().toString());
  beep(50);
  delay(100);
  beep(50);
}

void sendToCloud(String uid) {
  if (WiFi.status() != WL_CONNECTED) {
    drawResult("No WiFi", "", "Reconnecting...");
    errorBeep();
    connectWiFi();
    return;
  }

  WiFiClientSecure client;
  client.setInsecure(); // Skip cert validation for Google redirects

  HTTPClient http;

  // Build URL with all parameters
  String url =
      String(scriptURL) + "?uid=" + uid + "&rssi=" + String(WiFi.RSSI()) +
      "&uptime=" + String(millis() / 1000) + "&scanCount=" + String(scanCount) +
      "&freeHeap=" + String(ESP.getFreeHeap());

  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.begin(client, url);
  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    Serial.println(payload);

    // Parse JSON response
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err && doc["result"] == "success") {
      const char *name = doc["name"] | "Unknown";
      const char *time = doc["time"] | "--:--";
      drawResult(name, "Checked In", time);
      beep(200);
    } else {
      drawResult("Parse Error", uid, "");
      errorBeep();
    }
  } else if (httpCode > 0) {
    Serial.println("HTTP " + String(httpCode));
    drawResult("HTTP Error", String(httpCode), "");
    errorBeep();
  } else {
    Serial.println("Request failed: " + http.errorToString(httpCode));
    drawResult("Net Error", "Failed", "");
    errorBeep();
  }

  http.end();
}

// =============================================
//  OLED UI
// =============================================

void drawIdle() {
  display.clearDisplay();

  // ---- Header Bar ----
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.print("WiFi:");
  display.print(WiFi.RSSI());
  display.print("dBm");

  // Right-align scan count
  String sc = "#" + String(scanCount);
  int16_t x1, y1;
  uint16_t w, h;
  display.getTextBounds(sc, 0, 0, &x1, &y1, &w, &h);
  display.setCursor(128 - w, 0);
  display.print(sc);

  display.drawLine(0, 10, 127, 10, SH110X_WHITE);

  // ---- Center ----
  display.setTextSize(1);
  display.setCursor(18, 28);
  display.println("Ready to Scan");

  // ---- Footer ----
  display.drawLine(0, 53, 127, 53, SH110X_WHITE);
  display.setCursor(0, 56);
  display.print("Heap:");
  display.print(ESP.getFreeHeap());

  display.display();
}

void drawProcessing(String uid) {
  display.clearDisplay();

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Scanning...");
  display.drawLine(0, 10, 127, 10, SH110X_WHITE);

  display.setCursor(0, 20);
  display.print("UID: ");
  display.println(uid);

  display.setCursor(0, 38);
  display.println("Sending to server...");

  display.display();
}

void drawResult(const char *line1, String line2, const char *line3) {
  display.clearDisplay();

  // Name (large)
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println(line1);

  display.drawLine(0, 10, 127, 10, SH110X_WHITE);

  // Status
  display.setTextSize(2);
  display.setCursor(0, 16);
  display.println(line2);

  // Time
  display.setTextSize(1);
  display.drawLine(0, 42, 127, 42, SH110X_WHITE);
  display.setCursor(0, 48);
  display.print("Time: ");
  display.println(line3);

  display.display();
}

void drawResult(const char *line1, String line2, String line3) {
  drawResult(line1, line2, line3.c_str());
}

// =============================================
//  BUZZER
// =============================================

void beep(int duration) {
  digitalWrite(BUZZER_PIN, HIGH);
  delay(duration);
  digitalWrite(BUZZER_PIN, LOW);
  delay(50);
}

void errorBeep() {
  beep(100);
  delay(50);
  beep(100);
  delay(50);
  beep(300);
}
