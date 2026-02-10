# Smart RFID Attendance System 🎓

A complete IoT-based attendance solution featuring **ESP32** hardware, **Google Apps Script** backend, and a **Python Streamlit** dashboard for real-time analytics.

![Dashboard Preview](https://github.com/user-attachments/assets/placeholder)

## 🌟 Features
- **Hardware**: ESP32 + RC522 RFID + OLED Display + Buzzer.
- **Backend**: Google Sheets as a database, handled via Google Apps Script (Serverless).
- **Dashboard**: Interactive Python Streamlit app with:
  - Real-time attendance tracking
  - Data visualization (Charts, Heatmaps)
  - Late arrival reports
  - Device health monitoring (WiFi RSSI, Heap Memory)
- **Security**: Environment variables for all sensitive credentials.

## 📂 Project Structure
```
├── RFID_Cloud_Logger/       # ESP32 Firmware
│   ├── RFID_Cloud_Logger.ino  # Main logic
│   ├── secrets.h.example      # Template for WiFi/API credentials
│   └── Code.gs                # Google Apps Script (Backend)
├── dashboard.py             # Streamlit Dashboard App
├── requirements.txt         # Python dependencies
├── .env.example             # Template for Dashboard credentials
├── walkthrough.md           # Detailed Step-by-Step Setup Guide
└── README.md                # This file
```

## 🚀 Quick Setup

### 1. Hardware (ESP32)
1.  Open `RFID_Cloud_Logger/RFID_Cloud_Logger.ino` in Arduino IDE.
2.  Rename `secrets.h.example` to `secrets.h`.
3.  Enter your **WiFi SSID**, **Password**, and **Google Apps Script Web App URL**.
4.  Flash to ESP32.

### 2. Backend (Google Sheets)
1.  Create a new Google Sheet.
2.  Go to **Extensions > Apps Script**.
3.  Copy `RFID_Cloud_Logger/Code.gs` into the editor.
4.  Set `SHEET_URL` in **Project Settings > Script Properties**.
5.  Run `setupSheets()` to initialize the database.
6.  Deploy as **Web App** (Access: *Anyone*).

### 3. Dashboard (Local)
1.  Install dependencies:
    ```bash
    pip install -r requirements.txt
    ```
2.  Configure secrets:
    - Rename `.env.example` to `.env`.
    - Add your **Google Sheet CSV Publish Links** (File > Share > Publish to Web > CSV).
3.  Run the app:
    ```bash
    python -m streamlit run dashboard.py
    ```

## 📊 Usage
- **Scan**: Tap an RFID card on the reader. The OLED shows "Checked In" and the student name.
- **Monitor**: Open the dashboard (`localhost:8501`) to see live updates, busy hours, and attendance trends.

## 🛠 Tech Stack
- **Language**: C++ (Arduino), Python 3, JavaScript (Apps Script)
- **Libraries**: `MFRC522`, `ArduinoJson`, `streamlit`, `pandas`, `plotly`
