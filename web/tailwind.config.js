/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Semantic, theme-aware tokens (values live in src/index.css).
        canvas: token("canvas"),
        surface: token("surface"),
        well: { DEFAULT: token("well"), 2: token("well-2") },
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        fg: { DEFAULT: token("fg"), 2: token("fg-2") },
        muted: token("muted"),
        faint: token("faint"),
        brand: {
          DEFAULT: token("brand"),
          strong: token("brand-strong"),
          soft: token("brand-soft"),
          ink: token("brand-ink"),
          deep: token("brand-deep"),
        },
        gold: { DEFAULT: token("gold"), ink: token("gold-ink") },
        ok: token("ok"),
        warn: token("warn"),
        danger: token("danger"),
      },
      fontFamily: {
        display: ["Saira", "system-ui", "sans-serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        pop: "var(--shadow-pop)",
        glow: "var(--shadow-glow)",
      },
    },
  },
  plugins: [],
};
