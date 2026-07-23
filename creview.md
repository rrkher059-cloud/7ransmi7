# Comprehensive Code Review — 7RANSMI7 (`Startup`)

**Date:** 2026-07-22  
**Remediation:** All Critical / High / Medium / Low findings and actionable Info items below were fixed in a follow-up pass the same day (public/private users, session secret boot checks, per-user `likedBy`, JSON file locks, data gitignore, rate limits, OTP hardening, password reset, blocks, CSRF Origin checks, pagination, a11y/copy, root scaffold removal). Verified with `npm test` (29) and `npm run build` in `app/`.  
**Scope:** Full repository with primary focus on `app/` (Vite + React client, Hono API, shared Zod schemas, JSON file stores). Root-level Next.js scaffolding and duplicate `src/` components were also reviewed.  
**Method:** Line-level review of server, shared, and client source; cross-check of `.gitignore`, tracked data files, env/config, tests, and deploy wiring. Original review was read-only; remediation applied afterward.

---

## Executive summary

This is a functional MVP of a short-lived social network (auth via email OTP + password, tweets with TTL, follows, DMs, notifications, AI assist/companion). Several foundations are solid: Zod validation on many write paths, `httpOnly` session cookies, HMAC session signing with `timingSafeEqual`, scrypt password/OTP hashing, and React text rendering without `dangerouslySetInnerHTML`.

**It is not production-safe as deployed.** The highest-severity issues are:

1. **User emails are returned as “public” profile fields** and are searchable/harvestable without authentication.
2. **Session forging** is trivial if `SESSION_SECRET` is unset (hardcoded fallback in source).
3. **Likes are a single global boolean** on each tweet, not per-user — multi-user like semantics are broken.
4. **JSON stores have no write locking** — concurrent requests lose updates and can bypass OTP attempt limits.
5. **Private DM / follow / notification data (and an orphaned `.tmp` write) are committed to git.**
6. **Auth and most mutating APIs have no rate limiting** (only AI endpoints do, and that limiter is spoofable via `X-Forwarded-For`).

Treat the items marked **Critical** and **High** as merge blockers before any real-user or public launch.

---

## Severity rubric

| Severity | Meaning |
|---|---|
| **Critical** | Exploitable or guaranteed data-integrity failure with severe impact (account takeover, mass PII leak, broken core multi-user semantics). |
| **High** | Serious security, privacy, or reliability defect; likely to cause real harm or silent data loss under normal load. |
| **Medium** | Meaningful defect or missing control; should be fixed soon; impact is situational or defense-in-depth. |
| **Low** | Limited impact, polish, consistency, or hardening gap. |
| **Info** | Product gap, architecture smell, or observation — not a defect by itself. |

Each finding includes: **ID**, **severity**, **category**, **location**, **problem**, **impact**, **fix**.

---

## Critical

### C1 — Email addresses exposed on public user objects (mass PII harvest)

- **Category:** Security / Privacy  
- **Location:** `app/shared/schemas.ts` (`publicUserSchema`, ~216–221); `app/server/users.ts` (`toPublic`, `searchUsers`); `app/server/app.ts` `GET /api/explore/search`, `GET /api/explore/suggestions`  
- **Problem:** `PublicUser` includes `email`. Explore search and suggestions do **not** require auth. `searchUsers` matches on email substrings and returns full public users including email. Guests can enumerate the user base.  
- **Impact:** Mass PII disclosure; phishing/credential-stuffing targeting; regulatory risk.  
- **Fix:** Split `PublicProfile` (id, handle, createdAt) from `PrivateAccount` (adds email, self-only). Never return email from explore/search/suggestions/followers/following. Stop matching search on email for other users. Require auth for user discovery if needed.

### C2 — Hardcoded session HMAC secret fallback enables session forgery

