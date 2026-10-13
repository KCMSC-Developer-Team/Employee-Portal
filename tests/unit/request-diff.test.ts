import { describe, expect, it } from "vitest";
import { buildItems, type CurrentRecord } from "@/server/requests/diff";
import { parseRequestForm, REQUEST_SCALAR_FIELDS } from "@/lib/validation/staff";
import { sniffImageType } from "@/lib/image-sniff";

const current: CurrentRecord = {
  scalars: Object.fromEntries(REQUEST_SCALAR_FIELDS.map((k) => [k, null])) as CurrentRecord["scalars"],
  education: [{ id: "e1", level: "SECONDARY", title: null, institution: "Old School", boardOrUniversity: null, subject: null, passingYear: 2005, result: "4.5" }],
  experience: [],
};
current.scalars.name = "Test Teacher";
current.scalars.mobile = "01712345678";

function form(over: Record<string, string> = {}) {
  const fd = new FormData();
  fd.set("name", "Test Teacher");
  fd.set("mobile", "01712345678");
  fd.set("education.SECONDARY.institution", "Old School");
  fd.set("education.SECONDARY.passingYear", "2005");
  fd.set("education.SECONDARY.result", "4.5");
  for (const [k, v] of Object.entries(over)) fd.set(k, v);
  return parseRequestForm(fd);
}

describe("change request diff", () => {
  it("produces no items when nothing changed", () => {
    const r = form();
    expect(r.success && buildItems(current, r.data)).toEqual([]);
  });

  it("records only changed fields, with old and new values", () => {
    const r = form({ mobile: "01812345678", homeDistrict: "Dhaka" });
    const items = r.success ? buildItems(current, r.data) : [];
    expect(items.map((i) => i.fieldKey).sort()).toEqual(["homeDistrict", "mobile"]);
    expect(items.find((i) => i.fieldKey === "mobile")).toMatchObject({ oldValue: "01712345678", newValue: "01812345678" });
  });

  it("clearing an education row yields a removal item (newValue null)", () => {
    const r = form({ "education.SECONDARY.institution": "", "education.SECONDARY.passingYear": "", "education.SECONDARY.result": "" });
    const items = r.success ? buildItems(current, r.data) : [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ target: "EDUCATION", recordKey: "SECONDARY", recordId: "e1", newValue: null });
  });

  it("cannot smuggle non-requestable fields (department, status, observation) into items", () => {
    const r = form({ departmentId: "x", employmentStatus: "RESIGNED", observation: "secret", staffId: "HACK" });
    const items = r.success ? buildItems(current, r.data) : [];
    expect(items).toEqual([]);
    expect(r.success && Object.keys(r.data)).not.toContain("observation");
  });
});

describe("image sniffing", () => {
  it("accepts JPEG/PNG/WebP signatures and rejects SVG/HTML/GIF", () => {
    expect(sniffImageType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("jpeg");
    expect(sniffImageType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("png");
    const webp = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
    expect(sniffImageType(webp)).toBe("webp");
    expect(sniffImageType(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a......"))).toBeNull();
  });
});
