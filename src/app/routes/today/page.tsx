"use client";

import { useState, useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { Navigation, Check, Phone, MapPin, Clock, ArrowLeft, Loader2, Camera } from "lucide-react";
import Link from "next/link";
import PostVisitChecklist from "@/components/PostVisitChecklist";

const DAYS_FR = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];
const HOME_ADDR = "86 rue de Windsor, Granby, QC";

export default function TodayRoutePage() {
  const [loading, setLoading] = useState(true);
  const [todayName, setTodayName] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stops, setStops] = useState<any[]>([]);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [checklistStop, setChecklistStop] = useState<{ name: string; id: string; jobType: string } | null>(null);
  const [photoUploading, setPhotoUploading] = useState<string | null>(null);

  useEffect(() => {
    loadToday();
  }, []);

  const loadToday = async () => {
    setLoading(true);

    const today = new Date();
    const dayName = DAYS_FR[today.getDay()];
    setTodayName(dayName);

    const { data: routeState } = await supabaseBrowser
      .from("route_state")
      .select("data")
      .eq("id", 1)
      .single();

    if (!routeState?.data?.routes) {
      setStops([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dayRoute = routeState.data.routes.find((r: any) => r.day === dayName);
    if (!dayRoute || !dayRoute.stops || dayRoute.stops.length === 0) {
      setStops([]);
      setLoading(false);
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactIds = dayRoute.stops.map((s: any) => s.id);
    const { data: contacts } = await supabaseBrowser
      .from("contacts")
      .select("id, first_name, last_name, phone, address")
      .in("id", contactIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contactMap = new Map((contacts || []).map((c: any) => [c.id, c]));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const enrichedStops = dayRoute.stops.map((s: any, i: number) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const c = contactMap.get(s.id) as any;
      return {
        ...s,
        contactName: c ? `${c.first_name} ${c.last_name || ""}`.trim() : s.name || "Inconnu",
        phone: c?.phone || "",
        address: c?.address || s.address || "",
        position: i + 1,
      };
    });

    setStops(enrichedStops);

    const todayStr = today.toISOString().split("T")[0];
    const { data: completedJobs } = await supabaseBrowser
      .from("jobs")
      .select("contact_id")
      .eq("scheduled_date", todayStr)
      .eq("status", "complété");

    if (completedJobs) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setCompletedIds(new Set(completedJobs.map((j: any) => j.contact_id)));
    }

    setLoading(false);
  };

  const handlePhotoCapture = async (contactId: string, file: File) => {
    setPhotoUploading(contactId);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("contactId", contactId);
      formData.append("type", "photo_thomas");
      await fetch("/api/photos/upload", { method: "POST", body: formData });
    } catch (e) {
      console.error("Erreur upload photo:", e);
      alert("Erreur lors de l'upload");
    } finally {
      setPhotoUploading(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const navigateToStop = (stop: any) => {
    const destination = encodeURIComponent(stop.address || stop.contactName);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    window.open(url, "_blank");
  };

  const navigateAll = () => {
    if (stops.length === 0) return;

    const origin = encodeURIComponent(HOME_ADDR);

    // Tous les arrêts deviennent des waypoints, sauf le DERNIER qui devient la destination
    // Et on ajoute la maison comme dernier waypoint forcé pour le retour
    const allPoints = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...stops.map((s: any) => s.address || s.contactName),
      HOME_ADDR, // retour à la maison
    ];

    // Le dernier point = destination (la maison)
    const destination = encodeURIComponent(allPoints[allPoints.length - 1]);

    // Tous les autres = waypoints
    const waypoints = allPoints
      .slice(0, -1)
      .map((p) => encodeURIComponent(p))
      .join("|");

    const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&waypoints=${waypoints}&travelmode=driving`;
    window.open(url, "_blank");
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markAsDone = async (stop: any) => {
    const today = new Date().toISOString().split("T")[0];

    const { data: jobs } = await supabaseBrowser
      .from("jobs")
      .select("id")
      .eq("contact_id", stop.id)
      .eq("scheduled_date", today)
      .eq("job_type", "entretien")
      .limit(1);

    if (jobs && jobs.length > 0) {
      await supabaseBrowser
        .from("jobs")
        .update({ status: "complété" })
        .eq("id", jobs[0].id);
    }

    setCompletedIds(prev => new Set(Array.from(prev).concat(stop.id)));
  };

  const allDone = stops.length > 0 && completedIds.size === stops.length;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Link href="/routes" className="p-2 bg-gray-100 rounded-lg hover:bg-gray-200">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Itinéraire {todayName}</h1>
          <p className="text-xs text-gray-500">
            {completedIds.size} / {stops.length} complétés
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      ) : stops.length === 0 ? (
        <div className="bg-white rounded-xl border p-8 text-center">
          <p className="text-gray-500">Aucun client prévu pour {todayName}</p>
        </div>
      ) : allDone ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <p className="text-2xl mb-2">🎉</p>
          <p className="font-bold text-green-900">Journée terminée!</p>
          <p className="text-sm text-green-700 mt-1">{stops.length} clients visités</p>
        </div>
      ) : (
        <>
          <button
            onClick={navigateAll}
            className="w-full bg-blue-600 text-white rounded-xl py-4 font-bold text-base flex items-center justify-center gap-2 hover:bg-blue-700"
          >
            <Navigation size={20} /> Lancer Google Maps avec tous les arrêts
          </button>

          <div className="space-y-2">
            {stops.map((stop) => {
              const isDone = completedIds.has(stop.id);
              return (
                <div
                  key={stop.id}
                  className={`bg-white rounded-xl border p-4 ${isDone ? "opacity-50" : ""}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0 ${isDone ? "bg-green-500" : "bg-[#0a1f3f]"}`}>
                      {isDone ? "✓" : stop.position}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-gray-900 ${isDone ? "line-through" : ""}`}>
                        {stop.contactName}
                      </p>
                      {stop.address && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-start gap-1">
                          <MapPin size={11} className="mt-0.5 flex-shrink-0" /> {stop.address}
                        </p>
                      )}
                      {stop.startTime && (
                        <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          <Clock size={11} /> {stop.startTime}
                        </p>
                      )}

                      {!isDone && (
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => navigateToStop(stop)}
                            className="flex-1 bg-blue-50 text-blue-700 rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-blue-100"
                          >
                            <Navigation size={12} /> Naviguer
                          </button>
                          {stop.phone && (
                            <a
                              href={`tel:${stop.phone}`}
                              className="bg-gray-100 text-gray-700 rounded-lg py-2 px-3 text-xs font-medium flex items-center justify-center hover:bg-gray-200"
                            >
                              <Phone size={12} />
                            </a>
                          )}
                          <label className="cursor-pointer flex items-center justify-center gap-1 px-3 py-2 bg-gray-100 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-200">
                            {photoUploading === stop.id ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <Camera size={12} />
                            )}
                            Photo
                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={e => {
                                const file = e.target.files?.[0];
                                if (file) handlePhotoCapture(stop.id, file);
                                e.target.value = "";
                              }}
                            />
                          </label>
                          <button
                            onClick={() => setChecklistStop({ name: stop.contactName, id: stop.id, jobType: stop.jobType || "entretien" })}
                            className="flex-1 bg-green-600 text-white rounded-lg py-2 text-xs font-medium flex items-center justify-center gap-1 hover:bg-green-700"
                          >
                            <Check size={12} /> Fait
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {checklistStop && (
        <PostVisitChecklist
          clientName={checklistStop.name}
          clientId={checklistStop.id}
          jobType={checklistStop.jobType}
          onClose={() => setChecklistStop(null)}
          onComplete={() => {
            const stop = stops.find(s => s.id === checklistStop.id);
            if (stop) markAsDone(stop);
            setChecklistStop(null);
          }}
        />
      )}
    </div>
  );
}
