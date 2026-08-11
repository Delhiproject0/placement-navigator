/**
 * One place where cache keys are defined.
 *
 * Scattering key arrays across hooks makes invalidation guesswork: a mutation
 * has to reproduce the exact array a query used, and a typo means a stale list
 * that nobody notices until a user reports it.
 */
export const qk = {
  companies: {
    all: ["companies"] as const,
    list: (search?: string) => ["companies", "list", search ?? ""] as const,
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
  },
  admin: {
    users: (search: string, page: number) => ["admin", "users", search, page] as const,
    stats: ["admin", "stats"] as const,
  },
} as const;
