/**
 * CHLORE — Franchise context utilities
 *
 * Fournit:
 * - Chiffrement AES-256-GCM des credentials Twilio
 * - getFranchiseContext(id) — charge les infos de la franchise depuis la DB
 * - getTwilioForFranchise(id) — retourne le client Twilio de la franchise
 * - getFranchiseByPhoneNumber(to) — route un webhook vers la bonne franchise
 */

import { supabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

/** UUID fixe de la franchise Granby (franchise originale de Thomas) */
export const GRANBY_FRANCHISE_ID = "00000000-0000-0000-0000-000000000001";

// ─── CHIFFREMENT ──────────────────────────────────────────────────────────────

function getEncKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (raw.length < 32) {
    // Clé manquante: utiliser un fallback nul (les franchises utiliseront les env vars globaux)
    return Buffer.alloc(32, 0);
  }
  // Prendre les 32 premiers bytes de la clé (peut être hex ou utf-8)
  return raw.length === 64
    ? Buffer.from(raw, "hex")          // 64 hex chars = 32 bytes
    : Buffer.from(raw.slice(0, 32));   // 32 utf-8 chars
}

/** Chiffre un secret (ex: Twilio auth token) pour stockage en DB */
export function encryptSecret(text: string): string {
  const key = getEncKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(text, "utf-8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Déchiffre un secret stocké en DB */
export function decryptSecret(stored: string): string {
  try {
    const [ivHex, tagHex, dataHex] = stored.split(":");
    const key  = getEncKey();
    const iv   = Buffer.from(ivHex,  "hex");
    const tag  = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex,"hex");
    const dec  = crypto.createDecipheriv("aes-256-gcm", key, iv);
    dec.setAuthTag(tag);
    return Buffer.concat([dec.update(data), dec.final()]).toString("utf-8");
  } catch {
    return "";
  }
}

// ─── FRANCHISE CONTEXT ────────────────────────────────────────────────────────

export interface FranchiseContext {
  id: string;
  name: string;
  status: string;
  twilioAccountSid: string;
  twilioAuthToken: string;   // déchiffré, prêt à l'emploi
  twilioPhoneNumber: string;
  email: string | null;
  paymentInteracEmail: string | null;
  royaltyPercent: number;
  monthlyFee: number;
}

/**
 * Charge le contexte d'une franchise depuis la DB.
 * Fallback sur les env vars globaux si les credentials Twilio ne sont pas configurés.
 */
export async function getFranchiseContext(franchiseId: string): Promise<FranchiseContext | null> {
  const { data: f, error } = await supabaseAdmin
    .from("franchises")
    .select(
      "id, name, status, twilio_account_sid, twilio_auth_token_encrypted, twilio_phone_number, email, payment_interac_email, royalty_percent, monthly_fee"
    )
    .eq("id", franchiseId)
    .single();

  if (error || !f) return null;

  return {
    id:                 f.id,
    name:               f.name,
    status:             f.status,
    twilioAccountSid:   f.twilio_account_sid       || process.env.TWILIO_ACCOUNT_SID    || "",
    twilioAuthToken:    f.twilio_auth_token_encrypted
                          ? decryptSecret(f.twilio_auth_token_encrypted)
                          : (process.env.TWILIO_AUTH_TOKEN || ""),
    twilioPhoneNumber:  f.twilio_phone_number      || process.env.TWILIO_PHONE_NUMBER   || "",
    email:              f.email,
    paymentInteracEmail: f.payment_interac_email,
    royaltyPercent:     f.royalty_percent ?? 8,
    monthlyFee:         f.monthly_fee     ?? 200,
  };
}

// ─── TWILIO FACTORY ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface FranchiseTwilio {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
  phoneNumber: string;
  franchiseId: string;
}

/**
 * Retourne un client Twilio configuré pour la franchise donnée.
 * Si la franchise n'a pas ses propres credentials, utilise les env vars globaux (Granby).
 */
export async function getTwilioForFranchise(franchiseId: string): Promise<FranchiseTwilio | null> {
  const ctx = await getFranchiseContext(franchiseId);
  if (!ctx) return null;
  if (!ctx.twilioAccountSid || !ctx.twilioAuthToken) return null;

  const twilio = (await import("twilio")).default;
  return {
    client: twilio(ctx.twilioAccountSid, ctx.twilioAuthToken),
    phoneNumber: ctx.twilioPhoneNumber,
    franchiseId,
  };
}

// ─── WEBHOOK ROUTING ──────────────────────────────────────────────────────────

/**
 * Identifie quelle franchise possède le numéro Twilio de destination.
 * Utilisé dans le webhook pour router le bon message vers la bonne franchise.
 *
 * Ordre de priorité:
 * 1. Franchise active avec ce numéro en DB
 * 2. Numéro correspond à TWILIO_PHONE_NUMBER global → Granby
 * 3. Fallback → Granby (backward compat)
 */
export async function getFranchiseByPhoneNumber(toNumber: string): Promise<string> {
  if (toNumber) {
    const { data } = await supabaseAdmin
      .from("franchises")
      .select("id")
      .eq("twilio_phone_number", toNumber)
      .eq("status", "active")
      .maybeSingle();

    if (data?.id) return data.id;

    if (toNumber === process.env.TWILIO_PHONE_NUMBER) return GRANBY_FRANCHISE_ID;
  }

  // Fallback: toujours Granby pour la backward compat
  return GRANBY_FRANCHISE_ID;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

/**
 * Retourne le franchise_id d'un admin_user.
 * is_master → peut voir toutes les franchises, mais appartient quand même à Granby.
 */
export function extractFranchiseId(user: Record<string, unknown> | null): string {
  if (!user) return GRANBY_FRANCHISE_ID;
  return (user.franchise_id as string) ?? GRANBY_FRANCHISE_ID;
}

export function isMasterUser(user: Record<string, unknown> | null): boolean {
  return !!(user?.is_master);
}
