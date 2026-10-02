# Giao diện PTIT và theme toàn website

Toàn bộ trang chủ, đăng nhập, đổi mật khẩu, quản trị, sinh viên và POS dùng chung light/dark mode. Logo dùng ảnh PTIT được cung cấp; favicon cũng trỏ về ảnh này.

Theme được khởi tạo trước nội dung trang, lưu ở `scp.theme` và đồng bộ giữa các tab. Khi chưa chọn theme, sử dụng thiết lập hệ điều hành. Lựa chọn cũ `scp.login.theme` được giữ làm giá trị chuyển tiếp.

Điều hướng quản trị có drawer trên mobile, hỗ trợ Escape, giữ focus và khóa cuộn nền. Điều hướng sinh viên có thanh dưới cùng trên mobile. Hiệu ứng tôn trọng `prefers-reduced-motion`.

## Kiểm tra

```powershell
cd fe
npm run build
npm test
node scripts/preview-site.mjs
```

Script preview chạy Next production ở cổng 4300 và Edge headless ở cổng debug 9466. Kiểm tra 16 trang, hai theme, desktop 1440×1000 và mobile 390×844; lưu ảnh vào `.preview/` (đã bỏ qua trong Git). Kiểm tra logo, palette, tràn ngang, menu, độ rộng ô tìm kiếm, theme sau reload, lỗi JavaScript và reduced motion.

Các request API được chặn bằng CDP và trả dữ liệu mẫu từ `scripts/preview-fixtures.mjs`. Cookie chỉ dùng để xem route trong môi trường preview. Script không thay đổi xác thực của ứng dụng và không gửi giao dịch đến backend. Đây là kiểm tra giao diện, không thay thế kiểm thử nghiệp vụ với backend thật.
