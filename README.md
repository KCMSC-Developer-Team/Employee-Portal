# KCMSC Employee Management System

A Next.js + TypeScript + Prisma + Neon PostgreSQL employee management portal. UI is intentionally restrained: neutral surfaces, deep green accent, clear hierarchy and compact data tables.

## Included
- Four roles: Developer, Authority, Computer Operator, Employee.
- Credentials login, hashed passwords, inactive-account check, role checks in server/API routes.
- Employee directory with search and sorting, profile pages, print-ready list.
- Employee-submitted profile changes are queued; staff approval applies the proposed changes.
- Authority and Developer can add observations. Computer Operators cannot access observation endpoints or UI.
- Developer-only account administration and role assignment.
- Audit log events for account/profile changes, approvals and observations.
- Employee schema based on the uploaded KCMSC Profile and Performance Sheet: names, designation, employee ID, joining date, position, department, supervisor, education (Secondary, Higher Secondary, Graduation, Master's, BEd, MEd, NTRCA, other training), job experience, personal information, addresses and observations.

## Setup
Requirements: Node.js 20+, a Neon PostgreSQL database.

1. Copy `.env.example` to `.env` and set `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET`.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Generate Prisma client and create the database schema:
   ```bash
   npx prisma generate
   npx prisma db push
   ```
   For a migration-based deployment, use `npm run db:migrate` in development and `npm run db:deploy` in production after creating migrations.
4. Seed the initial Developer:
   ```bash
   SEED_DEVELOPER_EMAIL=you@example.com SEED_DEVELOPER_PASSWORD='use-a-long-unique-password' npm run db:seed
   ```
   On PowerShell:
   ```powershell
   $env:SEED_DEVELOPER_EMAIL="you@example.com"
   $env:SEED_DEVELOPER_PASSWORD="use-a-long-unique-password"
   npm run db:seed
   ```
   If you omit these variables, the seed uses `developer@example.com` and `ChangeMe-Immediately-123!`. Change it immediately and do not deploy with the default credentials.
5. Start:
   ```bash
   npm run dev
   ```

## Important limitations / production checklist
This is a working starter project, not a formally audited production system. Before real institutional use:
- Review authorization rules with the institution and run security tests.
- Configure HTTPS, backups, Neon connection pooling, rate limiting and account recovery.
- Bulk Excel/CSV import is implemented for common personal/employment headers; inspect skipped rows and resolve duplicates before retrying.
- Complete remaining profile edit coverage for education/job history and add photo upload/storage.
- Add password reset, session revocation and account deactivation UI.
- Add pagination for very large employee directories.
- Test print layouts in the target browser and ensure privacy notices/data retention policies are approved.
- Do not store unnecessary NID/passport data unless the institution has a lawful need and appropriate access controls.

## Role policy
- Developer: full access; may create any role; may delete records when a delete workflow is implemented.
- Authority: view all records, edit, approve requests and add observations; no delete access.
- Computer Operator: view employee records except observations, create employee accounts, approve requests, print/search/sort directory; no delete access.
- Employee: view and request changes to own profile, view own observations, see colleagues' contact details only. No self-registration.

## Notes
The profile stores education and job experience sections as JSON so the full form can evolve without a migration for every optional field. Dedicated structured submodels can be introduced later if reporting on education/job history is needed.


### Employee login
- Employees sign in using their Employee ID and password. New employee accounts start with the Employee ID as the initial password.
- The Developer seed account uses Employee ID `2603` and email `zarif@kcmsc.edu.bd`; the seed sets its initial password to `2603`. Change this after signing in.
- Excel/CSV imports provide a column-mapping step and create employee login accounts for imported rows. Map both English name and Employee ID.
- Only the Developer can bulk-remove employees. Employee ID `2603` is protected from bulk deletion.


## Profile and Performance Sheet update

The employee profile now follows the official KC Model School & College Profile and Performance Sheet, including employment details, all eight education/training sections, three job experiences, personal information, photo URL, and four profile-sheet observation entries. Existing education/experience JSON columns are reused. A new nullable `Employee.sheetObservations` JSON column stores the four sheet observation entries.

After replacing the project files, keep your existing `.env` and run:

```powershell
npm ci
npx prisma generate
npx prisma db push
npm run dev
```

`prisma db push` synchronizes the additive schema change without resetting the database. Review the Prisma output before confirming if it warns about destructive changes. Do not run `prisma migrate reset`. The environment here did not allow a complete dependency installation/type-check, so run these commands locally and report any compiler error verbatim.

## Troubleshooting: Next.js dev runtime / React Client Manifest

If development shows `originalFactory is undefined` or a missing `segment-explorer-node.js#SegmentViewNode` in the React Client Manifest, stop the dev server with Ctrl+C and clear the generated Next.js cache (this does not touch the database or source files):

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm ci
npx prisma generate
npm run dev
```

For a production build, use `npm run build`. The build script invokes Prisma and Next.js through `npx` so Windows can resolve the local executables.


## Build fix (October 2026)

The employee creation API now includes the created employee relation in the Prisma result before reading its ID for the audit log. After extracting this project, run `npm ci`, `npx prisma generate`, and `npm run build`. Keep your existing `.env`; do not reset the database.
