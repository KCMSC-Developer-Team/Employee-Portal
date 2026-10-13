/** Pure diff: current official record vs. submitted values → change-request items. No I/O, unit-testable. */
import { EDUCATION_LEVELS } from "../../lib/labels";
import { EXP_SLOTS, REQUEST_SCALAR_FIELDS, hasRowContent, type RequestInput } from "../../lib/validation/staff";

export type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

export interface DraftItem {
  target: "STAFF_FIELD" | "EDUCATION" | "EXPERIENCE";
  fieldKey: string;
  recordId: string | null;
  recordKey: string | null; // education level or experience slot
  oldValue: JsonValue;
  newValue: JsonValue;
}

export interface CurrentRecord {
  scalars: Record<(typeof REQUEST_SCALAR_FIELDS)[number], string | null>; // dates as YYYY-MM-DD
  education: Array<{ id: string; level: string; title: string | null; institution: string | null; boardOrUniversity: string | null; subject: string | null; passingYear: number | null; result: string | null }>;
  experience: Array<{ id: string; slot: number; organization: string | null; designation: string | null; startDate: string | null; endDate: string | null }>;
}

type EduRow = { title: string | null; institution: string | null; boardOrUniversity: string | null; subject: string | null; passingYear: number | null; result: string | null };
type ExpRow = { organization: string | null; designation: string | null; startDate: string | null; endDate: string | null };

// Fixed key order so JSON comparison is stable.
export const eduRow = (r: EduRow, level: string): EduRow => ({
  title: level === "OTHER" ? r.title : null, institution: r.institution, boardOrUniversity: r.boardOrUniversity,
  subject: r.subject, passingYear: r.passingYear, result: r.result,
});
export const expRow = (r: ExpRow): ExpRow => ({ organization: r.organization, designation: r.designation, startDate: r.startDate, endDate: r.endDate });

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function buildItems(cur: CurrentRecord, next: RequestInput): DraftItem[] {
  const items: DraftItem[] = [];

  for (const k of REQUEST_SCALAR_FIELDS) {
    const oldV = cur.scalars[k] ?? null;
    const newV = (next[k] as string | null) ?? null;
    if (oldV !== newV) items.push({ target: "STAFF_FIELD", fieldKey: k, recordId: null, recordKey: null, oldValue: oldV, newValue: newV });
  }

  for (const level of EDUCATION_LEVELS) {
    const existing = cur.education.find((e) => e.level === level);
    const oldV = existing ? eduRow(existing, level) : null;
    const submitted = next.education[level];
    const newV = hasRowContent(submitted) ? eduRow(submitted, level) : null;
    if (!same(oldV, newV)) {
      items.push({ target: "EDUCATION", fieldKey: "education", recordId: existing?.id ?? null, recordKey: level, oldValue: oldV, newValue: newV });
    }
  }

  for (const slot of EXP_SLOTS) {
    const existing = cur.experience.find((e) => e.slot === Number(slot));
    const oldV = existing ? expRow(existing) : null;
    const submitted = next.experience[slot];
    const newV = hasRowContent(submitted) ? expRow(submitted) : null;
    if (!same(oldV, newV)) {
      items.push({ target: "EXPERIENCE", fieldKey: "experience", recordId: existing?.id ?? null, recordKey: slot, oldValue: oldV, newValue: newV });
    }
  }
  return items;
}

/** Row values → strings, as the Zod preprocessors expect (they treat non-strings as blank). */
export function asFormValues(row: { [k: string]: JsonValue }): Record<string, string | null> {
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === null || v === undefined ? null : String(v)]));
}

export const jsonEqual = same;
