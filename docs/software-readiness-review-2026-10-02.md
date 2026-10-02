# Đánh giá phần mềm trước khi kết nối phần cứng

> Đây là đánh giá ban đầu trước lượt implement. Các lỗi ưu tiên bên dưới đã được xử lý trong mã nguồn; kết quả mới nhất nằm tại [integration-validation.md](integration-validation.md). Backend/frontend build pass, 31 unit + 35 integration/E2E + 6 POS tests pass; migration local đã áp dụng sau sao lưu. Firmware vẫn cần build/thử trên thiết bị thật, lint các màn hình frontend khác còn 33 lỗi cũ.

Ngày rà soát: 02/10/2026. Phạm vi: mã nguồn đang có trong workspace, bao gồm các thay đổi chưa commit. Đây là đánh giá qua đọc code và chạy kiểm tra, chưa phải nghiệm thu hệ thống chạy với PostgreSQL, Redis, ngân hàng và thiết bị thật.

## Kết luận chốt

Phần mềm đạt mức **MVP có phần lớn chức năng**, có thể bắt đầu thử kết nối thiết bị trong môi trường kiểm soát với dữ liệu thử. **Chưa đủ điều kiện chốt bản bàn giao firmware hoặc vận hành thanh toán thực tế**.

Ước lượng hoàn thiện chức năng MVP: **75–80%**. Đây là ước lượng kỹ thuật theo phạm vi chức năng, không phải tỷ lệ test coverage hay bằng chứng an toàn giao dịch. Khoảng trống lớn nằm ở xử lý lỗi mạng, đối soát nạp tiền, phân quyền và kiểm thử tích hợp.

## Bằng chứng kiểm tra

| Kiểm tra | Kết quả |
| --- | --- |
| Backend `npm run build` | Pass |
| Backend `npm run test -- --runInBand` | 4 suites, 30 tests pass |
| Backend `npm run test:e2e -- --runInBand` | Fail: file test chỉ có TODO, không có test |
| Frontend `npm run build` | Pass sau khi cho phép tải Google Fonts ngoài sandbox |
| Frontend build warning | Quy ước `middleware` bị deprecated, cần chuyển sang `proxy` |
| Frontend `npm run lint` | Fail: 34 errors, 12 warnings; gồm explicit any và set-state-in-effect |

Unit test dùng repository/EntityManager mock. Test mang tên rollback chỉ xác minh lỗi được truyền ra từ transaction mock; chưa chứng minh rollback hoặc khóa hàng trên PostgreSQL thực. Không xác nhận migration đã được áp dụng vào database hiện có. Không chạy giao dịch tiền thật và không build firmware Arduino.

## Mức hoàn thiện từng phần

| Phần | Đã có | Chưa chốt |
| --- | --- | --- |
| Đăng nhập | Sinh viên/admin, cookie httpOnly, refresh, logout/blacklist, đổi mật khẩu | Test phân quyền, session và cưỡng chế đổi mật khẩu phía backend |
| Quản trị | Sinh viên, import Excel, thẻ, ví, merchant, cấp/đổi API key, admin | DTO thẻ, chuẩn hóa UID, audit log thao tác quản trị |
| Thanh toán | MSV/UID, merchant API key, khóa ví, transaction DB, unique idempotency, reject replay khác payload | Retry phía client, replay sau khóa thẻ, test đồng thời và lỗi mạng |
| Nạp tiền | QR tĩnh/động, webhook xác thực, khớp MSV/refCode, hàng đợi và khớp thủ công | Ledger transferId thống nhất, hủy/hết hạn, xử lý tiền chuyển sai hoặc chuyển thêm |
| Frontend | Dashboard admin, cổng sinh viên, lịch sử, nạp QR, POS web | Kiểm thử trình duyệt, retry POS và cập nhật dữ liệu sau giao dịch |
| Kết nối thiết bị | API `/hardware`, tài liệu, script mock POS, firmware tham khảo | Contract chính xác, retry bền vững qua reboot và kiểm chứng thiết bị thật |
| Vận hành | Env mẫu, Swagger, migrations, rate limit | Docker Compose/CI chưa thấy trong repo, health/readiness, backup/restore và hướng dẫn triển khai có kiểm chứng |

README và checklist AGENTS.md chưa phản ánh đầy đủ code hiện có. README vẫn liệt kê `/transactions/topup`, nhưng controller transactions hiện không cung cấp endpoint này; nạp tiền đi qua SePay.

## Các việc bắt buộc trước khi chốt

### 1. Giữ nguyên idempotency key khi mất response — ưu tiên P0

Nguồn: `fe/src/lib/pos-api.ts`, `fe/src/app/pos/page.tsx`, `docs/esp32-reference.ino` (`doPayment`).

POS web sinh UUID bên trong mỗi lần gọi API; sau lỗi mạng, nhấn lại tạo UUID khác. Firmware cũng tạo key mới mỗi lần `doPayment`, không lưu giao dịch đang chờ xác minh trong NVS. Nếu backend đã trừ tiền nhưng response bị mất, lần thử lại có thể trừ tiền lần hai.

