"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Phone, Kanban, LogOut } from "lucide-react";
import { vendeurBrowser } from "@/lib/vendeur/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function VendeurShell({ closer, children }: { closer: any; children: React.ReactNode }) {
  const pathname = usePathname();

  const logout = async () => {
    await vendeurBrowser().auth.signOut();
    window.location.href = "/vendeur/login";
  };

  const tabs = [
    { icon: Phone, label: "File d'appels", path: "/vendeur" },
    { icon: Kanban, label: "Pipeline", path: "/vendeur/pipeline" },
  ];

  return (
    <div className="vnd">
      <header className="vnd-head">
        <div className="in">
          <Link href="/vendeur" className="brand">ALTAMAR<span style={{ color: "var(--cyan)" }}>·</span>vendeur</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="who">{closer?.full_name || "Closer"}</span>
            <button onClick={logout} aria-label="Déconnexion" style={{ background: "none", border: "none", color: "var(--faint)", cursor: "pointer", padding: 4, display: "flex" }}>
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </header>

      <main className="vnd-main"><div className="wrap">{children}</div></main>

      <nav className="vnd-tabs">
        <div className="in">
          {tabs.map((t) => {
            const on = t.path === "/vendeur" ? pathname === "/vendeur" : pathname?.startsWith(t.path);
            return (
              <Link key={t.path} href={t.path} className={on ? "on" : ""}>
                <t.icon size={19} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
