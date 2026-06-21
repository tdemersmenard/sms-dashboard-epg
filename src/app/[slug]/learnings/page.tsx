"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser as supabase } from "@/lib/supabase-browser";
import { Brain, Plus, Trash2, RefreshCw } from "lucide-react";

interface Learning {
  id: string;
  created_at: string;
  category: string;
  lesson: string;
  source: string | null;
  active: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  politesse:   "bg-blue-100 text-blue-700",
  prix:        "bg-green-100 text-green-700",
  paiement:    "bg-orange-100 text-orange-700",
  refus:       "bg-red-100 text-red-700",
  date:        "bg-purple-100 text-purple-700",
  identite:    "bg-gray-100 text-gray-700",
  upsell:      "bg-teal-100 text-teal-700",
  technique:   "bg-cyan-100 text-cyan-700",
  timing:      "bg-yellow-100 text-yellow-700",
  ton:         "bg-pink-100 text-pink-700",
  info_client: "bg-indigo-100 text-indigo-700",
  erreur:      "bg-red-100 text-red-700",
  general:     "bg-gray-100 text-gray-600",
};

const CATEGORIES = ["politesse", "prix", "paiement", "refus", "date", "identite", "upsell", "technique", "timing", "ton", "info_client", "erreur", "general"];

export default function LearningsPage() {
  const [learnings, setLearnings] = useState<Learning[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState("general");
  const [newLesson, setNewLesson] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ai_learnings")
      .select("*")
      .order("created_at", { ascending: false });
    setLearnings((data as Learning[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const toggleActive = async (id: string, current: boolean) => {
    setLearnings((prev) =>
      prev.map((l) => (l.id === id ? { ...l, active: !current } : l))
    );
    await supabase.from("ai_learnings").update({ active: !current }).eq("id", id);
  };

  const deleteLearning = async (id: string) => {
    setLearnings((prev) => prev.filter((l) => l.id !== id));
    await supabase.from("ai_learnings").delete().eq("id", id);
  };

  const addLearning = async () => {
    if (!newLesson.trim()) return;
    setSaving(true);
    const { data } = await supabase
      .from("ai_learnings")
      .insert({ category: newCategory, lesson: newLesson.trim(), source: "Thomas", active: true })
      .select()
      .single();
    if (data) {
      setLearnings((prev) => [data as Learning, ...prev]);
      setNewLesson("");
      setShowAddForm(false);
    }
    setSaving(false);
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const res = await fetch("/api/cron/learn");
      const data = await res.json();
      if (data.learned > 0) {
        setAnalyzeResult(`${data.learned} nouvelle${data.learned > 1 ? "s" : ""} leçon${data.learned > 1 ? "s" : ""} apprise${data.learned > 1 ? "s" : ""}!`);
        await load();
      } else {
        setAnalyzeResult("Aucune nouvelle leçon détectée.");
      }
    } catch {
      setAnalyzeResult("Erreur lors de l'analyse.");
    }
    setAnalyzing(false);
    setTimeout(() => setAnalyzeResult(null), 5000);
  };

  const active = learnings.filter((l) => l.active);
  const inactive = learnings.filter((l) => !l.active);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Brain size={22} className="text-[#0a1f3f]" />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Apprentissages CHLORE</h1>
            <p className="text-sm text-gray-500">{active.length} leçon{active.length !== 1 ? "s" : ""} active{active.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
          >
            <Plus size={15} />
            Ajouter
          </button>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
          >
            <RefreshCw size={15} className={analyzing ? "animate-spin" : ""} />
            {analyzing ? "Analyse..." : "Analyser maintenant"}
          </button>
        </div>
      </div>

      {analyzeResult && (
        <div className="mb-4 px-4 py-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
          {analyzeResult}
        </div>
      )}

      {showAddForm && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Nouvelle leçon</p>
          <div className="flex gap-2 mb-2">
            <select
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <textarea
            value={newLesson}
            onChange={(e) => setNewLesson(e.target.value)}
            placeholder="Décris la leçon comme une instruction claire et actionable..."
            rows={3}
            className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 resize-none"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button
              onClick={() => { setShowAddForm(false); setNewLesson(""); }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              Annuler
            </button>
            <button
              onClick={addLearning}
              disabled={saving || !newLesson.trim()}
              className="px-3 py-1.5 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
            >
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : learnings.length === 0 ? (
        <p className="text-sm text-gray-400 py-8 text-center">Aucune leçon. Exécutez le SQL dans Supabase pour initialiser.</p>
      ) : (
        <div className="space-y-3">
          {active.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Actives</p>
              {active.map((l) => (
                <LearningCard key={l.id} learning={l} onToggle={toggleActive} onDelete={deleteLearning} />
              ))}
            </>
          )}
          {inactive.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mt-6">Désactivées</p>
              {inactive.map((l) => (
                <LearningCard key={l.id} learning={l} onToggle={toggleActive} onDelete={deleteLearning} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function LearningCard({
  learning,
  onToggle,
  onDelete,
}: {
  learning: Learning;
  onToggle: (id: string, current: boolean) => void;
  onDelete: (id: string) => void;
}) {
  const catColor = CATEGORY_COLORS[learning.category] ?? CATEGORY_COLORS.general;
  const date = new Date(learning.created_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 p-4 transition ${!learning.active ? "opacity-50" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${catColor}`}>
              {learning.category}
            </span>
          </div>
          <p className="text-sm text-gray-800">{learning.lesson}</p>
          <p className="text-xs text-gray-400 mt-2">
            {learning.source ?? "auto-analyse"} · {date}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => onToggle(learning.id, learning.active)}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              learning.active ? "bg-[#0a1f3f]" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out ${
                learning.active ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <button
            onClick={() => onDelete(learning.id)}
            className="p-1 text-gray-300 hover:text-red-500 transition rounded"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
