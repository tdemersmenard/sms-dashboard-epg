"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Trash2, Search, Send, Download, ChevronDown, ChevronUp } from "lucide-react";
interface CatalogItem {
  id: string;
  name: string;
  description?: string | null;
  default_price: number;
  category?: string | null;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string;
  email: string | null;
  address: string | null;
}

interface LineItem {
  description: string;
  qty: number;
  unitPrice: number;
  total: number;
}

export default function NouvelleFacturePage() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [catalogItems, setCatalogItems] = useState<CatalogItem[]>([]);
  const [search, setSearch] = useState("");
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [notes, setNotes] = useState("");
  const [showCatalog, setShowCatalog] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; docNumber?: string; pdfUrl?: string; emailSent?: boolean; emailError?: string | null; noEmail?: boolean } | null>(null);

  const catalogCategories = Array.from(new Set(catalogItems.map(i => i.category || "Autre")));

  const filteredContacts = contacts.filter(c => {
    const name = [c.first_name, c.last_name].filter(Boolean).join(" ").toLowerCase();
    const phone = c.phone || "";
    const q = search.toLowerCase();
    return name.includes(q) || phone.includes(q);
  });

  const loadContacts = useCallback(async () => {
    const res = await fetch("/api/contacts");
    const data = await res.json();
    setContacts(data.contacts || []);
  }, []);

  const loadCatalog = useCallback(async () => {
    const res = await fetch("/api/catalog");
    const data = await res.json();
    const items = data.items || [];
    setCatalogItems(items);
    if (items.length > 0 && !activeCategory) {
      setActiveCategory(items[0].category || "Autre");
    }
  }, [activeCategory]);

  useEffect(() => { loadContacts(); loadCatalog(); }, [loadContacts, loadCatalog]);

  const selectContact = (c: Contact) => {
    setSelectedContact(c);
    setSearch([c.first_name, c.last_name].filter(Boolean).join(" "));
    setShowDropdown(false);
  };

  const addCatalogItem = (item: CatalogItem) => {
    setLineItems(prev => [...prev, {
      description: item.name,
      qty: 1,
      unitPrice: item.default_price,
      total: item.default_price,
    }]);
    setShowCatalog(false);
  };

  const addBlankLine = () => {
    setLineItems(prev => [...prev, { description: "", qty: 1, unitPrice: 0, total: 0 }]);
  };

  const updateLine = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "qty" || field === "unitPrice") {
        updated.total = Math.round(Number(updated.qty) * Number(updated.unitPrice) * 100) / 100;
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => {
    setLineItems(prev => prev.filter((_, i) => i !== idx));
  };

  const total = lineItems.reduce((s, i) => s + i.total, 0);

  const handleSubmit = async (sendEmail: boolean) => {
    if (!selectedContact || lineItems.length === 0) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/factures/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: selectedContact.id,
          lineItems,
          notes: notes || undefined,
          sendEmail,
        }),
      });
      const data = await res.json();
      setResult(data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <FileText size={22} className="text-acc" strokeWidth={1.75} />
        <div>
          <h1 className="font-display text-xl font-bold text-ink">Nouvelle facture</h1>
          <p className="text-sm text-mut">Générer et envoyer une facture à un client</p>
        </div>
      </div>

      {result ? (
        <div className={`rounded-xl border p-6 mb-6 ${result.ok ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
          {result.ok ? (
            <>
              <p className="font-semibold text-green-800 text-lg">Facture {result.docNumber} créée</p>
              {result.emailSent && <p className="text-green-700 text-sm mt-1">Email envoyé avec succès.</p>}
              {result.emailError === "no_email" && <p className="text-yellow-700 text-sm mt-1">Pas d&apos;adresse email — facture créée sans envoi.</p>}
              {result.emailError && result.emailError !== "no_email" && <p className="text-red-700 text-sm mt-1">Erreur email: {result.emailError}</p>}
              <div className="flex gap-3 mt-4">
                {result.pdfUrl && (
                  <a href={result.pdfUrl} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90">
                    <Download size={14} /> Voir le PDF
                  </a>
                )}
                <button onClick={() => router.push("/clients")}
                  className="px-4 py-2 border border-line text-sm rounded-lg hover:bg-chip">
                  Retour aux clients
                </button>
                <button onClick={() => { setResult(null); setLineItems([]); setNotes(""); setSelectedContact(null); setSearch(""); }}
                  className="px-4 py-2 border border-line text-sm rounded-lg hover:bg-chip">
                  Nouvelle facture
                </button>
              </div>
            </>
          ) : (
            <p className="text-red-700">Erreur lors de la création de la facture.</p>
          )}
        </div>
      ) : null}

      <div className="space-y-6">
        {/* Client selector */}
        <div className="bg-sur rounded-xl border border-line p-5">
          <h2 className="font-display font-semibold text-ink mb-3">Client</h2>
          <div className="relative">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-mut" />
              <input
                type="text"
                placeholder="Rechercher par nom ou téléphone..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelectedContact(null); }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-3 py-2.5 border border-line rounded-lg text-sm bg-sur text-ink focus:outline-none focus:ring-2 focus:ring-acc focus:border-acc"
              />
            </div>
            {showDropdown && search.length >= 1 && filteredContacts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-sur border border-line rounded-lg max-h-48 overflow-y-auto">
                {filteredContacts.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => selectContact(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-chip text-sm border-b border-line last:border-0">
                    <span className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Sans nom"}</span>
                    <span className="text-mut ml-2">{c.phone}</span>
                    {c.email && <span className="text-mut ml-2">— {c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedContact && (
            <div className="mt-3 p-3 bg-chip rounded-lg text-sm text-acc">
              <span className="font-medium">{[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ")}</span>
              {selectedContact.address && <span className="ml-2 text-acc">{selectedContact.address}</span>}
              {!selectedContact.email && (
                <span className="ml-2 text-warn font-medium">Pas d&apos;email — envoi impossible</span>
              )}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="bg-sur rounded-xl border border-line p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink">Lignes de facturation</h2>
            <div className="flex gap-2">
              <button onClick={() => setShowCatalog(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line rounded-lg hover:bg-chip">
                Catalogue {showCatalog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button onClick={addBlankLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-line rounded-lg hover:bg-chip">
                <Plus size={13} /> Ligne vide
              </button>
            </div>
          </div>

          {/* Catalog picker */}
          {showCatalog && (
            <div className="mb-4 border border-line rounded-lg overflow-hidden">
              <div className="flex border-b border-line bg-page overflow-x-auto">
                {catalogCategories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition ${activeCategory === cat ? "bg-sur text-acc border-b-2 border-acc" : "text-mut hover:text-ink"}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {catalogItems.filter(i => (i.category || "Autre") === activeCategory).map(item => (
                  <button key={item.id} onClick={() => addCatalogItem(item)}
                    className="text-left px-3 py-2 rounded hover:bg-chip border border-transparent hover:border-line transition">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{item.name}</span>
                      <span className="text-sm font-semibold num text-acc">{item.default_price}$</span>
                    </div>
                    {item.description && <p className="text-xs text-mut mt-0.5">{item.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Table */}
          {lineItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 pr-2 font-medium text-mut w-full">Description</th>
                    <th className="text-right py-2 px-2 font-medium text-mut whitespace-nowrap">Qté</th>
                    <th className="text-right py-2 px-2 font-medium text-mut whitespace-nowrap">Prix unit.</th>
                    <th className="text-right py-2 px-2 font-medium text-mut whitespace-nowrap">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-line">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLine(idx, "description", e.target.value)}
                          className="w-full px-2 py-1 border border-line rounded text-sm bg-sur text-ink focus:outline-none focus:border-acc"
                          placeholder="Description..."
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => updateLine(idx, "qty", Number(e.target.value))}
                          className="w-14 px-2 py-1 border border-line rounded text-sm bg-sur text-ink text-right focus:outline-none focus:border-acc"
                          min={1}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-line rounded text-sm bg-sur text-ink text-right focus:outline-none focus:border-acc"
                          min={0}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium num whitespace-nowrap">{item.total}$</td>
                      <td className="py-1.5 pl-1">
                        <button onClick={() => removeLine(idx)} className="text-mut hover:text-neg transition">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-mut text-sm border border-dashed border-line rounded-lg">
              Aucune ligne — utilisez le catalogue ou ajoutez une ligne vide
            </div>
          )}

          {lineItems.length > 0 && (
            <div className="flex justify-end mt-4">
              <div className="bg-acc-grad text-accink rounded-lg px-5 py-3 text-right">
                <p className="text-xs uppercase tracking-wide opacity-80">Total</p>
                <p className="font-display num text-2xl font-bold">{total}$</p>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-sur rounded-xl border border-line p-5">
          <h2 className="font-display font-semibold text-ink mb-2">Notes (optionnel)</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes visibles sur la facture..."
            rows={3}
            className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-sur text-ink focus:outline-none focus:ring-2 focus:ring-acc focus:border-acc resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handleSubmit(false)}
            disabled={!selectedContact || lineItems.length === 0 || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-line text-sm font-medium rounded-lg hover:bg-chip disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={15} /> Générer sans envoyer
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={!selectedContact || lineItems.length === 0 || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 btn-glow text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={15} /> {loading ? "Génération..." : "Générer et envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
