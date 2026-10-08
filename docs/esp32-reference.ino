/*
 * SmartCampusPay — Firmware ESP32-S3  (v2.0 — State Machine Edition)
 * =========================================================================
 * Cấu trúc hoàn chỉnh với:
 *   - State machine rõ ràng (8 trạng thái)
 *   - Màn hình TFT 2.4" (ILI9341, 320×240, SPI)
 *   - 3 nút GPIO: BTN_PAY, BTN_TOPUP, BTN_CONFIRM / BTN_CANCEL (long-press)
 *   - 5 mức số tiền preset (10k, 15k, 20k, 25k, 30k)
 *   - DFPlayer Mini (giọng nói tiếng Việt)
 *   - NFC RC522 (SPI)
 *   - WiFi auto-reconnect + Watchdog timer
 *   - NVS Flash lưu cấu hình (không hardcode)
 *   - Render QR code lên màn hình (thư viện qrcodegen)
 *
 * ── Thư viện cần cài (Arduino Library Manager) ──────────────────────────
 *   - MFRC522          (NFC reader)
 *   - Adafruit_ILI9341 (TFT driver)
 *   - Adafruit_GFX     (graphics primitives)
 *   - ArduinoJson      (Benoit Blanchon)
 *   - DFRobotDFPlayerMini
 *   - Preferences      (NVS, đi kèm ESP32 core)
 *   - esp_task_wdt.h   (Watchdog, đi kèm ESP32 core)
 *   - qrcodegen        (niyazpk/qrcodegen — copy qrcodegen.h + qrcodegen.c vào sketch)
 *
 * ── Sơ đồ chân ESP32-S3 DevKitC ─────────────────────────────────────────
 *   NFC RC522 (SPI1):  SS=10, SCK=12, MOSI=11, MISO=13, RST=9
 *   TFT ILI9341 (SPI0):DC=2,  CS=3,  SCK=40,  MOSI=41, RST=1, BL=46
 *   DFPlayer Mini:     TX=17, RX=18  (UART1, 9600bps)
 *   BTN_PAY:           GPIO 4   (INPUT_PULLUP — nhấn = LOW)
 *   BTN_TOPUP:         GPIO 5   (INPUT_PULLUP)
 *   BTN_CONFIRM:       GPIO 6   (INPUT_PULLUP — giữ 2s = CANCEL)
 *
 * ── NVS Keys ─────────────────────────────────────────────────────────────
 *   "wifi_ssid", "wifi_pass", "api_key", "base_url"
 *   → Nạp lần đầu bằng Serial Monitor: nhập lệnh "config" rồi follow prompt
 *
 * ── Bảo mật HTTPS ────────────────────────────────────────────────────────
 *   Đặt ROOT_CA bên dưới = root certificate của server production.
 *   Khi chạy dev/test: đặt USE_INSECURE = true (bỏ verify cert).
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ILI9341.h>
#include <DFRobotDFPlayerMini.h>
#include <HardwareSerial.h>
#include <Preferences.h>
#include <esp_task_wdt.h>

// ── Bật/tắt tính năng ───────────────────────────────────────────────────
#define USE_INSECURE      true   // true = dev (bỏ verify cert), false = production
#define WDT_TIMEOUT_SEC   30     // Watchdog reset sau 30s không feed
#define TOPUP_TIMEOUT_MS  (30UL * 60 * 1000)  // 30 phút
#define POLL_INTERVAL_MS  4000
#define DEBOUNCE_MS       50
#define CARD_COOLDOWN_MS  3000  // Chống đọc thẻ trùng

// ── Chân nối ─────────────────────────────────────────────────────────────
// NFC (SPI1)
#define NFC_SS_PIN     10
#define NFC_RST_PIN    9
// TFT (SPI0 — VSPI)
#define TFT_DC         2
#define TFT_CS         3
#define TFT_RST        1
#define TFT_BL         46
// Buttons
#define BTN_PAY        4
#define BTN_TOPUP      5
#define BTN_CONFIRM    6
// DFPlayer (UART1)
#define DFPLAYER_RX    18
#define DFPLAYER_TX    17

// ── Voice tracks ─────────────────────────────────────────────────────────
#define VOICE_READY          1   // "Vui lòng quẹt thẻ"
#define VOICE_PAY_OK         2   // "Thanh toán thành công"
#define VOICE_PAY_FAIL       3   // "Thanh toán thất bại"
#define VOICE_INSUFFICIENT   4   // "Không đủ số dư"
#define VOICE_TOPUP_OK       5   // "Nạp tiền thành công"
#define VOICE_BALANCE        6   // "Số dư"
#define VOICE_DAILY_LIMIT    7   // "Vượt hạn mức ngày"
#define VOICE_CARD_INACTIVE  8   // "Thẻ không hoạt động"
#define VOICE_CONNECTING     9   // "Đang kết nối mạng"
// track 10..19 = digit "0".."9"
// track 20 = "đồng"
// track 21 = "nghìn"

// ── Màu sắc ──────────────────────────────────────────────────────────────
#define C_BG         0x0000   // Đen
#define C_WHITE      0xFFFF
#define C_RED        0xF800
#define C_GREEN      0x07E0
#define C_BLUE       0x001F
#define C_YELLOW     0xFFE0
#define C_ORANGE     0xFD20
#define C_GRAY       0x8410
#define C_LIGHT_GRAY 0xC618
#define C_DARK_RED   0x8000
#define C_ACCENT     0xF81F  // Magenta-ish accent

// ── State Machine ─────────────────────────────────────────────────────────
enum State {
  STATE_WIFI_CONNECTING,   // Kết nối WiFi lúc khởi động
  STATE_IDLE,              // Chờ quẹt thẻ (hiện QR tĩnh)
  STATE_CARD_DETECTED,     // Đã đọc thẻ, hiện tên SV, chờ chọn mode
  STATE_SELECT_AMOUNT,     // Chọn số tiền thanh toán (5 preset)
  STATE_SELECT_TOPUP_AMOUNT, // Chọn số tiền nạp trước khi tạo QR
  STATE_PROCESSING,        // Đang gọi API thanh toán
  STATE_RESULT,            // Hiện kết quả thành công / thất bại
  STATE_TOPUP_QR,          // Hiện QR nạp tiền, chờ SV chuyển khoản
  STATE_TOPUP_POLLING,     // Poll kết quả nạp tiền
  STATE_ERROR,             // Lỗi kết nối / server
};

// ── Globals ───────────────────────────────────────────────────────────────
State       currentState = STATE_WIFI_CONNECTING;
State       prevState    = STATE_WIFI_CONNECTING;  // Để detect state change

Preferences prefs;
String      WIFI_SSID, WIFI_PASS, BASE_URL, API_KEY;
String pendingPaymentPayload = "";
int lastHttpCode = -1;

MFRC522              rfid(NFC_SS_PIN, NFC_RST_PIN);
Adafruit_ILI9341     tft(TFT_CS, TFT_DC, TFT_RST);
HardwareSerial       dfSerial(1);
DFRobotDFPlayerMini  dfplayer;
WiFiClientSecure     wifiClient;

// Dữ liệu phiên làm việc
String  currentCardUid     = "";
String  currentStudentCode = "";
String  currentFullName    = "";
long    currentBalance     = 0;
String  currentRefCode     = "";
int     selectedAmountIdx  = 0;    // Index trong mảng preset amounts
long    currentTopupAmount = 0;

// Thời gian
unsigned long stateEnteredAt    = 0;
unsigned long lastPollAt        = 0;
unsigned long lastCardReadAt    = 0;
unsigned long lastWifiCheckAt   = 0;
unsigned long resultDisplayedAt = 0;
bool          resultSuccess     = false;
String        resultMessage     = "";

// Button debounce
unsigned long btnPayPressedAt     = 0;
unsigned long btnTopupPressedAt   = 0;
unsigned long btnConfirmPressedAt = 0;
bool          btnPayLastState     = HIGH;
bool          btnTopupLastState   = HIGH;
bool          btnConfirmLastState = HIGH;

// Preset amounts
const long AMOUNTS[]      = { 10000, 15000, 20000, 25000, 30000 };
const char* AMOUNT_LABELS[] = { "10.000d", "15.000d", "20.000d", "25.000d", "30.000d" };
const int   NUM_AMOUNTS   = 5;

// QR tĩnh từ server
String staticQrUrl = "";

// ── Root CA certificate (dùng khi USE_INSECURE = false) ──────────────────
// Paste root cert của server ở đây (PEM format)
const char* ROOT_CA = R"EOF(
-----BEGIN CERTIFICATE-----
<REPLACE_WITH_YOUR_ROOT_CA>
-----END CERTIFICATE-----
)EOF";

// =========================================================================
// NVS CONFIG
// =========================================================================

void loadConfig() {
  prefs.begin("scp", true);
  WIFI_SSID = prefs.getString("wifi_ssid", "");
  WIFI_PASS = prefs.getString("wifi_pass", "");
  BASE_URL  = prefs.getString("base_url",  "https://xxx.onrender.com/api/v1");
  API_KEY   = prefs.getString("api_key",   "mcp_xxxxxxxxxxxxxxxxxxxxxxxx");
  pendingPaymentPayload = prefs.getString("pending_pay", "");
  prefs.end();
}

void saveConfig(const String& ssid, const String& pass,
                const String& url,  const String& key) {
  prefs.begin("scp", false);
  prefs.putString("wifi_ssid", ssid);
  prefs.putString("wifi_pass", pass);
  prefs.putString("base_url",  url);
  prefs.putString("api_key",   key);
  prefs.end();
  Serial.println("[NVS] Config saved.");
}

// Đọc 1 dòng từ Serial Monitor (chờ người dùng nhập và feed watchdog)
String readSerialLine() {
  while (!Serial.available()) {
    delay(50);
    esp_task_wdt_reset();
  }
  String str = Serial.readStringUntil('\n');
  str.trim();
  return str;
}

// Cấu hình qua Serial Monitor: gõ "config" để bắt đầu
void handleSerialConfig() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  if (cmd != "config") return;

  Serial.println("\n=== SmartCampusPay Config ===");
  Serial.println("Nhap thong tin va bam Enter:");
  Serial.print("1. WiFi SSID: ");   String ssid = readSerialLine(); Serial.println(ssid);
  Serial.print("2. WiFi Pass: ");   String pass = readSerialLine(); Serial.println("******");
  Serial.print("3. Backend URL: ");  String url  = readSerialLine(); Serial.println(url);
  Serial.print("4. API Key: ");      String key  = readSerialLine(); Serial.println("******");

  if (pendingPaymentPayload.length() > 0 && url != BASE_URL) {
    Serial.println("[CONFIG] Cannot change backend URL with an unresolved payment.");
    return;
  }
  // For a pending request, only repair/rotate the key of the same merchant.
  // Never move an unresolved payment to another merchant or backend.
  
  if (ssid.length() > 0) {
    saveConfig(ssid, pass, url, key);
    Serial.println("[CONFIG] Da luu cau hinh. Khoi dong lai sau 2s...");
    delay(2000);
    ESP.restart();
  } else {
    Serial.println("[CONFIG] Huy cau hinh (SSID trong).");
  }
}

// =========================================================================
// DISPLAY HELPERS
// =========================================================================

void tftHeader(const char* title, uint16_t bgColor = C_DARK_RED) {
  tft.fillRect(0, 0, 320, 36, bgColor);
  tft.setTextColor(C_WHITE, bgColor);
  tft.setTextSize(2);
  tft.setCursor(8, 10);
  tft.print(title);
}

void tftClear(uint16_t color = C_BG) {
  tft.fillScreen(color);
}

void tftCenteredText(const char* text, int y, uint16_t color = C_WHITE,
                     uint8_t size = 2, uint16_t bg = C_BG) {
  tft.setTextSize(size);
  tft.setTextColor(color, bg);
  int w = strlen(text) * 6 * size;
  int x = max(0, (320 - w) / 2);
  tft.setCursor(x, y);
  tft.print(text);
}

void tftBigText(const char* text, int x, int y, uint16_t color, uint8_t size = 3) {
  tft.setTextSize(size);
  tft.setTextColor(color, C_BG);
  tft.setCursor(x, y);
  tft.print(text);
}

void tftButton(int x, int y, int w, int h, const char* label,
               uint16_t fg = C_WHITE, uint16_t bg = C_DARK_RED) {
  tft.fillRoundRect(x, y, w, h, 6, bg);
  tft.drawRoundRect(x, y, w, h, 6, C_GRAY);
  tft.setTextSize(1);
  tft.setTextColor(fg, bg);
  int lw = strlen(label) * 6;
  tft.setCursor(x + (w - lw) / 2, y + (h - 8) / 2);
  tft.print(label);
}

void tftProgressBar(int pct, int y = 220) {
  int barW = 280;
  int barX = 20;
  tft.drawRoundRect(barX, y, barW, 12, 4, C_GRAY);
  int fill = (barW - 4) * pct / 100;
  if (fill > 0) tft.fillRoundRect(barX + 2, y + 2, fill, 8, 3, C_ACCENT);
}

// Render QR code (byte matrix) lên TFT ở góc trên trái (x,y) với scale
void renderQrOnTFT(const uint8_t* qrData, int qrSize, int x, int y, int scale = 3) {
  int totalSize = qrSize * scale;
  tft.fillRect(x - 4, y - 4, totalSize + 8, totalSize + 8, C_WHITE);
  for (int row = 0; row < qrSize; row++) {
    for (int col = 0; col < qrSize; col++) {
      bool dark = (qrData[row * ((qrSize + 7) / 8) + col / 8] >> (7 - (col % 8))) & 1;
      uint16_t color = dark ? C_BG : C_WHITE;
      tft.fillRect(x + col * scale, y + row * scale, scale, scale, color);
    }
  }
}

// Vẽ icon WiFi ở góc phải header
void drawWifiIcon(bool connected) {
  int x = 295, y = 8;
  uint16_t c = connected ? C_GREEN : C_RED;
  tft.fillRect(x, y, 18, 18, C_DARK_RED);
  if (connected) {
    // 3 cột sóng WiFi tăng dần
    tft.fillRect(x + 2,  y + 13, 3, 3, c);
    tft.fillRect(x + 7,  y + 9,  3, 7, c);
    tft.fillRect(x + 12, y + 4,  3, 12, c);
  } else {
    tft.drawLine(x + 3, y + 3, x + 15, y + 15, c);
    tft.drawLine(x + 3, y + 15, x + 15, y + 3, c);
  }
}

// ── Screen renderers ──────────────────────────────────────────────────────

void showWifiConnecting() {
  tftClear();
  tftHeader("SmartCampusPay");
  tftCenteredText("Dang ket noi WiFi...", 80, C_YELLOW, 2);
  tftCenteredText(WIFI_SSID.c_str(), 110, C_LIGHT_GRAY, 1);
  tftProgressBar(0, 200);
}

void showIdle() {
  tftClear();
  tftHeader("SmartCampusPay");
  drawWifiIcon(WiFi.status() == WL_CONNECTED);
  tftCenteredText("Vui long quet the", 50, C_WHITE, 2);
  tftCenteredText("de thanh toan", 74, C_WHITE, 2);

  // Hiện QR tĩnh nếu đã lấy được
  if (staticQrUrl.length() > 0) {
    tft.setTextSize(1);
    tft.setTextColor(C_GRAY, C_BG);
    tft.setCursor(8, 105);
    tft.print("Hoac quet QR nap tien:");

    // Render QR tĩnh — sử dụng URL (cần encode bằng qrcodegen thật)
    // TODO (phase 2): thay bằng qrcodegen library thật
    // Tạm thời: hiện URL text và box placeholder
    tft.drawRoundRect(70, 115, 180, 100, 6, C_GRAY);
    tftCenteredText("[ QR Code ]", 155, C_GRAY, 1);
    tft.setCursor(8, 220);
    tft.setTextSize(1);
    tft.setTextColor(C_GRAY, C_BG);
    tft.print("Ghi ro ma SV khi chuyen khoan");
  }
}

void showCardDetected(const String& name, long balance) {
  tftClear();
  tftHeader("The da quet");
  drawWifiIcon(true);

  // Tên sinh viên
  tft.setTextSize(2);
  tft.setTextColor(C_WHITE, C_BG);
  tft.setCursor(8, 48);
  tft.print("Xin chao,");

  tft.setTextSize(2);
  tft.setTextColor(C_YELLOW, C_BG);
  tft.setCursor(8, 70);
  // Cắt tên nếu quá dài
  String shortName = name.substring(0, min((int)name.length(), 20));
  tft.print(shortName);

  // Số dư
  tft.setTextSize(1);
  tft.setTextColor(C_GRAY, C_BG);
  tft.setCursor(8, 100);
  tft.print("So du vi:");
  tft.setTextSize(2);
  tft.setTextColor(balance >= 20000 ? C_GREEN : C_RED, C_BG);
  tft.setCursor(8, 116);
  char balStr[24];
  snprintf(balStr, sizeof(balStr), "%ld d", balance);
  tft.print(balStr);

  // Hướng dẫn nút bấm
  tft.drawLine(0, 148, 320, 148, C_GRAY);
  tftButton(10,  155, 140, 38, "[ BTN1 ] THANH TOAN", C_WHITE, C_DARK_RED);
  tftButton(165, 155, 145, 38, "[ BTN2 ] NAP TIEN",   C_WHITE, 0x0210);
  tftCenteredText("Giu BTN3 de huy", 206, C_GRAY, 1);
}

void showSelectAmount(int selected, const char* title = "Chon so tien") {
  tftClear();
  tftHeader(title);

  int y = 44;
  for (int i = 0; i < NUM_AMOUNTS; i++) {
    bool sel = (i == selected);
    uint16_t bg = sel ? C_DARK_RED : 0x2104;
    uint16_t fg = sel ? C_WHITE    : C_LIGHT_GRAY;
    tft.fillRoundRect(10, y, 300, 30, 6, bg);
    if (sel) tft.drawRoundRect(10, y, 300, 30, 6, C_ACCENT);

    tft.setTextSize(2);
    tft.setTextColor(fg, bg);
    tft.setCursor(20, y + 8);
    tft.print(AMOUNT_LABELS[i]);

    if (sel) {
      tft.setCursor(260, y + 8);
      tft.print("<");
    }
    y += 36;
  }

  tft.drawLine(0, 225, 320, 225, C_GRAY);
  tft.setTextSize(1);
  tft.setTextColor(C_GRAY, C_BG);
  tft.setCursor(8, 230);
  tft.print("BTN1: len  BTN2: xuong  BTN3: xac nhan");
}

void showProcessing(const char* msg = "Dang xu ly...") {
  tftClear();
  tftHeader("Xu ly giao dich");
  tftCenteredText(msg, 95, C_WHITE, 2);

  // Spinner giả (dấu chấm)
  static int dotCount = 0;
  char dots[8] = "";
  for (int i = 0; i < (dotCount % 4); i++) strcat(dots, ".");
  dotCount++;
  tftCenteredText(dots, 125, C_YELLOW, 3);
  tftProgressBar(50 + (dotCount % 4) * 10, 210);
}

void showResult(bool success, const char* message, long newBalance = -1) {
  tftClear();

  // Header màu theo kết quả
  uint16_t hdrColor = success ? 0x0400 : 0x6000;
  tftHeader(success ? "THANH TOAN OK" : "THAT BAI", hdrColor);

  // Icon lớn
  if (success) {
    // Vẽ checkmark
    tft.drawCircle(160, 105, 40, C_GREEN);
    tft.fillCircle(160, 105, 38, 0x0200);
    tft.drawLine(143, 105, 155, 117, C_GREEN);
    tft.drawLine(155, 117, 177, 93,  C_GREEN);
    tft.drawLine(144, 106, 156, 118, C_GREEN);
    tft.drawLine(156, 118, 178, 94,  C_GREEN);
  } else {
    tft.drawCircle(160, 105, 40, C_RED);
    tft.fillCircle(160, 105, 38, 0x3000);
    tft.drawLine(143, 88, 177, 122, C_RED);
    tft.drawLine(177, 88, 143, 122, C_RED);
    tft.drawLine(144, 89, 178, 123, C_RED);
    tft.drawLine(178, 89, 144, 123, C_RED);
  }

  // Message
  tft.setTextSize(1);
  tft.setTextColor(success ? C_GREEN : C_RED, C_BG);
  int msgLen = strlen(message);
  tft.setCursor(max(0, (320 - msgLen * 6) / 2), 155);
  tft.print(message);

  // Số dư mới
  if (newBalance >= 0) {
    char balStr[32];
    snprintf(balStr, sizeof(balStr), "So du: %ld d", newBalance);
    tftCenteredText(balStr, 175, C_WHITE, 1);
  }

  tftCenteredText("Tiep tuc sau 3 giay...", 210, C_GRAY, 1);
}

void showTopupQR(const String& refCode, long amount) {
  tftClear();
  tftHeader("Nap tien QR");
  tftCenteredText("Quet QR bang app ngan hang", 44, C_WHITE, 1);
  char amountText[32];
  snprintf(amountText, sizeof(amountText), "So tien: %ld d", amount);
  tftCenteredText(amountText, 58, C_YELLOW, 1);

  // QR placeholder — thay bằng qrcodegen thật
  tft.drawRoundRect(60, 70, 200, 130, 8, C_WHITE);
  tft.fillRoundRect(62, 72, 196, 126, 8, C_WHITE);
  tft.setTextColor(C_BG, C_WHITE);
  tft.setTextSize(1);
  tft.setCursor(80, 128);
  tft.print("[ QR nap tien ]");
  tft.setCursor(80, 142);
  // In refCode (ngắn)
  tft.print(refCode.substring(0, min((int)refCode.length(), 20)).c_str());

  tft.setTextSize(1);
  tft.setTextColor(C_GRAY, C_BG);
  tft.setCursor(8, 210);
  tft.print("Ref: ");
  tft.print(refCode.substring(0, 18).c_str());
  tftCenteredText("Giu BTN3 de huy", 225, C_GRAY, 1);
}

void showTopupPolling(int elapsed_sec, int total_sec = 1800) {
  // Chỉ update progress bar, không vẽ lại toàn màn hình (tránh nhấp nháy)
  int pct = (elapsed_sec * 100) / total_sec;
  tftProgressBar(pct, 200);

  char timeStr[24];
  int rem = total_sec - elapsed_sec;
  snprintf(timeStr, sizeof(timeStr), "Het han: %d:%02d  ", rem / 60, rem % 60);
  tft.setTextSize(1);
  tft.setTextColor(C_GRAY, C_BG);
  tft.setCursor(8, 222);
  tft.print(timeStr);
}

void showError(const char* msg) {
  tftClear();
  tftHeader("LOI HE THONG", C_DARK_RED);
  tftCenteredText(msg, 90, C_RED, 2);
  tftCenteredText("Dang thu lai...", 120, C_YELLOW, 1);
}

// =========================================================================
// DFPLAYER
// =========================================================================

void playTrack(uint16_t track) {
  dfplayer.play(track);
}

void speakBalance(long balance) {
  playTrack(VOICE_BALANCE);
  delay(800);
  long v = balance / 1000;  // Đọc theo nghìn
  if (v == 0) return;
  int digits[10], n = 0;
  while (v > 0) { digits[n++] = v % 10; v /= 10; }
  for (int i = n - 1; i >= 0; i--) {
    playTrack(10 + digits[i]);
    delay(600);
  }
  playTrack(21);  // "nghìn"
  delay(300);
  playTrack(20);  // "đồng"
}

// =========================================================================
// HTTP HELPER
// =========================================================================

String apiRequest(const String& method, const String& path,
                  const String& body = "", int timeoutMs = 8000) {
  esp_task_wdt_reset();  // Feed watchdog trước mỗi HTTP call

  HTTPClient http;
  String url = BASE_URL + path;
  http.begin(wifiClient, url);
  http.addHeader("X-API-Key",    API_KEY);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(timeoutMs);

  int code = -1;
  if      (method == "GET")  code = http.GET();
  else if (method == "POST") code = http.POST(body);

  String resp = "";
  lastHttpCode = code;
  if (code > 0) resp = http.getString();
  http.end();

  Serial.printf("[HTTP %d] %s %s\n", code, method.c_str(), path.c_str());
  return resp;
}

// =========================================================================
// NFC
// =========================================================================

String readCardUid() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) return "";
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (uid.length() > 0) uid += "";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();
  rfid.PCD_StopCrypto1();
  return uid;
}

// =========================================================================
// IDEMPOTENCY KEY
// =========================================================================

String makeIdempotencyKey() {
  // UUID-like: dùng esp_random() thay random() cho entropy tốt hơn
  char buf[40];
  snprintf(buf, sizeof(buf), "%08lx-%04lx-4%03lx-%04lx-%08lx%04lx",
    (unsigned long)esp_random(),
    (unsigned long)(esp_random() & 0xFFFF),
    (unsigned long)(esp_random() & 0x0FFF),
    (unsigned long)((esp_random() & 0x3FFF) | 0x8000),
    (unsigned long)esp_random(),
    (unsigned long)(esp_random() & 0xFFFF));
  return String(buf);
}

// =========================================================================
// WIFI
// =========================================================================

bool connectWifi(int timeoutSec = 20) {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID.c_str(), WIFI_PASS.c_str());
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID.c_str());
  int elapsed = 0;
  while (WiFi.status() != WL_CONNECTED && elapsed < timeoutSec * 2) {
    delay(500);
    Serial.print(".");
    elapsed++;
    // Animate progress bar
    tftProgressBar(elapsed * 100 / (timeoutSec * 2), 200);
    esp_task_wdt_reset();
  }
  bool ok = WiFi.status() == WL_CONNECTED;
  Serial.printf("\n[WiFi] %s — IP: %s\n", ok ? "OK" : "FAIL",
                ok ? WiFi.localIP().toString().c_str() : "—");
  return ok;
}

void checkWifiReconnect() {
  if (millis() - lastWifiCheckAt < 10000) return;
  lastWifiCheckAt = millis();
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Lost connection, reconnecting...");
    WiFi.reconnect();
  }
}

// =========================================================================
// BUSINESS LOGIC — API CALLS
// =========================================================================

struct StudentInfo { String studentCode; String fullName; long balance; bool found; };

StudentInfo getStudentByUid(const String& uid) {
  String resp = apiRequest("GET", "/hardware/students/by-uid/" + uid);
  StudentInfo info = {"", "", 0, false};
  if (resp.length() == 0) return info;

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return info;
  if (!(doc["success"] | false)) return info;

  info.studentCode = doc["data"]["studentCode"] | "";
  info.fullName    = doc["data"]["fullName"]    | "Unknown";
  info.found       = true;
  return info;
}

long getBalanceByUid(const String& uid) {
  String resp = apiRequest("GET", "/hardware/balance/" + uid);
  if (resp.length() == 0) return -1;
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return -1;
  return doc["data"]["balance"] | -1;
}

struct PayResult { bool success; String message; long newBalance; bool pending; };

bool clearPendingPayment() {
  prefs.begin("scp", false);
  bool cleared = prefs.remove("pending_pay");
  prefs.end();
  if (cleared) pendingPaymentPayload = "";
  return cleared;
}


PayResult doPayment(const String& uid, long amount) {
  if (pendingPaymentPayload.length() == 0) {
    StaticJsonDocument<256> body;
    body["cardUid"] = uid;
    body["amount"] = amount;
    body["idempotencyKey"] = makeIdempotencyKey();
    String payload;
    serializeJson(body, payload);
    prefs.begin("scp", false);
    size_t stored = prefs.putString("pending_pay", payload);
    prefs.end();
    if (stored == 0) return {false, "Khong luu duoc giao dich", -1, false};
    pendingPaymentPayload = payload;
  }
  // Replay the persisted payload, including after power loss. Never generate
  // a new key while an earlier payment has an unknown outcome.
  String resp = apiRequest("POST", "/transactions/pay/card", pendingPaymentPayload, 10000);
  PayResult result = {false, "Chua ro ket qua. Dang xac minh", -1, true};
  if (resp.length() == 0) return result;
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return result;
  result.success = lastHttpCode >= 200 && lastHttpCode < 300 && (doc["success"] | false);
  String code = doc["code"] | "";
  bool declined = code == "CARD_INACTIVE" || code == "CARD_NOT_FOUND" || code == "STUDENT_INACTIVE"
    || code == "ACCOUNT_NOT_FOUND" || code == "ACCOUNT_FROZEN" || code == "INSUFFICIENT_BALANCE"
    || code == "DAILY_LIMIT_EXCEEDED" || code == "INVALID_CARD_UID" || code == "INVALID_AMOUNT" || code == "VALIDATION_ERROR";
  if (result.success || declined) {
    result.message = doc["message"] | (result.success ? "Thanh toan thanh cong" : "Thanh toan bi tu choi");
    result.pending = !clearPendingPayment();
  }
  return result;
}

struct TopupQrResult { bool success; String refCode; String qrUrl; long amount; };

TopupQrResult startTopupQr(const String& uid, long amount) {
  StaticJsonDocument<128> body;
  body["cardUid"] = uid;
  body["amount"] = amount;
  String payload;
  serializeJson(body, payload);

  String resp = apiRequest("POST", "/hardware/topup/qr", payload);
  TopupQrResult result = {false, "", "", 0};
  if (resp.length() == 0) return result;

  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return result;
  if (!(doc["success"] | false)) return result;

  result.refCode = doc["data"]["referenceCode"] | "";
  result.qrUrl   = doc["data"]["qrUrl"]         | "";
  result.amount  = doc["data"]["amount"]        | 0;
  result.success = result.refCode.length() > 0 && result.amount == amount;
  return result;
}

struct TopupStatus { String status; long amount; long balance; };

TopupStatus pollTopupStatus(const String& refCode) {
  String resp = apiRequest("GET", "/hardware/topup/status/" + refCode);
  TopupStatus ts = {"pending", 0, -1};
  if (resp.length() == 0) return ts;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return ts;
  if (!(doc["success"] | false)) return ts;

  ts.status  = doc["data"]["status"]  | "pending";
  ts.amount  = doc["data"]["amount"]  | 0;
  ts.balance = doc["data"]["balance"] | -1;
  return ts;
}

void fetchStaticQr() {
  String resp = apiRequest("GET", "/hardware/static-qr");
  if (resp.length() == 0) return;
  StaticJsonDocument<512> doc;
  if (deserializeJson(doc, resp) != DeserializationError::Ok) return;
  if (doc["success"] | false) {
    staticQrUrl = doc["data"]["qrUrl"] | "";
    Serial.printf("[QR] Static QR: %s\n", staticQrUrl.c_str());
  }
}

// =========================================================================
// BUTTON READING
// =========================================================================

// Trả true khi nút được nhấn (cạnh xuống, đã debounce)
bool btnPressed(int pin, bool& lastState, unsigned long& pressedAt) {
  bool cur = digitalRead(pin);
  if (cur == LOW && lastState == HIGH) {
    unsigned long now = millis();
    if (now - pressedAt > DEBOUNCE_MS) {
      pressedAt = now;
      lastState = LOW;
      return true;
    }
  }
  if (cur == HIGH) lastState = HIGH;
  return false;
}

// Trả true nếu BTN_CONFIRM được giữ > 2 giây (cancel)
bool btnLongPress(int pin, bool& lastState, unsigned long& pressedAt, unsigned long holdMs = 2000) {
  bool cur = digitalRead(pin);
  if (cur == LOW) {
    if (lastState == HIGH) { pressedAt = millis(); lastState = LOW; }
    if (millis() - pressedAt > holdMs) {
      lastState = HIGH;  // Reset để không trigger lại
      return true;
    }
  } else {
    lastState = HIGH;
  }
  return false;
}

// =========================================================================
// STATE TRANSITIONS
// =========================================================================

void enterState(State s) {
  prevState      = currentState;
  currentState   = s;
  stateEnteredAt = millis();
  Serial.printf("[STATE] %d → %d\n", (int)prevState, (int)currentState);
}

void transitionToIdle() {
  currentCardUid     = "";
  currentStudentCode = "";
  currentFullName    = "";
  currentBalance     = 0;
  currentRefCode     = "";
  selectedAmountIdx  = 0;
  currentTopupAmount = 0;
  enterState(STATE_IDLE);
  showIdle();
  playTrack(VOICE_READY);
}

// =========================================================================
// SETUP
// =========================================================================

void setup() {
  Serial.begin(115200);
  delay(200);

  // Watchdog — reset thiết bị nếu bị treo > WDT_TIMEOUT_SEC
  esp_task_wdt_init(WDT_TIMEOUT_SEC, true);
  esp_task_wdt_add(NULL);  // Theo dõi task hiện tại

  // NVS — đọc cấu hình
  loadConfig();

  // GPIO Buttons
  pinMode(BTN_PAY,     INPUT_PULLUP);
  pinMode(BTN_TOPUP,   INPUT_PULLUP);
  pinMode(BTN_CONFIRM, INPUT_PULLUP);

  // Backlight TFT
  pinMode(TFT_BL, OUTPUT);
  digitalWrite(TFT_BL, HIGH);

  // TFT Init
  tft.begin();
  tft.setRotation(1);  // Landscape
  tftClear();
  tftHeader("SmartCampusPay");
  tft.setTextSize(1);
  tft.setTextColor(C_GRAY, C_BG);
  tft.setCursor(8, 50);
  tft.print("Khoi dong...");

  // SPI for NFC (SPI1)
  SPI.begin();
  rfid.PCD_Init();
  delay(50);
  rfid.PCD_DumpVersionToSerial();

  // DFPlayer
  dfSerial.begin(9600, SERIAL_8N1, DFPLAYER_RX, DFPLAYER_TX);
  if (dfplayer.begin(dfSerial)) {
    dfplayer.volume(25);  // 0–30
    Serial.println("[DFPlayer] OK");
  } else {
    Serial.println("[DFPlayer] Not found — voice disabled");
  }

  // HTTPS
  if (USE_INSECURE) {
    wifiClient.setInsecure();
    Serial.println("[TLS] INSECURE mode (dev only)");
  } else {
    wifiClient.setCACert(ROOT_CA);
    Serial.println("[TLS] Certificate pinned");
  }

  // WiFi
  showWifiConnecting();
  playTrack(VOICE_CONNECTING);
  bool connected = connectWifi(20);

  if (connected) {
    fetchStaticQr();
    enterState(STATE_IDLE);
    showIdle();
    playTrack(VOICE_READY);
  } else {
    enterState(STATE_ERROR);
    showError("Khong co mang WiFi");
  }
}

// =========================================================================
// LOOP — STATE MACHINE
// =========================================================================

void loop() {
  if (pendingPaymentPayload.length() > 0) {
    esp_task_wdt_reset();
    handleSerialConfig();
    if (WiFi.status() != WL_CONNECTED) { connectWifi(10); return; }
    if (millis() - lastPollAt < 5000) { delay(20); return; }
    lastPollAt = millis();
    showProcessing("Dang xac minh giao dich...");
    PayResult res = doPayment("", 0);
    if (!res.pending) {
      resultSuccess = res.success;
      resultMessage = res.message;
      enterState(STATE_RESULT);
      showResult(res.success, res.message.c_str(), -1);
      resultDisplayedAt = millis();
      playTrack(res.success ? VOICE_PAY_OK : VOICE_PAY_FAIL);
    }
    return;
  }

  esp_task_wdt_reset();        // Feed watchdog mỗi vòng loop
  handleSerialConfig();        // Cho phép config qua Serial
  checkWifiReconnect();        // Tự reconnect WiFi nếu mất

  unsigned long now = millis();

  // ── Đọc button ──────────────────────────────────────────────────────────
  bool payPressed     = btnPressed(BTN_PAY,     btnPayLastState,     btnPayPressedAt);
  bool topupPressed   = btnPressed(BTN_TOPUP,   btnTopupLastState,   btnTopupPressedAt);
  bool confirmPressed = btnPressed(BTN_CONFIRM, btnConfirmLastState, btnConfirmPressedAt);
  bool cancelPressed  = btnLongPress(BTN_CONFIRM, btnConfirmLastState, btnConfirmPressedAt, 2000);

  // ── Xử lý từng state ────────────────────────────────────────────────────
  switch (currentState) {

    // ────────────────────────────────────────────────────────────────────
    case STATE_WIFI_CONNECTING:
      // Handled in setup(); loop fallback nếu cần retry
      if (now - stateEnteredAt > 30000) {
        bool ok = connectWifi(20);
        if (ok) { fetchStaticQr(); transitionToIdle(); }
        else    { stateEnteredAt = now; /* Thử lại sau 30s */ }
      }
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_IDLE:
      // Đọc thẻ NFC (debounce CARD_COOLDOWN_MS)
      if (now - lastCardReadAt > CARD_COOLDOWN_MS) {
        String uid = readCardUid();
        if (uid.length() > 0) {
          lastCardReadAt = now;
          Serial.printf("[NFC] UID = %s\n", uid.c_str());

          showProcessing("Kiem tra the...");
          StudentInfo info = getStudentByUid(uid);

          if (!info.found) {
            showError("The chua dang ky!");
            delay(2000);
            showIdle();
            break;
          }

          currentCardUid     = uid;
          currentStudentCode = info.studentCode;
          currentFullName    = info.fullName;

          // Lấy số dư
          long bal = getBalanceByUid(uid);
          currentBalance = (bal >= 0) ? bal : 0;

          enterState(STATE_CARD_DETECTED);
          showCardDetected(currentFullName, currentBalance);
        }
      }

      // Periodic WiFi status icon update
      if (now % 5000 < 50) drawWifiIcon(WiFi.status() == WL_CONNECTED);
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_CARD_DETECTED:
      // BTN_PAY → thanh toán → chọn số tiền
      if (payPressed) {
        selectedAmountIdx = 0;
        enterState(STATE_SELECT_AMOUNT);
        showSelectAmount(selectedAmountIdx, "Tien thanh toan");
        break;
      }
      // BTN_TOPUP → chọn số tiền nạp trước khi tạo QR
      if (topupPressed) {
        selectedAmountIdx = 0;
        enterState(STATE_SELECT_TOPUP_AMOUNT);
        showSelectAmount(selectedAmountIdx, "Tien nap");
        break;
      }
      // Cancel hoặc timeout 30 giây
      if (cancelPressed || now - stateEnteredAt > 30000) {
        transitionToIdle();
      }
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_SELECT_AMOUNT:
      // BTN_PAY → scroll lên (giảm index)
      if (payPressed) {
        selectedAmountIdx = (selectedAmountIdx - 1 + NUM_AMOUNTS) % NUM_AMOUNTS;
        showSelectAmount(selectedAmountIdx, "Tien thanh toan");
        break;
      }
      // BTN_TOPUP → scroll xuống (tăng index)
      if (topupPressed) {
        selectedAmountIdx = (selectedAmountIdx + 1) % NUM_AMOUNTS;
        showSelectAmount(selectedAmountIdx, "Tien thanh toan");
        break;
      }
      // BTN_CONFIRM → xác nhận số tiền đã chọn → thanh toán
      if (confirmPressed) {
        long amount = AMOUNTS[selectedAmountIdx];
        enterState(STATE_PROCESSING);
        showProcessing("Dang thanh toan...");

        PayResult res = doPayment(currentCardUid, amount);

        if (res.pending) {
          showProcessing("Chua ro ket qua. Xac minh...");
          lastPollAt = millis();
          break;
        }
        resultSuccess = res.success;
        if (res.success) {
          resultMessage = "Thanh toan " + String(AMOUNTS[selectedAmountIdx] / 1000) + "k thanh cong!";
          playTrack(VOICE_PAY_OK);
          delay(300);
          // Fetch số dư mới
          long newBal = getBalanceByUid(currentCardUid);
          if (newBal >= 0) {
            speakBalance(newBal);
            res.newBalance = newBal;
          }
        } else {
          // Map error message
          if (res.message.indexOf("Insufficient") >= 0 || res.message.indexOf("so du") >= 0) {
            resultMessage = "Khong du so du!";
            playTrack(VOICE_INSUFFICIENT);
          } else if (res.message.indexOf("Daily limit") >= 0) {
            resultMessage = "Vuot han muc ngay!";
            playTrack(VOICE_DAILY_LIMIT);
          } else if (res.message.indexOf("not active") >= 0) {
            resultMessage = "The khong hoat dong!";
            playTrack(VOICE_CARD_INACTIVE);
          } else {
            resultMessage = "Thanh toan that bai!";
            playTrack(VOICE_PAY_FAIL);
          }
        }

        enterState(STATE_RESULT);
        showResult(resultSuccess, resultMessage.c_str(), res.newBalance);
        resultDisplayedAt = now;
        break;
      }
      // Cancel
      if (cancelPressed || now - stateEnteredAt > 30000) {
        transitionToIdle();
      }
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_SELECT_TOPUP_AMOUNT:
      if (payPressed) {
        selectedAmountIdx = (selectedAmountIdx - 1 + NUM_AMOUNTS) % NUM_AMOUNTS;
        showSelectAmount(selectedAmountIdx, "Tien nap");
        break;
      }
      if (topupPressed) {
        selectedAmountIdx = (selectedAmountIdx + 1) % NUM_AMOUNTS;
        showSelectAmount(selectedAmountIdx, "Tien nap");
        break;
      }
      if (confirmPressed) {
        currentTopupAmount = AMOUNTS[selectedAmountIdx];
        enterState(STATE_PROCESSING);
        showProcessing("Tao QR nap tien...");

        TopupQrResult qr = startTopupQr(currentCardUid, currentTopupAmount);
        if (!qr.success) {
          showError("Khong tao duoc QR");
          delay(2000);
          transitionToIdle();
          break;
        }
        currentRefCode = qr.refCode;
        enterState(STATE_TOPUP_QR);
        showTopupQR(currentRefCode, currentTopupAmount);
        playTrack(VOICE_READY);
        break;
      }
      if (cancelPressed || now - stateEnteredAt > 30000) {
        transitionToIdle();
      }
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_PROCESSING:
      // Màn hình processing — không nhận input
      // Chỉ update animation spinner
      if (now % 500 < 50) showProcessing();
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_RESULT:
      // Tự động về IDLE sau 3 giây
      if (now - resultDisplayedAt > 3000) {
        transitionToIdle();
      }
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_TOPUP_QR:
      // Chuyển sang polling ngay
      enterState(STATE_TOPUP_POLLING);
      lastPollAt = 0;  // Poll ngay
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_TOPUP_POLLING:
      // Timeout 30 phút
      if (now - stateEnteredAt > TOPUP_TIMEOUT_MS) {
        Serial.println("[TOPUP] Timeout 30 min");
        showError("Het gio nap tien");
        delay(2000);
        transitionToIdle();
        break;
      }

      // Cancel bằng long press
      if (cancelPressed) {
        showError("Da huy nap tien");
        delay(1500);
        transitionToIdle();
        break;
      }

      // Vẽ màn hình QR (chỉ lần đầu vào state)
      if (prevState != STATE_TOPUP_POLLING) {
        showTopupQR(currentRefCode, currentTopupAmount);
      }

      // Poll mỗi POLL_INTERVAL_MS
      if (now - lastPollAt > POLL_INTERVAL_MS) {
        lastPollAt = now;
        unsigned long elapsed = (now - stateEnteredAt) / 1000;
        showTopupPolling(elapsed);

        TopupStatus ts = pollTopupStatus(currentRefCode);
        Serial.printf("[TOPUP] Poll status: %s\n", ts.status.c_str());

        if (ts.status == "success") {
          resultSuccess = true;
          char msg[48];
          snprintf(msg, sizeof(msg), "Nap %ld d thanh cong!", ts.amount);
          resultMessage = String(msg);
          playTrack(VOICE_TOPUP_OK);
          delay(300);
          if (ts.balance >= 0) speakBalance(ts.balance);

          enterState(STATE_RESULT);
          showResult(true, msg, ts.balance);
          resultDisplayedAt = now;
        } else if (ts.status == "failed" || ts.status == "refunded") {
          enterState(STATE_RESULT);
          showResult(false, "Giao dich bi tu choi");
          resultDisplayedAt = now;
        }
        // "pending" → tiếp tục poll
      }
      prevState = STATE_TOPUP_POLLING;  // Đánh dấu đã vẽ
      break;

    // ────────────────────────────────────────────────────────────────────
    case STATE_ERROR:
      // Thử reconnect WiFi mỗi 15 giây
      if (now - stateEnteredAt > 15000) {
        showWifiConnecting();
        bool ok = connectWifi(15);
        if (ok) {
          fetchStaticQr();
          transitionToIdle();
        } else {
          stateEnteredAt = now;
          showError("Khong co mang. Thu lai...");
        }
      }
      break;
  }

  delay(20);  // Small yield để tránh WDT với loop quá nhanh
}

// END OF FIRMWARE
