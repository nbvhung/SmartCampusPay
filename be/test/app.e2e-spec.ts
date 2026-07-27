// E2E tests require PostgreSQL and Redis running.
// Run: docker compose up -d db redis
// Then: npm run test:e2e
//
// TODO: Add E2E tests for:
//   - POST /api/v1/auth/login (student + admin)
//   - POST /api/v1/transactions/pay (with API key)
//   - Idempotency: duplicate idempotencyKey returns same tx
//   - GET /api/v1/auth/me (authenticated)
