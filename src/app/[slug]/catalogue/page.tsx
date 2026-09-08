"use client";

import { useState, useEffect, useCallback } from "react";
import { Tag, Plus, Pencil, ToggleLeft, ToggleRight, Save, X, AlertTriangle } from "lucide-react";

interface CatalogItem {
  id: string;
  name: string;
  description: string | null;
  default_price: number;
  category: string | null;
  active: boolean;
  sort_order: number;
}

const MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS catalog_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  default_price NUMERIC NOT NULL,
  category TEXT,
  active BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed data
INSERT INTO catalog_items (name, description, default_price, category, sort_order) VALUES
  ('Ouverture seule', 'Nettoyage 30 min + branchement tuyaux + trousse d''ouverture incluse', 249, 'Saisonnier', 0),
  ('Fermeture seule', 'Fermeture et hivernisation de la piscine', 199, 'Saisonnier', 1),
  ('Package ouverture + fermeture', 'Ouverture au printemps + fermeture à l''automne — meilleur deal!', 450, 'Saisonnier', 2),
  ('Entretien hebdomadaire', 'Visite chaque semaine — ouverture + fermeture + produits de balancement inclus (rabais 300$, rég. 1799$)', 1499, 'Entretien', 3),
  ('Entretien aux 2 semaines', 'Visite aux 2 semaines — ouverture + fermeture + produits inclus (rabais 300$, rég. 1397$)', 1097, 'Entretien', 4),
  ('Spa (add-on entretien)', 'Service d''entretien du spa en supplément de la piscine', 500, 'Entretien', 5),
  ('Remise à neuf plomberie hors-terre', 'Remplacement de la plomberie et des accessoires', 300, 'Réparation', 6),
  ('Déplacement + 30 min', 'Appel de service — déplacement et 30 premières minutes incluses', 80, 'Service', 7),
  ('Heure de travail supplémentaire', 'Après les 30 premières minutes incluses dans le déplacement', 85, 'Service', 8),
  ('Trousse d''ouverture', 'Produits chimiques pour l''ouverture de piscine', 20, 'Produit', 9)
ON CONFLICT DO NOTHING;`;

const EMPTY_FORM = { name: "", description: "", default_price: "", category: "", sort_order: "0" };

export default function CataloguePage() {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/catalog");
      const data = await res.json();
      if (data.migrationRequired) {
        setMigrationRequired(true);
      } else {
        setItems(data.items || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(items.map(i => i.category || "Autre"))).sort();

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (item: CatalogItem) => {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description ?? "",
      default_price: String(item.default_price),
      category: item.category ?? "",
      sort_order: String(item.sort_order),
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.default_price) return;
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        default_price: Number(form.default_price),
        category: form.category.trim() || null,
        sort_order: Number(form.sort_order) || 0,
      };
      if (editing) {
        await fetch("/api/catalog", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...payload }),
        });
      } else {
        await fetch("/api/catalog", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (item: CatalogItem) => {
    if (item.active) {
      await fetch("/api/catalog", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
    } else {
      await fetch("/api/catalog", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, active: true }),
      });
    }
    load();
  };

  const copySQL = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (migrationRequired) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Tag size={22} className="text-acc" strokeWidth={1.75} />
          <h1 className="text-xl font-bold font-display text-ink">Catalogue de produits</h1>
        </div>
        <div className="bg-chip border border-line rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-warn" />
            <p className="font-semibold text-warn">Migration Supabase requise</p>
          </div>
          <p className="text-sm text-mut mb-4">Copiez et exécutez ce SQL dans l&apos;éditeur SQL Supabase pour créer la table et pré-remplir les produits.</p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">{MIGRATION_SQL}</pre>
            <button onClick={copySQL} className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded">
              {copied ? "Copié!" : "Copier"}
            </button>
          </div>
          <button onClick={() => { setMigrationRequired(false); load(); }}
            className="mt-4 px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90">
            J&apos;ai exécuté la migration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Tag size={22} className="text-acc" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold font-display text-ink">Catalogue de produits</h1>
            <p className="text-sm text-mut num">{items.length} produits actifs</p>
          </div>
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90">
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-mut">Chargement...</div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => {
            const catItems = items.filter(i => (i.category || "Autre") === cat);
            return (
              <div key={cat}>
                <h2 className="lbl mb-2 px-1">{cat}</h2>
                <div className="bg-sur rounded-xl border border-line overflow-hidden divide-y divide-line">
                  {catItems.map(item => (
                    <div key={item.id} className={`flex items-center gap-3 p-4 ${!item.active ? "opacity-50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm text-ink">{item.name}</p>
                          {!item.active && <span className="text-xs bg-chip text-mut px-1.5 py-0.5 rounded-full">Inactif</span>}
                        </div>
                        {item.description && <p className="text-xs text-mut mt-0.5 truncate">{item.description}</p>}
                      </div>
                      <span className="text-sm font-semibold num text-acc flex-shrink-0">{item.default_price}$</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openEdit(item)} className="p-1.5 text-mut hover:text-ink hover:bg-chip rounded-lg transition">
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => toggleActive(item)} className="p-1.5 text-mut hover:text-ink hover:bg-chip rounded-lg transition">
                          {item.active
                            ? <ToggleRight size={18} className="text-pos" />
                            : <ToggleLeft size={18} />}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-sur border border-line rounded-2xl w-full max-w-md">
            <div className="p-5 border-b border-line flex items-center justify-between">
              <h2 className="font-bold font-display text-ink">{editing ? "Modifier le produit" : "Nouveau produit"}</h2>
              <button onClick={() => setShowModal(false)} className="text-mut hover:text-ink"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-mut mb-1">Nom *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                  placeholder="Nom du produit/service" />
              </div>
              <div>
                <label className="block text-xs font-medium text-mut mb-1">Description</label>
                <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                  placeholder="Description courte (optionnel)" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Prix ($) *</label>
                  <input type="number" value={form.default_price} onChange={e => setForm(f => ({ ...f, default_price: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    min={0} placeholder="0" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Ordre</label>
                  <input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    min={0} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-mut mb-1">Catégorie</label>
                <input type="text" value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  list="categories-list"
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                  placeholder="Saisonnier, Entretien, Service..." />
                <datalist id="categories-list">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div className="p-5 border-t border-line flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-line text-sm rounded-lg hover:bg-chip">Annuler</button>
              <button onClick={handleSave} disabled={!form.name.trim() || !form.default_price || saving}
                className="inline-flex items-center gap-2 px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90 disabled:opacity-40">
                <Save size={14} /> {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
