import { NextResponse } from "next/server";

import { ensureSchema, getPool } from "@/lib/db";

const uuidRegex =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
  return typeof value === "string" && uuidRegex.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const businessId = searchParams.get("businessId");

  if (!isUuid(businessId)) {
    return NextResponse.json({ error: "businessId must be a UUID" }, { status: 400 });
  }

  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      "select business_id, sum(total_cents - paid_cents) as overdue_cents, min(due_at) as oldest_due_at, count(*) as overdue_orders from orders where business_id = $1 and status = 'posted' and (total_cents - paid_cents) > 0 and due_at < now() - interval '30 days' group by business_id order by overdue_cents desc",
      [businessId]
    );

    return NextResponse.json(rows[0] ?? null, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}