Yêu cầu: tạo key một lần khi xác nhận giao dịch; giữ payload/key đến khi có kết quả xác định; retry cùng key. Firmware cần lưu giao dịch chưa rõ kết quả qua reboot. Timeout phải hiển thị trạng thái chưa xác định, không kết luận thanh toán thất bại. Chốt cách tra cứu/replay kết quả bằng API key, có scope merchant.

`payByCard` hiện kiểm tra thẻ trước khi gọi `pay`. Replay giao dịch đã thành công có thể bị từ chối nếu thẻ bị khóa sau giao dịch. Cần thiết kế replay dựa trên dữ liệu giao dịch gốc để thiết bị vẫn xác định được kết quả.

### 2. Siết phân quyền giao dịch — ưu tiên P0

Nguồn: `be/src/modules/transactions/transactions.controller.ts`.

`GET /transactions`, `/stats`, `/stats/daily`, `/chart` chỉ yêu cầu JWT, không có RolesGuard/role admin. Theo code hiện tại, sinh viên có thể gọi danh sách giao dịch toàn hệ thống và thống kê. Endpoint theo sinh viên có giới hạn về chính user, nhưng không khắc phục endpoint toàn hệ thống.

Yêu cầu: chỉ admin/super_admin được đọc toàn hệ thống; test student bị 403, admin được phép, student chỉ đọc dữ liệu của mình. Giới hạn `days` của chart bằng DTO để tránh query không giới hạn.

### 3. Chốt ledger nạp tiền và trạng thái — ưu tiên P0

Nguồn: `be/src/modules/sepay/sepay.service.ts`, `be/src/modules/topup-pending/topup-pending.service.ts`.

- Nhánh khớp refCode cập nhật transaction QR cũ nhưng không gắn key `sepay_<transferId>` như nhánh MSV. Chống trùng theo refCode hiện có, nhưng chưa có một bản ghi unique transferId thống nhất cho mọi đường xử lý.
- Khi refCode đã success, lần chuyển khoản mới vào cùng refCode bị trả `already_processed`; khoản chuyển thêm chưa được đưa vào hàng đợi đối soát.
- Sai amount hoặc amount ngoài phạm vi ở nhánh refCode trả message và HTTP thành công, chưa lưu hàng đợi để admin xử lý tiền đã nhận.
- `expiresAt` được trả về nhưng không lưu ở entity; chưa có kiểm tra hết hạn phía server. Nhánh refCode chỉ loại trạng thái success, nên giao dịch failed do hủy vẫn có thể được cộng tiền khi webhook đến. Cần định nghĩa chính sách tiền đến muộn và đưa vào đối soát nếu không tự cộng.
- `cancelPayment` và `ignore` đọc rồi save ngoài transaction khóa hàng; cần kiểm tra cạnh tranh với webhook/match.
- Khớp thủ công cộng `pending.amount` mà chưa kiểm tra lại số nguyên, số dương, giới hạn. Dữ liệu webhook hiện parse khá thoáng; cần DTO/validation và chính sách riêng cho khoản vượt giới hạn.

Yêu cầu: mọi transfer ngân hàng có bản ghi unique; xử lý lại không cộng lần hai; mọi khoản tiền vào có kết quả cộng ví hoặc hàng đợi với lý do, không bị bỏ sót. Kiểm tra tài khoản nhận theo cấu hình nếu payload cung cấp thông tin đó.

### 4. Kiểm chứng tính nhất quán số dư — ưu tiên P0

Nguồn: `be/src/modules/accounts/accounts.service.ts`, `accounts.task.ts`, `transactions.service.ts`.

Luồng pay chính có khóa hàng và transaction đúng hướng. Tuy nhiên `toggleFreeze` đọc toàn bộ ví rồi save entity ngoài transaction khóa hàng, có nguy cơ ghi lại số dư cũ khi chạy đồng thời với thanh toán. Nên update riêng status hoặc khóa cùng hàng ví trong transaction. Các hàm `AccountsService.topup/debit` cũng đọc-sửa-save không atomic và không ghi ledger; hiện không thấy được gọi bởi luồng thanh toán chính, cần bỏ hoặc gom vào một đường cập nhật tiền chuẩn trước khi tái sử dụng.

`amount` dùng `IsNumber` trong khi DB là integer: cần `IsInt` cho VND. Hạn mức ngày phụ thuộc cron lúc nửa đêm theo timezone server; nếu server dừng đúng thời điểm reset thì thiếu cơ chế bù. Nên lưu ngày chi tiêu và reset dưới khóa ví theo ngày Asia/Ho_Chi_Minh.

### 5. Đồng bộ API contract cho firmware — ưu tiên P1, phải xong trước bàn giao

Nguồn: `docs/hardware-api.md`, controller transactions, exception filter, merchant service.

