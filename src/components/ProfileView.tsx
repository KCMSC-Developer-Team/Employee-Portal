import type { ReactNode } from "react";
import type { StaffProfile } from "@/server/staff/queries";
import { profileCompleteness } from "@/lib/completeness";
import {
  BLOOD_GROUP_LABEL, EDUCATION_LEVEL_LABEL, EMPLOYMENT_STATUS_LABEL, MARITAL_LABEL, fmtDate,
} from "@/lib/labels";

const dash = (v: ReactNode) => (v === null || v === undefined || v === "" ? "—" : v);

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 whitespace-pre-line">{dash(children)}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </section>
  );
}

/** Read-only profile. Deliberately has no Observation content — that has its own Leader-only screens (Stage 5). */
export function ProfileView({ p }: { p: StaffProfile }) {
  const { complete, missing } = profileCompleteness(p);
  const initials = p.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-xl font-semibold text-slate-600" aria-label="No photograph yet">
          {initials}
        </div>
        <div>
          <h1 className="text-xl font-semibold">{p.name}</h1>
          <p className="text-sm text-slate-600">
            ID {p.staffId} · {p.designation?.name ?? "No designation"} · {EMPLOYMENT_STATUS_LABEL[p.employmentStatus]}
          </p>
          <p className={`mt-1 text-xs ${complete ? "text-green-700" : "text-amber-700"}`}>
            {complete ? "Profile complete" : `Incomplete: ${missing.join(", ")}`}
          </p>
        </div>
      </div>

      <Section title="Employment">
        <dl>
          <Row label="Designation">{p.designation?.name}</Row>
          <Row label="Joined as">{p.category?.name}</Row>
          <Row label="Department">{p.department?.name}</Row>
          <Row label="Joining date">{fmtDate(p.joiningDate)}</Row>
          <Row label="Date of birth">{fmtDate(p.dateOfBirth)}</Row>
          <Row label="Academic discipline/subject">{p.subject}</Row>
        </dl>
      </Section>

      <Section title="Educational background">
        {p.education.length === 0 ? (
          <p className="text-sm text-slate-500">No records.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500">
                <tr><th className="py-1 pr-3">Level</th><th className="pr-3">Institution</th><th className="pr-3">Board/University · Subject</th><th className="pr-3">Year</th><th>Result</th></tr>
              </thead>
              <tbody>
                {p.education.map((e) => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">{EDUCATION_LEVEL_LABEL[e.level]}{e.title ? `: ${e.title}` : ""}</td>
                    <td className="pr-3">{dash(e.institution)}</td>
                    <td className="pr-3">{[e.boardOrUniversity, e.subject].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="pr-3">{dash(e.passingYear)}</td>
                    <td>{dash(e.result ? (e.level === "NTRCA" && !e.result.endsWith("%") ? `${e.result}%` : e.result) : null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <dl className="mt-2"><Row label="Additional qualifications">{p.additionalQualifications}</Row></dl>
      </Section>

      <Section title="Previous job experience">
        {p.experience.length === 0 ? (
          <p className="text-sm text-slate-500">No records.</p>
        ) : (
          <ol className="space-y-1 text-sm">
            {p.experience.map((x) => (
              <li key={x.id}>
                <span className="font-medium">{dash(x.organization)}</span> — {dash(x.designation)}
                <span className="text-slate-500"> ({fmtDate(x.startDate)} to {fmtDate(x.endDate)})</span>
              </li>
            ))}
          </ol>
        )}
      </Section>

      <Section title="Personal & contact">
        <dl>
          <Row label="Mobile">{p.mobile}</Row>
          <Row label="Email">{p.email}</Row>
          <Row label="Marital status">{p.maritalStatus ? MARITAL_LABEL[p.maritalStatus] : null}</Row>
          <Row label="Blood group">{p.bloodGroup ? BLOOD_GROUP_LABEL[p.bloodGroup] : null}</Row>
          <Row label="Home district">{p.homeDistrict}</Row>
          <Row label="NID/Passport">{p.nidOrPassport}</Row>
          <Row label="Present address">{p.presentAddress}</Row>
          <Row label="Permanent address">{p.permanentAddress}</Row>
        </dl>
      </Section>
    </div>
  );
}
