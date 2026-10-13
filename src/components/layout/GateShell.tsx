import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";

/**
 * The frame for the two pages that sit outside the gate: the sign-in form and
 * the "waiting for access" notice.
 *
 * Deliberately not `Layout`. That shell carries the navigation, the season
 * picker, the search palette and the announcement banner, every one of which
 * either links to a page this visitor cannot open or fetches data they are not
 * allowed to have. Here there is a wordmark and a theme toggle and nothing to
 * click through to.
 */
export const GateShell = ({ children }: { children: ReactNode }) => (
  <div className="flex min-h-screen flex-col bg-background">
    <header className="w-full border-b border-border/70">
      <div className="container flex h-16 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <img
            src="/adk-mark-color.png"
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 shrink-0 dark:hidden"
          />
          <img
            src="/adk-mark-light.png"
            alt=""
            width={28}
            height={28}
            className="hidden h-7 w-7 shrink-0 dark:block"
          />
          <span className="truncate font-display text-lg font-semibold tracking-tight">PlaceTrack</span>
        </div>
        <ThemeToggle />
      </div>
    </header>
    <main className="flex-1">{children}</main>
  </div>
);
