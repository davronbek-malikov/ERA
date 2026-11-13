import { UserRole } from "@prisma/client";
import type { NextRequest } from "next/server";

import { createApiSuccessResponse } from "@/lib/app-errors";
import { assertRateLimit, getUserRateLimitKeyParts } from "@/lib/rate-limit";
import { RequestError } from "@/lib/validation";
import { assertRole, assertSameOrigin, requireAuthenticatedUser, toApiErrorResponse } from "@/server/authz";

/**
 * Voice input for the ERA Assistant: a short recording in, text out. Speech recognition runs on Groq's Whisper
 * (GROQ_API_KEY), or on OpenAI's Whisper when only OPENAI_API_KEY is set. The audio is forwarded once and not
 * stored. Only teachers and administrators (the assistant users) may use it; sizes and rates are capped.
 */

const MAX_BYTES = 10 * 1024 * 1024; // ~10 minutes of compressed speech
const ALLOWED_TYPES = /^audio\/(webm|ogg|mp4|mpeg|mp3|wav|x-wav|m4a|x-m4a|aac)/;

function provider() {
  const groq = process.env.GROQ_API_KEY?.trim();
  if (groq) {
    return { url: `${(process.env.GROQ_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/+$/, "")}/audio/transcriptions`, key: groq, model: "whisper-large-v3-turbo" };
  }
  const openai = process.env.OPENAI_API_KEY?.trim() || process.env.ERA_API_KEY?.trim();
  if (openai) {
    return { url: `${(process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/+$/, "")}/audio/transcriptions`, key: openai, model: "whisper-1" };
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireAuthenticatedUser();
    assertRole(user, [UserRole.INSTRUCTOR, UserRole.ADMIN], "Voice input is available in the teacher and admin assistants.");
    await assertRateLimit({ scope: "transcribe", maxAttempts: 30, windowMs: 60_000, cooldownMs: 60_000, keyParts: getUserRateLimitKeyParts(user.id) });

    const target = provider();
    if (!target) throw new RequestError(503, "voice-not-configured", "Voice input isn't set up yet. Type your message instead.");

    const declared = Number(request.headers.get("content-length") ?? "0");
    if (declared > MAX_BYTES + 64 * 1024) throw new RequestError(413, "audio-too-large", "That recording is too long. Keep it under 10 minutes.");

    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) throw new RequestError(400, "missing-audio", "No recording received.");
    if (audio.size > MAX_BYTES) throw new RequestError(413, "audio-too-large", "That recording is too long. Keep it under 10 minutes.");
    if (audio.type && !ALLOWED_TYPES.test(audio.type)) throw new RequestError(415, "unsupported-audio", "This audio format isn't supported.");

    const upstream = new FormData();
    const extension = audio.type.includes("mp4") || audio.type.includes("m4a") ? "m4a" : audio.type.includes("ogg") ? "ogg" : audio.type.includes("wav") ? "wav" : "webm";
    upstream.append("file", audio, `voice.${extension}`);
    upstream.append("model", target.model);
    upstream.append("response_format", "json");
    upstream.append("temperature", "0");

    const response = await fetch(target.url, { method: "POST", headers: { Authorization: `Bearer ${target.key}` }, body: upstream, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) {
      console.error(`[transcribe] provider responded ${response.status}`);
      throw new RequestError(502, "transcription-failed", "Couldn't understand the recording. Please try again.");
    }
    const payload = (await response.json().catch(() => null)) as { text?: string } | null;
    const text = (payload?.text ?? "").trim();
    return createApiSuccessResponse({ text });
  } catch (error) {
    return toApiErrorResponse(error, { code: "transcription-failed", message: "Voice input is temporarily unavailable. Please type instead.", log: "transcribe" });
  }
}
