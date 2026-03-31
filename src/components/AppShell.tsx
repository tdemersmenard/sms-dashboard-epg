"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar";
import { ToastProvider } from "./ToastProvider";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Live unread count
  useEffect(() => {
    const fetchCount = () =>
      supabaseBrowser
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("direction", "inbound")
        .then(({ count }) => setUnreadCount(count ?? 0));

    fetchCount();

    const channel = supabaseBrowser
      .channel("appshell-unread-v1")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .on("postgres_changes" as any, { event: "*", schema: "public", table: "messages" }, fetchCount)
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, []);

  return (
    <ToastProvider>
      {/* Mobile hamburger */}
      <button
        aria-label="Ouvrir le menu"
        onClick={() => setSidebarOpen(true)}
        className="fixed top-4 left-4 z-[60] md:hidden bg-[#0a1f3f] text-white p-2 rounded-lg shadow-lg"
      >
        <Menu size={20} />
      </button>

      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <Sidebar
        unreadCount={unreadCount}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <main className="h-screen overflow-y-auto bg-white md:ml-[260px]">
        {children}
      </main>
    </ToastProvider>
  );
}
