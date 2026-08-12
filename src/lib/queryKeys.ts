/**
 * One place where cache keys are defined.
 *
 * Scattering key arrays across hooks makes invalidation guesswork: a mutation
 * has to reproduce the exact array a query used, and a typo means a stale list
 * that nobody notices until a user reports it.
 */
export const qk = {
  seasons: ["seasons"] as const,
  companies: {
    all: ["companies"] as const,
    // The season is part of the key, or switching year would show the previous
    // year's cached rows until a refetch landed.
    list: (search?: string, season?: string | null) =>
      ["companies", "list", season ?? "current", search ?? ""] as const,
    history: (id: string) => ["companies", "history", id] as const,
    detail: (id: string) => ["companies", "detail", id] as const,
    deletionImpact: (id: string) => ["companies", "deletion-impact", id] as const,
  },
  experiences: {
    byCompany: (companyId: string) => ["experiences", "company", companyId] as const,
  },
  questions: {
    byCompany: (companyId: string) => ["questions", "company", companyId] as const,
  },
  attachments: {
    byEntity: (entityType: string, entityId: string) =>
      ["attachments", entityType, entityId] as const,
  },
  me: {
    profile: ["me", "profile"] as const,
    contributions: ["me", "contributions"] as const,
    bookmarks: ["me", "bookmarks"] as const,
    bookmarkIds: ["me", "bookmarks", "ids"] as const,
    applications: ["me", "applications"] as const,
  },
  tracking: {
    forCompany: (companyId: string) => ["tracking", companyId] as const,
  },
  admin: {
    users: (search: string, page: number) => ["admin", "users", search, page] as const,
    stats: (season?: string | null) => ["admin", "stats", season ?? "current"] as const,
  },
} as const;
