# Postgres Backend (Business-as-Customer)

Backend-only Next.js API project using a plain Postgres database (no Supabase).

## Setup

1) Install dependencies

```bash
npm install
```

2) Create `.env` from `.env.example` and fill in your Postgres connection

```bash
copy .env.example .env
```

- `DB_SSL=true` if your Postgres host requires TLS (common for managed providers).
- Create the database referenced by `DB_NAME` if it does not exist (your provider or `createdb`).

3) Run the server

```bash
npm run dev
```

The API auto-creates tables and indexes on first request if they do not exist.

## Seeding

```bash
npm run db:seed
```

## Test script

```bash
npm run test:endpoints
```

## API Usage

POST `/api/businesses`

```bash
curl -X POST http://localhost:3000/api/businesses \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Supply Co",
    "creditLimitCents": 500000
  }'
```

POST `/api/products`

```bash
curl -X POST http://localhost:3000/api/products \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
    "sku": "SKU-NEW-01",
    "name": "New Widget",
    "stock": 25,
    "priceCents": 1200
  }'
```

PATCH `/api/products/:productId`

```bash
curl -X PATCH http://localhost:3000/api/products/3e5a9b2c-1d4f-4b7a-8c9d-1e2f3a4b5c6d \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
    "stock": 90,
    "priceCents": 1600
  }'
```

POST `/api/purchase`

```bash
curl -X POST http://localhost:3000/api/purchase \
  -H "Content-Type: application/json" \
  -d '{
    "businessId": "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
    "idempotencyKey": "1b2c3d4e-5f60-4a7b-8c9d-0e1f2a3b4c5d",
    "items": [
      {"product_id": "3e5a9b2c-1d4f-4b7a-8c9d-1e2f3a4b5c6d", "qty": 2},
      {"product_id": "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c", "qty": 1}
    ]
  }'
```

GET `/api/overdue?businessId=...`

```bash
curl "http://localhost:3000/api/overdue?businessId=7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11"
```

## Notes

### Atomicity
Purchases run inside a single SQL transaction, so stock checks, order creation, and ledger updates commit together or not at all.

### Concurrency safety
The purchase flow uses `FOR UPDATE` locks on the credit account and all products (in deterministic product ID order) and enforces idempotency with a unique constraint on `(business_id, idempotency_key)`.
