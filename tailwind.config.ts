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
        background: "var(--background)",
        foreground: "var(--foreground)",
        "red-team": "var(--red-team)",
        "red-team-muted": "var(--red-team-muted)",
        "red-team-light": "var(--red-team-light)",
        "blue-team": "var(--blue-team)",
        "blue-team-muted": "var(--blue-team-muted)",
        "blue-team-light": "var(--blue-team-light)",
      },
    },
  },
  plugins: [],
};
export default config;
