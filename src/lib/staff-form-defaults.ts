import type { StaffProfile } from "@/server/staff/queries";
import { EDUCATION_LEVELS } from "./labels";
import { EDU_FIELDS, EXP_FIELDS, EXP_SLOTS, SCALAR_FIELDS } from "./validation/staff";

const ymd = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** Flat map keyed by input name ("education.NTRCA.result") → default string value. */
export function profileToDefaults(p: StaffProfile | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!p) return out;
  const rec = p as unknown as Record<string, unknown>;
  for (const k of SCALAR_FIELDS) {
    const v = rec[k];
    out[k] = v instanceof Date ? ymd(v) : v == null ? "" : String(v);
  }
  for (const lvl of EDUCATION_LEVELS) {
    const row = p.education.find((e) => e.level === lvl) as Record<string, unknown> | undefined;
    for (const f of EDU_FIELDS) out[`education.${lvl}.${f}`] = row?.[f] == null ? "" : String(row[f]);
  }
  for (const s of EXP_SLOTS) {
    const row = p.experience.find((e) => e.slot === Number(s)) as Record<string, unknown> | undefined;
    for (const f of EXP_FIELDS) {
      const v = row?.[f];
      out[`experience.${s}.${f}`] = v instanceof Date ? ymd(v) : v == null ? "" : String(v);
    }
  }
  return out;
}
