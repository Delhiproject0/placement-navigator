import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TagInput } from "@/components/forms/TagInput";
import { companySchema, type CompanyFormValues } from "@/lib/schemas";
import { useCreateCompany, useUpdateCompany } from "@/hooks/queries";
import { api, ApiError } from "@/lib/api";
import { formatForInputInIST, inputISTToOffsetISOString } from "@/lib/utils";
import type { Company } from "@/types/database";

interface CompanyFormProps {
  company?: Company;
  onSuccess: () => void;
}

/** Empty string is what a cleared input yields; the API wants an absent value. */
function nullIfBlank(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

export const CompanyForm = ({ company, onSuccess }: CompanyFormProps) => {
  const queryClient = useQueryClient();
  const [tags, setTags] = useState<string[]>([]);

  // Existing tags load after the first render, so the editor is seeded once
  // they arrive rather than only from an initial value.
  const { data: existingTags } = useQuery({
    queryKey: ["tags", "company", company?.id],
    queryFn: () => api.tags.forCompany(company!.id),
    enabled: Boolean(company?.id),
  });
  useEffect(() => {
    if (existingTags) setTags(existingTags.map((tag) => tag.label));
  }, [existingTags]);

  const create = useCreateCompany();
  const update = useUpdateCompany(company?.id ?? "");
  const mutation = company ? update : create;

  const form = useForm<CompanyFormValues>({
    resolver: zodResolver(companySchema),
    defaultValues: {
      name: company?.name ?? "",
      description: company?.description ?? "",
      logo_url: company?.logo_url ?? "",
      website_url: company?.website_url ?? "",
      external_form: company?.external_form ?? "",
      job_location: company?.job_location ?? "",
      visit_date: company?.visit_date ?? "",
      // Stored values are absolute instants; the inputs are wall-clock IST.
      registration_deadline: formatForInputInIST(company?.registration_deadline),
      ppt_datetime: formatForInputInIST(company?.ppt_datetime),
      oa_datetime: formatForInputInIST(company?.oa_datetime),
      interview_datetime: formatForInputInIST(company?.interview_datetime),
      offered_ctc: company?.offered_ctc ?? "",
      ctc_distribution: company?.ctc_distribution ?? "",
      cgpa_cutoff: company?.cgpa_cutoff ?? "",
      people_selected: company?.people_selected ?? "",
      roles: company?.roles ?? [],
      bond_details: company?.bond_details ?? "",
      eligibility_criteria: company?.eligibility_criteria ?? "",
    },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const payload = {
      name: values.name.trim(),
      description: nullIfBlank(values.description),
      logo_url: nullIfBlank(values.logo_url),
      website_url: nullIfBlank(values.website_url),
      external_form: nullIfBlank(values.external_form),
      job_location: nullIfBlank(values.job_location),
      visit_date: nullIfBlank(values.visit_date),
      registration_deadline: values.registration_deadline
        ? inputISTToOffsetISOString(values.registration_deadline)
        : null,
      ppt_datetime: values.ppt_datetime ? inputISTToOffsetISOString(values.ppt_datetime) : null,
      oa_datetime: values.oa_datetime ? inputISTToOffsetISOString(values.oa_datetime) : null,
      interview_datetime: values.interview_datetime
        ? inputISTToOffsetISOString(values.interview_datetime)
        : null,
      offered_ctc: nullIfBlank(values.offered_ctc),
      ctc_distribution: nullIfBlank(values.ctc_distribution),
      cgpa_cutoff: values.cgpa_cutoff === "" || values.cgpa_cutoff == null ? null : Number(values.cgpa_cutoff),
      people_selected:
        values.people_selected === "" || values.people_selected == null ? null : Number(values.people_selected),
      roles: values.roles?.length ? values.roles : null,
      bond_details: nullIfBlank(values.bond_details),
      eligibility_criteria: nullIfBlank(values.eligibility_criteria),
    };

    try {
      const saved = await mutation.mutateAsync(payload as Partial<Company>);
      // Tags live in their own table, so they are a second call - done after
      // the company exists, because a new one has no id until then.
      const companyId = company?.id ?? (saved as Company | undefined)?.id;
      if (companyId) {
        await api.tags.setForCompany(companyId, tags);
        queryClient.invalidateQueries({ queryKey: ["tags"] });
      }
      onSuccess();
    } catch (error) {
      // Server-side validation lands on the field that caused it, so the
      // message appears where the user has to fix it.
      if (error instanceof ApiError && error.details) {
        for (const [field, message] of Object.entries(error.details)) {
          form.setError(field as keyof CompanyFormValues, { message });
        }
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <Field label="Company name" htmlFor="name" error={errors.name?.message} required>
        <Input id="name" {...form.register("name")} aria-invalid={Boolean(errors.name)} />
      </Field>

      <Field label="Description" htmlFor="description" error={errors.description?.message}>
        <Textarea id="description" rows={3} {...form.register("description")} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Website" htmlFor="website_url" error={errors.website_url?.message}>
          <Input id="website_url" placeholder="https://" {...form.register("website_url")} />
        </Field>
        <Field label="Logo URL" htmlFor="logo_url" error={errors.logo_url?.message}>
          <Input id="logo_url" placeholder="https://" {...form.register("logo_url")} />
        </Field>
      </div>

      <Field
        label="Application form"
        htmlFor="external_form"
        error={errors.external_form?.message}
        hint="Where students actually register, if it is not on this site."
      >
        <Input id="external_form" placeholder="https://forms.gle/..." {...form.register("external_form")} />
      </Field>

      <Field
        label="Tags"
        htmlFor="tags"
        hint="Free-form labels students filter by - fintech, core, dream, intern + PPO."
      >
        <TagInput id="tags" value={tags} onChange={setTags} placeholder="Add a tag and press Enter" />
      </Field>

      <Field label="Roles" htmlFor="roles" error={errors.roles?.message}>
        <TagInput
          id="roles"
          value={form.watch("roles") ?? []}
          onChange={(next) => form.setValue("roles", next, { shouldDirty: true })}
          placeholder="Type a role and press Enter"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Location" htmlFor="job_location" error={errors.job_location?.message}>
          <Input id="job_location" {...form.register("job_location")} />
        </Field>
        <Field label="CGPA cutoff" htmlFor="cgpa_cutoff" error={errors.cgpa_cutoff?.message} hint="0 to 10">
          <Input
            id="cgpa_cutoff"
            type="number"
            step="0.01"
            min="0"
            max="10"
            placeholder="7.50"
            {...form.register("cgpa_cutoff")}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Offered CTC"
          htmlFor="offered_ctc"
          error={errors.offered_ctc?.message}
          hint="Free text. 'INR 34,05,000' and '20 LPA' are both understood."
        >
          <Input id="offered_ctc" placeholder="INR 34,05,000" {...form.register("offered_ctc")} />
        </Field>
        <Field label="People selected" htmlFor="people_selected" error={errors.people_selected?.message}>
          <Input id="people_selected" type="number" min="0" {...form.register("people_selected")} />
        </Field>
      </div>

      <Field label="CTC breakdown" htmlFor="ctc_distribution" error={errors.ctc_distribution?.message}>
        <Input
          id="ctc_distribution"
          placeholder="Base 24L, Bonus 4L, ESOP 6L"
          {...form.register("ctc_distribution")}
        />
      </Field>

      <fieldset className="rounded-md border border-border p-4">
        <legend className="px-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          Schedule (IST)
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visit date" htmlFor="visit_date" error={errors.visit_date?.message}>
            <Input id="visit_date" type="date" {...form.register("visit_date")} />
          </Field>
          <Field
            label="Registration closes"
            htmlFor="registration_deadline"
            error={errors.registration_deadline?.message}
          >
            <Input
              id="registration_deadline"
              type="datetime-local"
              {...form.register("registration_deadline")}
            />
          </Field>
          <Field label="PPT" htmlFor="ppt_datetime" error={errors.ppt_datetime?.message}>
            <Input id="ppt_datetime" type="datetime-local" {...form.register("ppt_datetime")} />
          </Field>
          <Field label="Online assessment" htmlFor="oa_datetime" error={errors.oa_datetime?.message}>
            <Input id="oa_datetime" type="datetime-local" {...form.register("oa_datetime")} />
          </Field>
          <Field
            label="Interview"
            htmlFor="interview_datetime"
            error={errors.interview_datetime?.message}
          >
            <Input id="interview_datetime" type="datetime-local" {...form.register("interview_datetime")} />
          </Field>
        </div>
      </fieldset>

      <Field label="Eligibility" htmlFor="eligibility_criteria" error={errors.eligibility_criteria?.message}>
        <Textarea id="eligibility_criteria" rows={2} {...form.register("eligibility_criteria")} />
      </Field>

      <Field label="Bond details" htmlFor="bond_details" error={errors.bond_details?.message}>
        <Textarea id="bond_details" rows={2} {...form.register("bond_details")} />
      </Field>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {company ? "Save changes" : "Add company"}
        </Button>
      </div>
    </form>
  );
};

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

function Field({ label, htmlFor, error, hint, required, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
