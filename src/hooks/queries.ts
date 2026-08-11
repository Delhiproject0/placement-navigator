/**
 * Typed React Query hooks - the only data-fetching surface the pages use.
 *
 * React Query was already installed and mounted but entirely unused; every
 * page hand-rolled useState + useEffect + a manual refetch callback, which is
 * where the swallowed errors and stale-after-mutate bugs came from.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError, type AdminUser, type ApplicationStage } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import type { Company, InterviewExperience, InterviewQuestion } from "@/types/database";

/**
 * Surfaces a failed mutation once, in the same shape everywhere.
 *
 * Field-level errors from a 422 are handled by the form that raised them, so
 * they are deliberately not toasted - the message belongs next to the input.
 */
function notifyError(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.isValidationError && error.details) return;
    toast.error(error.message || fallback);
    return;
  }
  toast.error(fallback);
}

function mutationDefaults<TData, TVariables>(
  fallback: string,
): Pick<UseMutationOptions<TData, unknown, TVariables>, "onError"> {
  return { onError: (error) => notifyError(error, fallback) };
}

// --- companies -------------------------------------------------------------

export function useCompanies(search?: string) {
  return useQuery({
    queryKey: qk.companies.list(search),
    queryFn: () => api.companies.list(search),
  });
}

export function useCompany(id: string | undefined) {
  return useQuery({
    queryKey: qk.companies.detail(id ?? ""),
    queryFn: () => api.companies.get(id as string),
    enabled: Boolean(id),
    // A missing company is an answer, not a transient failure - retrying just
    // delays the not-found screen.
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

export function useCreateCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Company>) => api.companies.create(input),
    onSuccess: (company) => {
      queryClient.invalidateQueries({ queryKey: qk.companies.all });
      toast.success(`${company.name} added`);
    },
    ...mutationDefaults("Could not add the company"),
  });
}

export function useUpdateCompany(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: Partial<Company>) => api.companies.update(id, input),
    onSuccess: (company) => {
      queryClient.setQueryData(qk.companies.detail(id), company);
      queryClient.invalidateQueries({ queryKey: qk.companies.all });
      toast.success("Changes saved");
    },
    ...mutationDefaults("Could not save your changes"),
  });
}

export function useDeleteCompany() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.companies.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.companies.all });
      toast.success("Company deleted");
    },
    ...mutationDefaults("Could not delete the company"),
  });
}

export function useDeletionImpact(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.companies.deletionImpact(id ?? ""),
    queryFn: () => api.companies.deletionImpact(id as string),
    enabled: Boolean(id) && enabled,
  });
}

// --- contributions ---------------------------------------------------------

export function useExperiences(companyId: string | undefined) {
  return useQuery({
    queryKey: qk.experiences.byCompany(companyId ?? ""),
    queryFn: () => api.experiences.listForCompany(companyId as string),
    enabled: Boolean(companyId),
  });
}

export function useQuestions(companyId: string | undefined) {
  return useQuery({
    queryKey: qk.questions.byCompany(companyId ?? ""),
    queryFn: () => api.questions.listForCompany(companyId as string),
    enabled: Boolean(companyId),
  });
}

export function useSaveExperience(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<InterviewExperience> & { id?: string }) =>
      id
        ? api.experiences.update(id, input)
        : api.experiences.create({ ...input, company_id: companyId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.experiences.byCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: qk.me.contributions });
      toast.success(variables.id ? "Experience updated" : "Thanks for sharing");
    },
    ...mutationDefaults("Could not save the experience"),
  });
}

export function useDeleteExperience(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.experiences.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.experiences.byCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: qk.me.contributions });
      toast.success("Experience removed");
    },
    ...mutationDefaults("Could not delete the experience"),
  });
}

export function useSaveQuestion(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<InterviewQuestion> & { id?: string }) =>
      id ? api.questions.update(id, input) : api.questions.create({ ...input, company_id: companyId }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk.questions.byCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: qk.me.contributions });
      toast.success(variables.id ? "Question updated" : "Question added");
    },
    ...mutationDefaults("Could not save the question"),
  });
}

export function useDeleteQuestion(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.questions.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.questions.byCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: qk.me.contributions });
      toast.success("Question removed");
    },
    ...mutationDefaults("Could not delete the question"),
  });
}

// --- me --------------------------------------------------------------------

