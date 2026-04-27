"use client";

import { useState } from "react";
import { X, Send, Loader2 } from "lucide-react";

type ChecklistItem = { id: string; label: string; checked: boolean };

const ENTRETIEN_ITEMS: ChecklistItem[] = [
  { id: "aspire", label: "Aspiré le fond", checked: false },
  { id: "brosse", label: "Brossé les parois", checked: false },
  { id: "paniers", label: "Vidé les paniers (skimmer + pompe)", checked: false },
  { id: "ligne_eau", label: "Nettoyé la ligne d'eau", checked: false },
  { id: "teste_eau", label: "Testé l'eau (pH, chlore)", checked: false },
  { id: "produits", label: "Ajusté les produits chimiques", checked: false },
  { id: "filtreur", label: "Vérifié le filtreur", checked: false },
  { id: "backwash", label: "Fait un backwash", checked: false },
  { id: "pompe", label: "Vérifié la pompe", checked: false },
  { id: "tout_ok", label: "Tout est beau, aucun problème", checked: false },
];

const OUVERTURE_ITEMS: ChecklistItem[] = [
  { id: "toile_ret", label: "Retiré la toile", checked: false },
  { id: "nettoyage", label: "Nettoyé la piscine (30 min)", checked: false },
  { id: "tuyaux", label: "Branché les tuyaux", checked: false },
  { id: "trousse", label: "Ajouté la trousse d'ouverture", checked: false },
  { id: "pompe_dem", label: "Démarré la pompe/filtreur", checked: false },
  { id: "eau_init", label: "Testé l'eau initiale", checked: false },
  { id: "instructions", label: "Instructions données au client", checked: false },
];

const FERMETURE_ITEMS: ChecklistItem[] = [
  { id: "niveau", label: "Baissé le niveau d'eau", checked: false },
  { id: "debranche", label: "Débranché les tuyaux", checked: false },
  { id: "souffle", label: "Soufflé les lignes", checked: false },
  { id: "antigel", label: "Ajouté l'antigel", checked: false },
  { id: "toile_inst", label: "Installé la toile", checked: false },
  { id: "valves", label: "Fermé les valves", checked: false },
];

function getItemsForType(jobType: string): ChecklistItem[] {
  if (jobType.includes("ouverture")) return OUVERTURE_ITEMS.map(i => ({ ...i }));
  if (jobType.includes("fermeture")) return FERMETURE_ITEMS.map(i => ({ ...i }));
  return ENTRETIEN_ITEMS.map(i => ({ ...i }));
}

function generateMessage(clientName: string, jobType: string, items: ChecklistItem[], comment: string): string {
  const firstName = clientName.split(" ")[0];
  const checked = items.filter(i => i.checked);

  if (jobType.includes("ouverture")) {
    let msg = `Bonjour ${firstName}! Votre ouverture de piscine est complétée. `;
    msg += `Voici ce qui a été fait:\n`;
    checked.forEach(i => { msg += `✅ ${i.label}\n`; });
    msg += `\nVotre piscine est prête pour la saison! N'hésitez pas si vous avez des questions.`;
    if (comment) msg += `\n\nNote: ${comment}`;
    return msg;
  }

  if (jobType.includes("fermeture")) {
    let msg = `Bonjour ${firstName}! La fermeture de votre piscine est complétée. `;
    msg += `Voici ce qui a été fait:\n`;
    checked.forEach(i => { msg += `✅ ${i.label}\n`; });
    msg += `\nVotre piscine est bien protégée pour l'hiver! On se revoit au printemps.`;
    if (comment) msg += `\n\nNote: ${comment}`;
    return msg;
  }

  // Entretien
  let msg = `Bonjour ${firstName}! Votre entretien de piscine est complété. `;
  if (checked.length > 0) {
    msg += `Voici ce qui a été fait:\n`;
    checked.forEach(i => { msg += `✅ ${i.label}\n`; });
  }
  const hasProbleme = items.find(i => i.id === "tout_ok")?.checked;
  if (hasProbleme) {
    msg += `\nTout est beau, votre piscine est en parfait état! 👍`;
  }
  if (comment) msg += `\n\nNote: ${comment}`;
  msg += `\nBonne baignade!`;
  return msg;
}

