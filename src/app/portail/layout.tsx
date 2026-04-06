"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, Calendar, CreditCard, User, LogOut } from "lucide-react";

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
      .then(r => r.json())
      .then(data => {
        if (data.error) { localStorage.removeItem("portal_token"); router.push("/portail"); }
        else setClient(data.client);
      })
      .catch(() => { router.push("/portail"); })
      .finally(() => setLoading(false));
  }, [pathname, router, isLoginPage]);

  const logout = () => {
    localStorage.removeItem("portal_token");
    router.push("/portail");
  };

  if (isLoginPage) return <div className="min-h-screen bg-gradient-to-b from-[#0a1f3f] to-[#1a3a5c]">{children}</div>;
  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  const navItems = [
    { icon: Home, label: "Accueil", path: "/portail/dashboard" },
    { icon: Calendar, label: "Rendez-vous", path: "/portail/rendez-vous" },
    { icon: CreditCard, label: "Paiements", path: "/portail/paiements" },
    { icon: User, label: "Compte", path: "/portail/settings" },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-20 md:pb-0">
      {/* Header */}
      <header className="bg-[#0a1f3f] text-white sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500 flex items-center justify-center text-sm font-bold flex-shrink-0">EP</div>
            <div>
              <div className="font-semibold text-sm leading-tight">Entretien Piscine Granby</div>
              <div className="text-[11px] text-blue-300 leading-tight">Portail client</div>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-6">
            {navItems.map(item => (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`flex items-center gap-2 text-sm transition ${pathname === item.path ? "text-white" : "text-gray-400 hover:text-gray-200"}`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
            <button onClick={logout} className="text-gray-400 hover:text-red-300 transition ml-2">
              <LogOut size={16} />
            </button>
          </div>
          <div className="md:hidden text-sm text-gray-300 truncate max-w-[120px]">
            {client?.first_name || ""}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {children}
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-50" style={{ paddingBottom: "env(safe-area-inset-bottom, 8px)" }}>
        <div className="flex justify-around py-2">
          {navItems.map(item => {
            const isActive = pathname === item.path;
            return (
              <button
                key={item.path}
                onClick={() => router.push(item.path)}
                className={`flex flex-col items-center gap-0.5 py-1 px-3 transition ${isActive ? "text-[#0a1f3f]" : "text-gray-400"}`}
              >
                <item.icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
