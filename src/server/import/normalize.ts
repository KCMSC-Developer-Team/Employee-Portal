import type { ZodIssue } from "zod";
import { EDUCATION_LEVELS } from "@/lib/labels";
import { staffCreateSchema, type StaffCreateInput } from "@/lib/validation/staff";
import { TARGETS } from "./catalog";

export interface RefLookup { designation: Map<string, string>; category: Map<string, string>; department: Map<string, string> }
export interface RowIssue { column: string | null; code: string; message: string }

const LABEL = new Map(TARGETS.map((t) => [t.key, t.label]));
const lc = (s: string) => s.trim().toLowerCase();

export function toIsoDate(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const m = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(s); // Bangladesh convention: day first
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return s;
}

export function toMarital(raw: string): string {
  const k = raw.trim().toUpperCase();
  return ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"].includes(k) ? k : raw;
}

export function toBloodGroup(raw: string): string {
  const k = raw.trim().toUpperCase().replace(/\s+/g, "").replace(/POSITIVE|POS|\+/, "_POS").replace(/NEGATIVE|NEG|[-−–]/, "_NEG").replace(/__/g, "_");
  return /^(A|B|AB|O)_(POS|NEG)$/.test(k) ? k : raw;
}

export function toMobile(raw: string): string {
  const d = raw.replace(/[\s\-()]/g, "");
  return /^1[3-9]\d{8}$/.test(d) ? `0${d}` : raw; // Excel drops the leading zero of numeric cells
}

/** Which target a validation path belongs to (so issues name the field, never echo the value). */
function pathToKey(path: Array<string | number>): string | null {
  const [a, b, c] = path.map(String);
  if (a === "education") return `edu.${b}.${c ?? "institution"}`;
  if (a === "experience") return `exp.${b}.${c ?? "organization"}`;
  return a ?? null;
}

const SAFE_CODES = new Set(["custom", "too_big", "too_small"]);
function safeMessage(i: ZodIssue): string {
  // zod messages for enum/type errors embed the received value; only static messages are allowed through.
  if (SAFE_CODES.has(i.code) || (i.code === "invalid_string" && typeof i.message === "string")) return i.message;
  return "Invalid value";
}

export interface NormalizeResult { data: StaffCreateInput | null; form: Record<string, unknown> | null; issues: RowIssue[]; staffIdKey: string | null }

/** raw: mapped target key → cell text. Pure function. */
export function normalizeRow(raw: Record<string, string>, refs: RefLookup): NormalizeResult {
  const issues: RowIssue[] = [];
  const g = (k: string) => raw[k] ?? "";

  const ref = (key: "designation" | "category" | "department") => {
    const v = g(key).trim();
    if (!v) return null;
    const id = refs[key].get(lc(v));
    if (!id) issues.push({ column: LABEL.get(key)!, code: "UNKNOWN_REFERENCE", message: `${LABEL.get(key)} is not in the reference data. Add it under Reference data first.` });
    return id ?? null;
  };

  const candidate = {
    staffId: g("staffId").trim(),
    name: g("name").trim(),
    designationId: ref("designation"),
    categoryId: ref("category"),
    departmentId: ref("department"),
    joiningDate: toIsoDate(g("joiningDate")),
    dateOfBirth: toIsoDate(g("dateOfBirth")),
    subject: g("subject"),
    additionalQualifications: g("additionalQualifications"),
    mobile: toMobile(g("mobile")),
    email: g("email"),
    maritalStatus: toMarital(g("maritalStatus")),
    bloodGroup: toBloodGroup(g("bloodGroup")),
    homeDistrict: g("homeDistrict"),
    nidOrPassport: g("nidOrPassport"),
    presentAddress: g("presentAddress"),
    permanentAddress: g("permanentAddress"),
    education: Object.fromEntries(EDUCATION_LEVELS.map((l) => [l, {
      title: l === "OTHER" ? g("edu.OTHER.title") : "",
      institution: g(`edu.${l}.institution`), boardOrUniversity: g(`edu.${l}.boardOrUniversity`),
      subject: g(`edu.${l}.subject`), passingYear: g(`edu.${l}.passingYear`).replace(/\.0+$/, ""), result: g(`edu.${l}.result`),
    }])),
    experience: Object.fromEntries(["1", "2", "3"].map((n) => [n, {
      organization: g(`exp.${n}.organization`), designation: g(`exp.${n}.designation`),
      startDate: toIsoDate(g(`exp.${n}.startDate`)), endDate: toIsoDate(g(`exp.${n}.endDate`)),
    }])),
  };

  const parsed = staffCreateSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const i of parsed.error.issues) {
      const key = pathToKey(i.path as Array<string | number>);
      issues.push({ column: key ? (LABEL.get(key) ?? key) : null, code: "INVALID_VALUE", message: safeMessage(i) });
    }
  }
  const ok = parsed.success && !issues.some((i) => i.code === "UNKNOWN_REFERENCE");
  const staffIdKey = candidate.staffId ? candidate.staffId.toLowerCase() : null;
  return { data: ok ? parsed.data : null, form: ok ? candidate : null, issues, staffIdKey };
}

/** CSV cell escaping with spreadsheet formula-injection protection. */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
