"use client";

import { useEffect, useState } from "react";

/* Paiements — style relevé: le dû d'abord avec un bouton Payer, puis
   l'historique net. Les liens de paiement passent par /api/pay/{id}
   (session Stripe fraîche à chaque clic). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const fmtM = (n: number) => Number(n || 0).toLocaleString("fr-CA");

export default function PortailPaiements() {
  const [payments, setPayments] = useState<Any[]>([]);
  const [balance, setBalance] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/portail/payments", {
      headers: { Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        setPayments(d.payments || []);
        setBalance(d.balance || 0);
        setTotalPaid(d.total_paid || 0);
      })
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  const due = payments.filter((p) => p.status === "en_attente");
  const paid = payments.filter((p) => p.status === "reçu");

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 16 }}>Paiements 💳</h1>

      {/* ── Le dû, en premier ── */}
      {due.length > 0 ? (
        due.map((p, i) => (
          <div className={`ptl-card${i === 0 ? " glow" : ""}`} key={p.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
              <div>
                <span className="lbl">À régler</span>
                <p style={{ fontFamily: "var(--disp)", fontWeight: 900, fontSize: "1.7rem", marginTop: 2 }}>
                  {fmtM(p.amount)} $
                </p>
                <p className="ptl-note">
                  {p.notes || "Service de piscine"}
                  {p.due_date ? ` · dû le ${new Date(p.due_date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long" })}` : ""}
                </p>
              </div>
              <a href={`/api/pay/${p.id}`} className="ptl-btn" style={{ width: "auto", padding: "13px 22px", flex: "none" }}>
                Payer
              </a>
            </div>
          </div>
        ))
      ) : (
        <div className="ptl-card glow" style={{ textAlign: "center", padding: "26px 18px" }}>
          <p style={{ fontSize: "1.6rem", marginBottom: 6 }}>✓</p>
          <p style={{ fontWeight: 800, fontFamily: "var(--disp)" }}>Tout est réglé</p>
          <p className="ptl-note" style={{ marginTop: 4 }}>Aucun paiement en attente. Merci! 🌊</p>
        </div>
      )}

      {/* ── Sommaire ── */}
      <div className="ptl-card" style={{ marginTop: 12 }}>
        <div className="ptl-row">
          <span className="k">Payé cette saison</span>
          <span className="v ptl-green">{fmtM(totalPaid)} $</span>
        </div>
        <div className="ptl-row">
          <span className="k">Solde restant</span>
          <span className="v">{fmtM(balance)} $</span>
        </div>
      </div>

      {/* ── Historique ── */}
      {paid.length > 0 && (
        <div className="ptl-card" style={{ marginTop: 12 }}>
          <span className="lbl">Historique</span>
          <div style={{ marginTop: 4 }}>
            {paid.map((p) => (
              <div className="ptl-row" key={p.id}>
                <span className="k">
                  {p.notes || "Paiement"}
                  <span style={{ display: "block", fontSize: ".76rem", color: "var(--faint)" }}>
                    {p.received_date ? new Date(p.received_date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" }) : ""}
                  </span>
                </span>
                <span className="v">
                  {fmtM(p.amount)} $ <span className="ptl-chip ok">payé ✓</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="ptl-note" style={{ textAlign: "center", marginTop: 16 }}>
        Paiement sécurisé par Stripe. Une question sur une facture? Écris-nous dans l&apos;onglet Contact.
      </p>
    </div>
  );
}
