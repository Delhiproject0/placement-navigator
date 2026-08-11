import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { CompanyLogo } from "@/components/companies/CompanyLogo";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Button } from "@/components/ui/button";
import { useApplications } from "@/hooks/queries";
import { type Application, type ApplicationStage } from "@/lib/api";
import { STAGE_LABELS } from "@/lib/applications";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";
import { cn } from "@/lib/utils";

/**
 * The stages, grouped into columns.
 *
 * Nine columns would not fit on any screen and most would be empty, so the
 * terminal outcomes share one column and the live pipeline gets the space.
 */
const COLUMNS: Array<{ heading: string; stages: ApplicationStage[]; tone: string }> = [
  { heading: "Interested", stages: ["interested"], tone: "border-t-phase-announced" },
  { heading: "Applied", stages: ["applied", "shortlisted"], tone: "border-t-phase-registration-open" },
  { heading: "In process", stages: ["oa", "interviewing"], tone: "border-t-phase-oa" },
  { heading: "Offered", stages: ["offered", "accepted"], tone: "border-t-success" },
  { heading: "Closed", stages: ["rejected", "withdrawn"], tone: "border-t-phase-cancelled" },
];

const Applications = () => {
  const { data: applications = [], isPending } = useApplications(true);

  if (isPending) {
    return (
      <Layout>
        <div className="container py-10">
          <Shimmer className="h-8 w-56 rounded-sm" />
          <div className="mt-7 grid gap-4 md:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <Shimmer key={index} className="h-48 rounded-lg" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8 md:py-10">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Your applications</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Where you are with each drive. This is yours alone - nobody else can see it.
          </p>
        </div>

        {applications.length === 0 ? (
          <EmptyState
            variant="companies"
            title="You are not tracking anything yet"
            description="Set your stage on a company's page and it will appear on this board."
            action={
              <Button asChild>
                <Link to="/companies">Browse companies</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {COLUMNS.map((column) => {
              const items = applications.filter((application) =>
                column.stages.includes(application.stage),
              );
              return (
                <section
                  key={column.heading}
                  className={cn("rounded-lg border border-t-2 border-border bg-card/40 p-3", column.tone)}
                >
                  <h2 className="mb-3 flex items-baseline justify-between text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {column.heading}
                    <span className="font-mono tabular">{items.length}</span>
                  </h2>

                  <div className="space-y-2">
                    {items.map((application) => (
                      <ApplicationCard key={application.id} application={application} />
                    ))}
                    {items.length === 0 && (
                      <p className="py-6 text-center text-2xs text-muted-foreground">Nothing here</p>
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

function ApplicationCard({ application }: { application: Application }) {
  const company = application.companies;
  if (!company) return null;
  const ctc = parseCtcToNumber(company.offered_ctc);

  return (
    <Link
      to={`/companies/${company.id}`}
      className="block rounded-md border border-border bg-card p-3 shadow-xs transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2.5">
        <CompanyLogo name={company.name} url={company.logo_url} className="h-7 w-7" />
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{company.name}</p>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-2xs text-muted-foreground">{STAGE_LABELS[application.stage]}</span>
        {ctc && <span className="font-mono text-2xs tabular text-muted-foreground">{formatCtc(ctc)}</span>}
      </div>
    </Link>
  );
}

export default Applications;
