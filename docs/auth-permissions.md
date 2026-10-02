# Đăng nhập và phân quyền

Trang `/` hiển thị các cổng truy cập; `/login` cho phép chọn loại tài khoản.

| Cổng | Endpoint xác thực | Khu vực sau đăng nhập |
| --- | --- | --- |
| `/login/student` | `POST /api/v1/auth/login` với `studentCode`, `password` | `/student/dashboard` |
| `/login/admin` | `POST /api/v1/auth/admin/login` với `username`, `password` | `/admin/dashboard` |

Chọn cổng không cấp quyền. Backend xác thực tài khoản trong đúng nhóm và lấy vai trò từ cơ sở dữ liệu. Endpoint unified cũ vẫn tồn tại để tương thích, giao diện mới không sử dụng.

| Vai trò | Quyền |
| --- | --- |
| `student` | Ví, thẻ, hồ sơ và giao dịch cá nhân; nạp tiền cho chính mình. Không truy cập API quản trị. |
| `admin` | Quản lý sinh viên, thẻ, ví, điểm thanh toán, giao dịch và nạp tiền chờ khớp; xem danh sách quản trị viên. |
| `super_admin` | Các quyền admin và tạo, sửa, khóa, xóa tài khoản quản trị viên. |
| Thiết bị POS | Xác thực bằng `X-API-Key` của merchant tại API thanh toán; không có quyền quản trị từ việc mở trang POS. |

Sinh viên có `mustChangePassword` phải đổi mật khẩu trước khi dùng các API nghiệp vụ. Trong giai đoạn này chỉ được xem `/auth/me`, đổi mật khẩu hoặc đăng xuất.

Next.js proxy điều hướng theo vai trò trong cookie; đây không phải kiểm tra chữ ký JWT. AuthBoundary chờ `/auth/me` xác nhận phiên ở backend trước khi mount trang và gửi request nghiệp vụ. Backend JwtAuthGuard/JwtStrategy và RolesGuard là nơi thực thi xác thực và phân quyền.

Khi access token hết hạn, Axios thử refresh một lần; các request đồng thời dùng chung lần refresh. Thiếu refresh cookie trả về 401 theo định dạng lỗi chung. Refresh thất bại trong khu vực được bảo vệ đưa người dùng về cổng đăng nhập tương ứng; trang chủ công khai vẫn truy cập được.
