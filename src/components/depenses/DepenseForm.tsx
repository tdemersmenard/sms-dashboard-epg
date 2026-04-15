"use client";

import { useState } from "react";
import { Upload, X, Camera, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { CATS, CategorieDepense, uploadRecu } from "@/lib/depenses";

interface Props {
  annee: number;
  onCreated: () => void;
  onCancel: () => void;
}

export default function DepenseForm({ annee, onCreated, onCancel }: Props) {
  const today = new Date().toISOString().split("T")[0];

  const [date, setDate] = useState(today);
  const [description, setDescription] = useState("");
  const [montant, setMontant] = useState("");
  const [categorie, setCategorie] = useState<CategorieDepense>("vehicule");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");

  const handleScanPhoto = async (f: File) => {
    setFile(f); // Utilise aussi la photo comme reçu
    setScanning(true);
    setScanMsg("");
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/depenses/scan-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: reader.result as string }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.amount)      setMontant(String(data.amount));
          if (data.category)    setCategorie(data.category as CategorieDepense);
          if (data.date)        setDate(data.date);
          if (data.vendor && data.description) setDescription(`${data.vendor} — ${data.description}`);
          else if (data.vendor) setDescription(data.vendor);
          else if (data.description) setDescription(data.description);
          setScanMsg("✓ Reçu analysé — vérifiez les champs");
        } else {
          setScanMsg("Impossible de lire le reçu, remplis manuellement.");
        }
      } catch {
        setScanMsg("Erreur lors du scan.");
      } finally {
        setScanning(false);
      }
    };
    reader.readAsDataURL(f);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
      setFileError("Format invalide. Accepté : image ou PDF.");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      setFileError("Fichier trop grand. Maximum 4 MB.");
      return;
    }
    setFileError("");
    setFile(f);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description || !montant || !categorie) return;
    setSaving(true);
    setError("");
    try {
      const id = crypto.randomUUID();
      let recuUrl: string | null = null;
      let recuNom: string | null = null;

      if (file) {
        const result = await uploadRecu(file, annee, id);
        recuUrl = result.url;
        recuNom = result.nom;
      }

      const { error: dbError } = await supabaseBrowser.from("depenses").insert({
        id,
        date,
        description,
        montant: parseFloat(montant),
        categorie,
        note: note || null,
        recu_url: recuUrl,
        recu_nom: recuNom,
        annee,
      });

      if (dbError) throw dbError;
      onCreated();
    } catch (err) {
      console.error(err);
      setError("Erreur lors de la création. Réessayez.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Nouvelle dépense</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scan photo */}
      <div className="mb-4">
        {scanning ? (
          <div className="flex items-center justify-center gap-2 bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-3 opacity-60">
            <Loader2 size={16} className="text-blue-600 animate-spin" />
            <span className="text-blue-700 font-medium text-sm">Analyse en cours...</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {/* Prendre une photo */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleScanPhoto(file);
                }}
              />
              <div className="bg-blue-50 border-2 border-dashed border-blue-300 rounded-lg p-4 text-center hover:bg-blue-100 transition">
                <p className="text-blue-700 font-medium text-sm">📷 Prendre une photo</p>
                <p className="text-xs text-blue-500 mt-1">Nouveau reçu</p>
              </div>
            </label>

            {/* Uploader depuis galerie */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await handleScanPhoto(file);
                }}
              />
              <div className="bg-purple-50 border-2 border-dashed border-purple-300 rounded-lg p-4 text-center hover:bg-purple-100 transition">
                <p className="text-purple-700 font-medium text-sm">🖼️ Uploader</p>
                <p className="text-xs text-purple-500 mt-1">Galerie / fichiers</p>
              </div>
            </label>
          </div>
        )}
        {scanMsg && (
          <p className={`text-xs mt-1.5 ${scanMsg.startsWith("✓") ? "text-green-600" : "text-amber-600"}`}>
            {scanMsg}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-600 font-medium mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 font-medium mb-1 block">Montant ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0.00"
              required
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Essence pour visites clients"
            required
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">Catégorie</label>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as CategorieDepense)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          >
            {(Object.keys(CATS) as CategorieDepense[]).map((key) => (
              <option key={key} value={key}>
                {CATS[key].label} — {CATS[key].pct}% déductible
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">Note (optionnelle)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Détails supplémentaires..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"
          />
        </div>

        <div>
          <label className="text-xs text-gray-600 font-medium mb-1 block">
            Reçu (image ou PDF, max 4 MB)
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 cursor-pointer hover:bg-white transition bg-white/60">
              <Upload size={14} />
              {file ? file.name : "Choisir un fichier"}
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
            {file && (
              <button
                type="button"
                onClick={() => { setFile(null); setFileError(""); }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {fileError && <p className="text-xs text-red-500 mt-1">{fileError}</p>}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
        >
          {saving ? "Enregistrement..." : "Enregistrer la dépense"}
        </button>
      </form>
    </div>
  );
}
