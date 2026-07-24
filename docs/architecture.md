# Kiến trúc hệ thống

## Sơ đồ khối

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CARD READER DEVICE                           │
│                      (Bên đối tác phần cứng)                        │
│                     NFC/RFID Reader + POS                           │
└────────────────────────┬────────────────────────────────────────────┘
                         │ HTTP/WebSocket (X-API-Key)
                         ▼
┌──────────────────────────────────────────────────────────────────────┐
│  HARDWARE INTERFACE LAYER (be/src/modules/hardware/)                │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │  ICardReader (interface)                                       │ │
│  │  ├── MockCardReader     → Dùng khi chưa có thiết bị thật       │ │
│  │  └── (RealDriver)       → Implement sau khi có phần cứng       │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────────────────────────┬───────────────────────────────────────────┘
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  BACKEND API (NestJS / TypeScript)                                  │
│                                                                      │
│  ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌────────────┐  │
│  │  Auth   │ │ Students │ │  Cards  │ │Accounts  │ │ Merchants  │  │
│  │ Module  │ │ Module   │ │ Module  │ │ Module   │ │ Module     │  │
│  └────┬────┘ └────┬─────┘ └────┬────┘ └────┬─────┘ └──────┬─────┘  │
│       └───────────┴────────────┴───────────┴──────────────┘         │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              TRANSACTIONS ENGINE                                │  │
│  │  • ACID transactions (TypeORM QueryRunner)                      │  │
│  │  • Idempotency key (UNIQUE constraint)                          │  │
│  │  • Redis lock for concurrency                                   │  │
│  │  • Balance check + daily limit                                  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────┬───────────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│  DATABASE                                                           │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────────────┐ │
│  │  PostgreSQL  │  │    Redis     │  │  File Storage (optional)    │ │
│  │  • Students  │  │  • Session   │  │  • Receipt images           │ │
│  │  • Cards     │  │  • Cache     │  │  • Export reports           │ │
│  │  • Accounts  │  │  • TX queue  │  │                             │ │
│  │  • TX Log    │  │  • Lock      │  │                             │ │
│  │  • Merchants │  │              │  │                             │ │
│  └─────────────┘  └──────────────┘  └─────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                           ▲
                           │
┌──────────────────────────────────────────────────────────────────────┐
│  WEB FRONTEND (Next.js / Tailwind CSS)                              │
│                                                                      │
│  ┌────────────────────────────┐  ┌────────────────────────────────┐  │
│  │    STUDENT PORTAL           │  │     ADMIN DASHBOARD            │  │
│  │  • Dashboard (số dư)       │  │  • Dashboard (thống kê)        │  │
│  │  • Lịch sử giao dịch       │  │  • Quản lý sinh viên           │  │
│  │  • Nạp tiền                 │  │  • Quản lý điểm thanh toán    │  │
│  │  • Khóa thẻ                 │  │  • Xem giao dịch (audit)      │  │
│  │  • Cài đặt                  │  │  • Cấu hình hệ thống          │  │
│  └────────────────────────────┘  └────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

## Luồng xử lý giao dịch

```
POS/Đầu đọc                  Backend                        Database
    │                          │                              │
    ├─ POST /transactions/pay ─┤                              │
    │  X-API-Key: mcp_xxx      │                              │
    │  { studentCode,           │                              │
    │    merchantId,            │                              │
    │    amount,                │                              │
    │    idempotencyKey }       │                              │
    │                          │                              │
    │                          ├─ Validate API Key ──────────►│ merchants
    │                          ├─ Check idempotency ─────────►│ transactions
    │                          ├─ Get student ───────────────►│ students
    │                          ├─ Get account ───────────────►│ accounts
    │                          ├─ Check balance               │
    │                          ├─ BEGIN TRANSACTION           │
    │                          ├─ Debit balance ─────────────►│ accounts
    │                          ├─ Insert tx log ─────────────►│ transactions
    │                          ├─ COMMIT                      │
    │                          │                              │
    │  ◄─── { success, tx } ───┤                              │
    │                          │                              │
    │                          ├─ (optional) WebSocket ───────┤ Dashboard
    │                          │   notify real-time           │
```

## Database Relationships

```
students 1──* cards          (Một SV có nhiều thẻ)
students 1──* accounts       (Một SV có 1 ví chính)
students 1──* transactions   (Lịch sử giao dịch)
accounts 1──* transactions   (Giao dịch của ví)
merchants 1──* transactions  (Giao dịch tại điểm)
```

## Security

- **JWT**: Access token cho student/admin, expires 7d
- **API Key**: Merchant authentication, hashed với bcrypt
- **Rate Limiting**: 100 requests/min (ThrottlerModule)
- **Idempotency**: Chống duplicate transactions
- **Input Validation**: class-validator DTOs
- **CORS**: Chỉ cho phép frontend URL
