/** Company CRUD. Reads are public; writes need editor, deletes need admin. */

import { db, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

/**
 * Columns a client is allowed to write. An allowlist rather than passing the
 * body through: with the service-role key behind this, an unfiltered spread
 * would let a caller set `id` or `created_at` on any row.
 */
const WRITABLE = [
  "name",
  "description",
  "logo_url",
  "website_url",
  "external_form",
  "visit_date",
  "registration_deadline",
  "ppt_datetime",
  "oa_datetime",
  "interview_datetime",
  "offered_ctc",
  "ctc_distribution",
  "cgpa_cutoff",
  "roles",
  "people_selected",
  "status",
  "bond_details",
  "job_location",
  "eligibility_criteria",
] as const;

const STATUSES = new Set(["upcoming", "ongoing", "completed", "cancelled"]);

export interface ValidationResult {
  values: Record<string, unknown>;
  errors: Record<string, string>;
}

export function pickWritable(body: Record<string, unknown>): ValidationResult {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const key of WRITABLE) {
    if (!(key in body)) continue;
    const raw = body[key];

    switch (key) {
      case "name": {
        const name = str(raw);
        if (!name) errors.name = "A company name is required";
        else if (name.length > 120) errors.name = "Name must be 120 characters or fewer";
        else values.name = name;
        break;
      }
      case "cgpa_cutoff": {
        if (raw === null || raw === "") {
          values.cgpa_cutoff = null;
        } else {
          const value = Number(raw);
          // numeric(3,2) cannot hold anything outside this range; sending 12.5
          // produced a raw Postgres overflow error in the UI.
          if (!Number.isFinite(value) || value < 0 || value > 10) {
            errors.cgpa_cutoff = "CGPA cutoff must be between 0 and 10";
          } else {
            values.cgpa_cutoff = value;
          }
        }
        break;
      }
      case "people_selected": {
        if (raw === null || raw === "") {
          values.people_selected = null;
        } else {
          const value = Number(raw);
          if (!Number.isInteger(value) || value < 0) {
            errors.people_selected = "Must be a whole number, zero or more";
          } else {
            values.people_selected = value;
          }
        }
        break;
      }
      case "roles": {
        if (raw === null) values.roles = null;
        else if (Array.isArray(raw)) {
          values.roles = raw.map((role) => String(role).trim()).filter(Boolean);
        } else if (typeof raw === "string") {
          values.roles = raw.split(",").map((role) => role.trim()).filter(Boolean);
        } else {
          errors.roles = "Roles must be a list";
        }
        break;
      }
      case "status": {
        if (raw === null) values.status = "upcoming";
        else if (typeof raw === "string" && STATUSES.has(raw)) values.status = raw;
        else errors.status = "Unknown status";
        break;
      }
      default:
        values[key] = raw === "" ? null : raw;
    }
  }

  // Ordering that cannot be true is a data-entry mistake worth catching here,
  // where the message can name the field.
  const order: Array<[string, string]> = [
    ["registration_deadline", "ppt_datetime"],
    ["ppt_datetime", "oa_datetime"],
    ["oa_datetime", "interview_datetime"],
  ];
  for (const [earlier, later] of order) {
    const a = values[earlier];
    const b = values[later];
    if (typeof a === "string" && typeof b === "string" && new Date(a) > new Date(b)) {
      errors[later] = `Must be on or after the ${earlier.replace(/_/g, " ")}`;
    }
  }

  return { values, errors };
}

export async function listCompanies(url: URL): Promise<Response> {
  const search = str(url.searchParams.get("q"));
  const limit = Math.min(Number(url.searchParams.get("limit")) || 500, 500);

  let query = db.from("companies").select("*").order("created_at", { ascending: false }).limit(limit);

  if (search) {
    // Escape the wildcards so a literal % in a search term does not turn into
    // "match everything".
    const escaped = search.replace(/[%_]/g, (char) => `\\${char}`);
    query = query.or(`name.ilike.%${escaped}%,job_location.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) return fail(500, "QUERY_FAILED", "Could not load companies");
  return json({ companies: data ?? [] });
}

export async function getCompany(id: string): Promise<Response> {
  const { data, error } = await db.from("companies").select("*").eq("id", id).maybeSingle();
  if (error) return fail(500, "QUERY_FAILED", "Could not load the company");
  if (!data) return fail(404, "NOT_FOUND", "That company does not exist");
  return json({ company: data });
}

export async function createCompany(req: Request): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON body");

  const { values, errors } = pickWritable(body);
  if (!values.name) errors.name ??= "A company name is required";
  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Check the form", errors);

  const { data, error } = await db.from("companies").insert(values).select().single();
  if (error) return fail(500, "INSERT_FAILED", "Could not create the company");
  return json({ company: data }, 201);
}

export async function updateCompany(req: Request, id: string): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON body");

  const { values, errors } = pickWritable(body);
  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Check the form", errors);
  if (!Object.keys(values).length) return fail(400, "NOTHING_TO_UPDATE", "No changes were supplied");

  const { data, error } = await db.from("companies").update(values).eq("id", id).select().maybeSingle();
  if (error) return fail(500, "UPDATE_FAILED", "Could not update the company");
  if (!data) return fail(404, "NOT_FOUND", "That company does not exist");
  return json({ company: data });
}

/**
 * Deleting a company cascades to its experiences and questions, so the counts
 * are returned first for a confirmation dialog that can state the real cost.
 */
export async function getCompanyDeletionImpact(id: string): Promise<Response> {
  const [company, experiences, questions] = await Promise.all([
    db.from("companies").select("id, name").eq("id", id).maybeSingle(),
    db.from("interview_experiences").select("id", { count: "exact", head: true }).eq("company_id", id),
    db.from("interview_questions").select("id", { count: "exact", head: true }).eq("company_id", id),
  ]);

  if (!company.data) return fail(404, "NOT_FOUND", "That company does not exist");

  return json({
    company: company.data,
    experiences: experiences.count ?? 0,
    questions: questions.count ?? 0,
  });
}

export async function deleteCompany(id: string, caller: Caller): Promise<Response> {
  const { data: existing } = await db.from("companies").select("name").eq("id", id).maybeSingle();
  if (!existing) return fail(404, "NOT_FOUND", "That company does not exist");

  const { error } = await db.from("companies").delete().eq("id", id);
  if (error) return fail(500, "DELETE_FAILED", "Could not delete the company");

  console.log(`[audit] ${caller.email} deleted company ${id} (${existing.name})`);
  return json({ success: true });
}
