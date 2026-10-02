# Hồ sơ khớp nạp tiền

## Luồng sử dụng

1. Sinh viên mở **Khớp nạp** (`/student/topup-claims`) từ menu hoặc trang nạp tiền.
2. Họ tên và mã sinh viên lấy từ tài khoản hiện tại. Sinh viên chọn số thẻ (UID thẻ sinh viên, không phải số thẻ ngân hàng), nhập số tiền, thời điểm chuyển, tên người chuyển, ngân hàng, mã giao dịch và lý do yêu cầu.
3. Đính kèm một ảnh JPG, PNG hoặc WebP, tối đa 5 MB. Ảnh cần thể hiện giao dịch thành công, số tiền, thời gian, mã giao dịch và tài khoản nhận.
4. Admin mở **Hồ sơ khớp nạp** (`/admin/topup-claims`), xem thông tin và ảnh minh chứng.
5. Admin chọn khoản tiền thực nhận đang chờ khớp có cùng số tiền, đối chiếu các thông tin trên ảnh rồi xác nhận **Khớp và cộng tiền**. Không cần nhập ghi chú. Danh sách gợi ý chỉ lọc cùng số tiền và ưu tiên mã tham chiếu trùng; admin vẫn phải xác minh người gửi và tài khoản nhận.
6. Sinh viên xem trạng thái và mã giao dịch ví trong hồ sơ. Nếu hồ sơ bị từ chối, sinh viên xem lý do rồi gửi hồ sơ mới có thông tin/minh chứng đã sửa.

Nếu ngân hàng chưa ghi nhận khoản tiền phù hợp, giữ hồ sơ ở trạng thái chờ đối soát và kiểm tra lại sau. Nộp hồ sơ không tự cộng tiền.

## Quyền và tính toàn vẹn

- Sinh viên chỉ nộp và xem hồ sơ/ảnh của chính mình. Backend đối chiếu họ tên, mã sinh viên và quyền sở hữu thẻ với tài khoản đã xác thực.
- Admin và super admin được xem tất cả hồ sơ, xem khoản tiền chờ khớp, xác nhận hoặc từ chối. Chỉ khi từ chối mới cần nhập lý do.
- Các request đồng thời cho cùng mã giao dịch/ngân hàng/sinh viên chỉ tạo một hồ sơ đang chờ hoặc đã khớp. Hồ sơ bị từ chối được phép nộp lại.
- Khóa hàng trên hồ sơ và khoản tiền chờ khớp; cộng ví, tạo giao dịch và lưu kết quả hồ sơ trong cùng transaction PostgreSQL. Số tiền lấy từ khoản thực nhận và phải bằng số tiền trên hồ sơ. Unique idempotency key theo transfer ID ngăn cộng lại cùng khoản tiền.
- Khoản nhận sai tài khoản cấu hình, ví bị khóa, giao dịch đã xử lý hoặc hồ sơ đã xử lý đều bị chặn khi khớp.
- Ảnh lưu trong PostgreSQL (`bytea`), không có URL công khai; endpoint ảnh kiểm tra JWT và quyền sở hữu, trả `Cache-Control: private, no-store`. Các API danh sách/chi tiết không trả dữ liệu ảnh. Sao lưu database bao gồm minh chứng.

## API

Prefix: `/api/v1`.

| Endpoint | Quyền | Chức năng |
| --- | --- | --- |
| `POST /topup-claims` | Sinh viên | Multipart form, file bắt buộc ở trường `evidence` |
| `GET /topup-claims?page=1&limit=20&status=pending` | Đã đăng nhập | Hồ sơ của sinh viên hiện tại hoặc toàn bộ hồ sơ với admin; limit tối đa 50 |
| `GET /topup-claims/:id` | Chủ hồ sơ / admin | Thông tin và kết quả đối soát |
| `GET /topup-claims/:id/evidence` | Chủ hồ sơ / admin | Ảnh nhị phân, không bọc JSON |
| `GET /topup-claims/:id/candidates?search=...` | Admin | Tối đa 100 khoản tiền chưa khớp cùng số tiền; tìm theo transfer ID, tham chiếu, nội dung, người gửi |
| `POST /topup-claims/:id/match` | Admin | `{ pendingId }` |
| `POST /topup-claims/:id/reject` | Admin | `{ reason }` |

Endpoint cũ `POST /topup-pending/:id/match` đã được bỏ. Màn hình `/admin/topup-pending` vẫn hiển thị tiền ngân hàng đang chờ, nhưng thao tác khớp chuyển sang hồ sơ có minh chứng. Luồng SePay tự nhận diện giao dịch hợp lệ vẫn hoạt động.

## Cài đặt và kiểm thử

Chạy `npm run migration:run` trong `be` trước khi chạy phiên bản mới. Migration `AddTopupClaims1790956800000` tạo bảng hồ sơ và các ràng buộc, không sửa số dư ví hiện có.

Database local đã áp dụng migration ngày 02/10/2026, sau khi sao lưu vào `be/.backups/before-hardware-2026-10-02T09-40-41-432Z.dump`.

Kiểm thử: `cd be` rồi `npm run test:e2e -- --runInBand topup-claims.e2e-spec.ts`. Suite tạo database riêng `scp_claims_<timestamp>_<pid>`, chạy migration thật, kiểm tra multipart upload, quyền truy cập ảnh, hồ sơ trùng, khớp đồng thời, rollback, sai số tiền, ví bị khóa và từ chối/nộp lại; sau đó xóa đúng database test. Không tạo giao dịch thử trên database đang sử dụng.
