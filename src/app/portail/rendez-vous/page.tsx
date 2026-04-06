"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Clock } from "lucide-react";

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ouverture: { bg: "bg-green-50", text: "text-green-700" },
  entretien: { bg: "bg-blue-50", text: "text-blue-700" },
  fermeture: { bg: "bg-orange-50", text: "text-orange-700" },
  visite: { bg: "bg-purple-50", text: "text-purple-700" },
  autre: { bg: "bg-gray-50", text: "text-gray-700" },
};

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  planifié: { label: "Planifié", bg: "bg-blue-50", text: "text-blue-700" },
  confirmé: { label: "Confirmé", bg: "bg-green-50", text: "text-green-700" },
  complété: { label: "Complété", bg: "bg-gray-100", text: "text-gray-600" },
  annulé: { label: "Annulé", bg: "bg-red-50", text: "text-red-600" },
  en_cours: { label: "En cours", bg: "bg-yellow-50", text: "text-yellow-700" },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function JobCard({ job }: { job: any }) {
  const colors = TYPE_COLORS[job.job_type] ?? TYPE_COLORS.autre;
  const status = STATUS_LABELS[job.status] ?? STATUS_LABELS.planifié;
  const dateObj = new Date(job.scheduled_date + "T12:00:00");
  const dayNum = dateObj.toLocaleDateString("fr-CA", { day: "numeric" });
  const monthShort = dateObj.toLocaleDateString("fr-CA", { month: "short" });
  const fullDate = dateObj.toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-start justify-between">
        <div className="flex gap-3">
          <div className={`w-12 h-12 rounded-xl ${colors.bg} flex flex-col items-center justify-center flex-shrink-0`}>
            <span className={`text-sm font-bold ${colors.text} leading-tight`}>{dayNum}</span>
            <span className={`text-[10px] ${colors.text} uppercase`}>{monthShort}</span>
          </div>
          <div>
            <p className="font-semibold text-sm text-gray-900 capitalize">{job.job_type}</p>
            <p className="text-xs text-gray-500 capitalize mt-0.5">{fullDate}</p>
            {job.scheduled_time_start && (
              <p className="text-xs text-gray-400 flex items-center gap-1 mt-1">
                <Clock size={11} /> {job.scheduled_time_start.slice(0, 5)}
              </p>
            )}
          </div>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${status.bg} ${status.text} flex-shrink-0`}>
          {status.label}
        </span>
      </div>
    </div>
  );
}

export default function PortailRendezVous() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [upcoming, setUpcoming] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [past, setPast] = useState<any[]>([]);
  const [showPast, setShowPast] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token) { router.push("/portail"); return; }
    fetch("/api/portail/jobs", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      .then(r => r.json())
      .then(d => {
        setUpcoming(d.upcoming || []);
        setPast(d.past || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const formatDate = (d: string) =>
    new Date(d + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-gray-900">Mes rendez-vous</h1>

      {/* Upcoming */}
      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
          À venir ({upcoming.length})
        </h2>
        {upcoming.length > 0 ? (
          <div className="space-y-3">
            {upcoming.map(job => <JobCard key={job.id} job={job} />)}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
            <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-400">Aucun rendez-vous planifié</p>
            <p className="text-xs text-gray-300 mt-1">Contactez-nous pour planifier un service!</p>
          </div>
        )}
      </div>

      {/* Past */}
      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(!showPast)}
            className="text-sm text-gray-500 underline decoration-dotted"
          >
            {showPast ? "Masquer" : "Voir"} l&apos;historique ({past.length} passage{past.length > 1 ? "s" : ""})
          </button>
          {showPast && (
            <div className="space-y-2 mt-3">
              {past.map(job => (
                <div key={job.id} className="bg-gray-50 rounded-xl border border-gray-100 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-700 font-medium capitalize">{job.job_type}</p>
                    <p className="text-xs text-gray-400 capitalize mt-0.5">{formatDate(job.scheduled_date)}</p>
                  </div>
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Complété</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
