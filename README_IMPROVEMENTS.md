# Project Improvement Log

## Format:
DATE (DD.MM.YYYY)

### Improvements
- item 1
- item 2

### Fixes
- item 1
- item 2

### Security
- item 1
- item 2

### Performance
- item 1
- item 2

### UX/UI
- item 1
- item 2

### Notes
- optional explanation

## 27.03.2026

### Improvements
- Added a shared application error layer for consistent API and server-action error responses.
- Added non-interactive project ESLint configuration so validation can run locally and in CI without prompts.
- Added an architecture summary document to track the major structural hardening decisions.

### Fixes
- Fixed public course access so unpublished courses are no longer returned by public detail and course interaction flows.
- Fixed homepage navigation links so FAQ and learning-path links now route correctly from any page.
- Fixed the homepage instructor count so it uses the real total instead of a limited featured subset.
- Fixed duplicate-record handling for sign-up and key admin actions so users receive clean feedback instead of crashes.
- Fixed My Learning to stop recalculating and writing enrollment progress on every page load.
- Fixed admin delete flows to require explicit confirmation before destructive actions run.

### Security
- Blocked suspended and inactive accounts from creating authenticated sessions.
- Stopped trusting cookie-only session payloads for navbar signed-in state by always validating against the database.
- Added request throttling for sign-in and password reset flows using IP-based and user-based keys plus cooldown windows.
- Removed live learner identity exposure from the homepage by switching learner momentum to privacy-safe anonymized snapshots.
- Added server-side upload validation for file size and file type before signed upload URLs are issued.

### Performance
- Reworked course progress reads to use read-only summaries and only persist progress during lesson completion updates.
- Reduced unnecessary homepage query work by removing live learner momentum reads from production homepage rendering.
- Kept build validation green after the refactor and cleaned lint warnings to preserve fast feedback loops.

### UX/UI
- Added clearer auth and account-state feedback for inactive accounts, rate limits, and temporary service issues.
- Added destructive-action confirmation dialogs in admin tables.
- Improved admin feedback for duplicate email, duplicate phone, validation, and invalid reference errors.

### Notes
- Validation completed with `npm run build` and `npm run lint`.
- `next lint` still reports its Next.js 16 deprecation notice, but the project now lints cleanly in the current setup.
