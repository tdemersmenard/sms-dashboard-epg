"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, Calendar,
  Navigation, Gauge, Receipt, Brain, Activity, MoreHorizontal,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",      href: "/dashboard",  icon: LayoutDashboard, mobilePriority: true  },
  { label: "Messages",       href: "/messages",   icon: MessageSquare,   mobilePriority: true  },
  { label: "Routes",         href: "/routes",     icon: Navigation,      mobilePriority: true  },
  { label: "Clients",        href: "/clients",    icon: Users,           mobilePriority: true  },
  { label: "Calendrier",     href: "/calendar",   icon: Calendar,        mobilePriority: true  },
  { label: "Pipeline",       href: "/pipeline",   icon: Kanban,          mobilePriority: false },
  { label: "Dépenses",       href: "/depenses",   icon: Receipt,         mobilePriority: false },
  { label: "Odomètre",       href: "/odometre",   icon: Gauge,           mobilePriority: false },
  { label: "Apprentissages", href: "/learnings",  icon: Brain,           mobilePriority: false },
  { label: "Diagnostic",     href: "/diagnostic", icon: Activity,        mobilePriority: false },
];

export default function Sidebar() {
  const pathname = usePathname();
  const mobileItems = NAV_ITEMS.filter(item => item.mobilePriority);

  // Ne pas afficher la nav sur les pages du portail client
  if (pathname?.startsWith("/portail")) return null;

  return (
    <>
      {/* SIDEBAR DESKTOP (>= md) */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 flex-col bg-[#0a1f3f] z-40 w-[260px]">
        <div className="px-5 pt-6 pb-5 border-b border-white/10">
          <p className="text-white font-bold text-2xl tracking-tight">CHLORE</p>
          <p className="text-[#94a3b8] text-sm mt-0.5">Entretien Piscine Granby</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-5 py-3 rounded-lg text-sm transition-all ${
                  isActive
                    ? "bg-white/10 text-white font-medium"
                    : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                }`}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="flex-1">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
            <span className="text-white text-[11px] font-semibold">TDM</span>
          </div>
          <span className="text-gray-400 text-sm truncate">Thomas Demers-Ménard</span>
        </div>
      </aside>

      {/* BOTTOM NAV MOBILE (< md) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5 h-16">
          {mobileItems.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-1 transition-colors ${
                  isActive
                    ? "text-[#0a1f3f]"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* MENU "PLUS" MOBILE */}
      <MobileMoreMenu items={NAV_ITEMS.filter(i => !i.mobilePriority)} />
    </>
  );
}

function MobileMoreMenu({ items }: { items: typeof NAV_ITEMS }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden fixed top-4 right-4 z-50 bg-white shadow-lg border border-gray-200 rounded-full p-2.5 hover:bg-gray-50"
        aria-label="Plus"
      >
        <MoreHorizontal size={18} />
      </button>

      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="md:hidden fixed top-16 right-4 bg-white rounded-xl shadow-xl border border-gray-200 z-50 py-2 min-w-[180px]">
            {items.map(item => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    isActive ? "bg-gray-100 text-[#0a1f3f] font-medium" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <Icon size={16} strokeWidth={1.75} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
