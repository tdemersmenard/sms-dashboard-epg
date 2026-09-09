"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, CalendarPlus, ChevronDown, Upload, Download, Trash2, CheckCircle, PenLine, Copy, X, CreditCard } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import { useFranchise } from "@/components/FranchiseProvider";
import type { Contact, Job, Document, Payment, Message } from "@/lib/types";

const STAGES = [
  "nouveau", "contacté", "soumission envoyée", "closé",
  "planifié", "complété", "perdu",
] as const;

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "nouveau":            { bg: "bg-acc/10",        text: "text-acc" },
  "contacté":           { bg: "bg-yellow-500/15", text: "text-yellow-600" },
  "soumission envoyée": { bg: "bg-orange-500/15", text: "text-orange-600" },
  "closé":              { bg: "bg-pos/10",        text: "text-pos" },
  "planifié":           { bg: "bg-purple-500/15", text: "text-purple-600" },
  "complété":           { bg: "bg-chip",          text: "text-ink" },
  "perdu":              { bg: "bg-neg/10",        text: "text-neg" },
};

// Profil d'acheteur détecté par l'IA (interne — adapte le pitch, jamais le prix)
const PROFILE_LABELS: Record<string, string> = {
  presse: "Pressé",
  prix: "Prix",
  analytique: "Analytique",
  indecis: "Indécis",
  relationnel: "Relationnel",
};

const JOB_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planifié:  { bg: "bg-acc/10",  text: "text-acc" },
  confirmé:  { bg: "bg-pos/10",  text: "text-pos" },
  en_cours:  { bg: "bg-warn/10", text: "text-warn" },
  complété:  { bg: "bg-chip",    text: "text-ink" },
  annulé:    { bg: "bg-neg/10",  text: "text-neg" },
};

const DOC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  brouillon: { bg: "bg-chip",          text: "text-mut" },
  envoyé:    { bg: "bg-acc/10",        text: "text-acc" },
  signé:     { bg: "bg-purple-500/15", text: "text-purple-600" },
  payé:      { bg: "bg-pos/10",        text: "text-pos" },
};

const METHOD_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  interac:    { bg: "bg-chip",    text: "text-acc",        label: "Interac" },
  cash:       { bg: "bg-chip",    text: "text-pos",        label: "Cash" },
  cheque:     { bg: "bg-chip",    text: "text-mut",        label: "Chèque" },
  carte:      { bg: "bg-chip",    text: "text-purple-600", label: "Carte" },
  autre:      { bg: "bg-chip",    text: "text-mut",        label: "Autre" },
  en_attente: { bg: "bg-warn/10", text: "text-warn",       label: "En attente" },
  stripe:     { bg: "bg-chip",    text: "text-acc2",       label: "Stripe" },
};

const DOC_PREFIX: Record<string, string> = {
  soumission: "S",
  contrat: "C",
  facture: "F",
};


type PayCat = { label: string; value: string; price: number; service: string; isEntretien: boolean; freq: "weekly" | "biweekly" | null };
const PAYMENT_CATEGORIES: PayCat[] = [
  { label: "Entretien hebdomadaire hors-terre", value: "entretien-hebdo-hors-terre", price: 2000, service: "entretien hebdo hors-terre", isEntretien: true, freq: "weekly" },
  { label: "Entretien hebdomadaire creusée",   value: "entretien-hebdo-creusee",     price: 2200, service: "entretien hebdo creusée",    isEntretien: true, freq: "weekly" },
  { label: "Entretien aux 2 semaines",         value: "entretien-2semaines",         price: 1200, service: "entretien aux 2 semaines",   isEntretien: true, freq: "biweekly" },
  { label: "Ouverture hors-terre",             value: "ouverture-hors-terre",        price: 180,  service: "ouverture hors-terre",        isEntretien: false, freq: null },
  { label: "Ouverture creusée",                value: "ouverture-creusee",           price: 200,  service: "ouverture creusée",           isEntretien: false, freq: null },
  { label: "Fermeture hors-terre",             value: "fermeture-hors-terre",        price: 150,  service: "fermeture hors-terre",        isEntretien: false, freq: null },
  { label: "Fermeture creusée",                value: "fermeture-creusee",           price: 175,  service: "fermeture creusée",           isEntretien: false, freq: null },
  { label: "Entretien spa (+500$)",                     value: "entretien-spa",               price: 500,  service: "entretien spa",               isEntretien: false, freq: null },
  { label: "Réparation (85$/h)",                        value: "reparation",                  price: 0,    service: "réparation",                  isEntretien: false, freq: null },
  { label: "Autre (montant personnalisé)",              value: "autre",                       price: 0,    service: "",                            isEntretien: false, freq: null },
];

function displayName(c: Contact): string {
  const first = c.first_name && c.first_name !== "Inconnu" ? c.first_name : null;
  const last = c.last_name && c.last_name.trim() !== "" ? c.last_name : null;
  if (first || last) return [first, last].filter(Boolean).join(" ");
  if (c.name && c.name !== "Inconnu") return c.name;
  return c.phone ?? "Inconnu";
}

function formatDate(d: string) {
  // Parser en date locale pour éviter le décalage UTC
  const [year, month, day] = d.split("T")[0].split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  return localDate.toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
}

function formatMsgTime(d: string) {
  return new Date(d).toLocaleTimeString("fr-CA", { hour: "2-digit", minute: "2-digit" });
}

