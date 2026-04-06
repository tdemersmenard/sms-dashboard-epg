"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, CalendarPlus, ChevronDown, Upload, Download, Trash2, CheckCircle, PenLine, Globe, Copy, X, CreditCard } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Contact, Job, Document, Payment, Message } from "@/lib/types";

const STAGES = [
  "nouveau", "contacté", "soumission envoyée", "closé",
  "planifié", "complété", "perdu",
] as const;

const STAGE_COLORS: Record<string, { bg: string; text: string }> = {
  "nouveau":            { bg: "bg-blue-100",   text: "text-blue-700" },
  "contacté":           { bg: "bg-yellow-100", text: "text-yellow-700" },
  "soumission envoyée": { bg: "bg-orange-100", text: "text-orange-700" },
  "closé":              { bg: "bg-green-100",  text: "text-green-700" },
  "planifié":           { bg: "bg-purple-100", text: "text-purple-700" },
  "complété":           { bg: "bg-gray-200",   text: "text-gray-700" },
  "perdu":              { bg: "bg-red-100",    text: "text-red-700" },
};

const JOB_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  planifié:  { bg: "bg-blue-100",   text: "text-blue-700" },
  confirmé:  { bg: "bg-green-100",  text: "text-green-700" },
  en_cours:  { bg: "bg-yellow-100", text: "text-yellow-700" },
  complété:  { bg: "bg-gray-200",   text: "text-gray-700" },
  annulé:    { bg: "bg-red-100",    text: "text-red-700" },
};

const DOC_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  brouillon: { bg: "bg-gray-100",   text: "text-gray-600" },
  envoyé:    { bg: "bg-blue-100",   text: "text-blue-700" },
  signé:     { bg: "bg-green-100",  text: "text-green-700" },
  payé:      { bg: "bg-purple-100", text: "text-purple-700" },
};

const METHOD_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  interac:    { bg: "bg-blue-100",   text: "text-blue-700",   label: "Interac" },
  cash:       { bg: "bg-green-100",  text: "text-green-700",  label: "Cash" },
  cheque:     { bg: "bg-gray-100",   text: "text-gray-600",   label: "Chèque" },
  carte:      { bg: "bg-purple-100", text: "text-purple-700", label: "Carte" },
  autre:      { bg: "bg-gray-100",   text: "text-gray-500",   label: "Autre" },
  en_attente: { bg: "bg-yellow-100", text: "text-yellow-700", label: "En attente" },
  stripe:     { bg: "bg-indigo-100", text: "text-indigo-700", label: "Stripe" },
};

const DOC_PREFIX: Record<string, string> = {
  soumission: "S",
  contrat: "C",
  facture: "F",
};

const CLOSE_SERVICES = [
  { label: "Ouverture hors-terre", value: "ouverture hors-terre", price: 180, jobType: "ouverture", docType: "facture" as const },
  { label: "Ouverture creusée", value: "ouverture creusée", price: 200, jobType: "ouverture", docType: "facture" as const },
  { label: "Fermeture hors-terre", value: "fermeture hors-terre", price: 150, jobType: "fermeture", docType: "facture" as const },
  { label: "Fermeture creusée", value: "fermeture creusée", price: 175, jobType: "fermeture", docType: "facture" as const },
  { label: "Entretien hebdo hors-terre", value: "entretien hebdo hors-terre", price: 2000, jobType: "entretien", docType: "contrat" as const },
  { label: "Entretien hebdo creusée", value: "entretien hebdo creusée", price: 2200, jobType: "entretien", docType: "contrat" as const },
  { label: "Entretien aux 2 semaines", value: "entretien aux 2 semaines", price: 1200, jobType: "entretien", docType: "contrat" as const },
];

