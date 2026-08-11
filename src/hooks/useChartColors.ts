import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

/**
 * Resolves the chart design tokens into real colour strings.
 *
 * Recharts writes its colours into SVG presentation attributes, and `var()`
 * does not resolve there - the marks get an invalid fill and are drawn
 * invisibly, with no console error and correctly-computed axes, which makes it
 * look like the data never arrived.
 *
 * So the values are read out of the cascade once and handed over as concrete
 * `hsl(...)` strings. CSS stays the single source of truth, and re-reading on
 * theme change keeps the dark palette (which is separately validated, not
 * flipped) in step.
 */
const TOKENS = [
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
  "--chart-6",
  "--phase-announced",
  "--phase-registration-open",
  "--phase-registration-closed",
  "--phase-ppt",
  "--phase-oa",
  "--phase-interviews-done",
  "--phase-completed",
  "--phase-cancelled",
  "--border",
  "--muted",
  "--muted-foreground",
  "--card",
] as const;

export type ChartColorToken = (typeof TOKENS)[number];

function readTokens(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const styles = getComputedStyle(document.documentElement);
  const resolved: Record<string, string> = {};
  for (const token of TOKENS) {
    const channels = styles.getPropertyValue(token).trim();
    // The tokens store bare HSL channels ("18 74% 45%") so Tailwind can add an
    // alpha; wrapping them here produces a colour a browser will accept.
    if (channels) resolved[token] = `hsl(${channels})`;
  }
  return resolved;
}

export function useChartColors() {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<Record<string, string>>(() => readTokens());

  useEffect(() => {
    // next-themes swaps the class on <html>; reading on the next frame means
    // the new values are in the cascade before they are sampled.
    const frame = requestAnimationFrame(() => setColors(readTokens()));
    return () => cancelAnimationFrame(frame);
  }, [resolvedTheme]);

  return {
    colors,
    /** Falls back to a mid grey rather than an invalid attribute. */
    get: (token: ChartColorToken) => colors[token] ?? "#888888",
    series: [
      colors["--chart-1"],
      colors["--chart-2"],
      colors["--chart-3"],
      colors["--chart-4"],
      colors["--chart-5"],
      colors["--chart-6"],
    ].filter(Boolean) as string[],
  };
}
