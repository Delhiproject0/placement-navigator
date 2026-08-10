import { useState } from "react";
import { cn } from "@/lib/utils";

interface CompanyLogoProps {
  name: string;
  url?: string | null;
  className?: string;
}

/**
 * Deterministic tint for the fallback tile, so a given company always gets the
 * same colour and the list stays recognisable when scrolling.
 */
function hueFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

export function CompanyLogo({ name, url, className }: CompanyLogoProps) {
  // A broken logo URL previously left a torn-image icon in the row; falling
  // back on error keeps the table tidy whatever the URL turns out to be.
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(url) && !failed;

  return showImage ? (
    <img
      src={url as string}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn("h-8 w-8 shrink-0 rounded-sm border border-border bg-background object-contain", className)}
    />
  ) : (
    <span
      aria-hidden
      style={{
        backgroundColor: `hsl(${hueFor(name)} 45% 92%)`,
        color: `hsl(${hueFor(name)} 55% 28%)`,
      }}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-sm text-xs font-semibold dark:brightness-[0.55] dark:saturate-[1.4]",
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
