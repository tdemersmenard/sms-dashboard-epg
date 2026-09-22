"use client";

import { useEffect, useState } from "react";

/* Closers — créer, ÉDITER (nom, tél, courriel, mot de passe, commissions),
   désactiver + tableau de performance. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AdminClosers() {
  const [closers, setClosers] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", phone: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Any>({});
  const [editErr, setEditErr] = useState("");

  const load = async () => {
    const d = await fetch("/api/admin/closers").then((r) => r.json());
    setClosers(d.closers || []);
    setReady(true);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setBusy(true); setErr("");
    const res = await fetch("/api/admin/closers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json();
    if (res.ok) { setShow(false); setForm({ fullName: "", email: "", password: "", phone: "" }); await load(); }
    else setErr(d.error || "Erreur");
    setBusy(false);
  };

  const toggle = async (id: string, active: boolean) => {
    await fetch("/api/admin/closers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active: !active }) });
    await load();
  };

  const openEdit = (c: Any) => {
    setEditId(c.id); setEditErr("");
    setEdit({ fullName: c.full_name || "", phone: c.phone || "", email: c.email || "", password: "", commissionFlatCents: c.commission_flat_cents, bonusComptantCents: c.bonus_comptant_cents });
  };

  const saveEdit = async (id: string) => {
    setBusy(true); setEditErr("");
    const body: Any = { id, fullName: edit.fullName, phone: edit.phone };
    if (edit.email) body.email = edit.email;
    if (edit.password) body.password = edit.password;
    if (Number.isFinite(+edit.commissionFlatCents)) body.commissionFlatCents = Math.round(+edit.commissionFlatCents);
    if (Number.isFinite(+edit.bonusComptantCents)) body.bonusComptantCents = Math.round(+edit.bonusComptantCents);
    const res = await fetch("/api/admin/closers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (res.ok) { setEditId(null); await load(); } else setEditErr(d.error || "Erreur");
    setBusy(false);
  };

  if (!ready) return null;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ fontWeight: 900, fontSize: "1.4rem" }}>Closers</h1>
        <button className="vnd-btn" style={{ width: "auto", padding: "10px 16px" }} onClick={() => setShow(!show)}>+ Nouveau</button>
      </div>

      {show && (
        <div className="vnd-card" style={{ marginBottom: 14, display: "grid", gap: 9 }}>
          <input className="vnd-input" placeholder="Nom complet" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
          <input className="vnd-input" type="email" placeholder="Courriel" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <input className="vnd-input" type="password" placeholder="Mot de passe (min 8)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <input className="vnd-input" placeholder="Cellulaire (pour les alertes de nouveaux leads)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {err && <p className="vnd-err">{err}</p>}
          <button className="vnd-btn" disabled={busy} onClick={create}>{busy ? "…" : "Créer le compte"}</button>
        </div>
      )}

      {closers.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Aucun closer. Crée le premier compte.</p></div>
      ) : closers.map((c) => (
        <div className="vnd-card" key={c.id} style={{ marginBottom: 10, opacity: c.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
            <div>
              <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "1.05rem" }}>{c.full_name || "Closer"}</span>
              <div style={{ fontSize: ".76rem", color: "var(--faint)" }}>{c.email}{c.phone ? ` · ${c.phone}` : " · pas de cellulaire"}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={() => (editId === c.id ? setEditId(null) : openEdit(c))} style={{ background: "none", border: "1px solid var(--line)", color: "var(--aqua)", borderRadius: 8, padding: "5px 12px", fontSize: ".74rem", fontWeight: 700, cursor: "pointer" }}>
                {editId === c.id ? "Fermer" : "Éditer"}
              </button>
              <button onClick={() => toggle(c.id, c.active)} style={{ background: "none", border: "1px solid var(--line)", color: c.active ? "var(--red)" : "var(--green)", borderRadius: 8, padding: "5px 12px", fontSize: ".74rem", fontWeight: 700, cursor: "pointer" }}>
                {c.active ? "Désactiver" : "Réactiver"}
              </button>
            </div>
          </div>

          {editId === c.id && (
            <div style={{ marginTop: 12, display: "grid", gap: 8, borderTop: "1px solid rgba(27,58,92,.5)", paddingTop: 12 }}>
              <input className="vnd-input" placeholder="Nom complet" value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} />
              <input className="vnd-input" placeholder="Cellulaire" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
              <input className="vnd-input" type="email" placeholder="Courriel" value={edit.email} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
              <input className="vnd-input" type="password" placeholder="Nouveau mot de passe (laisser vide pour garder)" value={edit.password} onChange={(e) => setEdit({ ...edit, password: e.target.value })} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <label style={{ fontSize: ".72rem", color: "var(--mut)" }}>Commission fixe (¢)
                  <input className="vnd-input" type="number" value={edit.commissionFlatCents} onChange={(e) => setEdit({ ...edit, commissionFlatCents: e.target.value })} style={{ marginTop: 3 }} />
                </label>
                <label style={{ fontSize: ".72rem", color: "var(--mut)" }}>Bonus comptant (¢)
                  <input className="vnd-input" type="number" value={edit.bonusComptantCents} onChange={(e) => setEdit({ ...edit, bonusComptantCents: e.target.value })} style={{ marginTop: 3 }} />
                </label>
              </div>
              <p style={{ fontSize: ".68rem", color: "var(--faint)" }}>Commissions en cents: 10000 = 100$, 5000 = 50$.</p>
              {editErr && <p className="vnd-err">{editErr}</p>}
              <button className="vnd-btn" disabled={busy} onClick={() => saveEdit(c.id)}>{busy ? "…" : "Enregistrer"}</button>
            </div>
          )}

          {c.perf && editId !== c.id && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
              {[
                ["Assignés", c.perf.assignes], ["Appels", c.perf.appels], ["Contact", c.perf.taux_contact + "%"],
                ["Dépôts", c.perf.depots], ["Valeur", c.perf.valeur.toLocaleString("fr-CA") + "$"], ["Conversion", c.perf.conversion + "%"],
              ].map(([k, v]) => (
                <div key={k as string} style={{ background: "var(--bg)", borderRadius: 8, padding: "8px 6px", textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "1rem", color: "var(--aqua)" }}>{v}</div>
                  <div style={{ fontSize: ".64rem", color: "var(--mut)" }}>{k}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
