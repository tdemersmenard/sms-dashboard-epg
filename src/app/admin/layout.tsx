import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser } from "@/lib/franchise";
import { Montserrat, Archivo } from "next/font/google";
import "../vendeur/vendeur.css";

const montserrat = Montserrat({ subsets: ["latin"], weight: ["700", "800", "900"], variable: "--font-display-site", display: "swap" });
const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-body-site", display: "swap" });

/** Section /admin (gestion vendeurs) — RÉSERVÉE au master. Réutilise le design vendeur. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user || !isMasterUser(user as Record<string, unknown>)) redirect("/login");

  return (
    <div className={`vnd ${montserrat.variable} ${archivo.variable}`}>
      <header className="vnd-head">
        <div className="in">
          <Link href="/admin/commissions" className="brand">ALTAMAR<span style={{ color: "var(--cyan)" }}>·</span>admin</Link>
          <nav style={{ display: "flex", gap: 16, fontSize: ".82rem" }}>
            <Link href="/admin/assignation" style={{ color: "var(--mut)" }}>Assignation</Link>
            <Link href="/admin/closers" style={{ color: "var(--mut)" }}>Closers</Link>
            <Link href="/admin/commissions" style={{ color: "var(--aqua)" }}>Commissions</Link>
          </nav>
        </div>
      </header>
      <main className="vnd-main"><div className="wrap" style={{ maxWidth: 900 }}>{children}</div></main>
    </div>
  );
}
