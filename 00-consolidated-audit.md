# Independent Security & Code Audit: Flashcards App (grok-workspace)

**Archive:** `be44ff31-grok-workspace.zip` (299 files, ~460 KB source, ~13k lines in src/server/scripts/migrations)
**Method:** Four independent static, read-only reviews by separate agents, each owning one domain. Two agents were stopped by a rate limit; the frontend review was saved to disk and the build review was re-run. Findings from all four were cross-checked against the code. The hardcoded secret, the nested archive and the unscanned `.npmrc` were verified directly.
**Not done:** no `npm install`, no `npm audit`, no `tsc`/`eslint`/tests run (no `node_modules`, no network). Better Auth internals, broker behaviour and the production environment were not inspectable. Items marked PLAUSIBLE need runtime confirmation.

## 1. Overall verdict

The app has a sound core. Server functions derive the user id from the verified session, every SQL query is parameterised and scoped by that id, there is no `innerHTML`, and the auth cookies use `__Host-`, `Secure` and `SameSite=Lax`. The main risks are:

1. A **live OAuth client secret committed to source** and used as a fallback.
2. **The offline library is not owned by any account**, so data leaks between accounts on a shared browser.
3. **Production fail-open behaviour**: silent in-memory database, random auth secret, localhost origins trusted, and `npm run build` migrating whatever database `DATABASE_URL` points at.
4. **No CSP and no framing controls**, plus a sibling-preview trust model that weakens CSRF and origin checks.
5. **Data integrity**: whole-library last-write-wins sync, an unbounded payload, DST bugs in streaks, and unbounded numbers.

## 2. Severity counts (deduplicated across reports)

| Source report | Critical | High | Medium | Low | Info | Total |
|---|---|---|---|---|---|---|
| 01 Auth, sessions, identity | 0 | 2 | 3 | 10 | 3 | 18 |
| 02 Data, authz, SQL, migrations | 0 | 1 | 3 | 7 | 4 | 15 |
| 03 Frontend, headers, PWA, P2P | 0 | 1 | 8 | 17 | 6 | 32 |
| 04 Build, supply chain, scripts, tests | 0 | 2 | 11 | 14 | 5 | 32 |

Several findings appear in more than one report. Counting each root cause once gives roughly **4 High, 14 Medium, about 40 Low and 15 Info** issues.

## 3. Top issues (root causes, deduplicated)

### H1. Hardcoded OAuth client secret (High, CONFIRMED)
- `src/lib/auth/preview.ts:20-21` contains `PREVIEW_CLIENT_SECRET` as a literal value.
- `src/lib/auth/server.ts:81-82` uses it as a fallback whenever `GROK_AUTH_CLIENT_SECRET` is not injected, which includes deployed apps.
- It is also baked into the committed server bundle at `.vercel/output/functions/__server.func/_ssr/*.mjs`.
- The broker accepts wildcard callbacks on `*.grok-sandbox.com` (`preview.ts:26-32`). Anyone with the source can act as the `grok_preview` client. Whether that is exploitable depends on broker-side PKCE and redirect enforcement, which could not be checked.
- **Fix:** rotate the secret now. Load it only from env and throw in production when it is missing. Make the preview client PKCE-only and restrict its redirect URIs to exact per-host values. Delete `.vercel/output` from the repo (see M10).

### H2. The offline library is not user-scoped (High, CONFIRMED; reports 01-AUTH-01, 02-F-01, 03-FE-01)
- `src/lib/library-store.ts:17` uses one fixed localStorage key (`flashcards-offline-data-v3`) with no owner id.
- `signOut` in `src/lib/auth/client.ts:221` does not clear it. It is removed only in `startFresh` (`library-store.ts:362`).
- **Scenario:** A signs in, syncs and signs out. B signs in on the same browser. The bootstrap at `library-store.ts:144-148` pushes A's library into B's account, or overwrites B's remote data when A has unsynced edits.
- **Fix:** key the envelope by user id (`...:<userId>`). Clear it on sign-out and whenever the user id changes. Refuse to push an envelope whose owner does not match. Scope the reminder keys in `shell.tsx:211-236` the same way.

### H3. Production fail-open defaults (Medium-High; reports 01-AUTH-08/09, 02-F-03, 04-BSC-02/05)
- **Silent in-memory DB:** `src/lib/db.ts:8-19` selects PGlite whenever `DATABASE_URL` is empty. A deployed app then reports `ok: true` and loses data on instance recycle. `scripts/migrate.mjs:21-27` skips silently too.
- **Random auth secret:** `src/lib/auth/server.ts:62-65, 179` falls back to a per-process random `BETTER_AUTH_SECRET`. Multi-instance deployments then break cookies silently.
- **Localhost origins:** `src/lib/auth/server.ts:118-119` trusts localhost origins whenever `BETTER_AUTH_URL` is set, including in production.
- **Build migrates production:** `package.json:11` runs `db:migrate` as part of `build`. Preview builds that share a `DATABASE_URL` will migrate production (PLAUSIBLE, depends on how the env is configured).
- **Fix:** throw at startup when `NODE_ENV`/`VERCEL_ENV` is production and any of `DATABASE_URL`, `BETTER_AUTH_SECRET` or the auth URL is missing. Restrict localhost origins to non-production. Run migrations as a separate, explicitly gated deploy step.

