/*
 * SmartCampusPay — Firmware tham khảo ESP32-S3 (POS + NFC + QR + giọng nói)
 * =========================================================================
 * Dành cho bên phát triển phần cứng. Đây là khung tham khảo, cần điều chỉnh
 * theo sơ đồ chân thật và thư viện cụ thể.
 *
 * Phần cứng gợi ý:
 *   - MCU      : ESP32-S3 DevKitC-1 (có PSRAM)
 *   - NFC      : RC522 (13.56MHz, SPI)  — hoặc PN532
 *   - Màn hình : TFT SPI 1.8"/2.4" (ST7735 / ILI9341)
 *   - Âm thanh : DFPlayer Mini + module thẻ SD (MP3 cụm từ tiếng Việt)
 *
 * Thư viện cần cài (Arduino Library Manager):
 *   - MFRC522
 *   - WiFiClientSecure (đi kèm)
 *   - HTTPClient
 *   - ArduinoJson  (Benoit Blanchon)
 *   - qrcodegen (qr.h) nếu muốn render QR lên màn hình
 *   - DFRobotDFPlayerMini (hoặc điều khiển DFPlayer bằng UART trực tiếp)
 *
 * Lưu ý bảo mật: `setInsecure()` chỉ để dev/test. Khi production phải
 * gắn root CA chính thức của backend.
 */

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <SPI.h>
#include <MFRC522.h>
#include <SoftwareSerial.h>

// ── Cấu hình kết nối ────────────────────────────────────────────────────────
const char* WIFI_SSID = "TenWifi";
const char* WIFI_PASS = "MatKhauWifi";

// URL public của backend (cloud hoặc tunnel). Không có dấu / cuối.
const char* BASE_URL = "https://xxx.onrender.com/api/v1";

// API key merchant — cấp riêng cho thiết bị này
const char* API_KEY = "scp_xxxxxxxxxxxxxxxxxxxxxxxx";

// ── Chân nối (điều chỉnh theo bo thật) ─────────────────────────────────────
#define RST_PIN   22   // RC522 RST
#define SS_PIN    21   // RC522 SDA/SS
#define RX_DFPLAYER 18 // DFPlayer RX (qua SoftwareSerial)
#define TX_DFPLAYER 19 // DFPlayer TX

// ── Biến toàn cục ──────────────────────────────────────────────────────────
MFRC522 rfid(SS_PIN, RST_PIN);
SoftwareSerial dfplayerSerial(RX_DFPLAYER, TX_DFPLAYER);
WiFiClientSecure client;

// Track trạng thái thanh toán đang xử lý
String currentRefCode = "";   // refCode của lần nạp tiền đang chờ
String lastCardUid = "";      // UID thẻ vừa quẹt (chống đọc trùng liên tục)

// ── Voice (DFPlayer): số track tương ứng file MP3 trong thẻ SD ─────────────
#define VOICE_READY         1   // "Vui lòng quẹt thẻ"
#define VOICE_PAY_OK        2   // "Thanh toán thành công"
#define VOICE_PAY_FAIL      3   // "Thanh toán thất bại"
#define VOICE_INSUFFICIENT  4   // "Không đủ số dư"
#define VOICE_TOPUP_OK      5   // "Nạp tiền thành công"
#define VOICE_BALANCE       6   // "Số dư"

void playTrack(uint16_t track) {
  // Gửi lệnh DFPlayer: 7E FF 06 06 00 00 01 <trackHi> <trackLo> EF
  // (hoặc dùng thư viện DFRobotDFPlayerMini cho gọn)
  dfplayerSerial.write(0x7E);
  dfplayerSerial.write(0xFF);
  dfplayerSerial.write(0x06);
  dfplayerSerial.write(0x06);           // 0x06 = play index
  dfplayerSerial.write(0x00);
  dfplayerSerial.write(0x00);
  dfplayerSerial.write(0x01);
  dfplayerSerial.write(highByte(track));
  dfplayerSerial.write(lowByte(track));
  dfplayerSerial.write(0xEF);
}

void speakBalance(long balance) {
  // Đọc số dư: "Số dư 250 ngàn đồng" — ví dụ ghép track số dư + từng chữ số
  playTrack(VOICE_BALANCE);
  delay(900);
  long v = balance;
  int digits[10], n = 0;
  if (v == 0) { playTrack(0); return; }
  while (v > 0) { digits[n++] = v % 10; v /= 10; }
  for (int i = n - 1; i >= 0; i--) {
    playTrack(10 + digits[i]);          // track 10..19 = "0".."9"
    delay(700);
  }
  playTrack(20);                         // track 20 = "đồng"
}

// ── HTTP helper ─────────────────────────────────────────────────────────────
String apiRequest(const String& method, const String& path, const String& body = "") {
  HTTPClient http;
  http.begin(client, String(BASE_URL) + path);
  http.addHeader("X-API-Key", API_KEY);
  http.addHeader("Content-Type", "application/json");

  int code = -1;
  if (method == "GET")      code = http.GET();
  else if (method == "POST") code = http.POST(body);
  String resp = code > 0 ? http.getString() : "";

  http.end();
  Serial.printf("[HTTP] %s %s -> %d\n", method.c_str(), path.c_str(), code);
  if (code < 0) return "";
  return resp;
}

// ── Đọc UID thẻ NFC ────────────────────────────────────────────────────────
String readCardUid() {
  if (!rfid.PICC_IsNewCardPresent() || !rfid.PICC_ReadCardSerial()) {
    return "";
  }
  String uid = "";
  for (byte i = 0; i < rfid.uid.size; i++) {
    if (uid.length() > 0) uid += " ";
    if (rfid.uid.uidByte[i] < 0x10) uid += "0";
    uid += String(rfid.uid.uidByte[i], HEX);
  }
  uid.toUpperCase();
  rfid.PICC_HaltA();
  return uid;
}

