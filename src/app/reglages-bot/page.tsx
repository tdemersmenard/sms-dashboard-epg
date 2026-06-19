"use client";

import { useState, useEffect, useRef } from "react";
import { Bot, Save, RotateCcw, Info, CheckCircle, AlertTriangle, SendHorizonal, Loader2 } from "lucide-react";

const DYNAMIC_CONTEXT_ITEMS = [
  "Date et heure actuelles (fuseau America/Montreal)",
  "Prochaines disponibilités calculées selon le calendrier réel",
  "Jobs à venir et passés du client en conversation",
  "Infos du client (nom, adresse, email, piscine, services, notes)",
  "Apprentissages (learnings) actifs du bot",
  "Contexte temporel (matin/après-midi/soirée, salutation appropriée)",
];

export default function ReglagesBotPage() {
  const [prompt, setPrompt] = useState("");
  const [originalPrompt, setOriginalPrompt] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [isDefault, setIsDefault] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  // Test zone
  const [testMessage, setTestMessage] = useState("");
  const [testResponse, setTestResponse] = useState("");
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState("");

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/bot-config");
      const data = await res.json();
      setPrompt(data.prompt ?? "");
      setOriginalPrompt(data.prompt ?? "");
      setUpdatedAt(data.updatedAt ?? null);
      setIsDefault(data.isDefault ?? true);
      setLoading(false);
    })();
  }, []);

  const isDirty = prompt !== originalPrompt;

  const handleSave = async () => {
    if (!prompt.trim() || prompt.trim().length < 100) return;
    setSaving(true);
    setSaveStatus("idle");
    setSaveError("");
    try {
      const res = await fetch("/api/bot-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Erreur inconnue");
        setSaveStatus("error");
      } else {
        setOriginalPrompt(prompt);
        setUpdatedAt(new Date().toISOString());
        setIsDefault(false);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      }
    } catch (err) {
      setSaveError(String(err));
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Réinitialiser le prompt au texte d'origine du code? Les modifications seront perdues.")) return;
    setSaving(true);
    try {
      const res = await fetch("/api/bot-config", { method: "DELETE" });
      const data = await res.json();
      setPrompt(data.prompt ?? "");
      setOriginalPrompt(data.prompt ?? "");
      setUpdatedAt(null);
      setIsDefault(true);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    setTestResponse("");
    setTestError("");
    try {
      const res = await fetch("/api/bot-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, message: testMessage }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTestError(data.error ?? "Erreur");
      } else {
        setTestResponse(data.response ?? "");
      }
    } catch (err) {
      setTestError(String(err));
    } finally {
      setTesting(false);
    }
  };

  const charCount = prompt.length;
  const tokenEstimate = Math.round(charCount / 4);

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <Loader2 size={24} className="animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot size={22} className="text-[#0a1f3f]" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold text-gray-900">Réglages du bot</h1>
            <p className="text-sm text-gray-500">
              {isDefault
                ? "Prompt par défaut (non modifié)"
                : updatedAt
                  ? `Dernière modification: ${new Date(updatedAt).toLocaleString("fr-CA", { timeZone: "America/Montreal", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })}`
                  : "Prompt personnalisé"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            disabled={saving || isDefault}
            className="inline-flex items-center gap-2 px-4 py-2 border border-gray-200 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={14} />
            Réinitialiser
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !isDirty || prompt.trim().length < 100}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0d2a55] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Sauvegarde..." : "Sauvegarder"}
          </button>
        </div>
      </div>

      {/* Status banners */}
      {saveStatus === "success" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
          <CheckCircle size={16} />
          {isDefault ? "Prompt réinitialisé au défaut." : "Prompt sauvegardé — le bot utilise le nouveau texte dès maintenant."}
        </div>
      )}
      {saveStatus === "error" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertTriangle size={16} />
          Erreur: {saveError}
        </div>
      )}
      {isDirty && saveStatus === "idle" && (
        <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-700">
          <AlertTriangle size={16} />
          Modifications non sauvegardées — le bot utilise encore l&apos;ancienne version.
        </div>
      )}

      {/* Info box — contexte dynamique */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-2">
          <Info size={16} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800 mb-1">Contexte ajouté automatiquement (ne pas inclure dans le prompt)</p>
            <p className="text-xs text-blue-700 mb-2">
              À chaque message client, ces informations sont <strong>automatiquement injectées</strong> après le prompt — tu n&apos;as pas à les écrire ici:
            </p>
            <ul className="text-xs text-blue-700 space-y-0.5">
              {DYNAMIC_CONTEXT_ITEMS.map(item => (
                <li key={item} className="flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Textarea */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">System prompt — partie statique</span>
          <span className={`text-xs ${tokenEstimate > 4000 ? "text-red-500 font-semibold" : tokenEstimate > 2000 ? "text-amber-500" : "text-gray-400"}`}>
            {charCount.toLocaleString()} caractères · ~{tokenEstimate.toLocaleString()} tokens
            {tokenEstimate > 4000 && " — très long, coût élevé!"}
            {tokenEstimate > 2000 && tokenEstimate <= 4000 && " — attention au coût"}
          </span>
        </div>
        <textarea
          ref={textareaRef}
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          className="w-full min-h-[60vh] p-4 font-mono text-xs text-gray-800 leading-relaxed resize-y focus:outline-none"
          spellCheck={false}
        />
      </div>

      {/* Test zone */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Tester le bot (aperçu)</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Teste le prompt <em>en cours d&apos;édition</em> (pas encore sauvegardé) avec un message simulé.
            Le contexte client réel n&apos;est pas injecté dans ce mode test.
          </p>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={testMessage}
              onChange={e => setTestMessage(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleTest(); } }}
              placeholder="Ex: Bonjour, c'est quoi le prix pour une ouverture?"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:border-[#0a1f3f]"
            />
            <button
              onClick={handleTest}
              disabled={testing || !testMessage.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm rounded-lg hover:bg-[#0d2a55] disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <SendHorizonal size={14} />}
              {testing ? "..." : "Envoyer"}
            </button>
          </div>
          {testError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{testError}</p>
          )}
          {testResponse && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Réponse du bot (CHLORE)</p>
              <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{testResponse}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
