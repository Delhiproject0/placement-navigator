import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { questionSchema, type QuestionFormValues } from "@/lib/schemas";
import { useSaveQuestion } from "@/hooks/queries";
import { ApiError } from "@/lib/api";
import type { InterviewQuestion } from "@/types/database";

interface QuestionFormProps {
  companyId: string;
  question?: InterviewQuestion;
  onSuccess: () => void;
  onCancel?: () => void;
}

const TYPES = ["DSA", "System Design", "Behavioral", "Technical", "HR", "Puzzle"] as const;

export const QuestionForm = ({ companyId, question, onSuccess, onCancel }: QuestionFormProps) => {
  const save = useSaveQuestion(companyId);

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      question: question?.question ?? "",
      answer: question?.answer ?? "",
      topic: question?.topic ?? "",
      question_type: (question?.question_type as QuestionFormValues["question_type"]) ?? "",
    },
  });

  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await save.mutateAsync({
        id: question?.id,
        question: values.question.trim(),
        answer: values.answer?.trim() || null,
        topic: values.topic?.trim() || null,
        question_type: values.question_type || null,
      });
      form.reset();
      onSuccess();
    } catch (error) {
      if (error instanceof ApiError && error.details) {
        for (const [field, message] of Object.entries(error.details)) {
          form.setError(field as keyof QuestionFormValues, { message });
        }
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="question">
          Question<span className="ml-0.5 text-destructive">*</span>
        </Label>
        <Textarea id="question" rows={3} {...form.register("question")} />
        {errors.question && <p className="text-xs text-destructive">{errors.question.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="answer">Answer or approach</Label>
        <Textarea
          id="answer"
          rows={5}
          placeholder="How you solved it, or how you would have."
          {...form.register("answer")}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="topic">Topic</Label>
          <Input id="topic" placeholder="Graphs, OS, Probability..." {...form.register("topic")} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="question_type">Type</Label>
          <Select
            value={form.watch("question_type") || ""}
            onValueChange={(value) =>
              form.setValue("question_type", value as QuestionFormValues["question_type"], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger id="question_type">
              <SelectValue placeholder="Not stated" />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {question ? "Save changes" : "Add question"}
        </Button>
      </div>
    </form>
  );
};
