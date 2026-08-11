import { useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  { to: "/companies", label: "All companies" },
  { to: "/calendar", label: "Calendar" },
  { to: "/analytics", label: "Analytics" },
];

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    // Kept from the original: a 404 in the logs is usually a broken link
    // somewhere in the app, and the path is the only clue.
    console.error("404: no route for", location.pathname);
  }, [location.pathname]);

  return (
    <Layout>
      <Seo title="Page not found" noIndex />

      <div className="relative flex min-h-[calc(100vh-16rem)] items-center justify-center px-5 py-16">
        <div className="bg-dot-grid absolute inset-0 opacity-50" aria-hidden />

        <div className="relative max-w-md text-center">
          <p className="font-display text-6xl font-semibold tracking-tight text-primary">404</p>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight">
            That page does not exist
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <code className="rounded-xs bg-muted px-1.5 py-0.5 font-mono text-xs">
              {location.pathname}
            </code>{" "}
            did not match anything. It may have been renamed, or the company removed.
          </p>

          <div className="mt-7 flex flex-wrap justify-center gap-2">
            {/* A router Link, not an <a href> - the original forced a full page
                reload, throwing away the app and every cached query. */}
            <Button asChild>
              <Link to="/">
                <Compass className="mr-2 h-4 w-4" />
                Go home
              </Link>
            </Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button
              variant="outline"
              onClick={() =>
                document.dispatchEvent(
                  new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
                )
              }
            >
              <Search className="mr-2 h-4 w-4" />
              Search
            </Button>
          </div>

          <div className="mt-8 border-t border-border pt-5">
            <p className="text-2xs uppercase tracking-wider text-muted-foreground">Or try</p>
            <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
              {SUGGESTIONS.map((suggestion) => (
                <Link
                  key={suggestion.to}
                  to={suggestion.to}
                  className="text-sm text-primary underline-offset-4 hover:underline"
                >
                  {suggestion.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default NotFound;
