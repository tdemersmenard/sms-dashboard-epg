"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
import { Snowflake, CheckCircle2, MessageCircle, ChevronDown, ChevronUp } from "lucide-react";

interface TrackedClient {
  id: string;
  name: string;
  phone: string;
  hasReplied: boolean;
  job?: { date: string; start: string | null; status: string };
}

function displayName(c: { first_name?: string | null; last_name?: string | null; phone?: string | null }): string {
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return n || c.phone || "(sans nom)";
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("fr-CA", { timeZone: "America/Montreal", weekday: "short", day: "numeric", month: "short" });
}

/**
 * Vue d'ensemble de la saison des fermetures: % de clients admissibles
 * (fermeture incluse dans leur forfait) qui ont planifié, et liste de ceux qui restent.
 * Affiché seulement pendant la saison (septembre → mi-novembre).
 */
export default function FermeturesTracker() {
  const { franchiseId, franchiseSlug } = useFranchise();
  const [loading, setLoading] = useState(true);
  const [planned, setPlanned] = useState<TrackedClient[]>([]);
  const [remaining, setRemaining] = useState<TrackedClient[]>([]);
  const [showPlanned, setShowPlanned] = useState(false);

  const month = new Date().getMonth() + 1; // 1-12
  const inSeason = month >= 9 && month <= 11;

  useEffect(() => {
    if (!franchiseId || !inSeason) { setLoading(false); return; }

    const load = async () => {
      try {
        const seasonStart = `${new Date().getFullYear()}-09-01`;

        const [{ data: contacts }, { data: jobs }, { data: inbound }] = await Promise.all([
          supabaseBrowser
            .from("contacts")
            .select("id, first_name, last_name, phone, services, stage")
            .eq("franchise_id", franchiseId)
            .not("phone", "is", null),
          supabaseBrowser
            .from("jobs")
            .select("contact_id, scheduled_date, scheduled_time_start, status")
            .eq("franchise_id", franchiseId)
            .eq("job_type", "fermeture")
            .neq("status", "annulé")
            .gte("scheduled_date", seasonStart),
          supabaseBrowser
            .from("messages")
            .select("contact_id")
            .eq("franchise_id", franchiseId)
            .eq("direction", "inbound")
            .gte("created_at", seasonStart),
        ]);

        const jobByContact = new Map<string, { date: string; start: string | null; status: string }>();
        for (const j of jobs || []) {
          if (!jobByContact.has(j.contact_id)) {
            jobByContact.set(j.contact_id, { date: j.scheduled_date, start: j.scheduled_time_start, status: j.status });
          }
        }
        const repliedSet = new Set((inbound || []).map((m) => m.contact_id));

        const plannedList: TrackedClient[] = [];
        const remainingList: TrackedClient[] = [];
        for (const c of contacts || []) {
          const services = (c.services || []).join(" ");
          if (!/entretien|package/i.test(services)) continue; // fermeture non incluse → pas suivi ici
          if (c.stage === "perdu") continue;
          const entry: TrackedClient = {
            id: c.id,
            name: displayName(c),
            phone: c.phone,
            hasReplied: repliedSet.has(c.id),
            job: jobByContact.get(c.id),
          };
          if (entry.job) plannedList.push(entry);
          else remainingList.push(entry);
        }

        plannedList.sort((a, b) => (a.job!.date < b.job!.date ? -1 : 1));
        // Ceux qui ont répondu mais pas booké en premier (à relancer en priorité)
        remainingList.sort((a, b) => Number(b.hasReplied) - Number(a.hasReplied) || a.name.localeCompare(b.name));

        setPlanned(plannedList);
        setRemaining(remainingList);
      } catch (e) {
        console.error("[FermeturesTracker] load error:", e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [franchiseId, inSeason]);

  if (!inSeason) return null;

  const total = planned.length + remaining.length;
  const pct = total > 0 ? Math.round((planned.length / total) * 100) : 0;
  const repliedNotBooked = remaining.filter((r) => r.hasReplied).length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Snowflake size={16} className="text-sky-600" />
          <h2 className="text-sm font-bold text-gray-800">Fermetures — saison {new Date().getFullYear()}</h2>
        </div>
        {!loading && total > 0 && (
          <span className="text-sm font-bold text-gray-800">
            {planned.length}/{total} <span className="font-medium text-gray-500">planifiées ({pct}%)</span>
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Chargement…</p>
      ) : total === 0 ? (
        <p className="text-xs text-gray-400">Aucun client avec fermeture incluse.</p>
      ) : (
        <>
          {/* Barre de progression */}
          <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-sky-500 rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* À planifier */}
          {remaining.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-gray-600 mb-2">
                À planifier ({remaining.length})
                {repliedNotBooked > 0 && (
                  <span className="ml-2 text-emerald-600 font-medium">
                    dont {repliedNotBooked} ont répondu — à suivre en priorité
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {remaining.map((c) => (
                  <a
                    key={c.id}
                    href={`/${franchiseSlug}/messages?contact=${c.id}`}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition hover:shadow-sm ${
                      c.hasReplied
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                        : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                    }`}
                    title={c.hasReplied ? "A répondu cette saison — pas encore booké" : "Aucune réponse depuis le début de la saison"}
                  >
                    {c.hasReplied && <MessageCircle size={11} />}
                    {c.name}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Planifiées (repliable) */}
          {planned.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <button
                onClick={() => setShowPlanned(!showPlanned)}
                className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-800 transition"
              >
                {showPlanned ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                Planifiées ({planned.length})
              </button>
              {showPlanned && (
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {planned.map((c) => (
                    <a
                      key={c.id}
                      href={`/${franchiseSlug}/messages?contact=${c.id}`}
                      className="flex items-center gap-1.5 text-xs text-gray-700 hover:text-gray-900 transition"
                    >
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{c.name}</span>
                      <span className="text-gray-400 shrink-0">
                        {fmtDate(c.job!.date)}{c.job!.start ? ` ${c.job!.start.slice(0, 5)}` : ""}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
