/**
 * Comments and votes on contributions.
 *
 * Both are scoped by `entity_type` + `entity_id`, and both verify the target
 * exists before writing - the tables carry no foreign key to it, because the
 * target lives in one of several tables.
 */

import { canMutateOwned, db, dbAs, type Caller } from "../context.ts";
import { fail, json, readJson, str } from "../http.ts";

const COMMENTABLE = new Set(["experience", "question"]);
const VOTABLE = new Set(["experience", "question", "comment"]);

const TABLE_FOR: Record<string, string> = {
  experience: "interview_experiences",
  question: "interview_questions",
  comment: "comments",
};

/** Confirms the thing being commented on or voted for actually exists. */
async function entityExists(entityType: string, entityId: string): Promise<boolean> {
  const table = TABLE_FOR[entityType];
  if (!table) return false;
  const { data } = await db.from(table).select("id").eq("id", entityId).maybeSingle();
  return Boolean(data);
}

// --- comments --------------------------------------------------------------

export async function listComments(url: URL, caller: Caller | null): Promise<Response> {
  const entityType = str(url.searchParams.get("entity_type"));
  const entityId = str(url.searchParams.get("entity_id"));
  if (!entityType || !entityId) {
    return fail(400, "MISSING_PARAMS", "entity_type and entity_id are required");
  }

  const { data, error } = await db
    .from("comments")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: true });

  if (error) return fail(500, "QUERY_FAILED", "Could not load the discussion");

  const rows = data ?? [];
  const authorIds = [...new Set(rows.map((row) => row.author_id).filter(Boolean))] as string[];

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

  // Scores and the caller's own vote, in two queries rather than per comment.
  const ids = rows.map((row) => row.id);
  const scores = new Map<string, number>();
  const myVotes = new Map<string, number>();

  if (ids.length) {
    const { data: votes } = await db
      .from("votes")
      .select("entity_id, user_id, value")
      .eq("entity_type", "comment")
      .in("entity_id", ids);

    for (const vote of votes ?? []) {
      scores.set(vote.entity_id, (scores.get(vote.entity_id) ?? 0) + vote.value);
      if (caller && vote.user_id === caller.id) myVotes.set(vote.entity_id, vote.value);
    }
  }

  return json({
    comments: rows.map((row) => ({
      ...row,
      // A deleted comment keeps its place so replies still make sense, but
      // its text does not travel to the client at all.
      body: row.is_deleted ? null : row.body,
      author: row.is_deleted ? null : (row.author_id ? (authors.get(row.author_id) ?? null) : null),
      score: scores.get(row.id) ?? 0,
      my_vote: myVotes.get(row.id) ?? 0,
    })),
  });
}

export async function createComment(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  const entityType = str(body?.entity_type);
  const entityId = str(body?.entity_id);
  const text = str(body?.body);
  const parentId = str(body?.parent_id);

  if (!entityType || !COMMENTABLE.has(entityType)) {
    return fail(400, "INVALID_ENTITY", "You can only comment on an experience or a question");
  }
  if (!entityId) return fail(400, "MISSING_ENTITY", "Nothing to comment on");
  if (!text) {
    return fail(422, "VALIDATION_FAILED", "Check the form", { body: "Write something first" });
  }
  if (text.length > 5000) {
    return fail(422, "VALIDATION_FAILED", "Check the form", { body: "That is too long for a comment" });
  }

  if (!(await entityExists(entityType, entityId))) {
    return fail(404, "NOT_FOUND", "That entry no longer exists");
  }

  // Only one level of threading: a reply to a reply attaches to the same
  // parent, so a thread cannot nest indefinitely.
  let resolvedParent: string | null = null;
  if (parentId) {
    const { data: parent } = await db
      .from("comments")
      .select("id, parent_id, entity_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent || parent.entity_id !== entityId) {
      return fail(400, "INVALID_PARENT", "That comment is not part of this discussion");
    }
    resolvedParent = parent.parent_id ?? parent.id;
  }

  const { data, error } = await db
    .from("comments")
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      parent_id: resolvedParent,
      author_id: caller.id,
      body: text,
    })
    .select()
    .single();

  if (error) return fail(500, "INSERT_FAILED", "Could not post that comment");
  return json({ comment: data }, 201);
}

export async function updateComment(req: Request, id: string, caller: Caller): Promise<Response> {
  const { data: existing } = await db
    .from("comments")
    .select("author_id, is_deleted")
    .eq("id", id)
    .maybeSingle();

  if (!existing || existing.is_deleted) return fail(404, "NOT_FOUND", "That comment does not exist");
  // Editing is the author's alone. A moderator can remove a comment but must
  // not be able to put words in someone's mouth.
  if (existing.author_id !== caller.id) {
    return fail(403, "FORBIDDEN", "You can only edit your own comments");
  }

  const body = await readJson<{ body?: string }>(req);
  const text = str(body?.body);
  if (!text) return fail(422, "VALIDATION_FAILED", "Check the form", { body: "Write something first" });
  if (text.length > 5000) {
    return fail(422, "VALIDATION_FAILED", "Check the form", { body: "That is too long for a comment" });
  }

  const { data, error } = await db
    .from("comments")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return fail(500, "UPDATE_FAILED", "Could not save your edit");
  return json({ comment: data });
}

