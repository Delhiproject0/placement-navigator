import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { SeasonSelect } from "@/components/SeasonSelect";
import { BarChart3, BookMarked, CalendarDays, LayoutGrid, LogOut, Menu, Search, Shield, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutGrid;
  adminOnly?: boolean;
  authOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: "/companies", label: "Companies", icon: LayoutGrid },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/me/bookmarks", label: "Saved", icon: BookMarked, authOnly: true },
  { to: "/admin", label: "Admin", icon: Shield, adminOnly: true },
];

/** Two letters from the name where possible, falling back to the email. */
function initialsFor(fullName: string | null | undefined, email: string | undefined): string {
  const source = fullName?.trim();
  if (source) {
    const parts = source.split(/\s+/);
    if (parts.length > 1) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return source.slice(0, 2).toUpperCase();
  }
  return (email ?? "U").slice(0, 2).toUpperCase();
}

export const Header = () => {
  const { user, profile, role, signOut, loading } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    setMobileOpen(false);
    navigate("/");
  };

  const visibleItems = NAV_ITEMS.filter((item) => {
    if (item.adminOnly) return role === "admin";
    if (item.authOnly) return Boolean(user);
    return true;
  });

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      "relative text-sm font-medium transition-colors duration-120",
      isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      // A short underline anchored to the label rather than a filled pill -
      // quieter, and it survives the label changing width.
      isActive &&
        "after:absolute after:-bottom-[19px] after:left-0 after:h-[2px] after:w-full after:rounded-t-[2px] after:bg-primary",
    );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/65">
      <div className="container flex h-16 items-center gap-6">
        <Link to="/" className="flex shrink-0 items-center gap-2.5">
          {/* The mark is a stylised drive timeline: three stages, the last live. */}
          <svg viewBox="0 0 28 28" className="h-7 w-7" aria-hidden>
            <rect
              x="1"
              y="1"
              width="26"
              height="26"
              rx="8"
              className="fill-secondary"
            />
            <circle cx="8.5" cy="14" r="2" className="fill-primary-foreground/45" />
            <circle cx="14" cy="14" r="2" className="fill-primary-foreground/70" />
            <circle cx="19.5" cy="14" r="3" className="fill-primary" />
          </svg>
          <span className="font-display text-lg font-semibold tracking-tight">PlaceTrack</span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {visibleItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass}>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex flex-1 items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() =>
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
              )
            }
            className="hidden items-center gap-2 rounded-sm border border-border bg-muted/40 py-1.5 pl-2.5 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground lg:flex"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd className="rounded-xs border border-border bg-background px-1 font-mono text-2xs">
              {navigator.platform.toLowerCase().includes("mac") ? "\u2318" : "Ctrl"}K
            </kbd>
          </button>

          <SeasonSelect />

          <ThemeToggle className="hidden sm:inline-flex" />

          {loading ? (
            <div className="h-8 w-8 animate-pulse rounded-[999px] bg-muted" />
          ) : user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-9 w-9 rounded-[999px] p-0">
                  <Avatar className="h-8 w-8">
                    {/* profiles.avatar_url had no render path at all before. */}
                    <AvatarImage src={profile?.avatar_url ?? undefined} alt="" />
                    <AvatarFallback className="bg-secondary text-2xs font-semibold text-secondary-foreground">
                      {initialsFor(profile?.full_name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-60" align="end" forceMount>
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col gap-1.5">
                    {profile?.full_name && (
                      <p className="text-sm font-medium leading-none">{profile.full_name}</p>
                    )}
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <Badge variant="outline" className="mt-1 w-fit text-2xs capitalize">
                      {role}
                    </Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/me">
                    <UserIcon className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/me/bookmarks">
                    <BookMarked className="mr-2 h-4 w-4" />
                    Saved companies
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleSignOut}>
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/auth">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link to="/auth?mode=signup">Sign up</Link>
              </Button>
            </div>
          )}

          {/* Nav previously had no mobile treatment at all - the links simply
              sat inline and overflowed on a phone. */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[17rem]">
              <SheetTitle className="font-display text-base">Menu</SheetTitle>
              <nav className="mt-6 flex flex-col gap-1">
                {visibleItems.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                      )
                    }
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                  </NavLink>
                ))}
              </nav>

              {!user && (
                <div className="mt-6 flex flex-col gap-2">
                  <Button asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/auth?mode=signup">Sign up</Link>
                  </Button>
                  <Button variant="outline" asChild onClick={() => setMobileOpen(false)}>
                    <Link to="/auth">Sign in</Link>
                  </Button>
                </div>
              )}

              <div className="mt-8 flex items-center justify-between border-t border-border pt-5">
                <span className="text-sm text-muted-foreground">Theme</span>
                <ThemeToggle />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