### H4. Sibling-preview trust weakens CSRF and origin checks (Medium; reports 01-AUTH-04, 03-FE-05, 04-BSC-05)
- `src/routes/api/auth/$.ts` forwards every GET and POST to Better Auth with no `assertSameSiteRequest`. The guard only wraps server functions (`src/lib/auth/middleware.ts:41-44`).
- In preview, `trustedOrigins` includes `*.grok-sandbox.com` over both protocols (`server.ts:118-126`). A sibling preview can therefore make same-site POSTs that carry the victim's `SameSite=Lax` cookie. Which endpoints are exposed determines the impact (PLAUSIBLE).
- With `BETTER_AUTH_URL` unset, the base URL is derived from the Host header (`server.ts:94,106-124`).
- **Fix:** reject `Sec-Fetch-Site: same-site|cross-site` on `/api/auth` POSTs. Remove wildcard trust for sign-in and link endpoints. Require `BETTER_AUTH_URL` in every environment.

### H5. Missing CSP and framing controls (Medium; reports 03-FE-03/04/17, 03-FE-16)
- No `Content-Security-Policy`, `frame-ancestors`, HSTS, `X-Content-Type-Options`, `Referrer-Policy` or `Permissions-Policy` in `vercel.json`, `.vercel/output/config.json` or `server/middleware/grok-pwa.ts`.
- Any origin can frame the app (clickjacking), and a third-party script (`grok.com/.../extensions.js`) loads into every document with no SRI (`scripts/grok-pwa-shared.mjs:203,243-246`).
- **Fix:** add a Report-Only CSP first, with nonces or hashes for the install and popup scripts. Use `frame-ancestors 'self' https://grok.com https://*.grok.com https://*.grok-sandbox.com`. Do not use `X-Frame-Options`, which would break the preview. Full header table in report 03.

### H6. Gate identity and linking (Medium; reports 01-AUTH-03/05/12)
- `src/lib/auth/gate-identity.server.ts:197-204` sets `emailVerified: Boolean(identity.email)` with no `email_verified` claim check.
- `server.ts:197-203` treats the gate as a trusted linking provider, so an unverified gate email can link to an existing account (PLAUSIBLE, depends on Better Auth).
- JWKS is refetched on every unknown `kid` with no negative cache and no timeout (`gate-identity.server.ts:38-50, 67-88`). A flood of tokens with random kids causes one outbound fetch per request.
- The gate token is valid for 10 minutes with no `jti`/nonce (`gate-identity.server.ts:98-121`). Shorten it to about 60 seconds.
- **Fix:** link only on a verified email claim, otherwise key by `sub`. Add JWKS negative caching, a per-interval refetch limit and a 2-second fetch timeout.

### H7. Sync model and payload (Medium; reports 02-F-02/F-04/F-05)
- `saveLibrary` (`src/lib/cards.functions.ts:50-55`) is an unconditional whole-document upsert with no version check. A stale offline device overwrites newer server state. The returned `updatedAt` is a client clock (`cards.functions.ts:56`).
- There is no total size cap. Vercel's documented 4.5 MB function body limit (PLAUSIBLE) and the browser's roughly 5 MB localStorage limit would both cause the device to stay dirty forever. A `QuotaExceededError` in `library-store.ts:400-402` rejects the action, and `study.tsx:52` then drops the rating silently (FE-11).
- **Fix:** add a `version` column with compare-and-set. Normalise cards, decks and reviews into rows with per-row upserts. Cap review history server-side. Cap body size before parsing.

### H8. Data correctness (Low-Medium)
- **DST:** `src/lib/flashcards.ts:436, 453-460, 472-477` steps days in fixed 24-hour increments. In America/New_York, a spring-forward gap gives `current` = 2 where the true value is 1, and `longest` = 2 where it is 3 (02-F-06, traced by hand).
- **Unbounded numbers:** `flashcards.ts:212, 227-233` accept `Infinity` (for example `"1e400"`). `JSON.stringify` writes it as `null`, which reads back as 0, silently resetting the schedule.
- **Dead merge branch:** `flashcards.ts:529-534`. Colliding ids are reported as "duplicates" instead of being renamed (02-F-10, FE-20).
- **HTML entities:** Anki import entity decoding is a no-op (`flashcards.ts:558-563`, FE-19).
- **Weak image check:** `flashcards.ts:153-160` checks only the data-URI prefix. It does not decode or check magic bytes (02-F-07). This is not XSS, because React escapes text and `img src`.

