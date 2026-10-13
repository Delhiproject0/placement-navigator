/**
 * Providers and the router.
 *
 * The nesting is not arbitrary. `SeasonProvider` reads and writes `?season=`, so
 * it has to sit inside the router; both it and `AuthProvider` issue queries, so
 * they sit inside `QueryClientProvider`; and `ErrorBoundary` wraps the lot so a
 * throw inside a provider is still caught rather than blanking the page.
 */
import { Suspense, lazy, useEffect, useRef, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { SeasonProvider } from "@/hooks/useSeason";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import { CommandPalette } from "@/components/CommandPalette";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { ApiError } from "@/lib/api";
import Index from "./pages/Index";
import Companies from "./pages/Companies";

// Everything past the two landing pages is loaded on demand. The admin table,
// the profile forms and the charts are all dead weight for someone who only
// ever reads the company list.
const Auth = lazy(() => import("./pages/Auth"));
const AccessPending = lazy(() => import("./pages/AccessPending"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const Admin = lazy(() => import("./pages/Admin"));
const Profile = lazy(() => import("./pages/Profile"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const Applications = lazy(() => import("./pages/Applications"));
const Contributions = lazy(() => import("./pages/Contributions"));
const Analytics = lazy(() => import("./pages/Analytics"));
const CalendarPage = lazy(() => import("./pages/Calendar"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Placement data changes on the order of hours, not seconds, so a short
      // stale window avoids refetching the same rows on every navigation.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      // Retrying a 401 or 403 just repeats a decision the server has already
      // made, and delays the error the user needs to see.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
        return failureCount < 2;
      },
    },
  },
});

/**
 * Route-level fallback, shaped like a page rather than a spinner.
 *
 * No site shell: this renders before the guard has decided anything, and the
 * shell's header and banners are for people who are already let in.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container space-y-4 py-10">
        <Shimmer className="h-8 w-64 rounded-sm" />
        <Shimmer className="h-4 w-96 rounded-sm" />
        <Shimmer className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

/** Shorthand for the guard every page but /auth and /no-access sits behind. */
const Gated = ({ children }: { children: ReactNode }) => <ProtectedRoute>{children}</ProtectedRoute>;

/**
 * Things that live outside the routes but still belong only to people who are
 * let in.
 *
 * The palette searches companies, so it does not mount without access. And
 * when access ends - sign-out, or an admin withdrawing it - the query cache is
 * emptied, so nothing fetched under the old session is still sitting in memory
 * for whoever uses the tab next.
 */
function AccessScoped() {
  const { hasAccess } = useAuth();
  const hadAccess = useRef(false);

  useEffect(() => {
    if (hadAccess.current && !hasAccess) queryClient.clear();
    hadAccess.current = hasAccess;
  }, [hasAccess]);

  return hasAccess ? <CommandPalette /> : null;
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <SeasonProvider>
              <TooltipProvider delayDuration={200}>
                <Toaster />
                <ScrollToTop />
                <AccessScoped />
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    {/* The only two routes outside the gate: the way in, and
                        the notice for an account nobody has approved yet. */}
                    <Route path="/auth" element={<Auth />} />
                    <Route path="/no-access" element={<AccessPending />} />

                    {/* Everything else, including the 404, is behind it. */}
                    <Route path="/" element={<Gated><Index /></Gated>} />
                    <Route path="/companies" element={<Gated><Companies /></Gated>} />
                    <Route path="/companies/:id" element={<Gated><CompanyDetail /></Gated>} />
                    <Route path="/analytics" element={<Gated><Analytics /></Gated>} />
                    <Route path="/calendar" element={<Gated><CalendarPage /></Gated>} />
                    <Route path="/me" element={<Gated><Profile /></Gated>} />
                    <Route path="/me/bookmarks" element={<Gated><Bookmarks /></Gated>} />
                    <Route path="/me/applications" element={<Gated><Applications /></Gated>} />
                    <Route path="/me/contributions" element={<Gated><Contributions /></Gated>} />
                    <Route
                      path="/admin"
                      element={
                        <ProtectedRoute requireAdmin>
                          <Admin />
                        </ProtectedRoute>
                      }
                    />
                    <Route path="*" element={<Gated><NotFound /></Gated>} />
                  </Routes>
                </Suspense>
              </TooltipProvider>
            </SeasonProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
