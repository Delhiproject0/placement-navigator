/**
 * The only way the browser talks to the backend.
 *
 * Everything goes through the `placements` edge function - there is no direct
 * PostgREST access and no Supabase Auth. The client holds a short-lived access
 * token and a rotating refresh token, and this module is responsible for
 * attaching them, refreshing them, and giving up cleanly when it cannot.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Overridable so a dev server can point at a local stack. */
export const API_BASE: string =
  import.meta.env.VITE_API_URL ?? `${SUPABASE_URL}/functions/v1/placements`;

const ACCESS_TOKEN_KEY = "placetrack.access_token";
const REFRESH_TOKEN_KEY = "placetrack.refresh_token";

export interface ApiUser {
  id: string;
  email: string;
  full_name: string | null;
  email_verified: boolean;
  created_at: string;
  role: "admin" | "editor" | "viewer";
}

export interface Session {
  user: ApiUser;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

/**
 * A failed request. `code` is the stable machine-readable identifier from the
 * API; `details` carries per-field messages for a 422 so a form can show them
 * against the right input.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string>;

  constructor(status: number, code: string, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** True when the caller should be sent back to the sign-in page. */
  get isAuthError(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isValidationError(): boolean {
    return this.status === 422;
  }
}

// --- token storage ---------------------------------------------------------

type Listener = (user: ApiUser | null) => void;
const listeners = new Set<Listener>();

/** Notifies useAuth when the session changes from anywhere, including a 401. */
export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(user: ApiUser | null) {
  for (const listener of listeners) listener(user);
}

export const tokens = {
  access: (): string | null => localStorage.getItem(ACCESS_TOKEN_KEY),
  refresh: (): string | null => localStorage.getItem(REFRESH_TOKEN_KEY),
  set(session: Pick<Session, "access_token" | "refresh_token">) {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
  },
  clear() {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  },
};

export function storeSession(session: Session) {
  tokens.set(session);
  emit(session.user);
}

export function clearSession() {
  tokens.clear();
  emit(null);
}

// --- refresh ---------------------------------------------------------------

/**
 * In-flight refresh, shared by every caller.
 *
 * Page load fires several queries at once. If each one refreshed on its own
 * 401, they would race: refresh tokens rotate, so the first to land invalidates
 * the others, and the API treats a replayed token as theft and revokes every
 * session. Single-flighting is what stops a normal page load logging the user
 * out.
 */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = tokens.refresh();
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "content-type": "application/json", apikey: ANON_KEY },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!response.ok) {
        clearSession();
        return null;
      }

      const session = (await response.json()) as Session;
      storeSession(session);
      return session.access_token;
    } catch {
      // A network failure is not proof the session is invalid, so the tokens
      // are left alone; the next attempt can succeed.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// --- request ---------------------------------------------------------------

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Set for the raw-bytes upload path, which must not be JSON-encoded. */
  rawBody?: BodyInit;
  auth?: boolean;
}

async function toApiError(response: Response): Promise<ApiError> {
  let code = "UNKNOWN";
  let message = `Request failed (${response.status})`;
  let details: Record<string, string> | undefined;

  try {
    const body = await response.json();
    if (body?.error) {
      code = body.error.code ?? code;
      message = body.error.message ?? message;
      details = body.error.details ?? undefined;
    }
  } catch {
    // Non-JSON error body (a gateway timeout, say) - keep the generic message.
  }

  return new ApiError(response.status, code, message, details);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, rawBody, auth = true, ...init } = options;

  const send = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("apikey", ANON_KEY);
    if (body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (token) headers.set("authorization", `Bearer ${token}`);

    return fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  };

  let response = await send(auth ? tokens.access() : null);

  // One retry, and only for an expired/missing token. Retrying a 403 would
  // just repeat a decision the server has already made.
  if (response.status === 401 && auth && tokens.refresh()) {
    const fresh = await refreshAccessToken();
    if (fresh) {
      response = await send(fresh);
    } else {
      clearSession();
    }
  }

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.status === 401) clearSession();
    throw error;
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

// --- typed endpoints -------------------------------------------------------

import type { Company, InterviewExperience, InterviewQuestion, Profile } from "@/types/database";

export interface Contribution<T> {
  author: { full_name: string | null; avatar_url: string | null } | null;
  item: T;
}

