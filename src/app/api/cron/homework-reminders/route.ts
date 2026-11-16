import { NextResponse, type NextRequest } from "next/server";

import { runScheduledReminders } from "@/server/management/reminders";
import { safeEqual } from "@/server/telegram/bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
 * Saturday homework reminders. Called by Vercel Cron (vercel.json) or any external scheduler with
 *   Authorization: Bearer <CRON_SECRET>
 * Sends only on Saturdays (Asia/Seoul) unless ?anyday=1. Safe to call repeatedly: a student gets at most
 * one message per judged week. Without CRON_SECRET configured the endpoint refuses everything.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 401 });
  }
  try {
    const result = await runScheduledReminders({ anyDay: request.nextUrl.searchParams.get("anyday") === "1" });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("[cron] homework reminders failed", error instanceof Error ? error.message : "unknown");
    return NextResponse.json({ ok: false, error: "Reminder run failed." }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
