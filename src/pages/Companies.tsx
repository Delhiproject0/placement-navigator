import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useCompanies } from "@/hooks/queries";
import { Layout } from "@/components/layout/Layout";
import { CompanyTable, type SortKey, type SortState } from "@/components/companies/CompanyTable";
import { CompanyForm } from "@/components/companies/CompanyForm";
import { ImportDialog } from "@/components/companies/ImportDialog";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Plus, Search, X } from "lucide-react";
import { PHASES, phaseMeta, phaseRank, resolvePhase, isPhase, type Phase } from "@/lib/phase";
import { parseCtcToNumber } from "@/lib/ctc";
import { downloadCsv, toCsv } from "@/lib/csv";
import { formatInISTHuman } from "@/lib/utils";

const Companies = () => {
  const { canEdit } = useAuth();
  const { data, isPending: loading } = useCompanies();
  const companies = useMemo(() => data ?? [], [data]);
  const [dialogOpen, setDialogOpen] = useState(() => new URLSearchParams(window.location.search).has("new"));

  /**
   * Filter and sort state lives in the URL. The home page has always linked to
   * `/companies?phase=registration_open`, but nothing here read the query
   * string, so that link silently landed on an unfiltered list. URL state also
   * makes a filtered view shareable and survives a back navigation.
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const search = searchParams.get("q") ?? "";
  const phaseParam = searchParams.get("phase");
  const phaseFilter: Phase | "all" = isPhase(phaseParam) ? phaseParam : "all";
  const sort: SortState = {
    key: (searchParams.get("sort") as SortKey) || "registration_deadline",
    direction: searchParams.get("dir") === "asc" ? "asc" : "desc",
  };

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (!value || value === "all") next.delete(key);
    else next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const handleSortChange = (key: SortKey) => {
    const next = new URLSearchParams(searchParams);
    next.set("sort", key);
    // Clicking the active column flips direction; a new column starts
    // descending, which is what you want for dates and money.
    next.set("dir", sort.key === key && sort.direction === "desc" ? "asc" : "desc");
    setSearchParams(next, { replace: true });
  };

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();

    const filtered = companies.filter((company) => {
      const matchesSearch =
        !term ||
        company.name.toLowerCase().includes(term) ||
        company.roles?.some((role) => role.toLowerCase().includes(term)) ||
        company.job_location?.toLowerCase().includes(term);

      // Filter on the *derived* phase, the same value the chip renders. The
      // old code filtered on the raw four-value status column while the table
      // displayed the seven-value computed one, so a row could read "OA done"
      // and match only the "Upcoming" filter.
      const matchesPhase = phaseFilter === "all" || resolvePhase(company) === phaseFilter;

      return matchesSearch && matchesPhase;
    });

    const direction = sort.direction === "asc" ? 1 : -1;
    const time = (value?: string | null) => (value ? new Date(value).getTime() : null);

    // Rows with no value sort last in both directions - a company with no OA
    // date is not "the earliest OA", which is what treating null as 0 implied.
    const compare = (a: number | string | null, b: number | string | null) => {
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      if (typeof a === "string" && typeof b === "string") return direction * a.localeCompare(b);
      return direction * ((a as number) - (b as number));
    };

    const key = sort.key;
    return [...filtered].sort((a, b) => {
      switch (key) {
        case "name":
          return compare(a.name, b.name);
        case "registration_deadline":
          return compare(time(a.registration_deadline), time(b.registration_deadline));
        case "oa_datetime":
          return compare(time(a.oa_datetime), time(b.oa_datetime));
        case "interview_datetime":
          return compare(time(a.interview_datetime), time(b.interview_datetime));
        case "offered_ctc":
          return compare(parseCtcToNumber(a.offered_ctc), parseCtcToNumber(b.offered_ctc));
        case "cgpa_cutoff":
          return compare(a.cgpa_cutoff ?? null, b.cgpa_cutoff ?? null);
        case "phase":
          return compare(phaseRank(resolvePhase(a)), phaseRank(resolvePhase(b)));
        default:
          return 0;
      }
    });
  }, [companies, search, phaseFilter, sort.key, sort.direction]);

  const hasFilters = Boolean(search) || phaseFilter !== "all";

  const exportCsv = () => {
    const csv = toCsv(visible, [
      { header: "Company", value: (c) => c.name },
      { header: "Phase", value: (c) => phaseMeta(resolvePhase(c)).label },
      { header: "Location", value: (c) => c.job_location },
      { header: "CTC", value: (c) => c.offered_ctc },
      { header: "CTC breakdown", value: (c) => c.ctc_distribution },
      { header: "CGPA", value: (c) => c.cgpa_cutoff },
      { header: "Roles", value: (c) => c.roles?.join(", ") },
      { header: "Selected", value: (c) => c.people_selected },
      { header: "Deadline", value: (c) => formatInISTHuman(c.registration_deadline) },
      { header: "PPT", value: (c) => formatInISTHuman(c.ppt_datetime) },
      { header: "OA", value: (c) => formatInISTHuman(c.oa_datetime) },
      { header: "Interview", value: (c) => formatInISTHuman(c.interview_datetime) },
      { header: "Website", value: (c) => c.website_url },
      { header: "Form", value: (c) => c.external_form },
      { header: "Bond", value: (c) => c.bond_details },
      { header: "Eligibility", value: (c) => c.eligibility_criteria },
      { header: "Description", value: (c) => c.description },
    ]);
    downloadCsv(`placetrack-companies-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <Layout>
      <div className="container py-8 md:py-10">
        <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Companies</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {loading
                ? "Loading the drive calendar"
                : `${visible.length} of ${companies.length} ${companies.length === 1 ? "company" : "companies"}`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportCsv} disabled={visible.length === 0}>
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>

            {canEdit && <ImportDialog />}

            {canEdit && (
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add company
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="font-display">Add a company</DialogTitle>
                </DialogHeader>
                <CompanyForm onSuccess={() => setDialogOpen(false)} />
              </DialogContent>
            </Dialog>
            )}
          </div>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by company, role or location"
              value={search}
              onChange={(event) => setParam("q", event.target.value)}
              className="pl-9"
              aria-label="Search companies"
            />
          </div>

          <Select value={phaseFilter} onValueChange={(value) => setParam("phase", value)}>
            <SelectTrigger className="sm:w-52" aria-label="Filter by phase">
              <SelectValue placeholder="All phases" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All phases</SelectItem>
              {PHASES.map((phase) => (
                <SelectItem key={phase} value={phase}>
                  {phaseMeta(phase).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
            >
              <X className="mr-1.5 h-3.5 w-3.5" />
              Clear
            </Button>
          )}
        </div>

        <CompanyTable
          companies={visible}
          loading={loading}
          sort={sort}
          onSortChange={handleSortChange}
          empty={
            hasFilters ? (
              <EmptyState
                variant="search"
                title="Nothing matches those filters"
                description="No company matches this search and phase combination."
                action={
                  <Button
                    variant="outline"
                    onClick={() => setSearchParams(new URLSearchParams(), { replace: true })}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                variant="companies"
                title="No companies yet"
                description="Once a drive is scheduled it will show up here."
              />
            )
          }
        />
      </div>
    </Layout>
  );
};

export default Companies;
