import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
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
        accent: "var(--accent)",
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
          soft: "var(--positive-soft)",
        },
        negative: {
          DEFAULT: "var(--negative)",
          soft: "var(--negative-soft)",
        },
        income: { DEFAULT: "var(--income)", soft: "var(--income-soft)" },
        expense: { DEFAULT: "var(--expense)", soft: "var(--expense-soft)" },
        savings: { DEFAULT: "var(--savings)", soft: "var(--savings-soft)" },
        investment: { DEFAULT: "var(--investment)", soft: "var(--investment-soft)" },
        warning: {
          DEFAULT: "var(--warning)",
          soft: "var(--warning-soft)",
        },
      },
      fontFamily: {
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
      maxWidth: {
        app: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
