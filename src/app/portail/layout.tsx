"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import Link from "next/link";

interface PortailClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
}

export default function PortailLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [client, setClient] = useState<PortailClient | null>(null);
  const isLoginPage = pathname === "/portail";

  useEffect(() => {
    if (isLoginPage) return;
    const token = localStorage.getItem("portail_token");
    const stored = localStorage.getItem("portail_client");
    if (!token || !stored) {
      router.push("/portail");
      return;
    }
    try {
      setClient(JSON.parse(stored));
    } catch {
      router.push("/portail");
    }
  }, [isLoginPage, router]);

  const handleLogout = () => {
    localStorage.removeItem("portail_token");
    localStorage.removeItem("portail_client");
    router.push("/portail");
  };

  const clientName = client
    ? [client.first_name, client.last_name].filter(Boolean).join(" ")
    : "";

  return (
    <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
      {!isLoginPage && (
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 50,
            background: "#0a1f3f",
            color: "white",
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 24px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
          }}
        >
          <span style={{ fontWeight: 700, fontSize: 16, whiteSpace: "nowrap" }}>
            Entretien Piscine Granby
          </span>
          {clientName && (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 14, color: "#cbd5e1", maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {clientName}
              </span>
              <Link
                href="/portail/settings"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, color: "#cbd5e1", textDecoration: "none" }}
                title="Mon compte"
              >
                <Settings size={15} />
                <span style={{ display: "none" }} className="md-inline">Mon compte</span>
              </Link>
              <button
                onClick={handleLogout}
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 14, color: "#cbd5e1", background: "none", border: "none", cursor: "pointer" }}
              >
                <LogOut size={15} />
                <span>Déconnexion</span>
              </button>
            </div>
          )}
        </header>
      )}
      <div style={{ paddingTop: isLoginPage ? 0 : 64 }}>
        {children}
      </div>
    </div>
  );
}
