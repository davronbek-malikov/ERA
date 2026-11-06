import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export const BASE = process.env.SECURITY_BASE_URL ?? "http://localhost:3950";
export const STORAGE = process.env.SECURITY_STORAGE_URL ?? "http://127.0.0.1:3951";
const SECRET = process.env.SECURITY_AUTH_SECRET ?? "security-test-secret-0123456789abcdef";

export const fx = JSON.parse(readFileSync(path.join(process.cwd(), "tests", "security", ".state", "fixtures.json"), "utf8"));

/** Mints an `era_session` cookie exactly like src/lib/auth.ts does. */
export function mintSession(user, { expiresInSeconds = 3600, secret = SECRET, role } = {}) {
  const payload = Buffer.from(
    JSON.stringify({ userId: user.id, role: role ?? user.role, name: user.name, exp: Math.floor(Date.now() / 1000) + expiresInSeconds })
  ).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `era_session=${payload}.${signature}`;
}

export const as = (user, options) => ({ cookie: mintSession(user, options) });
export const anonymous = { cookie: "" };

/** fetch without following redirects; returns status, headers, text and parsed JSON (if any). */
export async function call(method, url, { session = anonymous, json, body, headers = {} } = {}) {
  const init = {
    method,
    redirect: "manual",
    headers: {
      ...(session.cookie ? { cookie: session.cookie } : {}),
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      // Browsers send Origin on POST; the app requires it to match the host.
      ...(method !== "GET" ? { origin: new URL(BASE).origin } : {}),
      ...headers
    },
    body: json !== undefined ? JSON.stringify(json) : body
  };
  const response = await fetch(`${BASE}${url}`, init);
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status, headers: response.headers, text, data, location: response.headers.get("location") };
}

export const get = (url, options) => call("GET", url, options);
export const post = (url, options) => call("POST", url, options);

export async function storageLog() {
  return (await fetch(`${STORAGE}/__log`)).json();
}
export async function resetStorageLog() {
  await fetch(`${STORAGE}/__reset`, { method: "POST" });
}

/** Strings that must never reach a client: secrets, stack traces, provider internals. */
export const LEAK_PATTERNS = [
  /SECRET_PROVIDER_DETAIL/,
  /\/internal\/secret/,
  /ERA_MODEL_NAME/,
  /SUPABASE_SERVICE_ROLE_KEY/,
  /security-test-secret/,
  /service-role-test-key/,
  /at \w+ \(.*:\d+:\d+\)/, // stack frame
  /PrismaClient|prisma\./i,
  /passwordHash/
];

export function assertNoLeak(assert, text, label) {
  for (const pattern of LEAK_PATTERNS) {
    assert.doesNotMatch(text, pattern, `${label} leaked ${pattern}`);
  }
}

/**
 * Finds a server action id on a rendered studio page. Next renders progressive-enhancement forms with
 * a hidden `$ACTION_ID_<id>` input; posting multipart data with that field invokes the action exactly
 * as the browser would.
 */
export function findActionIds(html) {
  return [...new Set([...html.matchAll(/name="\$ACTION_ID_([0-9a-f]+)"/g)].map((m) => m[1]))];
}

export async function invokeAction(pagePath, actionId, fields, session) {
  const form = new FormData();
  form.append(`$ACTION_ID_${actionId}`, "");
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return call("POST", pagePath, { session, body: form });
}

/** Forms on a page: their server-action id and the field names they submit. */
export function findForms(html) {
  return [...html.matchAll(/<form[\s\S]*?<\/form>/g)].map((match) => {
    const chunk = match[0];
    const actionId = /name="\$ACTION_ID_([0-9a-f]+)"/.exec(chunk)?.[1] ?? null;
    const fields = new Set([...chunk.matchAll(/name="([A-Za-z][\w-]*)"/g)].map((field) => field[1]));
    return { actionId, fields };
  });
}

/** The action whose form has every field in `must` and none in `mustNot`. */
export function actionWithFields(html, must, mustNot = []) {
  const form = findForms(html).find(
    (candidate) =>
      candidate.actionId && must.every((name) => candidate.fields.has(name)) && mustNot.every((name) => !candidate.fields.has(name))
  );
  return form?.actionId ?? null;
}

/**
 * Every server-action id referenced by a page (hidden `$ACTION_ID_` fields and action references in the
 * RSC payload, e.g. delete buttons inside closed dialogs). Used to fire *all* of a page's actions at a
 * victim record: whichever one is the delete/update action must refuse.
 */
export function allActionIds(html) {
  const ids = new Set(findActionIds(html));
  for (const match of html.matchAll(/(?<![0-9a-f])([0-9a-f]{40,42})(?![0-9a-f])/g)) ids.add(match[1]);
  return [...ids];
}
