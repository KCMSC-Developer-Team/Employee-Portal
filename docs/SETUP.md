# Setup (local / staging)

Requirements: Node ≥ 20.11, PostgreSQL ≥ 14, `openssl`.

```bash
npm install                       # commit the generated lockfile; then run `npm audit`
cp .env.example .env              # fill DATABASE_URL, APP_SECRET (openssl rand -base64 48), FILE_STORAGE_DIR
npx prisma generate
npx prisma migrate dev --name init
npx prisma migrate dev --create-only --name db_guards
#   → paste prisma/sql/db_guards.sql into the new migration.sql, then:
npx prisma migrate dev
```

Seed the Principal (Leader) and, optionally, a first administrator. Set `SEED_PRINCIPAL_STAFF_ID/NAME` (and `SEED_ADMIN_*`) in `.env`, then:

```bash
npm run db:seed        # prints each one-time temporary password ONCE — copy it now
```
Remove the `SEED_*` values afterwards. Each person must change their password at first login. The Principal holds only Leader permissions: give them an administrator role too if they need admin screens (Roles page, granted by a Leader with `leader:grant` — the seeded Principal can do this for ordinary roles only after an Admin Manager exists, or via a second seed admin).

First-run order for real data: create departments/designations/categories (Reference data) → import staff (Import) → create accounts per person (Staff → profile → Create account) → hand out temporary passwords in person.

```bash
npm run dev            # http://localhost:3000
```

## Tests
```bash
npm run typecheck
npm run test:unit
# Security suite needs a DEDICATED empty database whose name contains "test":
createdb kcmsc_test
DATABASE_URL=postgresql://…/kcmsc_test npx prisma db push
DATABASE_URL=postgresql://…/kcmsc_test npm run db:guards     # once per fresh database (not idempotent)
TEST_DATABASE_URL=postgresql://…/kcmsc_test npm run test:security
```
The security suite is release-blocking: it fails (never skips) if `TEST_DATABASE_URL` is missing. `.github/workflows/ci.yml` does all of this on every push.
