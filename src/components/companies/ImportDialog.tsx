import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api, ApiError, type ImportResult } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import { parseCsvObjects } from "@/lib/csv";
import { cn } from "@/lib/utils";

/**
 * Bulk company import.
 *
 * Always previews before writing: the server runs the same validation twice,
 * once as a dry run to produce this summary and again to apply it. Importing
 * a spreadsheet blind is how you discover afterwards that a date column was
 * in the wrong format on forty rows.
 */
export function ImportDialog() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setPreview(null);
    setBusy(false);
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.csv$/i.test(file.name) && file.type !== "text/csv") {
      toast.error("That does not look like a CSV file");
      return;
    }

    const text = await file.text();
    const parsed = parseCsvObjects(text);

    if (parsed.rows.length === 0) {
      toast.error("That file has a header but no rows");
      return;
    }

    setHeaders(parsed.headers);
    setRows(parsed.rows);
    setBusy(true);
    try {
      setPreview(await api.companiesImport.run(parsed.rows, true));
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Could not read that file");
      reset();
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    try {
      const result = await api.companiesImport.run(rows, false);
      queryClient.invalidateQueries({ queryKey: qk.companies.all });
      toast.success(`Imported: ${result.created ?? 0} added, ${result.updated ?? 0} updated`);
      setOpen(false);
      reset();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "The import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Import companies from CSV</DialogTitle>
          <DialogDescription>
            Rows are matched by company name - an existing company is updated rather than
            duplicated. Nothing is written until you confirm.
          </DialogDescription>
        </DialogHeader>

        {!preview ? (
          <>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(event) => {
                void handleFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />

            <div
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void handleFile(event.dataTransfer.files?.[0]);
              }}
              className={cn(
                "rounded-lg border border-dashed p-8 text-center transition-colors",
                dragging ? "border-primary bg-primary/6" : "border-border bg-card/40",
              )}
            >
              {busy ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
              ) : (
                <FileUp className="mx-auto h-6 w-6 text-muted-foreground" />
              )}
              <p className="mt-3 text-sm text-muted-foreground">
                Drop a CSV here, or{" "}
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="font-medium text-primary underline-offset-4 hover:underline"
                >
                  choose a file
                </button>
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Recognised columns
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                Company, Location, CTC, CTC breakdown, CGPA, Roles, Selected, Website, Form,
                Deadline, PPT, OA, Interview, Bond, Eligibility, Description. Header names are
                matched loosely, and anything unrecognised is ignored - so an export from this
                site can be edited and imported straight back.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Summary label="Rows read" value={preview.total} />
              <Summary label="To add" value={preview.to_create} tone="text-success" />
              <Summary label="To update" value={preview.to_update} tone="text-info" />
            </div>

            {preview.issues.length > 0 ? (
              <div className="rounded-md border border-warning/30 bg-warning/8 p-3">
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <AlertTriangle className="h-4 w-4" />
                  {preview.issues.length} row
                  {preview.issues.length === 1 ? "" : "s"} will be skipped
                </p>
                <div className="mt-2 max-h-40 overflow-auto rounded-sm border border-border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="w-16 text-2xs uppercase">Row</TableHead>
                        <TableHead className="w-32 text-2xs uppercase">Field</TableHead>
                        <TableHead className="text-2xs uppercase">Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.issues.map((issue, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-mono text-xs tabular">{issue.row}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {issue.field ?? "-"}
                          </TableCell>
                          <TableCell className="text-xs">{issue.message}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="flex items-center gap-2 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Every row is valid.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              Read {headers.length} column{headers.length === 1 ? "" : "s"}: {headers.join(", ")}
            </p>

            <div className="flex justify-end gap-2 border-t border-border pt-4">
              <Button variant="outline" onClick={reset} disabled={busy}>
                Choose another file
              </Button>
              <Button onClick={apply} disabled={busy || preview.valid === 0}>
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Import {preview.valid} row{preview.valid === 1 ? "" : "s"}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn("mt-0.5 text-xl font-semibold", tone)}>{value}</p>
    </div>
  );
}
