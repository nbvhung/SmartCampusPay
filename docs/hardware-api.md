# Tài liệu API cho thiết bị phần cứng (POS/NFC)

Phiên bản: 1.0 · Dành cho bên phát triển firmware ESP32/ESP32-S3.

> Tài liệu này là **API contract** giữa thiết bị phần cứng và backend.
> Bên phần cứng viết firmware gọi các endpoint dưới đây qua **HTTPS**.
> Bản OpenAPI tự sinh: `GET /api/docs` (Swagger UI).

## 1. Thông tin chung

| Mục | Giá trị |
|---|---|
| Base URL (dev) | `http://localhost:4000/api/v1` |
| Base URL (prod/demo) | `https://<public-url>/api/v1` |
| Auth thiết bị | Header `X-API-Key: <merchant_api_key>` |
| Format | JSON, UTF-8 |
| Response chuẩn | `{ "success": true, "data": T, "timestamp": "..." }` |
| Rate limit | 100 request/phút/IP |

Mọi request từ thiết bị **bắt buộc** kèm header:

```
X-API-Key: scp_xxxxxxxxxxxxxxxx
```

API key được tạo khi admin tạo merchant (`POST /api/v1/merchants`). Cấp riêng 1 key cho **mỗi thiết bị** để dễ thu hồi khi mất cắp.

## 2. Quy tắc idempotency (chống thanh toán trùng)

- Mọi request **thanh toán** phải kèm `idempotencyKey` là **UUID** sinh ngay tại thiết bị, giữ nguyên khi **retry** cùng 1 giao dịch.
- Nếu gửi lại cùng key, backend trả về giao dịch cũ (không trừ tiền lần 2).
- Với **nạp tiền**, backend tự chống trùng theo `transferId` của ngân hàng — thiết bị không cần làm gì thêm.

## 3. Danh sách endpoint

| # | Method | Đường dẫn | Mục đích |
|---|---|---|---|
| 1 | `POST` | `/transactions/pay` | Thanh toán bằng mã SV (phòng hờ) |
| 2 | `POST` | `/transactions/pay/card` | **Thanh toán bằng thẻ NFC** (chính) |
| 3 | `GET` | `/hardware/students/by-uid/:uid` | Quẹt thẻ → lấy tên SV để chào |
| 4 | `POST` | `/hardware/topup/qr` | Nạp tiền: tạo QR động cho 1 SV |
| 5 | `GET` | `/hardware/topup/status/:refCode` | Nạp tiền: hỏi kết quả (polling) |
| 6 | `GET` | `/hardware/static-qr` | Nạp tiền: lấy QR tĩnh chung |

---

## 4. Chi tiết endpoint

### 4.1. POST `/transactions/pay` — Thanh toán bằng mã SV

