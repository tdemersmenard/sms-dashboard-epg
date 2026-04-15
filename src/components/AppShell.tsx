"use client";

import Sidebar from "./Sidebar";
import { ToastProvider } from "./ToastProvider";

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <Sidebar />
      <main className="min-h-screen overflow-y-auto bg-white md:ml-[260px] pb-20 md:pb-0">
        {children}
      </main>
    </ToastProvider>
  );
}
