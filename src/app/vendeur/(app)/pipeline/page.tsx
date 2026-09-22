"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { vendeurBrowser } from "@/lib/vendeur/client";

/* Pipeline kanban — colonnes par pipeline_status. Glisser-déposer (desktop)
   + menu tap-to-move (mobile). Écriture en JWT (RLS: ses leads seulement). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const COLS: { key: string; label: string }[] = [
  { key: "nouveau", label: "Nouveau" },
  { key: "contacte", label: "Contacté" },
  { key: "rappel_prevu", label: "Rappel prévu" },
  { key: "negociation", label: "Négociation" },
  { key: "depot_paye", label: "Dépôt payé" },
  { key: "client", label: "Client" },
  { key: "perdu", label: "Perdu" },
];

export default function VendeurPipeline() {
  const router = useRouter();
  const sb = vendeurBrowser();
  const [leads, setLeads] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);
  const [drag, setDrag] = useState<string | null>(null);
  const [fVille, setFVille] = useState("");
  const [fPool, setFPool] = useState("");
  const [moveMenu, setMoveMenu] = useState<string | null>(null);

  const load = async () => {
    const { data } = await sb.from("contacts").select("id, first_name, last_name, phone, city, pool_type, pipeline_status, assigned_at");
    setLeads(data || []);
    setReady(true);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  if (!ready) return null;

  const move = async (leadId: string, status: string) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_status: status } : l)));
    setMoveMenu(null);
    await sb.from("contacts").update({ pipeline_status: status }).eq("id", leadId);
  };

  const filtered = leads.filter((l) =>
    (!fVille || (l.city || "").toLowerCase().includes(fVille.toLowerCase())) &&
    (!fPool || l.pool_type === fPool),
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <input className="vnd-input" placeholder="Filtrer par ville" value={fVille} onChange={(e) => setFVille(e.target.value)} style={{ flex: 1 }} />
        <select className="vnd-select" value={fPool} onChange={(e) => setFPool(e.target.value)} style={{ width: 130 }}>
          <option value="">Piscine</option>
          <option value="hors-terre">Hors-terre</option>
          <option value="creusée">Creusée</option>
        </select>
      </div>

      <div className="vnd-kanban">
        {COLS.map((col) => {
          const items = filtered.filter((l) => (l.pipeline_status || "nouveau") === col.key);
          return (
            <div
              key={col.key}
              className="vnd-col"
              onDragOver={(e) => { if (drag) e.preventDefault(); }}
              onDrop={() => { if (drag) move(drag, col.key); setDrag(null); }}
            >
              <h3>{col.label}<span>{items.length}</span></h3>
              {items.map((l) => (
                <div
                  key={l.id}
                  className={`vnd-kcard ${drag === l.id ? "drag" : ""}`}
                  draggable
                  onDragStart={() => setDrag(l.id)}
                  onDragEnd={() => setDrag(null)}
                >
                  <div onClick={() => router.push(`/vendeur/lead/${l.id}`)} style={{ cursor: "pointer" }}>
                    <div className="n">{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone}</div>
                    <div className="m">{l.city || "?"}{l.pool_type ? ` · ${l.pool_type}` : ""}</div>
                  </div>
                  <button
                    onClick={() => setMoveMenu(moveMenu === l.id ? null : l.id)}
                    style={{ background: "none", border: "none", color: "var(--faint)", fontSize: ".72rem", cursor: "pointer", padding: "4px 0 0", marginTop: 4 }}
                  >
                    Déplacer ▾
                  </button>
                  {moveMenu === l.id && (
                    <div style={{ display: "grid", gap: 4, marginTop: 6 }}>
                      {COLS.filter((c) => c.key !== col.key).map((c) => (
                        <button key={c.key} onClick={() => move(l.id, c.key)} style={{ textAlign: "left", background: "var(--panel2)", border: "1px solid var(--line)", color: "var(--ink)", borderRadius: 7, padding: "6px 9px", fontSize: ".76rem", cursor: "pointer" }}>
                          → {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && <p style={{ fontSize: ".76rem", color: "var(--faint)", textAlign: "center", padding: "10px 0" }}>—</p>}
            </div>
          );
        })}
      </div>
      <p style={{ fontSize: ".72rem", color: "var(--faint)", marginTop: 10, textAlign: "center" }}>Glisse une carte entre les colonnes, ou utilise « Déplacer ▾ » sur mobile.</p>
    </div>
  );
}
