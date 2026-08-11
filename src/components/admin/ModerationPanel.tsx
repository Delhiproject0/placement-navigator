import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Trash } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { api, ApiError } from "@/lib/api";
import { formatInISTHuman } from "@/lib/utils";

/**
 * Every contribution across every company, newest first.
 *
 * Moderating from the company pages alone means you have to already know where
 * a bad entry is, so in practice spam only ever gets removed if somebody
 * happens across it.
 */
export function ModerationPanel() {
  const queryClient = useQueryClient();

  const { data, isPending } = useQuery({
    queryKey: ["admin", "contributions"],
    queryFn: () => api.moderation.contributions(),
  });

  const remove = useMutation({
    mutationFn: ({ kind, id }: { kind: "experience" | "question"; id: string }) =>
      kind === "experience" ? api.experiences.remove(id) : api.questions.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "contributions"] });
      // The company pages show the same rows, so their caches are now stale.
      queryClient.invalidateQueries({ queryKey: ["experiences"] });
      queryClient.invalidateQueries({ queryKey: ["questions"] });
      toast.success("Removed");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not remove that entry"),
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Shimmer key={index} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const experiences = data?.experiences ?? [];
  const questions = data?.questions ?? [];

  return (
    <Tabs defaultValue="experiences">
      <TabsList>
        <TabsTrigger value="experiences">
          Experiences
          <span className="ml-1.5 font-mono text-2xs tabular text-muted-foreground">
            {experiences.length}
          </span>
        </TabsTrigger>
        <TabsTrigger value="questions">
          Questions
          <span className="ml-1.5 font-mono text-2xs tabular text-muted-foreground">
            {questions.length}
          </span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="experiences" className="mt-4 space-y-2">
        {experiences.length === 0 ? (
          <EmptyState variant="experiences" title="Nothing to moderate" />
        ) : (
          experiences.map((entry) => (
            <Row
              key={entry.id}
              company={entry.companies}
              heading={entry.round_name}
              body={entry.experience}
              author={entry.author}
              createdAt={entry.created_at}
              badges={[entry.difficulty, entry.result].filter(Boolean) as string[]}
              onDelete={() => remove.mutate({ kind: "experience", id: entry.id })}
            />
          ))
        )}
      </TabsContent>

      <TabsContent value="questions" className="mt-4 space-y-2">
        {questions.length === 0 ? (
          <EmptyState variant="questions" title="Nothing to moderate" />
        ) : (
          questions.map((entry) => (
            <Row
              key={entry.id}
              company={entry.companies}
              heading={entry.question}
              body={entry.answer ?? ""}
              author={entry.author}
              createdAt={entry.created_at}
              badges={[entry.question_type, entry.topic].filter(Boolean) as string[]}
              onDelete={() => remove.mutate({ kind: "question", id: entry.id })}
            />
          ))
        )}
      </TabsContent>
    </Tabs>
  );
}

interface RowProps {
  company: { id: string; name: string } | null;
  heading: string;
  body: string;
  author: { full_name: string | null; email: string } | null;
  createdAt: string;
  badges: string[];
  onDelete: () => void;
}

function Row({ company, heading, body, author, createdAt, badges, onDelete }: RowProps) {
  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {company && (
              <Link
                to={`/companies/${company.id}`}
                className="text-2xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {company.name}
              </Link>
            )}
            {badges.map((badge) => (
              <Badge key={badge} variant="outline" className="text-2xs font-normal">
                {badge}
              </Badge>
            ))}
          </div>
          <h3 className="mt-1 truncate font-medium">{heading}</h3>
          <p className="mt-1 text-2xs text-muted-foreground">
            {/* The email, not just the display name - moderation needs to
                identify the account, and two students can share a name. */}
            {author ? `${author.full_name ?? "No name"} (${author.email})` : "Anonymous"} -{" "}
            {formatInISTHuman(createdAt)}
          </p>
          {body && <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{body}</p>}
        </div>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Remove this entry">
              <Trash className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove this contribution?</AlertDialogTitle>
              <AlertDialogDescription>
                It disappears from the company page immediately. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={onDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </article>
  );
}
