import { supabaseAdmin } from "@/lib/supabase";

interface AIAction {
  type: "GENERATE_INVOICE" | "GENERATE_CONTRACT";
  service: string;
  amount: number;
}

export function parseActions(aiResponse: string): { cleanMessage: string; actions: AIAction[] } {
  const actions: AIAction[] = [];
  const lines = aiResponse.split("\n");
  const messageLines: string[] = [];

  for (const line of lines) {
    const match = line.match(/^__ACTION:(GENERATE_INVOICE|GENERATE_CONTRACT):(.+):(\d+)__$/);
    if (match) {
      actions.push({
        type: match[1] as AIAction["type"],
        service: match[2],
        amount: parseInt(match[3]),
      });
    } else {
      messageLines.push(line);
    }
  }

  return {
    cleanMessage: messageLines.join("\n").trim(),
    actions,
  };
}

export async function executeActions(actions: AIAction[], contactId: string) {
  for (const action of actions) {
    try {
      // Get contact info
      const { data: contact } = await supabaseAdmin
        .from("contacts")
        .select("*")
        .eq("id", contactId)
        .single();

      if (!contact) continue;

      const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ") || "Client";
      const now = new Date();
      const docPrefix = action.type === "GENERATE_INVOICE" ? "F" : "C";
      const docType = action.type === "GENERATE_INVOICE" ? "facture" : "contrat";

      // Generate doc number
      const { count } = await supabaseAdmin
        .from("documents")
        .select("id", { count: "exact", head: true })
        .eq("doc_type", docType);

      const docNumber = `${docPrefix}-2026-${String((count || 0) + 1).padStart(3, "0")}`;

      // Determine payment terms based on service
      let paymentTerms = "";
      if (action.service.includes("entretien")) {
        const firstPayment = Math.ceil(action.amount / 2);
        const secondPayment = action.amount - firstPayment;
        paymentTerms = `Versement 1: ${firstPayment}$ à la signature. Versement 2: ${secondPayment}$ mi-juillet 2026.`;
      } else {
        paymentTerms = `Paiement complet de ${action.amount}$ requis avant le service. Minimum 30% (${Math.ceil(action.amount * 0.3)}$) comme dépôt.`;
      }

      // Save document in DB
      const { data: doc } = await supabaseAdmin
        .from("documents")
        .insert({
          contact_id: contactId,
          doc_type: docType,
          doc_number: docNumber,
          amount: action.amount,
          status: "brouillon",
          data: {
            service: action.service,
            client_name: name,
            client_email: contact.email,
            client_phone: contact.phone,
            client_address: contact.address,
            payment_terms: paymentTerms,
            pool_type: contact.pool_type,
            generated_at: now.toISOString(),
          },
        })
        .select()
        .single();

      // If client has email, send document by email
      if (contact.email && doc) {
        await supabaseAdmin
          .from("documents")
          .update({ status: "envoyé" })
          .eq("id", doc.id);

        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
        await fetch(`${baseUrl}/api/email/send-document`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: doc.id,
            contactId,
          }),
        });
      }

      console.log(`[ai-actions] Created ${docType} ${docNumber} for ${name}: ${action.amount}$`);
    } catch (err) {
      console.error("[ai-actions] Error executing action:", err);
    }
  }
}
