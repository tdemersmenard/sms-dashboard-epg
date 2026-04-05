"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Kanban, MessageSquare, Users,
  Calendar, FileText, Zap, Brain, BarChart3,
} from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard",       href: "/dashboard",   icon: LayoutDashboard },
  { label: "Analytics",       href: "/analytics",   icon: BarChart3 },
  { label: "Pipeline",        href: "/pipeline",    icon: Kanban },
  { label: "Messages",        href: "/messages",    icon: MessageSquare },
  { label: "Clients",         href: "/clients",     icon: Users },
  { label: "Calendrier",      href: "/calendar",    icon: Calendar },
  { label: "Templates",       href: "/templates",   icon: FileText },
  { label: "Automations",     href: "/automations", icon: Zap },
  { label: "Apprentissages",  href: "/learnings",   icon: Brain },
];

interface SidebarProps {
  unreadCount?: number;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export default function Sidebar({
  unreadCount = 0,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      style={{ width: 260 }}
      className={`fixed inset-y-0 left-0 flex flex-col bg-[#0a1f3f] z-50 transition-transform duration-300 ease-in-out md:translate-x-0 ${
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      }`}
    >
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-white/10">
        <p className="text-white font-bold text-2xl tracking-tight">CHLORE</p>
        <p className="text-[#94a3b8] text-sm mt-0.5">Entretien Piscine Granby</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onMobileClose}
              className={`flex items-center gap-3 px-5 py-3 rounded-lg text-sm transition-all duration-150 ${
                active
                  ? "bg-white/10 text-white font-medium"
                  : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
              }`}
            >
              <Icon size={18} strokeWidth={1.75} />
              <span className="flex-1">{label}</span>
              {label === "Messages" && unreadCount > 0 && (
                <span className="min-w-[20px] h-5 rounded-full bg-red-500 text-white text-[11px] font-semibold flex items-center justify-center px-1">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-5 py-4 border-t border-white/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[11px] font-semibold">TDM</span>
        </div>
        <span className="text-gray-400 text-sm truncate">Thomas Demers-Ménard</span>
      </div>
    </aside>
  );
}
