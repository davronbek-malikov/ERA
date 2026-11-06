#!/usr/bin/env node
/**
 * ERA security regression runner (Prompt 07).
 *
 *   npm run test:security                # reset test DB, build into .next-test, run all suites
 *   npm run test:security -- --skip-build  # reuse the last .next-test build
 *
 * Safety: refuses to run unless ERA_TEST_DATABASE_URL (or the default) points at localhost. It never
 * reads or writes the database in `.env`. Start the isolated database once with:
 *   npx prisma dev -n era-test -d
 * and export ERA_TEST_DATABASE_URL with the URL it prints (default below matches a fresh install).
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { startFakeServices } from "./fake-services.mjs";

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const APP_PORT = Number(process.env.SECURITY_APP_PORT ?? 3950);
const STORAGE_PORT = 3951;
const OLLAMA_PORT = 3952;
const AUTH_SECRET = "security-test-secret-0123456789abcdef";
const SERVICE_ROLE_KEY = "service-role-test-key";

const rawUrl = process.env.ERA_TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:51218/template1?sslmode=disable";
const dbUrl = new URL(rawUrl);
if (!["localhost", "127.0.0.1"].includes(dbUrl.hostname)) {
  console.error(`Refusing to run: the security test database must be local (got host "${dbUrl.hostname}").`);
  process.exit(1);
}
// prisma dev speaks through a PgBouncer-like proxy: no prepared statements, one connection.
dbUrl.searchParams.set("pgbouncer", "true");
dbUrl.searchParams.set("connection_limit", "1");

const env = {
  ...process.env,
  ERA_SECURITY_TEST: "1",
  DATABASE_URL: dbUrl.toString(),
  AUTH_SECRET,
  NEXT_DIST_DIR: ".next-test",
  NEXT_TELEMETRY_DISABLED: "1",
  NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${STORAGE_PORT}`,
  SUPABASE_URL: `http://127.0.0.1:${STORAGE_PORT}`,
  SUPABASE_SERVICE_ROLE_KEY: SERVICE_ROLE_KEY,
  SUPABASE_STORAGE_VIDEOS_BUCKET: "course-videos",
  SUPABASE_STORAGE_PUBLIC_BUCKET: "public-assets",
  ERA_LLM_PROVIDER: "ollama",
  OLLAMA_BASE_URL: `http://127.0.0.1:${OLLAMA_PORT}`,
  ERA_MODEL_NAME: "security-test-model",
  ERA_AI_REQUESTS_PER_MINUTE: "60",
  // Knowledge Base (Prompt 09): deterministic test embeddings, explicitly allowed for this isolated run only.
  ERA_EMBEDDING_PROVIDER: "test",
  ERA_ALLOW_TEST_EMBEDDINGS: "1",
  ERA_KB_TOP_K: "8",
  ERA_KB_MIN_SCORE: "0.2",
  VOYAGE_API_KEY: "",
  OPENAI_API_KEY: "",
  SECURITY_BASE_URL: `http://localhost:${APP_PORT}`,
  SECURITY_STORAGE_URL: `http://127.0.0.1:${STORAGE_PORT}`,
  SECURITY_AUTH_SECRET: AUTH_SECRET
};

function run(command, commandArgs, label) {
  console.log(`\n▶ ${label}`);
  const result = spawnSync(command, commandArgs, { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" && command === "npx" });
  return result.status ?? 1;
}

/**
 * Asynchronous step. The fake storage/LLM servers live in this process, so anything that runs while
 * they must answer requests (build, tests) must not block the event loop (spawnSync would).
 */
function runAsync(command, commandArgs, label) {
  console.log(`\n▶ ${label}`);
  return new Promise((resolve) => {
    const child = spawn(command, commandArgs, {
      cwd: root,
      env,
      stdio: "inherit",
      shell: process.platform === "win32" && command === "npx"
    });
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
}

function must(status, label) {
  if (status !== 0) {
    console.error(`✖ ${label} failed (exit ${status}).`);
    process.exit(status || 1);
  }
}

async function waitForServer(url, timeoutMs = 120_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server did not start at ${url}`);
}

function stop(child) {
  if (!child || child.exitCode !== null) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

// 1. Build first. The local `prisma dev` database can stop answering when it sits idle through a long, CPU-heavy
//    build, so every database step runs after the build (and is health-checked).
if (!args.has("--skip-build")) {
  must(run("npx", ["next", "build"], "Build app into .next-test"), "next build");
}

// 2. Database: migrations, health check, fixtures.
// Prisma Migrate (Prompt 09). A database created before migrations existed (schema already present) is
// baselined first: `0_baseline` is only marked as applied, never executed against existing tables.
if (run("npx", ["prisma", "migrate", "deploy"], "Apply migrations to the isolated test database") !== 0) {
  must(run("npx", ["prisma", "migrate", "resolve", "--applied", "0_baseline"], "Baseline an existing test database"), "migrate resolve");
  must(run("npx", ["prisma", "migrate", "deploy"], "Apply migrations to the isolated test database"), "migrate deploy");
}
must(run("npx", ["tsx", "tests/security/fixtures.ts"], "Create security fixtures"), "fixtures");



// 3. Fake external services (storage, LLM, embeddings) live in this process.
const services = await startFakeServices({ storagePort: STORAGE_PORT, ollamaPort: OLLAMA_PORT, serviceRoleKey: SERVICE_ROLE_KEY });

console.log(`\n▶ Start app on http://localhost:${APP_PORT}`);
const server = spawn("npx", ["next", "start", "-p", String(APP_PORT)], {
  cwd: root,
  env,
  stdio: ["ignore", "pipe", "pipe"],
  shell: process.platform === "win32"
});
const serverLog = [];
server.stdout.on("data", (chunk) => serverLog.push(chunk.toString()));
server.stderr.on("data", (chunk) => serverLog.push(chunk.toString()));

let exitCode = 0;
const results = [];
try {
  await waitForServer(`http://localhost:${APP_PORT}/`);
  for (const [label, commandArgs] of [
    ["Authorization core (direct)", ["--import", "tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/authz.test.ts"]],
    ["HTTP security regression", ["--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/api.test.mjs"]],
    ["AI provider adapters (direct)", ["--import", "tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/ai-adapters.test.ts"]],
    ["AI agent engine security (HTTP)", ["--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/ai.test.mjs"]],
    ["Knowledge Base core (direct)", ["--import", "tsx", "--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/knowledge-core.test.ts"]],
    ["Knowledge Base & RAG (HTTP)", ["--test", "--test-reporter=spec", "--test-concurrency=1", "tests/security/knowledge.test.mjs"]]
  ]) {
    const status = await runAsync(process.execPath, commandArgs, label);
    results.push({ label, status });
    if (status !== 0) exitCode = status;
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  stop(server);
  await services.close();
}

const stateDir = path.join(root, "tests", "security", ".state");
mkdirSync(stateDir, { recursive: true });
writeFileSync(path.join(stateDir, "server.log"), serverLog.join(""));
console.log("\nSummary:");
for (const { label, status } of results) console.log(`  ${status === 0 ? "PASS" : "FAIL"}  ${label}`);
console.log(`Server log: tests/security/.state/server.log`);
process.exit(exitCode);
