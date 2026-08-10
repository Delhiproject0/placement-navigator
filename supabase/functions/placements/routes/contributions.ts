/**
 * Interview experiences and questions - the student-contributed content.
 *
 * Both follow the same authorization rule: anyone signed in may contribute,
 * and the author or a moderator (editor/admin) may edit or delete. The old UI
 * gated edit and delete on ownership alone, which meant an admin could not
 * remove a spam entry.
 */

import { canMutateOwned, db, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

type Table = "interview_experiences" | "interview_questions";

const EXPERIENCE_FIELDS = ["round_name", "experience", "difficulty", "result", "tips"] as const;
const QUESTION_FIELDS = ["question", "answer", "topic", "question_type"] as const;

const DIFFICULTIES = new Set(["Easy", "Medium", "Hard"]);
const RESULTS = new Set(["Selected", "Not Selected", "Pending"]);

function validateExperience(body: Record<string, unknown>, partial: boolean) {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of EXPERIENCE_FIELDS) {
    if (partial && !(field in body)) continue;
    const value = str(body[field]);

    if (field === "round_name") {
      if (!value) errors.round_name = "Which round was this?";
      else if (value.length > 120) errors.round_name = "Keep the round name under 120 characters";
      else values.round_name = value;
    } else if (field === "experience") {
      if (!value) errors.experience = "Describe what happened in the round";
      else if (value.length < 20) errors.experience = "Add a little more detail - at least 20 characters";
      else if (value.length > 20_000) errors.experience = "That is too long for one entry";
      else values.experience = value;
    } else if (field === "difficulty") {
      if (value && !DIFFICULTIES.has(value)) errors.difficulty = "Choose Easy, Medium or Hard";
      else values.difficulty = value;
    } else if (field === "result") {
      // Free text here is what forced the old `ilike '%selected%'` query, which
      // also matched "Not Selected" and reported rejected candidates as hires.
      if (value && !RESULTS.has(value)) errors.result = "Choose Selected, Not Selected or Pending";
      else values.result = value;
    } else {
      values[field] = value;
    }
  }

  return { values, errors };
}

function validateQuestion(body: Record<string, unknown>, partial: boolean) {
  const values: Record<string, unknown> = {};
  const errors: Record<string, string> = {};

  for (const field of QUESTION_FIELDS) {
    if (partial && !(field in body)) continue;
    const value = str(body[field]);

    if (field === "question") {
      if (!value) errors.question = "What was the question?";
      else if (value.length > 10_000) errors.question = "That is too long for one question";
      else values.question = value;
    } else {
      values[field] = value;
    }
  }

  return { values, errors };
}

export async function listForCompany(table: Table, companyId: string): Promise<Response> {
  const { data, error } = await db
    .from(table)
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });

  if (error) return fail(500, "QUERY_FAILED", "Could not load that content");

  // Attach author names in one extra query rather than N. The client shows
  // "Anonymous" for a null author, so a missing profile is not an error.
  const authorIds = [...new Set((data ?? []).map((row) => row.user_id).filter(Boolean))] as string[];
  const authors = new Map<string, { full_name: string | null; avatar_url: string | null }>();

  if (authorIds.length) {
    const { data: profiles } = await db
      .from("profiles")
      .select("user_id, full_name, avatar_url")
      .in("user_id", authorIds);
    for (const profile of profiles ?? []) {
      authors.set(profile.user_id, { full_name: profile.full_name, avatar_url: profile.avatar_url });
    }
  }

  return json({
    items: (data ?? []).map((row) => ({ ...row, author: row.user_id ? authors.get(row.user_id) ?? null : null })),
  });
}

export async function create(table: Table, req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON body");

  const companyId = str(body.company_id);
  if (!companyId) return fail(400, "MISSING_COMPANY", "A company is required");

  const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return fail(404, "NOT_FOUND", "That company does not exist");

  const { values, errors } =
    table === "interview_experiences" ? validateExperience(body, false) : validateQuestion(body, false);
  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Check the form", errors);

  const { data, error } = await db
    .from(table)
    .insert({ ...values, company_id: companyId, user_id: caller.id })
    .select()
    .single();

  if (error) return fail(500, "INSERT_FAILED", "Could not save that");
  return json({ item: data }, 201);
}

export async function update(table: Table, req: Request, id: string, caller: Caller): Promise<Response> {
  const { data: existing } = await db.from(table).select("user_id").eq("id", id).maybeSingle();
  if (!existing) return fail(404, "NOT_FOUND", "That entry does not exist");
  if (!canMutateOwned(caller, existing.user_id)) {
    return fail(403, "FORBIDDEN", "You can only edit your own contributions");
  }

  const body = await readJson<Record<string, unknown>>(req);
  if (!body) return fail(400, "INVALID_BODY", "Expected a JSON body");

  const { values, errors } =
    table === "interview_experiences" ? validateExperience(body, true) : validateQuestion(body, true);
  if (Object.keys(errors).length) return fail(422, "VALIDATION_FAILED", "Check the form", errors);
  if (!Object.keys(values).length) return fail(400, "NOTHING_TO_UPDATE", "No changes were supplied");

  const { data, error } = await db.from(table).update(values).eq("id", id).select().maybeSingle();
  if (error) return fail(500, "UPDATE_FAILED", "Could not save your changes");
  return json({ item: data });
}

export async function remove(table: Table, id: string, caller: Caller): Promise<Response> {
  const { data: existing } = await db.from(table).select("user_id").eq("id", id).maybeSingle();
  if (!existing) return fail(404, "NOT_FOUND", "That entry does not exist");
  if (!canMutateOwned(caller, existing.user_id)) {
    return fail(403, "FORBIDDEN", "You can only delete your own contributions");
  }

  const { error } = await db.from(table).delete().eq("id", id);
  if (error) return fail(500, "DELETE_FAILED", "Could not delete that");
  return json({ success: true });
}

/** Everything the signed-in user has contributed, for their profile page. */
export async function listMine(caller: Caller): Promise<Response> {
  const [experiences, questions] = await Promise.all([
    db
      .from("interview_experiences")
      .select("*, companies(id, name, logo_url)")
      .eq("user_id", caller.id)
      .order("created_at", { ascending: false }),
    db
      .from("interview_questions")
      .select("*, companies(id, name, logo_url)")
      .eq("user_id", caller.id)
      .order("created_at", { ascending: false }),
  ]);

  return json({
    experiences: experiences.data ?? [],
    questions: questions.data ?? [],
  });
}
