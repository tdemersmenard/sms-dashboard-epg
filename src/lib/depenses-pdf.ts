import React from "react";
import ReactPDF from "@react-pdf/renderer";
import {
  Depense, CATS, CategorieDepense, TAUX_MARGINAL,
  montantDeductible, fmt, MOIS_FR,
} from "@/lib/depenses-config";
import { getVehicleDeduction } from "@/lib/depenses-deduction";

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

// ── Palette ────────────────────────────────────────────────────────
const NAVY      = "#0a1f3f";
const WHITE     = "#ffffff";
const SLATE400  = "#94a3b8";
const GREEN     = "#16a34a";
const AMBER     = "#d97706";
const AMBER_BG  = "#fffbeb";
const GRAY50    = "#f9fafb";
const GRAY100   = "#f3f4f6";
const GRAY200   = "#e5e7eb";
const GRAY500   = "#6b7280";
const GRAY900   = "#111827";
const BLUE      = "#2563eb";

// ── Styles communs ─────────────────────────────────────────────────
const S = StyleSheet.create({
  page:           { padding: 40, fontFamily: "Helvetica", fontSize: 10, color: GRAY900, paddingBottom: 52 },
  header:         { backgroundColor: NAVY, marginHorizontal: -40, marginTop: -40, padding: 22, marginBottom: 22, flexDirection: "row", justifyContent: "space-between" },
  headerTitle:    { color: WHITE, fontSize: 15, fontFamily: "Helvetica-Bold" },
  headerSub:      { color: SLATE400, fontSize: 8.5, marginTop: 3 },
  headerRight:    { alignItems: "flex-end" },
  headerDocType:  { color: WHITE, fontSize: 19, fontFamily: "Helvetica-Bold" },
  headerDocSub:   { color: SLATE400, fontSize: 8.5, marginTop: 3 },

  summaryRow:         { flexDirection: "row", marginBottom: 20 },
  summaryCard:        { flex: 1, backgroundColor: GRAY50, borderRadius: 4, padding: 10, borderWidth: 1, borderColor: GRAY200, marginRight: 8 },
  summaryCardLast:    { flex: 1, backgroundColor: GRAY50, borderRadius: 4, padding: 10, borderWidth: 1, borderColor: GRAY200 },
  summaryLabel:       { fontSize: 8, color: GRAY500, marginBottom: 3 },
  summaryValue:       { fontSize: 14, fontFamily: "Helvetica-Bold", color: GRAY900 },
  summaryValueGreen:  { fontSize: 14, fontFamily: "Helvetica-Bold", color: GREEN },
  summaryValueBlue:   { fontSize: 14, fontFamily: "Helvetica-Bold", color: BLUE },

  sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: NAVY, textTransform: "uppercase", borderBottomWidth: 1.5, borderBottomColor: NAVY, paddingBottom: 4, marginBottom: 6, marginTop: 20 },

  th:       { flexDirection: "row", backgroundColor: NAVY, paddingVertical: 6, paddingHorizontal: 8 },
  thText:   { color: WHITE, fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  tr:       { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: GRAY100 },
  trAlt:    { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: GRAY100, backgroundColor: GRAY50 },
  trTotal:  { flexDirection: "row", paddingVertical: 7, paddingHorizontal: 8, backgroundColor: NAVY },
  td:       { fontSize: 9, color: "#374151" },
  tdBold:   { fontSize: 9, fontFamily: "Helvetica-Bold", color: GRAY900 },
  tdGreen:  { fontSize: 9, fontFamily: "Helvetica-Bold", color: GREEN },
  tdGray:   { fontSize: 9, color: GRAY500 },
  tdWhite:  { fontSize: 9, fontFamily: "Helvetica-Bold", color: WHITE },
  tdSlate:  { fontSize: 9, color: SLATE400 },

  warnBox:   { backgroundColor: AMBER_BG, borderWidth: 1, borderColor: AMBER, borderRadius: 4, padding: 10, marginTop: 16 },
  warnTitle: { fontFamily: "Helvetica-Bold", fontSize: 9.5, color: "#92400e", marginBottom: 4 },
  warnText:  { fontSize: 8.5, color: "#92400e", lineHeight: 1.5 },

  footer:     { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: NAVY, padding: 9 },
  footerText: { color: SLATE400, fontSize: 8, textAlign: "center" },
});

