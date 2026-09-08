/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── Système « Ligne d'eau » — tokens sémantiques (clair/sombre via CSS vars)
        page:  "var(--le-bg)",     // fond de page
        sur:   "var(--le-sur)",    // surface (cartes, bandes)
        ink:   "var(--le-ink)",    // texte principal
        mut:   "var(--le-mut)",    // texte secondaire
        line:  "var(--le-line)",   // filets/bordures
        chip:  "var(--le-chip)",   // fonds de puces/segments
        acc:   "var(--le-acc)",    // accent aqua
        acc2:  "var(--le-acc2)",   // accent indigo (fin de dégradé)
        accink:"var(--le-accink)", // texte sur accent
        pos:   "var(--le-pos)",
        warn:  "var(--le-warn)",
        neg:   "var(--le-neg)",
        // ── Legacy (pages non migrées) — à retirer en fin de refonte
        navy: {
          50: "#f0f3f8", 100: "#d9e0ed", 200: "#b3c1db", 300: "#8da2c9",
          400: "#6783b7", 500: "#4164a5", 600: "#2a4a82", 700: "#1a3461",
          800: "#0f2241", 900: "#0a1f3f", 950: "#060f1f",
        },
        pool: { light: "#7dd3e8", DEFAULT: "#38b6d2", dark: "#1a8fa8" },
      },
      fontFamily: {
        sans: ["-apple-system", "BlinkMacSystemFont", '"Segoe UI"', "Roboto", "sans-serif"],
        display: ['"Avenir Next"', "Avenir", "Futura", '"Century Gothic"', '"DM Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 4px 16px var(--le-glow)",
      },
      backgroundImage: {
        "acc-grad": "linear-gradient(120deg, var(--le-acc), var(--le-acc2))",
        "hero-grad": "linear-gradient(160deg, var(--le-sur) 45%, var(--le-glow))",
      },
    },
  },
  plugins: [],
};
