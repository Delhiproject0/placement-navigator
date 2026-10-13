import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";

interface ProtectedRouteProps {
  children: ReactNode;
  /** Restricts to editors and admins. */
  requireEdit?: boolean;
  requireAdmin?: boolean;
}

/**
 * Route-level gate. Every route except the sign-in form and the access notice
 * is wrapped in this - the site is internal to the institute, so there is no
 * page a stranger, or a signed-in account nobody has approved, should reach.
 *
 * Two different refusals, sent to two different places: no session goes to
 * /auth, and a session without admin-granted access goes to /no-access, which
 * says why. Sending both to the sign-in form would leave an unapproved student
 * signing in over and over with no idea what was wrong.
 *
 * This is still a UI affordance, not the security boundary. It stops the page
 * mounting and firing queries; the API refuses the same requests regardless.
 */
export function ProtectedRoute({ children, requireEdit, requireAdmin }: ProtectedRouteProps) {
  const { user, loading, hasAccess, canEdit, isAdmin } = useAuth();
  const location = useLocation();

  // Rendering the redirect before the session resolves would bounce a
  // signed-in user to /auth on every hard refresh. Deliberately not the site
  // shell: the header and banners belong to people who are already let in.
  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container space-y-4 py-10">
          <Shimmer className="h-8 w-56 rounded-sm" />
          <Shimmer className="h-64 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (!user) {
    // `state.from` lets /auth send them back where they were headed.
    return <Navigate to="/auth" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!hasAccess) return <Navigate to="/no-access" replace />;

  if ((requireAdmin && !isAdmin) || (requireEdit && !canEdit)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