// ── Composants partagés ────────────────────────────────────────────

function Header(docType: string, docSub: string) {
  const today = new Date().toLocaleDateString("fr-CA", {
    year: "numeric", month: "long", day: "numeric",
  });
  return React.createElement(View, { style: S.header },
    React.createElement(View, {},
      React.createElement(Text, { style: S.headerTitle }, "ENTRETIEN PISCINE GRANBY"),
      React.createElement(Text, { style: S.headerSub }, "Thomas Demers-Ménard — 450-994-2215 — service@entretienpiscinegranby.com"),
    ),
    React.createElement(View, { style: S.headerRight },
      React.createElement(Text, { style: S.headerDocType }, docType),
      React.createElement(Text, { style: S.headerDocSub }, docSub),
      React.createElement(Text, { style: S.headerDocSub }, `Généré le ${today}`),
    ),
  );
}

function Footer() {
  return React.createElement(View, { style: S.footer },
    React.createElement(Text, { style: S.footerText },
      "Entretien Piscine Granby — 86 rue de Windsor, Granby QC J2H 1V4 — 450-994-2215 — service@entretienpiscinegranby.com"
    ),
  );
}

function WarningRecu(sansRecu: Depense[]) {
  if (sansRecu.length === 0) return null;
  return React.createElement(View, { style: S.warnBox },
    React.createElement(Text, { style: S.warnTitle },
      `⚠  ${sansRecu.length} dépense${sansRecu.length > 1 ? "s" : ""} sans reçu attaché`
    ),
    React.createElement(Text, { style: S.warnText },
      sansRecu.map(d => `• ${d.date}  ${d.description}  (${fmt(d.montant)})`).join("\n")
    ),
  );
}

function CatRecapTable(depenses: Depense[]) {
  const rows = (Object.keys(CATS) as CategorieDepense[])
    .map(key => {
      const items = depenses.filter(d => d.categorie === key);
      if (items.length === 0) return null;
      const totalM = items.reduce((s, d) => s + d.montant, 0);
      const totalD = items.reduce((s, d) => {
        const pct = key === "vehicule" ? getVehicleDeduction(d.date) : CATS[key].pct;
        return s + montantDeductible(d.montant, pct);
      }, 0);
      return { key, cat: CATS[key], count: items.length, totalM, totalD };
    })
    .filter(Boolean) as { key: CategorieDepense; cat: typeof CATS[CategorieDepense]; count: number; totalM: number; totalD: number }[];

  const grandTotalM = rows.reduce((s, r) => s + r.totalM, 0);
  const grandTotalD = rows.reduce((s, r) => s + r.totalD, 0);

  return React.createElement(View, {},
    React.createElement(Text, { style: S.sectionTitle }, "Récapitulatif par catégorie"),
    React.createElement(View, { style: S.th },
      React.createElement(Text, { style: [S.thText, { flex: 3 }] }, "Catégorie"),
      React.createElement(Text, { style: [S.thText, { width: 45, textAlign: "center" }] }, "Nb"),
      React.createElement(Text, { style: [S.thText, { width: 45, textAlign: "center" }] }, "% Déd."),
      React.createElement(Text, { style: [S.thText, { width: 90, textAlign: "right" }] }, "Total dépensé"),
      React.createElement(Text, { style: [S.thText, { width: 90, textAlign: "right" }] }, "Total déductible"),
    ),
    ...rows.map((r, i) =>
      React.createElement(View, { key: r.key, style: i % 2 === 0 ? S.tr : S.trAlt },
        React.createElement(Text, { style: [S.tdBold, { flex: 3, color: r.cat.pdfColor }] }, r.cat.label),
        React.createElement(Text, { style: [S.tdGray, { width: 45, textAlign: "center" }] }, String(r.count)),
        React.createElement(Text, { style: [S.tdGray, { width: 45, textAlign: "center" }] }, `${r.cat.pct}%`),
        React.createElement(Text, { style: [S.tdBold, { width: 90, textAlign: "right" }] }, fmt(r.totalM)),
        React.createElement(Text, { style: [S.tdGreen, { width: 90, textAlign: "right" }] }, fmt(r.totalD)),
      )
    ),
    React.createElement(View, { style: S.trTotal },
      React.createElement(Text, { style: [S.tdWhite, { flex: 3 }] }, "Total"),
      React.createElement(Text, { style: [S.tdSlate, { width: 45, textAlign: "center" }] }, String(depenses.length)),
      React.createElement(Text, { style: [S.tdSlate, { width: 45 }] }, ""),
      React.createElement(Text, { style: [S.tdWhite, { width: 90, textAlign: "right" }] }, fmt(grandTotalM)),
      React.createElement(Text, { style: [S.tdWhite, { width: 90, textAlign: "right" }] }, fmt(grandTotalD)),
    ),
  );
}

