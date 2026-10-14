# Final security review (design + code review)

**Status honesty:** this review is a read-through and static scan of the code as written. The code has **not** been installed, type-checked or executed (the authoring sandbox had no package-registry access), so none of the automated tests have run. Treat every control below as *implemented, unverified* until `typecheck`, the unit suite and the DB-backed security suite pass in CI.

## Control matrix
| Requirement | Where enforced | Verified by |
|---|---|---|
| Whole app private; no public pages/directory | `middleware.ts` cookie gate + `requireUser()` in every page/action/route; noindex headers; photos only via authenticated route | static route scan (below), manual |
| Passwords | Argon2id (OWASP params), random one-time temp passwords, forced first-login change, no passwords in import | `policy.test`, `import-integration` |
| Sessions | opaque random token, SHA-256 stored, HttpOnly/SameSite/`__Host-`, absolute + idle expiry, new token per login, revoked on disable/reset | code review |
| Brute force | DB-backed HMAC-keyed limiter, lockout, timing equalisation, generic errors | code review |
| Authorization | single `policy.ts`; scope-aware; 404 not 403; layouts are navigation only | `policy.test`, `access-integration` |
| Privilege escalation | `canGrantRoleFull`, `canManageAccount` (actor must hold every target permission), no self-grant, last-Leader protected, DB trigger separating Leader/ordinary permissions | `policy.test`, `observation-integration` |
| Official record integrity | employees only create change requests; allowlist excludes HR fields; atomic approval, stale check, re-validation, no self-review | `access-integration`, `request-diff.test` |
| Never delete staff | DB trigger + no delete API; separate employment vs account status | `observation-integration` (triggers) |
| Audit | append-only trigger; metadata keys blocklisted; ordinary log excludes observation events | `policy.test`, `observation-integration` |
| Observation isolation | own tables; one service module; per-function re-auth; explicit selects; no delete; revisions; Leader-only trail; not in search/charts/exports/audit text | `static-isolation`, `observation-integration`, `import-integration` |
| Import safety | .xlsx magic bytes + zip-bomb guard, size/row/column caps, only mapped columns read, staging, conflicts never merged, value-free issue report, source file purged, Leader-only observation migration | `import.test`, `import-integration` |
| Uploads | magic-byte sniff, sharp re-encode (strips EXIF), random private key | code review |
| Exports | fixed non-sensitive columns, CSV formula-injection guard, audited | `access-integration`, `import.test` |
| Headers | CSP, HSTS, frame-ancestors none, nosniff, no-referrer, no-store | `next.config.ts` |

## Static scan results (this stage)
- No `dangerouslySetInnerHTML`, `$queryRaw`/`$executeRaw`, `eval`, `new Function`, or `child_process` anywhere in `src/` or `prisma/`.
- Every `page.tsx`, `actions.ts` and `route.ts` under `src/app` calls an auth helper or is an explicit public auth page (login/recover/reset).
- `console.*` calls log only error codes, never bodies or Observation text.

## Findings fixed in Stage 7
1. Server-action body limit (4 MB) was below the import file limit (5 MB) → raised to 6 MB.
2. No cleanup for expired sessions/tokens/login attempts → `npm run maintenance`.
3. Static isolation test tightened: only `server/observation/` may reference observation tables; delete-ban now targets observation/revision tables precisely (import staging purge is allowed).

## Known residual risks / not done
- **No MFA.** Recommended for Leader and admin accounts before wide rollout.
- **CSP allows `'unsafe-inline'` scripts** (Next.js bootstrap). Move to nonces when convenient.
- **Observation/NID are not application-level encrypted.** Protection is access control + DB/disk encryption + restricted DB access. Anyone with raw DB or backup access can read them; treat DB admins and backups as inside the trust boundary.
- **Login limiter is DB-based**, with no CAPTCHA or IP reputation. Add proxy-level rate limits for `/login`.
- **Local-disk file storage** (single node). Use shared encrypted storage if you scale out.
- **No bulk account provisioning** after import; accounts are created per person (by design: one-time passwords are handed out individually).
- **Dependency versions are unverified caret ranges**; commit a lockfile and run `npm audit`.
- DB guards SQL has never been executed against PostgreSQL; run it on a scratch database first.
- Day-first (DD/MM/YYYY) date reading in imports; ambiguous formats are the uploader's responsibility (previewed as issues if invalid).

## Pre-launch verification checklist
- [ ] `npm run typecheck`, `test:unit`, `test:security`, `build` green in CI
- [ ] `db_guards` migration applied (try `DELETE FROM "AuditEvent"` → must fail)
- [ ] As an ordinary admin: `/observations`, `/me/observation`, `/import/observations/x` → 404; staff profile page shows no observation
- [ ] As an employee: other staff IDs in URLs → 404; own observation visible read-only
- [ ] Leader cannot write own observation; Leader cannot grant themselves roles
- [ ] Import sample file: conflicts reported, nothing overwritten, issue CSV has no cell values
- [ ] Backups restore successfully and are encrypted
