"use client";

import { useEffect, useState } from "react";

/* Commissions — vue admin. Totaux par closer + liste, marquer un lot payé,
   coût d'acquisition réel (commissions vs encaissé). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const PERIODS = [{ v: "semaine", l: "7 jours" }, { v: "mois", l: "30 jours" }, { v: "all", l: "Tout" }];

export default function AdminCommissions() {
  const [period, setPeriod] = useState("semaine");
  const [closers, setClosers] = useState<Any[]>([]);
  const [commissions, setCommissions] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState("");

  const load = async () => {
    setReady(false);
    const d = await fetch(`/api/admin/commissions?period=${period}`).then((r) => r.json());
    setClosers(d.closers || []);
    setCommissions(d.commissions || []);
    setReady(true);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [period]);

  const payBatch = async (closerId: string, name: string) => {
    if (!confirm(`Marquer toutes les commissions à payer de ${name} comme PAYÉES?`)) return;
    setBusy(closerId);
    await fetch("/api/admin/commissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ closerId }) });
    await load();
    setBusy("");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h1 style={{ fontWeight: 900, fontSize: "1.4rem" }}>Commissions</h1>
        <div style={{ display: "flex", gap: 6 }}>
          {PERIODS.map((p) => (
            <button key={p.v} onClick={() => setPeriod(p.v)} className={period === p.v ? "" : ""} style={{ background: period === p.v ? "var(--cyan)" : "var(--panel)", color: period === p.v ? "#04121F" : "var(--mut)", border: "1px solid var(--line)", borderRadius: 8, padding: "6px 12px", fontSize: ".78rem", fontWeight: 700, cursor: "pointer" }}>{p.l}</button>
          ))}
        </div>
      </div>

      {!ready ? null : closers.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Aucune commission sur cette période.</p></div>
      ) : (
        <>
          {closers.map((c) => (
            <div className="vnd-card" key={c.closerId} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "1.05rem" }}>{c.name}</span>
                <span style={{ fontSize: ".76rem", color: "var(--mut)" }}>{c.contrats} contrat{c.contrats > 1 ? "s" : ""}</span>
              </div>
              <div className="vnd-row"><span className="k" style={{ color: "var(--mut)" }}>À payer</span><span className="vnd-ok" style={{ color: "var(--warn)" }}>{c.a_payer.toLocaleString("fr-CA")}$</span></div>
              <div className="vnd-row"><span className="k" style={{ color: "var(--mut)" }}>Déjà payé</span><span style={{ color: "var(--green)" }}>{c.paye.toLocaleString("fr-CA")}$</span></div>
              <div className="vnd-row"><span className="k" style={{ color: "var(--mut)" }}>Encaissé pour toi</span><span style={{ fontWeight: 700 }}>{c.encaisse.toLocaleString("fr-CA")}$</span></div>
              {c.cout_acquisition != null && (
                <div className="vnd-row"><span className="k" style={{ color: "var(--mut)" }}>Coût d&apos;acquisition</span><span>{c.cout_acquisition}% de l&apos;encaissé</span></div>
              )}
              {c.a_payer > 0 && (
                <button className="vnd-btn" style={{ marginTop: 10 }} disabled={busy === c.closerId} onClick={() => payBatch(c.closerId, c.name)}>
                  {busy === c.closerId ? "…" : `Marquer ${c.a_payer.toLocaleString("fr-CA")}$ comme payé`}
                </button>
              )}
            </div>
          ))}

          <p className="lbl" style={{ margin: "20px 0 10px" }}>Détail</p>
          <div className="vnd-card">
            {commissions.map((c) => (
              <div className="vnd-row" key={c.id}>
                <div>
                  <div style={{ fontSize: ".86rem", fontWeight: 600 }}>{c.lead} <span style={{ color: "var(--faint)", fontWeight: 400 }}>· {c.closer}</span></div>
                  <div style={{ fontSize: ".72rem", color: "var(--faint)" }}>
                    {c.kind === "base" ? "Base" : "Bonus comptant"} · {new Date(c.earned_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}
                    {c.cancelled_reason ? ` · ${c.cancelled_reason}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontWeight: 700 }}>{c.amount}$</div>
                  <span className="vnd-chip" style={{ background: c.status === "paye" ? "rgba(61,220,151,.14)" : c.status === "annulee" ? "rgba(255,122,122,.12)" : "rgba(242,201,76,.12)", color: c.status === "paye" ? "var(--green)" : c.status === "annulee" ? "var(--red)" : "var(--warn)", fontSize: ".64rem" }}>
                    {c.status === "paye" ? "payé" : c.status === "annulee" ? "annulée" : "à payer"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
