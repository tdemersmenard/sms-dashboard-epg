"use client";

import { useState } from "react";
import { MessageCircle, Phone } from "lucide-react";

/* Contact — un message part directement dans le fil de l'équipe (même
   endroit que tes textos), ou texto/appel direct. */

export default function PortailContact() {
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/portail/contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("portal_token") || ""}`,
        },
        body: JSON.stringify({ message }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError("Le message n'est pas parti — réessaie ou texte-nous directement.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.35rem", fontWeight: 900, marginBottom: 6 }}>Nous joindre 💬</h1>
      <p style={{ color: "var(--muted)", fontSize: ".9rem", marginBottom: 16 }}>
        Ton message arrive directement dans notre système — le même fil que tes textos.
      </p>

      {sent ? (
        <div className="ptl-card glow" style={{ textAlign: "center", padding: "28px 18px" }}>
          <p style={{ fontSize: "1.6rem", marginBottom: 6 }}>🌊</p>
          <p style={{ fontWeight: 800, fontFamily: "var(--disp)" }}>Message envoyé!</p>
          <p className="ptl-note" style={{ marginTop: 4 }}>On te répond par texto — d&apos;habitude en moins d&apos;une minute.</p>
        </div>
      ) : (
        <form onSubmit={send} className="ptl-card glow" style={{ display: "grid", gap: 12 }}>
          <textarea
            className="ptl-input"
            rows={4}
            placeholder="Écris-nous ce qu'on peut faire pour toi…"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ resize: "none" }}
          />
          {error && <p className="ptl-err">{error}</p>}
          <button className="ptl-btn" disabled={!message.trim() || sending}>
            <MessageCircle size={17} /> {sending ? "Envoi…" : "Envoyer"}
          </button>
        </form>
      )}

      <div className="ptl-card" style={{ marginTop: 12 }}>
        <span className="lbl">Ou directement</span>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <a href="sms:+14509159650" className="ptl-btn-ghost"><MessageCircle size={16} /> Nous texter — 450 915-9650</a>
          <a href="tel:+14509942215" className="ptl-btn-ghost"><Phone size={16} /> Nous appeler — 450 994-2215</a>
        </div>
      </div>
    </div>
  );
}
