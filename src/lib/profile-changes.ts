export const profileFieldLabels: Record<string, string> = {
  fullNameEnglish: "Full Name (In English)",
  fullNameBangla: "Full Name (In Bangla)",
  designation: "Designation",
  employeeId: "ID No.",
  dateOfJoining: "Date of joining",
  position: "Position",
  department: "Subject/Admin Dept.",
  supervisor: "Supervisor",
  photoUrl: "Employee photo",
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  dateOfBirth: "Date of Birth",
  gender: "Gender",
  bloodGroup: "Blood Group",
  religion: "Religion",
  maritalStatus: "Marital Status",
  permanentAddress: "Permanent Address",
  presentAddress: "Present Address",
  nidPassport: "NID/Passport No.",
  homeDistrict: "Home District",
  mobile: "Mobile Number",
  personalEmail: "E-mail",
  secondary: "Secondary",
  higherSecondary: "Higher Secondary",
  graduation: "Graduation",
  masters: "Master's",
  bed: "BEd",
  med: "MEd",
  ntrca: "NTRCA",
  otherTraining: "Other Degree/Training",
  jobExperiences: "Job Experiences",
};

const educationFieldLabels: Record<string, string> = {
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
};

const experienceFieldLabels: Record<string, string> = {
  instituteOrganization: "Institute/Organization",
  designation: "Designation",
  from: "From",
  to: "To",
};

export const profileEditableFields = Object.keys(profileFieldLabels);
export const profileDateFields = ["dateOfJoining", "dateOfBirth"] as const;
export const profileJsonFields = [
  "secondary",
  "higherSecondary",
  "graduation",
  "masters",
  "bed",
  "med",
  "ntrca",
  "otherTraining",
  "jobExperiences",
] as const;

export type ProfileChange = {
  field: string;
  current: unknown;
  proposed: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function comparable(value: unknown, key: string): unknown {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    if (!value.trim()) return null;
    if (
      ["dateOfJoining", "dateOfBirth", "from", "to"].includes(key) &&
      /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)
    ) {
      return value.slice(0, 10);
    }
    return value;
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (Array.isArray(value)) return value.map((entry) => comparable(entry, key));
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((nestedKey) => [nestedKey, comparable(value[nestedKey], nestedKey)])
        .filter(([, nestedValue]) => nestedValue !== null),
    );
  }
  return value;
}

function equalValues(left: unknown, right: unknown, key: string) {
  return JSON.stringify(comparable(left, key)) === JSON.stringify(comparable(right, key));
}

function sortedKeys(...values: unknown[]) {
  return Array.from(
    new Set(
      values.flatMap((value) => (isRecord(value) ? Object.keys(value) : [])),
    ),
  ).sort();
}

export function buildProfileChanges(
  currentProfile: Record<string, unknown>,
  submittedPayload: unknown,
): ProfileChange[] {
  if (!isRecord(submittedPayload)) return [];
  const changes: ProfileChange[] = [];

  for (const key of profileEditableFields) {
    if (!Object.prototype.hasOwnProperty.call(submittedPayload, key)) continue;
    const current = currentProfile[key];
    const proposed = submittedPayload[key];
    if (equalValues(current, proposed, key)) continue;

    if (
      [
        "secondary",
        "higherSecondary",
        "graduation",
        "masters",
        "bed",
        "med",
        "ntrca",
        "otherTraining",
      ].includes(key) &&
      (isRecord(current) || isRecord(proposed))
    ) {
      const currentObject = isRecord(current) ? current : {};
      const proposedObject = isRecord(proposed) ? proposed : {};
      for (const nestedKey of sortedKeys(currentObject, proposedObject)) {
        if (
          !equalValues(
            currentObject[nestedKey],
            proposedObject[nestedKey],
            nestedKey,
          )
        ) {
          changes.push({
            field: `${profileFieldLabels[key]} — ${educationFieldLabels[nestedKey] ?? nestedKey}`,
            current: currentObject[nestedKey],
            proposed: proposedObject[nestedKey],
          });
        }
      }
      if (!sortedKeys(currentObject, proposedObject).length) {
        changes.push({ field: profileFieldLabels[key], current, proposed });
      }
      continue;
    }

    if (key === "jobExperiences" && (Array.isArray(current) || Array.isArray(proposed))) {
      const oldEntries = Array.isArray(current) ? current : [];
      const newEntries = Array.isArray(proposed) ? proposed : [];
      const count = Math.max(oldEntries.length, newEntries.length);
      for (let index = 0; index < count; index += 1) {
        const oldEntry = oldEntries[index];
        const newEntry = newEntries[index];
        const title = `Job experience ${index + 1}`;
        if (!isRecord(oldEntry) || !isRecord(newEntry)) {
          if (!equalValues(oldEntry, newEntry, key)) {
            changes.push({
              field: title,
              current: oldEntry,
              proposed: newEntry,
            });
          }
          continue;
        }
        for (const nestedKey of sortedKeys(oldEntry, newEntry)) {
          if (!equalValues(oldEntry[nestedKey], newEntry[nestedKey], nestedKey)) {
            changes.push({
              field: `${title} — ${experienceFieldLabels[nestedKey] ?? nestedKey}`,
              current: oldEntry[nestedKey],
              proposed: newEntry[nestedKey],
            });
          }
        }
      }
      continue;
    }

    changes.push({
      field: profileFieldLabels[key],
      current,
      proposed,
    });
  }

  return changes;
}

export function profileValuesEqual(left: unknown, right: unknown, key: string) {
  return equalValues(left, right, key);
}
