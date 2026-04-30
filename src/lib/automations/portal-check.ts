import { supabaseAdmin } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";

export async function createMissingPortals(): Promise<string[]> {
  const logs: string[] = [];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";

  // Trouver les clients closés/planifiés avec email mais sans portail
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, first_name, last_name, email, phone, portal_password")
    .in("stage", ["closé", "planifié", "complété"])
    .not("email", "is", null)
    .is("portal_password", null);

  for (const contact of contacts || []) {
    if (contact.phone === "+14509942215") continue;
    if (!contact.email) continue;

    try {
      const tempPassword = Math.random().toString(36).slice(-8);
      const hash = await bcrypt.hash(tempPassword, 10);
      const token = crypto.randomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await supabaseAdmin
        .from("contacts")
        .update({
          portal_password: hash,
          portal_token: token,
          portal_token_expires: expires.toISOString(),
        })
        .eq("id", contact.id);

      await fetch(`${baseUrl}/api/sms/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          body: `Votre portail client est prêt! Connectez-vous sur https://sms-dashboard-epg.vercel.app/portail avec:\nEmail: ${contact.email}\nMot de passe: ${tempPassword}\n\nVous pourrez y voir vos rendez-vous et paiements.`,
        }),
      });

      logs.push(`Portail créé pour ${contact.first_name} ${contact.last_name || ""}`);
    } catch (e) {
      logs.push(`Erreur portail ${contact.first_name}: ${e}`);
    }
  }

  if (logs.length === 0) logs.push("Tous les clients closés ont déjà un portail");
  return logs;
}
