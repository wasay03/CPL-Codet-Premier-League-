/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: "#06080f", 900: "#0a0e1a", 850: "#0f1424", 800: "#141a2e", 700: "#1d2540", 600: "#2a3354", 500: "#3d4870" },
        gavel: { DEFAULT: "#f5b301", soft: "#fcd34d", deep: "#b45309" },
      },
      fontFamily: {
        display: ['"Barlow Condensed"', "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(245,179,1,.35), 0 0 32px -6px rgba(245,179,1,.45)",
      },
    },
  },
  plugins: [],
};
