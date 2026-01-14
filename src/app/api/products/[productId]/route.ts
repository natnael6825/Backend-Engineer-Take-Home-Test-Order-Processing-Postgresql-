import { NextResponse } from "next/server";

import { ensureSchema, getPool } from "@/lib/db";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRegex.test(value);
}

export async function PATCH(request: Request, context: { params: { productId: string } }) {
  const { productId } = context.params;

  if (!isUuid(productId)) {
    return NextResponse.json({ error: "productId must be a UUID" }, { status: 400 });
  }

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

  const updates: string[] = [];
  const values: Array<string | number> = [productId, businessId];
  let idx = values.length + 1;

  if (sku !== undefined) {
    if (typeof sku !== "string" || sku.trim().length === 0) {
      return NextResponse.json({ error: "sku must be a non-empty string" }, { status: 400 });
    }
    updates.push(`sku = $${idx}`);
    values.push(sku.trim());
    idx += 1;
  }

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    updates.push(`name = $${idx}`);
    values.push(name.trim());
    idx += 1;
  }

  if (stock !== undefined) {
    if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
      return NextResponse.json({ error: "stock must be a non-negative integer" }, { status: 400 });
    }
    updates.push(`stock = $${idx}`);
    values.push(stock);
    idx += 1;
  }

  if (priceCents !== undefined) {
    if (typeof priceCents !== "number" || !Number.isInteger(priceCents) || priceCents < 0) {
      return NextResponse.json(
        { error: "priceCents must be a non-negative integer" },
        { status: 400 }
      );
    }
    updates.push(`price_cents = $${idx}`);
    values.push(priceCents);
    idx += 1;
  }

  if (updates.length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const query = `update products set ${updates.join(", ")} where id = $1 and business_id = $2 returning id`;
    const { rows } = await getPool().query(query, values);

    if (!rows[0]?.id) {
      return NextResponse.json({ error: "Product not found" }, { status: 400 });
    }

    return NextResponse.json({ productId: rows[0].id }, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}