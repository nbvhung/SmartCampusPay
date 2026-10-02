# Kiểm chứng phần mềm trước khi nối thiết bị

## Kết quả triển khai ngày 02/10/2026

- Backend build pass; 31 unit tests và 35 HTTP/integration tests pass với PostgreSQL/Redis thật.
- Frontend build pass; 6 bài kiểm thử lưu/khôi phục giao dịch pass; lint các file POS, persistence và proxy đã thay đổi pass.
- Lint toàn frontend còn 33 errors/12 warnings ở các file khác (explicit any, effect/setState, v.v.); cần xử lý trước khi đặt lint toàn repo làm điều kiện CI.
- Đã áp `PrepareHardwareIntegration1790899200000` lên database local sau preflight: không có ví/giao dịch âm hoặc UID trùng sau chuẩn hóa.
- Bản sao lưu trước migration: `be/.backups/before-hardware-2026-10-02T03-27-02-920Z.dump`, không đưa vào Git.
- Đã sửa cấu hình build để runtime nằm đúng `dist/main.js`. `node scripts/smoke-api.cjs` khởi động toàn AppModule trên cổng 4100, kiểm tra Swagger và response xác thực thiết bị, rồi dừng process thử.
- Chưa build Arduino hoặc thử reader/WiFi/NVS trên thiết bị thật. Các bước nghiệm thu phần cứng bên dưới vẫn bắt buộc.

## Chạy kiểm thử

Backend:

```powershell
cd be
npm run build
npm run test -- --runInBand
npm run test:e2e -- --runInBand
node scripts/smoke-api.cjs
```

E2E kết nối PostgreSQL bằng `TEST_DB_HOST/PORT/USER/PASS`, fallback sang biến DB trong `.env`. User cần quyền CREATE DATABASE. Suite tạo database riêng `scp_integration_<timestamp>_<pid>`, chạy migrations thật rồi xóa đúng database đó; không sửa dữ liệu SmartCampusPay hiện có. Redis dùng `TEST_REDIS_HOST/PORT`, fallback sang biến REDIS hiện có. Bộ test kiểm tra lock Redis thật và cả thanh toán với Redis fallback.

Có thể dùng môi trường riêng:

```powershell
docker compose -f compose.test.yaml up -d
cd be
$env:TEST_DB_PORT = '5433'
$env:TEST_REDIS_PORT = '6380'
npm run test:e2e -- --runInBand
```

Frontend: `cd fe; npm run build`. Build hiện cần tải Google Fonts. `npm run test` (Node 22.18+/24) kiểm tra khôi phục payload/key, khóa theo fingerprint API key, lỗi storage và kết thúc giao dịch. Chạy `npx eslint src/app/pos/page.tsx src/lib/pos-api.ts src/lib/pos-payment.ts src/proxy.ts test/pos-payment.test.mjs` để kiểm tra phần frontend tích hợp vừa thay đổi.

## Nâng database đang có

Sao lưu trước khi nâng. Chạy `npm run migration:show`, sau đó `npm run migration:run` trong `be`. Runtime mặc định không còn tự đồng bộ schema; phải chạy migrations trước khi khởi động bản mới. Migration mới thêm ngày hạn mức, UID giao dịch và hạn QR; giữ nguyên số tiền đã chi trong ngày. UID được chuẩn hóa, unique constraint sẽ từ chối migration nếu các thẻ cũ trùng nhau sau chuẩn hóa. Cần giải quyết dữ liệu trùng trước khi chạy lại; không tự xóa thẻ.

Helper local: `node scripts/preflight-hardware-migration.cjs`, sau đó `node scripts/backup-local-db.cjs <đường-dẫn-pg_dump>`. Bản dump được đặt trong `.backups` và bỏ qua Git. Khôi phục bằng `pg_restore` vào database riêng để kiểm tra trước khi dùng cho rollback.

Nếu database trước đây được tạo bằng `synchronize` và chưa có bảng lịch sử migration, không chạy Initial trực tiếp lên các bảng đã có. Cần đối chiếu schema và baseline migration trước; bộ E2E xác minh đường tạo mới và nâng schema có lịch sử migration.

Các giao dịch cũ chưa lưu UID không thể xác minh replay qua UID an toàn. Tra cứu bằng `GET /transactions/payments/:key` với đúng merchant key để xác định kết quả; không tạo giao dịch mới khi kết quả còn chưa rõ.

## Thử thiết bị và trình duyệt

1. Dùng tài khoản/ví thử, đăng ký UID có số 0 đầu; cấp raw API key merchant cho thiết bị.
2. Gửi pay/card, ngắt response sau khi server đã commit; retry cùng UUID/payload. Phải trả cùng transaction ID và chỉ trừ một lần.
3. Reboot khi chưa rõ kết quả. Firmware phải replay payload trong NVS trước khi nhận giao dịch mới.
4. POS web: refresh sau timeout phải khôi phục UID/amount/key và khóa chỉnh payload; nhập lại đúng API key (đối chiếu SHA-256 fingerprint). Không lưu raw API key vào localStorage. Các tab POS được tuần tự hóa bằng Web Locks; cần HTTPS hoặc localhost.
5. Khóa thẻ sau pay rồi replay: vẫn trả giao dịch thành công cũ. UUID mới phải bị từ chối.
6. Gửi webhook hai lần/cùng lúc; một transfer chỉ cộng một lần. Chuyển thêm vào QR đã dùng, sai tiền, hết hạn hoặc bị hủy phải xuất hiện ở hàng đợi.
7. Thử mất WiFi, 401, 429, 5xx: giữ payload/key, backoff, không báo thất bại dứt khoát khi chưa có kết quả.

Firmware `.ino` là mã tham khảo; phải build với đúng ESP32 core/thư viện và chạy các bước trên bằng thiết bị thật trước nghiệm thu. File này chưa được chứng minh tương thích toàn bộ phiên bản Arduino/ESP32.
