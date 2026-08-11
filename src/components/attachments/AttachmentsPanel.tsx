import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Download,
  FileSpreadsheet,
  FileText,
  ImageIcon,
  Loader2,
  Paperclip,
  Trash,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
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
import { useAttachments, useDeleteAttachment } from "@/hooks/queries";
import { qk } from "@/lib/queryKeys";
import { useAuth } from "@/hooks/useAuth";
import { ApiError, type Attachment } from "@/lib/api";
import {
  fileKindLabel,
  formatBytes,
  isImage,
  isPdf,
  uploadFile,
  validateFile,
  type EntityType,
} from "@/lib/storage";
import { formatInISTHuman } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { FilePreviewDialog } from "./FilePreviewDialog";

interface AttachmentsPanelProps {
  entityType: EntityType;
  entityId: string;
  /** False for a read-only view (a signed-out visitor, say). */
  canUpload: boolean;
  title?: string;
  description?: string;
  /** Copy for the empty state, which is context-specific in a way the
      generic "upload a job description" line is not. */
  emptyDescription?: string;
}

interface PendingUpload {
  name: string;
  progress: number;
}

export function AttachmentsPanel({
  entityType,
  entityId,
  canUpload,
  title = "Documents",
  description = "Job descriptions, offer letters, question papers and other files.",
  emptyDescription,
}: AttachmentsPanelProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: attachments = [], isPending } = useAttachments(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);

  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<Attachment | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Drag events fire for every child element; counting enter/leave is what
  // stops the highlight flickering as the cursor crosses them.
  const dragDepth = useRef(0);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;

      for (const file of Array.from(files)) {
        const problem = validateFile(file);
        if (problem) {
          toast.error(`${file.name}: ${problem}`);
          continue;
        }

        setPending((current) => [...current, { name: file.name, progress: 0 }]);
        try {
          await uploadFile(file, entityType, entityId, (fraction) => {
            setPending((current) =>
              current.map((item) => (item.name === file.name ? { ...item, progress: fraction } : item)),
            );
          });
          toast.success(`${file.name} uploaded`);
        } catch (error) {
          toast.error(
            error instanceof ApiError ? `${file.name}: ${error.message}` : `${file.name} failed to upload`,
          );
        } finally {
          setPending((current) => current.filter((item) => item.name !== file.name));
        }
      }

      queryClient.invalidateQueries({ queryKey: qk.attachments.byEntity(entityType, entityId) });
    },
    [entityType, entityId, queryClient],
  );

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
        {canUpload && (
          <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" />
            Upload
          </Button>
        )}
      </div>

      {canUpload && (
        <>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="sr-only"
            onChange={(event) => {
              void handleFiles(event.target.files);
              // Reset so re-selecting the same file fires change again.
              event.target.value = "";
            }}
          />

          <div
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setDragging(true);
            }}
            onDragLeave={() => {
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) setDragging(false);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              "mb-3 rounded-lg border border-dashed p-5 text-center transition-colors",
              dragging ? "border-primary bg-primary/6" : "border-border bg-card/40",
            )}
          >
            <Paperclip className="mx-auto h-5 w-5 text-muted-foreground" />
            <p className="mt-2 text-sm text-muted-foreground">
              Drop files here, or{" "}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                browse
              </button>
            </p>
            <p className="mt-1 text-2xs text-muted-foreground">
              Images, PDFs, Word, Excel or text. Up to 10MB each.
            </p>
          </div>
        </>
      )}

      {pending.length > 0 && (
        <ul className="mb-3 space-y-2">
          {pending.map((item) => (
            <li key={item.name} className="rounded-md border border-border bg-card p-3">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span className="truncate">{item.name}</span>
                <span className="ml-auto font-mono text-2xs tabular text-muted-foreground">
                  {Math.round(item.progress * 100)}%
                </span>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-[999px] bg-muted">
                <div
                  className="h-full rounded-[999px] bg-primary transition-[width] duration-200"
                  style={{ width: `${item.progress * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {isPending ? (
        <div className="h-20 animate-pulse rounded-lg bg-muted" />
      ) : attachments.length === 0 ? (
        <EmptyState
          variant="documents"
          title="No files yet"
          description={
            canUpload
              ? (emptyDescription ?? "Upload a job description, an offer letter or a question paper.")
              : "Nothing has been attached here."
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          {attachments.map((attachment) => {
            const mine = attachment.uploaded_by === user?.id;
            return (
              <li key={attachment.id} className="flex items-center gap-3 px-4 py-3">
                <FileIcon mimeType={attachment.mime_type} />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {attachment.title ?? originalNameOf(attachment.storage_file_name)}
                  </p>
                  <p className="font-mono text-2xs tabular text-muted-foreground">
                    {fileKindLabel(attachment.mime_type)}
                    {attachment.size_bytes ? ` - ${formatBytes(attachment.size_bytes)}` : ""} -{" "}
                    {formatInISTHuman(attachment.created_at)}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {(isImage(attachment.mime_type) || isPdf(attachment.mime_type)) && (
                    <Button variant="ghost" size="sm" onClick={() => setPreview(attachment)}>
                      Preview
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" asChild aria-label="Download">
                    <a href={attachment.url} target="_blank" rel="noreferrer" download>
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>

                  {(mine || canUpload) && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Delete file">
                          <Trash className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this file?</AlertDialogTitle>
                          <AlertDialogDescription>
                            The file is removed from storage as well as from this page. This cannot be
                            undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => remove.mutate(attachment.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <FilePreviewDialog attachment={preview} onClose={() => setPreview(null)} />
    </section>
  );
}

/** Strips the `entity-id-uuid-` scope prefix back off for display. */
function originalNameOf(storageFileName: string): string {
  const parts = storageFileName.split("-");
  // entityType, then a 5-part uuid, then the original name.
  return parts.length > 7 ? parts.slice(7).join("-") : storageFileName;
}

function FileIcon({ mimeType }: { mimeType: string | null }) {
  const Icon = isImage(mimeType)
    ? ImageIcon
    : mimeType?.includes("sheet") || mimeType?.includes("excel")
      ? FileSpreadsheet
      : FileText;

  return (
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-muted">
      <Icon className="h-4 w-4 text-muted-foreground" />
    </span>
  );
}
