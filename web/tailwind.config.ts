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
          raised: "var(--surface-raised)",
        },
        // The modal scrim, so dialog backdrops read one token instead of
        // repeating a literal.
        overlay: "var(--overlay)",
        primary: {
          DEFAULT: "var(--primary)",
          strong: "var(--primary-strong)",
          soft: "var(--primary-soft)",
          softer: "var(--primary-softer)",
        },
        // Filled controls. `action.contrast` exists because the fill inverts in
        // dark mode, so a hard-coded text-white label would be unreadable.
        action: {
          DEFAULT: "var(--action)",
          hover: "var(--action-hover)",
          contrast: "var(--action-contrast)",
        },
        focus: "var(--focus)",
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
        // Figures that line up in a column. Quicksand has no tabular numerals,
        // so `tabular-nums` on its own does nothing — see globals.css.
        numeric: ["var(--font-numeric)"],
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        pill: "var(--radius-pill)",
      },
      boxShadow: {
        // Utility shadows resolve to the same tokens the CSS layer uses, so a
        // card styled with utilities cannot pick up a different elevation.
        sm: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-raised)",
      },
      minHeight: {
        control: "var(--control-h)",
      },
      maxWidth: {
        app: "1280px",
      },
    },
  },
  plugins: [],
};

export default config;
