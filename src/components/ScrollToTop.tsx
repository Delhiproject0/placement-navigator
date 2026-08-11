import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll on navigation.
 *
 * A single-page app keeps the scroll position across route changes, so
 * clicking a company from halfway down the list previously opened its page
 * already scrolled past the header. Browsers do this for real navigations;
 * the router does not.
 */
export function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);

  return null;
}
