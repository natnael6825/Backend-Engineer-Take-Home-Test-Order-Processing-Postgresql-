import { NextResponse } from "next/server";

import { ensureSchema, getPool } from "@/lib/db";

const isoDateRegex =
  /^\d{4}-\d{2}-\d{2}([tT ]\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})?)?$/;

function parseDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  if (!isoDateRegex.test(value)) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const dueBeforeRaw = searchParams.get("dueBefore");
  const dueAfterRaw = searchParams.get("dueAfter");
  const pageRaw = searchParams.get("page");
  const pageSizeRaw = searchParams.get("pageSize");

  const dueBefore = parseDate(dueBeforeRaw);
  const dueAfter = parseDate(dueAfterRaw);

  if ((dueBeforeRaw && !dueBefore) || (dueAfterRaw && !dueAfter)) {
    return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
  }

  const page = pageRaw ? Number(pageRaw) : 1;
  const pageSize = pageSizeRaw ? Number(pageSizeRaw) : 20;

  if (!Number.isInteger(page) || page <= 0) {
    return NextResponse.json({ error: "page must be a positive integer" }, { status: 400 });
  }

  if (!Number.isInteger(pageSize) || pageSize <= 0 || pageSize > 100) {
    return NextResponse.json(
      { error: "pageSize must be a positive integer up to 100" },
      { status: 400 }
    );
  }

  const offset = (page - 1) * pageSize;

  try {
    await ensureSchema();
    const { rows } = await getPool().query(
      `with overdue as (
         select
           o.business_id,
           sum(o.total_cents - o.paid_cents) as overdue_cents,
           min(o.due_at) as oldest_due_at,
           count(*) as overdue_orders
         from orders o
         where o.status = 'posted'
           and (o.total_cents - o.paid_cents) > 0
           and o.due_at < coalesce($1::timestamptz, now() - interval '30 days')
           and ($2::timestamptz is null or o.due_at >= $2)
         group by o.business_id
       ), counted as (
         select
           ob.business_id,
           b.name,
           ob.overdue_cents,
           ob.oldest_due_at,
           ob.overdue_orders,
           count(*) over () as total_count
         from overdue ob
         join businesses b on b.id = ob.business_id
       )
       select * from counted
       order by overdue_cents desc
       limit $3 offset $4`,
      [dueBefore ? dueBefore.toISOString() : null, dueAfter ? dueAfter.toISOString() : null, pageSize, offset]
    );

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    return NextResponse.json(
      {
        items: rows.map(({ total_count, ...rest }) => rest),
        page,
        pageSize,
        total
      },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}