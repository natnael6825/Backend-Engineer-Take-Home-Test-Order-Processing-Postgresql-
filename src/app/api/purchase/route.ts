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

  const { businessId, idempotencyKey, items } = body as {
    businessId?: unknown;
    idempotencyKey?: unknown;
    items?: unknown;
  };

  if (!isUuid(businessId)) {
    return NextResponse.json({ error: "businessId must be a UUID" }, { status: 400 });
  }

  if (!isUuid(idempotencyKey)) {
    return NextResponse.json(
      { error: "idempotencyKey must be a UUID" },
      { status: 400 }
    );
  }

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items must be a non-empty array" }, { status: 400 });
  }

  const itemMap = new Map<string, number>();

  try {
    for (const item of items) {
      const productId = (item as { product_id?: unknown }).product_id;
      const qty = (item as { qty?: unknown }).qty;

      if (!isUuid(productId)) {
        throw new Error("Each item.product_id must be a UUID");
      }

      if (typeof qty !== "number" || !Number.isInteger(qty) || qty <= 0) {
        throw new Error("Each item.qty must be a positive integer");
      }

      const current = itemMap.get(productId) ?? 0;
      itemMap.set(productId, current + qty);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid items";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    await ensureSchema();
    const client = await getPool().connect();

    try {
      await client.query("begin");

      const existing = await client.query(
        "select id from orders where business_id = $1 and idempotency_key = $2",
        [businessId, idempotencyKey]
      );

      if (existing.rows[0]?.id) {
        await client.query("commit");
        return NextResponse.json({ orderId: existing.rows[0].id }, { status: 200 });
      }

      const creditResult = await client.query(
        "select business_id, credit_limit_cents, balance_cents from business_credit_accounts where business_id = $1 for update",
        [businessId]
      );

      if (!creditResult.rows[0]) {
        throw new Error("credit account not found");
      }

      const credit = creditResult.rows[0] as {
        credit_limit_cents: number;
        balance_cents: number;
      };

      const productIds = Array.from(itemMap.keys()).sort();
      const productResult = await client.query(
        "select id, stock, price_cents from products where business_id = $1 and id = any($2::uuid[]) order by id for update",
        [businessId, productIds]
      );

      if (productResult.rowCount !== productIds.length) {
        throw new Error("invalid product in items");
      }

      let totalCents = 0;

      for (const row of productResult.rows) {
        const qty = itemMap.get(row.id as string) ?? 0;
        if (row.stock < qty) {
          throw new Error("insufficient stock");
        }
        totalCents += row.price_cents * qty;
      }

      if (credit.balance_cents + totalCents > credit.credit_limit_cents) {
        throw new Error("credit limit exceeded");
      }

      let orderId: string | undefined;

      try {
        const orderResult = await client.query(
          "insert into orders (business_id, idempotency_key, status, total_cents, paid_cents, created_at, due_at) values ($1, $2, 'posted', $3, 0, now(), now() + interval '30 days') returning id",
          [businessId, idempotencyKey, totalCents]
        );
        orderId = orderResult.rows[0]?.id;
      } catch (err) {
        const pgErr = err as { code?: string };
        if (pgErr.code === "23505") {
          const existingOrder = await client.query(
            "select id from orders where business_id = $1 and idempotency_key = $2",
            [businessId, idempotencyKey]
          );
          orderId = existingOrder.rows[0]?.id;
          await client.query("commit");
          return NextResponse.json({ orderId }, { status: 200 });
        }
        throw err;
      }

      if (!orderId) {
        throw new Error("failed to create order");
      }

      const itemValues: Array<string | number> = [];
      const valueClauses: string[] = [];
      let idx = 1;

      for (const row of productResult.rows) {
        const qty = itemMap.get(row.id as string) ?? 0;
        valueClauses.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4})`);
        itemValues.push(
          businessId,
          orderId,
          row.id as string,
          qty,
          row.price_cents as number
        );
        idx += 5;
      }

      await client.query(
        `insert into order_items (business_id, order_id, product_id, qty, unit_price_cents) values ${valueClauses.join(", ")}`,
        itemValues
      );

      const updateValues: Array<string | number> = [];
      const updateClauses: string[] = [];
      let updateIdx = 1;

      for (const row of productResult.rows) {
        const qty = itemMap.get(row.id as string) ?? 0;
        updateClauses.push(`($${updateIdx}, $${updateIdx + 1})`);
        updateValues.push(row.id as string, qty);
        updateIdx += 2;
      }

      await client.query(
        `update products p set stock = p.stock - v.qty
         from (values ${updateClauses.join(", ")}) as v(product_id, qty)
         where p.id = v.product_id and p.business_id = $${updateIdx}`,
        [...updateValues, businessId]
      );

      await client.query(
        "update business_credit_accounts set balance_cents = balance_cents + $1 where business_id = $2",
        [totalCents, businessId]
      );

      await client.query(
        "insert into credit_ledger (business_id, order_id, entry_type, amount_cents) values ($1, $2, 'charge', $3)",
        [businessId, orderId, totalCents]
      );

      await client.query("commit");
      return NextResponse.json({ orderId }, { status: 200 });
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}