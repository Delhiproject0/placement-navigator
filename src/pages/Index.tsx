import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useCompanies } from "@/hooks/queries";
import { Layout } from "@/components/layout/Layout";
import { Seo } from "@/components/Seo";
import { PhaseChip } from "@/components/companies/PhaseChip";
import { DeadlinePill } from "@/components/companies/DeadlinePill";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { DeadlineTicker } from "@/components/DeadlineTicker";
import { ArchiveHint, ArchiveHintLine } from "@/components/ArchiveHint";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, CalendarClock } from "lucide-react";
import { resolvePhase } from "@/lib/phase";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";
import { formatInISTHuman } from "@/lib/utils";
import type { Company } from "@/types/database";

interface Stats {
  total: number;
  openNow: number;
  thisWeek: number;
  offers: number;
  medianCtc: number | null;
}

const Index = () => {
  const { data, isPending: loading } = useCompanies();
  const companies = useMemo(() => data ?? [], [data]);

  const { stats, openDrives, allOpen, recent } = useMemo(() => {
    const now = Date.now();
    const week = now + 7 * 86_400_000;

    const withPhase = companies.map((company) => ({
      company,
      phase: resolvePhase(company),
      deadline: company.registration_deadline
        ? new Date(company.registration_deadline).getTime()
        : null,
    }));

    // Registration still open, soonest deadline first - the only list on this
    // page that is genuinely actionable, so it leads.
    const openByDeadline = withPhase
      .filter((entry) => entry.phase === "registration_open")
      .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity))
      .map((entry) => entry.company);

    // The card shows a readable handful; the ticker gets all of them. Feeding
    // the ticker the card's six meant it never had enough to fill the strip,
    // which is the whole reason a scrolling strip exists.
    const open = openByDeadline.slice(0, 6);

    const finished = withPhase
      .filter((entry) => entry.phase === "interviews_done" || entry.phase === "completed")
      .sort((a, b) => {
        const at = new Date(a.company.interview_datetime ?? a.company.oa_datetime ?? 0).getTime();
        const bt = new Date(b.company.interview_datetime ?? b.company.oa_datetime ?? 0).getTime();
        return bt - at;
      })
      .slice(0, 6)
      .map((entry) => entry.company);

    const ctcValues = companies
      .map((company) => parseCtcToNumber(company.offered_ctc))
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    const median = ctcValues.length
      ? ctcValues.length % 2
        ? ctcValues[(ctcValues.length - 1) / 2]
        : Math.round((ctcValues[ctcValues.length / 2 - 1] + ctcValues[ctcValues.length / 2]) / 2)
      : null;

    return {
      openDrives: open,
      allOpen: openByDeadline,
      recent: finished,
      stats: {
        total: companies.length,
        openNow: withPhase.filter((entry) => entry.phase === "registration_open").length,
        thisWeek: withPhase.filter(
          (entry) => entry.deadline !== null && entry.deadline > now && entry.deadline <= week,
        ).length,
        offers: companies.reduce((sum, company) => sum + (company.people_selected ?? 0), 0),
        medianCtc: median,
      } satisfies Stats,
    };
  }, [companies]);

  return (
    <Layout>
      <Seo
        title="PlaceTrack"
        description="Placement tracking for IIIT Hyderabad - every drive, deadline and interview experience in one place."
      />
      {/* Hero. Asymmetric and left-aligned rather than a centred block with two
          buttons under it, and typeset in the display face at a size that lets
          the Fraunces WONK forms actually read. */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="bg-dot-grid absolute inset-0 opacity-70" aria-hidden />
        <div
          className="absolute -right-24 -top-32 h-[26rem] w-[26rem] rounded-[999px] bg-primary/10 blur-3xl"
          aria-hidden
        />

        <div className="container relative grid gap-10 py-16 md:py-24 lg:grid-cols-12 lg:gap-8">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-[999px] border border-border bg-card/80 px-3 py-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
              IIIT Hyderabad
              <span className="h-1 w-1 rounded-[999px] bg-primary" />
              {loading ? "loading" : `${stats.total} companies tracked`}
            </span>

            <h1 className="mt-5 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Every drive,
              <br />
              <span className="text-primary">before the deadline.</span>
            </h1>

            <p className="mt-5 max-w-lg text-base text-muted-foreground">
              Registration windows, test dates and interview slots in one place - alongside the
              interview experiences and questions from the students who sat them.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" asChild>
                <Link to="/companies">
                  Browse companies
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/companies?phase=registration_open">
                  <CalendarClock className="mr-2 h-4 w-4" />
                  Open right now
                  {stats.openNow > 0 && (
                    <span className="ml-2 rounded-[999px] bg-primary/12 px-1.5 py-0.5 font-mono text-2xs tabular text-primary">
                      {stats.openNow}
                    </span>
                  )}
                </Link>
              </Button>
            </div>

            {/* Only shows when this season is genuinely empty, which is every
                August until the first drive is announced. The hero otherwise
                reads "0 companies tracked" with nothing to click. */}
            {!loading && companies.length === 0 && (
              <ArchiveHintLine className="mt-6 max-w-lg text-sm text-muted-foreground" />
            )}
          </div>

          {/* Stat rail: a hairline-separated column, not four bordered boxes. */}
          <dl className="grid grid-cols-2 gap-x-8 gap-y-7 self-end lg:col-span-5 lg:grid-cols-2">
            <Stat label="Companies" value={loading ? null : String(stats.total)} />
            <Stat label="Open now" value={loading ? null : String(stats.openNow)} accent />
            <Stat label="Closing this week" value={loading ? null : String(stats.thisWeek)} />
            <Stat
              label="Median CTC"
              value={loading ? null : stats.medianCtc ? formatCtc(stats.medianCtc) : "--"}
            />
          </dl>
        </div>

        {/* Deadline ticker. Fades at both edges rather than being clipped. */}
        <DeadlineTicker companies={allOpen} />
      </section>

      {/* grid-cols-1 rather than a bare `grid`: with no column template the
          implicit track sizes to content, so on a phone it grew to 444px
          inside a 271px container and took the whole page sideways. */}
      <div className="container grid grid-cols-1 gap-10 py-14 lg:grid-cols-2">
        <CompanyList
          title="Registration open"
          href="/companies?phase=registration_open"
          loading={loading}
          companies={openDrives}
          emptyTitle="Nothing open right now"
          emptyDescription="No company is currently accepting registrations. Check back when the next drive is announced."
          renderMeta={(company) => <DeadlinePill deadline={company.registration_deadline} />}
        />

        <CompanyList
          title="Recently wrapped up"
          href="/companies?phase=interviews_done"
          loading={loading}
          companies={recent}
          emptyTitle="No drives finished yet"
          emptyDescription="Completed drives will appear here with their outcomes."
          renderMeta={(company) => (
            <span className="text-xs text-muted-foreground">
              {company.interview_datetime
                ? formatInISTHuman(company.interview_datetime)
                : formatInISTHuman(company.oa_datetime)}
            </span>
          )}
        />
      </div>
    </Layout>
  );
};

