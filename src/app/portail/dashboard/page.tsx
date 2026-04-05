"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Calendar, DollarSign, Phone, Mail, Send, CreditCard } from "lucide-react";

interface PortailClient {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  season_price: number | null;
}

interface PortailDoc {
  id: string;
  doc_type: string;
  doc_number: string;
  amount: number;
  status: string;
  pdf_url: string | null;
  created_at: string;
}

interface PortailJob {
  id: string;
  job_type: string;
  scheduled_date: string;
  scheduled_time_start: string | null;
  status: string;
  notes: string | null;
}

interface PortailPayment {
  id: string;
  amount: number;
  status: string;
  method: string | null;
  received_date: string | null;
  notes: string | null;
  created_at: string;
}

const JOB_TYPE_LABELS: Record<string, string> = {
  ouverture: "Ouverture",
  fermeture: "Fermeture",
  entretien: "Entretien",
  visite: "Visite",
  autre: "Autre",
};

const JOB_TYPE_COLORS: Record<string, string> = {
  ouverture: "bg-green-100 text-green-700",
  fermeture: "bg-orange-100 text-orange-700",
  entretien: "bg-blue-100 text-blue-700",
  visite: "bg-purple-100 text-purple-700",
  autre: "bg-gray-100 text-gray-700",
};

const STATUS_COLORS: Record<string, string> = {
  brouillon: "bg-gray-100 text-gray-600",
  envoyé: "bg-blue-100 text-blue-700",
  signé: "bg-green-100 text-green-700",
  en_attente: "bg-yellow-100 text-yellow-700",
  reçu: "bg-green-100 text-green-700",
  planifié: "bg-blue-100 text-blue-700",
  confirmé: "bg-green-100 text-green-700",
  complété: "bg-gray-100 text-gray-600",
};

function fmt(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0 }).format(n);
}

function authHeaders() {
  const token = typeof window !== "undefined" ? localStorage.getItem("portail_token") : "";
  return { Authorization: `Bearer ${token}` };
}