function DepenseListTable(depenses: Depense[], sectionLabel: string) {
  const grandTotalM = depenses.reduce((s, d) => s + d.montant, 0);
  const grandTotalD = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);

  return React.createElement(View, {},
    React.createElement(Text, { style: S.sectionTitle }, sectionLabel),
    React.createElement(View, { style: S.th },
      React.createElement(Text, { style: [S.thText, { width: 58 }] }, "Date"),
      React.createElement(Text, { style: [S.thText, { flex: 1 }] }, "Description"),
      React.createElement(Text, { style: [S.thText, { width: 80 }] }, "Catégorie"),
      React.createElement(Text, { style: [S.thText, { width: 58, textAlign: "right" }] }, "Montant"),
      React.createElement(Text, { style: [S.thText, { width: 30, textAlign: "center" }] }, "%"),
      React.createElement(Text, { style: [S.thText, { width: 65, textAlign: "right" }] }, "Déductible"),
    ),
    ...depenses.map((d, i) => {
      const cat = CATS[d.categorie];
      const rowPct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : cat.pct;
      const deductible = montantDeductible(d.montant, rowPct);
      return React.createElement(View, { key: d.id, style: i % 2 === 0 ? S.tr : S.trAlt },
        React.createElement(Text, { style: [S.tdGray, { width: 58 }] },
          new Date(d.date + "T12:00:00").toLocaleDateString("fr-CA", { month: "2-digit", day: "2-digit" })
        ),
        React.createElement(View, { style: { flex: 1 } },
          React.createElement(Text, { style: S.td }, d.description.length > 38 ? d.description.slice(0, 38) + "…" : d.description),
          d.note ? React.createElement(Text, { style: [S.tdGray, { fontSize: 7.5, marginTop: 1 }] }, d.note.slice(0, 45)) : null,
        ),
        React.createElement(Text, { style: [S.td, { width: 80, color: cat.pdfColor, fontSize: 8 }] }, cat.label),
        React.createElement(Text, { style: [S.tdBold, { width: 58, textAlign: "right" }] }, fmt(d.montant)),
        React.createElement(Text, { style: [S.tdGray, { width: 30, textAlign: "center" }] }, `${rowPct}%`),
        React.createElement(Text, { style: [S.tdGreen, { width: 65, textAlign: "right" }] }, fmt(deductible)),
      );
    }),
    React.createElement(View, { style: S.trTotal },
      React.createElement(Text, { style: [S.tdWhite, { flex: 1 }] }, `Total — ${depenses.length} dépense${depenses.length > 1 ? "s" : ""}`),
      React.createElement(Text, { style: [S.tdSlate, { width: 80 }] }, ""),
      React.createElement(Text, { style: [S.tdWhite, { width: 58, textAlign: "right" }] }, fmt(grandTotalM)),
      React.createElement(Text, { style: [S.tdSlate, { width: 30 }] }, ""),
      React.createElement(Text, { style: [S.tdWhite, { width: 65, textAlign: "right" }] }, fmt(grandTotalD)),
    ),
  );
}

