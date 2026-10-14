# Deployment checklist

1. **TLS only.** Terminate HTTPS at a reverse proxy (nginx/Caddy). Redirect HTTP→HTTPS. The session cookie is `__Host-` prefixed and `Secure` in production, so plain HTTP will not log in.
2. **Proxy headers.** Set `TRUST_PROXY=true` only if your proxy *overwrites* `X-Forwarded-For`; otherwise leave `false` (per-account limits still apply).
3. **Secrets.** `APP_SECRET` ≥ 32 random bytes, stored in the host secret store, never in git. Rotating it resets rate-limit state (harmless) but not sessions.
4. **Database.** Dedicated PostgreSQL role with only the app DB; no superuser. Network-restricted. Apply migrations with `npx prisma migrate deploy` — **including the `db_guards` migration** (immutability triggers and unique indexes are security controls).
5. **Private storage.** `FILE_STORAGE_DIR` on a volume outside any served directory, owner-only permissions (app creates 0700/0600). The app never serves files except authenticated profile photos.
6. **Build/run.** `npm ci && npm run build && npm start` behind a process manager (systemd/pm2/container). Run as a non-root user.
7. **Housekeeping.** Schedule `npm run maintenance` daily (expired sessions, reset tokens, login attempts).
8. **Backups.** Nightly encrypted `pg_dump` **and** the storage directory. Backups contain confidential Observation text and NID numbers: encrypt, restrict access, test restores. Use full-disk/volume encryption for the DB host.
9. **Email recovery (optional).** Set `APP_URL`, `SMTP_URL`, `MAIL_FROM` together; otherwise recovery is admin-issued only.
10. **Seed hygiene.** Remove `SEED_*` variables after the first seed. Store the printed one-time passwords nowhere.
11. **Monitoring.** Alert on repeated 5xx, DB errors, and on `AuditEvent` actions `account.reset`, `role.grant`, `role.revoke`, `report.export`, `import.commit`. Logs never contain request bodies or observation text by design — keep it that way when adding logging.
12. **Updates.** `npm audit` and dependency updates monthly; re-run `npm run test:security` before every deploy.

## Go-live gate
All of these must be green on the *deployment candidate*: `typecheck`, `test:unit`, `test:security` (DB-backed), `build`; manual smoke test of: login + forced password change, change-request round trip, Leader reads/writes an observation, an ordinary admin gets 404 on `/observations`, import of a small sample workbook.
