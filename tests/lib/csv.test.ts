import { describe, expect, it } from "vitest";
import { parseCsv, parseCsvObjects, toCsv } from "@/lib/csv";

interface Row {
  name: string;
  location: string | null;
  ctc: string | null;
}

const COLUMNS = [
  { header: "Company", value: (row: Row) => row.name },
  { header: "Location", value: (row: Row) => row.location },
  { header: "CTC", value: (row: Row) => row.ctc },
];

describe("toCsv", () => {
  it("writes a header row and CRLF line endings", () => {
    const csv = toCsv([{ name: "Acme", location: "Pune", ctc: "20 LPA" }], COLUMNS);
    expect(csv).toBe("Company,Location,CTC\r\nAcme,Pune,20 LPA");
  });

  it("quotes only the fields that need it", () => {
    const csv = toCsv(
      [{ name: "Acme, Inc", location: "Pune", ctc: null }],
      COLUMNS,
    );
    // A comma inside a value must not become a column boundary - this is the
    // failure that silently shifts every later column in the row.
    expect(csv).toBe('Company,Location,CTC\r\n"Acme, Inc",Pune,');
  });

  it("doubles embedded quotes", () => {
    const csv = toCsv([{ name: 'The "Big" Co', location: null, ctc: null }], COLUMNS);
    expect(csv).toContain('"The ""Big"" Co"');
  });

  it("survives a newline inside a value", () => {
    const csv = toCsv([{ name: "Line one\nLine two", location: null, ctc: null }], COLUMNS);
    expect(csv).toContain('"Line one\nLine two"');
    // And it must survive the round trip rather than becoming two rows.
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[1][0]).toBe("Line one\nLine two");
  });

  it("renders null and undefined as empty, not as the strings", () => {
    const csv = toCsv([{ name: "Acme", location: null, ctc: undefined as unknown as null }], COLUMNS);
    expect(csv).toBe("Company,Location,CTC\r\nAcme,,");
    expect(csv).not.toContain("null");
    expect(csv).not.toContain("undefined");
  });

  it("neutralises spreadsheet formula injection", () => {
    // Excel, Sheets and LibreOffice execute a cell starting with = + - or @.
    // An exported company name is attacker-controlled text.
    for (const hostile of ["=1+1", "+1", "-1", "@SUM(A1)", "=cmd|' /c calc'!A0"]) {
      const csv = toCsv([{ name: hostile, location: null, ctc: null }], COLUMNS);
      const cell = csv.split("\r\n")[1].split(",")[0];
      expect(cell.startsWith("'"), `${hostile} was not neutralised`).toBe(true);
    }
  });

  it("still writes a header for an empty set", () => {
    expect(toCsv([], COLUMNS)).toBe("Company,Location,CTC");
  });
});

describe("parseCsv", () => {
  it("reads quoted fields containing commas", () => {
    const rows = parseCsv('name,location\n"Acme, Inc","Pune, Maharashtra"');
    expect(rows[1]).toEqual(["Acme, Inc", "Pune, Maharashtra"]);
  });

  it("reads doubled quotes back as one", () => {
    expect(parseCsv('a\n"say ""hi"""')[1][0]).toBe('say "hi"');
  });

  it("treats CRLF as a single row terminator", () => {
    const rows = parseCsv("a,b\r\n1,2\r\n3,4");
    expect(rows).toHaveLength(3);
    expect(rows[2]).toEqual(["3", "4"]);
  });

  it("handles a file with no trailing newline, and one with", () => {
    expect(parseCsv("a,b\n1,2")).toHaveLength(2);
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
  });

  it("strips a UTF-8 BOM so the first header is not corrupted", () => {
    // Excel writes one; without stripping it the first column key becomes
    // "\uFEFFCompany" and never matches anything.
    const rows = parseCsv("\uFEFFCompany,Location\nAcme,Pune");
    expect(rows[0][0]).toBe("Company");
  });

  it("keeps empty fields rather than collapsing them", () => {
    expect(parseCsv("a,b,c\n1,,3")[1]).toEqual(["1", "", "3"]);
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n")).toEqual([]);
  });
});

describe("parseCsvObjects", () => {
  it("keys rows by trimmed header", () => {
    const { headers, rows } = parseCsvObjects(" Company , Location \nAcme,Pune");
    expect(headers).toEqual(["Company", "Location"]);
    expect(rows[0]).toEqual({ Company: "Acme", Location: "Pune" });
  });

  it("fills missing trailing cells with empty strings", () => {
    // A short row must not produce undefined, which would read as "missing
    // column" rather than "blank value" downstream.
    const { rows } = parseCsvObjects("a,b,c\n1,2");
    expect(rows[0]).toEqual({ a: "1", b: "2", c: "" });
  });

  it("round-trips through toCsv", () => {
    const source: Row[] = [
      { name: "Acme, Inc", location: 'The "Big" Office', ctc: "INR 34,05,000" },
      { name: "Beta", location: null, ctc: null },
    ];
    const { rows } = parseCsvObjects(toCsv(source, COLUMNS));
    expect(rows[0]).toEqual({
      Company: "Acme, Inc",
      Location: 'The "Big" Office',
      CTC: "INR 34,05,000",
    });
    expect(rows[1]).toEqual({ Company: "Beta", Location: "", CTC: "" });
  });
});
