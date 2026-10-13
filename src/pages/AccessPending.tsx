/**
 * Where a signed-in account lands when no admin has let it in yet.
 *
 * It is a page rather than a toast or a redirect back to sign-in because the
 * state is not an error the visitor can fix by trying again: their password
 * was right, and the only thing that changes the outcome is an admin. So it
 * says that, says who the site is for, and offers the two things they can
 * actually do - check again, or sign out.
 */
import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, LogOut, RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { GateShell } from "@/components/layout/GateShell";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Shimmer } from "@/components/skeletons/CompanyTableSkeleton";

const AccessPending = () => {
  const { user, loading, hasAccess, refresh, signOut } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);

  if (loading) {
    return (
      <GateShell>
        <div className="container space-y-4 py-10">
          <Shimmer className="h-8 w-56 rounded-sm" />
          <Shimmer className="h-40 w-full rounded-lg" />
        </div>
      </GateShell>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  // Approved since they last looked - this page has nothing left to say.
  if (hasAccess) return <Navigate to="/" replace />;

  const checkAgain = async () => {
    setChecking(true);
    await refresh();
    setChecking(false);
    // If access came through, the redirect above has already fired; reaching
    // here means it did not, and saying so beats a button that seems dead.
    setChecked(true);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <GateShell>
      <Seo title="Not authorised" noIndex />
      <div className="relative flex min-h-[calc(100vh-4rem)] items-center justify-center overflow-hidden px-5 py-12">
        <div className="bg-dot-grid absolute inset-0 opacity-60" aria-hidden />

        <div className="relative w-full max-w-[30rem]">
          <div className="rounded-xl border border-border bg-card p-7 shadow-lg sm:p-8">
            <span className="grid h-11 w-11 place-items-center rounded-md bg-warning/12 text-warning">
              <ShieldAlert className="h-5 w-5" />
            </span>

            <h1 className="mt-5 font-display text-2xl font-semibold tracking-tight">
              You are not authorised
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This is an internal portal for IIIT Hyderabad students. Its contents are private to the
              institute, so an account on its own does not open it - an admin has to grant access
              first.
            </p>

            <dl className="mt-5 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm">
              <dt className="text-2xs uppercase tracking-wider text-muted-foreground">Signed in as</dt>
              <dd className="mt-0.5 truncate font-medium">{user.email}</dd>
            </dl>

            <p className="mt-5 text-sm text-muted-foreground">
              Your account exists and is waiting for approval. If you are an IIIT Hyderabad student,
              ask a placement admin to approve this address, then check again.
            </p>

            {checked && !checking && (
              <p className="mt-4 text-sm text-foreground" role="status">
                Still waiting - access has not been granted yet.
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button onClick={checkAgain} disabled={checking} className="sm:flex-1">
                {checking ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Check again
              </Button>
              <Button variant="outline" onClick={handleSignOut} className="sm:flex-1">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </GateShell>
  );
};

export default AccessPending;
