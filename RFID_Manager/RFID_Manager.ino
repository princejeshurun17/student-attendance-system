/*
 * RFID Manager - Read, Write, Add, Deduct Values
 * Hardware: NodeMCU ESP32 (38-pin), RC522 RFID
 * 
 * Pinout (VSPI):
 * SDA (SS): GPIO 5
 * SCK:      GPIO 18
 * MOSI:     GPIO 23
 * MISO:     GPIO 19
 * RST:      GPIO 27
 * 
 * Usage:
 * Open Serial Monitor at 115200 baud.
 * Commands:
 *  'r' -> Read Balance
 *  'w' -> Write New Balance (followed by number)
 *  '+' -> Add to Balance (followed by number)
 *  '-' -> Deduct from Balance (followed by number)
 *  
 * Example Type sequence: "w 100" (Write 100), "+ 50" (Add 50)
 */

#include <SPI.h>
#include <MFRC522.h>

#define SS_PIN  5
#define RST_PIN 27

MFRC522 mfrc522(SS_PIN, RST_PIN);
MFRC522::MIFARE_Key key;

// We will use Sector 1, Block 4 for storage
// (Sector 0 is manufacturer data, usually read-only)
const int BLOCK_ADDR = 4;
const int TRAILER_BLOCK = 7;

void setup() {
  Serial.begin(115200);
  while (!Serial); // Wait for serial
  
  SPI.begin();
  mfrc522.PCD_Init();
  
  // Prepare key (default FFFFFFFFFFFF)
  for (byte i = 0; i < 6; i++) {
    key.keyByte[i] = 0xFF;
  }

  Serial.println(F("=================================="));
  Serial.println(F("       RFID Value Manager"));
  Serial.println(F("=================================="));
  Serial.println(F("Commands:"));
  Serial.println(F("  r       -> Read current value"));
  Serial.println(F("  w <num> -> Set new value equals <num>"));
  Serial.println(F("  + <num> -> Add <num> to value"));
  Serial.println(F("  - <num> -> Subtract <num> from value"));
  Serial.println(F("----------------------------------"));
  Serial.println(F("Enter command and place card..."));
}

void loop() {
  // 1. Check for Serial Command
  if (Serial.available() > 0) {
    char cmd = Serial.read();
    // Skip newlines/spaces
    if (cmd == '\n' || cmd == '\r' || cmd == ' ') return;
    
    int val = 0;
    // For commands requiring a number, parse it
    if (cmd == 'w' || cmd == '+' || cmd == '-') {
      val = Serial.parseInt();
    }
    
    // Cleanup remaining input buffer
    while(Serial.available()) Serial.read();

    Serial.print(F("Command received: "));
    Serial.print(cmd);
    if (cmd != 'r') {
      Serial.print(F(" with value: "));
      Serial.print(val);
    }
    Serial.println(F("\nPlace card now..."));

    // Wait loop for card
    long timeout = millis() + 10000; // 10s timeout
    bool cardFound = false;
    
    while (millis() < timeout) {
      if (mfrc522.PICC_IsNewCardPresent() && mfrc522.PICC_ReadCardSerial()) {
        cardFound = true;
        break;
      }
      delay(50);
    }

    if (cardFound) {
      handleCard(cmd, val);
      
      // Halt PICC
      mfrc522.PICC_HaltA();
      // Stop encryption on PCD
      mfrc522.PCD_StopCrypto1();
      
      Serial.println(F("\nDone. Enter next command."));
    } else {
      Serial.println(F("Timeout: No card detected."));
    }
  }
}

void handleCard(char cmd, int param) {
  MFRC522::StatusCode status;
  byte buffer[18];
  byte size = sizeof(buffer);

  // Authenticate using Key A
  status = mfrc522.PCD_Authenticate(MFRC522::PICC_CMD_MF_AUTH_KEY_A, BLOCK_ADDR, &key, &(mfrc522.uid));
  if (status != MFRC522::STATUS_OK) {
    Serial.print(F("Auth failed: "));
    Serial.println(mfrc522.GetStatusCodeName(status));
    return;
  }

  // Current Logic involves Reading first, then Modifying if needed
  int32_t currentVal = 0;
  
  // READ
  status = mfrc522.MIFARE_Read(BLOCK_ADDR, buffer, &size);
  if (status != MFRC522::STATUS_OK) {
    Serial.print(F("Read failed: "));
    Serial.println(mfrc522.GetStatusCodeName(status));
    return;
  }

  // Convert first 4 bytes to int32 (Little Endian)
  // Assuming data is stored as raw bytes. 
  // If block is empty/factory, might be all 00s or FFs.
  memcpy(&currentVal, buffer, 4);

  Serial.print(F("Current Value: "));
  Serial.println(currentVal);

  if (cmd == 'r') {
    // Only reading
    return; 
  }

  // CALCULATE NEW
  int32_t newVal = currentVal;
  if (cmd == 'w') {
    newVal = param;
  } else if (cmd == '+') {
    newVal += param;
  } else if (cmd == '-') {
    newVal -= param;
  } else {
    Serial.println(F("Unknown command"));
    return;
  }

  // PREPARE WRITE
  // We write 16 bytes. First 4 are int, rest 0.
  byte dataBlock[16];
  memset(dataBlock, 0, 16);
  memcpy(dataBlock, &newVal, 4);

  // WRITE
  status = mfrc522.MIFARE_Write(BLOCK_ADDR, dataBlock, 16);
  if (status != MFRC522::STATUS_OK) {
    Serial.print(F("Write failed: "));
    Serial.println(mfrc522.GetStatusCodeName(status));
  } else {
    Serial.print(F("Success! New Value: "));
    Serial.println(newVal);
  }
}