type PayCat = { label: string; value: string; price: number; service: string; isEntretien: boolean; freq: "weekly" | "biweekly" | null };
const PAYMENT_CATEGORIES: PayCat[] = [
  { label: "Entretien hebdomadaire hors-terre (2,000$)", value: "entretien-hebdo-hors-terre", price: 2000, service: "entretien hebdo hors-terre", isEntretien: true, freq: "weekly" },
  { label: "Entretien hebdomadaire creusée (2,200$)",   value: "entretien-hebdo-creusee",     price: 2200, service: "entretien hebdo creusée",    isEntretien: true, freq: "weekly" },
  { label: "Entretien aux 2 semaines (1,200$)",         value: "entretien-2semaines",         price: 1200, service: "entretien aux 2 semaines",   isEntretien: true, freq: "biweekly" },
  { label: "Ouverture hors-terre (180$)",               value: "ouverture-hors-terre",        price: 180,  service: "ouverture hors-terre",        isEntretien: false, freq: null },
  { label: "Ouverture creusée (200$)",                  value: "ouverture-creusee",           price: 200,  service: "ouverture creusée",           isEntretien: false, freq: null },
  { label: "Fermeture hors-terre (150$)",               value: "fermeture-hors-terre",        price: 150,  service: "fermeture hors-terre",        isEntretien: false, freq: null },
  { label: "Fermeture creusée (175$)",                  value: "fermeture-creusee",           price: 175,  service: "fermeture creusée",           isEntretien: false, freq: null },
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
  return new Date(d).toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" });
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
      <p className="text-xs font-medium text-gray-500 mb-0.5">{label}</p>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
          className="w-full border border-blue-300 rounded-md px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      ) : (
        <p
          onClick={() => setEditing(true)}
          className="text-sm text-gray-900 cursor-pointer hover:bg-gray-50 rounded px-2 py-1 -mx-2 min-h-[28px] flex items-center"
        >
          {draft || <span className="text-gray-300 italic">—</span>}
        </p>
      )}
    </div>
  );
}

