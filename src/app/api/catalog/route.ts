export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { CATALOG_ITEMS } from "@/lib/catalog";
import { getActiveFranchiseId } from "@/lib/franchise-context";

export async function GET() {
  try {
    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("catalog_items")
      .select("*")
      .eq("active", true)
      .eq("franchise_id", franchiseId)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });

    if (error) {
      if (error.code === "42P01") {
        // Table not yet created — return static fallback
        return NextResponse.json({
          items: CATALOG_ITEMS.map((item, idx) => ({
            id: item.id,
            name: item.name,
            description: item.description ?? null,
            default_price: item.defaultPrice,
            category: item.category,
            active: true,
            sort_order: idx,
            created_at: new Date().toISOString(),
          })),
          migrationRequired: true,
        });
      }
      throw error;
    }

    return NextResponse.json({ items: data || [] });
  } catch (err) {
    return NextResponse.json({ error: String(err), items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description, default_price, category, sort_order } = await req.json();
    if (!name || default_price === undefined) {
      return NextResponse.json({ error: "name et default_price requis" }, { status: 400 });
    }

    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("catalog_items")
      .insert({ name, description: description || null, default_price: Number(default_price), category: category || null, sort_order: sort_order ?? 0, active: true, franchise_id: franchiseId })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...updates } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const franchiseId = await getActiveFranchiseId();
    const { data, error } = await supabaseAdmin
      .from("catalog_items")
      .update(updates)
      .eq("id", id)
      .eq("franchise_id", franchiseId)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, item: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id requis" }, { status: 400 });

    const franchiseId = await getActiveFranchiseId();
    const { error } = await supabaseAdmin
      .from("catalog_items")
      .update({ active: false })
      .eq("id", id)
      .eq("franchise_id", franchiseId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