async function renderToBuffer(element: React.ReactElement): Promise<Buffer> {
  const stream = await ReactPDF.renderToStream(element);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// ── 1. Rapport Fiscal Annuel ───────────────────────────────────────

export async function generateRapportAnnuelBuffer(depenses: Depense[], annee: number): Promise<Buffer> {
  const totalM = depenses.reduce((s, d) => s + d.montant, 0);
  const totalD = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);
  const economie = totalD * TAUX_MARGINAL;
  const nbRecus = depenses.filter(d => d.recu_url).length;
  const sansRecu = depenses.filter(d => !d.recu_url);

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: "LETTER", style: S.page },
      Header(`RAPPORT FISCAL ${annee}`, `Année d'imposition ${annee}`),

      // Summary cards
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Total dépenses"),
          React.createElement(Text, { style: S.summaryValue }, fmt(totalM)),
        ),
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Total déductible"),
          React.createElement(Text, { style: S.summaryValueGreen }, fmt(totalD)),
        ),
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, `Économie d'impôt (~${Math.round(TAUX_MARGINAL * 100)}%)`),
          React.createElement(Text, { style: S.summaryValueBlue }, fmt(economie)),
        ),
        React.createElement(View, { style: S.summaryCardLast },
          React.createElement(Text, { style: S.summaryLabel }, "Reçus attachés"),
          React.createElement(Text, { style: S.summaryValue }, `${nbRecus} / ${depenses.length}`),
        ),
      ),

      CatRecapTable(depenses),

      depenses.length > 0 ? DepenseListTable(
        [...depenses].sort((a, b) => a.date.localeCompare(b.date)),
        "Toutes les dépenses"
      ) : null,

      sansRecu.length > 0 ? WarningRecu(sansRecu) : null,

      Footer(),
    )
  );

  return renderToBuffer(doc as React.ReactElement);
}

// ── 2. Bilan par mois (toute l'année) ─────────────────────────────

export async function generateBilanMensuelBuffer(depenses: Depense[], annee: number): Promise<Buffer> {
  const totalM = depenses.reduce((s, d) => s + d.montant, 0);
  const totalD = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);

  const byMonth = Array.from({ length: 12 }, (_, i) => {
    const moisNum = i + 1;
    const items = depenses.filter(d => parseInt(d.date.split("-")[1]) === moisNum);
    const mTotal = items.reduce((s, d) => s + d.montant, 0);
    const mDed = items.reduce((s, d) => {
      const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
      return s + montantDeductible(d.montant, pct);
    }, 0);
    return { moisNum, label: MOIS_FR[i], items, mTotal, mDed };
  });

  const moisActifs = byMonth.filter(m => m.items.length > 0);

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: "LETTER", style: S.page },
      Header(`BILAN MENSUEL ${annee}`, `Répartition par mois — ${annee}`),

      // Summary
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, `Total dépenses ${annee}`),
          React.createElement(Text, { style: S.summaryValue }, fmt(totalM)),
        ),
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Total déductible"),
          React.createElement(Text, { style: S.summaryValueGreen }, fmt(totalD)),
        ),
        React.createElement(View, { style: S.summaryCardLast },
          React.createElement(Text, { style: S.summaryLabel }, "Mois avec dépenses"),
          React.createElement(Text, { style: S.summaryValue }, `${moisActifs.length} / 12`),
        ),
      ),

      // Monthly table
      React.createElement(Text, { style: S.sectionTitle }, "Répartition par mois"),
      React.createElement(View, { style: S.th },
        React.createElement(Text, { style: [S.thText, { flex: 2 }] }, "Mois"),
        React.createElement(Text, { style: [S.thText, { width: 55, textAlign: "center" }] }, "Dépenses"),
        React.createElement(Text, { style: [S.thText, { width: 95, textAlign: "right" }] }, "Total dépensé"),
        React.createElement(Text, { style: [S.thText, { width: 95, textAlign: "right" }] }, "Total déductible"),
        React.createElement(Text, { style: [S.thText, { width: 95, textAlign: "right" }] }, "Économie est."),
      ),
      ...byMonth.map((m, i) =>
        React.createElement(View, { key: m.moisNum, style: m.items.length === 0 ? S.tr : (i % 2 === 0 ? S.tr : S.trAlt) },
          React.createElement(Text, { style: [m.items.length > 0 ? S.tdBold : S.tdGray, { flex: 2 }] }, m.label),
          React.createElement(Text, { style: [S.tdGray, { width: 55, textAlign: "center" }] }, m.items.length > 0 ? String(m.items.length) : "—"),
          React.createElement(Text, { style: [m.items.length > 0 ? S.tdBold : S.tdGray, { width: 95, textAlign: "right" }] }, m.items.length > 0 ? fmt(m.mTotal) : "—"),
          React.createElement(Text, { style: [m.items.length > 0 ? S.tdGreen : S.tdGray, { width: 95, textAlign: "right" }] }, m.items.length > 0 ? fmt(m.mDed) : "—"),
          React.createElement(Text, { style: [m.items.length > 0 ? S.tdBold : S.tdGray, { width: 95, textAlign: "right", color: m.items.length > 0 ? BLUE : GRAY500 }] },
            m.items.length > 0 ? fmt(m.mDed * TAUX_MARGINAL) : "—"
          ),
        )
      ),
      React.createElement(View, { style: S.trTotal },
        React.createElement(Text, { style: [S.tdWhite, { flex: 2 }] }, "Total"),
        React.createElement(Text, { style: [S.tdSlate, { width: 55, textAlign: "center" }] }, String(depenses.length)),
        React.createElement(Text, { style: [S.tdWhite, { width: 95, textAlign: "right" }] }, fmt(totalM)),
        React.createElement(Text, { style: [S.tdWhite, { width: 95, textAlign: "right" }] }, fmt(totalD)),
        React.createElement(Text, { style: [S.tdWhite, { width: 95, textAlign: "right" }] }, fmt(totalD * TAUX_MARGINAL)),
      ),

      CatRecapTable(depenses),

      Footer(),
    )
  );

  return renderToBuffer(doc as React.ReactElement);
}