- Tài liệu ghi pay thành công HTTP 200; controller `@Post` không đặt HttpCode nên hiện dùng mặc định 201. Chọn một chuẩn và đồng bộ backend, tài liệu, firmware.
- Ví dụ UUID chứa `xxxx`, không hợp lệ với DTO `IsUUID('4')`. Cung cấp UUID v4 chạy được.
- Tài liệu mẫu key `scp_`, code cấp key `mcp_`. Thiết bị phải dùng raw key trả về khi tạo/rotate, không dùng hash.
- API `/hardware/balance/:uid` đã có nhưng thiếu trong bảng endpoint; thay hướng dẫn gọi API JWT hoặc tự tính số dư bằng endpoint API key này.
- Error response thực tế thiếu `data: null`; filter chỉ bắt HttpException, chưa đảm bảo lỗi DB/500 cùng envelope. Cần mã lỗi nghiệp vụ ổn định cho firmware, tránh phụ thuộc chuỗi message.
- Chuẩn hóa UID tại đăng ký và đọc: hex viết hoa, không dấu phân cách, giữ số 0 đầu; DTO hiện chỉ kiểm tra chuỗi/độ dài, query so khớp nguyên chuỗi.
- Tài liệu nói mỗi thiết bị một key, nhưng dữ liệu hiện một key mỗi merchant. Với demo có thể cấp một merchant cho một thiết bị; nhiều thiết bị cùng merchant cần entity device/key riêng.
- Rate limit chung 100/phút/IP: nhiều thiết bị chung mạng và polling có thể bị 429. Chốt backoff, timeout, ngưỡng và phạm vi limit cho thiết bị/webhook.

### 6. Có integration/E2E thực — ưu tiên P0

Nguồn: `be/test/app.e2e-spec.ts` đang chỉ có TODO.

Phải chạy với PostgreSQL + Redis test riêng, gồm:

1. Thẻ hợp lệ thanh toán: số dư giảm và đúng một ledger debit.
2. Retry cùng key trả cùng transaction, không đổi số dư; khác payload trả 409.
3. Nhiều request cùng key; nhiều key cùng ví; không âm số dư hoặc vượt daily limit.
4. Lỗi ghi ledger rollback cả số dư; Redis không sẵn sàng vẫn giữ invariant qua DB.
5. Mất response sau commit rồi retry; thiết bị reboot rồi retry cùng giao dịch.
6. Thẻ không tồn tại/khóa, sinh viên khóa, ví freeze, thiếu tiền, vượt hạn mức, API key sai/thu hồi.
7. Nạp và pay đồng thời; freeze đồng thời; webhook lặp/đồng thời; cancel và webhook đồng thời.
8. QR hết hạn, chuyển sai số tiền, chuyển thêm vào QR cũ, khớp thủ công và webhook cạnh tranh.
9. Student không đọc giao dịch người khác/toàn hệ thống; API key chỉ được gọi API thiết bị đã định nghĩa.
10. Cài DB mới và nâng DB hiện có bằng migrations; xác minh unique constraints thực sự tồn tại.

## Chốt kiến trúc kết nối

Đề xuất cho bản demo: **ESP32 đọc UID → WiFi HTTPS → API key → backend → PostgreSQL**. Số dư và ledger nằm ở server; thiết bị dùng UID để tra cứu, không ghi số dư lên chip. Chỉ báo thanh toán thành công khi server xác nhận. Khi offline, giữ giao dịch chưa rõ kết quả để xác minh lại; chưa cho phép chi tiêu offline.

Với kiến trúc này, firmware đọc NFC trực tiếp; không cần triển khai reader USB/Serial trong NestJS để nối ESP32. `ICardReader` và MockCardReader hiện là nhánh adapter độc lập: HardwareService đang `new MockCardReader()`, chưa swap bằng DI, chưa được gọi trong luồng pay/card. Nếu chọn đầu đọc cắm laptop thì cần chốt bridge/driver và lifecycle riêng.

Định danh UID hiện đóng vai trò nhận diện thẻ. Mức bảo đảm chống giả mạo thẻ chưa được kiểm chứng bằng phần cứng; tiêu chí nghiệm thu demo cần ghi rõ phạm vi này.

## Điều kiện cho phép thử và điều kiện bàn giao

**Có thể bắt đầu ngay:** kết nối WiFi/HTTPS, kiểm tra API key, đọc UID, đăng ký thẻ thử, tra cứu tên/số dư, tạo QR và thử thanh toán với dữ liệu thử có người giám sát.

**Chỉ chốt bản tích hợp khi:** hoàn tất mục 1–6; contract được đóng phiên bản; chạy bộ test trên môi trường sạch; kiểm chứng mất mạng/reboot bằng thiết bị thật; lưu kết quả nghiệm thu cùng phiên bản code và cấu hình môi trường.

**Việc có thể làm sau khi luồng tích hợp ổn định:** tối ưu tra API key (hiện bcrypt tuần tự qua tất cả merchants), phân trang lịch sử (hiện 50/100/200 bản ghi), dashboard doanh thu (stats tổng đang cộng cả credit và debit trong khi chart chỉ debit), audit log đầy đủ, CI và bộ kiểm thử frontend. Backup/restore và giám sát phải hoàn tất trước vận hành với tiền thật.

Ưu tiên hiện tại là đóng luồng giao dịch và hợp đồng thiết bị; không cần mở rộng màn hình mới để bắt đầu thử nối phần cứng.
