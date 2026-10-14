# KCMSC premium workspace refresh

This update introduces a refined green-and-sage dashboard, responsive left navigation, a compact account bar, metric cards, workforce analytics panels, a profile-completion indicator, and improved chart palette. Existing server-side authorization and database-backed analytics remain the source of truth.

## Updated files
- `src/app/(app)/layout.tsx`: responsive workspace shell, permission-filtered sidebar links, account bar, and vector icons.
- `src/app/(app)/dashboard/page.tsx`: redesigned dashboard using the existing analytics query results.
- `src/app/(app)/dashboard/Charts.tsx`: green palette and refined chart styling hooks.
- `src/app/globals.css`: typography stack, dashboard design system, responsive layout, and component styling.

## Branding
Replace `public/brand/kcmsc-mark.svg` with the approved official KCMSC mark while preserving the filename, or update references if using another filename. The favicon remains at `src/app/icon.svg` and the metadata icon is configured in `src/app/layout.tsx`.

## Validation
After extracting on the development machine:
1. Restore your local `.env` securely (it is not included in this archive).
2. Run `npm ci`.
3. Run `npm run typecheck`, `npm test`, and `npm run build`.
4. For integration tests, configure `TEST_DATABASE_URL` to a dedicated test database, never the live staff database.

The source archive intentionally excludes `.env`, `node_modules`, and generated build artifacts.
