"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, DollarSign, Calendar, MessageSquare } from "lucide-react";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Job, Message, Contact } from "@/lib/types";

const JOB_TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ouverture: { bg: "bg-green-100",  text: "text-green-700" },
  entretien: { bg: "bg-blue-100",   text: "text-blue-700" },
  fermeture: { bg: "bg-orange-100", text: "text-orange-700" },
  visite:    { bg: "bg-purple-100", text: "text-purple-700" },
  autre:     { bg: "bg-gray-100",   text: "text-gray-700" },
};

function displayName(c: { first_name?: string | null; last_name?: string | null; name?: string | null; phone?: string | null }): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name?.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

function formatTime(d: string) {
  const date = new Date(d);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return date.toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "hier";
  return date.toLocaleDateString("fr-CA", { day: "numeric", month: "short" });
}

interface Stats {
  newLeads: number;
  revenue: number;
  jobsThisWeek: number;
  unreadMessages: number;
}

type JobWithContact = Job & { contactName: string };
type MsgWithContact = Message & { contactName: string; phone: string };

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ newLeads: 0, revenue: 0, jobsThisWeek: 0, unreadMessages: 0 });
  const [upcomingJobs, setUpcomingJobs] = useState<JobWithContact[]>([]);
  const [recentMessages, setRecentMessages] = useState<MsgWithContact[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const today = new Date();
      const todayStr = format(today, "yyyy-MM-dd");
      const monday = format(startOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");
      const sunday = format(endOfWeek(today, { weekStartsOn: 1 }), "yyyy-MM-dd");

      const [
        { count: newLeads },
        { data: revenueData },
        { count: jobsThisWeek },
        { count: unreadMessages },
        { data: jobsRaw },
        { data: msgsRaw },
      ] = await Promise.all([
        supabaseBrowser.from("contacts").select("id", { count: "exact", head: true }).eq("stage", "nouveau"),
        supabaseBrowser.from("contacts").select("season_price").in("stage", ["closé", "planifié", "complété"]),
        supabaseBrowser.from("jobs").select("id", { count: "exact", head: true }).gte("scheduled_date", monday).lte("scheduled_date", sunday),
        supabaseBrowser.from("messages").select("id", { count: "exact", head: true }).eq("is_read", false).eq("direction", "inbound"),
        supabaseBrowser.from("jobs").select("*").gte("scheduled_date", todayStr).neq("status", "annulé").order("scheduled_date").limit(5),
        supabaseBrowser.from("messages").select("*").eq("direction", "inbound").order("created_at", { ascending: false }).limit(5),
      ]);

      const revenue = (revenueData ?? []).reduce((sum, c) => sum + (c.season_price ?? 0), 0);

      setStats({
        newLeads: newLeads ?? 0,
        revenue,
        jobsThisWeek: jobsThisWeek ?? 0,
        unreadMessages: unreadMessages ?? 0,
      });

      // Enrich jobs with contact names
      if (jobsRaw && jobsRaw.length > 0) {
        const ids = Array.from(new Set(jobsRaw.map((j) => j.contact_id)));
        const { data: cs } = await supabaseBrowser.from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, displayName(c)]));
        setUpcomingJobs(jobsRaw.map((j) => ({ ...j, contactName: map[j.contact_id] ?? "Client" })) as JobWithContact[]);
      }

      // Enrich messages with contact names
      if (msgsRaw && msgsRaw.length > 0) {
        const ids = Array.from(new Set(msgsRaw.map((m) => m.contact_id).filter(Boolean)));
        const { data: cs } = await supabaseBrowser.from("contacts").select("id,first_name,last_name,name,phone").in("id", ids);
        const map = Object.fromEntries((cs ?? []).map((c) => [c.id, { name: displayName(c), phone: c.phone ?? "" }]));
        setRecentMessages(
          msgsRaw.map((m) => ({
            ...m,
            contactName: map[m.contact_id]?.name ?? m.contact_id ?? "Inconnu",
            phone: map[m.contact_id]?.phone ?? "",
          })) as MsgWithContact[]
        );
      }

      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  const statCards = [
    {
      label: "Nouveaux leads",
      value: stats.newLeads,
      icon: <UserPlus size={20} className="text-blue-600" />,
      iconBg: "bg-blue-50",
      display: String(stats.newLeads),
    },
    {
      label: "Revenu potentiel",
      value: stats.revenue,
      icon: <DollarSign size={20} className="text-green-600" />,
      iconBg: "bg-green-50",
      display: stats.revenue.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 }),
    },
    {
      label: "Jobs cette semaine",
      value: stats.jobsThisWeek,
      icon: <Calendar size={20} className="text-purple-600" />,
      iconBg: "bg-purple-50",
      display: String(stats.jobsThisWeek),
    },
    {
      label: "Messages non-lus",
      value: stats.unreadMessages,
      icon: <MessageSquare size={20} className="text-orange-600" />,
      iconBg: "bg-orange-50",
      display: String(stats.unreadMessages),
    },
  ];

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className={`w-10 h-10 rounded-full ${s.iconBg} flex items-center justify-center mb-3`}>
              {s.icon}
            </div>
            <p className="text-2xl font-bold text-gray-900">{s.display}</p>
            <p className="text-sm text-gray-500 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Upcoming jobs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-4">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Prochains rendez-vous</h2>
        {upcomingJobs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun rendez-vous à venir</p>
        ) : (
          <div className="space-y-2">
            {upcomingJobs.map((j) => {
              const jc = JOB_TYPE_COLORS[j.job_type] ?? JOB_TYPE_COLORS.autre;
              return (
                <div key={j.id} className="flex items-center gap-3 py-1.5">
                  <p className="text-sm text-gray-500 w-28 flex-shrink-0">
                    {format(new Date(j.scheduled_date + "T00:00:00"), "d MMM yyyy", { locale: fr })}
                    {j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}
                  </p>
                  <p className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">{j.contactName}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${jc.bg} ${jc.text}`}>
                    {j.job_type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recent messages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Derniers messages reçus</h2>
        {recentMessages.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun message reçu</p>
        ) : (
          <div className="space-y-1">
            {recentMessages.map((m) => (
              <div
                key={m.id}
                onClick={() => router.push("/messages")}
                className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50 rounded-lg px-2 -mx-2 transition"
              >
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-gray-500">
                    {m.contactName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{m.contactName}</p>
                  <p className="text-xs text-gray-500 truncate">{m.body}</p>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(m.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