export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { id } = params;

  const [contact, setContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showStageDropdown, setShowStageDropdown] = useState(false);
  const [showAllAdminJobs, setShowAllAdminJobs] = useState(false);

  // Job modal
  const [showJobModal, setShowJobModal] = useState(false);
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

  // Close modal
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [savingClose, setSavingClose] = useState(false);
  const [closeToast, setCloseToast] = useState(false);
  const [closeForm, setCloseForm] = useState({
    service: CLOSE_SERVICES[0].value,
    price: CLOSE_SERVICES[0].price,
    method: "interac" as "interac" | "cash",
    scheduled_date: new Date().toISOString().slice(0, 10),
    scheduled_time: "08:00",
    notes: "",
    sendDocuSign: true,
  });

  // DocuSign
  const [sendingDocuSign, setSendingDocuSign] = useState<string | null>(null);
  const [docuSignToast, setDocuSignToast] = useState<string | null>(null);

  // Portail client
  const [showPortalModal, setShowPortalModal] = useState(false);
  const [portalPassword, setPortalPassword] = useState("");
  const [portalCreating, setPortalCreating] = useState(false);
  const [portalDone, setPortalDone] = useState(false);
  const [portalCopied, setPortalCopied] = useState(false);

  const openPortalModal = () => {
    // Generate random 8-char password
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
    const pwd = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
    setPortalPassword(pwd);
    setPortalDone(false);
    setPortalCopied(false);
    setShowPortalModal(true);
  };

  const handleCreatePortalAccess = async () => {
    if (!contact?.email) return;
    setPortalCreating(true);
    await fetch("/api/portail/setup-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: id, password: portalPassword }),
    });
    setPortalCreating(false);
    setPortalDone(true);
  };

  const handleSendPortalSMS = async () => {
    if (!contact?.email) return;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
    const msg = `Bonjour ${contact.first_name || ""}! Votre portail client Entretien Piscine Granby est prêt. Connectez-vous à ${appUrl}/portail avec votre courriel et le mot de passe: ${portalPassword}`;
    await fetch("/api/sms/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: id, body: msg }),
    });
  };

  const handleCloseClient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingClose(true);
    const svc = CLOSE_SERVICES.find((s) => s.value === closeForm.service) ?? CLOSE_SERVICES[0];

    try {
      // 1. Update contact stage + season_price
      await supabaseBrowser.from("contacts").update({
        stage: "closé",
        season_price: closeForm.price,
      }).eq("id", id);

      // 2. Create job
      const endHour = parseInt(closeForm.scheduled_time.split(":")[0]) + 2;
      const endTime = `${String(endHour).padStart(2, "0")}:${closeForm.scheduled_time.split(":")[1]}`;
      await supabaseBrowser.from("jobs").insert({
        contact_id: id,
        job_type: svc.jobType,
        scheduled_date: closeForm.scheduled_date,
        scheduled_time_start: closeForm.scheduled_time,
        scheduled_time_end: endTime,
        status: "confirmé",
        notes: closeForm.notes || null,
      });

      // 3. Create document
      const { count } = await supabaseBrowser
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("doc_type", svc.docType);
      const prefix = svc.docType === "facture" ? "F" : "C";
      const docNumber = `${prefix}-2026-${String((count ?? 0) + 1).padStart(3, "0")}`;
      const firstPayment = Math.ceil(closeForm.price / 2);
      const secondPayment = closeForm.price - firstPayment;
      const paymentTerms = svc.docType === "contrat"
        ? `Versement 1: ${firstPayment}$ à la signature. Versement 2: ${secondPayment}$ mi-juillet 2026.`
        : `Paiement complet de ${closeForm.price}$ requis avant le service.`;

      const { data: newDoc } = await supabaseBrowser.from("documents").insert({
        contact_id: id,
        doc_type: svc.docType,
        doc_number: docNumber,
        amount: closeForm.price,
        status: closeForm.method === "interac" && contact?.email ? "envoyé" : "brouillon",
        data: {
          service: closeForm.service,
          client_name: contact ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") : "",
          client_email: contact?.email,
          client_phone: contact?.phone,
          client_address: contact?.address,
          payment_terms: paymentTerms,
        },
      }).select().single();

      // 4. Send email if interac + has email
      if (closeForm.method === "interac" && contact?.email && newDoc) {
        await fetch("/api/email/send-document", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: newDoc.id, contactId: id }),
        }).catch(console.error);
      }

      // 5. Generate and open PDF in new tab
      if (newDoc) {
        const res = await fetch("/api/documents/generate-pdf", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: newDoc.id }),
        });
        if (res.ok) {
          const blob = await res.blob();
          window.open(URL.createObjectURL(blob), "_blank");
        }
      }

      // 6. Send to DocuSign if it's a contract and checkbox is checked
      if (newDoc && svc.docType === "contrat" && closeForm.sendDocuSign) {
        await fetch("/api/docusign/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: newDoc.id }),
        }).catch(console.error);
      }

      // 6. Reload data + show toast
      await load();
      setShowCloseModal(false);
      setCloseToast(true);
      setTimeout(() => setCloseToast(false), 4000);
    } catch (err) {
      console.error("[close-client]", err);
      alert("Erreur lors du closing. Réessaie.");
    }
    setSavingClose(false);
  };

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
  const [newPayCalDay, setNewPayCalDay] = useState(4);
  const [newPayCalTime, setNewPayCalTime] = useState("09:00");
  const [newPayCalFreq, setNewPayCalFreq] = useState<"weekly" | "biweekly">("weekly");
  const [newPayCalGenerated, setNewPayCalGenerated] = useState(false);
  const [newPayCalCount, setNewPayCalCount] = useState(0);
  const [savingNewPay, setSavingNewPay] = useState(false);
  const [newPayToast, setNewPayToast] = useState(false);
  const [markPaidId, setMarkPaidId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: c }, m, { data: j }, { data: d }, { data: p }] = await Promise.all([
      supabaseBrowser.from("contacts").select("*").eq("id", id).single(),
      fetch(`/api/messages?contactId=${id}`).then((r) => r.json()).catch(() => []),
      supabaseBrowser.from("jobs").select("*").eq("contact_id", id).order("scheduled_date"),
      supabaseBrowser.from("documents").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
      supabaseBrowser.from("payments").select("*").eq("contact_id", id).order("created_at", { ascending: false }),
    ]);
    if (c) setContact(c as Contact);
    setMessages(Array.isArray(m) ? (m as Message[]).slice(-5) : []);
    setJobs((j ?? []) as Job[]);
    setDocuments((d ?? []) as Document[]);
    setPayments((p ?? []) as Payment[]);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

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
    const { data } = await supabaseBrowser
      .from("jobs")
      .insert({ contact_id: id, status: "planifié", ...jobForm })
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
    setPayments((prev) => prev.filter((p) => p.id !== paymentId));
    await supabaseBrowser.from("payments").delete().eq("id", paymentId);
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

  const handleGenerateCalFromNewPay = async () => {
    const year = new Date().getFullYear();
    const startDate = new Date(year, 3, 15);
    const endDate = new Date(year, 8, 30);
    const current = new Date(startDate);
    const dayDiff = (newPayCalDay - current.getDay() + 7) % 7;
    current.setDate(current.getDate() + dayDiff);
    const existingDates = new Set(jobs.filter(j => j.job_type === "entretien").map(j => j.scheduled_date));
    const interval = newPayCalFreq === "weekly" ? 7 : 14;
    const toInsert: { contact_id: string; job_type: string; scheduled_date: string; scheduled_time_start: string; status: string }[] = [];
    while (current <= endDate) {
      const dateStr = current.toISOString().split("T")[0];
      if (!existingDates.has(dateStr)) {
        toInsert.push({ contact_id: id, job_type: "entretien", scheduled_date: dateStr, scheduled_time_start: newPayCalTime, status: "planifié" });
      }
      current.setDate(current.getDate() + interval);
    }
    if (toInsert.length > 0) await supabaseBrowser.from("jobs").insert(toInsert);
    await load();
    setNewPayCalGenerated(true);
    setNewPayCalCount(toInsert.length);
  };

  const handleNewPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPayAmount) return;
    setSavingNewPay(true);
    const amount = parseFloat(newPayAmount);
    const cat = PAYMENT_CATEGORIES.find(c => c.value === newPayCategory);
    const desc = newPayDescription || cat?.label || "Service de piscine";

    if (newPaySplit && cat?.isEntretien) {
      const half1 = Math.ceil(amount / 2);
      const half2 = amount - half1;
      await supabaseBrowser.from("payments").insert([
        { contact_id: id, amount: half1, method: "en_attente" as Payment["method"], status: "en_attente", due_date: newPayDueDate, notes: `${desc} — Versement 1/2` },
        { contact_id: id, amount: half2, method: "en_attente" as Payment["method"], status: "en_attente", due_date: "2026-07-15", notes: `${desc} — Versement 2/2` },
      ]);
    } else {
      await supabaseBrowser.from("payments").insert({
        contact_id: id, amount, method: "en_attente" as Payment["method"], status: "en_attente", due_date: newPayDueDate, notes: desc,
      });
    }

    const updatedServices = cat?.service
      ? Array.from(new Set([...(contact?.services || []), cat.service]))
      : (contact?.services || []);
    await supabaseBrowser.from("contacts").update({ stage: "closé", services: updatedServices, season_price: amount }).eq("id", id);

    await load();
    setSavingNewPay(false);
    setShowNewPayForm(false);
    setNewPayToast(true);
    setNewPayCalGenerated(false);
    setNewPayCalCount(0);
    setTimeout(() => setNewPayToast(false), 4000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!contact) {
    return <div className="p-8 text-gray-500">Contact introuvable.</div>;
  }

  const stage = contact.stage ?? "nouveau";
  const sc = STAGE_COLORS[stage];

  const totalPaidAmount = payments.filter((p) => p.status === "reçu").reduce((s, p) => s + p.amount, 0);
  const totalDemandedAmount = payments.reduce((s, p) => s + p.amount, 0);
  const resteAPayer = totalDemandedAmount - totalPaidAmount;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600 text-lg">←</button>
          <h1 className="text-xl font-bold text-gray-900 truncate">{displayName(contact)}</h1>
          {/* Stage dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowStageDropdown((v) => !v)}
              className={`flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${sc?.bg ?? "bg-gray-100"} ${sc?.text ?? "text-gray-600"}`}
            >
              {stage}
              <ChevronDown size={12} />
            </button>
            {showStageDropdown && (
              <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[160px] py-1">
                {STAGES.map((s) => {
                  const c2 = STAGE_COLORS[s];
                  return (
                    <button
                      key={s}
                      onClick={() => handleStageChange(s)}
                      className="w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-gray-50 flex items-center gap-2"
                    >
                      <span className={`w-2 h-2 rounded-full ${c2?.bg ?? "bg-gray-200"}`} />
                      {s}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={openPortalModal}
            className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition"
          >
            <Globe size={15} />
            Portail
          </button>
          <button
            onClick={() => router.push(`/messages?contact=${id}`)}
            className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <MessageSquare size={15} />
            SMS
          </button>
          <button
            onClick={() => setShowJobModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#0a1f3f] text-white rounded-lg text-sm font-medium hover:bg-[#0f2855] transition"
          >
            <CalendarPlus size={15} />
            Créer RDV
          </button>
          <button
            onClick={() => setShowCloseModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
          >
            <CheckCircle size={15} />
            Closer
          </button>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* LEFT */}
        <div className="lg:col-span-3 space-y-4">
          {/* Informations */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Informations</h2>
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
            </div>
          </div>

          {/* Piscine */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-4">Piscine</h2>
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Type</p>
                <select
                  value={contact.pool_type ?? ""}
                  onChange={(e) => save({ pool_type: (e.target.value as "hors-terre" | "creusée") || null })}
                  className="w-full border border-gray-200 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="">—</option>
                  <option value="hors-terre">Hors-terre</option>
                  <option value="creusée">Creusée</option>
                </select>
              </div>
              <InlineField label="Dimensions" value={contact.pool_dimensions ?? ""} onSave={(v) => save({ pool_dimensions: v })} />
              <InlineField label="Système" value={contact.pool_system ?? ""} onSave={(v) => save({ pool_system: v })} />
              <div>
                <p className="text-xs font-medium text-gray-500 mb-0.5">Spa</p>
                <button
                  onClick={() => save({ has_spa: !contact.has_spa })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${contact.has_spa ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${contact.has_spa ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Notes</h2>
            <textarea
              defaultValue={contact.notes ?? ""}
              onBlur={(e) => save({ notes: e.target.value || null })}
              rows={4}
              placeholder="Notes internes..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="lg:col-span-2 space-y-4">
          {/* Messages récents */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <h2 className="text-sm font-bold text-gray-800 mb-3">Messages récents</h2>
            {messages.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun message</p>
            ) : (
              <div className="space-y-2">
                {messages.map((m) => (
                  <div key={m.id} className={`flex flex-col ${m.direction === "outbound" ? "items-end" : "items-start"}`}>
                    <div className={`px-3 py-1.5 rounded-lg text-xs max-w-[85%] ${m.direction === "outbound" ? "bg-[#0a1f3f] text-white" : "bg-gray-100 text-gray-800"}`}>
                      {m.body}
                    </div>
                    <span className="text-[10px] text-gray-400 mt-0.5">{formatMsgTime(m.created_at)}</span>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => router.push("/messages")}
              className="mt-3 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Voir la conversation →
            </button>
          </div>

          {/* Rendez-vous */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">Rendez-vous</h2>
              <button onClick={() => setShowJobModal(true)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Nouveau</button>
            </div>
            {jobs.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun rendez-vous</p>
            ) : (() => {
              const today = new Date().toISOString().slice(0, 10);
              const upcoming = jobs.filter(j => j.scheduled_date >= today).sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date));
              const past = jobs.filter(j => j.scheduled_date < today).sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date));
              const displayedUpcoming = showAllAdminJobs ? upcoming : upcoming.slice(0, 5);
              return (
                <div className="space-y-2">
                  {displayedUpcoming.map((j) => {
                    const jsc = JOB_STATUS_COLORS[j.status];
                    return (
                      <div key={j.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800">{formatDate(j.scheduled_date)}</p>
                          <p className="text-xs text-gray-500">{j.job_type}{j.scheduled_time_start ? ` · ${j.scheduled_time_start}` : ""}</p>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${jsc?.bg ?? "bg-gray-100"} ${jsc?.text ?? "text-gray-600"}`}>
                          {j.status}
                        </span>
                      </div>
                    );
                  })}
                  {upcoming.length > 5 && (
                    <button
                      onClick={() => setShowAllAdminJobs(v => !v)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      {showAllAdminJobs ? "Voir moins" : `Voir tous les rendez-vous (${upcoming.length})`}
                    </button>
                  )}
                  {past.length > 0 && (
                    <p className="text-[10px] text-gray-400 pt-1">{past.length} rendez-vous passé{past.length > 1 ? "s" : ""}</p>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Documents */}
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold text-gray-800">Documents</h2>
              <button
                onClick={() => setShowDocUpload((v) => !v)}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                {showDocUpload ? "Annuler" : "+ Uploader"}
              </button>
            </div>

            {showDocUpload && (
              <form onSubmit={handleDocUpload} className="bg-gray-50 rounded-lg p-3 mb-3 space-y-2">
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">Type de document</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as Document["doc_type"])}
                    className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <option value="soumission">Soumission</option>
                    <option value="contrat">Contrat</option>
                    <option value="facture">Facture</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 mb-0.5 block">Fichier</label>
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    required
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="w-full text-xs text-gray-600 file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-gray-200 file:text-gray-700 hover:file:bg-gray-300"
                  />
                </div>
                <button
                  type="submit"
                  disabled={uploadingDoc || !docFile}
                  className="w-full py-1.5 bg-[#0a1f3f] text-white text-xs font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition flex items-center justify-center gap-1.5"
                >
                  <Upload size={12} />
                  {uploadingDoc ? "Téléversement..." : "Téléverser"}
                </button>
              </form>
            )}

            {documents.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun document</p>
            ) : (
              <div className="space-y-2">
                {documents.map((d) => {
                  const dsc = DOC_STATUS_COLORS[d.status];
                  return (
                    <div key={d.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-800">{d.doc_type} #{d.doc_number}</p>
                        {d.amount != null && (
                          <p className="text-xs text-gray-500">
                            {d.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${dsc?.bg ?? "bg-gray-100"} ${dsc?.text ?? "text-gray-600"}`}>
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
                          className="text-blue-500 hover:text-blue-700 text-[10px] font-medium underline"
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
                            className="text-blue-500 hover:text-blue-700"
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
          <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
            {newPayToast && (
              <div className="mb-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 font-medium">
                Demande de paiement créée! Le client peut payer depuis son portail.
              </div>
            )}

            <h2 className="text-sm font-bold text-gray-800 mb-3">Paiements</h2>

            {/* Mini stats */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-gray-900">{totalDemandedAmount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Total demandé</p>
              </div>
              <div className="bg-green-50 rounded-lg p-2 text-center">
                <p className="text-xs font-bold text-green-600">{totalPaidAmount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Payé</p>
              </div>
              <div className={`rounded-lg p-2 text-center ${resteAPayer > 0 ? "bg-red-50" : "bg-green-50"}`}>
                <p className={`text-xs font-bold ${resteAPayer > 0 ? "text-red-600" : "text-green-600"}`}>{Math.max(0, resteAPayer).toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}</p>
                <p className="text-[10px] text-gray-500 mt-0.5">Restant</p>
              </div>
            </div>

            {/* New demand button */}
            <button
              onClick={() => setShowNewPayForm(v => !v)}
              className="w-full mb-3 flex items-center justify-center gap-1.5 py-2 bg-[#0a1f3f] text-white text-xs font-medium rounded-lg hover:bg-[#0f2855] transition"
            >
              <CreditCard size={12} />
              {showNewPayForm ? "Annuler" : "+ Nouvelle demande de paiement"}
            </button>

            {showNewPayForm && (() => {
              const cat = PAYMENT_CATEGORIES.find(c => c.value === newPayCategory);
              return (
                <form onSubmit={handleNewPaySubmit} className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3 space-y-2.5">
                  {/* Category */}
                  <div>
                    <label className="text-xs text-gray-600 font-medium mb-1 block">Catégorie</label>
                    <select
                      value={newPayCategory}
                      onChange={(e) => {
                        const c = PAYMENT_CATEGORIES.find(x => x.value === e.target.value);
                        setNewPayCategory(e.target.value);
                        if (c && c.price > 0) setNewPayAmount(String(c.price));
                        else setNewPayAmount("");
                        setNewPayDescription(c?.label || "");
                        if (c?.freq) setNewPayCalFreq(c.freq);
                        setNewPaySplit(c?.isEntretien ?? false);
                        setNewPayCalGenerated(false);
                      }}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                    >
                      {PAYMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>

                  {/* Description */}
                  <div>
                    <label className="text-xs text-gray-600 font-medium mb-1 block">Description</label>
                    <input
                      type="text"
                      value={newPayDescription}
                      onChange={(e) => setNewPayDescription(e.target.value)}
                      className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Description du paiement"
                    />
                  </div>

                  {/* Amount + Due date */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-gray-600 font-medium mb-1 block">Montant ($)</label>
                      <input
                        type="number" min="0" step="0.01" required
                        value={newPayAmount}
                        onChange={(e) => setNewPayAmount(e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 font-medium mb-1 block">Date d&apos;échéance</label>
                      <input
                        type="date"
                        value={newPayDueDate}
                        onChange={(e) => setNewPayDueDate(e.target.value)}
                        className="w-full border border-gray-200 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
                      />
                    </div>
                  </div>

                  {/* Split versements (entretien only) */}
                  {cat?.isEntretien && (
                    <div className="space-y-2.5">
                      <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newPaySplit}
                          onChange={(e) => setNewPaySplit(e.target.checked)}
                          className="rounded"
                        />
                        Séparer en 2 versements (50% maintenant, 50% mi-juillet)
                      </label>

                      {/* Calendar generation */}
                      <div className="bg-white rounded-lg border border-blue-200 p-3 space-y-2">
                        <p className="text-xs font-semibold text-gray-700">Planifier les passages</p>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-gray-500 mb-0.5 block">Jour</label>
                            <select
                              value={newPayCalDay}
                              onChange={(e) => setNewPayCalDay(parseInt(e.target.value))}
                              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                            >
                              {["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"].map((d, i) => (
                                <option key={i} value={i}>{d}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-gray-500 mb-0.5 block">Heure</label>
                            <input
                              type="time"
                              value={newPayCalTime}
                              onChange={(e) => setNewPayCalTime(e.target.value)}
                              className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-gray-500 mb-0.5 block">Fréquence</label>
                          <select
                            value={newPayCalFreq}
                            onChange={(e) => setNewPayCalFreq(e.target.value as "weekly" | "biweekly")}
                            className="w-full border border-gray-200 rounded px-1.5 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-200"
                          >
                            <option value="weekly">Chaque semaine</option>
                            <option value="biweekly">Aux 2 semaines</option>
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={handleGenerateCalFromNewPay}
                          disabled={newPayCalGenerated}
                          className="w-full py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
                        >
                          {newPayCalGenerated ? `✓ ${newPayCalCount} passages créés` : "Générer le calendrier"}
                        </button>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={savingNewPay}
                    className="w-full py-2 bg-[#0a1f3f] text-white text-xs font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
                  >
                    {savingNewPay ? "Création..." : "Créer la demande de paiement"}
                  </button>
                </form>
              );
            })()}

            {/* Payment list */}
            {payments.length === 0 ? (
              <p className="text-xs text-gray-400">Aucun paiement</p>
            ) : (
              <div className="space-y-2">
                {payments.map((p) => {
                  const statusColors: Record<string, string> = {
                    en_attente: "bg-yellow-100 text-yellow-700",
                    reçu: "bg-green-100 text-green-700",
                    en_retard: "bg-red-100 text-red-700",
                  };
                  const mb = METHOD_BADGES[p.method] ?? METHOD_BADGES.autre;
                  return (
                    <div key={p.id} className="flex items-start justify-between gap-2 group py-1.5 border-b border-gray-50 last:border-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusColors[p.status] ?? "bg-gray-100 text-gray-600"}`}>
                            {p.status === "en_attente" ? "En attente" : p.status === "reçu" ? "Reçu" : p.status}
                          </span>
                          <span className="text-xs font-bold text-gray-900">
                            {p.amount.toLocaleString("fr-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 })}
                          </span>
                          {p.status === "reçu" && (
                            <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${mb.bg} ${mb.text}`}>{mb.label}</span>
                          )}
                        </div>
                        {p.notes && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{p.notes}</p>}
                        {p.due_date && p.status === "en_attente" && (
                          <p className="text-[10px] text-gray-400">Échéance: {formatDate(p.due_date)}</p>
                        )}
                        {p.received_date && p.status === "reçu" && (
                          <p className="text-[10px] text-gray-400">Reçu le {formatDate(p.received_date)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                        {p.status === "en_attente" && (
                          <div className="relative">
                            <button
                              onClick={() => setMarkPaidId(markPaidId === p.id ? null : p.id)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 transition"
                            >
                              <CheckCircle size={10} />
                              Payé
                            </button>
                            {markPaidId === p.id && (
                              <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 min-w-[100px] py-1">
                                {["interac", "cash", "stripe"].map(m => (
                                  <button
                                    key={m}
                                    onClick={() => handleMarkPaid(p.id, m as Payment["method"])}
                                    className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 capitalize"
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
                          className="opacity-0 group-hover:opacity-100 transition text-gray-300 hover:text-red-500"
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
        </div>
      </div>

      {/* Close dropdown on outside click */}
      {showStageDropdown && (
        <div className="fixed inset-0 z-10" onClick={() => setShowStageDropdown(false)} />
      )}

      {/* Close toast */}
      {closeToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-green-600 text-white px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2">
          <CheckCircle size={16} />
          Client closé! Le document s&apos;est ouvert dans un nouvel onglet.
        </div>
      )}

      {/* DocuSign toast */}
      {docuSignToast && (
        <div className={`fixed bottom-20 right-6 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium flex items-center gap-2 ${
          docuSignToast === "success" ? "bg-purple-600 text-white" : "bg-red-600 text-white"
        }`}>
          <PenLine size={16} />
          {docuSignToast === "success"
            ? "Contrat envoyé pour signature via DocuSign!"
            : docuSignToast === "error:email"
            ? "Le client n'a pas d'adresse courriel"
            : "Erreur DocuSign — vérifie la connexion"}
        </div>
      )}

      {/* Close client modal */}
      {showCloseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Closer ce client</h2>
              <button onClick={() => setShowCloseModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleCloseClient} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Service confirmé</label>
                <select
                  value={closeForm.service}
                  onChange={(e) => {
                    const svc = CLOSE_SERVICES.find((s) => s.value === e.target.value);
                    setCloseForm((p) => ({ ...p, service: e.target.value, price: svc?.price ?? p.price }));
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                >
                  {CLOSE_SERVICES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Prix ($)</label>
                  <input
                    type="number" min="0" required
                    value={closeForm.price}
                    onChange={(e) => setCloseForm((p) => ({ ...p, price: parseFloat(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Méthode de paiement</label>
                  <select
                    value={closeForm.method}
                    onChange={(e) => setCloseForm((p) => ({ ...p, method: e.target.value as "interac" | "cash" }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  >
                    <option value="interac">Interac</option>
                    <option value="cash">Cash</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Date du RDV</label>
                  <input
                    type="date" required
                    value={closeForm.scheduled_date}
                    onChange={(e) => setCloseForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Heure</label>
                  <input
                    type="time"
                    value={closeForm.scheduled_time}
                    onChange={(e) => setCloseForm((p) => ({ ...p, scheduled_time: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes (optionnel)</label>
                <textarea
                  rows={2}
                  value={closeForm.notes}
                  onChange={(e) => setCloseForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-green-200"
                />
              </div>
              {closeForm.method === "interac" && !contact?.email && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                  ⚠️ Pas d&apos;email enregistré — la facture ne sera pas envoyée automatiquement.
                </p>
              )}
              {CLOSE_SERVICES.find((s) => s.value === closeForm.service)?.docType === "contrat" && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={closeForm.sendDocuSign}
                    onChange={(e) => setCloseForm((p) => ({ ...p, sendDocuSign: e.target.checked }))}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700 flex items-center gap-1.5">
                    <PenLine size={14} className="text-purple-600" />
                    Envoyer pour signature DocuSign
                  </span>
                </label>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowCloseModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  Annuler
                </button>
                <button type="submit" disabled={savingClose} className="px-5 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition">
                  {savingClose ? "Closing..." : "Closer le client"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Job modal */}
      {showJobModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Nouveau rendez-vous</h2>
              <button onClick={() => setShowJobModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleJobCreate} className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Type</label>
                <select
                  value={jobForm.job_type}
                  onChange={(e) => setJobForm((p) => ({ ...p, job_type: e.target.value as Job["job_type"] }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                >
                  <option value="ouverture">Ouverture</option>
                  <option value="entretien">Entretien</option>
                  <option value="fermeture">Fermeture</option>
                  <option value="visite">Visite</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Date</label>
                <input
                  type="date" value={jobForm.scheduled_date} required
                  onChange={(e) => setJobForm((p) => ({ ...p, scheduled_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Heure début</label>
                  <input
                    type="time" value={jobForm.scheduled_time_start}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_start: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Heure fin</label>
                  <input
                    type="time" value={jobForm.scheduled_time_end}
                    onChange={(e) => setJobForm((p) => ({ ...p, scheduled_time_end: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Notes</label>
                <textarea
                  rows={3} value={jobForm.notes}
                  onChange={(e) => setJobForm((p) => ({ ...p, notes: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowJobModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition">
                  Annuler
                </button>
                <button type="submit" disabled={savingJob} className="px-5 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition">
                  {savingJob ? "Création..." : "Créer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Portal modal */}
      {showPortalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Créer accès portail</h2>
              <button onClick={() => setShowPortalModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {!contact?.email ? (
                <p className="text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3">
                  Ce client n&apos;a pas d&apos;adresse email. Ajoutez un email avant de créer un accès portail.
                </p>
              ) : (
                <>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Email du client</p>
                    <p className="text-sm font-medium text-gray-900">{contact.email}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Mot de passe généré</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono font-bold text-gray-900">
                        {portalPassword}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(portalPassword);
                          setPortalCopied(true);
                          setTimeout(() => setPortalCopied(false), 2000);
                        }}
                        className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 transition"
                      >
                        <Copy size={14} />
                        {portalCopied ? "Copié!" : "Copier"}
                      </button>
                    </div>
                  </div>
                  {portalDone && (
                    <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
                      Accès portail créé avec succès!
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={handleSendPortalSMS}
                      className="flex items-center gap-1.5 px-4 py-2 border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition"
                    >
                      <MessageSquare size={14} />
                      Envoyer par SMS
                    </button>
                    <button
                      onClick={handleCreatePortalAccess}
                      disabled={portalCreating || portalDone}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
                    >
                      <Globe size={14} />
                      {portalCreating ? "Création..." : portalDone ? "Créé ✓" : "Créer l'accès"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
