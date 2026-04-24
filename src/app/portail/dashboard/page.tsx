"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileText, Calendar, CreditCard, Phone, Mail, ChevronRight, Download, CheckCircle, XCircle, MessageSquare, Send, LogOut } from "lucide-react";

function fmt(n: number) {
  return new Intl.NumberFormat("fr-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0 }).format(n);
}

function PaymentBanner() {
  const params = useSearchParams();
  const payment = params.get("payment");
  if (payment === "success") return (
    <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
      <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-green-800 text-sm">Paiement reçu!</p>
        <p className="text-xs text-green-700 mt-0.5">Votre paiement par carte a été traité. Merci!</p>
      </div>
    </div>
  );
  if (payment === "cancel") return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex items-start gap-3">
      <XCircle size={18} className="text-yellow-600 flex-shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-yellow-800 text-sm">Paiement annulé</p>
        <p className="text-xs text-yellow-700 mt-0.5">Votre paiement n&apos;a pas été complété.</p>
      </div>
    </div>
  );
  return null;
}

export default function PortailDashboard() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [client, setClient] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [documents, setDocuments] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [upcomingJobs, setUpcomingJobs] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paymentData, setPaymentData] = useState<{ total: number; total_paid: number; balance: number; payments: any[] }>({
    total: 0, total_paid: 0, balance: 0, payments: [],
  });
  const [loading, setLoading] = useState(true);
  const [smsText, setSmsText] = useState("");
  const [smsSending, setSmsSending] = useState(false);
  const [smsSent, setSmsSent] = useState(false);
  const [smsError, setSmsError] = useState(false);

  useEffect(() => {
    const t = Date.now();

    const portalToken = localStorage.getItem("portal_token") || "";
    Promise.all([
      fetch(`/api/portail/me?t=${t}`, { cache: "no-store", headers: { "Authorization": `Bearer ${portalToken}` } }).then(r => {
        if (r.status === 401) { router.push("/portail"); throw new Error("Non autorisé"); }
        return r.json();
      }),
      fetch(`/api/portail/documents?t=${t}`, { cache: "no-store", headers: { "Authorization": `Bearer ${portalToken}` } }).then(r => r.json()),
      fetch(`/api/portail/jobs?t=${t}`, { cache: "no-store", headers: { "Authorization": `Bearer ${portalToken}` } }).then(r => r.json()),
      fetch(`/api/portail/payments?t=${t}`, { cache: "no-store", headers: { "Authorization": `Bearer ${portalToken}` } }).then(r => r.json()),
    ]).then(([me, docs, jobs, payments]) => {
      if (me?.client) setClient(me.client);
      if (Array.isArray(docs)) setDocuments(docs);
      else if (docs?.documents) setDocuments(docs.documents);
      setUpcomingJobs(jobs?.upcoming || []);
      if (payments?.payments) setPaymentData(payments);
    }).catch(console.error).finally(() => setLoading(false));
  }, [router]);

  const today = new Date().toLocaleDateString("fr-CA", {
    timeZone: "America/Montreal", weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const pendingPayments = paymentData.payments.filter(p => p.status === "en_attente");

  const handleLogout = async () => {
    await fetch("/api/portail/logout", { method: "POST" });
    router.push("/portail");
  };

  const handleSendSms = async () => {
    if (!smsText.trim()) return;
    setSmsSending(true);
    setSmsError(false);
    try {
      const res = await fetch("/api/portail/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: smsText.trim() }),
      });
      if (res.ok) {
        setSmsText("");
        setSmsSent(true);
        setTimeout(() => setSmsSent(false), 5000);
      } else {
        setSmsError(true);
        setTimeout(() => setSmsError(false), 4000);
      }
    } catch {
      setSmsError(true);
      setTimeout(() => setSmsError(false), 4000);
    }
    setSmsSending(false);
  };

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5">
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      {/* Welcome */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Bonjour{client?.first_name ? ` ${client.first_name}` : ""}!
          </h1>
          <p className="text-sm text-gray-500 mt-1 capitalize">Nous sommes le {today}.</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-600 transition mt-1"
        >
          <LogOut size={15} />
          Déconnexion
        </button>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-900">{upcomingJobs.length}</p>
          <p className="text-xs text-gray-500 mt-1">Rendez-vous</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className="text-lg font-bold text-green-600">{fmt(paymentData.total_paid)}</p>
          <p className="text-xs text-gray-500 mt-1">Payé</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm text-center">
          <p className={`text-lg font-bold ${paymentData.balance > 0 ? "text-orange-500" : "text-green-600"}`}>
            {fmt(Math.max(0, paymentData.balance))}
          </p>
          <p className="text-xs text-gray-500 mt-1">Restant</p>
        </div>
      </div>

      {/* Payment alert */}
      {pendingPayments.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
          <p className="font-semibold text-orange-800 text-sm">
            {pendingPayments.length > 1 ? `${pendingPayments.length} paiements en attente` : "Paiement en attente"}
          </p>
          <p className="text-sm text-orange-700 mt-1">
            {pendingPayments[0].notes || "Service de piscine"} — {fmt(pendingPayments[0].amount)}
          </p>
          <button
            onClick={() => router.push("/portail/paiements")}
            className="mt-3 bg-orange-500 text-white rounded-xl px-4 py-2.5 text-sm font-semibold w-full hover:bg-orange-600 transition"
          >
            Payer maintenant
          </button>
        </div>
      )}

      {/* Next appointment */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-blue-600" />
            <h2 className="font-semibold text-sm text-gray-900">Prochain rendez-vous</h2>
          </div>
          <button onClick={() => router.push("/portail/rendez-vous")} className="text-xs text-blue-600 flex items-center gap-1 hover:text-blue-800 transition">
            Voir tout <ChevronRight size={14} />
          </button>
        </div>
        <div className="p-4">
          {upcomingJobs.length > 0 ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-50 flex flex-col items-center justify-center flex-shrink-0">
                <span className="text-sm font-bold text-blue-600 leading-tight">
                  {new Date(upcomingJobs[0].scheduled_date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric" })}
                </span>
                <span className="text-[10px] text-blue-500 uppercase">
                  {new Date(upcomingJobs[0].scheduled_date + "T12:00:00").toLocaleDateString("fr-CA", { month: "short" })}
                </span>
              </div>
              <div>
                <p className="font-medium text-sm text-gray-900 capitalize">{upcomingJobs[0].job_type}</p>
                <p className="text-xs text-gray-500 capitalize">
                  {new Date(upcomingJobs[0].scheduled_date + "T12:00:00").toLocaleDateString("fr-CA", { weekday: "long", day: "numeric", month: "long" })}
                  {upcomingJobs[0].scheduled_time_start ? ` à ${upcomingJobs[0].scheduled_time_start.slice(0, 5)}` : ""}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-2">Aucun rendez-vous planifié</p>
          )}
        </div>
      </div>

      {/* Recent documents */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
          <FileText size={16} className="text-purple-600" />
          <h2 className="font-semibold text-sm text-gray-900">Documents récents</h2>
        </div>
        <div className="divide-y divide-gray-50">
          {documents.length > 0 ? documents.slice(0, 3).map(doc => (
            <div key={doc.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">{doc.doc_number}</p>
                <p className="text-xs text-gray-500 capitalize">{doc.doc_type} — {fmt(doc.amount || 0)}</p>
              </div>
              {doc.pdf_url && (
                <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 p-2 hover:text-blue-800 transition">
                  <Download size={16} />
                </a>
              )}
            </div>
          )) : (
            <p className="text-sm text-gray-400 text-center py-6">Aucun document pour le moment</p>
          )}
        </div>
      </div>

      {/* Contact */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={16} className="text-[#0a1f3f]" />
          <h2 className="font-semibold text-sm text-gray-900">Nous contacter</h2>
        </div>

        {/* SMS form */}
        <div className="mb-3">
          <textarea
            value={smsText}
            onChange={e => setSmsText(e.target.value)}
            placeholder="Écrivez votre message..."
            rows={3}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition resize-none bg-gray-50"
          />
          {smsSent && (
            <p className="text-xs text-green-600 mt-1.5 flex items-center gap-1">
              <CheckCircle size={13} /> Message envoyé! On vous répond bientôt.
            </p>
          )}
          {smsError && (
            <p className="text-xs text-red-600 mt-1.5">Erreur lors de l&apos;envoi. Réessayez.</p>
          )}
          <button
            onClick={handleSendSms}
            disabled={smsSending || !smsText.trim()}
            className="mt-2 w-full bg-[#0a1f3f] text-white rounded-xl py-3 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-[#0d2a52] disabled:opacity-40 transition"
          >
            <Send size={15} />
            {smsSending ? "Envoi en cours..." : "Envoyer un message"}
          </button>
        </div>

        {/* Call / Email */}
        <div className="flex gap-3">
          <a
            href="tel:4509942215"
            className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-200 transition"
          >
            <Phone size={15} /> Appeler
          </a>
          <a
            href="mailto:service@entretienpiscinegranby.com"
            className="flex-1 bg-gray-100 text-gray-700 rounded-xl py-2.5 flex items-center justify-center gap-2 text-sm font-medium hover:bg-gray-200 transition"
          >
            <Mail size={15} /> Courriel
          </a>
        </div>
      </div>
    </div>
  );
}