export default function PortailDashboard() {
  const router = useRouter();
  const [client, setClient] = useState<PortailClient | null>(null);
  const [docs, setDocs] = useState<PortailDoc[]>([]);
  const [jobs, setJobs] = useState<PortailJob[]>([]);
  const [payments, setPayments] = useState<PortailPayment[]>([]);
  const [seasonPrice, setSeasonPrice] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);
  const [balance, setBalance] = useState(0);
  const [contactMsg, setContactMsg] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [interacOpenId, setInteracOpenId] = useState<string | null>(null);
  const [showAllJobs, setShowAllJobs] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("portail_client");
    const token = localStorage.getItem("portail_token");
    if (!stored || !token) { router.push("/portail"); return; }
    try { setClient(JSON.parse(stored)); } catch { router.push("/portail"); return; }

    Promise.all([
      fetch("/api/portail/documents", { headers: authHeaders() }).then(r => r.json()),
      fetch("/api/portail/jobs", { headers: authHeaders() }).then(r => r.json()),
      fetch("/api/portail/payments", { headers: authHeaders() }).then(r => r.json()),
    ]).then(([d, j, p]) => {
      if (Array.isArray(d)) setDocs(d);
      if (Array.isArray(j)) setJobs(j);
      if (p && Array.isArray(p.payments)) {
        setPayments(p.payments);
        setSeasonPrice(p.season_price ?? 0);
        setTotalPaid(p.total_paid ?? 0);
        setBalance(p.balance ?? 0);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [router]);

  const today = new Date().toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const firstName = client?.first_name || "client";

  const upcomingJobs = jobs.filter(j => j.scheduled_date >= new Date().toISOString().split("T")[0] && j.status !== "annulé");
  const pastJobs = jobs.filter(j => j.scheduled_date < new Date().toISOString().split("T")[0] || j.status === "complété");

  const handleStripeCheckout = async (paymentId: string) => {
    setPayingId(paymentId);
    try {
      const res = await fetch("/api/portail/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ paymentId }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* ignore */ }
    setPayingId(null);
  };

  const handleSendMessage = async () => {
    if (!contactMsg.trim()) return;
    setSendingMsg(true);
    try {
      await fetch("/api/portail/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ message: contactMsg }),
      });
      setContactMsg("");
      setMsgSent(true);
      setTimeout(() => setMsgSent(false), 4000);
    } catch { /* ignore */ }
    setSendingMsg(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto pb-8">
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      {/* Welcome */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Bonjour {firstName}!</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{today}</p>
      </div>

      {/* Documents */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Mes documents</h2>
        </div>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun document pour le moment</p>
        ) : (
          <div className="space-y-3">
            {docs.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${d.doc_type === "contrat" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                    {d.doc_type === "contrat" ? "Contrat" : "Facture"}
                  </span>
                  <span className="text-sm text-gray-700 font-medium">{d.doc_number}</span>
                  <span className="text-sm text-gray-500">{fmt(d.amount)}</span>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status] ?? "bg-gray-100 text-gray-500"}`}>
                    {d.status}
                  </span>
                </div>
                {d.pdf_url && (
                  <a
                    href={d.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 text-xs font-medium text-[#0a1f3f] border border-[#0a1f3f]/20 rounded-lg px-3 py-1.5 hover:bg-[#0a1f3f]/5 transition"
                  >
                    Voir PDF
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rendez-vous */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <Calendar size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Mes rendez-vous</h2>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun rendez-vous planifié</p>
        ) : (
          <>
            {upcomingJobs.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">À venir</p>
                <div className="space-y-2 mb-4">
                  {(showAllJobs ? upcomingJobs : upcomingJobs.slice(0, 10)).map(j => (
                    <JobRow key={j.id} job={j} />
                  ))}
                </div>
                {upcomingJobs.length > 10 && (
                  <button
                    onClick={() => setShowAllJobs(v => !v)}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium mb-4"
                  >
                    {showAllJobs ? "Voir moins" : `Voir tout (${upcomingJobs.length} passages)`}
                  </button>
                )}
              </>
            )}
            {pastJobs.length > 0 && (
              <>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Passés</p>
                <div className="space-y-2">
                  {pastJobs.slice(0, 5).map(j => (
                    <JobRow key={j.id} job={j} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* Paiements */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign size={18} className="text-[#0a1f3f]" />
          <h2 className="text-sm font-bold text-gray-800">Mes paiements</h2>
        </div>

        {/* 3 stat cards */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="bg-gray-50 rounded-lg p-3 text-center">
            <p className="text-base font-bold text-gray-900">{fmt(seasonPrice)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-base font-bold text-green-600">{fmt(totalPaid)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Payé</p>
          </div>
          <div className={`rounded-lg p-3 text-center ${balance > 0 ? "bg-red-50" : "bg-green-50"}`}>
            <p className={`text-base font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>{fmt(Math.max(0, balance))}</p>
            <p className="text-xs text-gray-500 mt-0.5">Restant</p>
          </div>
        </div>

        {/* Payment list */}
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400">Aucun paiement enregistré</p>
        ) : (
          <div className="space-y-2 mb-4">
            {payments.map(p => (
              <div key={p.id} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLORS[p.status] ?? "bg-gray-100 text-gray-500"}`}>
                  {p.status}
                </span>
                <span className="text-sm font-bold text-gray-900">{fmt(p.amount)}</span>
                {p.notes && <span className="text-xs text-gray-500 truncate">{p.notes.replace(" — Payé par Stripe", "")}</span>}
                {p.received_date && (
                  <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
                    {new Date(p.received_date).toLocaleDateString("fr-CA", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Pay buttons — shown only if balance > 0 */}
        {balance > 0 && (
          <div className="pt-3 border-t border-gray-100">
            <p className="text-xs font-medium text-gray-600 mb-2">Payer le solde restant ({fmt(balance)})</p>
            {payments.filter(p => p.status === "en_attente").map(p => (
              <div key={p.id} className="mb-3">
                <p className="text-xs text-gray-500 mb-1.5">{p.notes?.replace(" — Payé par Stripe", "") || `Paiement ${fmt(p.amount)}`}</p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => handleStripeCheckout(p.id)}
                    disabled={payingId === p.id}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 w-full sm:w-auto bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                  >
                    <CreditCard size={15} />
                    {payingId === p.id ? "Redirection..." : "Payer par carte"}
                  </button>
                  <button
                    onClick={() => setInteracOpenId(interacOpenId === p.id ? null : p.id)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 w-full sm:w-auto bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition"
                  >
                    Payer par Interac
                  </button>
                </div>
                {interacOpenId === p.id && (
                  <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                    <p className="font-medium text-green-900 mb-1">Virement Interac</p>
                    <p className="text-green-800">Envoyez <strong>{fmt(p.amount)}</strong> à:</p>
                    <p className="font-mono text-green-700 mt-0.5">service@entretienpiscinegranby.com</p>
                    <p className="text-xs text-green-600 mt-1">Mentionnez votre nom dans le message. Votre paiement sera confirmé manuellement.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
        <h2 className="text-sm font-bold text-gray-800 mb-4">Nous contacter</h2>
        <div className="flex flex-wrap gap-4 mb-4">
          <a
            href="tel:4509942215"
            className="flex items-center gap-2 text-sm text-[#0a1f3f] font-medium hover:underline"
          >
            <Phone size={15} />
            450-994-2215
          </a>
          <a
            href="mailto:service@entretienpiscinegranby.com"
            className="flex items-center gap-2 text-sm text-[#0a1f3f] font-medium hover:underline"
          >
            <Mail size={15} />
            service@entretienpiscinegranby.com
          </a>
        </div>
        <textarea
          value={contactMsg}
          onChange={(e) => setContactMsg(e.target.value)}
          placeholder="Écrivez votre message ici..."
          rows={3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0a1f3f]/20 resize-none bg-gray-50"
        />
        {msgSent && (
          <p className="text-sm text-green-600 mt-2">Message envoyé! On vous répond bientôt.</p>
        )}
        <button
          onClick={handleSendMessage}
          disabled={sendingMsg || !contactMsg.trim()}
          className="mt-2 flex items-center gap-2 px-4 py-2 bg-[#0a1f3f] text-white text-sm font-medium rounded-lg hover:bg-[#0f2855] disabled:opacity-50 transition"
        >
          <Send size={14} />
          {sendingMsg ? "Envoi..." : "Envoyer"}
        </button>
      </div>
    </div>
  );
}

function PaymentBanner() {
  const params = useSearchParams();
  const payment = params.get("payment");
  if (payment === "success") {
    return (
      <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-800">
        <p className="font-semibold">Paiement reçu!</p>
        <p className="text-green-700 mt-0.5">Votre paiement par carte a été traité avec succès. Merci!</p>
      </div>
    );
  }
  if (payment === "cancel") {
    return (
      <div className="mb-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
        <p className="font-semibold">Paiement annulé</p>
        <p className="text-yellow-700 mt-0.5">Votre paiement n&apos;a pas été complété. Vous pouvez réessayer.</p>
      </div>
    );
  }
  return null;
}

function JobRow({ job }: { job: PortailJob }) {
  const colorClass = JOB_TYPE_COLORS[job.job_type] ?? "bg-gray-100 text-gray-700";
  const label = JOB_TYPE_LABELS[job.job_type] ?? job.job_type;
  const date = new Date(job.scheduled_date + "T00:00:00").toLocaleDateString("fr-CA", {
    weekday: "long", day: "numeric", month: "long",
  });
  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${colorClass}`}>
        {label}
      </span>
      <span className="text-sm text-gray-700 capitalize">{date}</span>
      {job.scheduled_time_start && (
        <span className="text-sm text-gray-500">à {job.scheduled_time_start.slice(0, 5)}</span>
      )}
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ml-auto flex-shrink-0 ${STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-500"}`}>
        {job.status}
      </span>
    </div>
  );
}
