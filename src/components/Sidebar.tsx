"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, Calendar,
  Navigation, Gauge, Receipt, Brain, Activity, FileText, Users2, Tag, Bot, Phone, Building2, Settings,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "./FranchiseProvider";

const NAV_ITEMS_MAIN = [
  { label: "Dashboard",      href: "",            icon: LayoutDashboard, masterOnly: false },
  { label: "Messages",       href: "/messages",   icon: MessageSquare,   masterOnly: false },
  { label: "À rappeler",     href: "/a-rappeler", icon: Phone,           masterOnly: false },
  { label: "Routes",         href: "/routes",     icon: Navigation,      masterOnly: false },
  { label: "Clients",        href: "/clients",    icon: Users,           masterOnly: false },
  { label: "Calendrier",     href: "/calendar",   icon: Calendar,        masterOnly: false },
  { label: "Pipeline",       href: "/pipeline",   icon: Kanban,          masterOnly: false },
  { label: "Dépenses",       href: "/depenses",   icon: Receipt,         masterOnly: true  },
  { label: "Odomètre",       href: "/odometre",   icon: Gauge,           masterOnly: true  },
  { label: "Apprentissages", href: "/learnings",  icon: Brain,           masterOnly: true  },
  { label: "Factures",      href: "/factures/nouvelle", icon: FileText, masterOnly: false },
  { label: "Employés",      href: "/employes",   icon: Users2,          masterOnly: false },
];

const NAV_ITEMS_ADMIN = [
  { label: "Catalogue",  href: "/catalogue",     icon: Tag,      masterOnly: false },
  { label: "Réglages",   href: "/reglages",      icon: Settings, masterOnly: false },
  { label: "Bot",        href: "/reglages-bot",  icon: Bot,      masterOnly: true  },
  { label: "Diagnostic", href: "/diagnostic",    icon: Activity, masterOnly: true  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { franchiseSlug, isMaster, franchiseName, franchiseId } = useFranchise();
  const [unreadCount, setUnreadCount] = useState(0);
  const [callbackCount, setCallbackCount] = useState(0);

  // Derive slug from URL path (reliable for link generation even before context loads)
  const slug = useMemo(() => {
    if (franchiseSlug) return franchiseSlug;
    // Extract slug from pathname as fallback
    const segments = pathname?.split("/").filter(Boolean) || [];
    if (segments.length > 0 && !["login", "master", "portail", "employe", "api"].includes(segments[0])) {
      return segments[0];
    }
    return "";
  }, [franchiseSlug, pathname]);

  const base = slug ? `/${slug}` : "";

  useEffect(() => {
    if (!franchiseId) return;
    const loadUnread = async () => {
      const { count } = await supabaseBrowser
        .from("messages")
        .select("*", { count: "exact", head: true })
        .eq("is_read", false)
        .eq("direction", "inbound")
        .eq("franchise_id", franchiseId);
      setUnreadCount(count ?? 0);
    };
    loadUnread();

    const channel = supabaseBrowser
      .channel("sidebar-unread")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, loadUnread)
      .subscribe();

    return () => { supabaseBrowser.removeChannel(channel); };
  }, [franchiseId]);

  useEffect(() => {
    if (!franchiseId) return;
    const loadCallback = async () => {
      try {
        const { count } = await supabaseBrowser
          .from("contacts")
          .select("id", { count: "exact", head: true })
          .eq("callback_status", "a_rappeler")
          .eq("franchise_id", franchiseId);
        setCallbackCount(count ?? 0);
      } catch {
        setCallbackCount(0);
      }
    };
    loadCallback();

    const ch = supabaseBrowser
      .channel("sidebar-callback")
      .on("postgres_changes", { event: "*", schema: "public", table: "contacts" }, loadCallback)
      .subscribe();

    return () => { supabaseBrowser.removeChannel(ch); };
  }, [franchiseId]);

  // Don't render on login/portail pages
  if (pathname === "/login" || pathname?.startsWith("/portail")) return null;

  const isItemActive = (itemHref: string) => {
    const fullHref = `${base}${itemHref}`;
    if (itemHref === "") {
      // Dashboard: exact match on /slug
      return pathname === base || pathname === `${base}/`;
    }
    return pathname === fullHref || pathname?.startsWith(fullHref + "/");
  };

  const displayName = franchiseName || slug || "CHLORE";

  return (
    <>
      {/* SIDEBAR DESKTOP (>= md) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 flex-col bg-[#0a1f3f] z-40 w-[260px]">
        <div className="px-5 pt-6 pb-5 border-b border-white/10">
          <p className="text-white font-bold text-2xl tracking-tight">CHLORE</p>
          <p className="text-[#94a3b8] text-sm mt-0.5 truncate">{displayName}</p>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto flex flex-col">
          <div className="space-y-1 flex-1">
            {NAV_ITEMS_MAIN.filter(item => !item.masterOnly || isMaster).map(item => {
              const Icon = item.icon;
              const fullHref = `${base}${item.href}`;
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={fullHref}
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-white/10 text-white font-medium"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  }`}
                >
                  <div className="relative">
                    <Icon size={18} strokeWidth={1.75} />
                    {item.href === "/messages" && unreadCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
                    {item.href === "/a-rappeler" && callbackCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                        {callbackCount > 99 ? "99+" : callbackCount}
                      </span>
                    )}
                  </div>
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 space-y-1">
            <p className="px-5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">Système</p>
            {isMaster && (
              <Link
                href="/master"
                className={`flex items-center gap-3 px-5 py-3 rounded-lg text-sm transition-all ${
                  pathname === "/master" || pathname?.startsWith("/master/")
                    ? "bg-white/10 text-white font-medium"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <Building2 size={18} strokeWidth={1.75} />
                <span className="flex-1">Master</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-500 text-white uppercase">SaaS</span>
              </Link>
            )}
            {NAV_ITEMS_ADMIN.filter(item => !item.masterOnly || isMaster).map(item => {
              const Icon = item.icon;
              const fullHref = `${base}${item.href}`;
              const active = isItemActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={fullHref}
                  className={`flex items-center gap-3 px-5 py-3 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-white/10 text-white font-medium"
                      : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold">TDM</span>
          </div>
          <span className="text-gray-400 text-sm truncate">Thomas Demers-Ménard</span>
        </div>
      </aside>

      {/* BOTTOM NAV MOBILE (< md) — scrollable */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 pb-[env(safe-area-inset-bottom)] overflow-x-auto">
        <div className="flex h-16 min-w-max px-2">
          {[...NAV_ITEMS_MAIN, ...NAV_ITEMS_ADMIN].filter(item => !item.masterOnly || isMaster).concat(isMaster ? [{ label: "Master", href: "___master", icon: Building2, masterOnly: false }] : []).map(item => {
            const Icon = item.icon;
            const isMasterLink = item.href === "___master";
            const fullHref = isMasterLink ? "/master" : `${base}${item.href}`;
            const active = isMasterLink
              ? pathname === "/master"
              : isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={fullHref}
                className={`flex flex-col items-center justify-center gap-0.5 px-4 min-w-[70px] transition-colors ${
                  active
                    ? "text-[#0a1f3f]"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <div className="relative">
                  <Icon size={20} strokeWidth={active ? 2.25 : 1.75} />
                  {item.href === "/messages" && unreadCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
                  {item.href === "/a-rappeler" && callbackCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-0.5 bg-orange-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                      {callbackCount > 99 ? "99+" : callbackCount}
                    </span>
                  )}
                </div>
                <span className="text-[9px] font-medium whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
