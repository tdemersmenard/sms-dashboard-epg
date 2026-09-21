"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

/* Mon compte — coordonnées + déconnexion. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

export default function PortailSettings() {
  const router = useRouter();
  const [client, setClient] = useState<Any>(null);
  const [form, setForm] = useState({ email: "", address: "", city: "", postal_code: "" });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/portail/me", {
      headers: { Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}` },
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.client) {
          setClient(d.client);
          setForm({
            email: d.client.email || "",
            address: d.client.address || "",
            city: d.client.city || "",
            postal_code: d.client.postal_code || "",
          });
        }
      });
  }, []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      await fetch("/api/portail/update-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}`,
        },
        body: JSON.stringify(form),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("portal_token");
    document.cookie = "portal_token=; path=/; max-age=0";
    router.push("/portail");
  };

  if (!client) return null;

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 16 }}>Mon compte</h1>

      <div className="ptl-card glow">
        <span className="lbl">Ton dossier</span>
        <div style={{ marginTop: 4 }}>
          <div className="ptl-row">
            <span className="k">Nom</span>
            <span className="v">{[client.first_name, client.last_name].filter(Boolean).join(" ")}</span>
          </div>
          <div className="ptl-row">
            <span className="k">Cellulaire</span>
            <span className="v">{client.phone}</span>
          </div>
          {client.pool_type && (
            <div className="ptl-row">
              <span className="k">Piscine</span>
              <span className="v" style={{ textTransform: "capitalize" }}>{client.pool_type}</span>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={save} className="ptl-card" style={{ marginTop: 12, display: "grid", gap: 11 }}>
        <span className="lbl">Coordonnées</span>
        <input className="ptl-input" type="email" placeholder="Courriel" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        <input className="ptl-input" placeholder="Adresse" value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px", gap: 10 }}>
          <input className="ptl-input" placeholder="Ville" value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
          <input className="ptl-input" placeholder="Code postal" value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} />
        </div>
        <button className="ptl-btn" disabled={saving}>{saved ? "Enregistré ✓" : saving ? "…" : "Enregistrer"}</button>
      </form>

      <button onClick={logout} className="ptl-btn-ghost" style={{ marginTop: 14, color: "var(--red)" }}>
        <LogOut size={16} /> Me déconnecter
      </button>
    </div>
  );
}
