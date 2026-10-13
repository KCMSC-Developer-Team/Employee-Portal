"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";
import {
  BLOOD_GROUPS, BLOOD_GROUP_LABEL, EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL, MARITAL_LABEL, MARITAL_STATUSES,
} from "@/lib/labels";

export interface StaffFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>; // echo of submitted values (React 19 resets uncontrolled inputs after an action)
  created?: { id: string; staffId: string; name: string; temporaryPassword?: string };
}

interface Ref { id: string; name: string }
interface Props {
  mode: "create" | "edit" | "request"; // request = employee change request (restricted fields + photo)
  action: (prev: StaffFormState, fd: FormData) => Promise<StaffFormState>;
  defaults: Record<string, string>;
  refs: { departments: Ref[]; designations: Ref[]; categories: Ref[] };
  recordId?: string;
  version?: number;
  canCreateAccount?: boolean;
}

// Defined at module level: a component declared inside render would remount (and clear) its inputs every render.
function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
      <legend className="px-1 text-sm font-semibold text-slate-600">{title}</legend>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

const box = "mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm";

export function StaffForm({ mode, action, defaults, refs, recordId, version, canCreateAccount }: Props) {
  const [state, formAction, pending] = useActionState<StaffFormState, FormData>(action, {});
  const errs = state.fieldErrors ?? {};
  const dv = (name: string) => state.values?.[name] ?? defaults[name] ?? "";

  if (state.created) {
    const c = state.created;
    return (
      <div className="space-y-3 rounded-lg border border-green-200 bg-green-50 p-4 text-sm">
        <p className="font-medium">Created {c.name} (ID {c.staffId}).</p>
        {c.temporaryPassword ? (
          <div>
            <p>One-time temporary password — shown only once; give it to the employee securely. They must change it at first login:</p>
            <p className="mt-1 inline-block rounded bg-white px-3 py-1 font-mono text-base select-all">{c.temporaryPassword}</p>
          </div>
        ) : (
          <p>No login account was created.</p>
        )}
        <p><Link className="underline" href={`/staff/${c.id}`}>Open record</Link></p>
      </div>
    );
  }

  const field = (name: string, label: string, opts: { type?: string; max?: number; wide?: boolean; readOnly?: boolean } = {}): ReactNode => (
    <label className={`block text-sm ${opts.wide ? "sm:col-span-2" : ""}`} key={name}>
      {label}
      <input name={name} type={opts.type ?? "text"} defaultValue={dv(name)} maxLength={opts.max} readOnly={opts.readOnly}
        className={`${box} ${opts.readOnly ? "bg-slate-100" : ""} ${errs[name] ? "border-red-500" : ""}`} />
      {errs[name] && <span className="text-xs text-red-600">{errs[name]}</span>}
    </label>
  );

  const select = (name: string, label: string, options: Array<{ value: string; label: string }>) => (
    <label className="block text-sm" key={name}>
      {label}
      <select name={name} defaultValue={dv(name)} className={`${box} ${errs[name] ? "border-red-500" : ""}`}>
        <option value="">— not set —</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {errs[name] && <span className="text-xs text-red-600">{errs[name]}</span>}
    </label>
  );

  const asOpts = (r: Ref[]) => r.map((x) => ({ value: x.id, label: x.name }));

  return (
    <form action={formAction} className="space-y-4">
      {mode === "edit" && <input type="hidden" name="id" value={recordId} />}
      {mode === "edit" && <input type="hidden" name="version" value={version} />}

      {state.error && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{state.error}</p>}

      <Card title="Identity & employment">
        {field("name", "1. Name")}
        {field("staffId", "2. ID No.", { readOnly: mode !== "create", max: 32 })}
        {mode !== "request" && select("designationId", "3. Designation", asOpts(refs.designations))}
        {mode !== "request" && select("categoryId", "4. Joined as", asOpts(refs.categories))}
        {mode !== "request" && select("departmentId", "Department", asOpts(refs.departments))}
        {mode !== "request" && field("joiningDate", "5. Joining date", { type: "date" })}
        {field("dateOfBirth", "6. Date of birth", { type: "date" })}
        {field("subject", "7. Academic discipline/subject", { wide: true })}
      </Card>

      <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-600">8. Educational background</legend>
        <div className="space-y-4">
          {EDUCATION_LEVELS.map((lvl) => (
            <div key={lvl} className="grid gap-2 sm:grid-cols-5">
              <p className="self-end pb-2 text-sm font-medium sm:col-span-5">{EDUCATION_LEVEL_LABEL[lvl]}</p>
              {lvl === "OTHER" && <div className="sm:col-span-5">{field("education.OTHER.title", "Name of degree/training")}</div>}
              {field(`education.${lvl}.institution`, "Institution")}
              {field(`education.${lvl}.boardOrUniversity`, "Board/University")}
              {field(`education.${lvl}.subject`, "Subject")}
              {field(`education.${lvl}.passingYear`, "Year of passing", { max: 4 })}
              {field(`education.${lvl}.result`, lvl === "NTRCA" ? "Result (%)" : "Result/Marks", { max: 40 })}
            </div>
          ))}
        </div>
      </fieldset>

      <Card title="9. Additional qualification (if any)">
        <label className="block text-sm sm:col-span-2">
          <textarea name="additionalQualifications" defaultValue={dv("additionalQualifications")} rows={3} maxLength={1000} className={box} />
          {errs.additionalQualifications && <span className="text-xs text-red-600">{errs.additionalQualifications}</span>}
        </label>
      </Card>

      <fieldset className="rounded-lg border border-slate-200 bg-white p-4">
        <legend className="px-1 text-sm font-semibold text-slate-600">10–12. Previous job experience</legend>
        <div className="space-y-4">
          {["1", "2", "3"].map((s) => (
            <div key={s} className="grid gap-2 sm:grid-cols-4">
              {field(`experience.${s}.organization`, `Experience-${s}: Organization`)}
              {field(`experience.${s}.designation`, "Designation")}
              {field(`experience.${s}.startDate`, "From", { type: "date" })}
              {field(`experience.${s}.endDate`, "To", { type: "date" })}
            </div>
          ))}
        </div>
      </fieldset>

      <Card title="Contact & personal">
        {field("mobile", "13. Mobile number", { max: 20 })}
        {field("email", "14. E-mail", { type: "email", max: 254 })}
        {select("maritalStatus", "15. Marital status", MARITAL_STATUSES.map((v) => ({ value: v, label: MARITAL_LABEL[v]! })))}
        {select("bloodGroup", "16. Blood group", BLOOD_GROUPS.map((v) => ({ value: v, label: BLOOD_GROUP_LABEL[v]! })))}
        {field("homeDistrict", "17. Home district")}
        {field("nidOrPassport", "18. NID/Passport", { max: 20 })}
        {field("presentAddress", "19. Present address", { wide: true })}
        {field("permanentAddress", "20. Permanent address", { wide: true })}
      </Card>

      {mode === "request" && (
        <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-600">Photograph &amp; note</legend>
          <label className="block text-sm">New photograph (JPEG/PNG/WebP, max 3 MB)
            <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" className="mt-1 block text-sm" />
            {errs.photo && <span className="text-xs text-red-600">{errs.photo}</span>}
          </label>
          <label className="block text-sm">Note to reviewer (optional)
            <textarea name="note" rows={2} maxLength={500} defaultValue={dv("note")} className={box} />
          </label>
          <p className="text-xs text-slate-500">Your changes will be reviewed by an administrator. Your official record does not change until approved.</p>
        </fieldset>
      )}

      {mode === "create" && canCreateAccount && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="createAccount" defaultChecked /> Create a login account with a random one-time password
        </label>
      )}

      <button disabled={pending} className="rounded bg-slate-900 px-5 py-2 text-white disabled:opacity-60">
        {pending ? "Saving…" : mode === "create" ? "Create staff record" : mode === "request" ? "Submit for approval" : "Save changes"}
      </button>
    </form>
  );
}
