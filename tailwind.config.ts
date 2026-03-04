import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef9f2",
          500: "#2f8f55",
          700: "#1f5f39"
        },
        sand: "#f5f2ea"
      }
    }
  },
  plugins: []
} satisfies Config;