- **Category:** Security  
- **Location:** `app/server/session.ts` `sessionSecret()` (~9–16)  
- **Problem:** If `SESSION_SECRET` is missing or shorter than 16 characters, the server silently uses `'dev-only-transmit-session-secret'`, which is committed in source. No production boot-time hard failure.  
- **Impact:** Anyone who knows the fallback can forge a valid `transmit_session` cookie for **any `userId`** → full account takeover.  
- **Fix:** Fail fast at startup in production (and preferably always outside explicit `NODE_ENV=development|test`) when the secret is missing/weak. Never ship a known fallback into production paths.

### C3 — Likes are global shared state, not per-viewer

- **Category:** Correctness  
- **Location:** `app/server/store.ts` `likeTweet()` (~405–439); `annotateForViewer()` (~71–94)  
- **Problem:** Toggle uses a single persisted `tweet.liked` boolean and mutates the shared `likes` counter from that. `annotateForViewer` recomputes `reposted` per viewer but **never** recomputes `liked`. There is no `likedBy: userId[]` (or equivalent) store.  
- **Impact:** User A’s like is visible as “liked” to User B; User B’s click **unlikes for everyone**. Like counts and notifications become nonsensical in any multi-user scenario. This is a core product bug, not an edge case.  
- **Fix:** Persist a set/list of liker user IDs (or a separate likes collection). Derive `liked` and `likes` per viewer on read. Never persist viewer-specific flags as global tweet fields.

### C4 — JSON file stores: unprotected read–modify–write races

- **Category:** Reliability / Correctness / Security  
- **Location:** Pattern across `app/server/store.ts`, `users.ts`, `otps.ts`, `follows.ts`, `messages.ts`, `notifications.ts`; `app/server/jsonStore.ts` only atomicizes the final write  
- **Problem:** Every mutation is read → mutate in memory → overwrite file. Concurrent requests clobber each other. `atomicWriteJson` prevents torn writes but provides **no transaction/locking**.  
- **Impact:** Lost likes/comments/reactions/DMs; duplicate accounts on concurrent signup; **OTP attempt counters can be raced** so attackers try far more than `OTP_MAX_ATTEMPTS` within the TTL; duplicate follow edges.  
- **Fix:** Per-file async mutex / write queue, or migrate to a real DB with transactions. Do not treat “atomic rename” as concurrency control.

### C5 — Private runtime data committed to version control

- **Category:** Security / Privacy  
- **Location:** Tracked: `app/data/follows.json`, `app/data/messages.json`, `app/data/notifications.json`, `app/data/tweets.json.*.tmp`; `.gitignore` only ignores `tweets.json` / `users.json` / `otps.json`  
- **Problem:** Real DM content, follow graph, notifications, and an orphaned write temp file are in git history. Root `.gitignore` is essentially only `node_modules`.  
- **Impact:** Private user social graph and message content leak via repo (especially if public). Temp artifact indicates incomplete write hygiene.  
- **Fix:** Ignore all of `app/data/*` except `.gitkeep`. Remove tracked data files from the index (`git rm --cached`). Rotate any sensitive identifiers if the repo was ever public. Add startup cleanup for `*.tmp`.

---

## High

### H1 — No rate limiting on login / signup / request-code

- **Category:** Security  
- **Location:** `app/server/app.ts` auth routes; `checkRateLimit` only used via `enforceAiRateLimit`  
- **Problem:** Unlimited password attempts, unlimited OTP emails, unlimited signup attempts.  
- **Impact:** Credential stuffing, mailbox bombing, amplification of OTP races (C4).  
- **Fix:** Rate-limit by IP **and** by email/account; cooldown on `request-code`; temporary lockout after N failed logins.

### H2 — AI rate limit key trusts client `X-Forwarded-For`

- **Category:** Security  
- **Location:** `app/server/app.ts` `clientKey()` (~109–113)  
- **Problem:** First `X-Forwarded-For` hop is trusted without verifying a reverse proxy.  
- **Impact:** Trivial bypass: new spoofed IP per request → unlimited AI calls (cost / abuse).  
- **Fix:** Key on socket peer unless behind a trusted proxy that overwrites the header; configure trust explicitly.

