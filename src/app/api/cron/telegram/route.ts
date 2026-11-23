import { NextResponse, type NextRequest } from "next/server";

import { safeEqual } from "@/server/telegram/bot";
import { runDueMessages } from "@/server/telegram/messages";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Sends the teachers' scheduled Telegram messages whose time has come. Call it every 5 minutes from a scheduler
 * (cron-job.org, Vercel Cron on a paid plan, GitHub Actions…) with
 *   Authorization: Bearer <CRON_SECRET>
 * Safe to call often or twice at once: each message run is claimed atomically and each student gets at most one
 * delivery per run. Without CRON_SECRET configured the endpoint refuses everything.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || !safeEqual(request.headers.get("authorization"), `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runDueMessages()) });
  } catch (error) {
    console.error("[cron] telegram messages failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
