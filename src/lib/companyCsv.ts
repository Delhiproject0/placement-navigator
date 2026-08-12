/**
 * The company CSV shape, defined once.
 *
 * Export writes these headers, the downloadable template offers these headers,
 * the dialog lists these headers, and the importer accepts them. Keeping three
 * hand-maintained copies of a column list in sync is exactly the sort of thing
 * that quietly stops being true, and then an exported file no longer imports.
 *
 * `header` must stay in the importer's alias table in
 * `supabase/functions/placements/routes/importer.ts`.
 */

import type { Company } from "@/types/database";
import { phaseMeta, resolvePhase } from "@/lib/phase";
import { formatInISTHuman } from "@/lib/utils";

export interface CompanyCsvColumn {
  header: string;
  /** How the value is written on export. */
  value: (company: Company) => unknown;
  /** A realistic value for the template, so the expected format is obvious. */
  example: string;
  /** False for columns the importer ignores - derived, not stored. */
  importable?: boolean;
}

export const COMPANY_CSV_COLUMNS: CompanyCsvColumn[] = [
  { header: "Company", value: (c) => c.name, example: "Wavelength Systems" },
  {
    header: "Phase",
    // Derived from the dates, so it is written for the reader and ignored on
    // the way back in - a phase column in an import would be a second, and
    // conflicting, source of truth about where a drive has got to.
    value: (c) => phaseMeta(resolvePhase(c)).label,
    example: "Registration open",
    importable: false,
  },
  { header: "Location", value: (c) => c.job_location, example: "Bengaluru, Remote" },
  { header: "CTC", value: (c) => c.offered_ctc, example: "INR 34,05,000" },
  {
    header: "CTC breakdown",
    value: (c) => c.ctc_distribution,
    example: "Base 24L, Bonus 4L, ESOP 6L",
  },
  { header: "CGPA", value: (c) => c.cgpa_cutoff, example: "7.00" },
  { header: "Roles", value: (c) => c.roles?.join(", "), example: "SDE, Hardware" },
  { header: "Selected", value: (c) => c.people_selected, example: "4" },
  {
    header: "Deadline",
    value: (c) => formatInISTHuman(c.registration_deadline),
    example: "2026-09-01 17:00",
  },
  { header: "PPT", value: (c) => formatInISTHuman(c.ppt_datetime), example: "2026-09-04 10:00" },
  { header: "OA", value: (c) => formatInISTHuman(c.oa_datetime), example: "2026-09-10 09:00" },
  {
    header: "Interview",
    value: (c) => formatInISTHuman(c.interview_datetime),
    example: "2026-09-18 09:00",
  },
  { header: "Website", value: (c) => c.website_url, example: "https://example.com" },
  { header: "Form", value: (c) => c.external_form, example: "https://forms.gle/abc123" },
  { header: "Bond", value: (c) => c.bond_details, example: "1 year, INR 2,00,000" },
  {
    header: "Eligibility",
    value: (c) => c.eligibility_criteria,
    example: "CSE and ECE, no active backlogs",
  },
  {
    header: "Description",
    value: (c) => c.description,
    example: "Embedded and signal processing.",
  },
];

/** Columns the importer will actually read back. */
export const IMPORTABLE_CSV_HEADERS = COMPANY_CSV_COLUMNS.filter(
  (column) => column.importable !== false,
).map((column) => column.header);

/**
 * A blank sheet with one filled example row.
 *
 * The example is there because the headers alone do not answer the questions
 * people actually have - what a date should look like, whether roles are
 * comma-separated, whether CTC wants a number or the raw string.
 */
export function buildCompanyCsvTemplate(): string {
  const columns = COMPANY_CSV_COLUMNS.filter((column) => column.importable !== false);
  const escape = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

  return [
    columns.map((column) => escape(column.header)).join(","),
    columns.map((column) => escape(column.example)).join(","),
  ].join("\r\n");
}
