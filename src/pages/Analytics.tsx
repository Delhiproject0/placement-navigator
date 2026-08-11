import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Layout } from "@/components/layout/Layout";
import { ChartCard, ChartTooltip } from "@/components/charts/ChartCard";
import { EmptyState } from "@/components/EmptyState";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { Card, CardContent } from "@/components/ui/card";
import { useCompanies } from "@/hooks/queries";
import { useChartColors } from "@/hooks/useChartColors";
import { formatCtc, parseCtcToNumber } from "@/lib/ctc";
import { PHASES, phaseMeta, resolvePhase } from "@/lib/phase";
import type { Company } from "@/types/database";

const LAKH = 100_000;

const Analytics = () => {
  const { data: companies = [], isPending } = useCompanies();
  const chart = useChartColors();

  // Recessive hairline grid, one step off the surface.
  const GRID = { stroke: chart.get("--border"), strokeWidth: 1 };
  const AXIS_TICK = { fill: chart.get("--muted-foreground"), fontSize: 11 };
  const CURSOR_FILL = { fill: chart.get("--muted"), fillOpacity: 0.5 };

  const model = useMemo(() => buildModel(companies), [companies]);

  if (isPending) {
    return (
      <Layout>
        <div className="container py-10">
          <Shimmer className="h-9 w-64 rounded-sm" />
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Shimmer key={index} className="h-24 rounded-lg" />
            ))}
          </div>
          <div className="mt-6 grid gap-5 lg:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Shimmer key={index} className="h-72 rounded-lg" />
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  if (companies.length === 0) {
    return (
      <Layout>
        <div className="container py-16">
          <EmptyState
            variant="companies"
            title="Nothing to chart yet"
            description="Once companies are added, this page summarises the season."
          />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container py-8 md:py-10">
        <div className="mb-7">
          <h1 className="font-display text-3xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            The season so far, across {companies.length} {companies.length === 1 ? "company" : "companies"}.
            CTC figures are parsed from free text and self-reported.
          </p>
        </div>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Companies" value={String(companies.length)} />
          <StatTile label="Offers made" value={String(model.totalOffers)} />
          <StatTile
            label="Median CTC"
            value={model.medianCtc ? formatCtc(model.medianCtc) : "--"}
            hint={`${model.ctcCount} disclosed`}
          />
          <StatTile label="Highest CTC" value={model.maxCtc ? formatCtc(model.maxCtc) : "--"} />
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <ChartCard
            title="CTC distribution"
            subtitle="Companies per package band, in lakhs per annum"
            columns={["Band", "Companies"]}
            rows={model.ctcBands.map((band) => [band.label, band.count])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model.ctcBands} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid {...GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  cursor={CURSOR_FILL}
                  content={<ChartTooltip valueFormatter={(v) => `${v} companies`} />}
                />
                {/* Single series, so no legend - the title says what is plotted.
                    Rounded cap, square at the baseline, capped thickness. */}
                <Bar
                  dataKey="count"
                  name="Companies"
                  fill={chart.get("--chart-1")}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={24}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Where the season stands"
            subtitle="Companies by phase"
            columns={["Phase", "Companies"]}
            rows={model.byPhase.map((entry) => [entry.label, entry.count])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={model.byPhase}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 34 }}
              >
                <CartesianGrid {...GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="short"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={92}
                />
                <Tooltip
                  cursor={CURSOR_FILL}
                  content={<ChartTooltip valueFormatter={(v) => `${v} companies`} />}
                />
                {/* Colour follows the phase, which is the entity - not the bar's
                    rank - so filtering never repaints the survivors. */}
                <Bar dataKey="count" name="Companies" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                  {model.byPhase.map((entry) => (
                    <Cell key={entry.phase} fill={chart.get(`--phase-${entry.token}` as never)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Most sought roles"
            subtitle="Number of companies hiring for each"
            columns={["Role", "Companies"]}
            rows={model.topRoles.map((role) => [role.name, role.count])}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={model.topRoles}
                layout="vertical"
                margin={{ top: 4, right: 16, bottom: 0, left: 34 }}
              >
                <CartesianGrid {...GRID} horizontal={false} />
                <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={110}
                />
                <Tooltip
                  cursor={CURSOR_FILL}
                  content={<ChartTooltip valueFormatter={(v) => `${v} companies`} />}
                />
                <Bar
                  dataKey="count"
                  name="Companies"
                  fill={chart.get("--chart-2")}
                  radius={[0, 4, 4, 0]}
                  maxBarSize={20}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title="Cutoff against package"
            subtitle="Each dot is one company with both figures recorded"
            columns={["Company", "CGPA", "CTC (L)"]}
            rows={model.scatter.map((point) => [point.name, point.cgpa.toFixed(2), point.lakhs.toFixed(1)])}
          >
            {model.scatter.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No company has both a CGPA cutoff and a package recorded yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis
                    type="number"
                    dataKey="cgpa"
                    name="CGPA cutoff"
                    domain={[5, 10]}
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="number"
                    dataKey="lakhs"
                    name="CTC"
                    unit="L"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                  />
                  <ZAxis range={[70, 70]} />
                  <Tooltip
                    cursor={{ stroke: chart.get("--border") }}
                    content={<ScatterTooltip />}
                  />
                  {/* 2px ring in the surface colour keeps overlapping dots legible. */}
                  <Scatter
                    data={model.scatter}
                    fill={chart.get("--chart-3")}
                    stroke={chart.get("--card")}
                    strokeWidth={2}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard
            className="lg:col-span-2"
            title="Offers over time"
            subtitle="People selected, by the month the drive concluded"
            columns={["Month", "Offers"]}
            rows={model.offersByMonth.map((point) => [point.label, point.offers])}
          >
            {model.offersByMonth.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                No concluded drives with recorded offers yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={model.offersByMonth} margin={{ top: 8, right: 16, bottom: 0, left: -20 }}>
                  <CartesianGrid {...GRID} vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} offers`} />} />
                  <Line
                    type="monotone"
                    dataKey="offers"
                    name="Offers"
                    stroke={chart.get("--chart-5")}
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    dot={{ r: 4, fill: chart.get("--chart-5"), stroke: chart.get("--card"), strokeWidth: 2 }}
                    activeDot={{ r: 5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </div>
    </Layout>
  );
};

function ScatterTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: { name: string; cgpa: number; lakhs: number } }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      <p className="text-sm font-medium">{point.name}</p>
      <p className="mt-0.5 font-mono text-2xs tabular text-muted-foreground">
        CGPA {point.cgpa.toFixed(2)} · {point.lakhs.toFixed(1)} L
      </p>
    </div>
  );
}

/**
 * Stat tile.
 *
 * Sans, and proportional figures rather than tabular: `tabular-nums` gives
 * every digit the width of a zero, which makes a standalone number look loose
 * at display sizes. Tabular is for columns that have to align.
 */
function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="mt-1 text-3xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

function buildModel(companies: Company[]) {
  const ctcValues = companies
    .map((company) => parseCtcToNumber(company.offered_ctc))
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  const medianCtc = ctcValues.length
    ? ctcValues.length % 2
      ? ctcValues[(ctcValues.length - 1) / 2]
      : Math.round((ctcValues[ctcValues.length / 2 - 1] + ctcValues[ctcValues.length / 2]) / 2)
    : null;

  // Fixed bands rather than equal-width bins: placement packages cluster at the
  // bottom and have a long tail, so even bins would leave most of the chart empty.
  const BANDS: Array<{ label: string; min: number; max: number }> = [
    { label: "<10", min: 0, max: 10 },
    { label: "10-20", min: 10, max: 20 },
    { label: "20-30", min: 20, max: 30 },
    { label: "30-40", min: 30, max: 40 },
    { label: "40-60", min: 40, max: 60 },
    { label: "60+", min: 60, max: Infinity },
  ];

  const ctcBands = BANDS.map((band) => ({
    label: band.label,
    count: ctcValues.filter((value) => {
      const lakhs = value / LAKH;
      return lakhs >= band.min && lakhs < band.max;
    }).length,
  }));

  const phaseCounts = new Map<string, number>();
  for (const company of companies) {
    const phase = resolvePhase(company);
    phaseCounts.set(phase, (phaseCounts.get(phase) ?? 0) + 1);
  }
  const byPhase = PHASES.map((phase) => {
    const meta = phaseMeta(phase);
    return {
      phase,
      label: meta.label,
      // The y-axis has limited width; the full label lives in the table view.
      short: meta.label.replace("Registration ", "Reg. "),
      token: meta.token,
      count: phaseCounts.get(phase) ?? 0,
    };
  }).filter((entry) => entry.count > 0);

  const roleCounts = new Map<string, number>();
  for (const company of companies) {
    for (const role of company.roles ?? []) {
      const key = role.trim();
      if (key) roleCounts.set(key, (roleCounts.get(key) ?? 0) + 1);
    }
  }
  const topRoles = [...roleCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
    .reverse(); // horizontal bars read bottom-up

  const scatter = companies
    .map((company) => {
      const ctc = parseCtcToNumber(company.offered_ctc);
      return company.cgpa_cutoff != null && ctc
        ? { name: company.name, cgpa: Number(company.cgpa_cutoff), lakhs: ctc / LAKH }
        : null;
    })
    .filter((point): point is { name: string; cgpa: number; lakhs: number } => point !== null);

  const monthly = new Map<string, number>();
  for (const company of companies) {
    if (!company.people_selected) continue;
    const concluded = company.interview_datetime ?? company.oa_datetime;
    if (!concluded) continue;
    const date = new Date(concluded);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthly.set(key, (monthly.get(key) ?? 0) + company.people_selected);
  }
  const offersByMonth = [...monthly.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, offers]) => {
      const [year, month] = key.split("-");
      const label = new Date(Number(year), Number(month) - 1).toLocaleString("en-IN", {
        month: "short",
        year: "2-digit",
      });
      return { key, label, offers };
    });

  return {
    ctcBands,
    byPhase,
    topRoles,
    scatter,
    offersByMonth,
    medianCtc,
    maxCtc: ctcValues.length ? ctcValues[ctcValues.length - 1] : null,
    ctcCount: ctcValues.length,
    totalOffers: companies.reduce((sum, company) => sum + (company.people_selected ?? 0), 0),
  };
}

export default Analytics;
