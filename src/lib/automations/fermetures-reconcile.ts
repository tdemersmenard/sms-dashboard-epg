import { supabaseAdmin } from "@/lib/supabase";

/**
 * Réconciliation des fermetures Flow B (fermeture à facturer, non incluse dans un forfait).
 *
 * Le bot fait le BOOK_JOB de façon fiable, mais le CLOSE_DEAL dépend du fil de la
 * conversation (le client part sur des questions techniques → pas d'adresse/email →
 * pas de paiement). Ce réconciliateur garantit qu'aucune fermeture bookée ne reste
 * sans paiement:
 *  - type de piscine connu   → crée le paiement (200$ hors-terre / 250$ creusée),
 *    ajoute le service, met le stage à "closé", notifie le propriétaire
 *  - type de piscine inconnu → demande au client par SMS (une seule fois);
 *    ai-extract-info sauvegarde sa réponse → le paiement se crée au tick suivant.
 *    Sans réponse après 24h → alerte au propriétaire (une seule fois).
 *
 * Idempotent: chaque étape est gardée par l'existence du paiement ou un log.
 */

const FERMETURE_PRICES: Record<string, number> = {
  "hors-terre": 200,
  "creusée": 250,
};

async function notifyOwner(franchiseId: string, body: string, baseUrl: string): Promise<boolean> {
  const { data: f } = await supabaseAdmin
    .from("franchises")
    .select("owner_phone")
    .eq("id", franchiseId)
    .single();
  if (!f?.owner_phone) {
    console.error(`[fermetures-reconcile] owner_phone manquant pour franchise ${franchiseId}`);
    return false;
  }
  const { data: owner } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", f.owner_phone)
    .eq("franchise_id", franchiseId)
    .maybeSingle();
  if (!owner) return false;
  const resp = await fetch(`${baseUrl}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contactId: owner.id, body }),
  }).catch(() => null);
  return !!resp?.ok;
}

export async function reconcileFermetures(franchiseId: string): Promise<string[]> {
  const out: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Montreal" });

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("id, contact_id, scheduled_date")
    .eq("franchise_id", franchiseId)
    .eq("job_type", "fermeture")
    .neq("status", "annulé")
    .gte("scheduled_date", today);

  for (const job of jobs || []) {
    try {
      const { data: c } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, phone, services, pool_type, season_price, stage")
        .eq("id", job.contact_id)
        .maybeSingle();
      if (!c?.phone || !c.phone.startsWith("+")) continue;

      const servicesStr = (c.services || []).join(" ");
      if (/entretien|package/i.test(servicesStr)) continue; // fermeture incluse (Flow A)

      const { data: pays } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("contact_id", c.id)
        .ilike("notes", "%fermeture%")
        .limit(1);
      if (pays && pays.length > 0) continue; // déjà facturé

      const name = [c.first_name, c.last_name].filter(Boolean).join(" ") || c.phone;

      if (c.pool_type && FERMETURE_PRICES[c.pool_type]) {
        // ─── Type connu → créer le paiement + cohérence du dossier ───────────
        const amount = FERMETURE_PRICES[c.pool_type];
        const { error: payErr } = await supabaseAdmin.from("payments").insert({
          contact_id: c.id,
          amount,
          method: "interac",
          status: "en_attente",
          due_date: job.scheduled_date,
          notes: `fermeture (${c.pool_type})`,
          franchise_id: franchiseId,
        });
        if (payErr) {
          console.error(`[fermetures-reconcile] payment insert failed for ${name}:`, payErr.message);
          continue;
        }

        await supabaseAdmin.from("contacts").update({
          services: Array.from(new Set([...(c.services || []), "fermeture"])),
          season_price: (Number(c.season_price) || 0) + amount,
          stage: "closé",
        }).eq("id", c.id);

        await supabaseAdmin.from("automation_logs").insert({
          action: "fermeture_payment_reconcile",
          contact_id: c.id,
          status: "success",
          details: { amount, pool_type: c.pool_type, jobDate: job.scheduled_date },
          franchise_id: franchiseId,
        });

        await notifyOwner(
          franchiseId,
          `CHLORE: paiement de ${amount}$ créé automatiquement pour la fermeture de ${name} (${c.pool_type}, RDV ${job.scheduled_date}) — le closing du bot était resté incomplet.`,
          baseUrl,
        );
        out.push(`paiement créé: ${name} ${amount}$`);
      } else {
        // ─── Type inconnu → demander au client (une fois), puis alerter (une fois) ──
        const { data: asked } = await supabaseAdmin
          .from("automation_logs")
          .select("id, created_at")
          .eq("action", "fermeture_pooltype_ask")
          .eq("contact_id", c.id)
          .limit(1);

        if (!asked || asked.length === 0) {
          const resp = await fetch(`${baseUrl}/api/sms/send`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactId: c.id,
              body: "Petite précision pour finaliser votre dossier de fermeture: votre piscine est-elle hors-terre ou creusée?",
            }),
          }).catch(() => null);
          if (resp?.ok) {
            await supabaseAdmin.from("automation_logs").insert({
              action: "fermeture_pooltype_ask",
              contact_id: c.id,
              status: "success",
              details: { jobDate: job.scheduled_date },
              franchise_id: franchiseId,
            });
            out.push(`type de piscine demandé: ${name}`);
          }
        } else {
          const askedAt = new Date(asked[0].created_at).getTime();
          const dayMs = 24 * 60 * 60 * 1000;
          if (Date.now() - askedAt > dayMs) {
            const { data: alerted } = await supabaseAdmin
              .from("automation_logs")
              .select("id")
              .eq("action", "fermeture_pooltype_alert")
              .eq("contact_id", c.id)
              .limit(1);
            if (!alerted || alerted.length === 0) {
              await notifyOwner(
                franchiseId,
                `CHLORE ⚠️: ${name} a une fermeture bookée le ${job.scheduled_date} mais AUCUN paiement — type de piscine inconnu et pas de réponse depuis 24h. Confirme le type dans sa fiche et le paiement se créera tout seul.`,
                baseUrl,
              );
              await supabaseAdmin.from("automation_logs").insert({
                action: "fermeture_pooltype_alert",
                contact_id: c.id,
                status: "success",
                details: { jobDate: job.scheduled_date },
                franchise_id: franchiseId,
              });
              out.push(`alerte owner (type inconnu 24h+): ${name}`);
            }
          }
        }
      }
    } catch (e) {
      console.error("[fermetures-reconcile] error on job", job.id, e);
    }
  }

  return out;
}
