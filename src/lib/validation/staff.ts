import { z } from "zod";
import {
  BLOOD_GROUPS, EDUCATION_LEVELS, MARITAL_STATUSES,
} from "../labels";

/* ───────── primitives ───────── */

/** Form values: trim; blank / non-string (e.g. a File) → null. */
const clean = (v: unknown) => (typeof v === "string" ? v.trim() || null : null);

const text = (max: number) => z.preprocess(clean, z.string().max(max, `At most ${max} characters`).nullable());

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00.000Z`);
  const y = d.getUTCFullYear();
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s) && y >= 1900 && y <= 2100;
};
const dateStr = z.preprocess(
  clean,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").refine(isRealDate, "Invalid date").nullable(),
);

const enumOrNull = <T extends readonly [string, ...string[]]>(vals: T) => z.preprocess(clean, z.enum(vals).nullable());

const year = z.preprocess(
  clean,
  z.string().regex(/^\d{4}$/, "Enter a 4-digit year")
    .transform(Number)
    .refine((y) => y >= 1950 && y <= new Date().getFullYear() + 1, "Year out of range")
    .nullable(),
);

const normalizeMobile = (s: string) => s.replace(/[\s\-()]/g, "").replace(/^\+?88(?=01)/, "");

const mobile = z.preprocess(
  clean,
  z.string().transform(normalizeMobile)
    .pipe(z.string().regex(/^01[3-9]\d{8}$/, "Enter a valid Bangladesh mobile number (01XXXXXXXXX)"))
    .nullable(),
);

const email = z.preprocess(
  clean,
  z.string().max(254).email("Enter a valid email address").transform((s) => s.toLowerCase()).nullable(),
);

const nidOrPassport = z.preprocess(
  clean,
  z.string().regex(/^[A-Za-z0-9]{6,20}$/, "NID/passport: 6–20 letters or digits, no spaces")
    .transform((s) => s.toUpperCase()).nullable(),
);

const refId = z.preprocess(clean, z.string().max(40).nullable());

const hasContent = (o: Record<string, unknown>) => Object.values(o).some((v) => v !== null && v !== undefined);

/* ───────── education / experience ───────── */

const eduRow = z.object({
  title: text(120),
  institution: text(150),
  boardOrUniversity: text(150),
  subject: text(150),
  passingYear: year,
  result: text(40),
});

const ntrcaRow = eduRow.superRefine((r, ctx) => {
  if (r.result === null) return;
  const n = Number(r.result.replace(/%$/, "").trim());
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    ctx.addIssue({ code: "custom", path: ["result"], message: "NTRCA result must be a percentage from 0 to 100" });
  }
});

const otherRow = eduRow.superRefine((r, ctx) => {
  if (hasContent(r) && r.title === null) {
    ctx.addIssue({ code: "custom", path: ["title"], message: "Name the degree/training" });
  }
});

const expRow = z
  .object({ organization: text(150), designation: text(100), startDate: dateStr, endDate: dateStr })
  .superRefine((r, ctx) => {
    if (r.startDate && r.endDate && r.endDate < r.startDate) {
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "End date is before start date" });
    }
  });

/* ───────── staff ───────── */

const staffShape = {
  staffId: z.string().trim().regex(/^[A-Za-z0-9._-]{2,32}$/, "Staff ID: 2–32 letters, digits, . _ -"),
  name: z.string().trim().min(2, "Name is required").max(120),
  designationId: refId,
  categoryId: refId, // "Joined As"
  departmentId: refId,
  joiningDate: dateStr,
  dateOfBirth: dateStr,
  subject: text(150),
  additionalQualifications: text(1000),
  mobile,
  email,
  maritalStatus: enumOrNull(MARITAL_STATUSES),
  bloodGroup: enumOrNull(BLOOD_GROUPS),
  homeDistrict: text(60),
  nidOrPassport,
  presentAddress: text(300),
  permanentAddress: text(300),
  education: z.object({
    SECONDARY: eduRow,
    HIGHER_SECONDARY: eduRow,
    GRADUATION: eduRow,
    MASTERS: eduRow,
    BED_MED: eduRow,
    NTRCA: ntrcaRow,
    OTHER: otherRow,
  }),
  experience: z.object({ "1": expRow, "2": expRow, "3": expRow }),
};

const crossChecks = (v: { dateOfBirth: string | null; joiningDate: string | null }, ctx: z.RefinementCtx) => {
  const today = new Date().toISOString().slice(0, 10);
  if (v.dateOfBirth && v.dateOfBirth >= today) {
    ctx.addIssue({ code: "custom", path: ["dateOfBirth"], message: "Date of birth must be in the past" });
  }
  if (v.dateOfBirth && v.joiningDate && v.joiningDate < v.dateOfBirth) {
    ctx.addIssue({ code: "custom", path: ["joiningDate"], message: "Joining date is before date of birth" });
  }
};

export const staffCreateSchema = z.object(staffShape).superRefine(crossChecks);
// Staff ID is the login identifier and is immutable after creation.
export const staffUpdateSchema = z.object(staffShape).omit({ staffId: true }).superRefine(crossChecks);

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
export type EducationInput = StaffUpdateInput["education"][keyof StaffUpdateInput["education"]];

/* ───────── FormData ⇄ object (whitelisted field names only) ───────── */

export const SCALAR_FIELDS = [
  "staffId", "name", "designationId", "categoryId", "departmentId", "joiningDate", "dateOfBirth", "subject",
  "additionalQualifications", "mobile", "email", "maritalStatus", "bloodGroup", "homeDistrict", "nidOrPassport",
  "presentAddress", "permanentAddress",
] as const;
export const EDU_FIELDS = ["title", "institution", "boardOrUniversity", "subject", "passingYear", "result"] as const;
export const EXP_FIELDS = ["organization", "designation", "startDate", "endDate"] as const;
export const EXP_SLOTS = ["1", "2", "3"] as const;

/** Input `name` attributes equal the Zod issue path joined by ".", e.g. "education.NTRCA.result". */
function formToObject(fd: FormData) {
  const get = (k: string) => fd.get(k);
  const obj: Record<string, unknown> = {};
  for (const k of SCALAR_FIELDS) obj[k] = get(k);
  const education: Record<string, Record<string, unknown>> = {};
  for (const lvl of EDUCATION_LEVELS) {
    education[lvl] = {};
    for (const f of EDU_FIELDS) education[lvl]![f] = get(`education.${lvl}.${f}`);
  }
  const experience: Record<string, Record<string, unknown>> = {};
  for (const s of EXP_SLOTS) {
    experience[s] = {};
    for (const f of EXP_FIELDS) experience[s]![f] = get(`experience.${s}.${f}`);
  }
  return { ...obj, education, experience };
}

/** Flat echo of submitted (whitelisted) values, so the form can repopulate after a validation error. */
export function formToFlat(fd: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  const put = (k: string) => { const v = fd.get(k); out[k] = typeof v === "string" ? v : ""; };
  SCALAR_FIELDS.forEach(put);
  put("note");
  for (const l of EDUCATION_LEVELS) EDU_FIELDS.forEach((f) => put(`education.${l}.${f}`));
  for (const s of EXP_SLOTS) EXP_FIELDS.forEach((f) => put(`experience.${s}.${f}`));
  return out;
}

export const parseCreateForm = (fd: FormData) => staffCreateSchema.safeParse(formToObject(fd));
export const parseUpdateForm = (fd: FormData) => staffUpdateSchema.safeParse(formToObject(fd));

export function flattenErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = i.path.join(".");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

export const hasRowContent = hasContent;

/* ───────── employee change requests (Stage 4) ───────── */

// Employees may request changes to these only. Excluded on purpose: staffId, designation, "joined as",
// department, joining date, employment status (HR-controlled) and Observation (Leader-only, never requestable).
export const REQUEST_SCALAR_FIELDS = [
  "name", "dateOfBirth", "subject", "additionalQualifications", "mobile", "email", "maritalStatus",
  "bloodGroup", "homeDistrict", "nidOrPassport", "presentAddress", "permanentAddress",
] as const;
export type RequestScalarField = (typeof REQUEST_SCALAR_FIELDS)[number];

export const requestFieldSchema: Record<RequestScalarField, z.ZodTypeAny> = {
  name: staffShape.name, dateOfBirth: staffShape.dateOfBirth, subject: staffShape.subject,
  additionalQualifications: staffShape.additionalQualifications, mobile: staffShape.mobile, email: staffShape.email,
  maritalStatus: staffShape.maritalStatus, bloodGroup: staffShape.bloodGroup, homeDistrict: staffShape.homeDistrict,
  nidOrPassport: staffShape.nidOrPassport, presentAddress: staffShape.presentAddress, permanentAddress: staffShape.permanentAddress,
};

export const requestSchema = z
  .object({
    name: staffShape.name, dateOfBirth: staffShape.dateOfBirth, subject: staffShape.subject,
    additionalQualifications: staffShape.additionalQualifications, mobile: staffShape.mobile, email: staffShape.email,
    maritalStatus: staffShape.maritalStatus, bloodGroup: staffShape.bloodGroup, homeDistrict: staffShape.homeDistrict,
    nidOrPassport: staffShape.nidOrPassport, presentAddress: staffShape.presentAddress, permanentAddress: staffShape.permanentAddress,
    education: staffShape.education, experience: staffShape.experience,
  })
  .superRefine((v, ctx) => crossChecks({ dateOfBirth: v.dateOfBirth, joiningDate: null }, ctx));
export type RequestInput = z.infer<typeof requestSchema>;

export const parseRequestForm = (fd: FormData) => requestSchema.safeParse(formToObject(fd));

export const eduRowSchemaFor = (level: string) => (level === "NTRCA" ? ntrcaRow : level === "OTHER" ? otherRow : eduRow);
export const expRowSchema = expRow;
