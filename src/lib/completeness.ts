/** Profile completeness — shared by the profile page and (Stage 6) dashboard counts. Pure function. */

export interface CompletenessInput {
  name: string | null;
  designationId: string | null;
  categoryId: string | null;
  departmentId: string | null;
  joiningDate: Date | null;
  dateOfBirth: Date | null;
  subject: string | null;
  mobile: string | null;
  email: string | null;
  maritalStatus: string | null;
  bloodGroup: string | null;
  homeDistrict: string | null;
  nidOrPassport: string | null;
  presentAddress: string | null;
  permanentAddress: string | null;
  photoFileId: string | null;
  education: Array<{ level: string; institution: string | null; passingYear: number | null }>;
}

export function profileCompleteness(p: CompletenessInput): { complete: boolean; missing: string[] } {
  const missing: string[] = [];
  const need = (ok: unknown, label: string) => { if (!ok) missing.push(label); };

  need(p.name, "Name");
  need(p.designationId, "Designation");
  need(p.categoryId, "Joined as");
  need(p.departmentId, "Department");
  need(p.joiningDate, "Joining date");
  need(p.dateOfBirth, "Date of birth");
  need(p.subject, "Academic discipline/subject");
  need(p.mobile, "Mobile number");
  need(p.email, "Email");
  need(p.maritalStatus, "Marital status");
  need(p.bloodGroup, "Blood group");
  need(p.homeDistrict, "Home district");
  need(p.nidOrPassport, "NID/Passport");
  need(p.presentAddress, "Present address");
  need(p.permanentAddress, "Permanent address");
  need(p.photoFileId, "Photograph");
  const ssc = p.education.find((e) => e.level === "SECONDARY");
  need(ssc?.institution && ssc.passingYear, "Secondary education");

  return { complete: missing.length === 0, missing };
}
