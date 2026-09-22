"use client";

import { useEffect, useState } from "react";

/* Assignation — leads non assignés, sélection en lot, assignation à un closer
   ou répartition auto en rotation. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AdminAssignation() {
  const [leads, setLeads] = useState<Any[]>([]);
  const [closers, setClosers] = useState<Any[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [closerId, setCloserId] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const d = await fetch("/api/admin/assignation").then((r) => r.json());
    setLeads(d.leads || []);
    setClosers(d.closers || []);
    if (d.closers?.[0]) setCloserId((c) => c || d.closers[0].id);
    setReady(true);
  };
  useEffect(() => { load(); }, []);

  const toggle = (id: string) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allSel = leads.length > 0 && sel.size === leads.length;

  const assign = async (rotate: boolean) => {
    if (sel.size === 0 || busy) return;
    setBusy(true);
    await fetch("/api/admin/assignation", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: Array.from(sel), closerId: rotate ? undefined : closerId, rotate }),
    });
    setSel(new Set());
    await load();
    setBusy(false);
  };

  if (!ready) return null;

  return (
    <div>
      <h1 style={{ fontWeight: 900, fontSize: "1.4rem", marginBottom: 4 }}>Assignation</h1>
      <p style={{ color: "var(--mut)", fontSize: ".85rem", marginBottom: 16 }}>{leads.length} lead{leads.length > 1 ? "s" : ""} non assigné{leads.length > 1 ? "s" : ""}.</p>

      {closers.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Crée d&apos;abord un compte closer dans l&apos;onglet Closers.</p></div>
      ) : leads.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Tous les leads sont assignés 🌊</p></div>
      ) : (
        <>
          {/* Barre d'action */}
          <div className="vnd-card" style={{ marginBottom: 12, display: "grid", gap: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: ".85rem", color: "var(--mut)" }}>
              <input type="checkbox" checked={allSel} onChange={() => setSel(allSel ? new Set() : new Set(leads.map((l) => l.id)))} style={{ width: 16, height: 16, accentColor: "var(--cyan)" }} />
              Tout sélectionner ({sel.size} choisi{sel.size > 1 ? "s" : ""})
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
              <select className="vnd-select" value={closerId} onChange={(e) => setCloserId(e.target.value)}>
                {closers.map((c) => <option key={c.id} value={c.id}>{c.full_name || "Closer"}</option>)}
              </select>
              <button className="vnd-btn" style={{ width: "auto", padding: "12px 18px" }} disabled={sel.size === 0 || busy} onClick={() => assign(false)}>Assigner</button>
            </div>
            <button className="vnd-btn-ghost" disabled={sel.size === 0 || busy} onClick={() => assign(true)}>⟳ Répartir en rotation entre les closers actifs</button>
          </div>

          {/* Liste */}
          {leads.map((l) => (
            <label key={l.id} className="vnd-card" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, cursor: "pointer", borderColor: sel.has(l.id) ? "var(--cyan)" : "var(--line)" }}>
              <input type="checkbox" checked={sel.has(l.id)} onChange={() => toggle(l.id)} style={{ width: 18, height: 18, accentColor: "var(--cyan)", flex: "none" }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{[l.first_name, l.last_name].filter(Boolean).join(" ") || l.phone}</div>
                <div style={{ fontSize: ".76rem", color: "var(--mut)" }}>{l.city || "?"}{l.pool_type ? ` · ${l.pool_type}` : ""} · {l.lead_source?.replace("meta_", "").replace("_", " ")} · {new Date(l.created_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}</div>
              </div>
            </label>
          ))}
        </>
      )}
    </div>
  );
}
