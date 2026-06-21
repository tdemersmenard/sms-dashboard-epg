export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai-agent";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { data } = await supabaseAdmin
      .from("settings")
      .select("value, updated_at")
      .eq("key", "bot_system_prompt")
      .eq("franchise_id", franchiseId)
      .maybeSingle();

    const row = data as { value?: { text?: string; updated_at?: string } | null; updated_at?: string } | null;
    const text = row?.value?.text;
    const updatedAt = row?.value?.updated_at ?? null;

    return NextResponse.json({
      prompt: text && text.trim().length > 100 ? text : DEFAULT_SYSTEM_PROMPT,
      updatedAt,
      isDefault: !text || text.trim().length <= 100,
    });
  } catch {
    return NextResponse.json({
      prompt: DEFAULT_SYSTEM_PROMPT,
      updatedAt: null,
      isDefault: true,
    });
  }
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const { prompt } = await req.json();
  if (!prompt || typeof prompt !== "string" || prompt.trim().length < 100) {
    return NextResponse.json({ error: "Le prompt est trop court ou vide" }, { status: 400 });
  }

  const franchiseId = await getActiveFranchiseId();
  const value = { text: prompt.trim(), updated_at: new Date().toISOString() };

  const { error } = await supabaseAdmin
    .from("settings")
    .upsert({ key: "bot_system_prompt", value, franchise_id: franchiseId }, { onConflict: "key,franchise_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });

  const franchiseId = await getActiveFranchiseId();
  const { error } = await supabaseAdmin
    .from("settings")
    .delete()
    .eq("key", "bot_system_prompt")
    .eq("franchise_id", franchiseId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, prompt: DEFAULT_SYSTEM_PROMPT });
}
