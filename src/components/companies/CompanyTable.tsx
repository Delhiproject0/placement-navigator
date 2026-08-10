import { useNavigate } from "react-router-dom";
import { ArrowDown, ArrowUp, ChevronsUpDown, ExternalLink, Users } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PhaseChip } from "./PhaseChip";
import { DeadlinePill } from "./DeadlinePill";
import { CompanyLogo } from "./CompanyLogo";
import { CompanyTableSkeleton } from "@/components/skeletons/CompanyTableSkeleton";
import { EmptyState } from "@/components/EmptyState";
import type { Company } from "@/types/database";
import { resolvePhase } from "@/lib/phase";
import { cn, formatInISTHuman } from "@/lib/utils";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";

export type SortKey =
  | "name"
  | "registration_deadline"
  | "oa_datetime"
  | "interview_datetime"
  | "offered_ctc"
  | "cgpa_cutoff"
  | "phase";

export interface SortState {
  key: SortKey;
  direction: "asc" | "desc";
}

interface CompanyTableProps {
  companies: Company[];
  loading?: boolean;
  sort?: SortState;
  onSortChange?: (key: SortKey) => void;
  /** Rendered when there are no rows - lets the caller explain why. */
  empty?: React.ReactNode;
}

interface ColumnDef {
  key: SortKey | null;
  label: string;
  className?: string;
  numeric?: boolean;
}

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Company", className: "min-w-[13rem]" },
  { key: "phase", label: "Phase" },
  { key: "registration_deadline", label: "Registration" },
  { key: "cgpa_cutoff", label: "CGPA", numeric: true },
  { key: "offered_ctc", label: "CTC", numeric: true },
  { key: null, label: "Roles" },
  { key: null, label: "Location" },
  { key: "oa_datetime", label: "OA" },
  { key: "interview_datetime", label: "Interview" },
  { key: null, label: "Selected", numeric: true },
  { key: null, label: "Form" },
];

export const CompanyTable = ({
  companies,
  loading,
  sort,
  onSortChange,
  empty,
}: CompanyTableProps) => {
  const navigate = useNavigate();

  if (loading) return <CompanyTableSkeleton />;

  if (companies.length === 0) {
    return (
      empty ?? (
        <EmptyState
          variant="search"
          title="No companies match"
          description="Try clearing the filters, or widening the search term."
        />
      )
    );
  }

  const open = (id: string) => navigate(`/companies/${id}`);

  return (
    <>
      {/* Desktop: the full grid. Wrapped in its own scroll container so eleven
          columns never force the page body to scroll sideways. */}
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card shadow-xs md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {COLUMNS.map((column) => {
                const active = sort?.key === column.key;
                const sortable = Boolean(column.key && onSortChange);
                return (
                  <TableHead
                    key={column.label}
                    aria-sort={
                      active ? (sort?.direction === "asc" ? "ascending" : "descending") : undefined
                    }
                    className={cn(
                      "h-10 whitespace-nowrap bg-muted/40 text-2xs font-semibold uppercase tracking-wider text-muted-foreground",
                      column.numeric && "text-right",
                      column.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => onSortChange?.(column.key as SortKey)}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-xs px-1 py-0.5 transition-colors hover:text-foreground",
                          active && "text-foreground",
                          column.numeric && "flex-row-reverse",
                        )}
                      >
                        {column.label}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {companies.map((company) => (
              <TableRow
                key={company.id}
                onClick={() => open(company.id)}
                className={cn(
                  "group cursor-pointer border-l-2 border-l-transparent transition-colors",
                  "hover:border-l-primary hover:bg-muted/40",
                )}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <CompanyLogo name={company.name} url={company.logo_url} />
                    <span className="transition-colors group-hover:text-primary">
                      {company.name}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <PhaseChip phase={resolvePhase(company)} />
                </TableCell>

                <TableCell>
                  <DeadlinePill deadline={company.registration_deadline} />
                </TableCell>

                <TableCell className="text-right font-mono text-sm tabular">
                  {company.cgpa_cutoff != null ? Number(company.cgpa_cutoff).toFixed(2) : "--"}
                </TableCell>

                <TableCell
                  className="whitespace-nowrap text-right font-mono text-sm tabular"
                  title={company.offered_ctc ?? undefined}
                >
                  {formatCtc(parseCtcToNumber(company.offered_ctc))}
                </TableCell>

                <TableCell>
                  <div className="flex max-w-[13rem] items-center gap-1">
                    {company.roles?.length ? (
                      <>
                        <Badge
                          variant="outline"
                          className="max-w-[9.5rem] truncate whitespace-nowrap text-2xs font-normal"
                          title={company.roles.join(", ")}
                        >
                          {company.roles[0]}
                        </Badge>
                        {company.roles.length > 1 && (
                          <Badge
                            variant="outline"
                            className="shrink-0 text-2xs font-normal"
                            title={company.roles.slice(1).join(", ")}
                          >
                            +{company.roles.length - 1}
                          </Badge>
                        )}
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">--</span>
                    )}
                  </div>
                </TableCell>

                <TableCell className="max-w-[11rem] text-sm text-muted-foreground">
                  <span className="block truncate" title={company.job_location ?? undefined}>
                    {company.job_location ?? "--"}
                  </span>
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {company.oa_datetime ? formatInISTHuman(company.oa_datetime) : "--"}
                </TableCell>

                <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                  {company.interview_datetime ? formatInISTHuman(company.interview_datetime) : "--"}
                </TableCell>

                <TableCell className="text-right">
                  {company.people_selected != null ? (
                    <span className="inline-flex items-center gap-1 font-mono text-sm tabular">
                      <Users className="h-3 w-3 text-muted-foreground" />
                      {company.people_selected}
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </TableCell>

                <TableCell>
                  {company.external_form ? (
                    <a
                      href={company.external_form}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center text-primary transition-opacity hover:opacity-75"
                      aria-label={`Open the external form for ${company.name}`}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <span className="text-sm text-muted-foreground">--</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: the same rows as cards. An eleven-column table on a phone is
          a horizontal-scroll puzzle, so the four values that actually drive a
          decision get promoted and the rest are dropped. */}
      <div className="grid gap-3 md:hidden">
        {companies.map((company) => (
          <button
            key={company.id}
            type="button"
            onClick={() => open(company.id)}
            className="rounded-lg border border-border bg-card p-4 text-left shadow-xs transition-shadow active:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyLogo name={company.name} url={company.logo_url} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{company.name}</p>
                  {company.job_location && (
                    <p className="truncate text-xs text-muted-foreground">{company.job_location}</p>
                  )}
                </div>
              </div>
              <PhaseChip phase={resolvePhase(company)} />
            </div>

            <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-border pt-3">
              <div>
                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">CTC</dt>
                <dd className="mt-0.5 truncate font-mono text-xs tabular" title={company.offered_ctc ?? undefined}>
                  {formatCtc(parseCtcToNumber(company.offered_ctc))}
                </dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">CGPA</dt>
                <dd className="mt-0.5 font-mono text-xs tabular">
                  {company.cgpa_cutoff != null ? Number(company.cgpa_cutoff).toFixed(2) : "--"}
                </dd>
              </div>
              <div>
                <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Closes</dt>
                <dd className="mt-0.5">
                  <DeadlinePill deadline={company.registration_deadline} />
                </dd>
              </div>
            </dl>
          </button>
        ))}
      </div>
    </>
  );
};
