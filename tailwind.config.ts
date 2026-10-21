import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Noto Sans Devanagari", "sans-serif"],
        display: ["Plus Jakarta Sans", "Inter", "ui-sans-serif", "system-ui", "Noto Sans Devanagari", "sans-serif"],
      },
      // Layered, soft shadows give depth instead of heavy borders.
      // shadow-xs / shadow-2xs are the Tailwind v4 names the pages already use.
      boxShadow: {
        "2xs": "0 1px 0 0 rgb(15 23 42 / 0.03)",
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 1px -1px rgb(15 23 42 / 0.03)",
        sm: "0 1px 3px 0 rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.04)",
        md: "0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.04)",
        lg: "0 12px 28px -6px rgb(15 23 42 / 0.12), 0 4px 8px -4px rgb(15 23 42 / 0.05)",
        xl: "0 20px 40px -12px rgb(15 23 42 / 0.18)",
        glow: "0 0 0 1px rgb(245 158 11 / 0.25), 0 8px 24px -6px rgb(245 158 11 / 0.45)",
        "inner-soft": "inset 0 1px 0 0 rgb(255 255 255 / 0.06)",
      },
      colors: {
        brand: {
          50: "#fff8eb",
          100: "#ffedc6",
          200: "#ffd988",
          300: "#ffc04a",
          400: "#ffa920",
          500: "#f98a07",
          600: "#dd6502",
          700: "#b74406",
          800: "#94340c",
          900: "#7a2c0d",
          950: "#461402",
        },
        ink: {
          50: "#f6f7fb",
          100: "#eceef5",
          200: "#d5d9e7",
          300: "#b0b8d2",
          400: "#8590b6",
          500: "#66719c",
          600: "#515a82",
          700: "#424969",
          800: "#2a2f45",
          900: "#161a2b",
          950: "#0b0e1a",
        },
        construction: {
          amber: "#f59e0b",
          orange: "#ea580c",
          yellow: "#eab308",
        },
      },
      // Softer, modern hairlines. The old palette forced every slate/gray border
      // to dark slate-600, which made every page read like a spreadsheet grid.
      borderColor: {
        DEFAULT: "#e3e7ef",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(16px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgb(16 185 129 / 0.45)" },
          "70%": { boxShadow: "0 0 0 8px rgb(16 185 129 / 0)" },
          "100%": { boxShadow: "0 0 0 0 rgb(16 185 129 / 0)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.45s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "fade-in": "fade-in 0.3s ease-out backwards",
        "scale-in": "scale-in 0.2s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        "slide-in-right": "slide-in-right 0.3s cubic-bezier(0.22, 1, 0.36, 1) backwards",
        shimmer: "shimmer 1.6s linear infinite",
        "pulse-ring": "pulse-ring 2s ease-out infinite",
        float: "float 6s ease-in-out infinite",
        "gradient-pan": "gradient-pan 12s ease infinite",
      },
    },
  },
  plugins: [],
};
export default config;
