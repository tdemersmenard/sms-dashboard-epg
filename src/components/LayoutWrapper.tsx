"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";
import { FranchiseProvider } from "./FranchiseProvider";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortail = pathname?.startsWith("/portail") ?? false;
  const isEmploye = pathname === "/employe" || (pathname?.startsWith("/employe/") ?? false);
  const isMaster = pathname === "/master" || (pathname?.startsWith("/master/") ?? false);

  if (isPortail || isEmploye) {
    return <div style={{ minHeight: "100vh" }}>{children}</div>;
  }

  // Master gets its own layout (no CRM sidebar)
  if (isMaster) {
    return (
      <FranchiseProvider>
        <div className="min-h-screen bg-gray-50">{children}</div>
      </FranchiseProvider>
    );
  }

  return <AppShell>{children}</AppShell>;
}
