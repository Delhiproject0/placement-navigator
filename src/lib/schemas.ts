/**
 * Validation schemas, shared between create and edit forms.
 *
 * These mirror the checks the API performs. The server remains the authority -
 * a client check is a courtesy that saves a round trip and puts the message
 * next to the field - so anything enforced here is enforced there too.
 */

import { z } from "zod";

/** An optional URL field that also accepts the empty string a cleared input leaves behind. */
const optionalUrl = z
  .string()
  .trim()
  .max(2048, "That URL is too long")
  .url("Enter a full URL, including https://")
  .optional()
  .or(z.literal(""));

const optionalText = (max: number, label = "This") =>
  z.string().trim().max(max, `${label} is too long`).optional().or(z.literal(""));

/** datetime-local produces "YYYY-MM-DDTHH:mm" or "". */
const optionalDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Pick a valid date and time")
  .optional()
  .or(z.literal(""));

export const companySchema = z
  .object({
    name: z.string().trim().min(1, "A company name is required").max(120, "Keep the name under 120 characters"),
    description: optionalText(4000, "The description"),
    logo_url: optionalUrl,
    website_url: optionalUrl,
    external_form: optionalUrl,
    job_location: optionalText(200, "The location"),
    visit_date: z.string().trim().optional().or(z.literal("")),
    registration_deadline: optionalDateTime,
    ppt_datetime: optionalDateTime,
    oa_datetime: optionalDateTime,
    interview_datetime: optionalDateTime,
    offered_ctc: optionalText(200, "The CTC"),
    ctc_distribution: optionalText(1000, "The breakdown"),
    // numeric(3,2) cannot hold 10.00 or above. Entering 12.5 used to reach the
    // database and come back as a raw overflow error.
    cgpa_cutoff: z
      .union([z.literal(""), z.coerce.number().min(0, "Cannot be negative").max(10, "Cannot be above 10")])
      .optional(),
    people_selected: z
      .union([z.literal(""), z.coerce.number().int("Must be a whole number").min(0, "Cannot be negative")])
      .optional(),
    roles: z.array(z.string().trim().min(1)).max(20, "That is a lot of roles").default([]),
    bond_details: optionalText(2000, "The bond details"),
    eligibility_criteria: optionalText(2000, "The criteria"),
  })
  .superRefine((value, ctx) => {
    // A drive cannot interview before it tests, or test before it presents.
    // Catching it here names the field; the database would just accept it.
    const stages: Array<[keyof typeof value, keyof typeof value, string]> = [
      ["registration_deadline", "ppt_datetime", "the registration deadline"],
      ["ppt_datetime", "oa_datetime", "the PPT"],
      ["oa_datetime", "interview_datetime", "the OA"],
    ];

    for (const [earlierKey, laterKey, label] of stages) {
      const earlier = value[earlierKey];
      const later = value[laterKey];
      if (typeof earlier === "string" && typeof later === "string" && earlier && later) {
        if (new Date(earlier) > new Date(later)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [laterKey as string],
            message: `Must be on or after ${label}`,
          });
        }
      }
    }
  });

export type CompanyFormValues = z.input<typeof companySchema>;

export const experienceSchema = z.object({
  round_name: z
    .string()
    .trim()
    .min(1, "Which round was this?")
    .max(120, "Keep the round name short"),
  experience: z
    .string()
    .trim()
    .min(20, "Add a little more detail - at least 20 characters")
    .max(20000, "That is too long for one entry"),
  difficulty: z.enum(["Easy", "Medium", "Hard"]).optional().or(z.literal("")),
  // A closed set, so "Selected" and "Not Selected" stay machine-distinguishable.
  // Free text here is what made the old query treat rejections as offers.
  result: z.enum(["Selected", "Not Selected", "Pending"]).optional().or(z.literal("")),
  tips: optionalText(5000, "The tips"),
});

export type ExperienceFormValues = z.input<typeof experienceSchema>;

export const questionSchema = z.object({
  question: z.string().trim().min(1, "What was the question?").max(10000, "That is too long"),
  answer: optionalText(20000, "The answer"),
  topic: optionalText(120, "The topic"),
  question_type: z
    .enum(["DSA", "System Design", "Behavioral", "Technical", "HR", "Puzzle"])
    .optional()
    .or(z.literal("")),
});

export type QuestionFormValues = z.input<typeof questionSchema>;

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Enter your email").email("That does not look like an email"),
  password: z.string().min(1, "Enter your password"),
});

export const signUpSchema = z.object({
  full_name: z.string().trim().min(1, "Enter your name").max(120, "That name is too long"),
  email: z.string().trim().min(1, "Enter your email").email("That does not look like an email"),
  // Matches the database function's minimum. Length beats composition rules:
  // a long passphrase is stronger than a short string with a symbol in it.
  password: z.string().min(8, "Use at least 8 characters"),
});

export const profileSchema = z.object({
  full_name: z.string().trim().max(120, "That name is too long").optional().or(z.literal("")),
  avatar_url: optionalUrl,
});

export const changePasswordSchema = z
  .object({
    current_password: z.string().min(1, "Enter your current password"),
    new_password: z.string().min(8, "Use at least 8 characters"),
    confirm_password: z.string().min(1, "Repeat the new password"),
  })
  .refine((value) => value.new_password === value.confirm_password, {
    path: ["confirm_password"],
    message: "The passwords do not match",
  });

/** Strips "" back to null so the API stores an absent value, not an empty string. */
export function blankToNull<T extends Record<string, unknown>>(values: T): T {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    output[key] = value === "" ? null : value;
  }
  return output as T;
}
