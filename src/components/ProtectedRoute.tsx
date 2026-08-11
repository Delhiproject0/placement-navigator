import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Layout } from "@/components/layout/Layout";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Restricts to editors and admins. */
  requireEdit?: boolean;
  requireAdmin?: boolean;
}

/**
 * Route-level auth gate.
 *
 * There was no route guard at all - `/admin` relied on an in-page check, which
 * meant the page mounted, fired its queries, and only then decided you were not
 * allowed. This is still a UI affordance, not a security boundary; the API
 * refuses the same requests regardless.
 */
export function ProtectedRoute({ children, requireEdit, requireAdmin }: ProtectedRouteProps) {
  const { user, loading, canEdit, isAdmin } = useAuth();
  const location = useLocation();

  // Rendering the redirect before the session resolves would bounce a
  // signed-in user to /auth on every hard refresh.
  if (loading) {
    return (
      <Layout>
        <div className="container space-y-4 py-10">
          <Shimmer className="h-8 w-56 rounded-sm" />
          <Shimmer className="h-64 w-full rounded-lg" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    // `state.from` lets /auth send them back where they were headed.
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  if ((requireAdmin && !isAdmin) || (requireEdit && !canEdit)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
