import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Season } from "@/lib/api";

const STORAGE_KEY = "placetrack.season";

interface SeasonContextValue {
  /** The slug every query is scoped by. Null until the season list loads. */
  season: string | null;
  setSeason: (slug: string) => void;
  seasons: Season[];
  current: Season | null;
  /** True when viewing anything other than the current season. */
  isArchive: boolean;
  loading: boolean;
}

const SeasonContext = createContext<SeasonContextValue | undefined>(undefined);

/** `?season=` in the address bar wins, so a link to a past year is shareable. */
function seasonFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("season");
}

export function SeasonProvider({ children }: { children: ReactNode }) {
  const { data: seasons = [], isPending } = useQuery({
    queryKey: ["seasons"],
    queryFn: () => api.seasons.list(),
    // The set of seasons changes about once a year.
    staleTime: 10 * 60_000,
  });

  const [selected, setSelected] = useState<string | null>(() => {
    return seasonFromUrl() ?? localStorage.getItem(STORAGE_KEY);
  });

  const current = useMemo(
    () => seasons.find((season) => season.is_current) ?? seasons[0] ?? null,
    [seasons],
  );

  /**
   * Falls back to the current season when the stored or linked slug is not a
   * real season - otherwise a stale localStorage value from a deleted season
   * would leave someone permanently looking at an empty site with no obvious
   * way out.
   */
  const resolved = useMemo(() => {
    if (seasons.length === 0) return null;
    if (selected && seasons.some((season) => season.slug === selected)) return selected;
    return current?.slug ?? null;
  }, [selected, seasons, current]);

  /**
   * The address bar is kept in step through the router rather than through
   * `history.replaceState`. Pages like the company list drive their own
   * filters with `useSearchParams`, and a parameter written behind the
   * router's back is invisible to those - the next filter change would drop
   * the year without anyone touching it.
   */
  const location = useLocation();
  const navigate = useNavigate();

  const writeToUrl = useCallback(
    (slug: string) => {
      const params = new URLSearchParams(location.search);
      if (params.get("season") === slug) return;
      params.set("season", slug);
      // Replace, not push: changing the year is a filter, not a navigation,
      // and should not need six Backs to undo.
      navigate({ pathname: location.pathname, search: `?${params}` }, { replace: true });
    },
    [location.pathname, location.search, navigate],
  );

  const setSeason = useCallback(
    (slug: string) => {
      setSelected(slug);
      localStorage.setItem(STORAGE_KEY, slug);
      writeToUrl(slug);
    },
    [writeToUrl],
  );

  // Reconcile once the real season is known, so a shared link that omits the
  // parameter still shows which year is being viewed. Runs on every navigation
  // too: following a link to a company drops the parameter, and a URL that has
  // quietly lost the year is one that sends the wrong year to whoever it is
  // pasted to.
  useEffect(() => {
    if (!resolved) return;

    const inUrl = new URLSearchParams(location.search).get("season");
    if (inUrl === resolved) return;

    // A link that names a real season wins - that is how the per-company
    // history opens a past year - otherwise the address bar is corrected to
    // match what is actually on screen.
    if (inUrl && seasons.some((season) => season.slug === inUrl)) {
      setSelected(inUrl);
      localStorage.setItem(STORAGE_KEY, inUrl);
      return;
    }

    writeToUrl(resolved);
  }, [resolved, seasons, location.search, writeToUrl]);

  const value = useMemo<SeasonContextValue>(
    () => ({
      season: resolved,
      setSeason,
      seasons,
      current,
      isArchive: Boolean(resolved && current && resolved !== current.slug),
      loading: isPending,
    }),
    [resolved, setSeason, seasons, current, isPending],
  );

  return <SeasonContext.Provider value={value}>{children}</SeasonContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSeason() {
  const context = useContext(SeasonContext);
  if (context === undefined) {
    throw new Error("useSeason must be used within a SeasonProvider");
  }
  return context;
}
