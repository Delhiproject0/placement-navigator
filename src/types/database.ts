export type PlacementStatus =
  | "upcoming"
  | "ongoing"
  | "ppt_done"
  | "oa_done"
  | "interviews_done"
  | "completed"
  | "cancelled";
export type AppRole = "admin" | "editor" | "viewer";

export interface Company {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  website_url: string | null;
  visit_date: string | null;
  ppt_datetime: string | null;
  oa_datetime: string | null;
  interview_datetime: string | null;
  registration_deadline: string | null;
  cgpa_cutoff: number | null;
  offered_ctc: string | null;
  ctc_distribution: string | null;
  roles: string[] | null;
  people_selected: number | null;
  status: PlacementStatus;
  bond_details: string | null;
  job_location: string | null;
  eligibility_criteria: string | null;
  created_at: string;
  updated_at: string;
  external_form?: string | null;
}

export interface InterviewExperience {
  id: string;
  company_id: string;
  user_id: string | null;
  round_name: string;
  experience: string;
  difficulty: string | null;
  result: string | null;
  tips: string | null;
  created_at: string;
}

export interface InterviewQuestion {
  id: string;
  company_id: string;
  user_id: string | null;
  question: string;
  answer: string | null;
  topic: string | null;
  question_type: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  user_id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
}