export function useMyContributions(enabled: boolean) {
  return useQuery({
    queryKey: qk.me.contributions,
    queryFn: () => api.me.contributions(),
    enabled,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { full_name?: string | null; avatar_url?: string | null }) =>
      api.me.updateProfile(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.me.profile });
      toast.success("Profile updated");
    },
    ...mutationDefaults("Could not save your profile"),
  });
}

// --- admin -----------------------------------------------------------------

export function useAdminUsers(search: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: qk.admin.users(search, page),
    queryFn: () => api.admin.users({ q: search || undefined, page }),
    enabled,
    // Keeps the previous page on screen while the next one loads, instead of
    // collapsing the table to a skeleton on every pagination click.
    placeholderData: (previous) => previous,
  });
}

export function useAdminStats(enabled: boolean) {
  return useQuery({ queryKey: qk.admin.stats, queryFn: () => api.admin.stats(), enabled });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: AdminUser["role"] }) =>
      api.admin.setRole(userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("Role updated");
    },
    ...mutationDefaults("Could not change the role"),
  });
}

export function useSetUserActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isActive }: { userId: string; isActive: boolean }) =>
      api.admin.setActive(userId, isActive),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success(variables.isActive ? "Account enabled" : "Account disabled");
    },
    ...mutationDefaults("Could not update the account"),
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.admin.removeUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: qk.admin.stats });
      toast.success("Account deleted");
    },
    ...mutationDefaults("Could not delete the account"),
  });
}

// --- attachments -----------------------------------------------------------

export function useAttachments(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: qk.attachments.byEntity(entityType, entityId ?? ""),
    queryFn: () => api.attachments.list(entityType, entityId as string),
    enabled: Boolean(entityId),
  });
}

export function useDeleteAttachment(entityType: string, entityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.attachments.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk.attachments.byEntity(entityType, entityId) });
      toast.success("File removed");
    },
    ...mutationDefaults("Could not remove the file"),
  });
}

// --- tracking (bookmarks and applications) ---------------------------------

export function useBookmarks(enabled: boolean) {
  return useQuery({
    queryKey: qk.me.bookmarks,
    queryFn: () => api.tracking.bookmarks(),
    enabled,
  });
}

export function useBookmarkIds(enabled: boolean) {
  return useQuery({
    queryKey: qk.me.bookmarkIds,
    queryFn: () => api.tracking.bookmarkIds(),
    enabled,
  });
}

export function useCompanyTracking(companyId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: qk.tracking.forCompany(companyId ?? ""),
    queryFn: () => api.tracking.forCompany(companyId as string),
    enabled: Boolean(companyId) && enabled,
  });
}

export function useToggleBookmark(companyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (bookmarked: boolean) =>
      bookmarked ? api.tracking.removeBookmark(companyId) : api.tracking.addBookmark(companyId),
    // Optimistic: saving a company should feel instant, and the failure path
    // rolls the icon back rather than leaving it lying.
    onMutate: async (bookmarked) => {
      const key = qk.tracking.forCompany(companyId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: { bookmarked: boolean } | undefined) =>
        old ? { ...old, bookmarked: !bookmarked } : old,
      );
      return { previous, key };
    },
    onError: (error, _variables, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      notifyError(error, "Could not update your saved companies");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: qk.tracking.forCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: qk.me.bookmarks });
      queryClient.invalidateQueries({ queryKey: qk.me.bookmarkIds });
    },
  });
}

export function useApplications(enabled: boolean) {
  return useQuery({
    queryKey: qk.me.applications,
    queryFn: () => api.tracking.applications(),
    enabled,
  });
}

export function useSaveApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { company_id: string; stage?: ApplicationStage; notes?: string | null }) =>
      api.tracking.saveApplication(input),
    onSuccess: (application) => {
      queryClient.invalidateQueries({ queryKey: qk.me.applications });
      queryClient.invalidateQueries({ queryKey: qk.tracking.forCompany(application.company_id) });
      toast.success("Application updated");
    },
    ...mutationDefaults("Could not update your application"),
  });
}

export function useRemoveApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (companyId: string) => api.tracking.removeApplication(companyId),
    onSuccess: (_data, companyId) => {
      queryClient.invalidateQueries({ queryKey: qk.me.applications });
      queryClient.invalidateQueries({ queryKey: qk.tracking.forCompany(companyId) });
      toast.success("Removed from your applications");
    },
    ...mutationDefaults("Could not remove that application"),
  });
}
