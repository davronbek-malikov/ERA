/*
 * A teacher's own Telegram account (MTProto, via GramJS), so messages go from their number, not the bot.
 *
 * Every call opens a short connection from the saved session and closes it again (serverless-friendly).
 * Configuration: TELEGRAM_API_ID and TELEGRAM_API_HASH from https://my.telegram.org (API development tools).
 * The security test suite replaces Telegram with a local fake (ERA_SECURITY_TEST + TELEGRAM_ACCOUNT_FAKE_URL);
 * that switch is ignored everywhere else.
 */

const CALL_TIMEOUT_MS = 25_000;

export function accountConfig() {
  const apiId = Number(process.env.TELEGRAM_API_ID?.trim());
  const apiHash = process.env.TELEGRAM_API_HASH?.trim() || "";
  return { apiId, apiHash, configured: Number.isInteger(apiId) && apiId > 0 && apiHash.length > 0 };
}

function fakeUrl() {
  return process.env.ERA_SECURITY_TEST === "1" ? process.env.TELEGRAM_ACCOUNT_FAKE_URL?.trim() || null : null;
}

/** A Telegram login problem with a code the UI can explain. */
export class TelegramAccountError extends Error {
  constructor(
    public code: string,
    public seconds: number | null = null
  ) {
    super(code);
    this.name = "TelegramAccountError";
  }
}

export type AccountUser = { id: string; username: string | null; name: string };
export type SendTarget = { username: string | null; phone: string | null };
export type AccountSendResult =
  | { ok: true }
  | { ok: false; kind: "flood"; seconds: number }
  | { ok: false; kind: "limited" }
  | { ok: false; kind: "revoked" }
  | { ok: false; kind: "unreachable"; reason: string };

const REVOKED = ["AUTH_KEY_UNREGISTERED", "SESSION_REVOKED", "SESSION_EXPIRED", "USER_DEACTIVATED", "USER_DEACTIVATED_BAN", "AUTH_KEY_DUPLICATED"];

function errorCode(error: unknown): { code: string; seconds: number | null } {
  const value = error as { errorMessage?: string; message?: string; seconds?: number };
  const seconds = typeof value?.seconds === "number" ? value.seconds : null;
  const code = (value?.errorMessage || value?.message || "UNKNOWN").toString();
  if (seconds !== null || /^FLOOD/.test(code)) return { code: "FLOOD_WAIT", seconds: seconds ?? 60 };
  return { code, seconds: null };
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([promise, new Promise<T>((_, reject) => setTimeout(() => reject(new TelegramAccountError("TIMEOUT")), CALL_TIMEOUT_MS))]);
}

// ------------------------------------------------------------------------------------------------
// Fake (security tests only)
// ------------------------------------------------------------------------------------------------

async function fake<T>(operation: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${fakeUrl()}/mtproto/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as T & { error?: string; seconds?: number };
  if (payload.error && operation !== "send") throw new TelegramAccountError(payload.error, payload.seconds ?? null);
  return payload;
}

// ------------------------------------------------------------------------------------------------
// Real client (GramJS)
// ------------------------------------------------------------------------------------------------

async function openClient(session: string) {
  const { TelegramClient } = await import("telegram");
  const { StringSession } = await import("telegram/sessions");
  const { apiId, apiHash } = accountConfig();
  if (!apiId || !apiHash) throw new TelegramAccountError("NOT_CONFIGURED");
  const client = new TelegramClient(new StringSession(session), apiId, apiHash, { connectionRetries: 2, autoReconnect: false });
  client.setLogLevel("error" as never);
  await withTimeout(client.connect());
  return client;
}

async function closeClient(client: { destroy: () => Promise<void> } | null) {
  try {
    await client?.destroy();
  } catch {
    // already closed
  }
}

function toUser(user: unknown): AccountUser {
  const value = user as { id?: { toString(): string }; username?: string | null; firstName?: string | null; lastName?: string | null };
  return {
    id: value?.id?.toString() ?? "",
    username: value?.username ?? null,
    name: [value?.firstName, value?.lastName].filter(Boolean).join(" ") || value?.username || "Telegram"
  };
}

/** Step 1: Telegram sends a login code to the teacher's Telegram app. */
export async function startLogin(phone: string): Promise<{ session: string; phoneCodeHash: string }> {
  if (fakeUrl()) return fake("sendCode", { phone });
  const { apiId, apiHash } = accountConfig();
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    client = await openClient("");
    const { phoneCodeHash } = await withTimeout(client.sendCode({ apiId, apiHash }, phone));
    return { session: String(client.session.save()), phoneCodeHash };
  } catch (error) {
    if (error instanceof TelegramAccountError) throw error;
    const { code, seconds } = errorCode(error);
    throw new TelegramAccountError(code, seconds);
  } finally {
    await closeClient(client);
  }
}

