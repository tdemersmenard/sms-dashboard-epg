"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Home, Droplets, CreditCard, MessageCircle, Settings } from "lucide-react";
import { Montserrat } from "next/font/google";
import "./portail.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["700", "800", "900"],
  variable: "--font-display-site",
  display: "swap",
});

export default function PortailLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [client, setClient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isLoginPage = pathname === "/portail";

  useEffect(() => {
    if (isLoginPage) { setLoading(false); return; }
    const token = localStorage.getItem("portal_token");
    if (!token) { router.push("/portail"); return; }
    fetch("/api/portail/me", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { localStorage.removeItem("portal_token"); router.push("/portail"); }
        else setClient(data.client);
      })
      .catch(() => { router.push("/portail"); })
      .finally(() => setLoading(false));
  }, [pathname, router, isLoginPage]);

  if (isLoginPage) return <div className={montserrat.variable}>{children}</div>;

  if (loading) {
    return (
      <div className={`ptl ${montserrat.variable}`} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 34, height: 34, border: "3px solid var(--line)", borderTopColor: "var(--aqua)", borderRadius: "50%", animation: "ptl-spin 0.9s linear infinite" }} />
        <style>{`@keyframes ptl-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  const tabs = [
    { icon: Home, label: "Accueil", path: "/portail/dashboard" },
    { icon: Droplets, label: "Mon eau", path: "/portail/analyses" },
    { icon: CreditCard, label: "Paiements", path: "/portail/paiements" },
    { icon: MessageCircle, label: "Contact", path: "/portail/contact" },
  ];

  return (
    <div className={`ptl ${montserrat.variable}`}>
      <header className="ptl-head">
        <div className="in">
          <Link href="/portail/dashboard" className="logo">
            <Image src="/brand/logo-mark-64.png" alt="" width={24} height={20} style={{ filter: "drop-shadow(0 0 10px rgba(25,182,217,.4))" }} />
            ALTAMAR
          </Link>
          <Link href="/portail/settings" className="gear" aria-label="Mon compte">
            <Settings size={19} />
          </Link>
        </div>
      </header>

      <main className="ptl-main">
        <div className="wrap">{children}</div>
      </main>

      <nav className="ptl-tabs" aria-label="Navigation du portail">
        <div className="in">
          {tabs.map((t) => {
            const on = pathname?.startsWith(t.path);
            return (
              <Link key={t.path} href={t.path} className={on ? "on" : ""}>
                <t.icon size={21} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* client chargé côté layout, exposé aux pages via window (léger, pages refetchent /me au besoin) */}
      {client ? null : null}
    </div>
  );
}
