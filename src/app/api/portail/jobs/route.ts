export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

async function getContactFromToken(req: NextRequest) {
  const token = req.cookies.get("portal_token")?.value ?? req.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return null;
  const { data } = await supabaseAdmin
    .from("contacts")
    .select("id, portal_token_expires")
    .eq("portal_token", token)
    .single();
  if (!data || new Date(data.portal_token_expires) < new Date()) return null;
  return data;
}

export async function GET(req: NextRequest) {
  const contact = await getContactFromToken(req);
  if (!contact) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { data: jobs } = await supabaseAdmin
    .from("jobs")
    .select("*")
    .eq("contact_id", contact.id)
    .neq("job_type", "autre")
    .order("scheduled_date", { ascending: true });

  console.log("[portail/jobs] Contact ID:", contact.id, "Jobs found:", jobs?.length);

  const today = new Date(new Date().toISOString().split("T")[0]);

  const upcoming = (jobs || []).filter(j =>
    j.status !== "annulé" && j.status !== "complété" && new Date(j.scheduled_date) >= today
  );
  const past = (jobs || []).filter(j =>
    j.status === "complété" || new Date(j.scheduled_date) < today
  );

  return NextResponse.json({ upcoming, past }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "CDN-Cache-Control": "no-store",
      "Vercel-CDN-Cache-Control": "no-store",
    },
  });
}
