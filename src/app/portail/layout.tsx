"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { LogOut } from "lucide-react";

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
    <div className="min-h-screen bg-gray-50">
      {!isLoginPage && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a1f3f] text-white h-14 flex items-center px-6 shadow-md">
          <div className="flex items-center gap-2 flex-1">
            <span className="font-bold text-lg tracking-tight">Entretien Piscine Granby</span>
          </div>
          {clientName && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-300">{clientName}</span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1.5 text-sm text-gray-300 hover:text-white transition"
              >
                <LogOut size={15} />
                Déconnexion
              </button>
            </div>
          )}
        </header>
      )}
      <main className={!isLoginPage ? "pt-14" : ""}>{children}</main>
    </div>
  );
}
