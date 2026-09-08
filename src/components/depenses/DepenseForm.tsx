"use client";

import { useState } from "react";
import { Upload, X, Camera, Loader2 } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
import { CATS, CategorieDepense, uploadRecu } from "@/lib/depenses";

interface Props {
  annee: number;
  onCreated: () => void;
  onCancel: () => void;
}

async function compressImage(file: File, maxWidth = 1568, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DepenseForm({ annee, onCreated, onCancel }: Props) {
  const { franchiseId } = useFranchise();
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
    setFile(f); // Utilise aussi le fichier comme reçu
    setFileError("");

    const isPdf = f.type === "application/pdf";

    // Fichier trop volumineux pour l'analyse : on garde le fichier attaché,
    // mais on saute le scan automatique.
    if (f.size > 4 * 1024 * 1024) {
      setScanMsg(
        isPdf
          ? "PDF trop volumineux pour l'analyse automatique, remplis manuellement."
          : "Fichier trop volumineux pour l'analyse automatique, remplis manuellement."
      );
      return;
    }

    setScanning(true);
    setScanMsg("");
    try {
      let payload: { fileBase64: string; fileType: string };
      if (isPdf) {
        // Pas de compression canvas sur un PDF — on lit le base64 brut.
        const fileBase64 = await fileToBase64(f);
        payload = { fileBase64, fileType: "application/pdf" };
      } else {
        const fileBase64 = await compressImage(f);
        payload = { fileBase64, fileType: f.type || "image/jpeg" };
      }
      const res = await fetch("/api/depenses/scan-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
        setScanMsg(`Impossible de lire le reçu (${data.error || "erreur inconnue"}), remplis manuellement.`);
      }
    } catch {
      setScanMsg("Erreur lors du scan.");
    } finally {
      setScanning(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("image/") && f.type !== "application/pdf") {
      setFileError("Format invalide. Accepté : image ou PDF.");
      return;
    }
    setFileError("");
    // Attache le fichier ET déclenche l'analyse AI (image compressée ou PDF brut).
    // handleScanPhoto gère la limite de taille (fichier gardé, scan sauté si > 4 MB).
    await handleScanPhoto(f);
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
        franchise_id: franchiseId,
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
    <div className="bg-chip border border-line rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display font-semibold text-ink">Nouvelle dépense</h3>
        <button onClick={onCancel} className="text-mut hover:text-ink transition-colors">
          <X size={18} />
        </button>
      </div>

      {/* Scan photo */}
      <div className="mb-4">
        {scanning ? (
          <div className="flex items-center justify-center gap-2 bg-sur border-2 border-dashed border-acc rounded-lg p-3 opacity-60">
            <Loader2 size={16} className="text-acc animate-spin" />
            <span className="text-acc font-medium text-sm">Analyse en cours...</span>
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
              <div className="bg-sur border-2 border-dashed border-acc rounded-lg p-4 text-center hover:bg-page transition">
                <p className="text-acc font-medium text-sm">📷 Prendre une photo</p>
                <p className="text-xs text-mut mt-1">Nouveau reçu</p>
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
              <div className="bg-sur border-2 border-dashed border-acc2 rounded-lg p-4 text-center hover:bg-page transition">
                <p className="text-acc2 font-medium text-sm">🖼️ Uploader</p>
                <p className="text-xs text-mut mt-1">Galerie / fichiers</p>
              </div>
            </label>
          </div>
        )}
        {scanMsg && (
          <p className={`text-xs mt-1.5 ${scanMsg.startsWith("✓") ? "text-pos" : "text-warn"}`}>
            {scanMsg}
          </p>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-mut font-medium mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc bg-sur text-ink"
            />
          </div>
          <div>
            <label className="text-xs text-mut font-medium mb-1 block">Montant ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={montant}
              onChange={(e) => setMontant(e.target.value)}
              placeholder="0.00"
              required
              className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc bg-sur text-ink"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-mut font-medium mb-1 block">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ex: Essence pour visites clients"
            required
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc bg-sur text-ink"
          />
        </div>

        <div>
          <label className="text-xs text-mut font-medium mb-1 block">Catégorie</label>
          <select
            value={categorie}
            onChange={(e) => setCategorie(e.target.value as CategorieDepense)}
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc bg-sur text-ink"
          >
            {(Object.keys(CATS) as CategorieDepense[]).map((key) => (
              <option key={key} value={key}>
                {CATS[key].label} — {CATS[key].pct}% déductible
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-mut font-medium mb-1 block">Note (optionnelle)</label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Détails supplémentaires..."
            className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc bg-sur text-ink"
          />
        </div>

        <div>
          <label className="text-xs text-mut font-medium mb-1 block">
            Reçu (image ou PDF, max 4 MB)
          </label>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 px-3 py-2 border border-line rounded-lg text-sm text-mut cursor-pointer hover:bg-page transition bg-sur">
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
                className="text-mut hover:text-ink transition-colors"
              >
                <X size={16} />
              </button>
            )}
          </div>
          {fileError && <p className="text-xs text-neg mt-1">{fileError}</p>}
        </div>

        {error && <p className="text-xs text-neg">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
        >
          {saving ? "Enregistrement..." : "Enregistrer la dépense"}
        </button>
      </form>
    </div>
  );
}