/** Step 2: the code. Accounts with two-step verification continue with verifyPassword. */
export async function verifyCode(
  session: string,
  phone: string,
  phoneCodeHash: string,
  code: string
): Promise<{ status: "CONNECTED"; session: string; user: AccountUser } | { status: "PASSWORD_NEEDED"; session: string }> {
  if (fakeUrl()) {
    const result = await fake<{ session: string; user?: AccountUser; passwordNeeded?: boolean }>("signIn", { session, phone, phoneCodeHash, code });
    return result.passwordNeeded ? { status: "PASSWORD_NEEDED", session: result.session } : { status: "CONNECTED", session: result.session, user: result.user! };
  }
  const { Api } = await import("telegram");
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    client = await openClient(session);
    const result = await withTimeout(client.invoke(new Api.auth.SignIn({ phoneNumber: phone, phoneCodeHash, phoneCode: code })));
    if (result instanceof Api.auth.AuthorizationSignUpRequired) throw new TelegramAccountError("PHONE_NUMBER_UNOCCUPIED");
    return { status: "CONNECTED", session: String(client.session.save()), user: toUser((result as { user: unknown }).user) };
  } catch (error) {
    if (error instanceof TelegramAccountError) throw error;
    const { code: reason, seconds } = errorCode(error);
    if (reason === "SESSION_PASSWORD_NEEDED" && client) return { status: "PASSWORD_NEEDED", session: String(client.session.save()) };
    throw new TelegramAccountError(reason, seconds);
  } finally {
    await closeClient(client);
  }
}

/** Step 3 (only with two-step verification): one password attempt per call. */
export async function verifyPassword(session: string, password: string): Promise<{ session: string; user: AccountUser }> {
  if (fakeUrl()) return fake("password", { session, password });
  const { Api } = await import("telegram");
  const { computeCheck } = await import("telegram/Password");
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    client = await openClient(session);
    const srp = await withTimeout(client.invoke(new Api.account.GetPassword()));
    const check = await computeCheck(srp, password);
    const result = await withTimeout(client.invoke(new Api.auth.CheckPassword({ password: check })));
    return { session: String(client.session.save()), user: toUser((result as { user: unknown }).user) };
  } catch (error) {
    if (error instanceof TelegramAccountError) throw error;
    const { code, seconds } = errorCode(error);
    throw new TelegramAccountError(code, seconds);
  } finally {
    await closeClient(client);
  }
}

/**
 * Sends one message from the teacher's account. @username always works (unless the student's privacy blocks
 * strangers); a phone number only works when the student is in the teacher's contacts (we never add contacts).
 */
export async function sendFromAccount(session: string, target: SendTarget, text: string): Promise<AccountSendResult> {
  const peer = target.username ?? target.phone;
  if (!peer) return { ok: false, kind: "unreachable", reason: "No Telegram username or phone number saved." };
  if (fakeUrl()) {
    const result = await fake<{ ok?: boolean; error?: string; seconds?: number }>("send", { session, target: peer, text });
    if (result.ok) return { ok: true };
    return classify({ errorMessage: result.error, seconds: result.seconds });
  }
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    client = await openClient(session);
    await withTimeout(client.sendMessage(peer, { message: text, linkPreview: false }));
    return { ok: true };
  } catch (error) {
    return classify(error);
  } finally {
    await closeClient(client);
  }
}

function classify(error: unknown): AccountSendResult {
  const { code, seconds } = errorCode(error);
  if (code === "FLOOD_WAIT") return { ok: false, kind: "flood", seconds: seconds ?? 60 };
  if (code === "PEER_FLOOD") return { ok: false, kind: "limited" };
  if (REVOKED.includes(code)) return { ok: false, kind: "revoked" };
  if (code === "TIMEOUT") return { ok: false, kind: "unreachable", reason: "Telegram did not answer in time." };
  return { ok: false, kind: "unreachable", reason: code.slice(0, 120) };
}

/** Ends ERA's login on Telegram (it disappears from the teacher's Settings → Devices). */
export async function logoutAccount(session: string): Promise<void> {
  if (fakeUrl()) {
    await fake("logout", { session });
    return;
  }
  const { Api } = await import("telegram");
  let client: Awaited<ReturnType<typeof openClient>> | null = null;
  try {
    client = await openClient(session);
    await withTimeout(client.invoke(new Api.auth.LogOut()));
  } catch {
    // Already logged out or unreachable: the session is deleted on our side anyway.
  } finally {
    await closeClient(client);
  }
}
