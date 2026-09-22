"use client";

import { useEffect, useState } from "react";

/* Closers — créer/désactiver un compte + tableau de performance. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function AdminClosers() {
  const [closers, setClosers] = useState<Any[]>([]);
  const [ready, setReady] = useState(false);
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", password: "", phone: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

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
          <input className="vnd-input" placeholder="Téléphone (optionnel)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {err && <p className="vnd-err">{err}</p>}
          <button className="vnd-btn" disabled={busy} onClick={create}>{busy ? "…" : "Créer le compte"}</button>
        </div>
      )}

      {closers.length === 0 ? (
        <div className="vnd-card"><p className="vnd-empty">Aucun closer. Crée le premier compte.</p></div>
      ) : closers.map((c) => (
        <div className="vnd-card" key={c.id} style={{ marginBottom: 10, opacity: c.active ? 1 : 0.55 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div>
              <span style={{ fontFamily: "var(--disp)", fontWeight: 800, fontSize: "1.05rem" }}>{c.full_name || "Closer"}</span>
              <div style={{ fontSize: ".76rem", color: "var(--faint)" }}>{c.email}</div>
            </div>
            <button onClick={() => toggle(c.id, c.active)} style={{ background: "none", border: "1px solid var(--line)", color: c.active ? "var(--red)" : "var(--green)", borderRadius: 8, padding: "5px 12px", fontSize: ".74rem", fontWeight: 700, cursor: "pointer" }}>
              {c.active ? "Désactiver" : "Réactiver"}
            </button>
          </div>
          {c.perf && (
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
