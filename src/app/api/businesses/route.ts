import { NextResponse } from "next/server";

import { ensureSchema, getPool } from "@/lib/db";

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

  const { name, creditLimitCents } = body as {
    name?: unknown;
    creditLimitCents?: unknown;
  };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (
    typeof creditLimitCents !== "number" ||
    !Number.isInteger(creditLimitCents) ||
    creditLimitCents < 0
  ) {
    return NextResponse.json(
      { error: "creditLimitCents must be a non-negative integer" },
      { status: 400 }
    );
  }

  try {
    await ensureSchema();
    const client = await getPool().connect();

    try {
      await client.query("begin");
      const businessResult = await client.query(
        "insert into businesses (name) values ($1) returning id",
        [name.trim()]
      );
      const businessId = businessResult.rows[0]?.id as string | undefined;

      if (!businessId) {
        throw new Error("Failed to create business");
      }

      await client.query(
        "insert into business_credit_accounts (business_id, credit_limit_cents, balance_cents) values ($1, $2, 0)",
        [businessId, creditLimitCents]
      );

      await client.query("commit");
      return NextResponse.json({ businessId }, { status: 200 });
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