export type ExperienceWithAuthor = InterviewExperience & {
  author: { full_name: string | null; avatar_url: string | null } | null;
};
export type QuestionWithAuthor = InterviewQuestion & {
  author: { full_name: string | null; avatar_url: string | null } | null;
};

export interface Attachment {
  id: string;
  entity_type: string;
  entity_id: string | null;
  url: string;
  storage_file_name: string;
  title: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  kind: string | null;
  visibility: string;
  uploaded_by: string | null;
  created_at: string;
}

export const APPLICATION_STAGES = [
  "interested",
  "applied",
  "shortlisted",
  "oa",
  "interviewing",
  "offered",
  "rejected",
  "withdrawn",
  "accepted",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];

export interface Application {
  id: string;
  user_id: string;
  company_id: string;
  stage: ApplicationStage;
  notes: string | null;
  applied_at: string | null;
  outcome_at: string | null;
  created_at: string;
  updated_at: string;
  companies?: Company | null;
}

export interface ImportIssue {
  row: number;
  field?: string;
  message: string;
}

export interface ImportResult {
  dry_run: boolean;
  total: number;
  valid: number;
  to_create: number;
  to_update: number;
  issues: ImportIssue[];
  created?: number;
  updated?: number;
  failures?: ImportIssue[];
}

export interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  email_verified: boolean;
  last_login_at: string | null;
  created_at: string;
  role: "admin" | "editor" | "viewer";
}

