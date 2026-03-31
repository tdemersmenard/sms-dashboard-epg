"use client";

import { useState, useEffect } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { MessageTemplate, TemplateCategory } from "@/lib/types";

const CATEGORIES: TemplateCategory[] = [
  "relance", "confirmation", "rappel_paiement", "suivi", "promo", "autre",
];

const CATEGORY_COLORS: Record<TemplateCategory, { bg: string; text: string }> = {
  relance:          { bg: "bg-orange-100", text: "text-orange-700" },
  confirmation:     { bg: "bg-green-100",  text: "text-green-700" },
  rappel_paiement:  { bg: "bg-red-100",    text: "text-red-700" },
  suivi:            { bg: "bg-blue-100",   text: "text-blue-700" },
  promo:            { bg: "bg-purple-100", text: "text-purple-700" },
  autre:            { bg: "bg-gray-100",   text: "text-gray-700" },
};

const VARIABLES = ["{{prénom}}", "{{nom}}", "{{date}}", "{{montant}}", "{{service}}", "{{heure_début}}", "{{heure_fin}}", "{{minutes}}"];

function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{[^}]+\}\}/g);
  return matches ? Array.from(new Set(matches)) : [];
}

const emptyForm = { name: "", category: "autre" as TemplateCategory, body: "" };

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabaseBrowser
      .from("message_templates")
      .select("*")
      .order("created_at");
    setTemplates((data ?? []) as MessageTemplate[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (t: MessageTemplate) => {
    setEditingId(t.id);
    setForm({ name: t.name, category: t.category ?? "autre", body: t.body });
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.body.trim()) return;
    setSaving(true);
    const variables = extractVariables(form.body);
    if (editingId) {
      await supabaseBrowser
        .from("message_templates")
        .update({ name: form.name, category: form.category, body: form.body, variables })
        .eq("id", editingId);
    } else {
      await supabaseBrowser
        .from("message_templates")
        .insert({ name: form.name, category: form.category, body: form.body, variables });
    }
    await load();
    setShowModal(false);
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    await supabaseBrowser.from("message_templates").delete().eq("id", id);
    setTemplates((prev) => prev.filter((t) => t.id !== id));
    setDeleteId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Templates SMS</h1>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] transition"
        >
          <Plus size={16} />
          Nouveau template
        </button>
      </div>

      {/* Grid */}
      {templates.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">Aucun template</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map((t) => {
            const cc = CATEGORY_COLORS[t.category ?? "autre"];
            const vars = t.variables ?? extractVariables(t.body);
            return (
              <div key={t.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${cc.bg} ${cc.text}`}>
                      {t.category ?? "autre"}
                    </span>
                  </div>
                </div>

                <p className="text-sm text-gray-600 line-clamp-2 mb-3">{t.body}</p>

                {vars.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {vars.map((v) => (
                      <span key={v} className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded font-mono">
                        {v}
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-gray-100">
                  <button
                    onClick={() => openEdit(t)}
                    className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-900 transition"
                  >
                    <Pencil size={13} />
                    Modifier
                  </button>
                  <button
                    onClick={() => setDeleteId(t.id)}
                    className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 transition ml-auto"
                  >
                    <Trash2 size={13} />
                    Supprimer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {editingId ? "Modifier le template" : "Nouveau template"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleSave} className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nom *</label>
                <input
                  type="text" value={form.name} required
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Rappel ouverture"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Catégorie</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((p) => ({ ...p, category: e.target.value as TemplateCategory }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Corps du message *</label>
                <textarea
                  rows={6} value={form.body} required
                  onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
                  placeholder="Bonjour {{prénom}}, ..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Variables disponibles : {VARIABLES.join(", ")}
                </p>
              </div>
              {form.body && extractVariables(form.body).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-1">Variables détectées :</p>
                  <div className="flex flex-wrap gap-1">
                    {extractVariables(form.body).map((v) => (
                      <span key={v} className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded font-mono">{v}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  Annuler
                </button>
                <button type="submit" disabled={saving} className="px-5 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition">
                  {saving ? "Sauvegarde..." : "Sauvegarder"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <p className="font-bold text-gray-900 mb-2">Supprimer ce template ?</p>
            <p className="text-sm text-gray-500 mb-5">Cette action est irréversible.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                Annuler
              </button>
              <button onClick={() => handleDelete(deleteId)} className="px-5 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
