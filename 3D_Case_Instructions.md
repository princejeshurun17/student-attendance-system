# 3D Printed Case Generation Instructions

Instructions for prompting an AI model to generate a 3D printable enclosure for the RFID Cloud Logger project.

---

## Hardware Components

| Component | Dimensions | Notes |
|-----------|------------|-------|
| NodeMCU ESP32 (38-pin) | ~51mm × 25mm × 8mm | USB port access needed |
| RC522 RFID Module | ~60mm × 39mm × 5mm | Antenna faces outward/upward |
| SH1106 OLED Display (1.3") | ~35mm × 33mm × 3mm | Display window cutout |
| Passive Buzzer | ~12mm diameter × 9mm | Vent hole for audio |
| Battery Holder | ~140mm × 30mm × 20mm | 2x 18650 or 4x AA |

---

## AI Prompt for 3D Case Generation

> **Design a 3D printable enclosure for a battery-powered ESP32-based RFID scanner with the following requirements:**
>
> **Components to house:**
> 1. NodeMCU ESP32 (38-pin devkit) - approx 51mm × 25mm × 8mm
> 2. RC522 RFID Reader Module - approx 60mm × 39mm × 5mm
> 3. 1.3" SH1106 OLED Display (I2C) - approx 35mm × 33mm × 3mm
> 4. Small passive buzzer - 12mm diameter
> 5. Battery holder - approx 140mm × 30mm × 20mm (holds 2x 18650 cells or 4x AA batteries)
>
> **Design Requirements:**
> - Two-piece snap-fit or screw-mount enclosure (top and bottom halves)
> - USB port cutout on the side for ESP32 programming/charging
> - Display window cutout on the top for the OLED screen
> - RFID scanning surface - position RC522 close to the top surface with minimal plastic thickness (1-2mm) for optimal read range
> - Small ventilation slots or speaker grille for the buzzer
> - Battery compartment in the base section, secured by clips or a dedicated bay
> - Power switch cutout on the side (for on/off switch)
> - Internal standoffs or mounting posts for PCB mounting with M2/M2.5 screws
> - Cable routing channels for wiring between components
> - Wall thickness: 2-2.5mm for durability
> - Rounded corners for comfortable handheld use
> - Overall form factor: approximately 150mm × 75mm × 45mm
>
> **Suggested Internal Layout:**
> ```
> ┌──────────────────────────────────────┐
> │  [OLED Display]  [Buzzer]            │  ← Top surface
> │  [RC522 RFID Reader - under surface] │
> ├──────────────────────────────────────┤
> │  [ESP32 Module]                      │  ← Middle layer
> │  [Wiring space]                      │
> ├──────────────────────────────────────┤
> │  [Battery Holder - 140mm long]       │  ← Base compartment
> └──────────────────────────────────────┘
> ```
>
> **Optional Features:**
> - Charging indicator LED viewing hole
> - Lanyard loop or belt clip mount
> - Battery cover removable independently for battery replacement
> - Rubber feet on the bottom for table-top stability
>
> **Print Settings:**
> - Material: PLA or PETG
> - Layer height: 0.2mm
> - Infill: 20-30%
> - Supports may be needed for battery bay overhangs

---

## Wiring Reference

| Connection | ESP32 Pin |
|------------|-----------|
| RC522 SS | GPIO 5 |
| RC522 SCK | GPIO 18 |
| RC522 MOSI | GPIO 23 |
| RC522 MISO | GPIO 19 |
| RC522 RST | GPIO 27 |
| OLED SDA | GPIO 21 |
| OLED SCL | GPIO 22 |
| Buzzer | GPIO 4 |

---

## Tips

- **Measure actual components** before finalizing - dimensions vary by manufacturer
- **Add 0.5-1mm tolerance** to all component cutouts
- **Keep RFID area thin** (1-2mm) - thick plastic degrades read range
- **Test fit with cardboard** mockup before printing
- If using 18650 cells, consider space for a **TP4056 charging module** (~26mm × 17mm)
