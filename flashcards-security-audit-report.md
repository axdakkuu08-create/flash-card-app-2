# Flashcards App — Consolidated Security & Quality Audit

**Date:** 2026-11-13  
**Scope:** Static, read-only review of the application archive. No `node_modules` install, no runtime execution, no network calls to production services.  
**Method:** Four parallel reviews (Auth, Data, Frontend/Web Security, Build & Supply-Chain). Frontend and Build reports were written to disk; Auth and Data findings exist only in the returned messages and are summarised here.

---

## Executive Summary

The most urgent issue is a **live OAuth client secret committed in source** (`src/lib/auth/preview.ts:20-21`). It is also used as a fallback in production (`server.ts:81-82`) and is present in the committed server bundle. **Rotate it immediately.**

Other high-severity findings cluster around:

- Offline library storage not bound to the authenticated user (cross-user data leakage / overwrite risk on shared browsers).
- Production fail-open behaviour (missing `DATABASE_URL` → in-memory DB; missing auth secret → random per-process value; localhost origins trusted in production).
- Missing web hardening (no CSP, no framing controls, weaker same-site checks on `/api/auth`).
- Sync/data integrity gaps (full-library overwrite with no versioning or size limits).
- Repo hygiene (committed build output containing the secret, unused dependencies, nested unrelated project).

Two items could not be fully verified from the archive alone:

1. Whether the exposed OAuth secret is practically exploitable depends on the identity broker’s PKCE enforcement and redirect-URI strictness.
2. Better Auth internal behaviour was not inspectable beyond the application’s call sites.

---

## Severity Table (Deduplicated)

| ID | Severity | Area | Finding | Location / Evidence |
|----|----------|------|---------|---------------------|
| S1 | **Critical** | Auth | Live OAuth client secret hardcoded in source and used as production fallback; also present in committed server bundle | `src/lib/auth/preview.ts:20-21`, `server.ts:81-82`, `.vercel/output` |
| S2 | **High** | Data / Auth | Offline library lives under a single localStorage key and survives sign-out; next user on the same browser inherits / can overwrite the previous user’s data | localStorage key usage (no per-account scoping) |
| S3 | **High** | Config / Ops | Production fails open: missing `DATABASE_URL` → silent in-memory DB; missing auth secret → random per-process value; localhost origins trusted in production | Env handling + origin checks |
| S4 | **High** | Web | No Content-Security-Policy; no framing controls (`X-Frame-Options` / `frame-ancestors`); any site can embed the app | Response headers / middleware |
| S5 | **Medium** | Auth | `/api/auth` routes skip the same-site check that server functions perform; preview trusts every `*.grok-sandbox.com` origin | Auth route handlers, preview origin logic |
| S6 | **Medium** | Data | Saves overwrite the entire library with no version / ETag / conflict detection; payload has no size cap | Sync / save path |
| S7 | **Medium** | Data | Streak calculations break across daylight-saving transitions; unbounded numbers can silently reset a card’s schedule | Scheduling / streak logic |
| S8 | **Medium** | Build | Build output (`.vercel/output`) is committed and contains the secret | Repo contents |
| S9 | **Low** | Build / Hygiene | ~17 declared dependencies never imported; nested unrelated older Expo/Manus project in `attachments/` (including its own `.npmrc`) | `package.json`, `attachments/` |
| S10 | **Low** | Tests | Static reading suggests three tests fail against committed fixtures (needs runtime confirmation) | Test files + fixtures |

---

## Root-Cause Themes

1. **Secrets management is absent**  
   Credentials are treated as source code rather than runtime configuration. The same secret appears in preview source, production fallback, and the committed build artefact.

2. **Local-first storage is not identity-aware**  
   The offline library is a single global key. Authentication and local persistence are not joined, so browser-level isolation is the only protection.

3. **Fail-open defaults in production paths**  
   Missing configuration produces a running (but incorrect) system instead of a hard failure. This is convenient for local development and dangerous in production.

4. **Defence-in-depth is incomplete on the web surface**  
   Same-site checks exist for some routes but not others; browser security headers that would limit embedding and script injection are missing.

