# SmartCampusPay

Hệ thống thanh toán nội bộ không tiền mặt cho thẻ sinh viên gắn chip NFC/RFID.

## Kiến trúc

```
┌─────────────────────────────────────────────────────┐
│                    Web Frontend                      │
│              (Next.js + TypeScript)                  │
│  ┌─────────────┐          ┌──────────────────────┐   │
│  │ Student Portal│        │  Admin Dashboard      │   │
│  │ - Số dư      │         │  - Quản lý SV         │   │
│  │ - Lịch sử GD │         │  - Thống kê           │   │
│  │ - Nạp tiền   │         │  - Audit log          │   │
│  └──────┬───────┘         └──────────┬───────────┘   │
└─────────┼───────────────────────────┼───────────────┘
          │         REST API           │
          │    (JWT authentication)    │
┌─────────┴───────────────────────────┴───────────────┐
│                  Backend API                         │
│           (NestJS + TypeScript)                      │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌────┐ ┌─────────┐     │
│  │Auth  │ │Student│ │Card  │ │Acct│ │Merchant │     │
│  └──┬───┘ └──┬───┘ └──┬───┘ └──┬──┘ └──┬──────┘     │
│     └────────┴────────┴────────┴───────┘              │
│  ┌────────────────────────────────────────────────┐   │
│  │           Transactions Engine                    │   │
│  │    (ACID + Idempotency + Redis Lock)             │   │
│  └────────────────────────────────────────────────┘   │
│  ┌────────────────────────────────────────────────┐   │
│  │      Hardware Interface Layer (HIL)             │   │
│  │  ICardReader ← MockCardReader / RealDriver      │   │
│  └──────────────────────┬─────────────────────────┘   │
└─────────────────────────┼───────────────────────────┘
                          │ NFC/RFID protocol
               ┌──────────┴──────────┐
               │  Card Reader Device  │  (bên đối tác)
               └─────────────────────┘
```

## Công nghệ

| Layer | Công nghệ |
|-------|-----------|
| Backend | NestJS, TypeScript |
| Frontend | Next.js, Tailwind CSS |
| Database | PostgreSQL |
| Cache | Redis |
| ORM | TypeORM |
| Auth | JWT + Passport |
| Realtime | WebSocket (Socket.io) |

## Cấu trúc thư mục

```
SmartCampusPay/
├── be/                    # Backend NestJS
│   ├── src/
│   │   ├── common/        # Guards, filters, interceptors
│   │   ├── config/        # App configuration
│   │   └── modules/
│   │       ├── auth/       # JWT authentication
│   │       ├── students/   # Student management
│   │       ├── cards/      # Card management
│   │       ├── accounts/   # Wallet & balance
│   │       ├── transactions/ # Payment processing
│   │       ├── merchants/  # POS management + API keys
│   │       └── hardware/   # Card reader interface
│   └── test/
├── fe/                    # Frontend Next.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── student/   # Student portal
│   │   │   └── admin/     # Admin dashboard
│   │   ├── components/    # Shared components
│   │   └── lib/           # Utilities
│   └── public/
└── docs/                  # Documentation
```

## Cài đặt

```bash
# Backend
cd be
npm install
cp .env.example .env
npm run start:dev

# Frontend
cd fe
npm install
npm run dev
```

## API Endpoints

### Auth
- `POST /api/v1/auth/login` — Student login
- `POST /api/v1/auth/admin/login` — Admin login
- `POST /api/v1/auth/register` — Set password

### Transactions
- `POST /api/v1/transactions/pay` — Payment (API key required)
- `POST /api/v1/transactions/pay/card` — Pay by card UID
- `POST /api/v1/transactions/topup` — Top-up
- `GET /api/v1/transactions` — List all
- `GET /api/v1/transactions/student/:code` — By student
- `GET /api/v1/transactions/stats/daily` — Daily stats

### Students / Cards / Merchants / Accounts
- Standard CRUD endpoints (JWT required)

## Đề tài

**Tên đề tài:** Nghiên cứu phát triển giải pháp thanh toán cho thẻ sinh viên có gắn chip ứng dụng thanh toán trong trường học

**Đơn vị chủ trì:** Khoa Viễn Thông 1 - Học viện Công nghệ Bưu chính Viễn thông

**Chủ trì:** Nguyễn Bá Việt Hùng

**Người hướng dẫn:** TS. Cao Hồng Sơn
