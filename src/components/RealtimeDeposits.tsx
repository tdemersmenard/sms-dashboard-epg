"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

/* Écoute les paiements encaissés en direct (Supabase Realtime). Quand un
   vendeur encaisse un dépôt, une bannière apparaît et le dashboard se
   rafraîchit. Silencieux si Realtime n'est pas actif sur la table. */
export default function RealtimeDeposits() {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabaseBrowser
      .channel("admin-deposits")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "payments" }, (payload) => {
        const p = payload.new as { status?: string; amount?: number; created_by?: string | null };
        if (p.status === "reçu" && p.created_by) {
          setToast(`💰 Dépôt encaissé: ${p.amount}$`);
          setTimeout(() => window.location.reload(), 2500);
        }
      })
      .subscribe();
    return () => { supabaseBrowser.removeChannel(ch); };
  }, []);

  if (!toast) return null;
  return (
    <div style={{ position: "fixed", top: 16, right: 16, zIndex: 100, background: "#0C2540", border: "1px solid #3DDC97", color: "#F4FAFC", borderRadius: 12, padding: "12px 18px", boxShadow: "0 10px 30px rgba(0,0,0,.4)", fontWeight: 600 }}>
      {toast}
    </div>
  );
}
