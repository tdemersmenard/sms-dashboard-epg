"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import AdminTerminal from "./AdminTerminal";
import { FranchiseProvider, useFranchise } from "./FranchiseProvider";
import ImpersonationBanner from "./ImpersonationBanner";

function AppContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { impersonating } = useFranchise();
  const isAuthPage = pathname === "/login" || pathname?.startsWith("/portail");

  return (
    <>
      <Sidebar />
      {!isAuthPage && <ImpersonationBanner />}
      <main className={`min-h-screen overflow-y-auto bg-white ${
        isAuthPage ? "" : `md:ml-[260px] pb-20 md:pb-0${impersonating ? " mt-10" : ""}`
      }`}>
        {children}
      </main>
      {!isAuthPage && <AdminTerminal />}
    </>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <FranchiseProvider>
      <AppContent>{children}</AppContent>
    </FranchiseProvider>
  );
}
