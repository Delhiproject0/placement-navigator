import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { api, type AuditEntry } from "@/lib/api";
import { formatInISTHuman } from "@/lib/utils";
import { cn } from "@/lib/utils";

const ACTION_TONE: Record<AuditEntry["action"], string> = {
  INSERT: "text-success",
  UPDATE: "text-info",
  DELETE: "text-destructive",
};

/**
 * Who changed what.
 *
 * Rows are written by database triggers rather than by the API, so an action
 * cannot happen without being recorded - including one taken through psql or
 * the Supabase dashboard.
 */
export function AuditPanel() {
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  const { data, isPending } = useQuery({
    queryKey: ["admin", "audit", page],
    queryFn: () => api.audit.list(page),
    placeholderData: (previous) => previous,
  });

  if (isPending) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Shimmer key={index} className="h-10 w-full rounded-sm" />
        ))}
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const perPage = data?.per_page ?? 50;
  const pageCount = Math.max(Math.ceil(total / perPage), 1);

  if (entries.length === 0) {
    return <EmptyState variant="documents" title="Nothing recorded yet" />;
  }

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="text-2xs uppercase tracking-wider">When</TableHead>
              <TableHead className="text-2xs uppercase tracking-wider">Who</TableHead>
              <TableHead className="text-2xs uppercase tracking-wider">Action</TableHead>
              <TableHead className="text-2xs uppercase tracking-wider">Record</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <Fragment key={entry.id}>
                <TableRow>
                  <TableCell className="whitespace-nowrap font-mono text-2xs tabular text-muted-foreground">
                    {formatInISTHuman(entry.created_at)}
                  </TableCell>
                  <TableCell className="text-xs">
                    {/* Null means it happened outside the app - worth showing
                        plainly rather than as a blank cell. */}
                    {entry.actor_email ?? (
                      <span className="text-muted-foreground">outside the app</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("text-2xs font-medium", ACTION_TONE[entry.action])}
                    >
                      {entry.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-2xs text-muted-foreground">
                    {entry.table_name}
                    {entry.record_id ? ` · ${entry.record_id.slice(0, 8)}` : ""}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setExpanded(expanded === entry.id ? null : entry.id)}
                    >
                      {expanded === entry.id ? "Hide" : "Diff"}
                    </Button>
                  </TableCell>
                </TableRow>

                {expanded === entry.id && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="bg-muted/30">
                      <ChangeDiff before={entry.before} after={entry.after} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Page {page} of {pageCount} · {total} entries
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Only the fields that actually changed.
 *
 * Dumping both JSON blobs makes the reader diff them by eye, which for a
 * twenty-column company row means the one edited field is invisible.
 */
function ChangeDiff({
  before,
  after,
}: {
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}) {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((key) => {
      if (key === "updated_at") return false; // changes on every write; noise
      return JSON.stringify(before?.[key]) !== JSON.stringify(after?.[key]);
    })
    .sort();

  if (keys.length === 0) {
    return <p className="py-2 text-xs text-muted-foreground">No field-level changes recorded.</p>;
  }

  const render = (value: unknown) =>
    value === null || value === undefined ? "—" : JSON.stringify(value).replace(/^"|"$/g, "");

  return (
    <dl className="space-y-1 py-2">
      {keys.map((key) => (
        <div key={key} className="grid grid-cols-[10rem_1fr] gap-3 text-xs">
          <dt className="truncate font-mono text-muted-foreground">{key}</dt>
          <dd className="min-w-0 font-mono">
            {before && <span className="text-destructive line-through">{render(before[key])}</span>}
            {before && after && <span className="mx-2 text-muted-foreground">→</span>}
            {after && <span className="text-success">{render(after[key])}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
