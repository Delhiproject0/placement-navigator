import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatInISTHuman } from "@/lib/utils";
import type { Company } from "@/types/database";

interface Stage {
  label: string;
  at: string | null | undefined;
}

/**
 * A vertical rail through the drive's stages.
 *
 * Replaces four identical calendar rows, which gave no sense of order or of
 * how far along the drive was. Stages with no date are still listed, greyed -
 * "we do not know when the OA is" is different information from "there is no
 * OA", and dropping the row entirely conflated the two.
 */
export function RoundTimeline({ company }: { company: Company }) {
  const stages: Stage[] = [
    { label: "Pre-placement talk", at: company.ppt_datetime },
    { label: "Online assessment", at: company.oa_datetime },
    { label: "Interviews", at: company.interview_datetime },
  ];

  const now = Date.now();

  return (
    <ol className="relative space-y-4">
      {stages.map((stage, index) => {
        const time = stage.at ? new Date(stage.at).getTime() : null;
        const done = time !== null && time < now;
        const scheduled = time !== null;
        const isLast = index === stages.length - 1;

        return (
          <li key={stage.label} className="relative flex gap-3 pl-0">
            {/* The connector stops at the last node rather than trailing off. */}
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-[0.4375rem] top-5 h-[calc(100%+0.25rem)] w-px",
                  done ? "bg-primary/40" : "bg-border",
                )}
              />
            )}

            <span
              aria-hidden
              className={cn(
                "relative z-10 mt-1 grid h-3.5 w-3.5 shrink-0 place-items-center rounded-[999px] border-2 bg-background",
                done
                  ? "border-primary bg-primary text-primary-foreground"
                  : scheduled
                    ? "border-primary/50"
                    : "border-border",
              )}
            >
              {done && <Check className="h-2 w-2" strokeWidth={3.5} />}
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn("text-sm", done ? "font-medium" : "text-muted-foreground")}>
                {stage.label}
              </p>
              <p
                className={cn(
                  "font-mono text-2xs tabular",
                  scheduled ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {scheduled ? formatInISTHuman(stage.at) : "Not scheduled"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
