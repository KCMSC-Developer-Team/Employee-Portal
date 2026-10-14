# KCMSC Teacher & Staff Management System

Private staff-management app for K C Model School & College. Nothing is public: every page, API, file and chart requires a session.

## Architecture

- **Next.js 15 (App Router) + TypeScript + Tailwind 4**, server components and server actions; route handlers only for authenticated file streaming.
- **PostgreSQL + Prisma**. Business rules also enforced in the DB (partial unique indexes, CHECKs, no-delete/append-only triggers) — see `prisma/sql/db_guards.sql`.
- **Auth**: staff ID + password, Argon2id, opaque random session cookie (HttpOnly, Secure, SameSite=Lax); only the SHA-256 of the token is stored. DB-backed login rate limiting and lockout. `mustChangePassword` forces a change at first login.
- **Authorization**: one `authorize()` layer in `src/server/authz/`. Permissions are *ordinary* or *Leader* (`src/lib/permissions.ts`). Leader roles hold only Leader permissions, ordinary roles none (DB trigger). Admin never implies Leader.
- **Observation isolation**: stored only in `LeaderObservation` / `ObservationRevision` (and `ImportObservationRow` for authorised migrations). It is never a column on `StaffMember`, never selectable via the general staff queries, and is outside the change-request allowlist. Audit rows record ids and version numbers, never text.
- **Change requests**: employee submits items (old → new). One PENDING request per staff member (DB-enforced). Approval runs in one transaction and fails if `StaffMember.version` moved since submission.
- **Files**: stored under `FILE_STORAGE_DIR` (outside web root), served only through an authorised route handler; type/size/magic-byte checks on upload.
- **Credentials decision**: phone-number-as-password is guessable, so the default is a random one-time temporary password shown once to the admin, with forced change at first login. Phone-as-initial-password is deliberately not implemented.

## Project tree (✅ = delivered, others by stage)

```
kcmsc-staff/
├─ prisma/
│  ├─ schema.prisma                ✅ S1
│  ├─ sql/db_guards.sql            ✅ S1
│  └─ seed.ts                      S2  roles, permissions, Principal (LEADER)
├─ src/
│  ├─ lib/
│  │  ├─ env.ts  db.ts  permissions.ts   ✅ S1
│  │  └─ crypto.ts  audit.ts  files.ts   S2/S4
│  ├─ server/
│  │  ├─ auth/      password, session, rate-limit, recovery     S2
│  │  ├─ authz/     authorize(), scope checks, role granting    S2, S5
│  │  ├─ staff/     queries (no observation), mutations         S3
│  │  ├─ requests/  diff.ts, service.ts (submit/approve/reject)   ✅ S4
│  │  ├─ observation/ leader-only service + revisions           S5
│  │  ├─ dashboard/ aggregate queries (counts only)             S6
│  │  └─ import/    parse, map, validate, stage, reconcile      S6
│  ├─ app/
│  │  ├─ (auth)/login, change-password, recover                 S2
│  │  ├─ (portal)/me, me/requests                               S3-4
│  │  ├─ (admin)/dashboard, staff, requests, accounts, import   S3-6
│  │  ├─ (leader)/observations                                  S5
│  │  └─ api/files/[id]/route.ts                                S4
│  ├─ components/  ui, charts, forms                            S3+
│  └─ middleware.ts  (cookie-presence gate; real checks in authz)  S2
├─ tests/security/   observation-isolation, authz, session      S5/S7
├─ tests/unit/
├─ next.config.ts  tsconfig.json  postcss.config.mjs  package.json  ✅ S1
└─ .env.example  .gitignore  README.md                          ✅ S1
```

## Setup

> Not yet executed anywhere: package install, migration and build have **not** been run (the authoring sandbox blocked the npm registry). Dependency versions are caret ranges chosen from memory — run `npm install` and commit the generated lockfile, then fix any version drift.

1. `npm install`
2. `cp .env.example .env`, fill `DATABASE_URL`, `APP_SECRET` (`openssl rand -base64 48`).
3. `npx prisma migrate dev --name init`
4. DB guards as a second migration: `npx prisma migrate dev --create-only --name db_guards`, paste the contents of `prisma/sql/db_guards.sql` into the generated `migration.sql`, then `npx prisma migrate dev`.
5. Set `SEED_PRINCIPAL_*` (and optionally `SEED_ADMIN_*`) in `.env`, run `npm run db:seed`; copy the one-time passwords it prints. Then `npm run dev` and sign in at /login.

Production: `npm run build`, `npx prisma migrate deploy`, HTTPS only, `FILE_STORAGE_DIR` on a private volume with backups.

## Checklist

- [x] S1 Architecture, schema, DB guards, config, permission catalog
- [x] S2 Seed, Argon2id, sessions, rate limiting, login/first-login change, authz policy, admin-issued reset (email self-recovery deferred to S4)
- [x] S3 Staff profile + education/experience, admin create/edit, search/filter/pagination, own-profile view, reference data (photo upload → S4, employment status change → S4)
- [x] S4 Change requests (diff, approve/reject, stale-check, self-review block), employment status + resignation, account enable/disable/reset, photo upload (sharp re-encode) + authenticated serving, email recovery (optional), audit log + per-record history
- [x] S5 Leader roles, Observation service + revisions, role-granting rules, security tests
- [ ] S6 Dashboard charts, Excel import, authorised reports
- [ ] S7 Full test suite, deployment guide, final security review

## Reference data

Departments, designations and employment categories (“Joined As”) start empty. Add them at /reference (institution-wide admins) before creating staff.

## Stage 4 notes

- Employees can request changes to personal/contact/education/experience data and the photograph. They cannot request designation, department, joining date, employment status or anything Observation-related.
- One pending request per employee (DB-enforced). Approval re-checks every item's old value against the live record; if anything moved, the whole approval rolls back and the reviewer must reject (with a reason) and ask for resubmission.
- Reviewers cannot decide their own request. Employment-status changes never touch the login account; disabling access is a separate action.
- Email recovery needs `APP_URL`, `SMTP_URL` and `MAIL_FROM`; otherwise recovery is admin-issued. A compromised mailbox can take over that account — consider MFA before production for Leader accounts.
- The ordinary audit log hides all Observation-related events.


## Stage 5 notes: Leader roles & Observation

- Leader is not admin. The LEADER role holds only Leader permissions (a DB trigger enforces this). The Principal needs a separate admin role to use admin screens.
- Observation is readable only by the employee concerned (read-only, `/me/observation`) and by Leaders within scope. Leaders cannot write their own observation. No delete exists; every edit creates a revision.
- Observation tables are touched only by `src/server/observation/service.ts` (and later `src/server/import/`). Audit entries never contain the text.
- Leader roles can be granted only by a Leader holding `leader:grant`. Ordinary role managers grant ordinary roles they themselves fully hold. No self-grants. The last institution-wide Leader cannot be revoked.

### Running the security tests
1. Create a dedicated empty database whose name contains `test`.
2. Apply migrations **and** `prisma/sql/db_guards.sql` (required for the immutability tests).
3. `TEST_DATABASE_URL=postgresql://... npm run test:security`

These tests have not yet been executed by the author (no package registry access in the build sandbox); run them before relying on the system.
