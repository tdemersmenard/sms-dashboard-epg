export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function PATCH(req: NextRequest) {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { jobId, employeeId } = await req.json();
    if (!jobId) return NextResponse.json({ error: "jobId requis" }, { status: 400 });

    const { data: job, error } = await supabaseAdmin
      .from("jobs")
      .update({ assigned_employee_id: employeeId || null })
      .eq("id", jobId)
      .eq("franchise_id", franchiseId)
      .select("id, contact_id, job_type, scheduled_date, scheduled_time_start, assigned_employee_id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // SMS notification to employee when assigning (not when removing)
    if (employeeId && job) {
      try {
        const { data: employee } = await supabaseAdmin
          .from("employees")
          .select("name, phone")
          .eq("id", employeeId)
          .single();

        if (employee?.phone) {
          const { data: contact } = await supabaseAdmin
            .from("contacts")
            .select("first_name, last_name, address")
            .eq("id", job.contact_id)
            .single();

          const clientName = contact
            ? `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || "Client"
            : "Client";
          const dateStr = new Date(job.scheduled_date + "T12:00:00").toLocaleDateString("fr-CA", {
            weekday: "long", day: "numeric", month: "long",
          });
          const timeStr = job.scheduled_time_start ? ` à ${job.scheduled_time_start.slice(0, 5)}` : "";
          const addrStr = contact?.address ? ` — ${contact.address}` : "";
          const smsBody = `CHLORE: Nouveau job assigné — ${job.job_type} pour ${clientName} le ${dateStr}${timeStr}${addrStr}`;

          // Find the employee's contact record (by phone) to use /api/sms/send
          const { data: empContact } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", employee.phone)
            .single();

          if (empContact) {
            const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://sms-dashboard-epg.vercel.app";
            await fetch(`${baseUrl}/api/sms/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ contactId: empContact.id, body: smsBody }),
            });
          }
        }
      } catch (smsErr) {
        console.error("[jobs/assign] SMS error:", smsErr);
        // Don't fail the request if SMS fails
      }
    }

    return NextResponse.json({ ok: true, job });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
