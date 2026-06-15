import ReactPDF from "@react-pdf/renderer";
import React from "react";

const { Document, Page, Text, View, StyleSheet } = ReactPDF;

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: "Helvetica", fontSize: 11, color: "#333" },
  header: { backgroundColor: "#0a1f3f", padding: 24, marginHorizontal: -40, marginTop: -40, marginBottom: 20 },
  headerTitle: { color: "white", fontSize: 20, fontFamily: "Helvetica-Bold" },
  headerSub: { color: "#94a3b8", fontSize: 10, marginTop: 4 },
  docType: { color: "white", fontSize: 22, fontFamily: "Helvetica-Bold", textAlign: "right", marginTop: -30 },
  infoBar: { backgroundColor: "#f5f5f5", padding: 10, borderRadius: 4, flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  sectionTitle: { color: "#0a1f3f", fontSize: 12, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, borderBottomWidth: 2, borderBottomColor: "#0a1f3f", paddingBottom: 4, marginBottom: 8, marginTop: 16 },
  row: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#ddd", paddingVertical: 8 },
  tableHeader: { flexDirection: "row", backgroundColor: "#0a1f3f", paddingVertical: 8, paddingHorizontal: 12 },
  tableHeaderText: { color: "white", fontSize: 10, fontFamily: "Helvetica-Bold" },
  tableCell: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 11 },
  totalBox: { backgroundColor: "#0a1f3f", padding: 16, borderRadius: 4, marginTop: 20, alignItems: "flex-end" },
  totalText: { color: "white", fontSize: 20, fontFamily: "Helvetica-Bold" },
  totalLabel: { color: "#94a3b8", fontSize: 10 },
  paymentBox: { backgroundColor: "#f0f7ff", borderWidth: 1, borderColor: "#b3d4fc", borderRadius: 8, padding: 14, marginTop: 20 },
  paymentTitle: { fontFamily: "Helvetica-Bold", fontSize: 12 },
  paymentEmail: { fontSize: 14, marginTop: 6 },
  paymentTerms: { fontSize: 10, color: "#666", marginTop: 6 },
  footer: { backgroundColor: "#0a1f3f", padding: 12, position: "absolute", bottom: 0, left: 0, right: 0 },
  footerText: { color: "#94a3b8", fontSize: 9, textAlign: "center" },
  sigSection: { flexDirection: "row", justifyContent: "space-between", marginTop: 40 },
  sigLine: { borderTopWidth: 1, borderTopColor: "#333", width: 180, paddingTop: 6 },
  sigLabel: { fontSize: 10, color: "#666" },
  conditions: { fontSize: 10, lineHeight: 1.6, color: "#444", marginTop: 8 },
});

