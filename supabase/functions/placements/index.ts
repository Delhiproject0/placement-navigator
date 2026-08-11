/**
 * The PlaceTrack API.
 *
 * Every read and write goes through here. The browser holds no Supabase key
 * with any authority - it authenticates against this function with a JWT this
 * function issued, and this function is the only thing holding the service
 * role key.
 *
 * The consequence worth stating plainly: row-level security is no longer what
 * separates one student's data from another's, because the service-role client
 * bypasses it. Authorization is the explicit `requireX` check at the top of
 * each route below. A missing check is a data leak, not a bug in a policy.
 *
 * Deployed at https://<project>.supabase.co/functions/v1/placements
 * with verify_jwt = false, so unauthenticated routes (login, public reads)
 * are reachable and can return structured errors instead of Kong's bare 401.
 */

import { CORS_HEADERS, fail, json } from "./http.ts";
import { getCaller, requireAdmin, requireEditor, requireUser, type Caller } from "./context.ts";
import * as auth from "./routes/auth.ts";
import * as companies from "./routes/companies.ts";
import * as contributions from "./routes/contributions.ts";
import * as admin from "./routes/admin.ts";
import * as storage from "./routes/storage.ts";
import * as profile from "./routes/profile.ts";
import * as tracking from "./routes/tracking.ts";

