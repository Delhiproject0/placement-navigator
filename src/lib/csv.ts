/**
 * CSV reading and writing (RFC 4180).
 *
 * Hand-rolled rather than pulled in as a dependency: the whole surface is one
 * serializer and one parser, and the two behaviours that actually matter here -
 * formula injection on write, and embedded newlines on read - are exactly the
 * ones a naive `split(",")` gets wrong.
 */

/**
 * Excel, Sheets and LibreOffice evaluate a cell beginning with =, +, - or @ as
 * a formula. A company named "=cmd|' /c calc'!A0" in an exported file becomes
 * code execution on the machine that opens it. Prefixing with an apostrophe
 * forces it back to text, and the apostrophe is not displayed.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeField(value: unknown): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;

  // Quote only when required, so the common case stays readable.
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

export function toCsv<T>(rows: T[], columns: Array<CsvColumn<T>>): string {
  const lines = [columns.map((column) => escapeField(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(column.value(row))).join(","));
  }
  // CRLF is what the spec says and what Excel is happiest with.
  return lines.join("\r\n");
}

/**
 * Parses CSV text into rows of raw strings, including the header row.
 *
 * Handles quoted fields containing commas, quotes and newlines - splitting on
 * commas would tear a field like "Bengaluru, Hyderabad" into two columns and
 * silently shift every value after it.
 */
export function parseCsv(text: string): string[][] {
  // Strip a UTF-8 BOM, which Excel writes and which would otherwise become part
  // of the first header name.
  const input = text.replace(/^\uFEFF/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === ",") {
      endField();
      index += 1;
      continue;
    }
    if (char === "\r" || char === "\n") {
      endRow();
      // CRLF is one row terminator, not two.
      if (char === "\r" && input[index + 1] === "\n") index += 2;
      else index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  // A file not ending in a newline still has a final row.
  if (field !== "" || row.length > 0) endRow();

  // Drop a trailing blank row produced by a file that does end in a newline.
  return rows.filter((entry) => entry.length > 1 || entry[0] !== "");
}

/** Rows keyed by header name, with headers normalised for matching. */
export function parseCsvObjects(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const table = parseCsv(text);
  if (table.length === 0) return { headers: [], rows: [] };

  const headers = table[0].map((header) => header.trim());
  const rows = table.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = (cells[index] ?? "").trim();
    });
    return record;
  });

  return { headers, rows };
}

/** Triggers a download without a server round trip. */
export function downloadCsv(filename: string, csv: string): void {
  // The BOM is what makes Excel read the file as UTF-8 rather than as the
  // local codepage, which otherwise mangles any non-ASCII company name.
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
