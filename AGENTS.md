# AGENTS.md — SmartCampusPay

## Tổng quan

Dự án NCKH: Hệ thống thanh toán nội bộ cho thẻ sinh viên gắn chip NFC/RFID.
Thời gian: 6-8/2026 (Phase 1), 7-8/2026 (Phase 2 - code).
Nhóm: Nguyễn Bá Việt Hùng + Bùi Ngọc Mạnh.

## Tech Stack

- **BE:** NestJS + TypeScript + TypeORM + PostgreSQL + Redis
- **FE:** Next.js (App Router) + Tailwind CSS
- **Auth:** JWT (student/admin) + API Key (merchant devices)

## Cấu trúc Module Backend

```
modules/
├── auth/            JWT login, register, JwtStrategy
├── students/        CRUD sinh viên
├── cards/           Quản lý thẻ NFC (UID, status)
├── accounts/        Ví điện tử (balance, dailyLimit, dailySpent)
├── transactions/    Core: pay, payByCard, topup (ACID + idempotency)
├── merchants/       Điểm thanh toán + API key management
├── hardware/        ICardReader interface + Mock implementation
└── redis/           Redis service (lock, cache, daily counter)
```

## Idempotency Rule

Mọi request `POST /transactions/pay` PHẢI kèm `idempotencyKey` (UUID từ thiết bị).
Backend kiểm tra unique constraint trước khi xử lý — nếu trùng key, trả về transaction cũ.

## Hardware Interface

```typescript
interface ICardReader {
  connect(): Promise<boolean>;
  disconnect(): Promise<void>;
  readCard(timeoutMs?: number): Promise<CardReadResult | null>;
  writeData(uid: string, data: Record<string, any>): Promise<boolean>;
}
```

Khi chưa có thiết bị thật → dùng `MockCardReader`.
Khi có thiết bị → implement interface + swap trong DI.

## Coding Conventions

- NestJS module structure: module → controller, service, entity, dto/
- Tất cả API trả về format: `{ success: boolean, data: T, timestamp: string }`
- Validation: class-validator DTOs
- Database: TypeORM entities with decorators
- API prefix: `/api/v1`
- JWT bảo vệ mọi endpoint trừ `@Public()` (auth/login, auth/register)

## Git Workflow

```bash
main        — nhánh chính, ổn định
develop     — nhánh phát triển
feat/xxx    — nhánh tính năng
fix/xxx     — nhánh sửa lỗi
```

Commit convention: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`

## Lệnh thường dùng

```bash
# Backend
cd be && npm run start:dev     # Dev server (http://localhost:4000)
cd be && npm run start          # Production
cd be && npm run test           # Unit tests
cd be && npm run test:e2e       # E2E tests

# Frontend
cd fe && npm run dev            # Dev server (http://localhost:3000)
cd fe && npm run build          # Production build

# Database
# PostgreSQL connection string: postgresql://postgres:postgres@localhost:5432/smartcampuspay
```

## Seed Data

```bash
# Tạo admin user mặc định:
#   username: admin
#   password: admin123
# 
# Tạo merchant test:
#   name: "Căng tin A", type: canteen
#   API key được generate tự động khi POST /api/v1/merchants
```

## Kiến trúc Request Flow

```
POS Device                     Backend                        Database
    │                            │                              │
    ├─ POST /pay (API key) ──────┤                              │
    │  { studentCode, amount,    │                              │
    │    idempotencyKey }        │                              │
    │                            ├─ Validate API key ──────────►│
    │                            ├─ Check idempotency ─────────►│
    │                            ├─ Check balance ─────────────►│
    │                            ├─ Debit + Save tx (ACID) ────►│
    │  ◄──── { success, tx } ────┤                              │
```

## Liên hệ bên phần cứng

Khi có thiết bị thật, cần thống nhất:
1. Format dữ liệu đọc từ chip (JSON/hex/bytes)
2. Thông tin trên chip (UID only? hay cả balance?)
3. Giao thức kết nối (USB HID / Serial COM / TCP socket)
4. API endpoint spec: `POST /api/v1/transactions/pay`
5. API Key authentication: header `X-API-Key`

## Todo

- [ ] Merchants CRUD + API key management
- [ ] Transactions pay/payByCard/topup (ACID)
- [ ] Idempotency handling
- [ ] MockCardReader
- [ ] Admin Dashboard (Next.js)
- [ ] Student Portal (Next.js)
- [ ] Docker compose
- [ ] Integration tests
- [ ] Kết nối hardware thật (phase 2)
