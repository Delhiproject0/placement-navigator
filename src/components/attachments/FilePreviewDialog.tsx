import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { isImage, isPdf, fileKindLabel, formatBytes } from "@/lib/storage";
import type { Attachment } from "@/lib/api";

interface FilePreviewDialogProps {
  attachment: Attachment | null;
  onClose: () => void;
}

/**
 * Inline preview for the two types worth previewing.
 *
 * Media loads are not CORS-gated, so an <img> or an <iframe> pointed straight
 * at the storage host works even though it sends no CORS headers. Anything
 * that needs the file's *text* has to go through the API's /file-text proxy
 * instead - fetch() against that host is blocked.
 */
export function FilePreviewDialog({ attachment, onClose }: FilePreviewDialogProps) {
  const open = Boolean(attachment);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 font-display text-base">
            {attachment?.title ?? fileKindLabel(attachment?.mime_type)}
            {attachment?.size_bytes ? (
              <span className="ml-2 font-mono text-2xs tabular font-normal text-muted-foreground">
                {formatBytes(attachment.size_bytes)}
              </span>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {attachment && (
          <div className="min-h-[50vh] overflow-auto rounded-md border border-border bg-muted/30">
            {isImage(attachment.mime_type) ? (
              <img
                src={attachment.url}
                alt={attachment.title ?? ""}
                className="mx-auto max-h-[70vh] w-auto object-contain"
              />
            ) : isPdf(attachment.mime_type) ? (
              <iframe
                src={attachment.url}
                title={attachment.title ?? "PDF preview"}
                className="h-[70vh] w-full border-0"
              />
            ) : (
              <div className="grid h-[50vh] place-items-center text-sm text-muted-foreground">
                This file type cannot be previewed here.
              </div>
            )}
          </div>
        )}

        {attachment && (
          <div className="flex justify-end">
            <Button variant="outline" asChild>
              <a href={attachment.url} target="_blank" rel="noreferrer">
                Open in a new tab
                <ExternalLink className="ml-2 h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
