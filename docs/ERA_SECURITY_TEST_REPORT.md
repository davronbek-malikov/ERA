# ERA Academy — Security Test Report (Prompt 07)

Every number below comes from a run that actually happened. Tests that were not executed are listed as
**NOT TESTED**, never as passed.

## 1. How to run

```bash
npx prisma dev -n era-test -d          # once: isolated local Postgres (prints its URL)
export ERA_TEST_DATABASE_URL=...       # only if it differs from postgres://postgres:postgres@localhost:51218/template1
npm run test:security                  # schema sync → fixtures → build (.next-test) → next start :3950 → suites
npm run test:security -- --skip-build  # reuse the last build
```

**Isolation guarantees**
- **Database:** the runner refuses any database host other than `localhost`/`127.0.0.1`. The fixture script
  also refuses to clear a database that contains any account not ending in `@security.test`, so the dev
  database (`era-local`) and production are never touched. The schema sync is non-destructive
  (`prisma db push`, no reset).
- **External services:** Supabase Storage and Ollama are replaced by in-process fakes (ports 3951/3952) that
  record every call. No real provider is contacted, and no real credentials are used: `AUTH_SECRET` and the
  service-role key are test-only values.
- **Build output:** the app is built into `.next-test` (`NEXT_DIST_DIR`), so the dev server's `.next` is
  untouched.
- Sessions are minted with the same HMAC construction as `src/lib/auth.ts`, which allows expired, tampered
  and role-forged variants to be tested.

## 2. Result of the final run (2026-11-06)

| Suite | File | Tests | Passed | Failed |
|---|---|---|---|---|
| Authorization core (direct: helpers + DB) | `tests/security/authz.test.ts` | 12 | **12** | 0 |
| HTTP regression (production build) | `tests/security/api.test.mjs` | 97 | **97** | 0 |
| **Total** | | **109** | **109** | **0** |

The build ran as part of the same run (`✓ Compiled successfully`). `tsc --noEmit` and `next lint` were clean.

### HTTP suite by area

| § | Area | Tests | Result |
|---|---|---|---|
| 1 | Authentication: 9 protected APIs signed out; expired, tampered and suspended sessions; role forged inside a valid cookie; 5 workspace pages → sign-in with deep link | 18 | 18 ✅ |
| 2 | Course access: not-enrolled student on chat, context, history, practice and progress (no implicit enrollment), classroom HTML; draft course and draft lesson; signed video URL; practice for an enrolled vs. a foreign course | 11 | 11 ✅ |
| 3 | Tutor: success with a server-composed timestamp; another student's conversation; `userId` in the body ignored; lesson/course mismatch; teacher and admin denied; 8 invalid bodies; non-JSON, array and 40 KB bodies; provider failure without leakage; cross-origin POST | 16 | 16 ✅ |
| 4 | Progress, enrollment and reviews: own completion; another student's progress; foreign lesson; foreign `currentLessonId`; draft lesson; invalid values; teacher denied; review rules; enroll still works; view de-duplication | 10 | 10 ✅ |
| 5 | Materials and storage: unauthorized downloads (401/403/404, nothing signed); enrolled download → 5-minute signed URL with `no-store`; owner and admin; invalid IDs; no permanent URLs in classroom HTML; student upload 403; 10 upload-validation cases; private bucket and `x-upsert:false`; public bucket for thumbnails; delete ownership and traversal | 19 | 19 ✅ |
| 6 | Teacher isolation (studio server actions invoked over HTTP exactly as a browser form): own-only listing; teacher⁰ sees nothing on 4 pages; foreign context 404; own draft preview; foreign editor; foreign update, every action fired at a foreign course, foreign material and its stored file; storage IDOR attach; `javascript:` URL; merchandising flags; legitimate own update and own material | 14 | 14 ✅ |
| 7 | Admin boundaries: teacher on the users page; no password hashes; teacher calling the create-user action; admin self-delete refused; admin deleting another admin allowed; admin access to permitted resources | 6 | 6 ✅ |
| 8 | Legacy URL redirect without content; legacy → classroom for an enrolled student; security headers | 3 | 3 ✅ |

