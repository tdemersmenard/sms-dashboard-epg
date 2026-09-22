"use client";

import { useEffect, useState, use as usePromise } from "react";
import { useRouter } from "next/navigation";
import { vendeurBrowser } from "@/lib/vendeur/client";

/* Fiche lead pour le closer. Lectures en JWT (RLS: son lead seulement).
   Actions: journaliser un appel, SMS manuel (même fil), marquer perdu.
   Bloc prix EN LECTURE SEULE (calculé serveur, aucun champ montant). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

const OUTCOMES = [
  { v: "repondu", l: "A répondu" },
  { v: "message_vocal", l: "Boîte vocale" },
  { v: "pas_de_reponse", l: "Pas de réponse" },
  { v: "mauvais_numero", l: "Mauvais numéro" },
];

export default function LeadDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = usePromise(params);
  const router = useRouter();
  const sb = vendeurBrowser();

  const [lead, setLead] = useState<Any>(null);
  const [msgs, setMsgs] = useState<Any[]>([]);
  const [calls, setCalls] = useState<Any[]>([]);
  const [pricing, setPricing] = useState<Any>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<string>("");

  // formulaires
  const [smsBody, setSmsBody] = useState("");
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState("repondu");
  const [callNotes, setCallNotes] = useState("");
  const [objection, setObjection] = useState("");
  const [callback, setCallback] = useState("");
  const [logging, setLogging] = useState(false);
  const [lostReason, setLostReason] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    const { data: { user } } = await sb.auth.getUser();
    setMe(user?.id ?? "");
    const [{ data: l }, { data: m }, { data: c }] = await Promise.all([
      sb.from("contacts").select("*").eq("id", id).maybeSingle(),
      sb.from("messages").select("id, direction, body, sent_via, created_at").eq("contact_id", id).order("created_at"),
      sb.from("call_logs").select("*").eq("lead_id", id).order("called_at", { ascending: false }),
    ]);
    setLead(l);
    setMsgs(m || []);
    setCalls(c || []);
    if (l?.pool_type) {
      const pr = await fetch("/api/site/pricing").then((r) => r.json()).catch(() => null);
      if (pr) setPricing(pr.tiers.signature[l.pool_type === "creusée" ? "creusée" : "hors-terre"]);
    }
    setReady(true);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!ready) return null;
  if (!lead) return <div className="vnd-card"><p className="vnd-empty">Lead introuvable ou non assigné.</p></div>;

  const name = [lead.first_name, lead.last_name].filter(Boolean).join(" ") || lead.phone;

  const sendSms = async () => {
    if (!smsBody.trim() || sending) return;
    setSending(true); setErr("");
    const res = await fetch("/api/vendeur/sms", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId: id, body: smsBody.trim() }),
    });
    if (res.ok) { setSmsBody(""); await load(); } else { setErr((await res.json()).error || "Envoi échoué"); }
    setSending(false);
  };

  const logCall = async () => {
    if (logging) return;
    setLogging(true); setErr("");
    const cbISO = callback ? new Date(callback).toISOString() : null;
    const { error } = await sb.from("call_logs").insert({
      lead_id: id, closer_id: me, outcome, notes: callNotes || null, objection: objection || null,
      next_callback_at: cbISO, franchise_id: lead.franchise_id,
    });
    if (error) { setErr(error.message); setLogging(false); return; }
    // Mettre à jour le pipeline + le prochain rappel sur le lead
    const patch: Any = {};
    if (cbISO) { patch.next_callback_at = cbISO; patch.pipeline_status = "rappel_prevu"; }
    else if (lead.pipeline_status === "nouveau") patch.pipeline_status = "contacte";
    if (Object.keys(patch).length) await sb.from("contacts").update(patch).eq("id", id);
    setCallNotes(""); setObjection(""); setCallback("");
    await load();
    setLogging(false);
  };

  const setStatus = async (status: string) => {
    await sb.from("contacts").update({ pipeline_status: status }).eq("id", id);
    await load();
  };

  const markLost = async () => {
    if (!lostReason.trim()) return;
    await sb.from("contacts").update({ pipeline_status: "perdu", lost_reason: lostReason.trim() }).eq("id", id);
    router.push("/vendeur");
  };

  const promo = pricing?.promoActive;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <button onClick={() => router.push("/vendeur")} style={{ background: "none", border: "none", color: "var(--mut)", fontSize: ".85rem", textAlign: "left", padding: 0, cursor: "pointer" }}>← File d&apos;appels</button>

      {/* En-tête */}
      <div className="vnd-card warm">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ fontWeight: 900, fontSize: "1.3rem" }}>{name}</h1>
          <span className={`vnd-chip ${lead.pipeline_status || "nouveau"}`}>{(lead.pipeline_status || "nouveau").replace("_", " ")}</span>
        </div>
        <div style={{ color: "var(--mut)", fontSize: ".85rem", marginTop: 4 }}>
          {lead.city || "ville ?"}{lead.pool_type ? ` · ${lead.pool_type}` : ""}
        </div>
        <div className="vnd-btn-row" style={{ marginTop: 12 }}>
          <a className="vnd-btn" href={`tel:${lead.phone}`}>📞 Appeler</a>
          <a className="vnd-btn-ghost" href={`sms:${lead.phone}`}>💬 {lead.phone}</a>
        </div>
      </div>

      {/* Prix pour ce lead — LECTURE SEULE */}
      <div className="vnd-card">
        <p className="lbl" style={{ marginBottom: 8 }}>Prix pour ce lead {lead.pool_type ? `(${lead.pool_type})` : ""}</p>
        {pricing ? (
          <>
            <div className="vnd-price"><span className="k">Mensuel (12 versements)</span><span className="v">{pricing.monthly}$/mois</span></div>
            <div className="vnd-price"><span className="k">Comptant {promo ? "(−10% avant 1er nov)" : ""}</span><span className="v">{pricing.price}${promo ? <span style={{ color: "var(--faint)", textDecoration: "line-through", fontWeight: 400, marginLeft: 6 }}>{pricing.full}$</span> : ""}</span></div>
            <div className="vnd-price"><span className="k">Dépôt (10%)</span><span className="v">{pricing.deposit}$</span></div>
            <p style={{ fontSize: ".72rem", color: "var(--faint)", marginTop: 8 }}>Prix affichés, non négociables. Le paiement se crée à l&apos;onglet ci-dessous (montant calculé automatiquement).</p>
          </>
        ) : (
          <p className="vnd-empty" style={{ padding: "8px 0" }}>Type de piscine à confirmer avec le client pour afficher le prix.</p>
        )}
      </div>

      {/* Paiement — Phase 3 */}
      <div className="vnd-card">
        <p className="lbl" style={{ marginBottom: 8 }}>Encaisser</p>
        <button className="vnd-btn" disabled title="Disponible à la prochaine mise à jour">💳 Créer un paiement (bientôt)</button>
        <p style={{ fontSize: ".72rem", color: "var(--faint)", marginTop: 8 }}>Dépôt, saison comptant ou mensuel — lien envoyé par texto en un clic.</p>
      </div>

      {/* Fil SMS */}
      <div className="vnd-card">
        <p className="lbl" style={{ marginBottom: 10 }}>Conversation ({msgs.length})</p>
        {msgs.length === 0 ? <p className="vnd-empty" style={{ padding: "6px 0" }}>Aucun message.</p> : (
          <div className="vnd-thread" style={{ maxHeight: 320, overflowY: "auto", marginBottom: 12 }}>
            {msgs.map((m) => (
              <div key={m.id} className={`vnd-bub ${m.direction === "inbound" ? "in" : "out"}`}>
                {m.direction === "outbound" && <span className="who">{m.sent_via === "closer" ? "Toi" : m.sent_via === "admin" ? "Admin" : "ALTAMAR (auto)"}</span>}
                {m.body}
              </div>
            ))}
          </div>
        )}
        <textarea className="vnd-textarea" rows={2} placeholder="Écrire un texto (part du numéro ALTAMAR)…" value={smsBody} onChange={(e) => setSmsBody(e.target.value)} />
        <button className="vnd-btn" style={{ marginTop: 8 }} disabled={!smsBody.trim() || sending} onClick={sendSms}>{sending ? "Envoi…" : "Envoyer le texto"}</button>
      </div>

      {/* Journaliser un appel */}
      <div className="vnd-card">
        <p className="lbl" style={{ marginBottom: 10 }}>Journaliser un appel</p>
        <div style={{ display: "grid", gap: 9 }}>
          <select className="vnd-select" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
          </select>
          <input className="vnd-input" placeholder="Objection du client (ses mots exacts)" value={objection} onChange={(e) => setObjection(e.target.value)} />
          <textarea className="vnd-textarea" rows={2} placeholder="Notes d'appel" value={callNotes} onChange={(e) => setCallNotes(e.target.value)} />
          <label style={{ fontSize: ".78rem", color: "var(--mut)" }}>Prochain rappel (optionnel)
            <input className="vnd-input" type="datetime-local" value={callback} onChange={(e) => setCallback(e.target.value)} style={{ marginTop: 4 }} />
          </label>
          <button className="vnd-btn" disabled={logging} onClick={logCall}>{logging ? "…" : "Enregistrer l'appel"}</button>
        </div>
      </div>

      {/* Statut rapide */}
      <div className="vnd-card">
        <p className="lbl" style={{ marginBottom: 10 }}>Statut</p>
        <div className="vnd-btn-row">
          <button className="vnd-btn-ghost" onClick={() => setStatus("negociation")}>💬 En négociation</button>
          <button className="vnd-btn-ghost" onClick={() => setShowLost(!showLost)} style={{ color: "var(--red)" }}>Marquer perdu</button>
        </div>
        {showLost && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            <input className="vnd-input" placeholder="Raison (obligatoire)" value={lostReason} onChange={(e) => setLostReason(e.target.value)} />
            <button className="vnd-btn" style={{ background: "var(--red)", color: "#fff" }} disabled={!lostReason.trim()} onClick={markLost}>Confirmer perdu</button>
          </div>
        )}
        <p style={{ fontSize: ".72rem", color: "var(--faint)", marginTop: 10 }}>Un client négocie? Mets « En négociation » — c&apos;est l&apos;admin qui tranche sur un prix. Tu ne peux pas changer un prix.</p>
      </div>

      {/* Historique appels */}
      {calls.length > 0 && (
        <div className="vnd-card">
          <p className="lbl" style={{ marginBottom: 10 }}>Appels ({calls.length})</p>
          {calls.map((c) => (
            <div className="vnd-row" key={c.id} style={{ display: "block" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontWeight: 700, fontSize: ".84rem" }}>{OUTCOMES.find((o) => o.v === c.outcome)?.l || c.outcome}</span>
                <span style={{ fontSize: ".74rem", color: "var(--faint)" }}>{new Date(c.called_at).toLocaleString("fr-CA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              {c.objection && <div style={{ fontSize: ".8rem", color: "var(--warn)", marginTop: 3 }}>« {c.objection} »</div>}
              {c.notes && <div style={{ fontSize: ".8rem", color: "var(--mut)", marginTop: 3 }}>{c.notes}</div>}
            </div>
          ))}
        </div>
      )}

      {err && <p className="vnd-err">{err}</p>}
    </div>
  );
}
