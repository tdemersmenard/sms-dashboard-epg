"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Kanban, MessageSquare, Users, Calendar,
  Navigation, Gauge, Receipt, Brain, Activity,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",      href: "/dashboard",  icon: LayoutDashboard },
  { label: "Messages",       href: "/messages",   icon: MessageSquare   },
  { label: "Routes",         href: "/routes",     icon: Navigation      },
  { label: "Clients",        href: "/clients",    icon: Users           },
  { label: "Calendrier",     href: "/calendar",   icon: Calendar        },
  { label: "Pipeline",       href: "/pipeline",   icon: Kanban          },
  { label: "Dépenses",       href: "/depenses",   icon: Receipt         },
  { label: "Odomètre",       href: "/odometre",   icon: Gauge           },
  { label: "Apprentissages", href: "/learnings",  icon: Brain           },
  { label: "Diagnostic",     href: "/diagnostic", icon: Activity        },
];

export default function Sidebar() {
  const pathname = usePathname();

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

      {/* BOTTOM NAV MOBILE (< md) — scrollable horizontale pour tout voir */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-50 pb-[env(safe-area-inset-bottom)] overflow-x-auto">
        <div className="flex h-16 min-w-max px-2">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 px-4 min-w-[70px] transition-colors ${
                  isActive
                    ? "text-[#0a1f3f]"
                    : "text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.25 : 1.75} />
                <span className="text-[9px] font-medium whitespace-nowrap">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
