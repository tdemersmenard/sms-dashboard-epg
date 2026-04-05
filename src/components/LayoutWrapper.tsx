"use client";

import { usePathname } from "next/navigation";
import AppShell from "./AppShell";

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPortail = pathname?.startsWith("/portail") ?? false;

  if (isPortail) {
    // Portail: no sidebar, no h-screen, natural scroll
    return <div style={{ minHeight: "100vh" }}>{children}</div>;
  }

  return <AppShell>{children}</AppShell>;
}
