"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle, Info, CheckCircle, RefreshCw } from "lucide-react";

export default function DiagnosticPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const fetchDiagnostic = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/diagnostic", { cache: "no-store" });
      const d = await res.json();
      setData(d);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDiagnostic(); }, []);

  if (loading) return <div className="p-8">Chargement du diagnostic...</div>;
  if (!data) return <div className="p-8">Erreur</div>;

  const severityConfig: Record<string, { bg: string; text: string; icon: any }> = {
    error: { bg: "bg-chip border-line", text: "text-neg", icon: AlertCircle },
    warning: { bg: "bg-chip border-line", text: "text-warn", icon: AlertTriangle },
    info: { bg: "bg-chip border-line", text: "text-acc", icon: Info },
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display text-ink">Diagnostic système</h1>
          <p className="text-sm text-mut mt-1">Audit complet de l&apos;app</p>
        </div>
        <button onClick={fetchDiagnostic} className="btn-glow px-4 py-2 rounded-lg hover:opacity-90 flex items-center gap-2">
          <RefreshCw size={16} /> Rafraîchir
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-sur rounded-xl border border-line p-4 text-center">
          <p className="text-2xl font-bold font-display num text-neg">{data.issues.errors}</p>
          <p className="lbl">Erreurs</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4 text-center">
          <p className="text-2xl font-bold font-display num text-warn">{data.issues.warnings}</p>
          <p className="lbl">Avertissements</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4 text-center">
          <p className="text-2xl font-bold font-display num text-acc">{data.issues.info}</p>
          <p className="lbl">Infos</p>
        </div>
        <div className="bg-sur rounded-xl border border-line p-4 text-center">
          <p className="text-2xl font-bold font-display num text-pos">{data.issues.total === 0 ? "✓" : data.issues.total}</p>
          <p className="lbl">{data.issues.total === 0 ? "Tout OK" : "Issues"}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="bg-sur rounded-xl border border-line p-5">
        <h2 className="font-semibold font-display text-ink mb-3">Statistiques</h2>
        <pre className="text-xs bg-page p-3 rounded-lg overflow-x-auto">{JSON.stringify(data.stats, null, 2)}</pre>
      </div>

      {/* Issues */}
      {data.details.length > 0 && (
        <div className="space-y-2">
          <h2 className="font-semibold font-display text-ink">Issues détectées</h2>
          {data.details.map((issue: any, i: number) => {
            const cfg = severityConfig[issue.severity] || severityConfig.info;
            const Icon = cfg.icon;
            return (
              <div key={i} className={`${cfg.bg} border rounded-xl p-4 flex gap-3`}>
                <Icon size={18} className={`${cfg.text} flex-shrink-0 mt-0.5`} />
                <div className="flex-1">
                  <p className={`${cfg.text} font-medium text-sm`}>
                    [{issue.module}] {issue.message}
                  </p>
                  {issue.details && (
                    <pre className="text-xs text-mut mt-2 bg-sur/50 p-2 rounded overflow-x-auto">{JSON.stringify(issue.details, null, 2)}</pre>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {data.details.length === 0 && (
        <div className="bg-chip border border-line rounded-xl p-6 text-center">
          <CheckCircle size={32} className="text-pos mx-auto mb-2" />
          <p className="font-semibold text-pos">Aucun problème détecté!</p>
          <p className="text-sm text-pos mt-1">Tout fonctionne correctement.</p>
        </div>
      )}
    </div>
  );
}
