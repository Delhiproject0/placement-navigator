import type { ApplicationStage } from "@/lib/api";

export const STAGE_LABELS: Record<ApplicationStage, string> = {
  interested: "Interested",
  applied: "Applied",
  shortlisted: "Shortlisted",
  oa: "Online assessment",
  interviewing: "Interviewing",
  offered: "Offered",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  accepted: "Accepted",
};
