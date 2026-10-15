# Triển khai SmartCampusPay lần đầu

Ngày cập nhật: 13/10/2026. Bản này chuẩn bị hạ tầng production, **chưa nghiệm thu tiền thật**. Sinh viên do admin cấp phát trong cơ sở dữ liệu; lần đầu đăng nhập bằng MSSV viết hoa ở cả hai ô rồi đổi mật khẩu ngay.

## 1. Cần thuê/mua những gì?

| Hạng mục | Dùng để làm gì | Khuyến nghị ban đầu |
| --- | --- | --- |
| VPS | Máy Linux chạy liên tục, kể cả khi laptop tắt | Ubuntu 24.04 LTS x86_64, 2 vCPU, 4 GB RAM, ưu tiên 60–80 GB SSD, IPv4 public |
| Domain | Địa chỉ ổn định để in QR và cấu hình thiết bị | Xin subdomain của khoa/trường nếu được; hoặc mua domain riêng rồi dùng `pay.<domain>` |
| Backup ngoài VPS | Khôi phục khi VPS/disk hỏng | Không chỉ lưu bản dump trên cùng ổ đĩa |
| SePay | Nhận kết quả chuyển khoản để cộng ví | Cấu hình sau khi có HTTPS và tài khoản nhận tiền đã được thống nhất |

Đây là cấu hình để bắt đầu đo tải cho 100 tài khoản, không phải cam kết phục vụ 100 giao dịch/giây. Nếu build ngay trên VPS 4 GB có thể thiếu RAM; ưu tiên tải image đã build/test trong CI.

