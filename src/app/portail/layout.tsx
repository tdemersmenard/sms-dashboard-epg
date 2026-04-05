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
    <div className="min-h-screen bg-gray-50">
      {!isLoginPage && (
        <header className="fixed top-0 left-0 right-0 z-50 bg-[#0a1f3f] text-white h-16 flex items-center justify-between px-4 md:px-6 shadow-md">
          <span className="font-bold text-base md:text-lg tracking-tight whitespace-nowrap">
            Entretien Piscine Granby
          </span>
          {clientName && (
            <div className="flex items-center gap-2 md:gap-4 min-w-0">
              <span className="text-sm text-gray-300 truncate max-w-[100px] md:max-w-none hidden sm:block">
                {clientName}
              </span>
              <Link
                href="/portail/settings"
                className="flex items-center gap-1 text-sm text-gray-300 hover:text-white transition flex-shrink-0"
                title="Mon compte"
              >
                <Settings size={15} />
                <span className="hidden md:inline">Mon compte</span>
              </Link>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 md:gap-1.5 text-sm text-gray-300 hover:text-white transition flex-shrink-0"
              >
                <LogOut size={15} />
                <span className="hidden sm:inline">Déconnexion</span>
              </button>
            </div>
          )}
        </header>
      )}
      <main className={!isLoginPage ? "pt-16" : ""}>{children}</main>
    </div>
  );
}
