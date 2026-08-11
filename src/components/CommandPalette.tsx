import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTheme } from "next-themes";
import {
  BarChart3,
  BookMarked,
  Building2,
  CalendarDays,
  FileText,
  LayoutGrid,
  LogOut,
  Moon,
  Plus,
  Shield,
  Sun,
  User as UserIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { PhaseChip } from "@/components/companies/PhaseChip";
import { useCompanies } from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { resolvePhase } from "@/lib/phase";

/**
 * Global search and actions on Cmd/Ctrl-K.
 *
 * Companies are matched against the already-cached list rather than a new
 * request per keystroke: the whole set is small, React Query has usually
 * fetched it for the page behind the dialog, and searching in memory means the
 * results never lag the typing.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { user, isAdmin, canEdit, signOut } = useAuth();
  const { setTheme } = useTheme();

  // Only fetch once the palette has been opened - an unused shortcut should
  // not cost a request on every page load.
  const [everOpened, setEverOpened] = useState(false);
  const { data: companies = [] } = useCompanies(undefined, everOpened);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
        setEverOpened(true);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  // Opening from the header button also has to prime the query.
  useEffect(() => {
    if (open) setEverOpened(true);
  }, [open]);

  const run = (action: () => void) => {
    setOpen(false);
    // Let the dialog finish closing before navigating, or the exit animation
    // fights the route change and the page flashes.
    requestAnimationFrame(action);
  };

  const sortedCompanies = useMemo(
    () => [...companies].sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search companies, or jump to a page..." />
      <CommandList>
        <CommandEmpty>Nothing matches that.</CommandEmpty>

        <CommandGroup heading="Go to">
          <CommandItem onSelect={() => run(() => navigate("/companies"))}>
            <LayoutGrid className="mr-2 h-4 w-4" />
            Companies
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/calendar"))}>
            <CalendarDays className="mr-2 h-4 w-4" />
            Calendar
          </CommandItem>
          <CommandItem onSelect={() => run(() => navigate("/analytics"))}>
            <BarChart3 className="mr-2 h-4 w-4" />
            Analytics
          </CommandItem>
          {user && (
            <>
              <CommandItem onSelect={() => run(() => navigate("/me"))}>
                <UserIcon className="mr-2 h-4 w-4" />
                Your profile
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/me/bookmarks"))}>
                <BookMarked className="mr-2 h-4 w-4" />
                Saved companies
              </CommandItem>
              <CommandItem onSelect={() => run(() => navigate("/me/applications"))}>
                <FileText className="mr-2 h-4 w-4" />
                Your applications
              </CommandItem>
            </>
          )}
          {isAdmin && (
            <CommandItem onSelect={() => run(() => navigate("/admin"))}>
              <Shield className="mr-2 h-4 w-4" />
              Admin
            </CommandItem>
          )}
        </CommandGroup>

        {sortedCompanies.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Companies">
              {sortedCompanies.map((company) => (
                <CommandItem
                  key={company.id}
                  // cmdk filters on this string, so the searchable text has to
                  // include the roles and location - not just the name.
                  value={`${company.name} ${company.roles?.join(" ") ?? ""} ${company.job_location ?? ""}`}
                  onSelect={() => run(() => navigate(`/companies/${company.id}`))}
                >
                  <Building2 className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{company.name}</span>
                  <span className="ml-auto shrink-0 pl-3">
                    <PhaseChip phase={resolvePhase(company)} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        <CommandSeparator />
        <CommandGroup heading="Actions">
          {canEdit && (
            <CommandItem onSelect={() => run(() => navigate("/companies?new=1"))}>
              <Plus className="mr-2 h-4 w-4" />
              Add a company
            </CommandItem>
          )}
          <CommandItem onSelect={() => run(() => setTheme("light"))}>
            <Sun className="mr-2 h-4 w-4" />
            Light theme
          </CommandItem>
          <CommandItem onSelect={() => run(() => setTheme("dark"))}>
            <Moon className="mr-2 h-4 w-4" />
            Dark theme
          </CommandItem>
          {user && (
            <CommandItem
              onSelect={() =>
                run(async () => {
                  await signOut();
                  navigate("/");
                })
              }
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
