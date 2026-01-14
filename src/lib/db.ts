import { Pool } from "pg";

const dbHost = process.env.DB_HOST;
const dbPort = process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;
const dbName = process.env.DB_NAME;
const dbSsl = process.env.DB_SSL;

if (!dbHost || !dbUser || !dbPass || !dbName) {
  throw new Error("Missing DB_HOST, DB_USER, DB_PASS, or DB_NAME");
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
  "create table if not exists credit_ledger (id uuid primary key default gen_random_uuid(), business_id uuid not null references businesses(id) on delete cascade, order_id uuid references orders(id) on delete set null, entry_type text not null, amount_cents integer not null, created_at timestamptz not null default now())",
  "create index if not exists idx_products_business on products(business_id)",
  "create index if not exists idx_credit_accounts_business on business_credit_accounts(business_id)",
  "create index if not exists idx_orders_business on orders(business_id)",
  "create index if not exists idx_order_items_business on order_items(business_id)",
  "create index if not exists idx_credit_ledger_business on credit_ledger(business_id)",
  "create index if not exists idx_orders_business_created on orders(business_id, created_at)",
  "create index if not exists idx_orders_business_due_at on orders(business_id, due_at)",
  "create index if not exists idx_order_items_business_order on order_items(business_id, order_id)",
  "create index if not exists idx_credit_ledger_business_created on credit_ledger(business_id, created_at)"
];

let schemaReady: Promise<void> | null = null;

export async function ensureSchema() {
  if (!schemaReady) {
    schemaReady = (async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const stmt of schemaStatements) {
          await client.query(stmt);
        }
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw err;
      } finally {
        client.release();
      }
    })();
  }

  return schemaReady;
}

export function getPool() {
  return pool;
}