### H9. Test suite does not prove what it claims (Medium; report 04-BSC-06 and others)
- Static analysis indicates three tests fail against the committed fixtures: `scripts/with-app-env.test.mjs:62-63`, `scripts/check-auth-invariant.test.mjs:94` and `scripts/migration-plan.test.mjs:59-63`. This must be confirmed by running `npm test`.
- `scripts/check-auth-invariant.mjs:28-61` claims to check the auth predicate but only compares dev and build flags. Client (`client.ts:38`) and server (`server.ts:75`) parse the flag differently. `" false"` leaves auth on server and shows sign-in on client. That case fails closed, but it is inconsistent. The docs (`prewired-and-env.md:13`) say the shipped `.grok/app-env.json` sets `VITE_AUTH_ENABLED=false`, while the file contains only `deploy.database`.
- No tests cover `flashcards.ts` data logic, `cards.functions.ts` authz, isolation, popup, middleware or the JWKS miss path (02-F-15, 01-AUTH-15).
- **Fix:** one shared `authEnabledFromEnv()` used by client, server and the script, with tests. Add authz tests for every server function.

### H10. Build output, dependencies and repo hygiene (Medium; reports 04-BSC-09, 03-FE-22)
- `.vercel/output`, `.tanstack/tmp` and `public/__grok` are committed, with no root `.gitignore`. The bundles carry the secret from H1 and expose internal names (`BETTER_AUTH_SECRET` and `AUTH_SECRET` appear in a client chunk, names only, FE-27).
- About 17 declared runtime dependencies have no importers (`package.json:23-79`, FE-22).
- Broad `^` ranges on security-critical packages (`better-auth ~`, `jose`, `pg`), a beta pin on `nitro` (`3.0.260610-beta`), and an `overrides` entry for `nf3`.
- **Fix:** add a `.gitignore` for build output and remove the committed build directories. Prune unused dependencies. Pin security-critical versions and commit a lockfile check in CI.
- **Note:** `attachments/flashcards-offline.zip` is an unrelated, older Expo/Manus-template project with its own `server/_core/oauth.ts`, which sets a session cookie from a Bearer token (lines 160-186). I found no credentials in it, but it should not sit inside this repo. Either remove it or audit it separately.

## 4. Other findings (by report)

### Auth (report 01)
- AUTH-03 JWKS miss path (see H6). AUTH-06 connector failure memo keyed on unverified JWT `sub` (`client.server.ts:258-284, 334-349`), so a crafted token can poison a victim's memo for 5 seconds. Key on `sha256(token)`.
- AUTH-07 Fetch-Metadata guard fails open when the header is missing and on unexpected errors (`isolation.server.ts:38-51`, `client.server.ts:246-256`).
- AUTH-11 login redirect to `loginUrl` has no origin check. Use `noopener` on `window.open` (`login.ts:19-33`).
- AUTH-13 / FE-15 full session bearer token in `sessionStorage` on preview, readable by any script on the origin (`client.ts:48-68`). Hold it in memory.
- AUTH-14 `getConnectorReadiness` is an unauthenticated POST with no same-site guard (`readiness.ts:5-10`).
- AUTH-16 to 18 (Info): email/password is off; enabling it needs verification, password policy and rate limits. The workspace-preview gate trusts a loopback issuer. The gate issuer is chosen from Host and X-Forwarded-Host (`gate-identity.server.ts:139-155`); this is safe only if the proxy strips client-supplied forwarding headers.

### Data (report 02)
- F-05 local write failure surfaces as a silent unhandled rejection (see H7).
- F-08 unbounded schedule numbers (see H8).
- F-09 `flashcard_libraries` and `flashcard_reminders` lack `references "user"(id) on delete cascade`, and `remind_time` has no CHECK constraint (`migrations/0002_flashcards.sql:1-10`). No account-deletion path exists, so deleting a user would orphan rows. Add migration `0003` with `not valid` then `validate`.
- F-11 pool TLS and sizing rely on the URL alone. `pg.types.setTypeParser` (`db.ts:93-95`) changes parsing process-wide, including for Better Auth's pool. Scope it to the app pool.
- F-12 migrator has no advisory lock (benign today, because the PK insert makes concurrent runs fail and roll back).
- F-13 / F-14 Info: connector host from Host header (not on the flashcards path); `write-atomic.mjs` does not constrain the target path (build tooling only).
- Checked and OK: SQL parameterisation, IDOR (no per-row id from the client reaches the DB), mass assignment (`validateData` whitelists keys), migration idempotency and transactions, atomic saves.

