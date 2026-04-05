export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const contactId = formData.get("contactId") as string;
    const docType = formData.get("docType") as string;

    if (!file || !contactId || !docType) {
      return NextResponse.json({ error: "Champs manquants" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const timestamp = Date.now();
    const fileName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = `${contactId}/${timestamp}-${fileName}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(filePath, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      console.error("[doc-upload] Storage error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(filePath);

    const prefix = docType === "contrat" ? "C" : docType === "facture" ? "F" : "S";
    const { count } = await supabaseAdmin
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("doc_type", docType);
    const docNumber = `${prefix}-2026-${String((count || 0) + 1).padStart(3, "0")}`;

    const { data: doc, error: docError } = await supabaseAdmin
      .from("documents")
      .insert({
        contact_id: contactId,
        doc_type: docType,
        doc_number: docNumber,
        amount: 0,
        status: "envoyé",
        pdf_url: urlData.publicUrl,
      })
      .select()
      .single();

    if (docError) {
      return NextResponse.json({ error: docError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, document: doc });
  } catch (err) {
    console.error("[doc-upload] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