### H3 — `AUTH_TEST_OTP` backdoor has no environment gate

- **Category:** Security  
- **Location:** `app/server/crypto.ts` `generateOtpCode()` (~26–30)  
- **Problem:** If `AUTH_TEST_OTP` is set to digits, **every** OTP becomes that fixed value — including in production.  
- **Impact:** Complete bypass of email verification if the env var leaks into prod/CI deploy config.  
- **Fix:** Honor only when `NODE_ENV === 'test'` (or an explicit `ALLOW_TEST_OTP=1` that refuses to start in production). Fail boot if set in production.

### H4 — OTP codes always logged to stdout

- **Category:** Security  
- **Location:** `app/server/mailer.ts` `logVerificationCode()` (~3–13)  
- **Problem:** Codes are printed on every request, even when Resend succeeds.  
- **Impact:** Anyone with log access (Render logs, shared terminals, log aggregators) can hijack signup.  
- **Fix:** Log codes only when `RESEND_API_KEY` is unset **and** not in production; never log plaintext OTPs in production.

### H5 — Global notification cap silently drops other users’ notifications

- **Category:** Correctness  
- **Location:** `app/server/notifications.ts` `pushNotification()` (~79) — `.slice(0, 200)` on the **entire** store  
- **Problem:** Cap is platform-wide, not per recipient.  
- **Impact:** Active users permanently erase quieter users’ notifications with no error.  
- **Fix:** Cap per `recipientId` (e.g. keep last N per user) or use age-based pruning.

### H6 — Explore Follow UI starts with empty follow state (toggle can unfollow)

- **Category:** Correctness / UX  
- **Location:** `app/src/components/ExploreView.tsx` (`following` Set initialized empty; suggestions lack `isFollowing`)  
- **Problem:** Already-followed users show “Follow”; first click calls `toggleFollow` and **unfollows**.  
- **Impact:** Accidental unfollow; confusing social graph UX.  
- **Fix:** Load follow state from API (`getFollowStats` / include `isFollowing` on suggestion payloads) before rendering buttons.

### H7 — Profile media & bio are not real shared profile data

- **Category:** Correctness / Product integrity  
- **Location:** `app/src/lib/profileMedia.ts` (localStorage only); `app/src/components/ProfileView.tsx` bio `useState` with hardcoded placeholder (~53–56), not reset/scoped correctly as server data  
- **Problem:** Avatars/banners never leave the browser. Bio is local component state with a shared placeholder — not persisted, not per-user on the server.  
- **Impact:** Other devices/users never see avatars/banners; bio editing is misleading.  
- **Fix:** Server-side profile fields + upload (or clearly label device-only preferences). Persist bio per user; reset state when `user.id` changes.

### H8 — Moderation fails open on AI errors / missing config

- **Category:** Security / Trust & Safety  
- **Location:** `app/server/ai.ts` `moderateContent()` (~273–325)  
- **Problem:** Without AI or on LLM failure/parse failure, content is largely allowed after a thin keyword gate.  
- **Impact:** Abuse/spam can pass when the AI path is down or unconfigured (common in MVP deploys).  
- **Fix:** Document as intentional; consider fail-closed for high-risk categories, stricter local heuristics, or queue for review when AI is unavailable.

### H9 — No rate limits on tweets / likes / comments / reposts / reacts / follows / DMs

- **Category:** Security / Reliability  
- **Location:** Mutating routes in `app/server/app.ts`  
- **Problem:** Only AI is throttled. Posts may include ~750KB data-URL images (`TWEET_IMAGE_MAX_CHARS`).  
- **Impact:** Storage exhaustion, notification floods, harassment, worse store races (C4).  
- **Fix:** Per-user and per-IP quotas on all writes; separate image size/count budgets.

---

## Medium

### M1 — Timing-based login email enumeration

