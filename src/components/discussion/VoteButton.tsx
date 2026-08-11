import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError, type VotableType } from "@/lib/api";
import { cn } from "@/lib/utils";

interface VoteButtonProps {
  entityType: VotableType;
  entityId: string;
  score: number;
  myVote: number;
  /** Query key to invalidate once the vote lands. */
  invalidate: readonly unknown[];
}

/**
 * Upvote only.
 *
 * A downvote on someone's account of a rejection reads as a judgement on them
 * rather than on the writeup, so the useful signal here is "this helped" and
 * the absence of it. The API still accepts -1, and the score sums either way.
 */
export function VoteButton({ entityType, entityId, score, myVote, invalidate }: VoteButtonProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const vote = useMutation({
    // Voting again clears it, which is what makes the button a toggle.
    mutationFn: () => api.votes.cast(entityType, entityId, myVote === 1 ? 0 : 1),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: invalidate }),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not record your vote"),
  });

  const voted = myVote === 1;

  return (
    <button
      type="button"
      disabled={!user || vote.isPending}
      onClick={() => vote.mutate()}
      title={user ? (voted ? "Remove your vote" : "This was helpful") : "Sign in to vote"}
      aria-pressed={voted}
      aria-label={voted ? "Remove your vote" : "Mark as helpful"}
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-2xs transition-colors",
        voted
          ? "border-primary/40 bg-primary/12 text-primary"
          : "border-border text-muted-foreground hover:text-foreground",
        !user && "cursor-default opacity-60",
      )}
    >
      <ChevronUp className={cn("h-3.5 w-3.5", voted && "text-primary")} />
      <span className="font-mono tabular">{score}</span>
    </button>
  );
}
