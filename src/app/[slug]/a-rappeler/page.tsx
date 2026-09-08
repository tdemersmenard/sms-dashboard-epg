"use client";

import { useState, useEffect, useCallback } from "react";
import { Phone, Clock, CheckCircle, XCircle, ChevronRight, AlertTriangle, Copy, Loader2 } from "lucide-react";

interface CallbackContact {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
  stage: string | null;
  callback_added_at: string | null;
  days_in_list: number;
  last_message_body: string | null;
  last_message_at: string | null;
}

const MIGRATION_SQL = `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS callback_status TEXT DEFAULT NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS callback_added_at TIMESTAMPTZ DEFAULT NULL;`;

function initials(c: CallbackContact) {
  return `${c.first_name?.[0] ?? "?"}${c.last_name?.[0] ?? ""}`.toUpperCase();
}

function daysLabel(n: number) {
  if (n === 0) return "ajouté aujourd'hui";
  if (n === 1) return "depuis 1 jour";
  return `depuis ${n} jours`;
}

export default function ARappelerPage() {
  const [contacts, setContacts] = useState<CallbackContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [copied, setCopied] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/callback");
      const data = await res.json();
      if (data.migrationRequired) {
        setMigrationRequired(true);
      } else {
        setContacts(data.contacts ?? []);
      }
    } catch (e) {
      console.error("[a-rappeler] load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const doAction = async (contactId: string, action: "closé" | "perdu" | "later") => {
    setActionLoading(`${contactId}-${action}`);
    await fetch("/api/callback", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, action }),
    });
    await load();
    setActionLoading(null);
  };

  const copySql = () => {
    navigator.clipboard.writeText(MIGRATION_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (migrationRequired) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <Phone size={22} className="text-acc" strokeWidth={1.75} />
          <h1 className="text-xl font-bold font-display text-ink">À rappeler</h1>
        </div>
        <div className="bg-chip border border-line rounded-xl p-6">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-warn" />
            <p className="font-semibold text-warn">Migration Supabase requise</p>
          </div>
          <p className="text-sm text-mut mb-4">
            Exécutez ce SQL dans l&apos;éditeur Supabase pour activer la liste de rappel.
          </p>
          <div className="relative">
            <pre className="bg-gray-900 text-green-300 text-xs p-4 rounded-lg overflow-x-auto">{MIGRATION_SQL}</pre>
            <button onClick={copySql} className="absolute top-2 right-2 px-2 py-1 text-xs bg-white/10 hover:bg-white/20 text-white rounded">
              {copied ? "Copié!" : <Copy size={12} />}
            </button>
          </div>
          <button
            onClick={() => { setMigrationRequired(false); load(); }}
            className="mt-4 px-4 py-2 btn-glow text-sm rounded-lg hover:opacity-90"
          >
            J&apos;ai exécuté la migration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Phone size={22} className="text-acc" strokeWidth={1.75} />
          <div>
            <h1 className="text-xl font-bold font-display text-ink">À rappeler</h1>
            <p className="text-sm text-mut">
              {loading ? "Chargement..." : `${contacts.length} lead${contacts.length !== 1 ? "s" : ""} entretien — leads à closer par téléphone`}
            </p>
          </div>
        </div>
        {contacts.length > 0 && !loading && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-warn/10 text-warn num">
            {contacts.length} en attente
          </span>
        )}
      </div>

      {/* Info box */}
      {!loading && contacts.length > 0 && (
        <div className="bg-chip border border-line rounded-xl px-4 py-3 text-xs text-mut">
          <strong>Comment ça marche:</strong> Ces leads ont montré de l&apos;intérêt pour l&apos;entretien mais n&apos;ont pas closé après 3 jours par SMS. Le bot arrête de les relancer automatiquement — c&apos;est toi qui les rappelles pour closer.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-mut" />
        </div>
      ) : contacts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-pos/10 flex items-center justify-center mb-3">
            <CheckCircle size={26} className="text-pos" />
          </div>
          <p className="font-semibold text-ink">Liste vide!</p>
          <p className="text-sm text-mut mt-1">Aucun lead entretien à rappeler en ce moment.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map(contact => {
            const isActing = actionLoading?.startsWith(contact.id);
            return (
              <div key={contact.id} className="bg-sur rounded-xl border border-line overflow-hidden">
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className="w-10 h-10 rounded-full bg-acc-grad flex items-center justify-center flex-shrink-0">
                      <span className="text-accink text-xs font-bold font-display">{initials(contact)}</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Name + time */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-ink text-sm">
                          {contact.first_name} {contact.last_name ?? ""}
                        </p>
                        <div className="flex items-center gap-1 text-xs text-mut flex-shrink-0">
                          <Clock size={11} />
                          <span>{daysLabel(contact.days_in_list)}</span>
                        </div>
                      </div>

                      {/* Phone */}
                      <a
                        href={`tel:${contact.phone}`}
                        className="inline-flex items-center gap-1.5 mt-0.5 text-sm text-acc font-medium hover:underline"
                      >
                        <Phone size={12} strokeWidth={2} />
                        {contact.phone}
                      </a>

                      {/* Last message */}
                      {contact.last_message_body && (
                        <div className="mt-2 bg-page rounded-lg px-3 py-2">
                          <p className="lbl mb-0.5">Dernier message du client</p>
                          <p className="text-xs text-mut line-clamp-2">{contact.last_message_body}</p>
                        </div>
                      )}
                    </div>

                    {/* Link to conversation */}
                    <a
                      href={`/clients/${contact.id}`}
                      className="flex-shrink-0 p-1.5 text-mut hover:text-ink hover:bg-chip rounded-lg"
                      title="Voir la conversation"
                    >
                      <ChevronRight size={16} />
                    </a>
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-line">
                    <button
                      onClick={() => doAction(contact.id, "closé")}
                      disabled={!!isActing}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-pos hover:opacity-90 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition"
                    >
                      {isActing && actionLoading === `${contact.id}-closé`
                        ? <Loader2 size={12} className="animate-spin" />
                        : <CheckCircle size={13} />}
                      Closé par téléphone
                    </button>
                    <button
                      onClick={() => doAction(contact.id, "perdu")}
                      disabled={!!isActing}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-chip hover:bg-neg/10 text-neg text-xs font-medium rounded-lg disabled:opacity-50 transition border border-neg/30"
                    >
                      {isActing && actionLoading === `${contact.id}-perdu`
                        ? <Loader2 size={12} className="animate-spin" />
                        : <XCircle size={13} />}
                      Pas intéressé
                    </button>
                    <button
                      onClick={() => doAction(contact.id, "later")}
                      disabled={!!isActing}
                      className="px-3 py-2 text-xs text-mut hover:text-ink hover:bg-chip rounded-lg disabled:opacity-50 transition border border-line whitespace-nowrap"
                    >
                      Plus tard
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
