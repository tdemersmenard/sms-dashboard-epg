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
        // ── Marque ALTAMAR (tokens directs)
        "brand-navy":  "#0a1628",
        "brand-ocean": "#0077b6",
        "brand-cyan":  "#7dd3de",
        "brand-cream": "#f5f1e8",
        // ── Échelles legacy (portail/employé non migrés) — remappées ALTAMAR
        navy: {
          50: "#eef4f9", 100: "#d7e4f0", 200: "#afc9e1", 300: "#87add1",
          400: "#5f92c2", 500: "#3d76a8", 600: "#2a5a85", 700: "#1c4062",
          800: "#122b45", 900: "#0a1628", 950: "#060e1a",
        },
        pool: { light: "#7dd3de", DEFAULT: "#0077b6", dark: "#005f92" },
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
