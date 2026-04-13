"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Camera, Loader2 } from "lucide-react";

export default function OdometrePage() {
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [scanning, setScanning] = useState<"start" | "end" | null>(null);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);

  const loadLogs = async () => {
    const { data } = await supabaseBrowser
      .from("odometer_logs")
      .select("*")
      .order("date", { ascending: false })
      .limit(20);
    setLogs(data || []);
  };

  useEffect(() => { loadLogs(); }, []);

  const handleScan = async (type: "start" | "end", file: File) => {
    setScanning(type);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch("/api/odometer/scan-photo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageBase64: reader.result }),
        });
        const data = await res.json();
        if (data.success && data.km) {
          if (type === "start") setKmStart(String(data.km));
          else setKmEnd(String(data.km));
        }
      } finally {
        setScanning(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!kmStart || !kmEnd) {
      alert("Entrez les km de début et fin");
      return;
    }
    setSaving(true);
    await fetch("/api/odometer/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        kmStart: parseInt(kmStart),
        kmEnd: parseInt(kmEnd),
        notes,
      }),
    });
    setSaving(false);
    setKmStart("");
    setKmEnd("");
    setNotes("");
    await loadLogs();
  };

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Odomètre</h1>
        <p className="text-sm text-gray-500 mt-1">Tracker quotidien des km pour conformité fiscale</p>
      </div>

      <div className="bg-white rounded-xl border p-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-gray-700">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-700">KM début</label>
            <input
              type="number"
              value={kmStart}
              onChange={(e) => setKmStart(e.target.value)}
              placeholder="Ex: 125000"
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            />
            <label className="block mt-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleScan("start", e.target.files[0])}
                className="hidden"
              />
              <div className="cursor-pointer bg-blue-50 border border-blue-200 rounded-lg p-2 text-center hover:bg-blue-100">
                {scanning === "start" ? (
                  <Loader2 size={14} className="animate-spin inline" />
                ) : (
                  <><Camera size={14} className="inline mr-1" /> Photo</>
                )}
              </div>
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-700">KM fin</label>
            <input
              type="number"
              value={kmEnd}
              onChange={(e) => setKmEnd(e.target.value)}
              placeholder="Ex: 125150"
              className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
            />
            <label className="block mt-2">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => e.target.files?.[0] && handleScan("end", e.target.files[0])}
                className="hidden"
              />
              <div className="cursor-pointer bg-blue-50 border border-blue-200 rounded-lg p-2 text-center hover:bg-blue-100">
                {scanning === "end" ? (
                  <Loader2 size={14} className="animate-spin inline" />
                ) : (
                  <><Camera size={14} className="inline mr-1" /> Photo</>
                )}
              </div>
            </label>
          </div>
        </div>

        {kmStart && kmEnd && parseInt(kmEnd) > parseInt(kmStart) && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <p className="text-gray-700">Total: <strong>{parseInt(kmEnd) - parseInt(kmStart)} km</strong></p>
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-gray-700">Notes (optionnel)</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Route Mardi + Costco"
            className="w-full mt-1 border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <button
          onClick={handleSave}
          disabled={saving || !kmStart || !kmEnd}
          className="w-full bg-[#0a1f3f] text-white rounded-lg py-3 font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 size={18} className="animate-spin inline" /> : "Enregistrer la journée"}
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b">
          <p className="font-semibold text-gray-900">Historique récent</p>
        </div>
        <div className="divide-y">
          {logs.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">Aucun enregistrement</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{log.date}</p>
                  <p className="text-xs text-gray-500">
                    {log.km_total} km total • {log.km_business} km business • {log.km_personnel} km perso
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-blue-600">{log.business_pct}%</p>
                  <p className="text-[10px] text-gray-500">business</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
