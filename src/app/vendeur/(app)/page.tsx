"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { vendeurBrowser } from "@/lib/vendeur/client";

/* File d'appels du jour — priorisée. Toutes les données viennent en JWT closer
   (RLS: ne renvoie que ses leads assignés). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });

function priority(lead: Any, now: number): { rank: number; why: string; cls: string } | null {
  const cb = lead.next_callback_at ? new Date(lead.next_callback_at) : null;
  const cbDay = cb ? cb.toLocaleDateString("en-CA", { timeZone: "America/Montreal" }) : null;
  if (lead.pipeline_status === "client" || lead.pipeline_status === "depot_paye" || lead.pipeline_status === "perdu") return null;

  // 1. Rappel prévu aujourd'hui (ou échu)
  if (cbDay && cbDay <= todayStr()) {
    const h = cb ? new Date(cb).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit", timeZone: "America/Montreal" }) : "";
    return { rank: 1, why: `⏰ Rappel prévu ${cbDay === todayStr() ? "aujourd'hui" : "échu"}${h ? " à " + h : ""}`, cls: "hot" };
  }
  // 2. Nouveau assigné < 24h
  const assignedAt = lead.assigned_at ? new Date(lead.assigned_at).getTime() : null;
  if (lead.pipeline_status === "nouveau" && assignedAt && now - assignedAt < 24 * 3600e3) {
    return { rank: 2, why: "🔥 Nouveau lead (moins de 24h)", cls: "warm" };
  }
  // 3. En négociation
  if (lead.pipeline_status === "negociation") {
    return { rank: 3, why: "💬 En négociation", cls: "warm" };
  }
  // 4. À relancer (contacté, pas de rappel futur)
  if (["nouveau", "contacte", "rappel_prevu"].includes(lead.pipeline_status) && (!cbDay || cbDay <= todayStr())) {
    return { rank: 4, why: "📞 À relancer", cls: "" };
  }
  return { rank: 5, why: "", cls: "" };
}

export default function VendeurDashboard() {
  const [leads, setLeads] = useState<Any[]>([]);
  const [stats, setStats] = useState({ appels: 0, depots: 0, valeur: 0 });
  const [sectors, setSectors] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const sb = vendeurBrowser();
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      const [{ data: ls }, { data: calls }, { data: pays }, { data: secs }] = await Promise.all([
        sb.from("contacts").select("id, first_name, last_name, phone, city, pool_type, pipeline_status, assigned_at, next_callback_at, notes"),
        sb.from("call_logs").select("id").gte("called_at", todayStr() + "T00:00:00"),
        sb.from("payments").select("amount, status, kind, created_at").eq("created_by", user?.id ?? "").eq("status", "reçu"),
        sb.from("sector_capacity").select("secteur, capacite, places_prises"),
      ]);
      setLeads(ls || []);
      const today = todayStr();
      const depotsToday = (pays || []).filter((p) => (p.created_at || "").slice(0, 10) === today);
      setStats({
        appels: (calls || []).length,
        depots: depotsToday.length,
        valeur: (pays || []).reduce((s, p) => s + Number(p.amount || 0), 0),
      });
      setSectors(secs || []);
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  const now = Date.now();
  const queue = leads
    .map((l) => ({ l, p: priority(l, now) }))
    .filter((x) => x.p && x.p.rank <= 4)
    .sort((a, b) => a.p!.rank - b.p!.rank || (a.l.assigned_at || "").localeCompare(b.l.assigned_at || ""));

  return (
    <div>
      <div className="vnd-stats">
        <div className="vnd-stat"><div className="v">{stats.appels}</div><div className="k">appels aujourd&apos;hui</div></div>
        <div className="vnd-stat"><div className="v">{stats.depots}</div><div className="k">dépôts encaissés</div></div>
        <div className="vnd-stat"><div className="v">{stats.valeur.toLocaleString("fr-CA")}$</div><div className="k">valeur signée</div></div>
      </div>

      <p className="lbl" style={{ marginBottom: 10 }}>Ta file d&apos;appels ({queue.length})</p>
      {queue.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Rien à appeler pour l&apos;instant 🌊 Beau travail!</p></div>
      ) : (
        queue.map(({ l, p }) => (
          <Link key={l.id} href={`/vendeur/lead/${l.id}`} className={`vnd-card ${p!.cls}`} style={{ display: "block" }}>
            <div className="vnd-lead">
              <div className="top">
                <span className="name">{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone}</span>
                <span className={`vnd-chip ${l.pipeline_status || "nouveau"}`}>{(l.pipeline_status || "nouveau").replace("_", " ")}</span>
              </div>
              <div className="meta">{l.city || "?"}{l.pool_type ? ` · ${l.pool_type}` : ""} · {l.phone}</div>
              {p!.why && <div className="why" style={{ color: p!.cls === "hot" ? "var(--red)" : p!.cls === "warm" ? "var(--warn)" : "var(--mut)" }}>{p!.why}</div>}
            </div>
          </Link>
        ))
      )}

      {sectors.length > 0 && (
        <>
          <p className="lbl" style={{ margin: "22px 0 10px" }}>Places restantes par secteur</p>
          <div className="vnd-card">
            {sectors.map((s) => {
              const reste = Math.max(0, s.capacite - s.places_prises);
              return (
                <div className="vnd-row" key={s.secteur}>
                  <span>{s.secteur}</span>
                  <span className="vnd-ok" style={{ color: reste <= 3 ? "var(--warn)" : "var(--green)" }}>{reste} place{reste > 1 ? "s" : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