### Required scenarios (Prompt 07 §9)

| Scenario | Expected | Observed | Test |
|---|---|---|---|
| Signed out → protected API | 401 or redirect | 401 on 9 APIs; 307 → sign-in on 5 pages | §1 |
| Student → course not enrolled | 403 or safe 404 | 403 `not-enrolled` (chat, context, history, practice, progress, download); classroom HTML without content | §2, §5 |
| Student → another student's conversation | Denied | History returns only own messages; body `userId` ignored | §3 |
| Teacher → another teacher's course | Denied | 404 on API; editor not rendered; update, delete and material actions have no effect | §6 |
| Teacher → admin users API | 403 | Users page shows no user data; create-user action refused (no user created) | §7 |
| Teacher without profile → editor | Denied | Empty courses, lessons, materials and progress; update refused; `getStudioScope` = none | §6, authz |
| Unauthorized → private material download | Denied | 401 / 403 / 404, and no signed URL issued | §5 |
| Enrolled student → authorized material | Allowed | 302 → signed URL (300 s), `Cache-Control: no-store` | §5 |
| Student → modify another student's progress | Denied | Other student's completions unchanged | §4 |
| Student → invalid lesson/course relationship | Denied | 400 (progress), 404 (chat) | §3, §4 |
| Unauthorized → legacy lesson | Denied or safe redirect | 307 → `/learn/...` → sign-in; no content in the response | §1, §8 |
| Admin → permitted resource | Allowed | 200 / 302 | §7 |

Additionally required: invalid bodies ✅ · missing session ✅ · expired session ✅ · invalid IDs ✅ ·
error leakage ✅ · upload validation ✅ · direct URLs ✅.

## 3. Regression of legitimate workflows

| Check | Result |
|---|---|
| Security suite "legitimate workflow" tests (enrolled chat, progress, practice, review, enroll, own course update, own material, owner/admin downloads, admin deletes another admin) | All passed (inside the 97) |
| Existing UI QA flows (`qa-test.cjs`, headless Chrome, dev server on the local `era-local` DB, 3 roles) | **111/113 passed, 0 console errors** |
| The 2 QA misses | Not regressions. **(a)** "2 of 3 lessons completed" failed because the QA script's regex lost its `\d` and reads `/d of 3/`. **(b)** "Recent feedback shows Passed 2/2" failed because every QA run's *Run checks* step stores a new FAILED submission, which has pushed the seeded PASSED one out of the recent list. The newest of these (2026-11-06 00:44 UTC) was created **after** the security changes, which shows that enrolled students can still submit practice. |
| Dev server spot-checks | Legacy URL → 307 into `/learn`; workspaces → 307 sign-in with `next`; headers present; anonymous context API → 401 |

## 4. Problems found *by* the tests and fixed

| Problem | Fix |
|---|---|
| Teacher Preview of a **draft** lesson returned 404 from the context API (my change: access allowed, but the loader still filtered to published content) | `getLessonContextById(id, { includeDrafts })`, used for non-student modes after authorization |
| `assertRateLimit` with `maxAttempts: 1` allowed 2 attempts (pre-existing limiter bug: a new bucket never started its cooldown) | A new bucket starts its cooldown when the limit is 1. Behaviour for limits ≥ 2 is unchanged. |
| Runner hung: `spawnSync` blocked the in-process fake services | Asynchronous spawn for build and tests |

## 5. Not tested (honest gaps)

| Area | Why | How to cover |
|---|---|---|
| Real Supabase Storage (private bucket, signed URL expiry enforcement) | No live project credentials; a fake was used | Staging smoke test after the bucket is switched to private |
| Real LLM provider | Fake Ollama used by design | Existing manual tutor checks |
| Rate limits across multiple server instances | In-memory limiter is per process | Needs a shared store (remaining risk R-2) |
| Browser-level CSRF using a real cross-site form | Covered by the `Origin` check test and SameSite=Lax by design; not exercised with a real second origin | Manual pen-test |
| Onboarding, locale and compile endpoints | Reviewed, unchanged, no new tests | Add when they change |
