import { useEffect } from "react";

interface SeoProps {
  title: string;
  description?: string;
  /** Leave unset to use the current URL. */
  canonicalPath?: string;
  /** Stops search engines indexing personal pages. */
  noIndex?: boolean;
}

const SITE_NAME = "PlaceTrack";
const DEFAULT_DESCRIPTION =
  "Placement tracking for IIIT Hyderabad - drive schedules, eligibility, and interview experiences contributed by students.";

function upsertMeta(selector: string, attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(selector);
  if (!element) {
    element = document.createElement("meta");
    element.setAttribute(attribute, key);
    document.head.appendChild(element);
  }
  element.setAttribute("content", content);
}

/**
 * Per-route title and metadata.
 *
 * A single-page app keeps whatever `<title>` index.html shipped with, so every
 * page shared or bookmarked reads "PlaceTrack - IIITH" regardless of what is
 * on it. Done directly against the DOM rather than pulling in react-helmet -
 * twelve routes do not justify the dependency.
 */
export function Seo({ title, description, canonicalPath, noIndex }: SeoProps) {
  useEffect(() => {
    const fullTitle = title === SITE_NAME ? title : `${title} - ${SITE_NAME}`;
    const summary = description ?? DEFAULT_DESCRIPTION;
    const url = `${window.location.origin}${canonicalPath ?? window.location.pathname}`;

    document.title = fullTitle;

    upsertMeta('meta[name="description"]', "name", "description", summary);
    upsertMeta('meta[property="og:title"]', "property", "og:title", fullTitle);
    upsertMeta('meta[property="og:description"]', "property", "og:description", summary);
    upsertMeta('meta[property="og:url"]', "property", "og:url", url);
    upsertMeta('meta[name="twitter:title"]', "name", "twitter:title", fullTitle);
    upsertMeta('meta[name="twitter:description"]', "name", "twitter:description", summary);

    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.href = url;

    // Personal pages must not be indexed. The tag is removed again on unmount
    // rather than left behind, or navigating away would carry noindex with it.
    const robots = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if (noIndex) {
      upsertMeta('meta[name="robots"]', "name", "robots", "noindex, nofollow");
    } else if (robots) {
      robots.remove();
    }
  }, [title, description, canonicalPath, noIndex]);

  return null;
}