5. **Sync model is last-write-wins with no guards**  
   Full-document replacement without versioning, size limits, or conflict detection creates both integrity and availability risks.

---

## Now / Next / Later Roadmap

### Now (this week)

1. **Rotate the OAuth client secret** and remove every hardcoded copy.  
   - Delete the literal from `src/lib/auth/preview.ts`.  
   - Ensure production reads only from environment / secret store.  
   - Purge the secret from git history and from the committed `.vercel/output` tree (or stop committing build output).  
   - Confirm the identity broker has revoked the old secret.

2. **Make missing critical config a hard failure in production**  
   - `DATABASE_URL` required; refuse to start (or refuse to accept traffic) if absent.  
   - Auth secret required; no random fallback.  
   - Reject localhost / wildcard sandbox origins when `NODE_ENV === "production"`.

3. **Scope offline library to the authenticated user**  
   - Key localStorage (or IndexedDB) by user ID / account identifier.  
   - Clear or isolate the previous user’s data on sign-out / sign-in.

4. **Stop committing build output**  
   - Add `.vercel/output` (and any other generated bundles) to `.gitignore`.  
   - Remove the directory from the repository.

### Next (next 1–2 sprints)

5. **Add baseline web hardening headers**  
   - Content-Security-Policy (start with a report-only policy if needed).  
   - `frame-ancestors 'none'` or a tight allow-list; `X-Frame-Options: DENY` as legacy fallback.  
   - Ensure `/api/auth` receives the same origin / same-site protections as other server functions.

6. **Harden the sync path**  
   - Add a version / updated-at / ETag field and reject or merge on conflict.  
   - Impose a reasonable payload size limit.  
   - Consider per-deck or incremental sync instead of full-library replacement.

7. **Fix scheduling edge cases**  
   - Make streak and due-date calculations timezone- and DST-safe (prefer UTC storage + explicit local conversion, or a library that handles DST correctly).  
   - Clamp or reject out-of-range numeric fields that can reset a card’s schedule.

8. **Repo hygiene**  
   - Remove or relocate the nested `attachments/flashcards-offline.zip` (confirmed unrelated older Expo/Manus template; its `.npmrc` contains no credentials).  
   - Prune the ~17 unused dependencies after confirming with `depcheck` / manual import audit.  
   - Run and fix the three tests that appear to fail against committed fixtures.

### Later

9. **CI gates**  
   - `npm audit` (fail on high/critical).  
   - `npm run typecheck`, `npm run lint`, `npm test`.  
   - Secret scanning (e.g. gitleaks, trufflehog) on every PR.  
   - Disallow committed build artefacts.  
   - Optional: SBOM generation and dependency review.

10. **Deeper verification that requires a running environment**  
    - Confirm whether the previously exposed secret can be abused given the broker’s PKCE and redirect rules.  
    - Exercise Better Auth configuration and session handling under realistic load / origin combinations.  
    - Confirm whether preview and production share a `DATABASE_URL` (and whether that is intentional).

---

## Suggested Immediate Commands (local clone with dependencies)

```bash
# After rotating the secret and cleaning the repo
npm audit
npm run typecheck
npm run lint
npm test

# Optional hygiene
npx depcheck
# secret scan
gitleaks detect --source . -v
```

Also verify whether preview and production environments share the same `DATABASE_URL`.

---

## Review Coverage Notes

| Review | Status | Artefact |
|--------|--------|----------|
| Auth | Completed (message only) | Summarised above |
| Data | Completed (message only) | Summarised above |
| Frontend / Web Security | Completed + written | `/tmp/.../03-frontend-web-security.md` (not present in this workspace) |
| Build & Supply-Chain | Completed + written | `/tmp/.../04-build-supply-chain.md` (not present in this workspace) |

The nested zip under `attachments/` was examined separately: it is an unrelated older project; no credentials were found in its `.npmrc` or via content search.

---

## Limitations

- Static analysis only. Runtime behaviour, actual CSP effectiveness, and broker-side OAuth policy were not exercised.
- Better Auth internals beyond the application’s usage sites were not inspected.
- Test failures are inferred from static comparison of fixtures and expectations; they must be confirmed by running the suite.

---

*End of consolidated report.*
