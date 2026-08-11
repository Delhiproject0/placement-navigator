/**
 * Bulk company import.
 *
 * Rows arrive already parsed by the browser (the CSV grammar is handled there)
 * and are validated here with the *same* `pickWritable` the single-company
 * routes use. Sharing that is the point: an importer with its own looser
 * checks becomes a way to write values the form would reject.
 */

import { db } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";
import { pickWritable } from "./companies.ts";

/** Accepted spellings for each column, lowercased and stripped of punctuation. */
const COLUMN_ALIASES: Record<string, string> = {
  company: "name",
  companyname: "name",
  name: "name",
  description: "description",
  about: "description",
  website: "website_url",
  websiteurl: "website_url",
  logo: "logo_url",
  logourl: "logo_url",
  form: "external_form",
  applicationform: "external_form",
  externalform: "external_form",
  location: "job_location",
  joblocation: "job_location",
  visitdate: "visit_date",
  registrationdeadline: "registration_deadline",
  deadline: "registration_deadline",
  ppt: "ppt_datetime",
  pptdatetime: "ppt_datetime",
  oa: "oa_datetime",
  oadatetime: "oa_datetime",
  onlineassessment: "oa_datetime",
  interview: "interview_datetime",
  interviewdatetime: "interview_datetime",
  ctc: "offered_ctc",
  offeredctc: "offered_ctc",
  package: "offered_ctc",
  ctcbreakdown: "ctc_distribution",
  ctcdistribution: "ctc_distribution",
  cgpa: "cgpa_cutoff",
  cgpacutoff: "cgpa_cutoff",
  roles: "roles",
  role: "roles",
  selected: "people_selected",
  peopleselected: "people_selected",
  bond: "bond_details",
  bonddetails: "bond_details",
  eligibility: "eligibility_criteria",
  eligibilitycriteria: "eligibility_criteria",
  status: "status",
};

function normaliseHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z]/g, "");
}

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
}

export async function importCompanies(req: Request): Promise<Response> {
  const body = await readJson<{ rows?: Record<string, string>[]; dry_run?: boolean }>(req);
  const rows = body?.rows;
  const dryRun = body?.dry_run !== false;

  if (!Array.isArray(rows)) return fail(400, "INVALID_BODY", "Expected a list of rows");
  if (rows.length === 0) return fail(400, "EMPTY_IMPORT", "The file has no rows");
  // A cap, so one paste cannot lock the function up for minutes.
  if (rows.length > 500) return fail(413, "TOO_MANY_ROWS", "Import at most 500 rows at a time");

  const issues: ImportIssue[] = [];
  const prepared: Array<{ row: number; values: Record<string, unknown> }> = [];

  rows.forEach((raw, index) => {
    // Header row is row 1 in the user's spreadsheet, so data starts at 2.
    const rowNumber = index + 2;

    const mapped: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(raw)) {
      const column = COLUMN_ALIASES[normaliseHeader(header)];
      // Unrecognised columns are ignored rather than rejected - people export
      // from a spreadsheet with extra working columns all the time.
      if (column && str(value) !== null) mapped[column] = value;
    }

    if (!mapped.name) {
      issues.push({ row: rowNumber, field: "name", message: "No company name in this row" });
      return;
    }

    const { values, errors } = pickWritable(mapped);
    const errorEntries = Object.entries(errors);
    if (errorEntries.length) {
      for (const [field, message] of errorEntries) issues.push({ row: rowNumber, field, message });
      return;
    }

    prepared.push({ row: rowNumber, values });
  });

  // Name is the natural key: a re-import of a corrected sheet should update
  // rather than create a second Wavelength Systems.
  const names = prepared.map((entry) => entry.values.name as string);
  const existing = new Map<string, string>();

  if (names.length) {
    const { data } = await db.from("companies").select("id, name").in("name", names);
    for (const company of data ?? []) existing.set(company.name.toLowerCase(), company.id);
  }

  const toCreate = prepared.filter((entry) => !existing.has((entry.values.name as string).toLowerCase()));
  const toUpdate = prepared.filter((entry) => existing.has((entry.values.name as string).toLowerCase()));

  const summary = {
    total: rows.length,
    valid: prepared.length,
    to_create: toCreate.length,
    to_update: toUpdate.length,
    issues,
  };

  // Dry run is the default: the UI shows this summary and the user confirms.
  if (dryRun) return json({ dry_run: true, ...summary });

  let created = 0;
  let updated = 0;
  const failures: ImportIssue[] = [];

  if (toCreate.length) {
    const { data, error } = await db
      .from("companies")
      .insert(toCreate.map((entry) => entry.values))
      .select("id");
    if (error) {
      failures.push({ row: 0, message: `Could not create rows: ${error.message}` });
    } else {
      created = data?.length ?? 0;
    }
  }

  for (const entry of toUpdate) {
    const id = existing.get((entry.values.name as string).toLowerCase())!;
    const { error } = await db.from("companies").update(entry.values).eq("id", id);
    if (error) failures.push({ row: entry.row, message: error.message });
    else updated += 1;
  }

  return json({
    dry_run: false,
    ...summary,
    created,
    updated,
    failures,
  });
}