Có thể hỏi [Vietnix](https://vietnix.vn/vps/) để được tư vấn tiếng Việt, hoặc so sánh [Bizfly Cloud](https://bizflycloud.vn/cloud-server/bang-gia). Đây là lựa chọn tham khảo, chưa mua/đăng ký dịch vụ nào. Trang Vietnix tại thời điểm tra cứu có cấu hình 2 CPU/4 GB/40 GB; giá khuyến mại phụ thuộc chu kỳ. Xin báo giá tổng gồm VAT, backup, dung lượng bổ sung và giá gia hạn. Tránh trả trước dài hạn trong đợt pilot.

Dự trù sơ bộ cho hạ tầng khoảng 300–600 nghìn đồng/tháng là **ngân sách dự kiến**, không phải báo giá; domain và SePay tính riêng. Nếu có server/domain được khoa cấp thì ưu tiên dùng nguồn đó.

Nội dung gửi tư vấn VPS (người dùng tự gửi):

> Tôi cần chạy NestJS + Next.js + PostgreSQL + Redis bằng Docker Compose cho pilot 100 tài khoản. Xin gói Ubuntu 24.04 x86_64, từ 2 vCPU/4 GB RAM, 60–80 GB SSD, IPv4 public, mở 80/443, SSH, có thể nâng cấp RAM và có backup ngoài máy. Xin báo giá chu kỳ ngắn nhất, VAT, phí backup/gia hạn, và hỗ trợ cài Docker Engine + Compose plugin. Tôi không cần Windows, cPanel hay DirectAdmin.

## 2. Cấp tài khoản sinh viên

Admin thêm/import MSSV, thông tin sinh viên và UID thẻ vật lý. Hệ thống tạo ví số dư 0 và hash mật khẩu MSSV viết hoa. Sinh viên phải đổi mật khẩu sau lần đăng nhập đầu. Không cần dịch vụ SMS hoặc SMTP cho luồng này.

## 3. Sau khi có VPS

Các lệnh dưới đây chạy trong **terminal SSH của Ubuntu VPS**, không chạy trực tiếp trong PowerShell Windows. VPS mới thường cấp IP và tài khoản root/ubuntu. Xác minh SSH host fingerprint qua console nhà cung cấp trước lần đăng nhập đầu tiên. Không gửi private key, password hoặc API key vào chat.

Từ Windows Terminal:

```powershell
ssh ubuntu@IP_CUA_VPS
```

Thay tên user theo nhà cung cấp. Dùng SSH key riêng có passphrase, bật MFA tài khoản nhà cung cấp. Nhờ hỗ trợ tạo user quản trị có sudo nếu máy chỉ cấp root. Giữ console và phiên SSH đang mở khi kiểm tra cấu hình mới để tránh tự khóa truy cập.

Trên VPS: cập nhật bản vá hệ điều hành; cài Git, Python 3 và Docker Engine + Compose plugin theo [hướng dẫn Docker cho Ubuntu](https://docs.docker.com/engine/install/ubuntu/). Chọn Engine cho server, không cần Desktop. Nếu chưa quen quản trị Linux, yêu cầu nhà cung cấp thực hiện phần cài đặt này.

Kiểm tra:

```bash
sudo docker version
sudo docker compose version
git --version
python3 --version
```

Trong firewall/security group nhà cung cấp: mở TCP 80/443 cho Internet; TCP 22 chỉ từ IP quản trị nếu có thể. Không mở 3000, 4000, 5432, 6379. Compose chỉ publish 80/443. Docker có thể bypass một số luật UFW khi publish cổng, nên không dựa riêng vào UFW để che DB.

## 4. Domain và HTTPS

Ở bảng quản lý DNS, tạo A record `pay` trỏ về IPv4 VPS. Chỉ tạo AAAA nếu VPS thực sự có IPv6 hoạt động. Với Cloudflare, lúc đầu dùng DNS-only để kiểm chứng đường trực tiếp; cấu hình hiện chưa xử lý IP gốc qua CDN.

Ví dụ domain `pay.<domain-cua-ban>`. Caddy xin/gia hạn chứng chỉ tự động khi DNS đúng và Internet truy cập được 80/443; không cần mua SSL riêng. Không dùng IP hoặc địa chỉ localhost làm QR chính thức.

## 5. Đưa đúng bản code và image lên VPS

Các thay đổi phải được commit/push lên repo trước; clone nhánh hiện tại trên GitHub sẽ chưa có code chỉ đang nằm local. Với repo private, dùng GitHub SSH deploy key read-only trên VPS; không nhúng token trong URL clone.

```bash
git clone git@github.com:nbvhung/SmartCampusPay.git
cd SmartCampusPay
git checkout COMMIT_DA_KIEM_THU
python3 deploy/init-env.py --domain pay.domain-cua-ban.vn --email email-cua-ban@example.com --tag COMMIT_DA_KIEM_THU
```

Thay các giá trị ví dụ. Script tạo `.env.production` với các secret ngẫu nhiên khác nhau, quyền 0600, không in secret và không ghi đè file đã có. Lưu file vào password manager/kho backup bảo mật. Dùng `nano .env.production` trên VPS để đọc mật khẩu bootstrap khi đăng nhập admin và nhập cấu hình SePay sau này; không chụp/in file vào log.

Pipeline `.github/workflows/deployment-checks.yml` chạy tests/E2E, build images, migrate DB mới và boot app production đóng đăng ký. Khi **workflow xanh**, tải artifact `images-<SHA>` từ GitHub Actions, giải nén lấy `images.tar.gz`, chuyển lên VPS bằng SFTP/scp rồi nạp:

```bash
sudo docker load -i images.tar.gz
sudo docker compose --env-file .env.production -f compose.production.yaml config --quiet
sudo bash deploy/preflight.sh
```

Tag image phải trùng `RELEASE_TAG` trong `.env.production`. Workflow chỉ kiểm thử và lưu artifact, không tự deploy public. Chưa có scan dependency/image tự động trong đợt này; cần bổ sung trước pilot tiền thật.

Nếu chưa dùng artifact, có thể build trên máy Linux có Docker rồi `docker save`; hoặc trên VPS đủ RAM:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml build
```

Build Next.js hiện tải Google Fonts nên máy build cần Internet tới Google Fonts. Chưa tối ưu self-host font trong bản này.

## 6. Khởi động lần đầu — database mới

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml run --rm migrate
sudo docker compose --env-file .env.production -f compose.production.yaml up -d --wait
sudo docker compose --env-file .env.production -f compose.production.yaml ps
curl --fail https://pay.domain-cua-ban.vn/api/v1/health/ready
```

Không chạy `up` nếu migration lỗi. Với DB cũ phải backup/đối chiếu lịch sử migration trước; không áp hướng dẫn DB mới lên dữ liệu cũ đã tạo bằng synchronize. Job migration có profile tools nên không tự chạy lại mỗi lần `up`.

Đăng nhập admin tại `/login/admin` bằng username/password trong file env. Đổi mật khẩu admin ngay, xác nhận đăng nhập lại được; sau đó bỏ `DEFAULT_ADMIN_PASSWORD` khỏi env và recreate backend để không lưu bootstrap secret không cần thiết. Với DB đã có admin tương ứng, code không seed lại.

Mặc định DB mới chỉ có admin; hãy cấp phát sinh viên qua trang quản trị hoặc import Excel (MSSV, UID thẻ, họ tên, email, khoa, số điện thoại). Kiểm thử đăng nhập MSSV và đổi mật khẩu trước khi gửi thông tin cho người dùng.

Xác nhận HTTPS không báo lỗi trên điện thoại, đăng nhập admin và refresh/logout đúng; các cổng DB/Redis không truy cập từ Internet. `ready` kiểm tra DB/Redis nhưng không xác nhận SePay hoạt động.

## 7. Backup và cập nhật

```bash
sudo bash deploy/backup.sh
```

Script tạo dump PostgreSQL trong `deploy/backups`, không xóa bản cũ. Chuyển bản mã hóa ra ngoài VPS, thiết lập lịch bằng công cụ backup của nhà cung cấp hoặc cron, theo dõi dung lượng. Dump thủ công chưa đáp ứng RPO 15 phút cho tiền thật.

Thử restore trên VPS/DB thử riêng: tạo DB `smartcampuspay_restorecheck`, dùng `pg_restore --exit-on-error --no-owner` vào DB đó, kiểm tra số lượng giao dịch và tổng số dư. Không restore đè production để thử. Trước pilot tiền thật cần thực hiện bài restore và ghi thời gian; hướng dẫn này chưa chứng minh đã khôi phục thành công.

Nâng release: backup → tải image mới → đổi RELEASE_TAG → maintenance window nếu cần → chạy migrate → `up -d --wait` → smoke. Nếu cần rollback app, đặt tag cũ và chạy lại backend/frontend; chỉ làm khi schema còn tương thích. Không revert DB tự động sau khi đã phát sinh giao dịch mới. Không chạy `down -v` trên VPS vì sẽ xóa volume dữ liệu.

Kiểm tra lỗi:

```bash
sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail 80 backend
sudo docker compose --env-file .env.production -f compose.production.yaml logs --tail 80 proxy
```

Che dữ liệu cá nhân trước khi chia sẻ log. Theo dõi uptime, 5xx, dung lượng disk, trạng thái health và pending topup; bước cảnh báo tự động/backup offsite vẫn cần cấu hình theo nhà cung cấp đã chọn.

## 8. In QR lúc nào?

| Loại QR | Nội dung | Thời điểm in |
| --- | --- | --- |
| Mở website/đăng nhập | `https://domain/login/student` | Sau khi chốt domain và thử điện thoại qua 4G |
| Mở trang nạp tiền | `https://domain/student/topup` | Sau nghiệm thu luồng đăng nhập; hiện khách chưa login được đưa về login, rồi dashboard và chọn Nạp tiền |
| QR ngân hàng tĩnh | Ngân hàng, STK, nội dung chuyển khoản | Sau khi chốt tài khoản nhận và nghiệm thu webhook/đối soát |
| QR nạp động | Số tiền + reference riêng có hạn | Sinh trên màn hình mỗi lần nạp; không in dùng lâu dài |

Dev và production không khác công nghệ QR; khác địa chỉ/credentials/dữ liệu. `localhost` trên điện thoại là chính điện thoại, không phải laptop dev. QR web quét bằng camera; QR chuyển khoản thường quét bằng app ngân hàng. Ảnh QR có thể quét từ thư viện tùy app.

Giữ cùng domain/path thì deploy bản mới hoặc thay VPS không phải in lại QR web. Trước khi in hàng loạt: in một bản, quét bằng hai điện thoại qua 4G, thử trạng thái đã/chưa đăng nhập và kiểm tra đúng tài khoản ngân hàng. Không in QR dynamic đã hết hạn và không đưa JWT/API key vào QR công khai.

## 9. Trạng thái kiểm chứng

Cập nhật kiểm tra ngày 13/10/2026: backend **51/51 unit tests pass**; frontend **31/31 tests pass**; hai production builds đã pass trong đợt đóng gói. YAML parse và cú pháp các script shell/Node pass; script tạo env đã được thử để xác nhận các secret khác nhau và không ghi đè file có sẵn. Đây chưa phải kết quả chạy Docker/E2E production.

Sau khi có domain hoạt động, chạy từ máy có Node 24:

```bash
node deploy/smoke.mjs https://pay.domain-cua-ban.vn
```

Script kiểm tra readiness, hai trang login, endpoint yêu cầu xác thực và đường đăng ký cũ không còn hoạt động qua HTTPS thực tế. Script không cần tài khoản/secret. Trên VPS có thể dùng Node trong container đã đóng gói thay vì cài thêm Node lên host; trước khi migrate dùng `sudo bash deploy/preflight.sh` để kiểm tra Docker/config/image.

Đợt này đã chuẩn bị cấu hình/code/pipeline; chưa thuê VPS, chưa có domain, chưa deploy public. Môi trường local chưa có Docker CLI dùng được; container build/boot, HTTPS và migration production phải được xác nhận bởi workflow Linux hoặc máy có Docker trước khi vận hành. Xem kết quả local trong phản hồi bàn giao; không coi file workflow tồn tại là workflow đã pass.
