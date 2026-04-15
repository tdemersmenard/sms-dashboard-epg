"use client";

import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname?.startsWith("/portail");

  return (
    <>
      <Sidebar />
      <main className={`min-h-screen overflow-y-auto bg-white ${isAuthPage ? "" : "md:ml-[260px] pb-20 md:pb-0"}`}>
        {children}
      </main>
    </>
  );
}
