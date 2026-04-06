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
    .select("id, services, portal_token_expires")
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
    .select("id, amount, status, method, received_date, due_date, notes, created_at")
    .eq("contact_id", contact.id)
    .order("created_at", { ascending: false });

  // Exclude Stripe-generated pending (method=stripe) — keep all others
  const payments = (allPayments || []).filter(p => !(p.status === "en_attente" && p.method === "stripe"));

  // Calculate totals using ALL payments (including future versements)
  const totalReceived = payments
    .filter(p => p.status === "reçu")
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const totalDemanded = payments
    .reduce((sum, p) => sum + (p.amount || 0), 0);

  const balance = totalDemanded - totalReceived;

  // Hide future versements until 14 days before due date
  const now = new Date();
  const visiblePayments = payments.filter(p => {
    if (p.status === "en_attente" && p.due_date) {
      const dueDate = new Date(p.due_date);
      const showDate = new Date(dueDate);
      showDate.setDate(showDate.getDate() - 14);
      if (now < showDate) return false;
    }
    return true;
  });

  return NextResponse.json({
    payments: visiblePayments,
    total: totalDemanded,
    total_paid: totalReceived,
    balance,
    services: contact.services || [],
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
