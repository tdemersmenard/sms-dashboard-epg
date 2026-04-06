export const dynamic = "force-dynamic";
export const maxDuration = 30;

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

interface Issue {
  severity: "error" | "warning" | "info";
  module: string;
  message: string;
  details?: unknown;
}

export async function GET() {
  const issues: Issue[] = [];
  const stats: Record<string, unknown> = {};

  try {
    // ─── 1. CONTACTS ───
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("*");

    stats.totalContacts = contacts?.length || 0;

    // Contacts sans first_name
    const noName = (contacts || []).filter(c => !c.first_name || c.first_name === "Inconnu" || c.first_name === "Lead Facebook");
    if (noName.length > 0) {
      issues.push({ severity: "warning", module: "contacts", message: `${noName.length} contacts sans nom`, details: noName.map(c => c.phone).slice(0, 5) });
    }

    // Contacts avec email mal formaté (majuscules)
    const badEmails = (contacts || []).filter(c => c.email && c.email !== c.email.toLowerCase());
    if (badEmails.length > 0) {
      issues.push({ severity: "warning", module: "contacts", message: `${badEmails.length} emails avec majuscules`, details: badEmails.map(c => c.email) });
    }

    // Clients entretien sans adresse
    const entretienNoAddr = (contacts || []).filter(c => {
      const svcs = c.services || [];
      return svcs.some((s: string) => s.toLowerCase().includes("entretien")) && (!c.address || c.address.length < 5);
    });
    if (entretienNoAddr.length > 0) {
      issues.push({ severity: "error", module: "routes", message: `${entretienNoAddr.length} clients entretien sans adresse`, details: entretienNoAddr.map(c => `${c.first_name} ${c.last_name || ""}`) });
    }

    // Clients entretien sans ouverture_date
    const entretienNoOuv = (contacts || []).filter(c => {
      const svcs = c.services || [];
      return svcs.some((s: string) => s.toLowerCase().includes("entretien")) && !c.ouverture_date;
    });
    if (entretienNoOuv.length > 0) {
      issues.push({ severity: "warning", module: "routes", message: `${entretienNoOuv.length} clients entretien sans date d'ouverture`, details: entretienNoOuv.map(c => `${c.first_name} ${c.last_name || ""}`) });
    }

    // ─── 2. JOBS ───
    const { data: jobs } = await supabaseAdmin
      .from("jobs")
      .select("*");

    stats.totalJobs = jobs?.length || 0;
    stats.jobsByType = {} as Record<string, number>;
    stats.jobsByStatus = {} as Record<string, number>;
    for (const j of jobs || []) {
      (stats.jobsByType as Record<string, number>)[j.job_type] = ((stats.jobsByType as Record<string, number>)[j.job_type] || 0) + 1;
      (stats.jobsByStatus as Record<string, number>)[j.status] = ((stats.jobsByStatus as Record<string, number>)[j.status] || 0) + 1;
    }

    // Jobs dans le passé qui sont encore "planifié"
    const today = new Date().toISOString().split("T")[0];
    const pastPlanned = (jobs || []).filter(j => j.scheduled_date < today && j.status === "planifié");
    if (pastPlanned.length > 0) {
      issues.push({ severity: "warning", module: "jobs", message: `${pastPlanned.length} jobs dans le passé encore en 'planifié'`, details: pastPlanned.length });
    }

    // ─── 3. PAYMENTS ───
    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("*");

    stats.totalPayments = payments?.length || 0;
    stats.paymentsByStatus = {} as Record<string, number>;
    for (const p of payments || []) {
      (stats.paymentsByStatus as Record<string, number>)[p.status] = ((stats.paymentsByStatus as Record<string, number>)[p.status] || 0) + 1;
    }

    const pendingPayments = (payments || []).filter(p => p.status === "en_attente");
    const totalPending = pendingPayments.reduce((s, p) => s + (p.amount || 0), 0);
    stats.totalPendingAmount = totalPending;

    // Payments sans notes/description
    const noDescPayments = (payments || []).filter(p => !p.notes || p.notes.length < 3);
    if (noDescPayments.length > 0) {
      issues.push({ severity: "warning", module: "payments", message: `${noDescPayments.length} paiements sans description` });
    }

    // ─── 4. DOCUMENTS ───
    const { data: documents } = await supabaseAdmin
      .from("documents")
      .select("*");

    stats.totalDocuments = documents?.length || 0;

    const docsWithoutPdf = (documents || []).filter(d => !d.pdf_url);
    if (docsWithoutPdf.length > 0) {
      issues.push({ severity: "warning", module: "documents", message: `${docsWithoutPdf.length} documents sans PDF généré` });
    }

    // ─── 5. PORTAIL ACCESS ───
    const withPortal = (contacts || []).filter(c => c.portal_password);
    stats.clientsWithPortalAccess = withPortal.length;

    const withPaymentsNoPortal = (contacts || []).filter(c => {
      const hasPayment = (payments || []).some(p => p.contact_id === c.id);
      return hasPayment && !c.portal_password && c.email;
    });
    if (withPaymentsNoPortal.length > 0) {
      issues.push({ severity: "info", module: "portail", message: `${withPaymentsNoPortal.length} clients ont un paiement mais pas d'accès portail`, details: withPaymentsNoPortal.map(c => c.first_name).slice(0, 5) });
    }

    // ─── 6. MESSAGES ───
    const { data: messages } = await supabaseAdmin
      .from("messages")
      .select("id, direction, is_read")
      .eq("is_read", false)
      .eq("direction", "inbound");

    stats.unreadMessages = messages?.length || 0;

    // ─── 7. ENV VARS ───
    const requiredEnvs = [
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "ANTHROPIC_API_KEY",
      "GOOGLE_MAPS_API_KEY",
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_APP_URL",
    ];
    const missingEnvs = requiredEnvs.filter(e => !process.env[e]);
    if (missingEnvs.length > 0) {
      issues.push({ severity: "error", module: "env", message: `Variables d'environnement manquantes`, details: missingEnvs });
    }

    // ─── 8. AUTOMATIONS RECENTES ───
    const { data: automationLogs } = await supabaseAdmin
      .from("automation_logs")
      .select("action, status, created_at")
      .order("created_at", { ascending: false })
      .limit(20);

    stats.recentAutomations = automationLogs?.length || 0;
    const failedAutomations = (automationLogs || []).filter(l => l.status === "error" || l.status === "failed");
    if (failedAutomations.length > 0) {
      issues.push({ severity: "error", module: "automations", message: `${failedAutomations.length} automations récentes ont échoué` });
    }

    // ─── RETURN ───
    const summary = {
      timestamp: new Date().toISOString(),
      stats,
      issues: {
        total: issues.length,
        errors: issues.filter(i => i.severity === "error").length,
        warnings: issues.filter(i => i.severity === "warning").length,
        info: issues.filter(i => i.severity === "info").length,
      },
      details: issues,
    };

    return NextResponse.json(summary, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
