import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

/**
 * next-themes was already a dependency but was never mounted, so the .dark
 * block in index.css was unreachable and dark mode simply did not exist.
 *
 * `disableTransitionOnChange` stops every colour-transitioned element on the
 * page from animating at once when the theme flips, which otherwise looks
 * like a rendering fault rather than a deliberate change.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="placetrack-theme"
    >
      {children}
    </NextThemesProvider>
  );
}