- **Category:** Security  
- **Location:** `app/server/users.ts` `authenticateUser()` (~93–100)  
- **Problem:** Missing users return immediately; existing users pay full scrypt cost.  
- **Fix:** Always run a dummy `verifySecret` against a static hash on the miss path.

### M2 — `EMAIL_TAKEN` on `request-code` enumerates registered emails

- **Category:** Security  
- **Location:** `app/server/app.ts` (~164–169)  
- **Fix:** Return generic success either way; email “already registered” privately.

### M3 — Cookie `Secure` / `SameSite=None` tied to `NODE_ENV` or `RENDER`

- **Category:** Security  
- **Location:** `app/server/session.ts` (~50–59)  
- **Problem:** Mis-set env can ship insecure cookies or wrong SameSite. Logout `deleteCookie` only passes `{ path: '/' }` and may fail to clear cross-site cookies that were set with `Secure`/`SameSite=None`.  
- **Fix:** Prefer explicit `COOKIE_SECURE` / `CROSS_SITE_COOKIES` flags; clear cookies with matching attributes.

### M4 — No security headers on the API

- **Category:** Security  
- **Location:** `app/server/app.ts` middleware  
- **Fix:** Add `X-Content-Type-Options`, `Referrer-Policy`, minimal CSP for JSON API, etc.

### M5 — `imageUrl` accepts any `data:image/*` including SVG

- **Category:** Security  
- **Location:** `app/shared/schemas.ts` `createTweetSchema` (~86–95)  
- **Problem:** `data:image/svg+xml` is allowed. Today the client uses React/`<img>` without HTML injection, but this expands future XSS surface.  
- **Fix:** Allowlist `png|jpeg|jpg|gif|webp` only; reject SVG.

### M6 — Indirect prompt injection into AI companion

- **Category:** Security  
- **Location:** `app/server/ai.ts` `companionReply` (feed bodies interpolated into prompts); wired from `app/server/app.ts` `/api/ai/companion`  
- **Impact:** Malicious posts can steer the companion for other users.  
- **Fix:** Delimit untrusted content; instruct model to treat feed as data only; sanitize instruction-like patterns.

### M7 — Upstream AI errors returned to clients

- **Category:** Security / Maintainability  
- **Location:** `app/server/app.ts` statusError branches; `app/server/ai.ts` `chatCompletion`  
- **Fix:** Log upstream detail server-side; return generic client messages.

### M8 — `pruneRateLimitBuckets` is never called

- **Category:** Reliability / Performance  
- **Location:** `app/server/rateLimit.ts` (~44–50); no callers; contrast with `purgeExpired` interval in `index.ts`  
- **Impact:** Unbounded Map growth (worse with spoofed IPs — H2).  
- **Fix:** Call from the existing `setInterval` in `index.ts`.

### M9 — Tweet delete does not cascade / adjust `repostCount`

- **Category:** Correctness  
- **Location:** `app/server/store.ts` `deleteTweet()` (~442–458)  
- **Impact:** Orphaned reposts; inflated `repostCount`; stale notification `tweetId`s.  
- **Fix:** On delete: decrement original when deleting a repost; cascade or nullify dependents when deleting an original.

### M10 — No request body size limit before JSON parse

- **Category:** Reliability / Security  
- **Location:** Handlers using `c.req.json()` in `app.ts`  
- **Fix:** Hono body-limit middleware ahead of routes.

### M11 — Temp file naming collision + orphaned `.tmp` files

- **Category:** Reliability  
- **Location:** `app/server/jsonStore.ts` (~29); observed tracked file `tweets.json.*.tmp`  
- **Fix:** Include `randomUUID()` in temp names; sweep stale `*.tmp` on boot.

### M12 — Corrupt store file hard-fails the feature area

- **Category:** Reliability  
- **Location:** All `readStore()` implementations throw on schema failure  
- **Fix:** Keep `.bak` backups; quarantine bad records; degrade gracefully.

