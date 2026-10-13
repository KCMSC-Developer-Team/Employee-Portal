import { BLOOD_GROUP_LABEL, EDUCATION_LEVEL_LABEL, MARITAL_LABEL } from "@/lib/labels";

export interface DiffItem {
  id: string;
  target: string;
  fieldKey: string;
  recordKey: string | null;
  oldValue: unknown;
  newValue: unknown;
  photoFileId: string | null;
}

const FIELD_LABEL: Record<string, string> = {
  name: "Name", dateOfBirth: "Date of birth", subject: "Academic discipline/subject", additionalQualifications: "Additional qualifications",
  mobile: "Mobile", email: "Email", maritalStatus: "Marital status", bloodGroup: "Blood group", homeDistrict: "Home district",
  nidOrPassport: "NID/Passport", presentAddress: "Present address", permanentAddress: "Permanent address", photo: "Photograph",
};

function label(i: DiffItem) {
  if (i.target === "EDUCATION") return `Education — ${EDUCATION_LEVEL_LABEL[i.recordKey ?? ""] ?? i.recordKey}`;
  if (i.target === "EXPERIENCE") return `Experience ${i.recordKey}`;
  return FIELD_LABEL[i.fieldKey] ?? i.fieldKey;
}

function fmt(i: DiffItem, v: unknown): string {
  if (v === null || v === undefined) return i.target === "EDUCATION" || i.target === "EXPERIENCE" ? "(none)" : "—";
  if (typeof v === "object") {
    const r = v as Record<string, unknown>;
    const parts = i.target === "EDUCATION"
      ? [r.title, r.institution, r.boardOrUniversity, r.subject, r.passingYear, r.result]
      : [r.organization, r.designation, r.startDate || r.endDate ? `${r.startDate ?? "?"} to ${r.endDate ?? "?"}` : null];
    return parts.filter((x) => x !== null && x !== undefined && x !== "").join(" · ") || "(empty)";
  }
  const s = String(v);
  if (i.fieldKey === "maritalStatus") return MARITAL_LABEL[s] ?? s;
  if (i.fieldKey === "bloodGroup") return BLOOD_GROUP_LABEL[s] ?? s;
  return s;
}

function Photo({ id }: { id: unknown }) {
  if (typeof id !== "string") return <span className="text-slate-400">none</span>;
  // eslint-disable-next-line @next/next/no-img-element -- private authenticated route
  return <img src={`/api/files/${id}`} alt="" className="h-16 w-16 rounded object-cover" />;
}

/** Old → proposed values. Shown only to the owner and to reviewers with scope. */
export function ChangeDiff({ items }: { items: DiffItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-slate-500"><tr><th className="py-1 pr-3">Field</th><th className="pr-3">Current</th><th>Proposed</th></tr></thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t border-slate-100 align-top">
              <td className="py-1.5 pr-3 font-medium">{label(i)}</td>
              {i.target === "PHOTO" ? (
                <>
                  <td className="pr-3"><Photo id={(i.oldValue as { fileId?: string } | null)?.fileId} /></td>
                  <td><Photo id={i.photoFileId} /></td>
                </>
              ) : (
                <>
                  <td className="pr-3 whitespace-pre-line text-slate-600">{fmt(i, i.oldValue)}</td>
                  <td className="whitespace-pre-line">{fmt(i, i.newValue)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
