"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

interface AutomationCard {
  id: string;
  name: string;
  trigger: string;
  action: string;
}

const AUTOMATIONS: AutomationCard[] = [
  { id: "relance_nouveau",    name: "Relance nouveau lead",  trigger: "Lead sans réponse depuis 48h",       action: "Envoie SMS « Relance nouveau lead »" },
  { id: "relance_soumission", name: "Relance soumission",    trigger: "Soumission sans réponse depuis 72h", action: "Envoie SMS « Relance soumission »" },
  { id: "rappel_paiement",    name: "Rappel paiement",       trigger: "Paiement dû dans 7 jours",           action: "Envoie SMS « Rappel paiement »" },
  { id: "paiement_retard",    name: "Paiement en retard",    trigger: "Paiement en retard de 3+ jours",     action: "Envoie SMS rappel urgent + marque en retard" },
  { id: "rappel_rdv",         name: "Rappel RDV",            trigger: "Job planifié demain",                action: "Envoie SMS « Rappel RDV veille »" },
  { id: "suivi_complete",     name: "Suivi job complété",    trigger: "Job complété il y a 24h",            action: "Envoie SMS « Job complété »" },
  { id: "avis_google",        name: "Demande avis Google",   trigger: "Job complété il y a 7 jours",        action: "Envoie SMS « Demande avis Google »" },
];

interface AutomationLog {
  id: string;
  created_at: string;
  contact_id: string | null;
  action: string;
  status: string;
}

export default function AutomationsPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    Object.fromEntries(AUTOMATIONS.map((a) => [a.id, true]))
  );
  const [logs, setLogs] = useState<AutomationLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  useEffect(() => {
    supabaseBrowser
      .from("automation_logs")
      .select("id, created_at, contact_id, action, status")
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setLogs((data ?? []) as AutomationLog[]);
        setLogsLoading(false);
      });
  }, []);

  const toggle = (id: string) =>
    setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Automations</h1>

      <div className="space-y-3">
        {AUTOMATIONS.map((a) => {
          const active = enabled[a.id];
          return (
            <div key={a.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold text-gray-900 text-sm">{a.name}</p>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                    {active ? "Actif" : "Inactif"}
                  </span>
                </div>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-gray-700">Déclencheur :</span> {a.trigger}
                </p>
                <p className="text-sm text-gray-500">
                  <span className="font-medium text-gray-600">Action :</span> {a.action}
                </p>
              </div>
              <button
                onClick={() => toggle(a.id)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${active ? "bg-green-500" : "bg-gray-200"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${active ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Recent logs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mt-6">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Logs récents</h2>
        {logsLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-5 h-5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun log pour l&apos;instant</p>
        ) : (
          <div className="space-y-1">
            {logs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400 w-36 flex-shrink-0">
                  {new Date(l.created_at).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="text-xs text-gray-600 flex-1 min-w-0 truncate font-mono">{l.action}</span>
                <span className="text-xs text-gray-500 flex-shrink-0 w-24 truncate">{l.contact_id?.slice(0, 8) ?? "—"}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                  l.status === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
                }`}>
                  {l.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
