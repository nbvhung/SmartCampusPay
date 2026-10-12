# Đánh giá hiện trạng và kế hoạch triển khai 100 người dùng

Ngày đánh giá: 10/10/2026. Mốc code: `17da652` (merge PR #8).
Phạm vi: đọc code, lịch sử commit, cấu hình và kiểm tra build/test; không triển khai server hoặc thay đổi nghiệp vụ trong đợt đánh giá này.

## 1. Kết luận

Có thể triển khai phần mềm trước khi kết nối đầu đọc NFC. Thiết bị có mạng gọi HTTPS API trên server; không cần server ở cùng mạng LAN. Khi có thiết bị, cấu hình URL, API key, TLS và kiểm thử firmware rồi mở sử dụng từng điểm bán. Backend chỉ cần cập nhật nếu hợp đồng API/nghiệp vụ thay đổi.

Tuy nhiên HEAD hiện tại **chưa đủ điều kiện mở production cho 100 người dùng thật**. NotificationsModule từ chối SMS mock ở production và chưa có provider thật; luồng đăng ký chưa ràng buộc người nhận OTP với chủ MSSV. Cần xử lý các mục P0 bên dưới trước.

Phân biệt thiếu đầu đọc với thiếu dữ liệu thẻ: code hiện yêu cầu MSSV đã được gán UID thẻ hoạt động, không phải `MOCK-*`, trước khi đăng ký. Có danh sách UID thật thì có thể import trước mà chưa cần đầu đọc online. Chưa có UID thì cần thiết kế onboarding chưa gán thẻ, tách kích hoạt tài khoản và liên kết thẻ; không nhập UID giả vào production để lách điều kiện.

## 2. Commit mới và nghiệp vụ đăng ký

| Commit | Thay đổi và nhận xét |
| --- | --- |
| `99ca857` — 06/10 | Provision Student + physical Card trong transaction; admin nhập MSSV và UID hoặc import Excel; chưa tạo ví lúc provisioning. |
| `72785a9` — 06/10 | OTP Redis, HMAC, TTL, cooldown, giới hạn số lần nhập/gửi, SmsSender abstraction; mới có MockSmsSender. |
| `fc949b8` — 06/10 | Verify OTP rồi khóa Student, kiểm tra lại điều kiện, tạo Account và cập nhật đăng ký trong cùng transaction; có xử lý rollback/OTP cleanup. |
| `f26cec7` — 07/10 | UI đăng ký và quản trị provisioning; đồng bộ với hợp đồng API mới. |
| `7aa8510` — 08/10 | Hoàn thiện đăng ký và đổi mật khẩu; yêu cầu mật khẩu hiện tại, cấm dùng lại, thu hồi phiên hiện tại, quay lại đăng nhập. |
| `b87c197` — 08/10 | Sinh viên hoàn thiện hồ sơ; giới hạn trường được tự sửa. |
| `bf5535f` — 08/10 | Ví one-to-one và snapshot số dư trước/sau giao dịch; bổ sung migration và test. |
| `c8185fd` — 08/10 | Cứng hóa QR nạp tiền SePay, số tiền và phạm vi merchant. |
| `dbfa3a7` — 08/10 | Hoàn thiện hợp đồng NFC POS, lưu payload/UUID qua reboot, tra cứu kết quả và retry. |

Luồng hiện tại: admin cấp phát MSSV + UID → sinh viên nhập MSSV + SĐT → OTP → tạo ví số dư 0, mật khẩu ban đầu bằng SĐT → đăng nhập → bắt buộc đổi mật khẩu → đăng nhập lại → hoàn thiện hồ sơ.

Điểm tốt: việc tạo ví có transaction và khóa hàng; kiểm tra lại sinh viên/thẻ ở thời điểm verify; kiểm tra ví kể cả đã archive; OTP không lưu plaintext mà lưu HMAC; guard backend chặn chức năng ngoài đổi mật khẩu khi chưa hoàn thành bước đó. Tests đăng ký đã có các tình huống sai/hết hạn OTP, đăng ký trùng/đồng thời, rollback, sinh viên bị vô hiệu hóa và thẻ bị bỏ sau khi gửi OTP.

## 3. Phát hiện cần xử lý

### P0 — trước khi mở người dùng thật

1. **OTP chưa xác minh chủ MSSV.** `be/src/modules/auth/registration.service.ts:34` nhận SĐT do người gọi tự nhập; không so với dữ liệu đã xác minh, không yêu cầu invitation token hoặc bằng chứng danh tính. `assertPhysicalCard` chỉ kiểm tra thẻ tồn tại trong DB, không chứng minh người đăng ký đang giữ thẻ. Người biết MSSV chưa kích hoạt có thể đăng ký bằng SĐT của mình khi có SMS thật. Đề xuất pilot: admin xác minh danh tính và cấp invitation token dùng một lần, gắn MSSV; hoặc import SĐT đã xác minh và chỉ gửi OTP đến số đó. Kiểm tra token/ràng buộc danh tính cả khi request và verify.
2. **Production không khởi động được với provider hiện có.** `be/src/modules/notifications/notifications.module.ts:19`: mock bị cấm ở production; mọi tên provider khác đều unsupported. Thêm adapter SMS thật, timeout, xử lý lỗi và test production boot. Không dùng `NODE_ENV=development` trên production để vượt qua kiểm tra.
3. **SĐT là mật khẩu ban đầu có thể đoán.** `be/src/modules/auth/registration.service.ts:83`. Bcrypt chỉ bảo vệ dữ liệu lưu, không làm SĐT trở thành bí mật mạnh; guard đổi mật khẩu không giải quyết trường hợp người khác đăng nhập trước rồi đổi mật khẩu. Đề xuất OTP thành công cấp quyền đặt mật khẩu thời hạn ngắn, dùng một lần, chỉ cho phép password setup; không cấp mật khẩu đăng nhập bằng SĐT.
4. **Bootstrap admin có mật khẩu mặc định.** `be/src/modules/admins/admins.service.ts:88` fallback `Admin@123`. Production phải bắt buộc secret bootstrap riêng, bỏ fallback production, khởi tạo có kiểm soát; không nhầm với mật khẩu ghi trong AGENTS.md.

### P1 — trước pilot công khai

- **Định danh IP qua proxy:** controller dùng `req.ip`; chưa thấy cấu hình `trust proxy` trong bootstrap. Qua Next rewrite/reverse proxy, nhiều sinh viên có thể bị tính chung IP; OTP mặc định 20 request/client/giờ. Kể cả IP đúng, 100 sinh viên dùng chung Wi-Fi trường vẫn có thể cùng NAT. Cấu hình chỉ tin proxy nội bộ, overwrite forwarded headers, phối hợp rate limit theo MSSV/phone/invitation; test thật dưới NAT. Không bật trust mọi forwarded header từ Internet.
- **Đóng gói:** có `compose.test.yaml` cho DB/Redis; chưa thấy Dockerfile, Compose production hoặc pipeline `.github`. Chưa có readiness/liveness endpoint trong code được kiểm tra.
- **Migration runtime:** scripts hiện dựa vào ts-node và `src/database/data-source.js`; chưa có đường migration được chứng minh trong image chỉ chứa production dependencies. Tạo data source JS cho build output hoặc migration image riêng; xác minh `dist/main.js` và migrations/data source thật sự có trong image.
- **Vận hành:** cần backup ngoài máy chủ, thử restore, cảnh báo dung lượng/5xx/DB, log có request ID và không ghi OTP/secret. Ảnh bằng chứng hiện lưu `bytea` trong PostgreSQL, nên backup DB phải bao gồm chúng và dự trù tăng dung lượng.
- **SePay:** xác minh webhook public HTTPS, credentials thật, tài khoản nhận đúng, duplicate/sai tiền/hết hạn vào đối soát. Chưa coi tests nội bộ là xác nhận nhà cung cấp thật đã hoạt động.
- **Thanh toán theo MSSV:** `/transactions/pay` vẫn cho merchant đã xác thực trừ tiền theo mã SV; cần chốt quyền sử dụng đường dự phòng, hạn mức và quy trình xác nhận khách hàng trước pilot tiền thật.
- **Firmware:** `docs/esp32-reference.ino:56` mặc định `USE_INSECURE=true`; khi triển khai phải false và thay ROOT_CA placeholder. Chưa kiểm chứng trên thiết bị thật. UID là định danh thẻ, không nên coi là bằng chứng chống sao chép.
- **Tài liệu:** README còn liệt kê `POST /auth/register`, trong code là `/auth/register/request-otp` và `/auth/register/verify`; cập nhật checklist/seed/hướng dẫn smoke theo HEAD mới.

## 4. Đánh giá theo thành phần

| Thành phần | Hiện trạng |
| --- | --- |
| Backend modular, validation, guard | Đã có nền tảng tương đối đầy đủ; cần production configuration validation. |
| Ví/thanh toán | Có PostgreSQL transaction, khóa hàng, idempotency, audit snapshot; cần E2E lại trên HEAD và load test. |
| Đăng ký | Có workflow và tests; còn P0 xác minh danh tính, SMS, mật khẩu khởi tạo. |
| Student/Admin UI | Có các màn hình chính; cần browser E2E và nghiệm thu mobile. |
| SePay/đối soát | Đã có code và test; cần nghiệm thu webhook ngoài Internet. |
| NFC | Có API và firmware tham khảo; chưa nghiệm thu đầu đọc/Wi-Fi/TLS/NVS thật. |
| Production operations | Chưa có bộ đóng gói/vận hành hoàn chỉnh. |

Không dùng tỷ lệ hoàn thành phần trăm: số màn hình đã có không phản ánh mức an toàn của kích hoạt tài khoản và dòng tiền.

## 5. Kiến trúc pilot đề xuất

Giả định 100 tài khoản đầu tiên, khoảng 10–20 phiên hoạt động đồng thời thường ngày; chưa giả định 100 giao dịch mỗi giây. Cấu hình khởi điểm để đo: một VPS 2 vCPU/4 GB RAM, SSD khoảng 60–80 GB, chạy một replica mỗi ứng dụng. Đây là ước lượng kỹ thuật, không phải cam kết sức tải. Nếu 100 người cùng thao tác hoặc CPU/RAM/latency không đạt ngưỡng thì tăng tài nguyên theo kết quả đo.

```text
Trình duyệt ─────────┐
Thiết bị/gateway ────┼── HTTPS :443 → Reverse proxy
SePay webhook ───────┘                   ├── /api/* → NestJS :4000
                                        └── /*     → Next.js :3000
                                                        
NestJS → PostgreSQL + Redis (mạng nội bộ, không public port)
PostgreSQL → backup mã hóa ngoài VPS
```

Một domain, API cùng origin giúp giữ cookie hiện có. Route API trực tiếp ở reverse proxy; nếu tiếp tục Next rewrites phải kiểm tra backend destination khi build image và forwarding IP. Dùng domain ổn định trong firmware để sau này đổi máy chủ bằng DNS/proxy.

Docker Compose trên một server phù hợp cho quy mô pilot và nhóm nhỏ; mô hình này được Docker hỗ trợ trong hướng dẫn [Compose production](https://docs.docker.com/compose/how-tos/production/). Next.js cũng khuyến nghị đặt [reverse proxy trước server tự host](https://nextjs.org/docs/app/guides/self-hosting). Đây là single point of failure: nếu yêu cầu không gián đoạn khi VPS hỏng, phải nâng phương án HA/managed DB trước khi cam kết SLA.

Chưa chốt nhà cung cấp/chi phí; cần tính cả VPS, backup, domain, SMS và dịch vụ SePay sau khi chọn gói, không chỉ tiền compute.

## 6. Bộ đóng gói cần bàn giao

- `be/Dockerfile`: multi-stage, lockfile + npm ci, compile ở builder; runtime non-root với production dependencies, `node dist/main.js`, shutdown graceful.
- `fe/Dockerfile`: multi-stage, standalone output, copy public/static đúng đường dẫn, non-root; pin Node tương thích cả hai package. Build trong CI, không build trên VPS tài nguyên nhỏ.
- `.dockerignore` tương ứng: loại `.env`, `.git`, node_modules, backup, logs và artifacts test.
- `compose.production.yaml`: proxy, FE, BE, PostgreSQL, Redis; persistent volumes, healthcheck, restart policy, resource/log limits; không publish DB/Redis/BE/FE ra Internet.
- Migration job độc lập, chạy một lần trước rollout; không để nhiều app replicas tự migrate cùng lúc.
- File cấu hình proxy và `.env.production.example` chỉ có placeholder; secrets cấp tại server/secret store. Bắt buộc kiểm tra JWT secrets, OTP secret, admin bootstrap và SMS config khi boot; POS test console tắt.
- PostgreSQL/Redis version được pin; Redis persistence và giới hạn bộ nhớ phù hợp vì có OTP/session/revocation. Redis hiện chỉ nhận host/port: nếu chuyển managed Redis có TLS/password phải bổ sung cấu hình kết nối, không chỉ thay host.
- CI: test → build image → scan dependency/image → gắn tag Git SHA → registry → staging → smoke → production. Không phụ thuộc tag `latest` để rollback.
- Runbook: migrate, deploy, restore, rotate key, xử lý webhook lỗi/đối soát, khóa thẻ và hỗ trợ người dùng.

## 7. Các bước triển khai và điều kiện hoàn thành

| Giai đoạn | Công việc | Điều kiện chuyển bước |
| --- | --- | --- |
| A — Chốt onboarding | Sửa 4 P0; chọn invitation/SĐT xác minh; quyết định có cần đăng ký trước khi có UID | Không chiếm được MSSV bằng số điện thoại lạ; không còn mật khẩu SĐT; boot production thật |
| B — Đóng gói | Dockerfiles, Compose, proxy/TLS, migration job, health, secrets | Máy sạch khởi động được toàn bộ release bằng tài liệu |
| C — Staging | PostgreSQL/Redis riêng, dữ liệu thử, SMS thật có kiểm soát, webhook test, browser E2E | Đăng ký → đặt mật khẩu → login → nạp → lịch sử → logout hoạt động; duplicate không cộng/trừ hai lần |
| D — Vận hành và tải | Backup/restore, monitor, giả lập POS, kiểm thử concurrency/NAT | Đạt tiêu chí tải bên dưới; restore được; rollback app được |
| E — Pilot | Mở 5–10 người nội bộ, rồi 20, 50, 100 theo kết quả | Không có sai lệch số dư/chủ tài khoản; hỗ trợ và đối soát theo ngày |
| F — Phần cứng | Provision key, TLS, firmware, test ngắt mạng/reboot, một merchant trước | Timeout/reboot không thanh toán trùng; API cũ vẫn tương thích |

Có thể chạy demo staging bằng mock và dữ liệu thử trước khi xong nhà cung cấp SMS. Production chỉ mở sau điều kiện A–D; không bật tiền thật khi chưa có kiểm chứng dòng tiền ngoài hệ thống.

Thiếu đầu đọc: có thể nghiệm thu portal, quản trị, đăng ký (nếu điều kiện UID/danh tính đã đáp ứng), nạp và đối soát; thanh toán NFC mới chỉ kiểm thử giả lập. Nếu chưa có điểm chi tiêu thật, pilot nên dùng số dư thử và chưa kêu gọi sinh viên nạp tiền thật.

## 8. Kịch bản tải và tiêu chí nghiệm thu

- Dữ liệu 100 tài khoản riêng; chạy 10, 20 rồi 100 phiên đồng thời với mix login, xem ví, lịch sử và polling QR. Đo thêm burst đăng nhập/OTP qua cùng IP trường; tránh phát SMS thật hàng loạt khi load test.
- POS giả lập có 2 nhánh: nhiều ví độc lập và nhiều yêu cầu đồng thời trên cùng ví; cùng UUID lặp lại chỉ một giao dịch, UUID khác không làm âm ví/vượt daily limit.
- Webhook đồng thời/lặp lại, sai số tiền, tiền đến sau hết hạn; đối chiếu tổng tiền vào ngân hàng/inbox/credit wallet và pending cần xử lý.
- Mục tiêu đề xuất: p95 API đọc <500 ms, pay <1 giây ở tải pilot; lỗi 5xx <1%, không có giao dịch trùng/sai số dư. Đo API app tách khỏi thời gian SMS/ngân hàng. Đây là tiêu chí cần đo, chưa phải kết quả đạt được.
- Kiểm thử restart BE/Redis, mất response sau commit và thiết bị reboot; không tạo key mới cho giao dịch chưa rõ kết quả.
- Backup định kỳ + trước migration, thử restore vào DB riêng. Đề xuất RPO ≤15 phút và RTO ≤2 giờ cho tiền thật, cần WAL/PITR hoặc cơ chế tương đương đã kiểm chứng; dump mỗi ngày không đáp ứng RPO 15 phút. Chưa đáp ứng thì chỉ chạy tiền thử hoặc thống nhất mức mất dữ liệu chấp nhận được trước pilot.
- Lỗi 5xx, dịch vụ down, disk gần đầy, DB pool/lock và pending topup bất thường phải có cảnh báo đến người trực.

## 9. Nâng cấp sau khi có phần cứng

ESP32/Wi-Fi: thiết bị tự gọi HTTPS tới API. USB/Serial reader: cần chương trình gateway trên máy POS để đọc cổng rồi gọi HTTPS; backend cloud không tự truy cập cổng USB ở trường. `ICardReader` hữu ích cho lớp adapter nhưng `HardwareService` hiện tạo MockCardReader trực tiếp, chưa phải cấu hình DI tự động cho mọi loại đầu đọc.

Đóng băng hợp đồng `/api/v1`, UID hex/leading zero, UUID v4, mã lỗi và cơ chế lookup/retry. Thiết bị giữ nguyên payload/key khi mất mạng; chỉ thông báo thành công khi có xác nhận server. Mất Internet không đồng nghĩa có thể thanh toán offline; chế độ offline là bài toán riêng, chưa có ở kiến trúc này.

Release mới: backup → migration tương thích ngược → deploy image theo SHA → smoke → theo dõi. Giữ image trước để rollback app; không tự revert migration hoặc restore DB cũ khi đã có giao dịch mới. Với schema không tương thích cần maintenance window/forward fix, không cam kết zero downtime chỉ bằng Compose.

Triển khai firmware cho một thiết bị trước rồi mở rộng. API key hiện theo merchant, nên pilot cấp merchant riêng cho từng thiết bị hoặc bổ sung device identity nếu cần nhiều thiết bị cùng điểm bán; không đưa production key vào frontend browser.

## 10. Bằng chứng kiểm tra của đợt review

- Frontend: `npm test` — **31/31 pass**. Nhiều test UI là source-contract assertions; chưa chứng minh browser flow/UX.
- Backend: `npm test -- --runInBand` — **43/43 pass, 7 suites**.
- Backend `npm run build` và frontend `npm run build` — **đều pass**. Build tạo `be/dist/main.js` nhưng không có `be/dist/database/data-source.js`, xác nhận cần bổ sung artifact migration khi đóng gói. Build pass không đồng nghĩa AppModule boot được với cấu hình production; SMS provider vẫn là blocker đã nêu.
- Chưa chạy E2E PostgreSQL/Redis trong lượt review: kiểm tra listener không thấy các cổng local 5432/5433/6379/6380. Các suite đã có trong repo nhưng kết quả cũ ngày 02/10 không thay thế kết quả trên HEAD ngày 10/10.
- Chưa chạy load test, browser E2E, live SMS/SePay hoặc thiết bị thật. Chưa tạo tài nguyên hosting, mua dịch vụ hay deploy public.

Tham khảo cấu hình IP/rate limit sau reverse proxy: [NestJS rate limiting — Proxies](https://docs.nestjs.com/security/rate-limiting).