### Frontend and web (report 03)
- FE-02 the bridge trusts any framing origin when the guest is a `*.grok-sandbox.com` preview (`preview-embedder-origin.ts:38-49`, `preview-host-bridge.ts:126-128, 219-226`). Combined with FE-23 (any localhost port, any `*.grok.com` subdomain, `http:` accepted), the embedder allowlist is wider than AGENTS.md documents.
- FE-07 unguarded `localStorage` access can leave the app stuck on "Loading" (`library-store.ts:66-68, 82-85, 116`). Wrap reads and writes.
- FE-08 edit form overwrites in-progress typing when the card object identity changes, for example on "Sync now" (`create.tsx:32, 42-49`).
- FE-09 (latent) P2P signaling: guessable peer ids, `from` not bound to the poster, open room join (`multiplayer/p2p.ts:188-195, 361-377`). FE-10 peer messages and ICE candidates unvalidated and unbounded.
- FE-12 `String.replace` with untrusted strings lets `$&`, `$'` and `` $` `` be interpreted in the install page and head injection (`grok-pwa-shared.mjs:154-158, 411-413`).
- FE-13 install-page "Open" link can become a protocol-relative off-site URL (PLAUSIBLE).
- FE-14 / AUTH-11 connector `loginUrl` assigned to `location` with no scheme check.
- FE-18 no `Cache-Control: no-store` on authenticated responses.
- FE-24 accessibility gaps: flip control contains both faces, modal focus not managed, unlabelled inputs.
- FE-25 "offline-ready" claim with no service worker or app-shell cache (`__root.tsx:14`). Either implement it or remove the claim.
- FE-28 error boundary shows raw `error.message`. FE-30 import has no size limit.
- Checked and OK: no `dangerouslySetInnerHTML` or `innerHTML`, no service worker caching authenticated data, popup `targetOrigin` pinned and `event.origin` checked (`client.ts:188`), listeners removed in cleanup, strict TypeScript, hooks rules followed, no permissive CORS.

## 5. Prioritised roadmap

**Now (this week)**
1. Rotate the preview OAuth secret and remove it from source and from `.vercel/output` (H1).
2. Scope the offline library by user id and clear it on sign-out (H2).
3. Make production fail closed on missing `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`. Stop trusting localhost in production (H3).
4. Stop `npm run build` from migrating shared databases. Make migrations an explicit, gated step (H3).
5. Remove `.vercel/output`, `.tanstack/tmp` and the nested `attachments/` zip from the repo, and add a `.gitignore` (H10).

**Next (2 to 4 weeks)**
6. Add the sibling-preview same-site guard on `/api/auth` and remove wildcard sign-in trust (H4).
7. Add a Report-Only CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy` and `Permissions-Policy`, then enforce (H5).
8. Verify gate email explicitly and link only verified emails. Add JWKS negative caching and a timeout, and shorten the gate token (H6).
9. Add a version column with compare-and-set to library saves, and cap body size (H7).
10. Fix the three failing tests and the auth-invariant checker. Add authz tests for every server function (H9).

**Later**
11. Normalise decks, cards and reviews into tables with `user_id` foreign keys and cascades (02-F-09, H7).
12. Fix DST day arithmetic and clamp numeric inputs. Remove the dead merge branch and fix entity decoding (H8).
13. Harden P2P signaling: bind `from` to the sender, validate and bound messages (FE-09, FE-10).
14. Prune unused dependencies. Pin security-critical packages. Add `npm audit`, gitleaks and semgrep to CI (H10).
15. Accessibility and UX polish (FE-08, FE-24, FE-25).

## 6. Recommended CI additions
- `npm audit --omit=dev` and a gitleaks scan on every push.
- semgrep or CodeQL with JavaScript/TypeScript rules (includes `postMessage`, `innerHTML` and SQL checks).
- `npm ci` only, with a lockfile consistency check.
- A `security` test job that asserts: every `/api/*` and server function rejects cross-site requests, every server function scopes by session user, and production startup fails without required secrets.

## 7. Next steps for you
- Run `npm audit`, `npm run typecheck`, `npm run lint` and `npm test` in a local clone with `node_modules` installed. The static findings above were not run.
- Confirm the three test failures and the broker's redirect and PKCE behaviour for `grok_preview`.
- Check whether any environment has `DATABASE_URL` shared between preview and production.

**Per-report files:** `/tmp/claude-0/-home-claude/434967d2-98bb-5cd0-b84c-a3650e02eb16/scratchpad/reports/03-frontend-web-security.md` and `.../reports/04-build-supply-chain.md` contain full detail. The auth (01) and data (02) reports were returned as messages and are summarised in sections 3 and 4 above.
