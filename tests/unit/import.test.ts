import { describe, expect, it } from "vitest";
import { suggestMapping, validateMapping } from "@/server/import/catalog";
import { csvCell, normalizeRow, toBloodGroup, toIsoDate, toMobile, type RefLookup } from "@/server/import/normalize";
import { zipUncompressedSize, assertXlsx } from "@/server/import/xlsx";

const refs: RefLookup = { designation: new Map([["assistant teacher", "d1"]]), category: new Map(), department: new Map([["science", "p1"]]) };

describe("column mapping", () => {
  it("auto-suggests known headings and never maps a password column", () => {
    const m = suggestMapping(["ID No", "Name", "Password", "Observation", "Date of Joining"]);
    expect(m["ID No"]).toBe("staffId");
    expect(m["Name"]).toBe("name");
    expect(m["Date of Joining"]).toBe("joiningDate");
    expect(m["Password"]).toBe("");
    expect(m["Observation"]).toBe("");
  });
  it("requires staff ID and name, and rejects duplicates / unknown targets", () => {
    expect(validateMapping({ a: "name" })).toMatch(/Staff ID/);
    expect(validateMapping({ a: "staffId", b: "name", c: "name" })).toMatch(/only one/);
    expect(validateMapping({ a: "staffId", b: "name", c: "password" })).toMatch(/Unknown/);
    expect(validateMapping({ a: "staffId", b: "name" })).toBeNull();
  });
});

describe("row normalisation", () => {
  it("converts Bangladeshi conventions", () => {
    expect(toIsoDate("05/03/1990")).toBe("1990-03-05");
    expect(toMobile("1712345678")).toBe("01712345678");
    expect(toBloodGroup("a+")).toBe("A_POS");
    expect(toBloodGroup("O Negative")).toBe("O_NEG");
  });
  it("accepts a good row and resolves references", () => {
    const r = normalizeRow({ staffId: "T-100", name: "Rahim Uddin", designation: "Assistant Teacher", department: "Science", mobile: "1712345678", "edu.SECONDARY.passingYear": "2005" }, refs);
    expect(r.issues).toEqual([]);
    expect(r.data?.designationId).toBe("d1");
    expect(r.data?.education.SECONDARY.passingYear).toBe(2005);
  });
  it("reports unknown references and bad values without echoing them", () => {
    const r = normalizeRow({ staffId: "T-101", name: "Karim", department: "Zzz-secret", email: "not-an-email-SECRETVALUE", bloodGroup: "ZZZ-SECRETVALUE" }, refs);
    expect(r.data).toBeNull();
    expect(r.issues.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(r.issues)).not.toMatch(/SECRETVALUE|Zzz-secret/);
  });
});

describe("csv + file guards", () => {
  it("neutralises spreadsheet formulas and quotes specials", () => {
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell(null)).toBe("");
  });
  it("rejects non-xlsx bytes and truncated zips", () => {
    expect(() => assertXlsx(new Uint8Array([1, 2, 3, 4]))).toThrow();
    expect(() => zipUncompressedSize(new Uint8Array(64))).toThrow();
  });
});
