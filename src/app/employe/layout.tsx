"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, User } from "lucide-react";

export default function EmployeLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const isLoginPage = pathname === "/employe/login";

  useEffect(() => {
    if (isLoginPage) { setLoading(false); return; }
    fetch("/api/employe/me", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data.error) router.push("/employe/login");
        else setEmployee(data.employee);
      })
      .catch(() => router.push("/employe/login"))
      .finally(() => setLoading(false));
  }, [pathname, router, isLoginPage]);

  const logout = async () => {
    await fetch("/api/employe/login", { method: "DELETE" });
    router.push("/employe/login");
  };

  if (isLoginPage) return <>{children}</>;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-[#0a1f3f] text-white sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User size={16} className="text-blue-300" />
            <span className="font-semibold text-sm">{employee?.name || "Employé"}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-blue-300">Entretien Piscine Granby</span>
            <button onClick={logout} className="text-gray-400 hover:text-red-300 transition p-1">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-4 pb-8">{children}</main>
    </div>
  );
}
