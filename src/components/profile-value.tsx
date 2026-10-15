import React, { type ReactNode } from "react";

const nestedLabels: Record<string, string> = {
  institution: "Institution",
  location: "Location (District)",
  boardUniversity: "Board/University",
  yearOfPassing: "Year of passing",
  group: "Group",
  result: "Result",
  institutionUniversity: "Institution/University",
  privatePublic: "Private/Public",
  subject: "Subject",
  degreeAttained: "Degree attained",
  schoolCollege: "School/College",
  description: "Description",
  instituteOrganization: "Institute/Organization",
  designation: "Designation",
  from: "From",
  to: "To",
};

function labelFor(key: string) {
  return (
    nestedLabels[key] ||
    key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase())
  );
}

function dateValue(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { timeZone: "UTC" });
}

function renderValue(value: unknown, key?: string): ReactNode {
  if (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return <span className="text-slate-400">Not provided</span>;
  }
  if (value instanceof Date) return dateValue(value) ?? String(value);
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) {
      return dateValue(value) ?? value;
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return <span className="text-slate-400">Not provided</span>;
    return (
      <ol className="space-y-2">
        {value.map((entry, index) => (
          <li key={index} className="rounded-lg border border-slate-100 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-slate-500">
              Entry {index + 1}
            </div>
            {renderValue(entry)}
          </li>
        ))}
      </ol>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, nested]) => nested !== undefined,
    );
    if (!entries.length) return <span className="text-slate-400">Not provided</span>;
    return (
      <dl className="space-y-2">
        {entries.map(([nestedKey, nestedValue]) => (
          <div key={nestedKey} className="grid gap-1 sm:grid-cols-[minmax(8rem,.6fr)_1fr]">
            <dt className="text-xs font-medium text-slate-500">
              {labelFor(nestedKey)}
            </dt>
            <dd className="min-w-0 break-words text-sm text-slate-800">
              {renderValue(nestedValue, nestedKey)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="text-slate-400">Not provided</span>;
}

export function ProfileValue({ value }: { value: unknown }) {
  return <>{renderValue(value)}</>;
}
