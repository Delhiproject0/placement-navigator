import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { experienceSchema, type ExperienceFormValues } from "@/lib/schemas";
import { useSaveExperience } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import type { InterviewExperience } from "@/types/database";

interface ExperienceFormProps {
  companyId: string;
  /** Present when editing. The create and edit forms are the same component
      deliberately - they used to diverge, with Selects on create and free-text
      Inputs on edit, so editing could introduce a value create would reject. */
  experience?: InterviewExperience;
  onSuccess: () => void;
  onCancel?: () => void;
}

const DIFFICULTIES = ["Easy", "Medium", "Hard"] as const;
const RESULTS = ["Selected", "Not Selected", "Pending"] as const;

export const ExperienceForm = ({
  companyId,
  experience,
  onSuccess,
  onCancel,
}: ExperienceFormProps) => {
  const save = useSaveExperience(companyId);

  const form = useForm<ExperienceFormValues>({
    resolver: zodResolver(experienceSchema),
    defaultValues: {
      round_name: experience?.round_name ?? "",
      experience: experience?.experience ?? "",
      difficulty: (experience?.difficulty as ExperienceFormValues["difficulty"]) ?? "",
      result: (experience?.result as ExperienceFormValues["result"]) ?? "",
      tips: experience?.tips ?? "",
    },
  });

  const { errors } = form.formState;
  const body = form.watch("experience") ?? "";

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        id: experience?.id,
        round_name: values.round_name.trim(),
        experience: values.experience.trim(),
        difficulty: values.difficulty || null,
        result: values.result || null,
        tips: values.tips?.trim() || null,
      });
      form.reset();
      onSuccess();
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        for (const [field, message] of Object.entries(error.details)) {
          form.setError(field as keyof ExperienceFormValues, { message });
        }
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="round_name">
          Round<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Input
          id="round_name"
          placeholder="Online Assessment, Technical Interview 1, HR..."
          {...form.register("round_name")}
        />
        {errors.round_name && <p className="text-xs text-destructive">{errors.round_name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <Label htmlFor="experience">
            What happened<span className="ml-0.5 text-destructive">*</span>
          </Label>
          <span className="font-mono text-2xs tabular text-muted-foreground">{body.length}</span>
        </div>
        <Textarea
          id="experience"
          rows={7}
          placeholder="How long was it, what was asked, how many cleared - the detail you wish you had known beforehand."
          {...form.register("experience")}
        />
        {errors.experience && <p className="text-xs text-destructive">{errors.experience.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="difficulty">Difficulty</Label>
          <Select
            value={form.watch("difficulty") || ""}
            onValueChange={(value) =>
              form.setValue("difficulty", value as ExperienceFormValues["difficulty"], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="difficulty">
              <SelectValue placeholder="Not stated" />
            </SelectTrigger>
            <SelectContent>
              {DIFFICULTIES.map((level) => (
                <SelectItem key={level} value={level}>
                  {level}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="result">Outcome</Label>
          <Select
            value={form.watch("result") || ""}
            onValueChange={(value) =>
              form.setValue("result", value as ExperienceFormValues["result"], { shouldDirty: true })
            }
          >
            <SelectTrigger id="result">
              <SelectValue placeholder="Not stated" />
            </SelectTrigger>
            <SelectContent>
              {RESULTS.map((outcome) => (
                <SelectItem key={outcome} value={outcome}>
                  {outcome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.result && <p className="text-xs text-destructive">{errors.result.message}</p>}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="tips">Tips for the next batch</Label>
        <Textarea id="tips" rows={3} {...form.register("tips")} />
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {experience ? "Save changes" : "Share experience"}
        </Button>
      </div>
    </form>
  );
};
