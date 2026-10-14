/**
 * RELEASE-BLOCKING (static). Observation storage may only be touched by the Observation service (and the
 * Stage 6 authorised-import commit). Any other module that references the tables, selects the relation, or
 * imports the service from an unexpected place fails the build.
 */
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}
const rel = (p: string) => path.relative(SRC, p).split(path.sep).join("/");
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const files = walk(SRC).map((p) => ({ path: rel(p), code: stripComments(readFileSync(p, "utf8")) }));

const TABLE_ALLOWED = [/^server\/observation\//, /^server\/import\//, /^server\/audit\/queries\.ts$/]; // audit/queries only EXCLUDES these entity names
const SERVICE_IMPORTERS = [/^app\/\(app\)\/observations\//, /^app\/\(app\)\/me\/observation\//, /^server\/import\//];

describe("observation isolation (static)", () => {
  it("only the observation service (and authorised import) references the observation tables", () => {
    const re = /leaderObservation|observationRevision|importObservationRow/i;
    const offenders = files.filter((f) => re.test(f.code) && !TABLE_ALLOWED.some((a) => a.test(f.path))).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("no module outside the observation service selects/includes the observation relation", () => {
    const re = /\bobservation\s*:\s*(true|\{)/;
    const offenders = files.filter((f) => re.test(f.code) && !/^server\/observation\//.test(f.path)).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("only Leader/employee observation screens (and import) import the observation service", () => {
    const offenders = files
      .filter((f) => /server\/observation\/service/.test(f.code) && !SERVICE_IMPORTERS.some((a) => a.test(f.path)))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it("the observation service has no delete operation of any kind", () => {
    const svc = files.find((f) => f.path === "server/observation/service.ts");
    expect(svc).toBeDefined();
    expect(/\.(delete|deleteMany)\s*\(/.test(svc!.code)).toBe(false);
  });

  it("the observation service never puts text into audit metadata", () => {
    const svc = files.find((f) => f.path === "server/observation/service.ts")!;
    const auditCalls = svc.code.match(/audit\([^;]*\);/g) ?? [];
    expect(auditCalls.length).toBeGreaterThan(0);
    for (const c of auditCalls) expect(/\bbody\b/.test(c)).toBe(false);
  });

  it("the change-request allowlist cannot reach observation or HR-controlled fields", () => {
    const v = files.find((f) => f.path === "lib/validation/staff.ts")!;
    const block = v.code.slice(v.code.indexOf("REQUEST_SCALAR_FIELDS = ["), v.code.indexOf("] as const", v.code.indexOf("REQUEST_SCALAR_FIELDS = [")));
    for (const forbidden of ["observation", "staffId", "designationId", "departmentId", "categoryId", "joiningDate", "employmentStatus"]) {
      expect(block.includes(`"${forbidden}"`)).toBe(false);
    }
  });
});
