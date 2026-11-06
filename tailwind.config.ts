import type { Config } from "tailwindcss";

// Every colour, radius, size and shadow here maps to a CSS variable in
// src/app/globals.css. See docs/ERA_DESIGN_SYSTEM.md.
const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}"
  ],
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        md: "1.5rem",
        lg: "2rem"
      },
      screens: {
        "2xl": "1200px"
      }
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))"
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))"
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))"
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          strong: "hsl(var(--accent-strong))"
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))"
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))"
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))"
        },
        error: {
          DEFAULT: "hsl(var(--error))",
          foreground: "hsl(var(--error-foreground))"
        },
        info: {
          DEFAULT: "hsl(var(--info))"
        },
        surface: {
          DEFAULT: "hsl(var(--surface))",
          muted: "hsl(var(--surface-muted))",
          elevated: "hsl(var(--surface-elevated))"
        }
      },
      borderRadius: {
        "2xl": "var(--radius-xl)",
        xl: "var(--radius-lg)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)"
      },
      boxShadow: {
        soft: "var(--shadow-soft)",
        panel: "var(--shadow-panel)"
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"]
      },
      fontSize: {
        display: ["var(--text-display)", { lineHeight: "1.15" }],
        page: ["var(--text-page)", { lineHeight: "var(--leading-tight)" }],
        section: ["var(--text-section)", { lineHeight: "var(--leading-tight)" }],
        title: ["var(--text-title)", { lineHeight: "1.4" }],
        body: ["var(--text-body)", { lineHeight: "var(--leading-body)" }],
        small: ["var(--text-small)", { lineHeight: "1.5" }]
      },
      // In spacing (not only height) so top-header, h-header and similar classes all exist.
      spacing: {
        header: "var(--header-height)"
      },
      width: {
        sidebar: "var(--sidebar-width)",
        "sidebar-rail": "var(--sidebar-rail)",
        assistant: "var(--assistant-width)",
        "assistant-rail": "var(--assistant-rail)"
      },
      maxWidth: {
        content: "var(--content-max)",
        narrow: "var(--content-narrow)"
      },
      zIndex: {
        header: "30",
        sidebar: "30",
        assistant: "40",
        overlay: "50",
        toast: "60"
      },
      transitionDuration: {
        fast: "var(--duration-fast)",
        base: "var(--duration-base)"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.3s ease-out both"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
