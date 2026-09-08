"use client";

import { useState } from "react";
import { Copy, Check, AlertTriangle, FileDown, Mail, Loader2, CalendarClock } from "lucide-react";
import {
  Depense, CATS, CategorieDepense,
  montantDeductible, fmt, TAUX_MARGINAL, MOIS_FR,
} from "@/lib/depenses";
import { getVehicleDeduction } from "@/lib/depenses-deduction";

interface Props {
  depenses: Depense[];
  annee: number;
}

export default function RapportFiscal({ depenses, annee }: Props) {
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<"ok" | "error" | null>(null);

  const totalMontant   = depenses.reduce((s, d) => s + d.montant, 0);
  const totalDeductible = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);
  const totalEconomie  = totalDeductible * TAUX_MARGINAL;
  const nbRecus        = depenses.filter(d => d.recu_url).length;
  const sansRecu       = depenses.filter(d => !d.recu_url);

  const bycat = (Object.keys(CATS) as CategorieDepense[])
    .map(key => {
      const cat   = CATS[key];
      const items = depenses.filter(d => d.categorie === key);
      if (!items.length) return null;
      const totalM = items.reduce((s, d) => s + d.montant, 0);
      const totalD = items.reduce((s, d) => {
        const pct = key === "vehicule" ? getVehicleDeduction(d.date) : cat.pct;
        return s + montantDeductible(d.montant, pct);
      }, 0);
      return { key, cat, count: items.length, totalM, totalD };
    })
    .filter(Boolean) as {
      key: CategorieDepense;
      cat: (typeof CATS)[CategorieDepense];
      count: number; totalM: number; totalD: number;
    }[];

  // Mois précédent (pour l'envoi manuel)
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMois  = prevMonth.getMonth() + 1;
  const prevAnnee = prevMonth.getFullYear();
  const prevLabel = `${MOIS_FR[prevMois - 1]} ${prevAnnee}`;

  const handleCopyText = () => {
    const lines = [
      `RAPPORT FISCAL ${annee} — Entretien Piscine Granby`,
      `Préparé le ${new Date().toLocaleDateString("fr-CA")}`,
      "",
      "=== RÉSUMÉ ===",
      `Total dépenses       : ${fmt(totalMontant)}`,
      `Total déductible     : ${fmt(totalDeductible)}`,
      `Économie d'impôt est.: ${fmt(totalEconomie)} (taux ~${Math.round(TAUX_MARGINAL * 100)}%)`,
      `Reçus attachés       : ${nbRecus}/${depenses.length}`,
      "",
      "=== PAR CATÉGORIE ===",
      ...bycat.map(x =>
        `${x.cat.label.padEnd(22)} ${fmt(x.totalM).padStart(10)} → ${fmt(x.totalD).padStart(10)} déductible  (${x.count} dép.)`
      ),
    ];
    if (sansRecu.length > 0) {
      lines.push("");
      lines.push(`⚠  ${sansRecu.length} dépense(s) sans reçu :`);
      sansRecu.forEach(d => lines.push(`   - ${d.date}  |  ${d.description}  |  ${fmt(d.montant)}`));
    }
    navigator.clipboard.writeText(lines.join("\n")).catch(console.error);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleSendNow = async () => {
    setSending(true);
    setSendResult(null);
    try {
      const res = await fetch("/api/depenses/envoyer-rapport", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annee: prevAnnee, mois: prevMois }),
      });
      setSendResult(res.ok ? "ok" : "error");
    } catch {
      setSendResult("error");
    } finally {
      setSending(false);
      setTimeout(() => setSendResult(null), 5000);
    }
  };

  if (depenses.length === 0) {
    return (
      <div className="text-center py-12 text-mut text-sm bg-sur rounded-xl border border-line">
        Aucune dépense pour cette période.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alert reçus manquants */}
      {sansRecu.length > 0 && (
        <div className="flex items-start gap-3 bg-chip border border-line rounded-xl p-4">
          <AlertTriangle size={18} className="text-warn flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-warn">
              {sansRecu.length} dépense{sansRecu.length > 1 ? "s" : ""} sans reçu attaché
            </p>
            <p className="text-xs text-mut mt-0.5 leading-relaxed">
              {sansRecu.map(d => d.description).join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-sur rounded-xl border border-line p-4">
          <p className="lbl mb-1">Total dépenses {annee}</p>
          <p className="font-display num text-2xl font-bold text-ink">{fmt(totalMontant)}</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4">
          <p className="lbl mb-1">Total déductible</p>
          <p className="font-display num text-2xl font-bold text-pos">{fmt(totalDeductible)}</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4">
          <p className="lbl mb-1">Économie d&apos;impôt estimée</p>
          <p className="font-display num text-2xl font-bold text-acc">{fmt(totalEconomie)}</p>
          <p className="text-[10px] text-mut mt-0.5">taux marginal ~{Math.round(TAUX_MARGINAL * 100)}%</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4">
          <p className="lbl mb-1">Reçus attachés</p>
          <p className="font-display num text-2xl font-bold text-ink">
            {nbRecus}
            <span className="text-base font-normal text-mut"> / {depenses.length}</span>
          </p>
        </div>
      </div>

      {/* Recap table */}
      <div className="bg-sur rounded-xl border border-line overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="font-display font-semibold text-ink">Récapitulatif par catégorie</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-page border-b border-line">
                <th className="text-left px-5 py-3 lbl">Catégorie</th>
                <th className="text-center px-4 py-3 lbl">Nb dép.</th>
                <th className="text-center px-4 py-3 lbl">% Déd.</th>
                <th className="text-right px-4 py-3 lbl">Total dépensé</th>
                <th className="text-right px-5 py-3 lbl">Total déductible</th>
              </tr>
            </thead>
            <tbody>
              {bycat.map(({ key, cat, count, totalM, totalD }) => (
                <tr key={key} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cat.tailwindBg} ${cat.tailwindText}`}>
                      {cat.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-mut">{count}</td>
                  <td className="px-4 py-3 text-center text-mut">{key === "vehicule" ? "var." : `${cat.pct}%`}</td>
                  <td className="px-4 py-3 text-right font-medium num text-ink">{fmt(totalM)}</td>
                  <td className="px-5 py-3 text-right font-semibold num text-pos">{fmt(totalD)}</td>
                </tr>
              ))}
              <tr className="bg-page font-semibold border-t border-line">
                <td className="px-5 py-3 text-ink">Total</td>
                <td className="px-4 py-3 text-center text-ink">{depenses.length}</td>
                <td />
                <td className="px-4 py-3 text-right num text-ink">{fmt(totalMontant)}</td>
                <td className="px-5 py-3 text-right num text-pos">{fmt(totalDeductible)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Actions PDF ─────────────────────────────────────────────── */}
      <div className="bg-sur rounded-xl border border-line p-5 space-y-3">
        <h3 className="font-display font-semibold text-ink mb-4">Télécharger en PDF</h3>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/depenses/rapport-annuel?annee=${annee}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 btn-glow text-sm font-medium rounded-lg hover:opacity-90 transition"
          >
            <FileDown size={16} />
            Rapport fiscal {annee}
          </a>
          <a
            href={`/api/depenses/bilan-mensuel?annee=${annee}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 btn-glow text-sm font-medium rounded-lg hover:opacity-90 transition"
          >
            <FileDown size={16} />
            Bilan par mois {annee}
          </a>
          <button
            onClick={handleCopyText}
            className="flex items-center gap-2 px-4 py-2.5 bg-chip text-ink text-sm font-medium rounded-lg hover:bg-chip transition"
          >
            {copied ? <Check size={16} className="text-pos" /> : <Copy size={16} />}
            {copied ? "Copié !" : "Copier texte (comptable)"}
          </button>
        </div>
      </div>

      {/* ── Auto-envoi mensuel ──────────────────────────────────────── */}
      <div className="bg-sur rounded-xl border border-line p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-chip flex items-center justify-center flex-shrink-0 mt-0.5">
            <CalendarClock size={18} className="text-acc" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display font-semibold text-ink">Rapport mensuel automatique</h3>
            <p className="text-xs text-mut mt-1 leading-relaxed">
              Le 1er de chaque mois à 8h, le rapport du mois précédent est généré en PDF et envoyé
              automatiquement à <span className="font-medium text-ink">service@entretienpiscinegranby.com</span>.
            </p>
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="flex items-center gap-2 px-3.5 py-2 btn-glow text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
              >
                {sending
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Mail size={14} />
                }
                {sending ? "Envoi..." : `Envoyer rapport de ${prevLabel} maintenant`}
              </button>
              {sendResult === "ok" && (
                <span className="flex items-center gap-1 text-xs text-pos font-medium">
                  <Check size={13} /> Envoyé !
                </span>
              )}
              {sendResult === "error" && (
                <span className="text-xs text-neg font-medium">
                  Erreur — vérifier la connexion Gmail
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
