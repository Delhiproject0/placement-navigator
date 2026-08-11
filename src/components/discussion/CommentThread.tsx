import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MessageSquare, Reply, Trash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { VoteButton } from "./VoteButton";
import { useAuth } from "@/hooks/useAuth";
import { api, ApiError, type Comment, type CommentableType } from "@/lib/api";
import { formatInISTHuman } from "@/lib/utils";

interface CommentThreadProps {
  entityType: CommentableType;
  entityId: string;
}

export function CommentThread({ entityType, entityId }: CommentThreadProps) {
  const { user, canEdit } = useAuth();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState("");

  const queryKey = ["comments", entityType, entityId] as const;

  const { data: comments = [], isPending } = useQuery({
    queryKey,
    queryFn: () => api.comments.list(entityType, entityId),
  });

  const post = useMutation({
    mutationFn: (input: { body: string; parentId?: string }) =>
      api.comments.create({
        entity_type: entityType,
        entity_id: entityId,
        body: input.body,
        parent_id: input.parentId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
      setDraft("");
      setReplyDraft("");
      setReplyTo(null);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not post that"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.comments.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Could not remove that"),
  });

  /**
   * Replies grouped under their parent.
   *
   * The API returns a flat list in creation order, which is the right shape to
   * send; nesting is a display concern and one level deep by design.
   */
  const threads = useMemo(() => {
    const roots = comments.filter((comment) => !comment.parent_id);
    const repliesBy = new Map<string, Comment[]>();
    for (const comment of comments) {
      if (!comment.parent_id) continue;
      const list = repliesBy.get(comment.parent_id);
      if (list) list.push(comment);
      else repliesBy.set(comment.parent_id, [comment]);
    }
    return roots.map((root) => ({ root, replies: repliesBy.get(root.id) ?? [] }));
  }, [comments]);

  const canDelete = (comment: Comment) =>
    Boolean(user) && (comment.author_id === user?.id || canEdit);

  return (
    <section className="mt-4 border-t border-border pt-4">
      <h4 className="mb-3 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Discussion
        {comments.length > 0 && <span className="font-mono tabular">{comments.length}</span>}
      </h4>

      {isPending ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : (
        <div className="space-y-3">
          {threads.map(({ root, replies }) => (
            <div key={root.id}>
              <CommentRow
                comment={root}
                queryKey={queryKey}
                canDelete={canDelete(root)}
                onReply={() => {
                  setReplyTo(replyTo === root.id ? null : root.id);
                  setReplyDraft("");
                }}
                onDelete={() => remove.mutate(root.id)}
                canReply={Boolean(user)}
              />

              {replies.length > 0 && (
                // A single indent rail, because the nesting never goes deeper.
                <div className="ml-4 mt-2 space-y-2 border-l-2 border-border pl-3">
                  {replies.map((reply) => (
                    <CommentRow
                      key={reply.id}
                      comment={reply}
                      queryKey={queryKey}
                      canDelete={canDelete(reply)}
                      onDelete={() => remove.mutate(reply.id)}
                      canReply={false}
                    />
                  ))}
                </div>
              )}

              {replyTo === root.id && (
                <div className="ml-4 mt-2 border-l-2 border-border pl-3">
                  <Textarea
                    rows={2}
                    value={replyDraft}
                    onChange={(event) => setReplyDraft(event.target.value)}
                    placeholder="Reply..."
                    className="text-sm"
                  />
                  <div className="mt-1.5 flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      disabled={!replyDraft.trim() || post.isPending}
                      onClick={() => post.mutate({ body: replyDraft, parentId: root.id })}
                    >
                      {post.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                      Reply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {user ? (
            <div className="pt-1">
              <Textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={
                  comments.length === 0 ? "Ask a follow-up question..." : "Add to the discussion..."
                }
                className="text-sm"
              />
              {draft.trim() && (
                <div className="mt-1.5 flex justify-end">
                  <Button size="sm" disabled={post.isPending} onClick={() => post.mutate({ body: draft })}>
                    {post.isPending && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
                    Post
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              <Link to="/auth" className="text-primary underline-offset-4 hover:underline">
                Sign in
              </Link>{" "}
              to ask a question about this.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

interface CommentRowProps {
  comment: Comment;
  queryKey: readonly unknown[];
  canDelete: boolean;
  canReply: boolean;
  onReply?: () => void;
  onDelete: () => void;
}

function CommentRow({ comment, queryKey, canDelete, canReply, onReply, onDelete }: CommentRowProps) {
  // A removed comment keeps its slot so the replies below it still make sense,
  // but carries no author and no text.
  if (comment.is_deleted) {
    return (
      <p className="py-1 text-xs italic text-muted-foreground">This comment was removed.</p>
    );
  }

  const name = comment.author?.full_name ?? "Anonymous";

  return (
    <div className="flex gap-2.5">
      <Avatar className="mt-0.5 h-6 w-6 shrink-0">
        <AvatarImage src={comment.author?.avatar_url ?? undefined} alt="" />
        <AvatarFallback className="bg-muted text-[0.6rem]">
          {name.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <p className="text-2xs text-muted-foreground">
          <span className="font-medium text-foreground">{name}</span> ·{" "}
          {formatInISTHuman(comment.created_at)}
          {comment.edited_at && " · edited"}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-sm">{comment.body}</p>

        <div className="mt-1.5 flex items-center gap-2">
          <VoteButton
            entityType="comment"
            entityId={comment.id}
            score={comment.score}
            myVote={comment.my_vote}
            invalidate={queryKey}
          />
          {canReply && onReply && (
            <button
              type="button"
              onClick={onReply}
              className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Reply className="h-3 w-3" />
              Reply
            </button>
          )}
          {canDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-2xs text-muted-foreground transition-colors hover:text-destructive"
                >
                  <Trash className="h-3 w-3" />
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this comment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The text is removed. Any replies stay, so the thread still reads.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={onDelete}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
    </div>
  );
}
