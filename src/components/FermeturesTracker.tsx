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

interface SoldFermeture {
  id: string;
  name: string;
  date: string;
  start: string | null;
  amount: number | null;      // null = paiement pas encore créé (type de piscine inconnu)
  paid: boolean;
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
  const [sold, setSold] = useState<SoldFermeture[]>([]);
  const [showSold, setShowSold] = useState(false);

  const month = new Date().getMonth() + 1; // 1-12
  const inSeason = month >= 9 && month <= 11;

  useEffect(() => {
    if (!franchiseId || !inSeason) { setLoading(false); return; }

    const load = async () => {
      try {
        const seasonStart = `${new Date().getFullYear()}-09-01`;

        const [{ data: contacts }, { data: jobs }, { data: inbound }, { data: fermeturePayments }] = await Promise.all([
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
          supabaseBrowser
            .from("payments")
            .select("contact_id, amount, status")
            .eq("franchise_id", franchiseId)
            .ilike("notes", "%fermeture%"),
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

        // ── Fermetures VENDUES (hors forfait — Flow B): comptage + revenu ──────
        const payByContact = new Map<string, { amount: number; paid: boolean }>();
        for (const p of fermeturePayments || []) {
          if (!payByContact.has(p.contact_id)) {
            payByContact.set(p.contact_id, { amount: Number(p.amount), paid: p.status === "reçu" });
          }
        }
        const contactById = new Map((contacts || []).map((c) => [c.id, c]));
        const soldList: SoldFermeture[] = [];
        const seenSold = new Set<string>();
        for (const j of jobs || []) {
          if (seenSold.has(j.contact_id)) continue;
          const c = contactById.get(j.contact_id);
          if (!c) continue;
          const services = (c.services || []).join(" ");
          // On exclut seulement entretien/package (inclus); "fermeture" seule = vendue
          if (/entretien|package/i.test(services)) continue;
          seenSold.add(j.contact_id);
          const pay = payByContact.get(j.contact_id);
          soldList.push({
            id: c.id,
            name: displayName(c),
            date: j.scheduled_date,
            start: j.scheduled_time_start,
            amount: pay ? pay.amount : null,
            paid: pay?.paid ?? false,
          });
        }
        soldList.sort((a, b) => (a.date < b.date ? -1 : 1));
        setSold(soldList);
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

  const soldRevenue = sold.reduce((s, f) => s + (f.amount ?? 0), 0);
  const soldPaid = sold.filter((f) => f.paid).reduce((s, f) => s + (f.amount ?? 0), 0);
  const soldPendingPrice = sold.filter((f) => f.amount === null).length;

  return (
    <div className="bg-sur rounded-xl  border border-line p-5 mt-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Snowflake size={16} className="text-acc" />
          <h2 className="text-sm font-bold text-ink">Fermetures — saison {new Date().getFullYear()}</h2>
        </div>
        {!loading && total > 0 && (
          <span className="text-sm font-bold text-ink">
            {planned.length}/{total} <span className="font-medium text-mut">incluses au forfait planifiées ({pct}%)</span>
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-mut">Chargement…</p>
      ) : total === 0 && sold.length === 0 ? (
        <p className="text-xs text-mut">Aucune fermeture à suivre pour l'instant.</p>
      ) : (
        <>
          {/* Fermetures vendues (hors forfait) */}
          <div className="mb-4 p-3 bg-emerald-50/60 border border-emerald-100 rounded-lg">
            <button
              onClick={() => setShowSold(!showSold)}
              className="w-full flex items-center justify-between text-left"
            >
              <span className="text-xs font-semibold text-emerald-800">
                💰 Fermetures vendues (hors forfait): {sold.length}
              </span>
              <span className="flex items-center gap-2 text-xs font-bold text-emerald-800">
                {soldRevenue > 0 && (
                  <>
                    {soldRevenue}$
                    <span className="font-medium text-emerald-600">({soldPaid}$ reçu)</span>
                  </>
                )}
                {showSold ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </span>
            </button>
            {soldPendingPrice > 0 && (
              <p className="text-[11px] text-amber-700 mt-1">
                {soldPendingPrice} en attente de prix (type de piscine à confirmer)
              </p>
            )}
            {showSold && sold.length > 0 && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {sold.map((f) => (
                  <a
                    key={f.id}
                    href={`/${franchiseSlug}/messages?contact=${f.id}`}
                    className="flex items-center gap-1.5 text-xs text-ink hover:text-ink transition"
                  >
                    <CheckCircle2 size={12} className={f.paid ? "text-emerald-500" : "text-amber-400"} />
                    <span className="truncate">{f.name}</span>
                    <span className="text-mut shrink-0">
                      {fmtDate(f.date)}{f.start ? ` ${f.start.slice(0, 5)}` : ""}
                    </span>
                    <span className={`shrink-0 font-medium ${f.amount === null ? "text-amber-600" : f.paid ? "text-emerald-600" : "text-mut"}`}>
                      {f.amount === null ? "prix?" : `${f.amount}$${f.paid ? " ✓" : ""}`}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Barre de progression */}
          <div className="w-full h-2.5 bg-chip rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-acc-grad rounded-full transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>

          {/* À planifier */}
          {remaining.length > 0 && (
            <div className="mb-2">
              <p className="text-xs font-semibold text-mut mb-2">
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
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition hover: ${
                      c.hasReplied
                        ? "bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100"
                        : "bg-page border-line text-ink hover:bg-chip"
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
            <div className="mt-3 pt-3 border-t border-line">
              <button
                onClick={() => setShowPlanned(!showPlanned)}
                className="flex items-center gap-1 text-xs font-semibold text-mut hover:text-ink transition"
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
                      className="flex items-center gap-1.5 text-xs text-ink hover:text-ink transition"
                    >
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                      <span className="truncate">{c.name}</span>
                      <span className="text-mut shrink-0">
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
