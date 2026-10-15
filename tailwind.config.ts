import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
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
    },
  },
  plugins: [],
};
export default config;
