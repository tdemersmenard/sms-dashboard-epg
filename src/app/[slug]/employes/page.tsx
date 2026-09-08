"use client";

import { useState, useEffect, useCallback } from "react";
import { Users2, Plus, Pencil, ToggleLeft, ToggleRight, AlertTriangle } from "lucide-react";

interface Employee {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  zone: string;
  work_days: number[];
  max_hours_per_day: number;
  active: boolean;
}

const DAY_LABELS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

interface EmployeeForm {
  name: string;
  phone: string;
  email: string;
  zone: string;
  work_days: number[];
  max_hours_per_day: number;
  password: string;
}

const EMPTY: EmployeeForm = {
  name: "",
  phone: "",
  email: "",
  zone: "granby",
  work_days: [1, 2, 3, 4, 5],
  max_hours_per_day: 8,
  password: "",
};

const MIGRATION_SQL = `CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text,
  email text,
  zone text DEFAULT 'granby',
  work_days int[] DEFAULT ARRAY[1,2,3,4,5],
  max_hours_per_day int DEFAULT 8,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);`;

export default function EmployesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/employes");
      const data = await res.json();
      if (data.migrationRequired) {
        setMigrationRequired(true);
      } else {
        setEmployees(data.employees || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setShowModal(true);
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      name: emp.name,
      phone: emp.phone ?? "",
      email: emp.email ?? "",
      zone: emp.zone,
      work_days: emp.work_days,
      max_hours_per_day: emp.max_hours_per_day,
      password: "",
    });
    setShowModal(true);
  };

  const toggleDay = (day: number) => {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(day)
        ? f.work_days.filter(d => d !== day)
        : [...f.work_days, day].sort(),
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await fetch("/api/employes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: editing.id, ...form }),
        });
      } else {
        await fetch("/api/employes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
      }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (emp: Employee) => {
    await fetch("/api/employes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: emp.id, active: !emp.active }),
    });
    load();
  };

  const copySQL = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (migrationRequired) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Users2 size={22} className="text-acc" strokeWidth={1.75} />
          <h1 className="text-xl font-bold font-display text-ink">Employés</h1>
        </div>
        <div className="bg-chip border border-line rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-warn" />
            <p className="font-semibold text-warn">Migration de base de données requise</p>
          </div>
          <p className="text-sm text-mut mb-4">
            La table <code className="bg-chip border border-line px-1 rounded">employees</code> n&apos;existe pas encore dans Supabase.
            Copiez et exécutez ce SQL dans votre éditeur SQL Supabase.
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto whitespace-pre-wrap">{MIGRATION_SQL}</pre>
            <button onClick={copySQL}
              className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded">
              {copied ? "Copié!" : "Copier"}
            </button>
          </div>
          <button onClick={() => { setMigrationRequired(false); load(); }} className="mt-4 px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90">
            J&apos;ai exécuté la migration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Users2 size={22} className="text-acc" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold font-display text-ink">Employés</h1>
            <p className="text-sm text-mut">Gestion de l&apos;équipe</p>
          </div>
        </div>
        <button onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90">
          <Plus size={15} /> Ajouter
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-mut">Chargement...</div>
      ) : employees.length === 0 ? (
        <div className="text-center py-12 text-mut border border-dashed border-line rounded-xl">
          Aucun employé — cliquez sur Ajouter pour commencer
        </div>
      ) : (
        <div className="space-y-3">
          {employees.map(emp => (
            <div key={emp.id} className={`bg-sur rounded-xl border p-4 flex items-center gap-4 ${emp.active ? "border-line" : "border-line opacity-60"}`}>
              <div className="w-10 h-10 rounded-full bg-acc-grad flex items-center justify-center flex-shrink-0">
                <span className="text-accink text-sm font-semibold">
                  {emp.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink">{emp.name}</p>
                  {!emp.active && <span className="text-xs bg-chip text-mut px-2 py-0.5 rounded-full">Inactif</span>}
                </div>
                <div className="text-sm text-mut flex flex-wrap gap-3 mt-0.5">
                  {emp.phone && <span>{emp.phone}</span>}
                  {emp.email && <span>{emp.email}</span>}
                  <span className="capitalize">{emp.zone}</span>
                  <span>{emp.work_days.map(d => DAY_LABELS[d]).join(", ")}</span>
                  <span>{emp.max_hours_per_day}h/jour</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => openEdit(emp)} className="p-2 text-mut hover:text-ink hover:bg-chip rounded-lg transition">
                  <Pencil size={15} />
                </button>
                <button onClick={() => toggleActive(emp)} className="p-2 text-mut hover:text-ink hover:bg-chip rounded-lg transition">
                  {emp.active ? <ToggleRight size={18} className="text-pos" /> : <ToggleLeft size={18} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-sur border border-line rounded-2xl w-full max-w-md">
            <div className="p-5 border-b border-line">
              <h2 className="font-bold font-display text-ink">{editing ? "Modifier l'employé" : "Nouvel employé"}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-mut mb-1">Nom *</label>
                <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                  placeholder="Prénom Nom" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Téléphone</label>
                  <input type="text" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    placeholder="450-000-0000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    placeholder="email@exemple.com" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Mot de passe</label>
                  <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    placeholder="Mot de passe pour la connexion" />
                  <p className="text-xs text-mut mt-1">L&apos;employé utilisera son email + ce mot de passe pour se connecter. Laisse vide en modification pour garder l&apos;ancien.</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Zone</label>
                  <input type="text" value={form.zone} onChange={e => setForm(f => ({ ...f, zone: e.target.value }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc"
                    placeholder="granby" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-mut mb-1">Max heures/jour</label>
                  <input type="number" value={form.max_hours_per_day} min={1} max={16}
                    onChange={e => setForm(f => ({ ...f, max_hours_per_day: Number(e.target.value) }))}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm focus:outline-none focus:border-acc" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-mut mb-2">Jours de travail</label>
                <div className="flex gap-1.5">
                  {[1, 2, 3, 4, 5, 6, 7].map(day => (
                    <button key={day} type="button" onClick={() => toggleDay(day)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded transition ${form.work_days.includes(day) ? "bg-acc-grad text-accink" : "bg-chip text-mut hover:bg-chip"}`}>
                      {DAY_LABELS[day]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-5 border-t border-line flex gap-3 justify-end">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-line text-sm rounded-lg hover:bg-chip">
                Annuler
              </button>
              <button onClick={handleSave} disabled={!form.name.trim() || saving}
                className="px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90 disabled:opacity-40">
                {saving ? "Sauvegarde..." : "Sauvegarder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
