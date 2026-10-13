// Display labels. Plain string maps (no @prisma/client import) so client components can use them.

export const EDUCATION_LEVELS = ["SECONDARY", "HIGHER_SECONDARY", "GRADUATION", "MASTERS", "BED_MED", "NTRCA", "OTHER"] as const;
export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED", "OTHER"] as const;
export const BLOOD_GROUPS = ["A_POS", "A_NEG", "B_POS", "B_NEG", "AB_POS", "AB_NEG", "O_POS", "O_NEG"] as const;
export const EMPLOYMENT_STATUSES = ["ACTIVE", "ON_LEAVE", "SUSPENDED", "RESIGNED", "RETIRED", "TERMINATED", "CONTRACT_ENDED"] as const;

export const EDUCATION_LEVEL_LABEL: Record<string, string> = {
  SECONDARY: "Secondary",
  HIGHER_SECONDARY: "Higher Secondary",
  GRADUATION: "Graduation",
  MASTERS: "Masters",
  BED_MED: "BEd/MEd",
  NTRCA: "NTRCA",
  OTHER: "Other Degree/Training",
};

export const MARITAL_LABEL: Record<string, string> = {
  SINGLE: "Single", MARRIED: "Married", DIVORCED: "Divorced", WIDOWED: "Widowed", OTHER: "Other",
};

export const BLOOD_GROUP_LABEL: Record<string, string> = {
  A_POS: "A+", A_NEG: "A−", B_POS: "B+", B_NEG: "B−", AB_POS: "AB+", AB_NEG: "AB−", O_POS: "O+", O_NEG: "O−",
};

export const EMPLOYMENT_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active", ON_LEAVE: "On leave", SUSPENDED: "Suspended", RESIGNED: "Resigned",
  RETIRED: "Retired", TERMINATED: "Terminated", CONTRACT_ENDED: "Contract ended",
};

export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "—");
