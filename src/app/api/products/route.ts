import { NextResponse } from "next/server";

import { ensureSchema, getPool } from "@/lib/db";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRegex.test(value);
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { businessId, sku, name, stock, priceCents } = body as {
    businessId?: unknown;
    sku?: unknown;
    name?: unknown;
    stock?: unknown;
    priceCents?: unknown;
  };

  if (!isUuid(businessId)) {
    return NextResponse.json({ error: "businessId must be a UUID" }, { status: 400 });
  }

  if (typeof sku !== "string" || sku.trim().length === 0) {
    return NextResponse.json({ error: "sku is required" }, { status: 400 });
  }

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    return NextResponse.json({ error: "stock must be a non-negative integer" }, { status: 400 });
  }

  if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < 0) {
    return NextResponse.json(
      { error: "priceCents must be a non-negative integer" },
      { status: 400 }
    );
  }

  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      "insert into products (business_id, sku, name, stock, price_cents) values ($1, $2, $3, $4, $5) returning id",
      [businessId, sku.trim(), name.trim(), stock, priceCents]
    );

    return NextResponse.json({ productId: rows[0]?.id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}