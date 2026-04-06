"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Check, CheckCircle, XCircle } from "lucide-react";

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

export default function PortailPaiements() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<{ total: number; total_paid: number; balance: number; payments: any[] }>({
    total: 0, total_paid: 0, balance: 0, payments: [],
  });
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [showInterac, setShowInterac] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("portal_token");
    if (!token) { router.push("/portail"); return; }
    fetch(`/api/portail/payments?t=${Date.now()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then(r => r.json())
      .then(d => setData(d))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [router]);

  const payByCard = async (paymentId: string) => {
    setPayingId(paymentId);
    try {
      const token = localStorage.getItem("portal_token");
      const res = await fetch("/api/portail/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ paymentId }),
      });
      const result = await res.json();
      if (result.url) window.location.href = result.url;
      else alert(result.error || "Erreur lors de la création du paiement");
    } catch {
      alert("Erreur de connexion");
    }
    setPayingId(null);
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pending = data.payments.filter((p: any) => p.status === "en_attente");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const received = data.payments.filter((p: any) => p.status === "reçu");

  if (loading) return (
    <div className="flex justify-center py-16">
      <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <PaymentBanner />
      </Suspense>

      <h1 className="text-xl font-bold text-gray-900">Mes paiements</h1>

      {/* Summary */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xl font-bold text-gray-900">{fmt(data.total)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total</p>
          </div>
          <div>
            <p className="text-xl font-bold text-green-600">{fmt(data.total_paid)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Payé</p>
          </div>
          <div>
            <p className={`text-xl font-bold ${data.balance > 0 ? "text-orange-500" : "text-green-600"}`}>
              {fmt(Math.max(0, data.balance))}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Restant</p>
          </div>
        </div>
      </div>

      {/* All paid state */}
      {data.balance <= 0 && pending.length === 0 && data.total > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
          <Check size={32} className="text-green-600 mx-auto mb-2" />
          <p className="font-semibold text-green-800">Tout est payé!</p>
          <p className="text-sm text-green-600 mt-1">Vous n&apos;avez aucun solde en cours.</p>
        </div>
      )}

      {/* Pending payments */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">À payer</h2>
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {pending.map((p: any) => (
              <div key={p.id} className="bg-white rounded-xl border border-orange-200 shadow-sm p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-gray-900 leading-snug">{p.notes || "Service de piscine"}</p>
                    {p.due_date && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Échéance: {new Date(p.due_date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "long", year: "numeric" })}
                      </p>
                    )}
                  </div>
                  <p className="text-2xl font-bold text-gray-900 ml-3 flex-shrink-0">{fmt(p.amount)}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={() => setShowInterac(showInterac === p.id ? null : p.id)}
                    className="w-full bg-green-600 text-white rounded-xl py-4 text-base font-semibold flex items-center justify-center gap-2 hover:bg-green-700 transition"
                  >
                    Payer {p.amount} $ par Interac (recommandé)
                  </button>
                  <button
                    onClick={() => payByCard(p.id)}
                    disabled={payingId === p.id}
                    className="w-full bg-gray-100 text-gray-700 rounded-xl py-3 text-sm font-medium flex items-center justify-center gap-2 hover:bg-gray-200 transition disabled:opacity-50"
                  >
                    <CreditCard size={16} />
                    {payingId === p.id ? "Chargement..." : "Ou payer par carte de crédit"}
                  </button>
                </div>
                {showInterac === p.id && (
                  <div className="mt-3 bg-green-50 border border-green-200 rounded-xl p-4">
                    <p className="font-semibold text-green-800 text-sm mb-2">Virement Interac</p>
                    <p className="text-sm text-green-700">1. Ouvrez votre application bancaire</p>
                    <p className="text-sm text-green-700">2. Envoyez un virement à:</p>
                    <p className="text-base font-bold text-green-900 my-2 break-all">service@entretienpiscinegranby.com</p>
                    <p className="text-sm text-green-700">3. Montant: <strong>{fmt(p.amount)}</strong></p>
                    {p.notes && <p className="text-sm text-green-700">4. Message: <strong>{p.notes}</strong></p>}
                    <p className="text-xs text-green-500 mt-3">Le paiement sera confirmé manuellement dans les heures qui suivent.</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      {received.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Historique</h2>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-50">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {received.map((p: any) => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                    <Check size={14} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{fmt(p.amount)}</p>
                    <p className="text-xs text-gray-400">{p.notes || "Paiement"}</p>
                  </div>
                </div>
                <p className="text-xs text-gray-400 flex-shrink-0">
                  {p.received_date
                    ? new Date(p.received_date + "T12:00:00").toLocaleDateString("fr-CA", { day: "numeric", month: "short", year: "numeric" })
                    : ""}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.total === 0 && (
        <div className="text-center py-8">
          <p className="text-sm text-gray-400">Aucun paiement en cours.</p>
        </div>
      )}
    </div>
  );
}
