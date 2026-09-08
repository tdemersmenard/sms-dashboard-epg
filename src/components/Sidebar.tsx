"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useMemo } from "react";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, Calendar,
  Navigation, Gauge, Receipt, Brain, Activity, FileText, Users2, Tag, Bot, Phone, Building2, Settings, Menu, X,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "./FranchiseProvider";
import ThemeToggle from "./ThemeToggle";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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
      <aside className="hidden md:flex fixed inset-y-0 left-0 flex-col bg-sur border-r border-line z-40 w-[260px]">
        <div className="px-5 pt-6 pb-5 border-b border-line">
          <p className="font-display font-semibold text-2xl tracking-tight text-ink">CHLORE<span className="text-acc">.</span></p>
          <p className="lbl mt-1 truncate">{displayName}</p>
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
                  className={`flex items-center gap-3 px-5 py-2.5 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-chip text-acc font-semibold shadow-[inset_2px_0_0_var(--le-acc)]"
                      : "text-mut hover:bg-chip/60 hover:text-ink"
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
          <div className="mt-4 pt-4 border-t border-line space-y-1">
            <p className="px-5 py-1 lbl">Système</p>
            {isMaster && (
              <Link
                href="/master"
                className={`flex items-center gap-3 px-5 py-2.5 rounded-lg text-sm transition-all ${
                  pathname === "/master" || pathname?.startsWith("/master/")
                    ? "bg-chip text-acc font-semibold shadow-[inset_2px_0_0_var(--le-acc)]"
                    : "text-mut hover:bg-chip/60 hover:text-ink"
                }`}
              >
                <Building2 size={18} strokeWidth={1.75} />
                <span className="flex-1">Master</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded btn-glow uppercase">SaaS</span>
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
                  className={`flex items-center gap-3 px-5 py-2.5 rounded-lg text-sm transition-all ${
                    active
                      ? "bg-chip text-acc font-semibold shadow-[inset_2px_0_0_var(--le-acc)]"
                      : "text-mut hover:bg-chip/60 hover:text-ink"
                  }`}
                >
                  <Icon size={18} strokeWidth={1.75} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <div className="px-5 py-4 border-t border-line flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-acc-grad flex items-center justify-center">
            <span className="text-accink text-[11px] font-bold">TDM</span>
          </div>
          <span className="text-mut text-sm truncate flex-1">Thomas Demers-Ménard</span>
          <ThemeToggle />
        </div>
      </aside>

      {/* BOTTOM NAV MOBILE (< md) — 4 items fixes + menu "Plus" plein écran.
          (L'ancienne barre défilante cachait 10+ pages sans aucun indice visuel.) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-sur border-t border-line z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-16">
          {NAV_ITEMS_MAIN.slice(0, 4).map(item => {
            const Icon = item.icon;
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={`${base}${item.href}`}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  active && !mobileMenuOpen ? "text-acc shadow-[inset_0_2px_0_var(--le-acc)]" : "text-mut"
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
                <span className="text-[9px] font-display font-semibold uppercase tracking-[.08em] whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 transition-colors ${mobileMenuOpen ? "text-acc shadow-[inset_0_2px_0_var(--le-acc)]" : "text-mut"}`}
          >
            {mobileMenuOpen ? <X size={20} strokeWidth={2.25} /> : <Menu size={20} strokeWidth={1.75} />}
            <span className="text-[9px] font-display font-semibold uppercase tracking-[.08em]">Plus</span>
          </button>
        </div>
      </nav>

      {/* MENU "PLUS" PLEIN ÉCRAN (mobile) */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 bottom-16 bg-page z-40 overflow-y-auto">
          <div className="px-5 pt-6 pb-8">
            <div className="flex items-center justify-between mb-4"><p className="text-xl font-display font-semibold text-ink">Toutes les pages</p><ThemeToggle /></div>
            <div className="grid grid-cols-3 gap-3">
              {[...NAV_ITEMS_MAIN, ...NAV_ITEMS_ADMIN]
                .filter(item => !item.masterOnly || isMaster)
                .concat(isMaster ? [{ label: "Master", href: "___master", icon: Building2, masterOnly: false }] : [])
                .map(item => {
                  const Icon = item.icon;
                  const isMasterLink = item.href === "___master";
                  const fullHref = isMasterLink ? "/master" : `${base}${item.href}`;
                  const active = isMasterLink ? pathname === "/master" : isItemActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={fullHref}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex flex-col items-center justify-center gap-2 rounded-xl border py-4 px-2 transition ${
                        active
                          ? "border-acc bg-chip text-acc"
                          : "border-line bg-sur text-mut active:bg-chip"
                      }`}
                    >
                      <div className="relative">
                        <Icon size={22} strokeWidth={1.75} />
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
                      <span className="text-[11px] font-display font-semibold text-center leading-tight">{item.label}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