// ── 3. Rapport d'un mois précis (pour cron + envoi auto) ──────────

export async function generateRapportMoisBuffer(
  depenses: Depense[],
  mois: number,
  annee: number
): Promise<Buffer> {
  const nomMois = MOIS_FR[mois - 1];
  const totalM = depenses.reduce((s, d) => s + d.montant, 0);
  const totalD = depenses.reduce((s, d) => {
    const pct = d.categorie === "vehicule" ? getVehicleDeduction(d.date) : CATS[d.categorie].pct;
    return s + montantDeductible(d.montant, pct);
  }, 0);
  const economie = totalD * TAUX_MARGINAL;
  const nbRecus = depenses.filter(d => d.recu_url).length;
  const sansRecu = depenses.filter(d => !d.recu_url);

  const doc = React.createElement(Document, {},
    React.createElement(Page, { size: "LETTER", style: S.page },
      Header(`RAPPORT MENSUEL`, `${nomMois} ${annee}`),

      // Summary
      React.createElement(View, { style: S.summaryRow },
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Total dépenses"),
          React.createElement(Text, { style: S.summaryValue }, fmt(totalM)),
        ),
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Total déductible"),
          React.createElement(Text, { style: S.summaryValueGreen }, fmt(totalD)),
        ),
        React.createElement(View, { style: S.summaryCard },
          React.createElement(Text, { style: S.summaryLabel }, "Économie d'impôt est."),
          React.createElement(Text, { style: S.summaryValueBlue }, fmt(economie)),
        ),
        React.createElement(View, { style: S.summaryCardLast },
          React.createElement(Text, { style: S.summaryLabel }, "Reçus attachés"),
          React.createElement(Text, { style: S.summaryValue }, `${nbRecus} / ${depenses.length}`),
        ),
      ),

      depenses.length > 0
        ? DepenseListTable(
            [...depenses].sort((a, b) => a.date.localeCompare(b.date)),
            `Dépenses de ${nomMois} ${annee}`
          )
        : React.createElement(Text, { style: [S.tdGray, { marginTop: 20, textAlign: "center" }] },
            `Aucune dépense enregistrée pour ${nomMois} ${annee}.`
          ),

      sansRecu.length > 0 ? WarningRecu(sansRecu) : null,

      Footer(),
    )
  );

  return renderToBuffer(doc as React.ReactElement);
}
