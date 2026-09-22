export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizePhone } from "@/lib/utils";
import { GRANBY_FRANCHISE_ID } from "@/lib/franchise";
import { firstNameFrom } from "@/lib/name";

// GET — Facebook verification handshake
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const mode      = searchParams.get("hub.mode");
  const token     = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.FACEBOOK_VERIFY_TOKEN &&
    challenge
  ) {
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

/**
 * Returns true if the franchise can send SMS (has its own Twilio, or is Granby using env vars).
 * Prevents accidentally sending the first message from Granby's number for another franchise.
 */
async function franchiseCanSendSMS(franchiseId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("franchises")
    .select("twilio_phone_number, twilio_account_sid")
    .eq("id", franchiseId)
    .maybeSingle();

  if (data?.twilio_phone_number && data?.twilio_account_sid) return true;

  // Granby fallback: uses global env vars
  if (franchiseId === GRANBY_FRANCHISE_ID) {
    return !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_PHONE_NUMBER);
  }

  return false;
}

/**
 * Resolve franchise_id from the request body.
 * Supports: franchise_id (UUID), franchise_slug (lookup).
 * Defaults to Granby.
 */
async function resolveFranchiseId(body: Record<string, unknown>): Promise<string> {
  // Direct UUID
  if (body.franchise_id && typeof body.franchise_id === "string") {
    return body.franchise_id;
  }

  // Slug lookup
  if (body.franchise_slug && typeof body.franchise_slug === "string") {
    const { data } = await supabaseAdmin
      .from("franchises")
      .select("id")
      .eq("slug", body.franchise_slug)
      .eq("status", "active")
      .maybeSingle();
    if (data?.id) return data.id;
  }

  return GRANBY_FRANCHISE_ID;
}

