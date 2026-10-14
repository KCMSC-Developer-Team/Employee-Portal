import ExcelJS from "exceljs";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;
export const MAX_ROWS = 2000;
export const MAX_COLS = 80;

export class ImportFileError extends Error {}

/** Sum of uncompressed sizes from the zip central directory (cheap zip-bomb guard, before any inflation). */
export function zipUncompressedSize(buf: Uint8Array): number {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65_535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportFileError("Not a valid .xlsx file.");
  const count = v.getUint16(eocd + 10, true);
  let p = v.getUint32(eocd + 16, true);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > buf.length || v.getUint32(p, true) !== 0x02014b50) throw new ImportFileError("Not a valid .xlsx file.");
    total += v.getUint32(p + 24, true);
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true);
  }
  return total;
}

export function assertXlsx(buf: Uint8Array): void {
  if (buf.length === 0) throw new ImportFileError("The file is empty.");
  if (buf.length > MAX_IMPORT_BYTES) throw new ImportFileError("File must be 5 MB or smaller.");
  if (!(buf[0] === 0x50 && buf[1] === 0x4b)) throw new ImportFileError("Upload an Excel .xlsx file.");
  if (zipUncompressedSize(buf) > MAX_UNCOMPRESSED_BYTES) throw new ImportFileError("The workbook is too large when unpacked.");
}

/** Cell → plain string. Dates become YYYY-MM-DD; formulas use their cached result; nothing is evaluated. */
export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if ("result" in v) return cellText((v as { result: ExcelJS.CellValue }).result);
    if ("richText" in v) return (v as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("").trim();
    if ("text" in v) return cellText((v as { text: ExcelJS.CellValue }).text);
  }
  return "";
}

export interface ParsedSheet { headers: string[]; rows: Array<{ rowNumber: number; cells: string[] }> }

/** First worksheet only. Row 1 = headers. Enforces row/column caps. Blank rows are skipped. */
export async function parseWorkbook(buf: Uint8Array, opts?: { headersOnly?: boolean }): Promise<ParsedSheet> {
  assertXlsx(buf);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
  } catch {
    throw new ImportFileError("The workbook could not be read.");
  }
  const ws = wb.worksheets[0];
  if (!ws) throw new ImportFileError("The workbook has no sheets.");
  if (ws.rowCount - 1 > MAX_ROWS) throw new ImportFileError(`At most ${MAX_ROWS} data rows per import.`);

  const head = ws.getRow(1);
  const width = Math.min(ws.columnCount, MAX_COLS + 1);
  if (ws.columnCount > MAX_COLS) throw new ImportFileError(`At most ${MAX_COLS} columns.`);
  const headers: string[] = [];
  for (let c = 1; c <= width; c++) headers.push(cellText(head.getCell(c).value).slice(0, 80));
  if (headers.every((h) => !h)) throw new ImportFileError("Row 1 must contain column headings.");
  const seen = new Set<string>();
  for (const h of headers) {
    if (!h) continue;
    if (seen.has(h)) throw new ImportFileError("Column headings must be unique.");
    seen.add(h);
  }
  if (opts?.headersOnly) return { headers, rows: [] };

  const rows: ParsedSheet["rows"] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cells: string[] = [];
    for (let c = 1; c <= width; c++) cells.push(cellText(row.getCell(c).value).slice(0, 2000));
    if (cells.some((x) => x)) rows.push({ rowNumber: r, cells });
  }
  return { headers, rows };
}
