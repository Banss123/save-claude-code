import { NextResponse } from "next/server";
import { syncAllConnectedGoogleAccounts } from "@/lib/integrations/google/sync";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "CRON_SECRET is not configured." },
      { status: 503 },
    );
  }

  const authorization = request.headers.get("authorization");
  if (authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await syncAllConnectedGoogleAccounts(createAdminClient());
    return NextResponse.json({ ok: stats.errors.length === 0, data: stats });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Google sync failed.",
      },
      { status: 500 },
    );
  }
}