```json
{
  "studentCode": "20210012",
  "merchantId": "9f0f6c21-...",
  "amount": 25000,
  "idempotencyKey": "3c9b1e2a-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

Thiết bị **thông thường dùng endpoint 4.2** (quét thẻ). Endpoint này dùng khi SV gõ mã thủ công.

### 4.2. POST `/transactions/pay/card` — Thanh toán bằng thẻ NFC (chính)

**Request:**
```json
{
  "cardUid": "A1B2C3D4",
  "amount": 25000,
  "idempotencyKey": "3c9b1e2a-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
}
```

`cardUid` = UID đọc từ chip NFC (chuỗi hex, viết hoa/không dấu cách).

**Response thành công (HTTP 200):**
```json
{
  "success": true,
  "data": {
    "id": "e3f2...",
    "amount": 25000,
    "type": "debit",
    "status": "success",
    "studentCode": "20210012",
    "studentId": "8a1c...",
    "accountId": "5b9d...",
    "merchantId": "9f0f...",
    "description": "Payment",
    "createdAt": "2026-08-02T10:00:00.000Z"
  },
  "timestamp": "2026-08-02T10:00:00.120Z"
}
```

**Lỗi thanh toán (HTTP 400)** — ví dụ:
```json
{ "success": false, "data": null, "timestamp": "...", "message": "Insufficient balance" }
```

Danh sách lỗi:
| message | Ý nghĩa | Hành động thiết bị |
|---|---|---|
| `Card is not active` | Thẻ bị khóa/mất | Voice "Thẻ không hoạt động" |
| `Insufficient balance` | Không đủ số dư | Voice "Không đủ số dư" |
| `Daily limit exceeded` | Vượt hạn mức ngày | Voice "Vượt hạn mức ngày" |
| `Invalid student` | SV bị khóa | Voice "Sinh viên bị khóa" |
| `Account is frozen` | Ví bị đóng băng | Voice "Ví bị đóng băng" |

> Sau khi nhận response, thiết bị hiển thị + đọc giọng nói:
> "Thanh toán thành công, số dư X đồng" — hoặc thông báo lỗi tương ứng.
> Có thể lấy số dư mới qua `GET /accounts/balance/:studentId` (JWT) hoặc tự tính.

### 4.3. GET `/hardware/students/by-uid/:uid` — Tra cứu SV theo thẻ

Quẹt thẻ → gọi endpoint này → hiện "Xin chào, Nguyễn Văn A".

**Response:**
```json
{
  "success": true,
  "data": { "studentCode": "20210012", "fullName": "Nguyễn Văn A" },
  "timestamp": "..."
}
```

### 4.4. POST `/hardware/topup/qr` — Tạo QR động để nạp tiền

Flow: SV quẹt thẻ trên thiết bị → thiết bị tạo QR riêng (chứa refCode) → SV quét bằng app ngân hàng → chuyển tiền → backend tự cộng vào đúng ví của SV.

**Request** (2 cách, ưu tiên `cardUid`):
```json
{ "cardUid": "A1B2C3D4" }
```
hoặc
```json
{ "studentCode": "20210012" }
```

**Response:**
```json
{
  "success": true,
  "data": {
    "referenceCode": "SCP20210012AB12CD",
    "qrUrl": "https://qr.sepay.vn/img?acc=...&bank=970422&des=SCP20210012AB12CD",
    "amount": 0,
    "expiresAt": "2026-08-02T10:30:00.000Z"
  },
  "timestamp": "..."
}
```

Ghi chú:
- `amount = 0` nghĩa là **QR không gắn số tiền cố định** — SV tự nhập số tiền khi chuyển.
- Hiển thị `qrUrl` lên màn hình (render QR bằng thư viện `qrcodegen`).
- Sau khi SV chuyển khoản, thiết bị **poll** endpoint 4.5 đến khi `status = success` hoặc hết hạn.

### 4.5. GET `/hardware/topup/status/:refCode` — Hỏi kết quả nạp (polling)

Thiết bị gọi mỗi **3–5 giây** sau khi SV chuyển khoản.

**Response khi thành công:**
```json
{
  "success": true,
  "data": {
    "status": "success",
    "amount": 50000,
    "balance": 250000,
    "studentCode": "20210012"
  },
  "timestamp": "..."
}
```

Khi nhận `status = success`: màn hình hiện "Nạp tiền thành công, số dư 250.000đ" + **giọng nói**, rồi về màn hình chờ.

Các giá trị `status`: `pending` (chờ), `success`, `failed`, `refunded`.

> **Cơ chế chống trùng**: backend khớp nội dung chuyển khoản theo `referenceCode`/mã SV.
> Không khớp được → giao dịch nằm trong "hàng đợi chưa khớp" để admin xác nhận thủ công.
> Nên khuyến khích SV ghi đúng nội dung để tự động nhanh.

### 4.6. GET `/hardware/static-qr` — QR tĩnh chung

QR chung của trường (số tài khoản cố định), hiện sẵn trên màn hình hoặc in giấy dán.
SV quét → **phải ghi mã SV vào nội dung chuyển khoản** → backend tự khớp mã SV để cộng tiền.

**Response:**
```json
{
  "success": true,
  "data": {
    "qrUrl": "https://qr.sepay.vn/img?acc=...&des=Nap+tien+SmartCampusPay+-+ghi+ro+ma+SV",
    "bankName": "MBBank",
    "accountNumber": "VQRQAKHGV3200",
    "description": "Nap tien SmartCampusPay - ghi ro ma SV"
  },
  "timestamp": "..."
}
```

---

## 5. Luồng nghiệp vụ (tổng hợp cho firmware)

### 5.1. Thanh toán tại merchant
```
1. Idle: màn hình hiện QR tĩnh + "Quẹt thẻ thanh toán"
2. SV quẹt thẻ NFC → đọc UID
3. GET /hardware/students/by-uid/:uid → hiện tên SV
4. POST /transactions/pay/card { cardUid, amount, idempotencyKey }
5. Response success → hiện "Thanh toán thành công" + voice + (tùy chọn) số dư mới
   Response lỗi → hiện + voice lỗi tương ứng
```

### 5.2. Nạp tiền — QR động (đề xuất)
```
1. Màn hình: "Nạp tiền — quẹt thẻ"
2. SV quẹt thẻ → POST /hardware/topup/qr { cardUid }
3. Hiện QR + "Quét bằng app ngân hàng, nhập số tiền rồi chuyển"
4. Poll GET /hardware/topup/status/:refCode mỗi 3-5s
5. status = success → hiện số dư + voice "Nạp tiền thành công"
6. Hết hạn (30 phút) → quay lại màn hình chờ
```

### 5.3. Nạp tiền — QR tĩnh (theo yêu cầu hội đồng)
```
1. Màn hình hiện QR tĩnh (hoặc in giấy) + hướng dẫn "Nhớ ghi MÃ SINH VIÊN"
2. SV quét, chuyển khoản kèm mã SV
3. Backend tự khớp mã SV → cộng tiền (nếu SV gõ đúng mã)
4. Nếu SV quên/ghi sai mã → giao dịch vào hàng đợi, admin xử lý thủ công
5. (Tuỳ chọn) SV quẹt thẻ sau khi chuyển → thiết bị poll 1 refCode tạm / hoặc xem số dư
```

---

## 6. Mã lỗi chuẩn

| HTTP | Ý nghĩa | Ghi chú cho thiết bị |
|---|---|---|
| 400 | Dữ liệu không hợp lệ / nghiệp vụ lỗi | Đọc `message`, phát voice tương ứng |
| 401 | Thiếu/sai `X-API-Key` | Kiểm tra cấu hình key |
| 404 | Không tìm thấy tài nguyên | Ví dụ: thẻ chưa đăng ký |
| 429 | Vượt rate limit | Chờ rồi retry |
| 5xx | Lỗi hệ thống | Retry với cùng `idempotencyKey` |

## 7. Ghi chú kết nối demo

- Thiết bị dùng **WiFi + HTTPS** tới `BASE_URL` (backend public).
- Backend cần URL public để: SePay webhook gọi vào + thiết bị gọi ra.
- Khi demo: backend deploy cloud (Render/…), Postgres = Neon, Redis = Upstash. Hoặc chạy laptop + tunnel `ngrok`/`cloudflared` và cấu hình URL đó vào firmware.

Xem thêm: `docs/esp32-reference.ino` (sketch tham khảo).
