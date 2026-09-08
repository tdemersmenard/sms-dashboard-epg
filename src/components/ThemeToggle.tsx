"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

/** Bascule clair (« eau du matin ») / sombre (« bassin de nuit ») — persistée. */
export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("chlore-theme", next ? "dark" : "light"); } catch {}
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Passer au thème clair" : "Passer au thème sombre"}
      className={`flex items-center justify-center w-9 h-9 rounded-lg border border-line text-mut hover:text-ink transition-colors ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