// ── Tạo idempotencyKey (UUID dạng đơn giản cho thiết bị) ───────────────────
String makeIdempotencyKey() {
  String key = String((uint32_t)random(0x7FFFFFFF), HEX) + "-" +
               String((uint32_t)random(0x7FFFFFFF), HEX) + "-" +
               String((uint32_t)random(0x7FFFFFFF), HEX);
  return key;
}

// ── Nghiệp vụ: thanh toán bằng thẻ ─────────────────────────────────────────
bool doPayment(const String& cardUid, long amount) {
  StaticJsonDocument<256> body;
  body["cardUid"] = cardUid;
  body["amount"] = amount;
  body["idempotencyKey"] = makeIdempotencyKey();

  String payload;
  serializeJson(body, payload);
  String resp = apiRequest("POST", "/transactions/pay/card", payload);

  DynamicJsonDocument doc(1024);
  deserializeJson(doc, resp);
  bool ok = doc["success"] | false;

  if (ok) {
    Serial.println("[PAY] success");
    playTrack(VOICE_PAY_OK);   // "Thanh toán thành công"
    delay(1200);
    // Nếu backend trả số dư, có thể đọc "Số dư X đồng"
    // speakBalance(...);
  } else {
    const char* msg = doc["message"] | "";
    Serial.printf("[PAY] fail: %s\n", msg);
    if (strcmp(msg, "Insufficient balance") == 0) playTrack(VOICE_INSUFFICIENT);
    else playTrack(VOICE_PAY_FAIL);
  }
  return ok;
}

// ── Nghiệp vụ: nạp tiền QR động + polling ──────────────────────────────────
bool startTopup(const String& cardUid) {
  StaticJsonDocument<128> body;
  body["cardUid"] = cardUid;
  String payload; serializeJson(body, payload);

  String resp = apiRequest("POST", "/hardware/topup/qr", payload);
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, resp);

  if (!(doc["success"] | false)) return false;

  currentRefCode = doc["data"]["referenceCode"] | "";
  const char* qrUrl = doc["data"]["qrUrl"] | "";
  Serial.printf("[TOPUP] ref=%s\n", currentRefCode.c_str());
  // TODO: render qrUrl lên màn hình TFT (thư viện qrcodegen)
  playTrack(VOICE_READY);
  return currentRefCode.length() > 0;
}

bool pollTopupStatus() {
  if (currentRefCode.length() == 0) return true;

  String resp = apiRequest("GET", "/hardware/topup/status/" + currentRefCode);
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, resp);

  if (!(doc["success"] | false)) return false;

  const char* status = doc["data"]["status"] | "";
  long balance = doc["data"]["balance"] | 0;

  if (strcmp(status, "success") == 0) {
    Serial.println("[TOPUP] success");
    playTrack(VOICE_TOPUP_OK);   // "Nạp tiền thành công"
    delay(1200);
    speakBalance(balance);       // "Số dư X đồng"
    currentRefCode = "";
    return true;
  }
  return false; // vẫn đang pending, tiếp tục poll
}

// ── Setup / Loop ────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  SPI.begin();
  rfid.PCD_Init();
  dfplayerSerial.begin(9600);
  randomSeed(analogRead(0));

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) { delay(500); }
  Serial.printf("[NET] connected, IP = %s\n", WiFi.localIP().toString().c_str());

  client.setInsecure(); // CHỈ dev — production phải gắn root CA

  // Lấy QR tĩnh về hiện trên màn hình
  String qrResp = apiRequest("GET", "/hardware/static-qr");
  DynamicJsonDocument qrDoc(1024);
  deserializeJson(qrDoc, qrResp);
  // TODO: render qrDoc["data"]["qrUrl"] lên màn hình

  playTrack(VOICE_READY);
}

unsigned long lastPoll = 0;
unsigned long lastSwipe = 0;
String lastUid = "";

void loop() {
  // 1) Đang chờ kết quả nạp tiền → poll mỗi 4 giây
  if (currentRefCode.length() > 0 && millis() - lastPoll > 4000) {
    lastPoll = millis();
    if (pollTopupStatus()) { /* xong, về màn hình chờ */ }
  }

  // 2) Chờ quẹt thẻ (chống đọc trùng: 2 giây/lần)
  if (millis() - lastSwipe < 2000) return;
  String uid = readCardUid();
  if (uid.length() == 0) return;
  lastSwipe = millis();
  if (uid == lastUid) return;   // cùng UID → bỏ qua
  lastUid = uid;

  Serial.printf("[NFC] UID = %s\n", uid.c_str());

  // Lấy tên SV hiện lên màn hình
  String infoResp = apiRequest("GET", "/hardware/students/by-uid/" + uid);
  DynamicJsonDocument info(1024);
  deserializeJson(info, infoResp);
  // TODO: hiện fullName lên màn hình

  // Mặc định: bấm nút 1 = thanh toán, nút 2 = nạp tiền (đọc nút GPIO)
  // int mode = readButton();  // 1 = pay, 2 = topup
  int mode = 1; // demo: luôn thanh toán

  if (mode == 1) {
    long amount = 25000;       // đọc từ bàn phím / danh sách giá
    doPayment(uid, amount);
  } else {
    if (startTopup(uid)) {
      playTrack(VOICE_READY);
    }
  }
}
