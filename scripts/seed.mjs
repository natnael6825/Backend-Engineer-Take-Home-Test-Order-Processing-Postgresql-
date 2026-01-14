import "dotenv/config";
import { Pool } from "pg";

const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const dbName = process.env.DB_NAME;
const dbSsl = process.env.DB_SSL;

if (!dbHost || !dbUser || !dbPass || !dbName) {
  console.error("Missing DB_HOST, DB_USER, DB_PASS, or DB_NAME");
  process.exit(1);
}

const sslEnabled = dbSsl === "true" || dbSsl === "1";

const pool = new Pool({
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: dbPass,
  database: dbName,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
});

const schemaStatements = [
  "create extension if not exists \"pgcrypto\"",
  "create table if not exists businesses (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now())",
  "create table if not exists products (id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade, sku text not null, name text not null, stock integer not null check (stock >= 0), price_cents integer not null check (price_cents >= 0), created_at timestamptz not null default now(), unique (business_id, sku))",
  "create table if not exists business_credit_accounts (business_id uuid primary key references businesses(id) on delete cascade, credit_limit_cents integer not null check (credit_limit_cents >= 0), balance_cents integer not null default 0 check (balance_cents >= 0), created_at timestamptz not null default now())",
  "create table if not exists orders (id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade, idempotency_key uuid not null, status text not null default 'posted', total_cents integer not null check (total_cents >= 0), paid_cents integer not null default 0 check (paid_cents >= 0), created_at timestamptz not null default now(), due_at timestamptz not null default (now() + interval '30 days'), unique (business_id, idempotency_key))",
  "create table if not exists order_items (id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade, order_id uuid not null references orders(id) on delete cascade, product_id uuid not null references products(id) on delete cascade, qty integer not null check (qty > 0), unit_price_cents integer not null check (unit_price_cents >= 0), line_total_cents integer generated always as (qty * unit_price_cents) stored)",
  "create table if not exists credit_ledger (id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade, order_id uuid references orders(id) on delete set null, entry_type text not null, amount_cents integer not null, created_at timestamptz not null default now())"
];

const seedStatements = [
  {
    text: "insert into businesses (id, name) values ($1, $2), ($3, $4) on conflict do nothing",
    values: [
      "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
      "Acme Supply Co",
      "2a5c7d1e-8f4b-4a2c-9b3d-7e1f2a3b4c5d",
      "Globex Traders"
    ]
  },
  {
    text: "insert into products (id, business_id, sku, name, stock, price_cents) values ($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12), ($13, $14, $15, $16, $17, $18) on conflict do nothing",
    values: [
      "3e5a9b2c-1d4f-4b7a-8c9d-1e2f3a4b5c6d",
      "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
      "SKU-RED-01",
      "Red Widget",
      100,
      1500,
      "6f7a8b9c-0d1e-4f2a-8b3c-4d5e6f7a8b9c",
      "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
      "SKU-BLU-02",
      "Blue Widget",
      50,
      2500,
      "7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d",
      "2a5c7d1e-8f4b-4a2c-9b3d-7e1f2a3b4c5d",
      "SKU-GRN-01",
      "Green Widget",
      80,
      1800
    ]
  },
  {
    text: "insert into business_credit_accounts (business_id, credit_limit_cents, balance_cents) values ($1, $2, $3), ($4, $5, $6) on conflict do nothing",
    values: [
      "7d8f8c6b-5d2f-4e0a-9c1a-1d4f2c7a3b11",
      500000,
      0,
      "2a5c7d1e-8f4b-4a2c-9b3d-7e1f2a3b4c5d",
      300000,
      0
    ]
  }
];

async function run() {
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const stmt of schemaStatements) {
      await client.query(stmt);
    }
    for (const stmt of seedStatements) {
      await client.query(stmt.text, stmt.values);
    }
    await client.query("commit");
    console.log("Seed data applied.");
  } catch (err) {
    await client.query("rollback");
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Seed failed:", message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();