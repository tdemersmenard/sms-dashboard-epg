import { supabaseAdmin } from "@/lib/supabase";

/**
 * Find or create a contact record for the franchise owner so we can send SMS via the normal pipeline.
 */
export async function getOwnerContactId(
  franchiseId: string,
  ownerPhone: string
): Promise<string | null> {
  // Find existing contact with this phone in this franchise
  let { data: owner } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("phone", ownerPhone)
    .eq("franchise_id", franchiseId)
    .maybeSingle();

  if (!owner) {
    // Create a minimal owner contact
    const { data: newOwner } = await supabaseAdmin
      .from("contacts")
      .insert({
        first_name: "Propriétaire",
        phone: ownerPhone,
        franchise_id: franchiseId,
        stage: "complété",
      })
      .select("id")
      .single();
    owner = newOwner;
  }

  return owner?.id ?? null;
}

/**
 * Look up a franchise by ID and return its owner_phone (and optionally other fields).
 */
export async function getFranchiseOwner(
  franchiseId: string
): Promise<{ owner_phone: string | null; name: string; slug: string; payment_interac_email: string | null; email: string | null } | null> {
  const { data } = await supabaseAdmin
    .from("franchises")
    .select("owner_phone, name, slug, payment_interac_email, email")
    .eq("id", franchiseId)
    .single();

  return data ?? null;
}