// POST — Receive Facebook Lead Ads events
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // ── Detect format: Make.com (has phone) vs Facebook native (has entry) ──
    const entries = body?.entry ?? [];
    const isMakeFormat = !!(body.phone || body.name || body.first_name);

    if (isMakeFormat) {
      // ── MAKE.COM FORMAT ──
      // Campagne Saison 2027: si le scénario Make envoie les réponses du form
      // (type de piscine + readiness), tout le pipeline 2027 se déclenche
      // (prix, dépôt Stripe, SMS routés, relances). Sinon: flux classique.
      const poolTypeRaw = body.pool_type || body.type_piscine || body.q1 || null;
      const readinessRaw = body.readiness || body.quand || body.q2 || null;
      const spaUsageRaw = body.spa_usage || body.usage_spa || body.spa || null;
      const isSpa = !!(body.campaign_spa || spaUsageRaw);
      const is2027 = !isSpa && !!(body.campaign_2027 || poolTypeRaw || readinessRaw);

      if (isSpa && body.phone) {
        const { processSpaLead } = await import("@/lib/meta-spa");
        const franchiseIdSpa = await resolveFranchiseId(body);
        const logs = await processSpaLead(
          {
            firstName: body.first_name || body.full_name || body.name || null,
            phone: String(body.phone),
            city: body.city || body.ville || null,
            usageRaw: String(spaUsageRaw || ""),
          },
          {
            leadgen_id: String(body.leadgen_id || body.lead_id || `make-spa-${Date.now()}`),
            ad_id: body.ad_id ? String(body.ad_id) : null,
            adset_id: body.adset_id ? String(body.adset_id) : null,
            campaign_id: body.campaign_id ? String(body.campaign_id) : null,
            form_id: body.form_id ? String(body.form_id) : null,
            ad_name: body.ad_name ? String(body.ad_name) : null,
            campaign_name: body.campaign_name ? String(body.campaign_name) : null,
          },
          franchiseIdSpa,
        );
        console.log("[leads webhook] Make → pipeline SPA:\n  " + logs.join("\n  "));
        return NextResponse.json({ success: true, pipeline: "spa", logs });
      }

      if (is2027 && body.phone) {
        const { processSaison2027Lead } = await import("@/lib/meta-saison-2027");
        const franchiseId2027 = await resolveFranchiseId(body);
        const logs = await processSaison2027Lead(
          {
            firstName: body.first_name || body.full_name || body.name || null,
            phone: String(body.phone),
            city: body.city || body.ville || null,
            poolTypeRaw: String(poolTypeRaw || ""),
            readinessRaw: String(readinessRaw || ""),
          },
          {
            leadgen_id: String(body.leadgen_id || body.lead_id || `make-${Date.now()}`),
            ad_id: body.ad_id ? String(body.ad_id) : null,
            adset_id: body.adset_id ? String(body.adset_id) : null,
            campaign_id: body.campaign_id ? String(body.campaign_id) : null,
            form_id: body.form_id ? String(body.form_id) : null,
            ad_name: body.ad_name ? String(body.ad_name) : null,
            campaign_name: body.campaign_name ? String(body.campaign_name) : null,
          },
          franchiseId2027,
        );
        console.log("[leads webhook] Make → pipeline 2027:\n  " + logs.join("\n  "));
        return NextResponse.json({ success: true, pipeline: "saison_2027", logs });
      }

      const rawName = body.first_name || body.full_name || body.name || null;
      const firstName = firstNameFrom(rawName);
      let lastName = body.last_name || null;
      const rawPhone = body.phone || null;
      const email = body.email || null;

      // Nom de famille = reste du nom complet, si non fourni séparément
      if (!lastName && rawName) {
        const parts = String(rawName).trim().split(/\s+/);
        lastName = parts.slice(1).join(" ") || null;
      }

      if (!rawPhone) {
        return NextResponse.json({ error: "phone is required" }, { status: 400 });
      }

      const phone = normalizePhone(rawPhone);
      const franchiseId = await resolveFranchiseId(body);

      // ── Find existing contact (same phone + same franchise) ──
      let { data: existing } = await supabaseAdmin
        .from("contacts")
        .select("id, phone, first_name, last_name, franchise_id")
        .eq("phone", phone)
        .eq("franchise_id", franchiseId)
        .maybeSingle();

      // ── Fallback: claim orphan contact (same phone, NULL franchise_id) ──
      if (!existing) {
        const { data: orphan } = await supabaseAdmin
          .from("contacts")
          .select("id, phone, first_name, last_name, franchise_id")
          .eq("phone", phone)
          .is("franchise_id", null)
          .maybeSingle();

        if (orphan) {
          // Claim orphan: set franchise_id
          await supabaseAdmin
            .from("contacts")
            .update({ franchise_id: franchiseId })
            .eq("id", orphan.id);
          existing = { ...orphan, franchise_id: franchiseId };
        }
      }

      let contact;

      if (existing) {
        // Update name/email if we have better data
        const updates: Record<string, string> = {};
        if (firstName && !existing.first_name) updates.first_name = firstName;
        if (lastName && !existing.last_name) updates.last_name = lastName;
        if (email) updates.email = email;
        // Always update name if provided (lead form has the real name)
        if (firstName) updates.first_name = firstName;
        if (lastName) updates.last_name = lastName;

        const { data } = await supabaseAdmin
          .from("contacts")
          .update(updates)
          .eq("id", existing.id)
          .select()
          .single();
        contact = data;

        await supabaseAdmin.from("automation_logs").insert({
          contact_id: existing.id,
          franchise_id: franchiseId,
          type: "info",
          action: "facebook_resubmit",
          message: `Lead Facebook re-soumis par ${firstName ?? existing.phone}`,
          ran_at: new Date().toISOString(),
          status: "success",
        });
      } else {
        const { data } = await supabaseAdmin
          .from("contacts")
          .insert({
            first_name: firstName,
            last_name: lastName,
            phone,
            email,
            stage: "nouveau",
            lead_source: "facebook",
            franchise_id: franchiseId,
          })
          .select()
          .single();
        contact = data;
      }

      // Send SMS only for NEW contacts
      if (!existing && contact && contact.phone) {
        try {
          const canSend = await franchiseCanSendSMS(franchiseId);
          if (!canSend) {
            console.warn(`[leads webhook] Franchise ${franchiseId} sans Twilio configuré — SMS ignoré pour ${contact.phone}`);
          } else {
          const { data: template } = await supabaseAdmin
            .from("message_templates")
            .select("body")
            .eq("name", "Premier contact")
            .maybeSingle();

          if (template) {
            const name = contact.first_name || "";
            const messageBody = template.body.replace(/\{\{prénom\}\}/g, name);

            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;

            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contactId: contact.id,
                body: messageBody,
              }),
            });
          }
          } // end else (canSend)
        } catch (smsErr) {
          console.error("[leads webhook] SMS send error:", smsErr);
        }
      }

      return NextResponse.json({ success: true, contact, isNew: !existing });

    } else if (entries.length > 0) {
      // ── FACEBOOK NATIVE FORMAT ──
      // Fetch complet via l'API Graph puis traitement Saison 2027 (prix, dépôt,
      // SMS routés par readiness). Fallback: contact minimal si le fetch échoue.
      const { fetchMetaLead, processSaison2027Lead } = await import("@/lib/meta-saison-2027");
      const allLogs: string[] = [];

      for (const entry of entries) {
        const changes = entry?.changes ?? [];
        for (const change of changes) {
          if (change.field !== "leadgen") continue;
          const leadgenId = change.value?.leadgen_id ?? entry?.id ?? "unknown";
          console.log("[fb-webhook] leadgen received:", leadgenId);

          // Anti-doublon (Meta retry le webhook)
          const { data: dup } = await supabaseAdmin
            .from("automation_logs").select("id")
            .eq("action", "meta_leadgen_received").contains("details", { leadgen_id: leadgenId }).limit(1);
          if (dup && dup.length) { allLogs.push(`${leadgenId}: déjà traité, skip`); continue; }
          await supabaseAdmin.from("automation_logs").insert({
            action: "meta_leadgen_received", status: "success",
            details: { leadgen_id: leadgenId }, franchise_id: GRANBY_FRANCHISE_ID,
          });

          const lead = await fetchMetaLead(leadgenId);
          if (lead && lead.fields.spaUsageRaw && !lead.fields.poolTypeRaw) {
            const { processSpaLead } = await import("@/lib/meta-spa");
            const logs = await processSpaLead(
              { firstName: lead.fields.firstName, phone: lead.fields.phone, city: lead.fields.city, usageRaw: lead.fields.spaUsageRaw },
              lead.attribution,
              GRANBY_FRANCHISE_ID,
            );
            console.log(`[fb-webhook] lead SPA ${leadgenId}:\n  ` + logs.join("\n  "));
            allLogs.push(...logs);
          } else if (lead) {
            const logs = await processSaison2027Lead(lead.fields, lead.attribution, GRANBY_FRANCHISE_ID);
            console.log(`[fb-webhook] lead ${leadgenId}:\n  ` + logs.join("\n  "));
            allLogs.push(...logs);
          } else {
            // Fetch Graph impossible (token manquant/expiré) — contact minimal + alerte
            await supabaseAdmin.from("contacts").insert({
              first_name: "Lead Facebook",
              last_name: leadgenId.slice(0, 8),
              phone: null,
              stage: "nouveau",
              lead_source: "meta_saison_2027",
              notes: `⚠️ Fetch Graph API échoué pour leadgen ${leadgenId} — récupérer manuellement dans Meta Ads Manager (vérifier META_PAGE_ACCESS_TOKEN).`,
              franchise_id: GRANBY_FRANCHISE_ID,
            });
            allLogs.push(`${leadgenId}: ❌ fetch Graph échoué — contact minimal créé + à récupérer manuellement`);
            try {
              const { data: fr } = await supabaseAdmin.from("franchises").select("owner_phone").eq("id", GRANBY_FRANCHISE_ID).single();
              const { data: owner } = fr?.owner_phone
                ? await supabaseAdmin.from("contacts").select("id").eq("phone", fr.owner_phone).eq("franchise_id", GRANBY_FRANCHISE_ID).maybeSingle()
                : { data: null };
              if (owner) {
                const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
                await fetch(`${baseUrl}/api/sms/send`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ contactId: owner.id, body: `CHLORE ⚠️ Lead Meta 2027 reçu mais IMPOSSIBLE de récupérer ses infos (token Graph?). Leadgen ${leadgenId} — va le chercher dans Meta Ads Manager.` }),
                });
              }
            } catch {}
          }
        }
      }
      return NextResponse.json({ ok: true, logs: allLogs });

    } else {
      return NextResponse.json({ error: "Unknown payload format" }, { status: 400 });
    }
  } catch (err) {
    console.error("[fb-webhook] error:", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
