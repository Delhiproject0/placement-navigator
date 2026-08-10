import { Link } from "react-router-dom";
import { Github } from "lucide-react";

const COLUMNS = [
  {
    heading: "Browse",
    links: [
      { to: "/companies", label: "All companies" },
      { to: "/calendar", label: "Calendar" },
      { to: "/analytics", label: "Analytics" },
    ],
  },
  {
    heading: "Your account",
    links: [
      { to: "/me", label: "Profile" },
      { to: "/me/applications", label: "Applications" },
      { to: "/me/bookmarks", label: "Saved companies" },
    ],
  },
];

export const Footer = () => (
  <footer className="mt-20 border-t border-border bg-muted/30">
    <div className="container grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2">
        <p className="font-display text-lg font-semibold tracking-tight">PlaceTrack</p>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Placement tracking for IIIT Hyderabad - schedules, eligibility, and interview
          experiences contributed by students who sat the drives.
        </p>
        <p className="mt-4 max-w-sm text-xs text-muted-foreground">
          Experiences, questions and CTC figures are contributed by students and are not
          verified by the placement office. Treat them as guidance, not as an official record.
        </p>
      </div>

      {COLUMNS.map((column) => (
        <div key={column.heading}>
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
            {column.heading}
          </p>
          <ul className="mt-3 space-y-2">
            {column.links.map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>

    <div className="border-t border-border/70">
      <div className="container flex flex-col items-center justify-between gap-3 py-5 sm:flex-row">
        <p className="text-xs text-muted-foreground">
          Built for IIIT Hyderabad. Data contributed by students.
        </p>
        <a
          href="https://github.com/Dileepadari/placement-navigator"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Github className="h-3.5 w-3.5" />
          Source
        </a>
      </div>
    </div>
  </footer>
);