export async function deleteComment(id: string, caller: Caller): Promise<Response> {
  const { data: existing } = await db.from("comments").select("author_id").eq("id", id).maybeSingle();
  if (!existing) return fail(404, "NOT_FOUND", "That comment does not exist");
  if (!canMutateOwned(caller, existing.author_id)) {
    return fail(403, "FORBIDDEN", "You can only delete your own comments");
  }

  // Soft delete, so any replies keep their context.
  const { error } = await db
    .from("comments")
    .update({ is_deleted: true, body: "" })
    .eq("id", id);

  if (error) return fail(500, "DELETE_FAILED", "Could not remove that comment");
  return json({ success: true });
}

// --- votes -----------------------------------------------------------------

export async function castVote(req: Request, caller: Caller): Promise<Response> {
  const body = await readJson<Record<string, unknown>>(req);
  const entityType = str(body?.entity_type);
  const entityId = str(body?.entity_id);
  const value = Number(body?.value);

  if (!entityType || !VOTABLE.has(entityType)) return fail(400, "INVALID_ENTITY", "Cannot vote on that");
  if (!entityId) return fail(400, "MISSING_ENTITY", "Nothing to vote on");
  if (![1, -1, 0].includes(value)) return fail(400, "INVALID_VALUE", "A vote must be up, down or cleared");

  if (!(await entityExists(entityType, entityId))) {
    return fail(404, "NOT_FOUND", "That entry no longer exists");
  }

  // Zero means "take my vote back", which is a delete rather than a row with
  // value 0 - otherwise the score sum would need to special-case it.
  if (value === 0) {
    await db
      .from("votes")
      .delete()
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .eq("user_id", caller.id);
  } else {
    const { error } = await db
      .from("votes")
      .upsert(
        { entity_type: entityType, entity_id: entityId, user_id: caller.id, value },
        { onConflict: "entity_type,entity_id,user_id" },
      );
    if (error) return fail(500, "VOTE_FAILED", "Could not record your vote");
  }

  const { data: score } = await db.rpc("vote_score", {
    _entity_type: entityType,
    _entity_id: entityId,
  });

  return json({ score: score ?? 0, my_vote: value });
}

/** Scores for a batch of entities, so a list does not fire one request per row. */
export async function voteSummary(url: URL, caller: Caller | null): Promise<Response> {
  const entityType = str(url.searchParams.get("entity_type"));
  const ids = (url.searchParams.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  if (!entityType || !VOTABLE.has(entityType)) return fail(400, "INVALID_ENTITY", "Unknown entity type");
  if (ids.length === 0) return json({ scores: {}, my_votes: {} });
  if (ids.length > 200) return fail(413, "TOO_MANY", "Too many ids in one request");

  const { data, error } = await db
    .from("votes")
    .select("entity_id, user_id, value")
    .eq("entity_type", entityType)
    .in("entity_id", ids);

  if (error) return fail(500, "QUERY_FAILED", "Could not load votes");

  const scores: Record<string, number> = {};
  const myVotes: Record<string, number> = {};
  for (const vote of data ?? []) {
    scores[vote.entity_id] = (scores[vote.entity_id] ?? 0) + vote.value;
    if (caller && vote.user_id === caller.id) myVotes[vote.entity_id] = vote.value;
  }

  return json({ scores, my_votes: myVotes });
}

// --- tags ------------------------------------------------------------------

export async function listTags(): Promise<Response> {
  const { data, error } = await db
    .from("tags")
    .select("*, company_tags(count)")
    .order("label", { ascending: true });

  if (error) return fail(500, "QUERY_FAILED", "Could not load tags");
  return json({ tags: data ?? [] });
}

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Replaces a company's tags, creating any that do not exist yet. */
export async function setCompanyTags(req: Request, companyId: string, caller: Caller): Promise<Response> {
  const body = await readJson<{ tags?: unknown }>(req);
  const raw = Array.isArray(body?.tags) ? body.tags : null;
  if (raw === null) return fail(400, "INVALID_BODY", "Tags must be a list");

  const labels = raw.map((entry) => String(entry).trim()).filter(Boolean).slice(0, 20);
  const slugs = [...new Set(labels.map(slugify))].filter(Boolean);

  const { data: company } = await db.from("companies").select("id").eq("id", companyId).maybeSingle();
  if (!company) return fail(404, "NOT_FOUND", "That company does not exist");

  let tagIds: string[] = [];
  if (slugs.length) {
    // Upsert on slug so two editors adding "Fintech" and "fintech" converge on
    // one tag rather than creating a duplicate.
    const { error: upsertError } = await dbAs(caller)
      .from("tags")
      .upsert(
        slugs.map((slug, index) => ({ slug, label: labels[index] ?? slug })),
        { onConflict: "slug", ignoreDuplicates: true },
      );
    if (upsertError) return fail(500, "TAG_FAILED", "Could not save the tags");

    const { data: tags } = await db.from("tags").select("id").in("slug", slugs);
    tagIds = (tags ?? []).map((tag) => tag.id);
  }

  await db.from("company_tags").delete().eq("company_id", companyId);
  if (tagIds.length) {
    const { error } = await db
      .from("company_tags")
      .insert(tagIds.map((tagId) => ({ company_id: companyId, tag_id: tagId })));
    if (error) return fail(500, "TAG_FAILED", "Could not attach the tags");
  }

  return json({ success: true, tags: slugs });
}

export async function getCompanyTags(companyId: string): Promise<Response> {
  const { data, error } = await db
    .from("company_tags")
    .select("tags(id, slug, label)")
    .eq("company_id", companyId);

  if (error) return fail(500, "QUERY_FAILED", "Could not load tags");
  return json({ tags: (data ?? []).map((row) => row.tags).filter(Boolean) });
}
