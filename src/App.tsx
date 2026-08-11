import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ScrollToTop } from "@/components/ScrollToTop";
import { Layout } from "@/components/layout/Layout";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";
import { ApiError } from "@/lib/api";
import Index from "./pages/Index";
import Companies from "./pages/Companies";

// Everything past the two public landing pages is loaded on demand. The admin
// table, the profile forms and the charts are all dead weight for a visitor
// who only ever reads the company list.
const Auth = lazy(() => import("./pages/Auth"));
const CompanyDetail = lazy(() => import("./pages/CompanyDetail"));
const Admin = lazy(() => import("./pages/Admin"));
const Profile = lazy(() => import("./pages/Profile"));
const Bookmarks = lazy(() => import("./pages/Bookmarks"));
const Applications = lazy(() => import("./pages/Applications"));
const Contributions = lazy(() => import("./pages/Contributions"));
const Analytics = lazy(() => import("./pages/Analytics"));
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

/** Route-level fallback, shaped like a page rather than a spinner. */
function RouteFallback() {
  return (
    <Layout>
      <div className="container space-y-4 py-10">
        <Shimmer className="h-8 w-64 rounded-sm" />
        <Shimmer className="h-4 w-96 rounded-sm" />
        <Shimmer className="h-64 w-full rounded-lg" />
      </div>
    </Layout>
  );
}

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <TooltipProvider delayDuration={200}>
              <Toaster />
              <ScrollToTop />
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/companies" element={<Companies />} />
                  <Route path="/companies/:id" element={<CompanyDetail />} />
                  <Route path="/analytics" element={<Analytics />} />

                  <Route
                    path="/me"
                    element={
                      <ProtectedRoute>
                        <Profile />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/me/bookmarks"
                    element={
                      <ProtectedRoute>
                        <Bookmarks />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/me/applications"
                    element={
                      <ProtectedRoute>
                        <Applications />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/me/contributions"
                    element={
                      <ProtectedRoute>
                        <Contributions />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/admin"
                    element={
                      <ProtectedRoute requireAdmin>
                        <Admin />
                      </ProtectedRoute>
                    }
                  />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </TooltipProvider>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