export interface LineItemData {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export interface DocData {
  docNumber: string;
  docType: "facture" | "contrat";
  clientName: string;
  clientAddress?: string;
  clientPhone?: string;
  clientEmail?: string;
  service: string;
  amount: number;
  paymentTerms: string;
  lineItems?: LineItemData[];
  notes?: string;
}

function InvoicePDF({ data }: { data: DocData }) {
  const title = data.docType === "contrat" ? "CONTRAT DE SERVICE" : "FACTURE";
  const today = new Date().toLocaleDateString("fr-CA", { year: "numeric", month: "long", day: "numeric" });
  const isContract = data.docType === "contrat";
  const hasLineItems = !!(data.lineItems && data.lineItems.length > 0);

  // Pre-compute table rows
  const rowEls = hasLineItems
    ? data.lineItems!.map((item) =>
        React.createElement(View, { style: styles.row },
          React.createElement(Text, { style: [styles.tableCell, { flex: 4 }] }, item.description),
          React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: "right" }] }, item.qty !== 1 ? String(item.qty) : ""),
          React.createElement(Text, { style: [styles.tableCell, { flex: 2, textAlign: "right" }] }, `${item.unitPrice}$`),
          React.createElement(Text, { style: [styles.tableCell, { flex: 2, textAlign: "right" }] }, `${item.total}$`),
        )
      )
    : [
        React.createElement(View, { style: styles.row },
          React.createElement(Text, { style: [styles.tableCell, { flex: 3 }] }, data.service),
          React.createElement(Text, { style: [styles.tableCell, { flex: 1, textAlign: "right" }] }, `${data.amount}$`),
        ),
      ];

  const tableHeaderEl = hasLineItems
    ? React.createElement(View, { style: styles.tableHeader },
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 4 }] }, "Description"),
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 1, textAlign: "right" }] }, "Qté"),
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 2, textAlign: "right" }] }, "Prix unit."),
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 2, textAlign: "right" }] }, "Total"),
      )
    : React.createElement(View, { style: styles.tableHeader },
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 3 }] }, "Description"),
        React.createElement(Text, { style: [styles.tableHeaderText, { flex: 1, textAlign: "right" }] }, "Montant"),
      );

  // Build all page children as a flat array to allow dynamic row spreading
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageChildren: any[] = [
    // Header
    React.createElement(View, { style: styles.header },
      React.createElement(Text, { style: styles.headerTitle }, "ENTRETIEN PISCINE GRANBY"),
      React.createElement(Text, { style: styles.headerSub }, "Thomas Demers-Ménard — 450-994-2215 — service@entretienpiscinegranby.com"),
      React.createElement(Text, { style: styles.docType }, title),
    ),
    // Info bar
    React.createElement(View, { style: styles.infoBar },
      React.createElement(Text, { style: { fontFamily: "Helvetica-Bold" } }, data.docNumber),
      React.createElement(Text, {}, `Date: ${today}`),
    ),
    // Client section
    React.createElement(Text, { style: styles.sectionTitle }, "Client"),
    React.createElement(Text, { style: { fontFamily: "Helvetica-Bold", marginBottom: 2 } }, data.clientName),
    data.clientAddress ? React.createElement(Text, {}, data.clientAddress) : null,
    data.clientPhone ? React.createElement(Text, {}, data.clientPhone) : null,
    data.clientEmail ? React.createElement(Text, {}, data.clientEmail) : null,
    // Services table
    React.createElement(Text, { style: styles.sectionTitle }, "Services"),
    tableHeaderEl,
    ...rowEls,
    // Notes (optional)
    ...(data.notes ? [
      React.createElement(View, { style: { marginTop: 12, padding: 10, backgroundColor: "#f9f9f9", borderRadius: 4 } },
        React.createElement(Text, { style: { fontFamily: "Helvetica-Bold", fontSize: 10, marginBottom: 4 } }, "Notes:"),
        React.createElement(Text, { style: { fontSize: 10, color: "#555" } }, data.notes),
      ),
    ] : []),
    // Total
    React.createElement(View, { style: styles.totalBox },
      React.createElement(Text, { style: styles.totalLabel }, "TOTAL"),
      React.createElement(Text, { style: styles.totalText }, `${data.amount}$`),
    ),
    // Payment
    React.createElement(View, { style: styles.paymentBox },
      React.createElement(Text, { style: styles.paymentTitle }, "Paiement par virement Interac:"),
      React.createElement(Text, { style: styles.paymentEmail }, "service@entretienpiscinegranby.com"),
      React.createElement(Text, { style: styles.paymentTerms }, data.paymentTerms),
    ),
    // Contract conditions + signatures
    ...(isContract ? [
      React.createElement(View, {},
        React.createElement(Text, { style: styles.sectionTitle }, "Conditions"),
        React.createElement(Text, { style: styles.conditions }, "Le présent contrat confirme l'entente entre Entretien Piscine Granby et le client pour les services décrits ci-dessus pour la saison 2026. Le service débute à l'ouverture de la piscine (mi-avril/début mai) et se termine à la fermeture (fin septembre/octobre). L'annulation est possible avec un préavis de 14 jours. Des frais d'administration de 100$ s'appliquent."),
        React.createElement(View, { style: styles.sigSection },
          React.createElement(View, {},
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Signature du client"),
            React.createElement(Text, { style: { fontSize: 9, color: "#999", marginTop: 2 } }, "Date: _______________"),
          ),
          React.createElement(View, {},
            React.createElement(View, { style: styles.sigLine }),
            React.createElement(Text, { style: styles.sigLabel }, "Thomas Demers-Ménard"),
            React.createElement(Text, { style: { fontSize: 9, color: "#999", marginTop: 2 } }, "Entretien Piscine Granby"),
          ),
        ),
      ),
    ] : []),
    // Footer
    React.createElement(View, { style: styles.footer },
      React.createElement(Text, { style: styles.footerText }, "Entretien Piscine Granby — 86 rue de Windsor, Granby QC J2H 1V4 — 450-994-2215"),
    ),
  ].filter(Boolean);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PageEl = (React.createElement as any)(Page, { size: "LETTER", style: styles.page }, ...pageChildren);
  return React.createElement(Document, {}, PageEl);
}

export async function generatePDFBuffer(data: DocData): Promise<Buffer> {
  // Nettoyer les données
  if (data.clientAddress) {
    let addr = data.clientAddress;
    // Couper tout après "et", "mon email", "courriel", etc.
    addr = addr.split(/\s+(?:et\s|mon\s|email|courriel|pis\s|aussi\s)/i)[0].trim();
    // Enlever emails
    addr = addr.replace(/[\w.-]+@[\w.-]+\.\w+/g, "").trim();
    // Enlever numéros de téléphone
    addr = addr.replace(/\+?\d{10,}/g, "").trim();
    // Enlever doubles espaces
    addr = addr.replace(/\s{2,}/g, " ").trim();
    // Si trop court après nettoyage, ignorer
    data.clientAddress = addr.length >= 8 ? addr : undefined;
  }
  if (data.clientEmail) {
    const emailOnly = data.clientEmail.match(/[\w.-]+@[\w.-]+\.\w{2,}/);
    data.clientEmail = emailOnly ? emailOnly[0].toLowerCase() : undefined;
  }
  if (data.clientPhone) {
    const digits = data.clientPhone.replace(/\D/g, "").slice(-10);
    if (digits.length === 10) {
      data.clientPhone = `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
  }

  const doc = React.createElement(InvoicePDF, { data });
  const pdfStream = await ReactPDF.renderToStream(doc as React.ReactElement);

  const chunks: Buffer[] = [];
  for await (const chunk of pdfStream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