### M13 — Desktop primary nav not keyboard accessible

- **Category:** Accessibility  
- **Location:** `app/src/components/LineSidebar.tsx` (~211–233) — `<li onClick>` without button semantics/keyboard handlers; mobile uses real buttons in `MainLayout`  
- **Fix:** Use `<button>` or add `role="button"`, `tabIndex={0}`, Enter/Space handlers.

### M14 — Modals lack Escape / focus trap

- **Category:** Accessibility  
- **Location:** `AuthModal.tsx`; followers/following dialog in `ProfileView.tsx`  
- **Fix:** Escape-to-close, initial focus, focus trap, restore focus on close.

### M15 — Profile “Likes” tab is actually emoji reactions

- **Category:** Correctness / UX  
- **Location:** `app/src/lib/profileFilters.ts` `likes` case (~39–42)  
- **Problem:** Filters by `reactions`, not heart-likes (and heart-likes aren’t per-user anyway — C3).  
- **Fix:** After fixing likes storage, filter by liker set; rename tab until then.

### M16 — Stale / broken user-facing copy

- **Category:** UX  
- **Location:**  
  - `TweetFeed.tsx` (~42): “auto-purge at **60 minutes**” but `TWEET_TTL_MS` is **24 hours**  
  - `App.tsx` (~83): `'Downlink failed. Is the API online on ?'` (dangling “on ?”)  
- **Fix:** Align copy with constants; restore or remove the host fragment.

### M17 — Online indicator only reflects Home feed poll

- **Category:** Correctness / UX  
- **Location:** `app/src/App.tsx` `online` updated from feed refresh  
- **Impact:** Header can say Online while Messages/Explore/AI are failing.  
- **Fix:** Aggregate health from `/api/health` or per-feature status.

### M18 — Duplicate / dead root project scaffold

- **Category:** Maintainability  
- **Location:** Repo root `package.json` (Next.js), `next.config.js` (no pages), `src/components/*` (old duplicates of app components)  
- **Impact:** High risk of editing the wrong tree; confusing deps (`typescript` ^7 at root vs ~6 in `app`).  
- **Fix:** Delete or clearly quarantine the unused root app; make `app/` the only product root.

### M19 — Followers/following APIs return emails (authenticated)

- **Category:** Privacy  
- **Location:** `listFollowers` / `listFollowing` → `getPublicUser` → includes email  
- **Fix:** Same as C1 — public profile shape without email.

### M20 — Messages `:peerId` not schema-validated as UUID

- **Category:** Input validation  
- **Location:** `app/server/app.ts` `GET /api/messages/:peerId`  
- **Fix:** Parse with `z.string().uuid()` before `getThread`.

---

## Low

### L1 — Free-text explore/user `q` query params lack length bounds

- **Location:** `app/server/app.ts` explore search / users search  
- **Fix:** Zod max length (e.g. 200), consistent with `aiSearchSchema`.

### L2 — CSRF relies solely on cookie SameSite

- **Location:** Session cookies; no CSRF token  
- **Note:** With `SameSite=Lax` (dev) this is mostly fine; production uses `SameSite=None` for GH Pages ↔ Render, which **increases** CSRF reliance on Origin checks. CORS allowlist helps for browser XHR but is not a full CSRF substitute for all clients.  
- **Fix:** Consider double-submit CSRF tokens for state-changing routes when using cross-site cookies.

### L3 — Password policy is length-only (min 8)

- **Location:** `app/shared/schemas.ts` / `PASSWORD_MIN_LENGTH`  
- **Fix:** Blocklist common passwords; optionally HIBP k-anonymity check.

### L4 — OTP generation uses modulo bias

- **Location:** `app/server/crypto.ts` `generateOtpCode` — `readUInt32BE % 10^n`  
- **Impact:** Slight non-uniformity (low practical risk for 6-digit OTP with attempt limits — if limits work).  
- **Fix:** Rejection sampling / `randomInt`.

