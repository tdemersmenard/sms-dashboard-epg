export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const contactId = formData.get("contactId") as string;
    const type = (formData.get("type") as string) || "photo_thomas";

    if (!file || !contactId) {
      return NextResponse.json({ error: "file et contactId requis" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.type.includes("png") ? "png" : "jpg";
    const fileName = `photos/${contactId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabaseAdmin.storage
      .from("documents")
      .upload(fileName, buffer, {
        contentType: file.type,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabaseAdmin.storage
      .from("documents")
      .getPublicUrl(fileName);

    await supabaseAdmin.from("documents").insert({
      contact_id: contactId,
      type,
      pdf_url: urlData.publicUrl,
      notes: `Photo prise le ${new Date().toLocaleDateString("fr-CA")}`,
    });

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
    });
  } catch (err: unknown) {
    console.error("[photos/upload] Error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
