"use client";

import { useEffect, useState } from "react";

/* Bloc "Vendeur" pour la fiche client admin: closer assigné, paiements avec
   QUI les a créés, appels journalisés. Lecture via /api/admin/lead-vendeur-info. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function VendeurInfo({ leadId }: { leadId: string }) {
  const [data, setData] = useState<Any>(null);

  useEffect(() => {
    fetch(`/api/admin/lead-vendeur-info?leadId=${leadId}`).then((r) => r.json()).then(setData).catch(() => {});
  }, [leadId]);

  if (!data) return null;
  const hasContent = data.assignedCloser || (data.payments?.length ?? 0) > 0 || (data.calls?.length ?? 0) > 0;
  if (!hasContent) return null;

  return (
    <div className="bg-sur rounded-xl p-6 border border-line">
      <h2 className="text-sm font-bold font-display text-ink mb-3">Vendeur</h2>

      <div className="flex items-center justify-between text-sm mb-3">
        <span className="text-mut">Closer assigné</span>
        <span className="font-semibold text-ink">{data.assignedCloser || "Non assigné"}</span>
      </div>

      {data.payments?.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] uppercase tracking-wide text-mut mb-1.5">Paiements</div>
          {data.payments.map((p: Any) => (
            <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-line last:border-0 text-sm">
              <span className="text-ink">
                {p.amount}$ · {p.kind || "paiement"}
                {p.creator && <span className="text-mut"> — créé par {p.creator}</span>}
              </span>
              <span className={p.status === "reçu" ? "text-pos" : p.status === "rembourse" || p.status === "echoue" ? "text-neg" : "text-warn"}>
                {p.status === "reçu" ? "payé ✓" : p.status}
              </span>
            </div>
          ))}
        </div>
      )}

      {data.calls?.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wide text-mut mb-1.5">Appels</div>
          {data.calls.map((c: Any) => (
            <div key={c.id} className="py-1.5 border-b border-line last:border-0 text-sm">
              <div className="flex justify-between">
                <span className="text-ink">{c.outcome} {c.closer && <span className="text-mut">· {c.closer}</span>}</span>
                <span className="text-mut text-xs">{new Date(c.called_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {c.objection && <div className="text-warn text-xs mt-0.5">« {c.objection} »</div>}
              {c.notes && <div className="text-mut text-xs mt-0.5">{c.notes}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
