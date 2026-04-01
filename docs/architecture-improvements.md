# Architecture Improvements

## 27.03.2026

### Security Hardening
- Public course access was tightened so public detail pages and learning APIs only operate on published courses.
- Authentication now validates account status before session creation, and visible signed-in UI now depends on database-validated users.
- Lightweight in-memory rate limiting was introduced for sign-in and password-reset flows with IP and user dimensions plus cooldown support.
- Homepage learner momentum was decoupled from live learner records to avoid exposing private names and progress publicly.
- Upload signing now requires server-side file metadata validation before issuing a storage upload URL.

### Reliability
- A shared error helper now maps Prisma and infrastructure failures into stable redirect codes and API responses.
- Critical auth and learning flows now use retry-aware database access for transient connectivity failures.
- Public APIs now return a more consistent success/error payload shape without changing the existing client contract.

### Performance
- Enrollment progress was split into read-only summary calculation and write-time persistence.
- My Learning no longer performs per-enrollment progress writes on every page render.
- Homepage metrics now query total instructor count directly instead of deriving it from a limited featured result set.

### UX / Product
- Admin delete actions now require an explicit confirmation dialog.
- Cross-page anchor navigation now resolves through homepage routes instead of broken local fragments.
- Public/auth/admin flows surface cleaner feedback for rate limits, inactive accounts, duplicates, and validation issues.

### Follow-Up Candidates
- Persist rate limiting in Redis or the primary datastore for multi-instance deployments.
- Migrate from `next lint` to the standalone ESLint CLI before upgrading to Next.js 16.
- Add automated integration tests for auth, enrollment, uploads, and admin CRUD.
