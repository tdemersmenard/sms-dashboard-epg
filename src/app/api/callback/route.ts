export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { getActiveFranchiseId } from "@/lib/franchise-context";

const MIGRATION_REQUIRED_CODES = ["42703", "PGRST204"];

function isMigrationError(code: string | undefined) {
  return MIGRATION_REQUIRED_CODES.includes(code ?? "");
}

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { data: contacts, error } = await supabaseAdmin
      .from("contacts")
      .select("id, first_name, last_name, phone, stage, callback_status, callback_added_at")
      .eq("franchise_id", franchiseId)
      .eq("callback_status", "a_rappeler")
      .order("callback_added_at", { ascending: true });

    if (error) {
      if (isMigrationError(error.code)) {
        return NextResponse.json({ contacts: [], migrationRequired: true });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const now = Date.now();

    // Enrich with last inbound message
    const enriched = await Promise.all(
      (contacts ?? []).map(async (c) => {
        const { data: lastMsg } = await supabaseAdmin
          .from("messages")
          .select("body, created_at")
          .eq("contact_id", c.id)
          .eq("direction", "inbound")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const addedAt = c.callback_added_at ? new Date(c.callback_added_at).getTime() : now;
        const daysInList = Math.floor((now - addedAt) / (1000 * 60 * 60 * 24));

        return {
          ...c,
          last_message_body: lastMsg?.body ?? null,
          last_message_at: lastMsg?.created_at ?? null,
          days_in_list: daysInList,
        };
      })
    );

    return NextResponse.json({ contacts: enriched, migrationRequired: false });
  } catch (err) {
    return NextResponse.json({ error: String(err), contacts: [], migrationRequired: false }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { contactId, action } = await req.json();
  if (!contactId || !action) {
    return NextResponse.json({ error: "contactId et action requis" }, { status: 400 });
  }

  let updates: Record<string, string | null> = {};

  if (action === "closé") {
    updates = { callback_status: "rappel_fait_closed", stage: "closé" };
  } else if (action === "perdu") {
    updates = { callback_status: "rappel_fait_perdu", stage: "perdu" };
  } else if (action === "later") {
    // Move to end of list by resetting callback_added_at to now
    updates = { callback_added_at: new Date().toISOString() };
  } else {
    return NextResponse.json({ error: "action invalide" }, { status: 400 });
  }

  const franchiseId = await getActiveFranchiseId();
  const { error } = await supabaseAdmin
    .from("contacts")
    .update(updates)
    .eq("id", contactId)
    .eq("franchise_id", franchiseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// Count endpoint — used by sidebar badge
export async function HEAD() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { count, error } = await supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .eq("franchise_id", franchiseId)
      .eq("callback_status", "a_rappeler");

    if (error) return new NextResponse(null, { status: 204, headers: { "X-Count": "0" } });
    return new NextResponse(null, { status: 204, headers: { "X-Count": String(count ?? 0) } });
  } catch {
    return new NextResponse(null, { status: 204, headers: { "X-Count": "0" } });
  }
}
