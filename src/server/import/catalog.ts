import { EDUCATION_LEVELS, EDUCATION_LEVEL_LABEL } from "@/lib/labels";

/**
 * The ONLY columns a staff import can read. Anything not mapped to one of these is ignored — it is never
 * extracted from the workbook. In particular there is no password column and nothing confidential.
 */
export interface ImportTarget {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
}

const EDU_FIELDS: Array<[string, string, string[]]> = [
  [
    "institution",
    "Institution",
    ["institution", "school", "college", "institute"],
  ],
  [
    "boardOrUniversity",
    "Board/University",
    ["board", "university", "board university"],
  ],
  ["subject", "Subject/Group", ["subject", "group", "major"]],
  ["passingYear", "Passing year", ["year", "passing year", "pass year"]],
  ["result", "Result", ["result", "gpa", "cgpa", "grade", "percentage"]],
];

export const TARGETS: ImportTarget[] = [
  {
    key: "staffId",
    label: "Staff ID",
    required: true,
    aliases: ["staff id", "id no", "id", "employee id", "staff no"],
  },
  {
    key: "name",
    label: "Name",
    required: true,
    aliases: ["name", "full name", "employee name", "name of employee"],
  },
  {
    key: "designation",
    label: "Designation",
    aliases: ["designation", "post", "position"],
  },
  {
    key: "category",
    label: "Joined as",
    aliases: ["joined as", "category", "employment type", "type"],
  },
  {
    key: "department",
    label: "Department",
    aliases: ["department", "dept", "section"],
  },
  {
    key: "joiningDate",
    label: "Joining date",
    aliases: ["joining date", "date of joining", "joined on", "doj"],
  },
  {
    key: "dateOfBirth",
    label: "Date of birth",
    aliases: ["date of birth", "dob", "birth date", "birthday"],
  },
  {
    key: "subject",
    label: "Subject",
    aliases: ["subject", "discipline", "academic discipline"],
  },
  {
    key: "additionalQualifications",
    label: "Additional qualifications",
    aliases: ["additional qualifications", "other qualifications"],
  },
  {
    key: "mobile",
    label: "Mobile",
    aliases: ["mobile", "mobile no", "phone", "contact", "cell"],
  },
  {
    key: "email",
    label: "Email",
    aliases: ["email", "e-mail", "email address"],
  },
  {
    key: "maritalStatus",
    label: "Marital status",
    aliases: ["marital status", "marital"],
  },
  {
    key: "bloodGroup",
    label: "Blood group",
    aliases: ["blood group", "blood"],
  },
  {
    key: "homeDistrict",
    label: "Home district",
    aliases: ["home district", "district"],
  },
  {
    key: "nidOrPassport",
    label: "NID/Passport",
    aliases: ["nid", "nid passport", "nid no", "passport", "nid/passport"],
  },
  {
    key: "presentAddress",
    label: "Present address",
    aliases: ["present address"],
  },
  {
    key: "permanentAddress",
    label: "Permanent address",
    aliases: ["permanent address"],
  },

  ...EDUCATION_LEVELS.flatMap((lvl) => {
    // Some TypeScript configurations treat indexed label lookups as possibly undefined.
    // Fall back to the level key if a label is missing.
    const levelLabel = EDUCATION_LEVEL_LABEL[lvl] ?? String(lvl);
    const normalizedLevelLabel = levelLabel.toLowerCase();

    return EDU_FIELDS.map(([field, fieldLabel, aliases]) => ({
      key: `edu.${lvl}.${field}`,
      label: `${levelLabel} – ${fieldLabel}`,
      aliases: aliases.map((alias) => `${normalizedLevelLabel} ${alias}`),
    }));
  }),

  {
    key: "edu.OTHER.title",
    label: "Other degree/training – Name",
    aliases: [
      "other degree training",
      "other degree",
      "training",
      "other degree training name",
    ],
  },

  ...["1", "2", "3"].flatMap((number) =>
    [
      [
        "organization",
        "Organization",
        ["organization", "employer", "institution"],
      ],
      ["designation", "Designation", ["designation", "post"]],
      ["startDate", "From", ["from", "start", "start date"]],
      ["endDate", "To", ["to", "end", "end date"]],
    ].map(([field, label, aliases]) => ({
      key: `exp.${number}.${field}`,
      label: `Experience ${number} – ${label}`,
      aliases: (aliases as string[]).map(
        (alias) => `experience ${number} ${alias}`,
      ),
    })),
  ),
];

export const TARGET_KEYS = new Set(TARGETS.map((target) => target.key));

export const REQUIRED_KEYS = TARGETS.filter((target) => target.required).map(
  (target) => target.key,
);

export const normHeader = (header: string) =>
  header
    .toLowerCase()
    .replace(/[^a-z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Auto-suggestion by exact normalized alias match.
 * Each target can be used at most once. Users confirm or adjust the mapping.
 */
export function suggestMapping(headers: string[]): Record<string, string> {
  const used = new Set<string>();
  const output: Record<string, string> = {};

  for (const header of headers) {
    const normalizedHeader = normHeader(header);

    const target = TARGETS.find(
      (item) =>
        !used.has(item.key) &&
        (normHeader(item.label) === normalizedHeader ||
          item.aliases.includes(normalizedHeader)),
    );

    if (target) {
      output[header] = target.key;
      used.add(target.key);
    } else {
      output[header] = "";
    }
  }

  return output;
}

export function validateMapping(
  mapping: Record<string, string>,
): string | null {
  const targets = Object.values(mapping).filter(Boolean);

  if (targets.some((target) => !TARGET_KEYS.has(target))) {
    return "Unknown target column.";
  }

  if (new Set(targets).size !== targets.length) {
    return "Each field can be mapped from only one column.";
  }

  for (const key of REQUIRED_KEYS) {
    if (!targets.includes(key)) {
      const targetLabel =
        TARGETS.find((target) => target.key === key)?.label ?? key;

      return `Map a column to "${targetLabel}".`;
    }
  }

  return null;
}