/** Strips the function mount prefix, leaving a leading-slash path. */
function routePath(pathname: string): string {
  const stripped = pathname.replace(/^.*\/placements/, "");
  return stripped === "" ? "/" : stripped;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  const url = new URL(req.url);
  const path = routePath(url.pathname);
  const method = req.method;
  const segments = path.split("/").filter(Boolean);

  try {
    // ---------------------------------------------------------------- public
    if (method === "GET" && path === "/health") {
      return json({ ok: true, service: "placements" });
    }

    if (method === "POST" && path === "/auth/signup") return await auth.handleSignup(req);
    if (method === "POST" && path === "/auth/login") return await auth.handleLogin(req);
    if (method === "POST" && path === "/auth/refresh") return await auth.handleRefresh(req);
    if (method === "POST" && path === "/auth/logout") return await auth.handleLogout(req);
    if (method === "POST" && path === "/auth/request-reset") return await auth.handleRequestReset(req);
    if (method === "POST" && path === "/auth/reset-password") return await auth.handleResetPassword(req);

    // The placement calendar is public - this is a noticeboard, and requiring
    // an account to read it would defeat the point.
    if (method === "GET" && path === "/companies") return await companies.listCompanies(url);

    if (method === "GET" && segments[0] === "companies" && segments.length === 2) {
      return await companies.getCompany(segments[1]);
    }
    if (method === "GET" && segments[0] === "companies" && segments[2] === "experiences") {
      return await contributions.listForCompany("interview_experiences", segments[1]);
    }
    if (method === "GET" && segments[0] === "companies" && segments[2] === "questions") {
      return await contributions.listForCompany("interview_questions", segments[1]);
    }
    if (method === "GET" && path === "/attachments") return await storage.listAttachments(url);
    if (method === "GET" && path === "/file-text") return await storage.handleFileText(url);

    // ------------------------------------------------------------ identified
    const caller: Caller | null = await getCaller(req);

    if (method === "GET" && path === "/auth/me") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await auth.handleMe(caller!);
    }
    if (method === "POST" && path === "/auth/change-password") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await auth.handleChangePassword(req, caller!);
    }

    // ---------------------------------------------------------------- me
    if (path === "/me/profile") {
      const denied = requireUser(caller);
      if (denied) return denied;
      if (method === "GET") return await profile.getProfile(caller!);
      if (method === "PATCH") return await profile.updateProfile(req, caller!);
    }
    if (method === "GET" && path === "/me/contributions") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await contributions.listMine(caller!);
    }

    // ------------------------------------------------------------- tracking
    if (segments[0] === "me" && (segments[1] === "bookmarks" || segments[1] === "applications")) {
      const denied = requireUser(caller);
      if (denied) return denied;
      const isBookmarks = segments[1] === "bookmarks";

      if (method === "GET" && segments.length === 2) {
        return isBookmarks
          ? await tracking.listBookmarks(caller!)
          : await tracking.listApplications(caller!);
      }
      if (method === "GET" && segments[2] === "ids" && isBookmarks) {
        return await tracking.listBookmarkIds(caller!);
      }
      if (method === "POST" && segments.length === 2) {
        return isBookmarks
          ? await tracking.addBookmark(req, caller!)
          : await tracking.upsertApplication(req, caller!);
      }
      if (method === "DELETE" && segments.length === 3) {
        return isBookmarks
          ? await tracking.removeBookmark(segments[2], caller!)
          : await tracking.removeApplication(segments[2], caller!);
      }
    }

    if (method === "GET" && segments[0] === "companies" && segments[2] === "tracking") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await tracking.trackingForCompany(segments[1], caller!);
    }

    // --------------------------------------------------------- companies (w)
    if (method === "POST" && path === "/companies") {
      const denied = requireEditor(caller);
      if (denied) return denied;
      return await companies.createCompany(req);
    }
    if (segments[0] === "companies" && segments.length === 2) {
      if (method === "PATCH") {
        const denied = requireEditor(caller);
        if (denied) return denied;
        return await companies.updateCompany(req, segments[1]);
      }
      if (method === "DELETE") {
        const denied = requireAdmin(caller);
        if (denied) return denied;
        return await companies.deleteCompany(segments[1], caller!);
      }
    }
    if (method === "GET" && segments[0] === "companies" && segments[2] === "deletion-impact") {
      const denied = requireAdmin(caller);
      if (denied) return denied;
      return await companies.getCompanyDeletionImpact(segments[1]);
    }

    // ------------------------------------------------------- contributions (w)
    for (const [prefix, table] of [
      ["experiences", "interview_experiences"],
      ["questions", "interview_questions"],
    ] as const) {
      if (segments[0] !== prefix) continue;

      if (method === "POST" && segments.length === 1) {
        const denied = requireUser(caller);
        if (denied) return denied;
        return await contributions.create(table, req, caller!);
      }
      if (segments.length === 2) {
        const denied = requireUser(caller);
        if (denied) return denied;
        if (method === "PATCH") return await contributions.update(table, req, segments[1], caller!);
        if (method === "DELETE") return await contributions.remove(table, segments[1], caller!);
      }
    }

    // ------------------------------------------------------------- storage
    if (method === "POST" && path === "/upload") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await storage.handleUpload(req, caller!);
    }
    if (method === "DELETE" && path === "/attachments") {
      const denied = requireUser(caller);
      if (denied) return denied;
      return await storage.handleDeleteFile(url, caller!);
    }

    // --------------------------------------------------------------- admin
    if (segments[0] === "admin") {
      const denied = requireAdmin(caller);
      if (denied) return denied;

      if (method === "GET" && path === "/admin/users") return await admin.listUsers(url);
      if (method === "GET" && path === "/admin/stats") return await admin.stats();

      if (segments[1] === "users" && segments[2]) {
        const userId = segments[2];
        if (method === "PATCH" && segments[3] === "role") {
          return await admin.setUserRole(req, userId, caller!);
        }
        if (method === "PATCH" && segments[3] === "active") {
          return await admin.setUserActive(req, userId, caller!);
        }
        if (method === "DELETE" && segments.length === 3) {
          return await admin.deleteUser(userId, caller!);
        }
      }
    }

    return fail(404, "NOT_FOUND", `No route for ${method} ${path}`);
  } catch (error) {
    // Never echo the thrown value: it can carry connection strings and row
    // contents. It goes to the function logs instead.
    console.error(`Unhandled error on ${method} ${path}:`, error);
    return fail(500, "INTERNAL_ERROR", "Something went wrong on our end");
  }
});