### L5 — CSRF/CORS allowlist is hardcoded

- **Location:** `app/server/app.ts` cors origins  
- **Note:** Production GH Pages origin is present (good). Still prefer `ALLOWED_ORIGINS` env for flexibility without code changes.

### L6 — Hardcoded OpenRouter `HTTP-Referer: http://localhost:5173`

- **Location:** `app/server/ai.ts`  
- **Fix:** `PUBLIC_APP_URL` env.

### L7 — No pagination on feeds / notifications / conversations

- **Location:** Various list endpoints (hard caps / full reads)  
- **Fix:** Cursor-based pagination before scale.

### L8 — `DotField` ignores `prefers-reduced-motion`

- **Location:** `app/src/components/effects/DotField.tsx` (unlike `OrbitDiagram`)  
- **Fix:** Pause animation when reduced motion is requested.

### L9 — Unthrottled `pointermove` glow handlers on many controls

- **Location:** `BorderGlow` used heavily in `TweetCard` / buttons  
- **Impact:** Scroll/hover jank on long feeds.  
- **Fix:** rAF-coalesce updates; fewer live listeners.

### L10 — Message validation reuses tweet schema copy

- **Location:** Client DM validation via `createTweetSchema` messaging  
- **Impact:** Error text says “Tweet must be at most…” for DMs.  
- **Fix:** Dedicated message schema/messages.

### L11 — Dead code

- **Items:**  
  - `AuthGate.tsx` (`@deprecated`, returns null, unused)  
  - `layout/AppShell.tsx` unused (`MainLayout` reimplements shell)  
  - `notifyProfileMediaChanged` export unused  
  - `aiStatus()` in `api.ts` unused (no proactive AI-unavailable UI)  
  - `pruneRateLimitBuckets` unused (see M8)  
- **Fix:** Delete or wire up.

### L12 — Message API responses skip defensive `normalize*` parsing

- **Location:** `app/src/lib/api.ts` DM helpers vs tweet/user normalize path  
- **Fix:** Apply the same normalize pattern.

### L13 — Feed product behavior is easy to misread as a bug

- **Location:** `getFeedForUser` — own posts + **5 random** others  
- **Note:** Documented in UI, but surprising vs chronological social feeds; combined with M16 TTL copy, users may distrust the product.  
- **Fix:** Clarify product intent in UI/docs; consider chronological following feed.

### L14 — Vite `/api` proxy unused by client in practice

- **Location:** `vite.config.ts` proxy vs `config.ts` always absolute `API_BASE_URL`  
- **Impact:** Low — works via CORS; proxy is redundant/confusing.  
- **Fix:** Either use relative `/api` in dev **or** remove the proxy and document CORS-only.

---

## Info / product gaps

| ID | Note |
|---|---|
| I1 | No password-reset / account-recovery flow (OTP infra could support it). |
| I2 | No block / mute / report APIs — harassment surface with open DMs. |
| I3 | No email verification on login for existing sessions beyond cookie. |
| I4 | README is still the Vite template; no real architecture/ops docs. |
| I5 | Magic nil UUID viewer id in `listTweetsByUser` path (`00000000-…`) — fragile convention. |
| I6 | Positive: no `dangerouslySetInnerHTML` / `eval` in `app/src`; cookies are `httpOnly`; secrets stay server-side per `.env.example`. |
| I7 | Positive: Zod on most write bodies; session verify uses `timingSafeEqual`; passwords/OTPs use scrypt. |
| I8 | Positive: delete tweet checks ownership (`403`); DMs filter by participant; AI assist/companion require auth. |

---

## Test & quality gaps

Existing tests (`app/server/auth.test.ts`, `api.test.ts`, `shared/schemas.test.ts`, `src/lib/profileFilters.test.ts`) cover basic auth happy/error paths and some schema/filter cases. Gaps that leave Critical/High bugs uncaught:

