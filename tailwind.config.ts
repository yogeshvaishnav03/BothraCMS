import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Pages use the Tailwind v4 names shadow-xs / shadow-2xs; define them for Tailwind 3.
      boxShadow: {
        "2xs": "0 1px rgb(0 0 0 / 0.05)",
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.05)",
      },
      colors: {
        brand: {
          50: "#f0f6fe",
          100: "#ddeafc",
          200: "#c3dcfa",
          300: "#9ac7f7",
          400: "#6aa6f2",
          500: "#4483eb",
          600: "#2d67df",
          700: "#2351ca",
          800: "#2244a4",
          900: "#1e3b82",
          950: "#172550",
        },
        construction: {
          amber: "#f59e0b",
          orange: "#ea580c",
          yellow: "#eab308",
        }
      },
      borderColor: {
        DEFAULT: "#475569", // slate-600 dark border
        slate: {
          50: "#64748b",  // slate-500
          100: "#64748b", // slate-500 (dark, crisp divider)
          200: "#475569", // slate-600 (strong, high-contrast dark border)
          300: "#334155", // slate-700
          400: "#1e293b", // slate-800
          500: "#0f172a", // slate-900
          600: "#0f172a", // slate-900
          700: "#020617", // slate-950
          800: "#334155", // slate-700 (crisp outline on dark containers)
          900: "#475569",
          950: "#64748b",
        },
        gray: {
          50: "#64748b",
          100: "#64748b",
          200: "#475569",
          300: "#334155",
          400: "#1e293b",
          500: "#0f172a",
        },
        zinc: {
          50: "#64748b",
          100: "#64748b",
          200: "#475569",
          300: "#334155",
          400: "#1e293b",
          500: "#0f172a",
        },
        neutral: {
          50: "#64748b",
          100: "#64748b",
          200: "#475569",
          300: "#334155",
          400: "#1e293b",
          500: "#0f172a",
        },
      },
      divideColor: {
        DEFAULT: "#475569",
        slate: {
          50: "#64748b",
          100: "#64748b",
          200: "#475569",
          300: "#334155",
          400: "#1e293b",
          500: "#0f172a",
          600: "#0f172a",
          700: "#020617",
          800: "#334155",
          900: "#475569",
          950: "#64748b",
        },
      },
    },
  },
  plugins: [],
};
export default config;
