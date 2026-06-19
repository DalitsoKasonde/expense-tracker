import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: {
          DEFAULT: "var(--background)",
          strong: "var(--background-strong)",
        },
        surface: {
          DEFAULT: "var(--surface)",
          soft: "var(--surface-soft)",
          "soft-2": "var(--surface-soft-2)",
          raised: "var(--surface-raised)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          strong: "var(--primary-strong)",
          soft: "var(--primary-soft)",
          softer: "var(--primary-softer)",
        },
        outline: {
          DEFAULT: "var(--outline)",
          strong: "var(--outline-strong)",
        },
        on: {
          surface: {
            DEFAULT: "var(--on-surface)",
            soft: "var(--on-surface-soft)",
          },
        },
        positive: {
          DEFAULT: "var(--positive)",
        },
        negative: {
          DEFAULT: "var(--negative)",
        },
        warning: {
          DEFAULT: "var(--warning)",
        },
      },
      fontFamily: {
        accent: ["var(--font-accent)", "cursive"],
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
      },
    },
  },
  plugins: [],
};

export default config;
