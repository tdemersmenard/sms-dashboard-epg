"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortail = pathname?.startsWith("/portail") ?? false;
  const isEmploye = pathname === "/employe" || (pathname?.startsWith("/employe/") ?? false);

  if (isPortail || isEmploye) {
    return <div style={{ minHeight: "100vh" }}>{children}</div>;
  }

  return <AppShell>{children}</AppShell>;
}
