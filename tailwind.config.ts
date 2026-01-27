import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-background)",
        foreground: "var(--color-foreground)",
        "red-team": "var(--color-red-team)",
        "red-team-muted": "var(--color-red-team-muted)",
        "red-team-light": "var(--color-red-team-light)",
        "blue-team": "var(--color-blue-team)",
        "blue-team-muted": "var(--color-blue-team-muted)",
        "blue-team-light": "var(--color-blue-team-light)",
      },
    },
  },
  plugins: [],
};
export default config;