export const api = {
  auth: {
    signup: (input: { email: string; password: string; full_name?: string }) =>
      request<Session>("/auth/signup", { method: "POST", body: input, auth: false }),

    login: (input: { email: string; password: string }) =>
      request<Session>("/auth/login", { method: "POST", body: input, auth: false }),

    me: () => request<{ user: ApiUser; profile: Profile | null }>("/auth/me"),

    logout: (all = false) =>
      request<{ success: boolean }>("/auth/logout", {
        method: "POST",
        body: { refresh_token: tokens.refresh(), all },
      }),

    changePassword: (input: { current_password: string; new_password: string }) =>
      request<{ success: boolean }>("/auth/change-password", { method: "POST", body: input }),

    requestReset: (email: string) =>
      request<{ success: boolean; message: string }>("/auth/request-reset", {
        method: "POST",
        body: { email },
        auth: false,
      }),

    resetPassword: (input: { token: string; new_password: string }) =>
      request<{ success: boolean }>("/auth/reset-password", {
        method: "POST",
        body: input,
        auth: false,
      }),
  },

  companies: {
    list: (query?: string) =>
      request<{ companies: Company[] }>(
        `/companies${query ? `?q=${encodeURIComponent(query)}` : ""}`,
        { auth: false },
      ).then((response) => response.companies),

    get: (id: string) =>
      request<{ company: Company }>(`/companies/${id}`, { auth: false }).then((r) => r.company),

    create: (input: Partial<Company>) =>
      request<{ company: Company }>("/companies", { method: "POST", body: input }).then(
        (r) => r.company,
      ),

    update: (id: string, input: Partial<Company>) =>
      request<{ company: Company }>(`/companies/${id}`, { method: "PATCH", body: input }).then(
        (r) => r.company,
      ),

    remove: (id: string) => request<{ success: boolean }>(`/companies/${id}`, { method: "DELETE" }),

    deletionImpact: (id: string) =>
      request<{ company: { id: string; name: string }; experiences: number; questions: number }>(
        `/companies/${id}/deletion-impact`,
      ),
  },

  experiences: {
    listForCompany: (companyId: string) =>
      request<{ items: ExperienceWithAuthor[] }>(`/companies/${companyId}/experiences`, {
        auth: false,
      }).then((r) => r.items),

    create: (input: Partial<InterviewExperience> & { company_id: string }) =>
      request<{ item: InterviewExperience }>("/experiences", { method: "POST", body: input }),

    update: (id: string, input: Partial<InterviewExperience>) =>
      request<{ item: InterviewExperience }>(`/experiences/${id}`, { method: "PATCH", body: input }),

    remove: (id: string) => request<{ success: boolean }>(`/experiences/${id}`, { method: "DELETE" }),
  },

  questions: {
    listForCompany: (companyId: string) =>
      request<{ items: QuestionWithAuthor[] }>(`/companies/${companyId}/questions`, {
        auth: false,
      }).then((r) => r.items),

    create: (input: Partial<InterviewQuestion> & { company_id: string }) =>
      request<{ item: InterviewQuestion }>("/questions", { method: "POST", body: input }),

    update: (id: string, input: Partial<InterviewQuestion>) =>
      request<{ item: InterviewQuestion }>(`/questions/${id}`, { method: "PATCH", body: input }),

    remove: (id: string) => request<{ success: boolean }>(`/questions/${id}`, { method: "DELETE" }),
  },

  me: {
    profile: () => request<{ profile: Profile }>("/me/profile").then((r) => r.profile),

    updateProfile: (input: { full_name?: string | null; avatar_url?: string | null }) =>
      request<{ profile: Profile }>("/me/profile", { method: "PATCH", body: input }).then(
        (r) => r.profile,
      ),

    contributions: () =>
      request<{
        experiences: Array<InterviewExperience & { companies: Company | null }>;
        questions: Array<InterviewQuestion & { companies: Company | null }>;
      }>("/me/contributions"),
  },

  tracking: {
    bookmarks: () =>
      request<{ bookmarks: Array<{ id: string; created_at: string; companies: Company }> }>(
        "/me/bookmarks",
      ).then((r) => r.bookmarks),

    bookmarkIds: () =>
      request<{ company_ids: string[] }>("/me/bookmarks/ids").then((r) => r.company_ids),

    addBookmark: (companyId: string) =>
      request<{ success: boolean }>("/me/bookmarks", {
        method: "POST",
        body: { company_id: companyId },
      }),

    removeBookmark: (companyId: string) =>
      request<{ success: boolean }>(`/me/bookmarks/${companyId}`, { method: "DELETE" }),

    applications: () =>
      request<{ applications: Application[] }>("/me/applications").then((r) => r.applications),

    saveApplication: (input: { company_id: string; stage?: ApplicationStage; notes?: string | null }) =>
      request<{ application: Application }>("/me/applications", { method: "POST", body: input }).then(
        (r) => r.application,
      ),

    removeApplication: (companyId: string) =>
      request<{ success: boolean }>(`/me/applications/${companyId}`, { method: "DELETE" }),

    forCompany: (companyId: string) =>
      request<{ bookmarked: boolean; application: Application | null }>(
        `/companies/${companyId}/tracking`,
      ),
  },

  attachments: {
    list: (entityType: string, entityId: string) =>
      request<{ attachments: Attachment[] }>(
        `/attachments?entity_type=${entityType}&entity_id=${entityId}`,
        { auth: false },
      ).then((r) => r.attachments),

    remove: (id: string) =>
      request<{ success: boolean }>(`/attachments?id=${id}`, { method: "DELETE" }),
  },

  calendar: {
    getToken: () => request<{ token: string | null }>("/calendar/token"),
    issueToken: () => request<{ token: string }>("/calendar/token", { method: "POST" }),
    revokeToken: () => request<{ success: boolean }>("/calendar/token", { method: "DELETE" }),
    /**
     * Composed here rather than server-side: behind the gateway the function
     * only sees its internal address, so it cannot know its own public URL.
     */
    feedUrl: (token: string) => `${API_BASE}/calendar/${token}.ics`,
  },

  companiesImport: {
    /** Dry run by default - the UI shows the summary and the user confirms. */
    run: (rows: Record<string, string>[], dryRun = true) =>
      request<ImportResult>("/import/companies", {
        method: "POST",
        body: { rows, dry_run: dryRun },
      }),
  },

  admin: {
    users: (params: { q?: string; page?: number } = {}) => {
      const search = new URLSearchParams();
      if (params.q) search.set("q", params.q);
      if (params.page) search.set("page", String(params.page));
      const suffix = search.toString();
      return request<{ users: AdminUser[]; total: number; page: number; per_page: number }>(
        `/admin/users${suffix ? `?${suffix}` : ""}`,
      );
    },

    stats: () =>
      request<{ companies: number; experiences: number; questions: number; users: number }>(
        "/admin/stats",
      ),

    setRole: (userId: string, role: AdminUser["role"]) =>
      request<{ success: boolean }>(`/admin/users/${userId}/role`, {
        method: "PATCH",
        body: { role },
      }),

    setActive: (userId: string, isActive: boolean) =>
      request<{ success: boolean }>(`/admin/users/${userId}/active`, {
        method: "PATCH",
        body: { is_active: isActive },
      }),

    removeUser: (userId: string) =>
      request<{ success: boolean }>(`/admin/users/${userId}`, { method: "DELETE" }),
  },
};
