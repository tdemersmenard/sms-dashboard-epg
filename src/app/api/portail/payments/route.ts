export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getContactFromToken(req: NextRequest) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, season_price, services, portal_token_expires")
    .eq("portal_token", token)
    .single();
  if (!data || new Date(data.portal_token_expires) < new Date()) return null;
  return data;
}

export async function GET(req: NextRequest) {
  const contact = await getContactFromToken(req);
  if (!contact) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: allPayments } = await supabaseAdmin
    .from("payments")
    .select("id, amount, status, method, received_date, notes, created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });

  // Exclude Stripe-generated pending (method=stripe, status=en_attente)
  // Keep manually-created pending (method=en_attente) so the client can pay them
  const payments = (allPayments || []).filter(p => !(p.status === "en_attente" && p.method === "stripe"));

  const totalReceived = payments
    .filter(p => p.status === "reçu")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalPending = payments
    .filter(p => p.status === "en_attente")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalDemanded = totalReceived + totalPending;
  const seasonPrice = contact.season_price || 0;
  const total = Math.max(seasonPrice, totalDemanded);
  const balance = total - totalReceived;

  return NextResponse.json({
    payments,
    season_price: seasonPrice,
    services: contact.services || [],
    total_paid: totalReceived,
    total,
    balance,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
