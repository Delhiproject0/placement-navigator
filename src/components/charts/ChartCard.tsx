import { useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  /** Column headers for the table view. */
  columns: string[];
  /** Row values for the table view, already formatted. */
  rows: Array<Array<string | number>>;
  children: ReactNode;
  className?: string;
}

/**
 * A chart plus the numbers behind it.
 *
 * The table view is not a nicety: it is the fallback that keeps the data
 * reachable when colour fails - screen readers, colour blindness at full
 * severity, greyscale print. Every chart on the dashboard ships with one.
 */
export function ChartCard({ title, subtitle, columns, rows, children, className }: ChartCardProps) {
  const [showTable, setShowTable] = useState(false);

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div>
          {/* The title names what is plotted, which is why single-series charts
              below carry no legend box. */}
          <h3 className="font-display text-base font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          onClick={() => setShowTable((value) => !value)}
          aria-pressed={showTable}
        >
          {showTable ? <BarChart3 className="h-3.5 w-3.5" /> : <Table2 className="h-3.5 w-3.5" />}
          <span className="ml-1.5">{showTable ? "Chart" : "Data"}</span>
        </Button>
      </CardHeader>

      <CardContent>
        {showTable ? (
          <div className="max-h-[18rem] overflow-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {columns.map((column, index) => (
                    <TableHead
                      key={column}
                      className={cn("text-2xs uppercase tracking-wider", index > 0 && "text-right")}
                    >
                      {column}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={String(row[0])}>
                    {row.map((cell, index) => (
                      <TableCell
                        key={index}
                        // Columns of numbers are exactly where tabular figures
                        // earn their keep - they have to align vertically.
                        className={cn("text-sm", index > 0 && "text-right font-mono tabular")}
                      >
                        {cell}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="h-[16rem] w-full">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Shared tooltip, so every chart reads the same and uses text tokens. */
export function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: Array<{ name?: string; value?: number | string; color?: string; payload?: unknown }>;
  label?: string | number;
  valueFormatter?: (value: number | string) => string;
}) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md">
      {label !== undefined && (
        <p className="mb-1 text-2xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
      )}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-sm">
          {/* Identity comes from a coloured swatch beside the text, never from
              colouring the text itself. */}
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[999px]"
            style={{ backgroundColor: entry.color }}
          />
          {entry.name && <span className="text-muted-foreground">{entry.name}</span>}
          <span className="ml-auto font-mono tabular text-foreground">
            {valueFormatter ? valueFormatter(entry.value ?? 0) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}
