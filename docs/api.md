# API Documentation

Base URL: `http://localhost:4000/api/v1`

## Authentication

### Student Login
```http
POST /auth/login
{
  "studentCode": "B21DCCC001",
  "password": "your-password"
}
Response: { "accessToken": "jwt...", "studentCode": "B21DCCC001" }
```

### Admin Login
```http
POST /auth/admin/login
{
  "username": "admin",
  "password": "admin123"
}
Response: { "accessToken": "jwt..." }
```

### Đăng nhập lần đầu

Admin cấp sinh viên và thẻ vật lý. Tài khoản và mật khẩu ban đầu đều là MSSV viết hoa. Sau khi đăng nhập, gọi `POST /auth/change-password` với `oldPassword` là MSSV và `newPassword` ít nhất 8 ký tự gồm chữ hoa, chữ thường, số và ký tự đặc biệt. Phiên cũ hết hiệu lực; đăng nhập lại bằng mật khẩu mới.

## Transactions

### Pay (from POS)
Requires `X-API-Key` header.
```http
POST /transactions/pay
X-API-Key: mcp_xxx...
{
  "studentCode": "B21DCCC001",
  "merchantId": "uuid",
  "amount": 15000,
  "idempotencyKey": "uuid-from-device",
  "description": "Căng tin - Bữa trưa"
}
```

### Pay by Card UID
```http
POST /transactions/pay/card
X-API-Key: mcp_xxx...
{
  "cardUid": "MOCK-UID-00001",
  "merchantId": "uuid",
  "amount": 15000,
  "idempotencyKey": "uuid-from-device"
}
```

### Top-up
```http
POST /transactions/topup
Authorization: Bearer jwt...
{
  "studentCode": "B21DCCC001",
  "amount": 100000
}
```

### Get Transactions
```http
GET /transactions
GET /transactions/student/:studentCode
GET /transactions/stats/daily
```

## Students

```http
POST   /students
GET    /students
GET    /students/:id
PATCH  /students/:id/toggle
```

## Cards

```http
POST   /cards
GET    /cards/uid/:uid
GET    /cards/student/:studentId
PATCH  /cards/:id/status
```

## Accounts

```http
GET    /accounts/balance/:studentId
POST   /accounts/topup
PATCH  /accounts/:id/freeze
```

## Merchants

```http
POST   /merchants
GET    /merchants
GET    /merchants/:id
POST   /merchants/:id/regenerate-key
PATCH  /merchants/:id/toggle
```