1. **No multi-user like tests** — would immediately fail C3.  
2. **No concurrency tests** on stores/OTP — would expose C4.  
3. **No assert that public explore payloads omit email** — would expose C1.  
4. **No production boot test** refusing missing `SESSION_SECRET` / `AUTH_TEST_OTP`.  
5. **No rate-limit tests** for auth.  
6. **No frontend component tests** (a11y, Explore follow state, bio scoping).  
7. **`fileParallelism: false`** in vitest is a smell that tests share process env / filesystems — consistent with mutable global `process.env` in auth tests; fragile.  
8. **Auth tests set `AUTH_TEST_OTP`** — reinforces the backdoor pattern (H3); ensure it cannot activate outside test.

---

## Architecture & deployment notes

```
Repo root (Next leftover + duplicate components)  ← unused / confusing
└── app/                                         ← real product
    ├── src/          React + Vite (GH Pages base `/7ransmi7/`)
    ├── server/       Hono API (Render-oriented)
    ├── shared/       Zod + constants
    └── data/         JSON file “database” (unsafe for multi-writer prod)
```

- **Persistence model** (JSON files on disk) cannot safely support concurrent multi-user writes (C4). Fine for a solo demo; wrong for production social.  
- **Cross-origin auth** (GitHub Pages → Render) forces `SameSite=None; Secure` — correct direction, but raises CSRF/CORS discipline requirements (L2).  
- **Images as data URLs in JSON** blow up store size quickly (750KB/post ceiling).  
- **Dual TypeScript / dual React trees** at repo root vs `app/` invite configuration drift.

---

## Prioritized remediation roadmap

### P0 — before any public users
1. Strip email from public profiles; gate/fix explore search (C1, M19).  
2. Require strong `SESSION_SECRET` at boot; remove silent fallback (C2).  
3. Fix likes to be per-user (C3).  
4. Gate `AUTH_TEST_OTP`; stop logging OTPs in production (H3, H4).  
5. Untrack and ignore all `app/data/*` runtime files (C5).  
6. Rate-limit auth endpoints; stop trusting raw `X-Forwarded-For` (H1, H2).

### P1 — before calling it multi-user reliable
7. Serialize JSON store writes or migrate to SQLite/Postgres (C4).  
8. Per-recipient notification caps; delete cascades (H5, M9).  
9. Fix Explore follow state; profile media/bio persistence story (H6, H7).  
10. Body size limits; prune rate-limit buckets; temp-file cleanup (M8, M10, M11).

### P2 — hardening & polish
11. Accessibility (M13, M14), copy fixes (M16), dead code removal (L11, M18).  
12. Image MIME allowlist, prompt-injection hardening, security headers (M4–M6).  
13. Expand automated tests for C1/C3/C4/H1.  
14. Real README + single package root.

---

## Finding index (quick reference)

| ID | Severity | One-line |
|---|---|---|
| C1 | Critical | Public email harvest via explore/search |
| C2 | Critical | Forgable sessions via hardcoded HMAC secret |
| C3 | Critical | Likes are global, not per-user |
| C4 | Critical | Lost updates / OTP race on JSON stores |
| C5 | Critical | DMs/follows/notifications (+ `.tmp`) in git |
| H1 | High | No auth rate limits |
| H2 | High | Spoofable AI rate-limit key |
| H3 | High | `AUTH_TEST_OTP` works in any env |
| H4 | High | OTPs always logged |
| H5 | High | Global notification eviction |
| H6 | High | Explore Follow toggles wrong state |
| H7 | High | Avatar/bio not real shared profile data |
| H8 | High | Moderation fails open |
| H9 | High | No write rate limits outside AI |
| M1–M20 | Medium | Enumeration, cookies, headers, SVG, AI leakage, a11y, copy, dead scaffold, etc. |
| L1–L14 | Low | Validation polish, CSRF depth, a11y/perf, dead code, feed semantics |
| I1–I8 | Info | Product gaps and positive controls |

---

*End of review. This document is advisory only; no code was changed to produce it.*
