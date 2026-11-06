/**
 * Local stand-ins for Supabase Storage and Ollama, so the security suite never talks to real services.
 * Every call is recorded; tests read the log through GET /__log and reset it with POST /__reset.
 */
import http from "node:http";

export function startFakeServices({ storagePort, ollamaPort, serviceRoleKey }) {
  const log = [];
  const objects = new Map(); // "bucket/path" -> { contentType, body }

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { "content-type": "application/json", ...headers });
    res.end(typeof body === "string" ? body : JSON.stringify(body));
  };
  const readRaw = (req) =>
    new Promise((resolve) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
    });
  const readBody = async (req) => (await readRaw(req)).toString("utf8");

  const storage = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${storagePort}`);
    const raw = await readRaw(req);
    const body = raw.toString("utf8");
    if (url.pathname === "/__log") return send(res, 200, log);
    if (url.pathname === "/__reset") {
      log.length = 0;
      return send(res, 200, { ok: true });
    }

    const authorized = req.headers.authorization === `Bearer ${serviceRoleKey}`;
    const entry = { method: req.method, path: url.pathname, body: body ? safeJson(body) : null, upsert: req.headers["x-upsert"] ?? null, authorized };
    log.push(entry);

    // Browsers upload straight to signed URLs (cross-origin), like Supabase Storage: answer CORS preflights.
    if (url.pathname.startsWith("/storage/v1/object/upload/sign/")) {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "PUT, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "content-type, x-upsert, authorization");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
      }
    }
    // Browser upload to a signed URL (Prompt 09 Knowledge Base): store the real bytes.
    let upload = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (upload && req.method === "PUT") {
      objects.set(`${upload[1]}/${decodeURIComponent(upload[2])}`, raw);
      return send(res, 200, { Key: `${upload[1]}/${upload[2]}` });
    }
    // Server download with the service key.
    upload = /^\/storage\/v1\/object\/authenticated\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (upload && req.method === "GET") {
      if (!authorized) return send(res, 401, { message: "invalid key" });
      const stored = objects.get(`${upload[1]}/${decodeURIComponent(upload[2])}`);
      if (!stored) return send(res, 404, { message: "not found" });
      res.writeHead(200, { "content-type": "application/octet-stream" });
      return res.end(stored);
    }

    // Signed upload URL
    let m = /^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (m && req.method === "POST") {
      if (!authorized) return send(res, 401, { message: "invalid key SECRET_PROVIDER_DETAIL" });
      return send(res, 200, { url: `/object/upload/sign/${m[1]}/${m[2]}?token=upload-token` });
    }
    // Signed read URL
    m = /^\/storage\/v1\/object\/sign\/([^/]+)\/(.+)$/.exec(url.pathname);
    if (m && req.method === "POST") {
      if (!authorized) return send(res, 401, { message: "invalid key" });
      const { expiresIn } = safeJson(body) ?? {};
      return send(res, 200, { signedURL: `/object/sign/${m[1]}/${m[2]}?token=signed-${expiresIn}` });
    }
    if (m && req.method === "GET") {
      return send(res, 200, "file-bytes", { "content-type": "application/pdf" });
    }
    // Delete
    m = /^\/storage\/v1\/object\/([^/]+)$/.exec(url.pathname);
    if (m && req.method === "DELETE") {
      if (!authorized) return send(res, 401, { message: "invalid key" });
      return send(res, 200, []);
    }
    // Public object reads (should never be needed for private files)
    if (url.pathname.startsWith("/storage/v1/object/public/")) {
      return send(res, 200, "public-bytes", { "content-type": "application/octet-stream" });
    }
    return send(res, 404, { message: "not found" });
  });

  /*
   * Fake LLM server (port `ollamaPort`): Ollama /api/chat (NDJSON), Anthropic /v1/messages (SSE) and OpenAI
   * /v1/chat/completions (SSE). The last user message controls behaviour:
   *   FORCE_PROVIDER_FAILURE → HTTP 500 with an internal-looking error
   *   FORCE_STREAM_CUT       → two chunks, then the socket is destroyed
   *   SLOW_STREAM            → one chunk every 250 ms for 10 s (cancellation tests)
   *   FORCE_REFUSAL          → Anthropic refusal stop reason
   * Every request is logged with its full system prompt and messages (prompt-injection assertions).
   */
  const ollama = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${ollamaPort}`);
    const body = safeJson(await readBody(req)) ?? {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userMessages = messages.filter((message) => message.role === "user");
    const last = String(userMessages.at(-1)?.content ?? "");
    const system =
      typeof body.system === "string" ? body.system : String(messages.find((message) => message.role === "system")?.content ?? "");
    // Fake embedding endpoints (Prompt 09): Voyage/OpenAI-style /v1/embeddings and Ollama /api/embed.
    if (url.pathname === "/v1/embeddings" || url.pathname === "/api/embed") {
      const inputs = Array.isArray(body.input) ? body.input.map(String) : [String(body.input ?? "")];
      log.push({ method: req.method, path: `embed:${url.pathname}`, count: inputs.length, model: body.model, auth: req.headers.authorization ?? null });
      if (inputs.some((text) => text.includes("FAIL_EMBED_500"))) return send(res, 500, { error: "embedding backend exploded" });
      if (inputs.some((text) => text.includes("FAIL_EMBED_401"))) return send(res, 401, { error: "bad key" });
      const dims = Number(body.output_dimension ?? body.dimensions ?? 8);
      const vectorFor = (text) => Array.from({ length: dims }, (_, i) => ((text.length * (i + 3)) % 17) / 17 - 0.5 + (i === 0 ? 0.01 : 0));
      if (url.pathname === "/api/embed") return send(res, 200, { model: body.model, embeddings: inputs.map(vectorFor) });
      const wrongShape = inputs.some((text) => text.includes("WRONG_DIMENSIONS"));
      return send(res, 200, { data: inputs.map((text, index) => ({ index, embedding: wrongShape ? [1, 2, 3] : vectorFor(text) })), usage: { total_tokens: inputs.length * 5 } });
    }

    const kind = url.pathname === "/api/chat" ? "ollama" : url.pathname === "/v1/messages" ? "anthropic" : url.pathname === "/v1/chat/completions" ? "openai" : "unknown";
    log.push({ method: req.method, path: `${kind === "ollama" ? "ollama" : kind}:${url.pathname}`, question: last, system, messages, model: body.model, auth: req.headers.authorization ?? req.headers["x-api-key"] ?? null, body });

    const answer = `Fake tutor answer to: ${last.slice(0, 80)}`;
    const pieces = [answer.slice(0, 12), answer.slice(12)];

    if (kind === "anthropic" && (req.headers["x-api-key"] === "bad-key" || req.headers.authorization === "Bearer bad-key")) {
      return send(res, 401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key SECRET_PROVIDER_DETAIL" } });
    }
    if (last.includes("FORCE_PROVIDER_FAILURE")) {
      return send(res, 500, { error: "model exploded at /internal/secret/path" });
    }

    const slow = last.includes("SLOW_STREAM");
    const cut = last.includes("FORCE_STREAM_CUT");
    const chunks = slow ? Array.from({ length: 40 }, (_, i) => `chunk${i} `) : pieces;
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    let closed = false;
    req.on("close", () => (closed = true));
    res.on("close", () => (closed = true));

    if (kind === "ollama") {
      res.writeHead(200, { "content-type": "application/x-ndjson" });
      for (const [index, chunk] of chunks.entries()) {
        if (closed) return;
        res.write(JSON.stringify({ model: body.model, message: { role: "assistant", content: chunk }, done: false }) + "\n");
        if (cut && index === 1) return void setTimeout(() => res.socket.destroy(), 80); // let the chunks flush first
        if (slow) await wait(250);
      }
      res.end(JSON.stringify({ model: body.model, message: { role: "assistant", content: "" }, done: true, done_reason: "stop", prompt_eval_count: 42, eval_count: 7 }) + "\n");
      return;
    }

    if (kind === "anthropic") {
      const event = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
      res.writeHead(200, { "content-type": "text/event-stream" });
      event("message_start", {
        message: { id: "msg_fake", type: "message", role: "assistant", content: [], model: body.model, stop_reason: null, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } }
      });
      event("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
      for (const [index, chunk] of chunks.entries()) {
        if (closed) return;
        event("content_block_delta", { index: 0, delta: { type: "text_delta", text: chunk } });
        if (cut && index === 1) return void setTimeout(() => res.socket.destroy(), 80); // let the chunks flush first
        if (slow) await wait(250);
      }
      event("content_block_stop", { index: 0 });
      const refused = last.includes("FORCE_REFUSAL");
      event("message_delta", { delta: { stop_reason: refused ? "refusal" : "end_turn", stop_sequence: null, ...(refused ? { stop_details: { type: "refusal", category: "cyber", explanation: "fake" } } : {}) }, usage: { output_tokens: 30 } });
      event("message_stop", {});
      return res.end();
    }

    if (kind === "openai") {
      if (!String(req.headers.authorization ?? "").startsWith("Bearer ")) return send(res, 401, { error: { message: "no key" } });
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const [index, chunk] of chunks.entries()) {
        res.write(`data: ${JSON.stringify({ model: body.model, choices: [{ index: 0, delta: { content: chunk }, finish_reason: null }] })}\n\n`);
        if (cut && index === 1) return void setTimeout(() => res.socket.destroy(), 80); // let the chunks flush first
      }
      res.write(`data: ${JSON.stringify({ model: body.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\n`);
      res.write(`data: ${JSON.stringify({ model: body.model, choices: [], usage: { prompt_tokens: 55, completion_tokens: 9 } })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }

    return send(res, 404, { error: "not found" });
  });

  objects.clear();
  return Promise.all([
    new Promise((resolve) => storage.listen(storagePort, "127.0.0.1", resolve)),
    new Promise((resolve) => ollama.listen(ollamaPort, "127.0.0.1", resolve))
  ]).then(() => ({
    close: () => Promise.all([new Promise((r) => storage.close(r)), new Promise((r) => ollama.close(r))])
  }));
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
