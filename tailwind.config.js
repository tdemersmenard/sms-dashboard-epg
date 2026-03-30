/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          50: "#f0f3f8",
          100: "#d9e0ed",
          200: "#b3c1db",
          300: "#8da2c9",
          400: "#6783b7",
          500: "#4164a5",
          600: "#2a4a82",
          700: "#1a3461",
          800: "#0f2241",
          900: "#0a1f3f",
          950: "#060f1f",
        },
        pool: {
          light: "#7dd3e8",
          DEFAULT: "#38b6d2",
          dark: "#1a8fa8",
        },
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
    },
  },
  plugins: [],
};