// Inline editable field
function InlineField({
  label, value, type = "text", onSave,
}: {
  label: string;
  value: string;
  type?: string;
  onSave: (val: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  return (
    <div>
      <p className="text-xs font-medium text-mut mb-0.5">{label}</p>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="w-full border border-acc rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-ink cursor-pointer hover:bg-chip rounded px-2 py-1 -mx-2 min-h-[28px] flex items-center"
        >
          {draft || <span className="text-mut italic">—</span>}
        </p>
      )}
    </div>
  );
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;
  const { franchiseId, franchiseSlug } = useFranchise();

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showAllAdminJobs, setShowAllAdminJobs] = useState(false);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [assignToast, setAssignToast] = useState<string | null>(null);

  // Job modal
  // Water tests
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [waterTests, setWaterTests] = useState<any[]>([]);
  const [showWaterForm, setShowWaterForm] = useState(false);
  const [waterForm, setWaterForm] = useState({ ph: "", alkalinity: "", chlorine: "", calcium_hardness: "", stabilizer: "", notes: "" });
  const [savingWater, setSavingWater] = useState(false);

  const [showJobModal, setShowJobModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteClient = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      router.push(`/${franchiseSlug}/clients`);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Échec de la suppression");
      setDeleting(false);
    }
  };
  const [savingJob, setSavingJob] = useState(false);
  const [jobForm, setJobForm] = useState({
    job_type: "ouverture" as Job["job_type"],
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time_start: "08:00",
    scheduled_time_end: "10:00",
    notes: "",
  });

  // Document upload
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<Document["doc_type"]>("soumission");
  const [uploadingDoc, setUploadingDoc] = useState(false);


  // DocuSign
  const [sendingDocuSign, setSendingDocuSign] = useState<string | null>(null);
  const [docuSignToast, setDocuSignToast] = useState<string | null>(null);

  const handleDocuSign = async (docId: string) => {
    if (!contact?.email) {
      setDocuSignToast("error:email");
      setTimeout(() => setDocuSignToast(null), 4000);
      return;
    }
    setSendingDocuSign(docId);
    try {
      const res = await fetch("/api/docusign/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: docId }),
      });
      if (res.ok) {
        setDocuSignToast("success");
        await load();
      } else {
        const data = await res.json();
        setDocuSignToast(`error:${data.error || "unknown"}`);
      }
    } catch (err) {
      setDocuSignToast(`error:${String(err)}`);
    }
    setSendingDocuSign(null);
    setTimeout(() => setDocuSignToast(null), 4000);
  };

  // New payment demand form
  const [showNewPayForm, setShowNewPayForm] = useState(false);
  const [newPayCategory, setNewPayCategory] = useState("entretien-hebdo-hors-terre");
  const [newPayAmount, setNewPayAmount] = useState("2000");
  const [newPayDescription, setNewPayDescription] = useState("");
  const [newPayDueDate, setNewPayDueDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [newPaySplit, setNewPaySplit] = useState(true);
  const [newPayOuvertureDate, setNewPayOuvertureDate] = useState("");
  const [savingNewPay, setSavingNewPay] = useState(false);
  const [newPayToast, setNewPayToast] = useState(false);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);

  const loadWaterTests = useCallback(async () => {
    const res = await fetch(`/api/water-tests?contactId=${id}`);
    const data = await res.json();
    if (!data.migrationRequired) setWaterTests(data.tests || []);
  }, [id]);

  const load = useCallback(async () => {
    const [{ data: c }, m, { data: j }, { data: d }, { data: p }] = await Promise.all([
      supabaseBrowser.from("contacts").select("*").eq("id", id).single(),
      fetch(`/api/messages?contactId=${id}`).then((r) => r.json()).catch(() => []),
      supabaseBrowser.from("jobs").select("*").eq("contact_id", id).order("scheduled_date"),
      supabaseBrowser.from("documents").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supabaseBrowser.from("payments").select("*").eq("contact_id", id).order("due_date", { ascending: true }),
    ]);
    if (c) setContact(c as Contact);
    setMessages(Array.isArray(m) ? (m as Message[]).slice(-5) : []);
    setJobs((j ?? []) as Job[]);
    setDocuments((d ?? []) as Document[]);
    setPayments((p ?? []) as Payment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    loadWaterTests();
    fetch("/api/employes/list").then(r => r.json()).then(d => setEmployees(d.employees || []));
  }, [load, loadWaterTests]);

  const assignJob = async (jobId: string, employeeId: string | null) => {
    await fetch("/api/jobs/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId, employeeId: employeeId || null }),
    });
    load();
  };

  const assignClient = async (employeeId: string | null) => {
    const res = await fetch("/api/contacts/assign", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: id, employeeId: employeeId || null }),
    });
    const result = await res.json();
    load();
    const n = result.jobsUpdated ?? 0;
    const name = result.employeeName ?? (employeeId ? "l\'employé" : "Thomas");
    setAssignToast(`${n} job${n !== 1 ? "s" : ""} réassigné${n !== 1 ? "s" : ""} à ${name}`);
    setTimeout(() => setAssignToast(null), 3500);
  };

  const save = async (fields: Partial<Contact>) => {
    const { data } = await supabaseBrowser
      .from("contacts").update(fields).eq("id", id).select().single();
    if (data) setContact(data as Contact);
  };

  const handleStageChange = async (stage: string) => {
    setShowStageDropdown(false);
    await save({ stage });
  };

  const handleJobCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingJob(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const empId = (contact as any)?.assigned_employee_id ?? null;
    const { data } = await supabaseBrowser
      .from("jobs")
      .insert({ contact_id: id, status: "planifié", franchise_id: franchiseId, ...jobForm, ...(empId ? { assigned_employee_id: empId } : {}) })
      .select()
      .single();
    if (data) setJobs((prev) => [...prev, data as Job]);
    setShowJobModal(false);
    setSavingJob(false);
  };

  const handleDocUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docFile) return;
    setUploadingDoc(true);

    try {
      const form = new FormData();
      form.append("file", docFile);
      form.append("contactId", id);
      form.append("docType", docType);

      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Erreur lors du téléversement du fichier.");
        setUploadingDoc(false);
        return;
      }

      if (data.document) setDocuments((prev) => [data.document as Document, ...prev]);
      setDocFile(null);
      setShowDocUpload(false);
    } catch (err) {
      console.error("[doc-upload]", err);
      alert("Erreur inattendue lors du téléversement.");
    }
    setUploadingDoc(false);
  };

  const handleDeleteJob = async (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
    await fetch(`/api/jobs/delete?id=${jobId}`, { method: "DELETE" });
  };

  const handleDeleteBulkEntretiens = async () => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer tous les entretiens planifiés? Cette action est irréversible.")) return;
    await fetch(`/api/jobs/delete?bulk=true&contactId=${id}`, { method: "DELETE" });
    await load();
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm("Supprimer ce paiement ?")) return;

    await supabaseBrowser.from("payments").delete().eq("id", paymentId);

    // Recalculer le season_price total
    const { data: remainingPayments } = await supabaseBrowser
      .from("payments")
      .select("amount")
      .eq("contact_id", id);

    const newTotal = (remainingPayments || []).reduce((sum, p) => sum + parseFloat(String(p.amount)), 0);

    await supabaseBrowser.from("contacts").update({ season_price: newTotal }).eq("id", id);

    if (newTotal === 0) {
      // Supprimer les jobs futurs
      const today = new Date().toISOString().split("T")[0];
      await supabaseBrowser
        .from("jobs")
        .delete()
        .eq("contact_id", id)
        .gte("scheduled_date", today);

      // Retirer le client du route_state ET recalculer les totalKm
      const { data: routeState } = await supabaseBrowser.from("route_state").select("data").eq("franchise_id", franchiseId).maybeSingle();
      if (routeState?.data?.routes) {
        const newRoutes = routeState.data.routes.map((r: any) => ({
          ...r,
          stops: r.stops.filter((s: any) => s.id !== id),
        }));

        // Recalculer les totalKm via l'API recalculate-times
        try {
          const res = await fetch("/api/routes/recalculate-times", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ routes: newRoutes }),
          });
          const recalcResult = await res.json();
          if (recalcResult.routes) {
            await supabaseBrowser.from("route_state").update({
              data: { ...routeState.data, routes: recalcResult.routes },
              updated_at: new Date().toISOString(),
            }).eq("franchise_id", franchiseId);
          }
        } catch {
          // Si le recalcul échoue, sauvegarder quand même sans recalcul
          await supabaseBrowser.from("route_state").update({
            data: { ...routeState.data, routes: newRoutes },
            updated_at: new Date().toISOString(),
          }).eq("franchise_id", franchiseId);
        }
      }

      // Supprimer les logs anti-doublon
      await supabaseBrowser
        .from("automation_logs")
        .delete()
        .eq("contact_id", id)
        .like("action", "route_confirmed_%");
    }

    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    await load();
  };

  const handleMarkPaid = async (paymentId: string, method: Payment["method"]) => {
    await supabaseBrowser.from("payments").update({
      status: "reçu",
      method,
      received_date: new Date().toISOString().slice(0, 10),
    }).eq("id", paymentId);
    await load();
    setMarkPaidId(null);
  };

  const handleNewPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayAmount) return;
    // Prévenir les doubles soumissions
    if (savingNewPay) return;
    setSavingNewPay(true);
    const amount = parseFloat(newPayAmount);
    const cat = PAYMENT_CATEGORIES.find(c => c.value === newPayCategory);
    const desc = newPayDescription || cat?.label || "Service de piscine";

    if (newPaySplit && cat?.isEntretien) {
      const half1 = Math.ceil(amount / 2);
      const half2 = amount - half1;
      await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, amount: half1, description: `${desc} — Versement 1/2`, dueDate: newPayDueDate }),
      });

      // Wait 1 sec pour que les SMS arrivent dans le bon ordre
      await new Promise(r => setTimeout(r, 1500));

      await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, amount: half2, description: `${desc} — Versement 2/2`, dueDate: "2026-07-15", silentClient: true }),
      });
    } else {
      await fetch("/api/payments/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: id, amount, description: desc, dueDate: newPayDueDate }),
      });
    }

    const updatedServices = cat?.service
      ? Array.from(new Set([...(contact?.services || []), cat.service]))
      : (contact?.services || []);
    const contactUpdate: Record<string, unknown> = { stage: "closé", services: updatedServices, season_price: amount };
    if (cat?.isEntretien && newPayOuvertureDate) contactUpdate.ouverture_date = newPayOuvertureDate;
    await supabaseBrowser.from("contacts").update(contactUpdate).eq("id", id);

    // Si c'est un entretien avec date d'ouverture, créer le job d'ouverture dans le calendrier
    if (cat?.isEntretien && newPayOuvertureDate) {
      // Vérifier qu'il n'y a pas déjà un job d'ouverture pour ce client
      const { data: existingOuverture } = await supabaseBrowser
        .from("jobs")
        .select("id")
        .eq("contact_id", id)
        .eq("job_type", "ouverture")
        .limit(1);

      if (!existingOuverture || existingOuverture.length === 0) {
        await supabaseBrowser.from("jobs").insert({
          contact_id: id,
          franchise_id: franchiseId,
          job_type: "ouverture",
          scheduled_date: newPayOuvertureDate,
          scheduled_time_start: "08:00",
          scheduled_time_end: "10:00",
          status: "planifié",
          notes: "Ouverture saison 2026 — à confirmer",
        });
      }
    }

    // Aussi, pour les ouvertures seules (pas dans entretien), créer aussi le job
    if (cat?.label?.toLowerCase().includes("ouverture") && newPayOuvertureDate) {
      const { data: existingOuverture } = await supabaseBrowser
        .from("jobs")
        .select("id")
        .eq("contact_id", id)
        .eq("job_type", "ouverture")
        .limit(1);

      if (!existingOuverture || existingOuverture.length === 0) {
        await supabaseBrowser.from("jobs").insert({
          contact_id: id,
          franchise_id: franchiseId,
          job_type: "ouverture",
          scheduled_date: newPayOuvertureDate,
          scheduled_time_start: "08:00",
          scheduled_time_end: "10:00",
          status: "planifié",
          notes: "Ouverture — à confirmer",
        });
      }
    }

    // Trigger auto-assign immédiat pour ce client
    fetch("/api/routes/auto-assign-single", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: id }),
    }).catch(console.error);

    // Envoyer l'accès portail si le client n'en a pas déjà un
    const { data: contactCheck } = await supabaseBrowser
      .from("contacts")
      .select("portal_password, email")
      .eq("id", id)
      .single();

    if (contactCheck?.email && !contactCheck.portal_password) {
      // Délai 8 sec pour pas spammer
      setTimeout(async () => {
        await fetch("/api/portail/send-welcome", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: id }),
        });
      }, 8000);
    }

    await load();
    setSavingNewPay(false);
    setShowNewPayForm(false);
    setNewPayCategory("");
    setNewPayAmount("");
    setNewPayDescription("");
    setNewPayToast(true);
    setNewPayOuvertureDate("");
    setTimeout(() => setNewPayToast(false), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-line border-t-acc rounded-full animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return <div className="p-8 text-mut">Contact introuvable.</div>;
  }

  const stage = contact.stage ?? "nouveau";
  const sc = STAGE_COLORS[stage];

  const totalPaidAmount = payments.filter((p) => p.status === "reçu").reduce((s, p) => s + p.amount, 0);
  const totalDemandedAmount = payments.reduce((s, p) => s + p.amount, 0);
  const resteAPayer = totalDemandedAmount - totalPaidAmount;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Assignment toast */}
      {assignToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-acc-grad text-accink text-sm font-medium px-4 py-3 rounded-xl animate-in slide-in-from-bottom-2">
          ✓ {assignToast}
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="text-mut hover:text-ink text-lg">←</button>
          <h1 className="text-xl font-bold font-display text-ink truncate">{displayName(contact)}</h1>
          {/* Stage dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStageDropdown((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${sc?.bg ?? "bg-chip"} ${sc?.text ?? "text-mut"}`}
            >
              {stage}
              <ChevronDown size={12} />
            </button>
            {showStageDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-sur border border-line rounded-lg  z-20 min-w-[160px] py-1">
                {STAGES.map((s) => {
                  const c2 = STAGE_COLORS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className="w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-chip flex items-center gap-2"
                    >
                      <span className={`w-2 h-2 rounded-full ${c2?.bg ?? "bg-chip"}`} />
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {/* Profil d'acheteur détecté par l'IA (discret, interne) */}
          {contact.buyer_profile && PROFILE_LABELS[contact.buyer_profile] && (
            <span
              title="Profil d'acheteur détecté par l'IA — adapte le pitch, jamais le prix"
              className="hidden sm:inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full bg-chip text-mut"
            >
              Profil: {PROFILE_LABELS[contact.buyer_profile]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setShowDeleteModal(true)}
            title="Supprimer le client"
            className="flex items-center justify-center w-9 h-9 border border-line rounded-lg text-mut hover:text-neg hover:border-neg transition"
          >
            <Trash2 size={15} />
          </button>
          <button
            onClick={() => router.push(`/${franchiseSlug}/messages?contact=${id}`)}
            className="flex items-center gap-1.5 px-3 py-2 border border-line rounded-lg text-sm text-ink hover:bg-chip transition"
          >
            <MessageSquare size={15} />
            SMS
          </button>
          <button
            onClick={() => setShowJobModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 btn-glow rounded-lg text-sm font-medium hover:opacity-90 transition"
          >
            <CalendarPlus size={15} />
            Créer RDV
          </button>
        </div>
      </div>

      {/* Modal suppression */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !deleting && setShowDeleteModal(false)}>
          <div className="bg-sur border border-line rounded-2xl p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display font-semibold text-ink text-lg mb-2">Supprimer ce client?</h3>
            <p className="text-sm text-mut mb-1">
              <b className="text-ink">{[contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || contact?.phone}</b> sera supprimé définitivement,
              avec tout son historique: messages, rendez-vous, paiements et documents.
            </p>
            <p className="text-sm font-semibold text-neg mb-4">Cette action est irréversible.</p>
            {deleteError && <p className="text-sm text-neg mb-3">{deleteError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="px-4 py-2 border border-line rounded-lg text-sm text-ink hover:bg-chip transition"
              >
                Annuler
              </button>
              <button
                onClick={deleteClient}
                disabled={deleting}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-neg text-white hover:opacity-90 transition disabled:opacity-50"
              >
                {deleting ? "Suppression…" : "Supprimer définitivement"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT */}
        <div className="lg:col-span-3 space-y-4">
          {/* Informations */}
          <div className="bg-sur rounded-xl p-6 border border-line ">
            <h2 className="text-sm font-bold font-display text-ink mb-4">Informations</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InlineField label="Prénom" value={contact.first_name ?? ""} onSave={(v) => save({ first_name: v })} />
              <InlineField label="Nom" value={contact.last_name ?? ""} onSave={(v) => save({ last_name: v })} />
              <InlineField label="Téléphone" value={contact.phone ?? ""} type="tel" onSave={(v) => save({ phone: v })} />
              <InlineField label="Email" value={contact.email ?? ""} type="email" onSave={(v) => save({ email: v })} />
              <div className="col-span-2">
                <InlineField label="Adresse" value={contact.address ?? ""} onSave={(v) => save({ address: v })} />
              </div>
              <InlineField label="Ville" value={contact.city ?? ""} onSave={(v) => save({ city: v })} />
              <InlineField label="Code postal" value={contact.postal_code ?? ""} onSave={(v) => save({ postal_code: v })} />
              {employees.length > 0 && (
                <div className="col-span-2">
                  <p className="text-xs font-medium text-mut mb-0.5">Employé assigné</p>
                  <select
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    value={(contact as any).assigned_employee_id ?? ""}
                    onChange={e => assignClient(e.target.value || null)}
                    className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  >
                    <option value="">— Non assigné (Thomas)</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Piscine */}
          <div className="bg-sur rounded-xl p-6 border border-line ">
            <h2 className="text-sm font-bold font-display text-ink mb-4">Piscine</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs font-medium text-mut mb-0.5">Type</p>
                <select
                  value={contact.pool_type ?? ""}
                  onChange={(e) => save({ pool_type: (e.target.value as "hors-terre" | "creusée") || null })}
                  className="w-full border border-line rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                >
                  <option value="">—</option>
                  <option value="hors-terre">Hors-terre</option>
                  <option value="creusée">Creusée</option>
                </select>
              </div>
              <InlineField label="Dimensions" value={contact.pool_dimensions ?? ""} onSave={(v) => save({ pool_dimensions: v })} />
              <InlineField label="Système" value={contact.pool_system ?? ""} onSave={(v) => save({ pool_system: v })} />
              <div>
                <p className="text-xs font-medium text-mut mb-0.5">Spa</p>
                <button
                  onClick={() => save({ has_spa: !contact.has_spa })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${contact.has_spa ? "bg-acc-grad" : "bg-chip"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-sur transition-transform ${contact.has_spa ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Services & Dates */}
          <div className="bg-sur rounded-xl border border-line p-5 space-y-4">
            <h3 className="font-semibold font-display text-ink">Services &amp; Dates</h3>

            {/* Services actuels */}
            <div>
              <label className="lbl">Services actifs</label>
              {(contact?.services || []).length > 0 ? (
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(contact?.services || []).map((s: string, i: number) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-chip text-acc px-2 py-1 rounded-full">
                      {s}
                      <button
                        onClick={async () => {
                          if (!confirm(`Retirer le service "${s}"?`)) return;
                          const newServices = (contact?.services || []).filter((x: string) => x !== s);
                          await supabaseBrowser.from("contacts").update({ services: newServices }).eq("id", id);
                          await load();
                        }}
                        className="hover:text-neg"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-mut italic mt-1">Aucun service</p>
              )}

              <select
                value=""
                onChange={async (e) => {
                  if (!e.target.value) return;
                  const newServices = Array.from(new Set([...(contact?.services || []), e.target.value]));
                  await supabaseBrowser.from("contacts").update({ services: newServices }).eq("id", id);
                  e.target.value = "";
                  await load();
                }}
                className="mt-2 w-full text-xs border border-line rounded-lg px-2 py-1.5 text-mut"
              >
                <option value="">+ Ajouter un service</option>
                <option value="entretien hebdo hors-terre">Entretien hebdo hors-terre</option>
                <option value="entretien hebdo creusée">Entretien hebdo creusée</option>
                <option value="entretien aux 2 semaines hors-terre">Entretien aux 2 semaines hors-terre</option>
                <option value="entretien aux 2 semaines creusée">Entretien aux 2 semaines creusée</option>
                <option value="ouverture">Ouverture seule</option>
                <option value="fermeture">Fermeture seule</option>
                <option value="spa">Spa</option>
                <option value="réparation">Réparation</option>
              </select>
            </div>

            {/* Date d'ouverture */}
            <div>
              <label className="lbl">Date d&apos;ouverture</label>
              <input
                type="date"
                value={contact?.ouverture_date || ""}
                onChange={async (e) => {
                  const newDate = e.target.value || null;
                  await supabaseBrowser.from("contacts").update({ ouverture_date: newDate }).eq("id", id);

                  if (newDate) {
                    const { data: existing } = await supabaseBrowser
                      .from("jobs")
                      .select("id")
                      .eq("contact_id", id)
                      .eq("job_type", "ouverture")
                      .limit(1);

                    if (existing && existing.length > 0) {
                      await supabaseBrowser.from("jobs").update({ scheduled_date: newDate }).eq("id", existing[0].id);
                    } else {
                      await supabaseBrowser.from("jobs").insert({
                        contact_id: id,
                        franchise_id: franchiseId,
                        job_type: "ouverture",
                        scheduled_date: newDate,
                        scheduled_time_start: "08:00",
                        scheduled_time_end: "10:00",
                        status: "planifié",
                        notes: "Ouverture saison 2026",
                      });
                    }
                  }
                  await load();
                }}
                className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2"
              />
            </div>

            {/* Date de fermeture */}
            <div>
              <label className="lbl">Date de fermeture</label>
              <input
                type="date"
                value={(contact as any)?.fermeture_date || ""}
                onChange={async (e) => {
                  const newDate = e.target.value || null;
                  await supabaseBrowser.from("contacts").update({ fermeture_date: newDate } as any).eq("id", id);

                  if (newDate) {
                    const { data: existing } = await supabaseBrowser
                      .from("jobs")
                      .select("id")
                      .eq("contact_id", id)
                      .eq("job_type", "fermeture")
                      .limit(1);

                    if (existing && existing.length > 0) {
                      await supabaseBrowser.from("jobs").update({ scheduled_date: newDate }).eq("id", existing[0].id);
                    } else {
                      await supabaseBrowser.from("jobs").insert({
                        contact_id: id,
                        franchise_id: franchiseId,
                        job_type: "fermeture",
                        scheduled_date: newDate,
                        scheduled_time_start: "08:00",
                        scheduled_time_end: "10:00",
                        status: "planifié",
                        notes: "Fermeture saison 2026",
                      });
                    }
                  }
                  await load();
                }}
                className="mt-1 w-full text-sm border border-line rounded-lg px-3 py-2"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="bg-sur rounded-xl p-6 border border-line ">
            <h2 className="text-sm font-bold font-display text-ink mb-3">Notes</h2>
            <textarea
              defaultValue={contact.notes ?? ""}
              onBlur={(e) => save({ notes: e.target.value || null })}
              rows={4}
              placeholder="Notes internes..."
              className="w-full border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-acc/30"
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          {/* Messages récents */}
          <div className="bg-sur rounded-xl p-4 border border-line ">
            <h2 className="text-sm font-bold font-display text-ink mb-3">Messages récents</h2>
            {messages.length === 0 ? (
              <p className="text-xs text-mut">Aucun message</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.direction === "outbound" ? "items-end" : "items-start"}`}>
                    <div className={`px-3 py-1.5 rounded-lg text-xs max-w-[85%] ${m.direction === "outbound" ? "bg-acc-grad text-accink" : "bg-chip text-ink"}`}>
                      {m.body}
                    </div>
                    <span className="text-[10px] text-mut mt-0.5 num">{formatMsgTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push(`/${franchiseSlug}/messages?contact=${id}`)}
              className="mt-3 text-xs text-acc hover:text-acc font-medium"
            >
              Voir la conversation →
            </button>
          </div>

          {/* Rendez-vous */}
          <div className="bg-sur rounded-xl p-4 border border-line ">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold font-display text-ink">Rendez-vous</h2>
              <button onClick={() => setShowJobModal(true)} className="text-xs text-acc hover:text-acc font-medium">+ Nouveau</button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-xs text-mut">Aucun rendez-vous</p>
            ) : (() => {
              const today = new Date().toISOString().slice(0, 10);
              const upcoming = jobs.filter(j => j.scheduled_date >= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
              const past = jobs.filter(j => j.scheduled_date < today).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
              const displayedUpcoming = showAllAdminJobs ? upcoming : upcoming.slice(0, 5);
              return (
                <div className="space-y-2">
                  {displayedUpcoming.map((j) => {
                    const jsc = JOB_STATUS_COLORS[j.status];
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const assigned = (j as any).assigned_employee_id ?? "";
                    return (
                      <div key={j.id} className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-ink">{formatDate(j.scheduled_date)}</p>
                            <p className="text-xs text-mut">{j.job_type}{j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}</p>
                          </div>
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${jsc?.bg ?? "bg-chip"} ${jsc?.text ?? "text-mut"}`}>
                            {j.status}
                          </span>
                        </div>
                        {employees.length > 0 && (
                          <select
                            value={assigned}
                            onChange={e => assignJob(j.id, e.target.value || null)}
                            className="w-full text-[10px] border border-line rounded px-1.5 py-1 text-mut bg-page focus:outline-none focus:border-acc"
                          >
                            <option value="">— Non assigné</option>
                            {employees.map(emp => (
                              <option key={emp.id} value={emp.id}>{emp.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {upcoming.length > 5 && (
                    <button
                      onClick={() => setShowAllAdminJobs(v => !v)}
                      className="text-xs text-acc hover:text-acc font-medium"
                    >
                      {showAllAdminJobs ? "Voir moins" : `Voir tous les rendez-vous (${upcoming.length})`}
                    </button>
                  )}
                  {past.length > 0 && (
                    <p className="text-[10px] text-mut pt-1">{past.length} rendez-vous passé{past.length > 1 ? "s" : ""}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Documents */}
          <div className="bg-sur rounded-xl p-4 border border-line ">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold font-display text-ink">Documents</h2>
              <button
                onClick={() => setShowDocUpload((v) => !v)}
                className="text-xs text-acc hover:text-acc font-medium"
              >
                {showDocUpload ? "Annuler" : "+ Uploader"}
              </button>
            </div>

            {showDocUpload && (
              <form onSubmit={handleDocUpload} className="bg-page rounded-lg p-3 mb-3 space-y-2">
                <div>
                  <label className="text-xs text-mut mb-0.5 block">Type de document</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as Document["doc_type"])}
                    className="w-full border border-line rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  >
                    <option value="soumission">Soumission</option>
                    <option value="contrat">Contrat</option>
                    <option value="facture">Facture</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-mut mb-0.5 block">Fichier</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    required
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-mut file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-chip file:text-ink hover:file:bg-line"
                  />
                </div>
                <button
                  type="submit"
                  disabled={uploadingDoc || !docFile}
                  className="w-full py-1.5 btn-glow text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} />
                  {uploadingDoc ? "Téléversement..." : "Téléverser"}
                </button>
              </form>
            )}

            {documents.length === 0 ? (
              <p className="text-xs text-mut">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => {
                  const dsc = DOC_STATUS_COLORS[d.status];
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-ink">{d.doc_type} #{d.doc_number}</p>
                        {d.amount != null && (
                          <p className="text-xs text-mut">
                            {d.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dsc?.bg ?? "bg-chip"} ${dsc?.text ?? "text-mut"}`}>
                          {d.status}
                        </span>
                        <button
                          onClick={async () => {
                            if (d.pdf_url) {
                              window.open(d.pdf_url, "_blank");
                            } else {
                              const res = await fetch("/api/documents/generate-pdf", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ documentId: d.id }),
                              });
                              if (res.ok) {
                                const blob = await res.blob();
                                window.open(URL.createObjectURL(blob), "_blank");
                              }
                            }
                          }}
                          className="text-acc hover:opacity-80 text-[10px] font-medium underline"
                          title="Voir le document"
                        >
                          Voir
                        </button>
                        {d.doc_type === "contrat" && (
                          <button
                            onClick={() => handleDocuSign(d.id)}
                            disabled={sendingDocuSign === d.id}
                            className="flex items-center gap-1 px-2 py-0.5 bg-purple-600 text-white text-[10px] font-medium rounded hover:bg-purple-700 disabled:opacity-50 transition"
                            title="Envoyer pour signature DocuSign"
                          >
                            <PenLine size={10} />
                            {sendingDocuSign === d.id ? "..." : "Signer"}
                          </button>
                        )}
                        {d.pdf_url && (
                          <a
                            href={d.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-acc hover:opacity-80"
                            title="Télécharger"
                          >
                            <Download size={13} />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Paiements */}
          <div className="bg-sur rounded-xl p-4 border border-line ">
            {newPayToast && (
              <div className="mb-3 bg-pos/10 border border-pos/30 rounded-lg px-3 py-2 text-xs text-pos font-medium">
                Demande de paiement créée! Le client peut payer depuis son portail.
              </div>
            )}

            <h2 className="text-sm font-bold font-display text-ink mb-3">Paiements</h2>

            {/* Mini stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-page rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-ink num">{totalDemandedAmount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-mut mt-0.5">Total demandé</p>
              </div>
              <div className="bg-pos/10 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-pos num">{totalPaidAmount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-mut mt-0.5">Payé</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${resteAPayer > 0 ? "bg-neg/10" : "bg-pos/10"}`}>
                <p className={`text-xs font-bold ${resteAPayer > 0 ? "text-neg num" : "text-pos num"}`}>{Math.max(0, resteAPayer).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-mut mt-0.5">Restant</p>
              </div>
            </div>

            {/* New demand button */}
            <button
              onClick={() => setShowNewPayForm(v => !v)}
              className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 btn-glow text-xs font-medium rounded-lg hover:opacity-90 transition"
            >
              <CreditCard size={12} />
              {showNewPayForm ? "Annuler" : "+ Nouvelle demande de paiement"}
            </button>

            {showNewPayForm && (() => {
              const cat = PAYMENT_CATEGORIES.find(c => c.value === newPayCategory);
              return (
                <form onSubmit={handleNewPaySubmit} className="bg-chip border border-line rounded-lg p-3 mb-3 space-y-2.5">
                  {/* Category */}
                  <div>
                    <label className="text-xs text-mut font-medium mb-1 block">Catégorie</label>
                    <select
                      value={newPayCategory}
                      onChange={(e) => {
                        const c = PAYMENT_CATEGORIES.find(x => x.value === e.target.value);
                        setNewPayCategory(e.target.value);
                        if (c && c.price > 0) setNewPayAmount(String(c.price));
                        else setNewPayAmount("");
                        setNewPayDescription(c?.label || "");
                        setNewPaySplit(c?.isEntretien ?? false);
                      }}
                      className="w-full border border-line rounded px-2 py-1.5 text-xs bg-sur focus:outline-none focus:ring-2 focus:ring-acc/30"
                    >
                      {PAYMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs text-mut font-medium mb-1 block">Description</label>
                    <input
                      type="text"
                      value={newPayDescription}
                      onChange={(e) => setNewPayDescription(e.target.value)}
                      className="w-full border border-line rounded px-2 py-1.5 text-xs bg-sur focus:outline-none focus:ring-2 focus:ring-acc/30"
                      placeholder="Description du paiement"
                    />
                  </div>

                  {/* Amount + Due date */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-mut font-medium mb-1 block">Montant ($)</label>
                      <input
                        type="number" min="0" step="0.01" required
                        value={newPayAmount}
                        onChange={(e) => setNewPayAmount(e.target.value)}
                        className="w-full border border-line rounded px-2 py-1.5 text-xs bg-sur focus:outline-none focus:ring-2 focus:ring-acc/30"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-mut font-medium mb-1 block">Date d&apos;échéance</label>
                      <input
                        type="date"
                        value={newPayDueDate}
                        onChange={(e) => setNewPayDueDate(e.target.value)}
                        className="w-full border border-line rounded px-2 py-1.5 text-xs bg-sur focus:outline-none focus:ring-2 focus:ring-acc/30"
                      />
                    </div>
                  </div>

                  {/* Split versements (entretien only) */}
                  {(cat?.isEntretien || cat?.label?.toLowerCase().includes("ouverture")) && (
                    <div className="space-y-2.5">
                      {cat?.isEntretien && (
                        <label className="flex items-center gap-2 text-xs text-ink cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newPaySplit}
                            onChange={(e) => setNewPaySplit(e.target.checked)}
                            className="rounded"
                          />
                          Séparer en 2 versements (50% maintenant, 50% mi-juillet)
                        </label>
                      )}

                      {/* Date d'ouverture */}
                      <div>
                        <label className="text-xs text-mut font-medium mb-1 block">Date d&apos;ouverture</label>
                        <input
                          type="date"
                          value={newPayOuvertureDate || (contact?.ouverture_date ?? "")}
                          onChange={(e) => setNewPayOuvertureDate(e.target.value)}
                          className="w-full border border-line rounded px-2 py-1.5 text-xs bg-sur focus:outline-none focus:ring-2 focus:ring-acc/30"
                        />
                        {cat?.isEntretien && (
                          <p className="text-[10px] text-mut mt-0.5">Le premier entretien sera planifié 1 semaine après cette date.</p>
                        )}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingNewPay}
                    className="w-full py-2 btn-glow text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition"
                  >
                    {savingNewPay ? "Création..." : "Créer la demande de paiement"}
                  </button>
                </form>
              );
            })()}

            {/* Payment list */}
            {payments.length === 0 ? (
              <p className="text-xs text-mut">Aucun paiement</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => {
                  const statusColors: Record<string, string> = {
                    en_attente: "bg-warn/10 text-warn",
                    reçu: "bg-pos/10 text-pos",
                    en_retard: "bg-neg/10 text-neg",
                  };
                  const mb = METHOD_BADGES[p.method] ?? METHOD_BADGES.autre;
                  return (
                    <div key={p.id} className="flex items-start justify-between gap-2 group py-1.5 border-b border-line last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[p.status] ?? "bg-chip text-mut"}`}>
                            {p.status === "en_attente" ? "En attente" : p.status === "reçu" ? "Reçu" : p.status}
                          </span>
                          <span className="text-xs font-bold text-ink num">
                            {p.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                          </span>
                          {p.status === "reçu" && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${mb.bg} ${mb.text}`}>{mb.label}</span>
                          )}
                        </div>
                        {p.notes && <p className="text-[10px] text-mut mt-0.5 truncate">{p.notes}</p>}
                        {p.due_date && p.status === "en_attente" && (
                          <p className="text-[10px] text-mut">Échéance: {formatDate(p.due_date)}</p>
                        )}
                        {p.received_date && p.status === "reçu" && (
                          <p className="text-[10px] text-mut">Reçu le {formatDate(p.received_date)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        {p.status === "en_attente" && (
                          <div className="relative">
                            <button
                              onClick={() => setMarkPaidId(markPaidId === p.id ? null : p.id)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-pos bg-pos/10 border border-pos/30 rounded-md hover:bg-pos/20 transition"
                            >
                              <CheckCircle size={10} />
                              Payé
                            </button>
                            {markPaidId === p.id && (
                              <div className="absolute right-0 top-full mt-1 bg-sur border border-line rounded-lg  z-20 min-w-[100px] py-1">
                                {["interac", "cash", "stripe"].map(m => (
                                  <button
                                    key={m}
                                    onClick={() => handleMarkPaid(p.id, m as Payment["method"])}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-chip capitalize"
                                  >
                                    {m === "stripe" ? "Carte" : m.charAt(0).toUpperCase() + m.slice(1)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => handleDeletePayment(p.id)}
                          className="opacity-0 group-hover:opacity-100 transition text-mut hover:text-neg"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Analyses d'eau */}
          <div className="bg-sur rounded-xl p-4 border border-line ">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold font-display text-ink">Analyses d&apos;eau</h2>
              <button onClick={() => setShowWaterForm(v => !v)}
                className="text-xs px-2 py-1 bg-chip text-acc rounded hover:bg-acc/10">
                {showWaterForm ? "Annuler" : "+ Ajouter"}
              </button>
            </div>
            {showWaterForm && (
              <div className="mb-3 p-3 bg-chip rounded-lg border border-line space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: "ph", label: "pH", hint: "7.2–7.6" },
                    { key: "alkalinity", label: "Alcalinité", hint: "80–120 ppm" },
                    { key: "chlorine", label: "Chlore libre", hint: "1–3 ppm" },
                    { key: "calcium_hardness", label: "Dureté calcique", hint: "200–400 ppm" },
                    { key: "stabilizer", label: "Stabilisant", hint: "30–50 ppm" },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] text-mut mb-0.5">{f.label} <span className="text-mut">({f.hint})</span></label>
                      <input type="number" step="0.1"
                        value={waterForm[f.key as keyof typeof waterForm]}
                        onChange={e => setWaterForm(p => ({ ...p, [f.key]: e.target.value }))}
                        className="w-full px-2 py-1 text-xs border border-line rounded focus:outline-none focus:border-acc"
                        placeholder="—" />
                    </div>
                  ))}
                </div>
                <input type="text" value={waterForm.notes}
                  onChange={e => setWaterForm(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-2 py-1.5 text-xs border border-line rounded focus:outline-none focus:border-acc"
                  placeholder="Notes optionnelles..." />
                <button disabled={savingWater}
                  onClick={async () => {
                    setSavingWater(true);
                    await fetch("/api/water-tests", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ contact_id: id, ...waterForm }),
                    });
                    setSavingWater(false);
                    setShowWaterForm(false);
                    setWaterForm({ ph: "", alkalinity: "", chlorine: "", calcium_hardness: "", stabilizer: "", notes: "" });
                    loadWaterTests();
                  }}
                  className="w-full py-1.5 btn-glow text-xs font-medium rounded hover:opacity-90 disabled:opacity-50">
                  {savingWater ? "Sauvegarde..." : "Enregistrer l'analyse"}
                </button>
              </div>
            )}
            {waterTests.length === 0 ? (
              <p className="text-xs text-mut">Aucune analyse enregistrée</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {waterTests.map((t) => {
                  const dt = new Date(t.tested_at).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
                  const params = [
                    { k: "pH", v: t.ph, min: 7.2, max: 7.6 },
                    { k: "Alc", v: t.alkalinity, min: 80, max: 120 },
                    { k: "Cl", v: t.chlorine, min: 1, max: 3 },
                    { k: "Ca", v: t.calcium_hardness, min: 200, max: 400 },
                    { k: "Stab", v: t.stabilizer, min: 30, max: 50 },
                  ];
                  return (
                    <div key={t.id} className="border border-line rounded-lg p-2">
                      <p className="text-[10px] text-mut mb-1">{dt}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {params.map(p => {
                          if (p.v === null || p.v === undefined) return null;
                          const ok = p.v >= p.min && p.v <= p.max;
                          const warn = !ok && p.v >= p.min * 0.8 && p.v <= p.max * 1.3;
                          const color = ok ? "bg-pos/10 text-pos" : warn ? "bg-warn/10 text-warn" : "bg-neg/10 text-neg";
                          return (
                            <span key={p.k} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>
                              {p.k}: {p.v}
                            </span>
                          );
                        })}
                      </div>
                      {t.notes && <p className="text-[10px] text-mut mt-1">{t.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showStageDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowStageDropdown(false)} />
      )}

      {/* DocuSign toast */}
      {docuSignToast && (
        <div className={`fixed bottom-20 right-6 z-50 px-5 py-3 rounded-xl text-sm font-medium flex items-center gap-2 ${
          docuSignToast === "success" ? "bg-purple-600 text-white" : "bg-neg text-white"
        }`}>
          <PenLine size={16} />
          {docuSignToast === "success"
            ? "Contrat envoyé pour signature via DocuSign!"
            : docuSignToast === "error:email"
            ? "Le client n'a pas d'adresse courriel"
            : "Erreur DocuSign — vérifie la connexion"}
        </div>
      )}

      {/* Job modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-sur rounded-xl border border-line w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-line">
              <h2 className="text-base font-bold font-display text-ink">Nouveau rendez-vous</h2>
              <button onClick={() => setShowJobModal(false)} className="text-mut hover:text-ink text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleJobCreate} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Type</label>
                <select
                  value={jobForm.job_type}
                  onChange={(e) => setJobForm((p) => ({ ...p, job_type: e.target.value as Job["job_type"] }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                >
                  <option value="ouverture">Ouverture</option>
                  <option value="entretien">Entretien</option>
                  <option value="fermeture">Fermeture</option>
                  <option value="visite">Visite</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Date</label>
                <input
                  type="date" value={jobForm.scheduled_date} required
                  onChange={(e) => setJobForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Heure début</label>
                  <input
                    type="time" value={jobForm.scheduled_time_start}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_start: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-mut mb-1 block">Heure fin</label>
                  <input
                    type="time" value={jobForm.scheduled_time_end}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_end: e.target.value }))}
                    className="w-full border border-line rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-acc/30"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-mut mb-1 block">Notes</label>
                <textarea
                  rows={3} value={jobForm.notes}
                  onChange={(e) => setJobForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-line rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-acc/30"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowJobModal(false)} className="px-4 py-2 text-sm text-mut hover:text-ink transition">
                  Annuler
                </button>
                <button type="submit" disabled={savingJob} className="px-5 py-2 btn-glow text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-50 transition">
                  {savingJob ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
