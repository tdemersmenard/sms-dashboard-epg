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
        <FileText size={22} className="text-[#0a1f3f]" strokeWidth={1.75} />
        <div>
          <h1 className="text-xl font-bold text-gray-900">Nouvelle facture</h1>
          <p className="text-sm text-gray-500">Générer et envoyer une facture à un client</p>
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm rounded-lg hover:bg-[#0d2a55]">
                    <Download size={14} /> Voir le PDF
                  </a>
                )}
                <button onClick={() => router.push("/clients")}
                  className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
                  Retour aux clients
                </button>
                <button onClick={() => { setResult(null); setLineItems([]); setNotes(""); setSelectedContact(null); setSearch(""); }}
                  className="px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
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
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-3">Client</h2>
          <div className="relative">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par nom ou téléphone..."
                value={search}
                onChange={e => { setSearch(e.target.value); setShowDropdown(true); setSelectedContact(null); }}
                onFocus={() => setShowDropdown(true)}
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f]"
              />
            </div>
            {showDropdown && search.length >= 1 && filteredContacts.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredContacts.slice(0, 10).map(c => (
                  <button key={c.id} onClick={() => selectContact(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-100 last:border-0">
                    <span className="font-medium">{[c.first_name, c.last_name].filter(Boolean).join(" ") || "Sans nom"}</span>
                    <span className="text-gray-400 ml-2">{c.phone}</span>
                    {c.email && <span className="text-gray-400 ml-2">— {c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedContact && (
            <div className="mt-3 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              <span className="font-medium">{[selectedContact.first_name, selectedContact.last_name].filter(Boolean).join(" ")}</span>
              {selectedContact.address && <span className="ml-2 text-blue-600">{selectedContact.address}</span>}
              {!selectedContact.email && (
                <span className="ml-2 text-yellow-600 font-medium">Pas d&apos;email — envoi impossible</span>
              )}
            </div>
          )}
        </div>

        {/* Line items */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-gray-900">Lignes de facturation</h2>
            <div className="flex gap-2">
              <button onClick={() => setShowCatalog(v => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                Catalogue {showCatalog ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button onClick={addBlankLine}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">
                <Plus size={13} /> Ligne vide
              </button>
            </div>
          </div>

          {/* Catalog picker */}
          {showCatalog && (
            <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="flex border-b border-gray-200 bg-gray-50 overflow-x-auto">
                {catalogCategories.map(cat => (
                  <button key={cat} onClick={() => setActiveCategory(cat)}
                    className={`px-4 py-2 text-xs font-medium whitespace-nowrap transition ${activeCategory === cat ? "bg-white text-[#0a1f3f] border-b-2 border-[#0a1f3f]" : "text-gray-500 hover:text-gray-700"}`}>
                    {cat}
                  </button>
                ))}
              </div>
              <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {catalogItems.filter(i => (i.category || "Autre") === activeCategory).map(item => (
                  <button key={item.id} onClick={() => addCatalogItem(item)}
                    className="text-left px-3 py-2 rounded hover:bg-gray-50 border border-transparent hover:border-gray-200 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      <span className="text-sm font-semibold text-[#0a1f3f]">{item.default_price}$</span>
                    </div>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
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
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 pr-2 font-medium text-gray-600 w-full">Description</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Qté</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Prix unit.</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600 whitespace-nowrap">Total</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, idx) => (
                    <tr key={idx} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2">
                        <input
                          type="text"
                          value={item.description}
                          onChange={e => updateLine(idx, "description", e.target.value)}
                          className="w-full px-2 py-1 border border-gray-200 rounded text-sm focus:outline-none focus:border-[#0a1f3f]"
                          placeholder="Description..."
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={item.qty}
                          onChange={e => updateLine(idx, "qty", Number(e.target.value))}
                          className="w-14 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:border-[#0a1f3f]"
                          min={1}
                        />
                      </td>
                      <td className="py-1.5 px-2">
                        <input
                          type="number"
                          value={item.unitPrice}
                          onChange={e => updateLine(idx, "unitPrice", Number(e.target.value))}
                          className="w-24 px-2 py-1 border border-gray-200 rounded text-sm text-right focus:outline-none focus:border-[#0a1f3f]"
                          min={0}
                        />
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium whitespace-nowrap">{item.total}$</td>
                      <td className="py-1.5 pl-1">
                        <button onClick={() => removeLine(idx)} className="text-gray-300 hover:text-red-500 transition">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
              Aucune ligne — utilisez le catalogue ou ajoutez une ligne vide
            </div>
          )}

          {lineItems.length > 0 && (
            <div className="flex justify-end mt-4">
              <div className="bg-[#0a1f3f] text-white rounded-lg px-5 py-3 text-right">
                <p className="text-xs text-blue-300 uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold">{total}$</p>
              </div>
            </div>
          )}
        </div>

        {/* Notes */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-900 mb-2">Notes (optionnel)</h2>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes visibles sur la facture..."
            rows={3}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 focus:border-[#0a1f3f] resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 justify-end">
          <button
            onClick={() => handleSubmit(false)}
            disabled={!selectedContact || lineItems.length === 0 || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Download size={15} /> Générer sans envoyer
          </button>
          <button
            onClick={() => handleSubmit(true)}
            disabled={!selectedContact || lineItems.length === 0 || loading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0d2a55] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send size={15} /> {loading ? "Génération..." : "Générer et envoyer"}
          </button>
        </div>
      </div>
    </div>
  );
}