function Stat({ label, value, accent }: { label: string; value: string | null; accent?: boolean }) {
  return (
    <div className="border-l-2 border-border pl-4">
      <dt className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={`mt-1.5 font-display text-3xl font-semibold ${accent ? "text-primary" : ""}`}
      >
        {value === null ? <Shimmer className="h-8 w-16 rounded-sm" /> : value}
      </dd>
    </div>
  );
}

interface CompanyListProps {
  title: string;
  href: string;
  loading: boolean;
  companies: Company[];
  emptyTitle: string;
  emptyDescription: string;
  renderMeta: (company: Company) => React.ReactNode;
}

function CompanyList({
  title,
  href,
  loading,
  companies,
  emptyTitle,
  emptyDescription,
  renderMeta,
}: CompanyListProps) {
  return (
    // min-w-0 so the section cannot push its grid track wider than the page:
    // a grid item defaults to min-width:auto, which is its min-content width.
    <section className="min-w-0">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
        <Link
          to={href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="flex items-center gap-3 rounded-md border border-border bg-card p-3"
            >
              <Shimmer className="h-8 w-8 rounded-sm" />
              <Shimmer className="h-3 w-36" />
              <Shimmer className="ml-auto h-3 w-16" />
            </div>
          ))}
        </div>
      ) : companies.length === 0 ? (
        <EmptyState
          variant="companies"
          title={emptyTitle}
          description={emptyDescription}
          action={<ArchiveHint />}
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          {companies.map((company) => (
            <li key={company.id}>
              {/* flex-wrap so the deadline and the phase chip drop onto their
                  own line when they will not fit beside the name. Both are
                  shrink-0 and together run to ~190px, which leaves nothing for
                  the company name on a 320px screen. */}
              <Link
                to={`/companies/${company.id}`}
                className="group flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-muted/40"
              >
                <CompanyLogo name={company.name} url={company.logo_url} />
                {/* A floor rather than min-w-0. With min-w-0 the name column
                    shrank to nothing to keep the timestamp and phase chip on
                    one line, so the row rendered as a date with no company
                    against it. The floor makes the meta wrap instead. */}
                <div className="min-w-[9rem] flex-1">
                  <p className="truncate text-sm font-medium transition-colors group-hover:text-primary">
                    {company.name}
                  </p>
                  <p className="truncate font-mono text-2xs tabular text-muted-foreground">
                    {company.offered_ctc ?? "CTC not disclosed"}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3 ms-auto">
                  {renderMeta(company)}
                  <PhaseChip phase={resolvePhase(company)} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default Index;