interface Props {
  clientName: string;
  clientId: string;
  jobType: string;
  onClose: () => void;
  onComplete: () => void;
}

export default function PostVisitChecklist({ clientName, clientId, jobType, onClose, onComplete }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>(getItemsForType(jobType));
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState(false);

  const toggle = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !i.checked } : i));
  };

  const selectAll = () => {
    const allChecked = items.every(i => i.checked);
    setItems(prev => prev.map(i => ({ ...i, checked: !allChecked })));
  };

  const message = generateMessage(clientName, jobType, items, comment);
  const checkedCount = items.filter(i => i.checked).length;

  const send = async () => {
    if (checkedCount === 0) return;
    setSending(true);
    try {
      await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: clientId, body: message }),
      });
      onComplete();
    } catch (e) {
      console.error("Erreur envoi SMS:", e);
      alert("Erreur lors de l'envoi du SMS");
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        background: "var(--color-background-primary, #fff)",
        borderRadius: "16px 16px 0 0",
        width: "100%", maxWidth: 500, maxHeight: "85vh",
        display: "flex", flexDirection: "column",
        paddingBottom: "env(safe-area-inset-bottom, 16px)",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px", borderBottom: "1px solid var(--color-border-tertiary, #eee)",
        }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>{clientName}</div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary, #888)" }}>
              {jobType.charAt(0).toUpperCase() + jobType.slice(1)} — {checkedCount}/{items.length} items
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }}>
            <X size={20} />
          </button>
        </div>

        {/* Checklist ou Preview */}
        <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
          {!preview ? (
            <>
              <button onClick={selectAll} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 13, color: "var(--color-text-info, #2563eb)",
                marginBottom: 8, padding: 0,
              }}>
                {items.every(i => i.checked) ? "Tout décocher" : "Tout cocher"}
              </button>

              {items.map(item => (
                <label key={item.id} style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "10px 0", borderBottom: "1px solid var(--color-border-tertiary, #f0f0f0)",
                  cursor: "pointer", fontSize: 14,
                }}>
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggle(item.id)}
                    style={{ width: 20, height: 20, accentColor: "#16a34a" }}
                  />
                  <span style={{ color: item.checked ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}>
                    {item.label}
                  </span>
                </label>
              ))}

              <textarea
                placeholder="Commentaire optionnel pour le client..."
                value={comment}
                onChange={e => setComment(e.target.value)}
                rows={2}
                style={{
                  width: "100%", marginTop: 12, padding: 10, fontSize: 14,
                  border: "1px solid var(--color-border-tertiary, #ddd)",
                  borderRadius: 8, resize: "none",
                  background: "var(--color-background-secondary, #f9f9f9)",
                }}
              />
            </>
          ) : (
            <div style={{
              background: "var(--color-background-secondary, #f5f5f5)",
              borderRadius: 12, padding: 16, fontSize: 14,
              whiteSpace: "pre-wrap", lineHeight: 1.6,
            }}>
              {message}
            </div>
          )}
        </div>

        {/* Footer buttons */}
        <div style={{
          display: "flex", gap: 10, padding: "12px 20px",
          borderTop: "1px solid var(--color-border-tertiary, #eee)",
        }}>
          {!preview ? (
            <button
              onClick={() => setPreview(true)}
              disabled={checkedCount === 0}
              style={{
                flex: 1, padding: "12px 0", borderRadius: 10,
                background: checkedCount === 0 ? "#ccc" : "#0a1f3f",
                color: "#fff", border: "none", fontSize: 15, fontWeight: 600,
                cursor: checkedCount === 0 ? "not-allowed" : "pointer",
              }}
            >
              Voir le message ({checkedCount})
            </button>
          ) : (
            <>
              <button
                onClick={() => setPreview(false)}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10,
                  background: "var(--color-background-secondary, #f0f0f0)",
                  border: "none", fontSize: 15, cursor: "pointer",
                }}
              >
                Modifier
              </button>
              <button
                onClick={send}
                disabled={sending}
                style={{
                  flex: 1, padding: "12px 0", borderRadius: 10,
                  background: "#16a34a", color: "#fff",
                  border: "none", fontSize: 15, fontWeight: 600,
                  cursor: sending ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                {sending ? "Envoi..." : "Envoyer SMS"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
