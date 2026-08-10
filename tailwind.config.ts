import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";
import typography from "@tailwindcss/typography";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1.25rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1360px" },
    },
    extend: {
      fontFamily: {
        // Self-hosted variable fonts - no CDN request, so nothing breaks on a
        // campus network that blocks fonts.gstatic.com.
        display: ['"Fraunces Variable"', "Fraunces", "Georgia", "serif"],
        sans: ['"Instrument Sans Variable"', "Instrument Sans", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      fontSize: {
        // Paired line-height and tracking: display sizes tighten, small sizes
        // open up. Tailwind's defaults do neither.
        "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        xs: ["0.75rem", { lineHeight: "1.1rem", letterSpacing: "0.01em" }],
        sm: ["0.8125rem", { lineHeight: "1.25rem" }],
        base: ["0.9375rem", { lineHeight: "1.5rem" }],
        lg: ["1.0625rem", { lineHeight: "1.65rem" }],
        xl: ["1.25rem", { lineHeight: "1.75rem", letterSpacing: "-0.005em" }],
        "2xl": ["1.5rem", { lineHeight: "1.9rem", letterSpacing: "-0.012em" }],
        "3xl": ["1.9rem", { lineHeight: "2.25rem", letterSpacing: "-0.018em" }],
        "4xl": ["2.4rem", { lineHeight: "2.6rem", letterSpacing: "-0.022em" }],
        "5xl": ["3.1rem", { lineHeight: "3.2rem", letterSpacing: "-0.026em" }],
        "6xl": ["3.9rem", { lineHeight: "3.9rem", letterSpacing: "-0.03em" }],
        "7xl": ["4.9rem", { lineHeight: "4.8rem", letterSpacing: "-0.032em" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        destructive: { DEFAULT: "hsl(var(--destructive))", foreground: "hsl(var(--destructive-foreground))" },
        success: { DEFAULT: "hsl(var(--success))", foreground: "hsl(var(--success-foreground))" },
        warning: { DEFAULT: "hsl(var(--warning))", foreground: "hsl(var(--warning-foreground))" },
        info: { DEFAULT: "hsl(var(--info))", foreground: "hsl(var(--info-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        accent: { DEFAULT: "hsl(var(--accent))", foreground: "hsl(var(--accent-foreground))" },
        popover: { DEFAULT: "hsl(var(--popover))", foreground: "hsl(var(--popover-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
        phase: {
          announced: "hsl(var(--phase-announced))",
          "registration-open": "hsl(var(--phase-registration-open))",
          "registration-closed": "hsl(var(--phase-registration-closed))",
          ppt: "hsl(var(--phase-ppt))",
          oa: "hsl(var(--phase-oa))",
          "interviews-done": "hsl(var(--phase-interviews-done))",
          completed: "hsl(var(--phase-completed))",
          cancelled: "hsl(var(--phase-cancelled))",
        },
        chart: {
          1: "hsl(var(--chart-1))",
          2: "hsl(var(--chart-2))",
          3: "hsl(var(--chart-3))",
          4: "hsl(var(--chart-4))",
          5: "hsl(var(--chart-5))",
          6: "hsl(var(--chart-6))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
      },
      transitionTimingFunction: {
        "out-quint": "var(--ease-out-quint)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        120: "120ms",
        320: "320ms",
        520: "520ms",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        // A soft pulse for imminent deadlines - opacity only, so it reads as
        // urgency without the layout thrash of a scale animation.
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s var(--ease-out-quint)",
        "accordion-up": "accordion-up 0.2s var(--ease-out-quint)",
        "fade-up": "fade-up 0.32s var(--ease-out-quint) both",
        "fade-in": "fade-in 0.2s ease-out both",
        "pulse-soft": "pulse-soft 2.2s ease-in-out infinite",
        marquee: "marquee 42s linear infinite",
        shimmer: "shimmer 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate, typography],
} satisfies Config;
