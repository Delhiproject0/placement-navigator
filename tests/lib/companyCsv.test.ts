import { describe, expect, it } from "vitest";
import {
  buildCompanyCsvTemplate,
  COMPANY_CSV_COLUMNS,
  IMPORTABLE_CSV_HEADERS,
} from "@/lib/companyCsv";
import { parseCsvObjects, toCsv } from "@/lib/csv";
import type { Company } from "@/types/database";

describe("company CSV columns", () => {
  it("excludes derived columns from the importable set", () => {
    // Phase is computed from the dates. Accepting it back would create a
    // second, conflicting source of truth about where a drive has got to.
    expect(COMPANY_CSV_COLUMNS.some((column) => column.header === "Phase")).toBe(true);
    expect(IMPORTABLE_CSV_HEADERS).not.toContain("Phase");
    expect(IMPORTABLE_CSV_HEADERS[0]).toBe("Company");
  });

  it("has a unique header for every column", () => {
    const headers = COMPANY_CSV_COLUMNS.map((column) => column.header);
    expect(new Set(headers).size).toBe(headers.length);
  });

  it("gives every column an example", () => {
    for (const column of COMPANY_CSV_COLUMNS) {
      expect(column.example.trim(), `${column.header} has no example`).not.toBe("");
    }
  });
});

describe("buildCompanyCsvTemplate", () => {
  it("parses back to exactly the importable headers and one row", () => {
    const parsed = parseCsvObjects(buildCompanyCsvTemplate());

    expect(parsed.headers).toEqual(IMPORTABLE_CSV_HEADERS);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0].Company).toBe("Wavelength Systems");
  });

  it("quotes examples containing commas so the columns do not shift", () => {
    // "Bengaluru, Remote" and "SDE, Hardware" both contain the delimiter; an
    // unquoted template would parse into more fields than it has headers and
    // teach everyone the wrong format.
    const parsed = parseCsvObjects(buildCompanyCsvTemplate());
    expect(parsed.rows[0].Location).toBe("Bengaluru, Remote");
    expect(parsed.rows[0].Roles).toBe("SDE, Hardware");
  });

  it("round-trips an export back through the parser", () => {
    // Export and import share this column list, so a file saved from the site
    // must read back with the same headers the template promises.
    const company = {
      id: "1",
      name: "Northwind Robotics",
      job_location: "Hyderabad",
      offered_ctc: "INR 26,00,000",
      roles: ["Robotics Engineer", "SLAM"],
      cgpa_cutoff: 7.5,
      people_selected: 3,
    } as unknown as Company;

    const parsed = parseCsvObjects(toCsv([company], COMPANY_CSV_COLUMNS));

    expect(parsed.headers).toEqual(COMPANY_CSV_COLUMNS.map((column) => column.header));
    expect(parsed.rows[0].Company).toBe("Northwind Robotics");
    expect(parsed.rows[0].Roles).toBe("Robotics Engineer, SLAM");
  });
});
