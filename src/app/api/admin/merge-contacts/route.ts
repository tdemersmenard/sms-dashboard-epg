export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

const GRANBY_ID = "00000000-0000-0000-0000-000000000001";

/** Normalize phone to E.164: +1XXXXXXXXXX */
function norm(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return phone;
}

const CHILD_TABLES = [
  "messages",
  "jobs",
  "documents",
  "payments",
  "automation_logs",
  "call_transcripts",
  "water_tests",
] as const;

/**
 * POST /api/admin/merge-contacts
 *
 * One-shot migration to:
 * 1. Normalize all phone numbers to E.164
 * 2. Merge duplicate contacts (same normalized phone)
 * 3. Assign franchise_id to all remaining NULL contacts
 *
 * Pass ?dry=true for a dry run (no writes).
 * Protected by CRON_SECRET.
 */
export async function POST(req: NextRequest) {
  // Auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const dryRun = req.nextUrl.searchParams.get("dry") === "true";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results: any = {
    dryRun,
    phonesNormalized: 0,
    merged: [] as string[],
    manualReview: [] as string[],
    orphansAssigned: 0,
    errors: [] as string[],
  };

  try {
    // ── Step 1: Normalize all phone numbers ──────────────────────────────────
    const { data: allContacts } = await supabaseAdmin
      .from("contacts")
      .select("id, phone, first_name, last_name, franchise_id, created_at")
      .not("phone", "is", null)
      .order("created_at", { ascending: true });

    if (!allContacts) {
      return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 });
    }

    // Normalize phones in DB
    for (const c of allContacts) {
      if (!c.phone) continue;
      const normalized = norm(c.phone);
      if (normalized !== c.phone) {
        if (!dryRun) {
          await supabaseAdmin.from("contacts").update({ phone: normalized }).eq("id", c.id);
        }
        results.phonesNormalized++;
        c.phone = normalized; // update in-memory too
      }
    }

    // ── Step 2: Find and merge duplicates ────────────────────────────────────
    // Group contacts by normalized phone
    const byPhone = new Map<string, typeof allContacts>();
    for (const c of allContacts) {
      if (!c.phone) continue;
      const key = c.phone;
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(c);
    }

    for (const [phone, group] of Array.from(byPhone.entries())) {
      if (group.length <= 1) continue;

      // Check for name conflicts: both have different non-empty names
      const withNames = group.filter(
        (c) => (c.first_name && c.first_name !== "Lead Facebook") || c.last_name
      );
      const uniqueNames = new Set(
        withNames.map((c) => `${(c.first_name || "").trim()} ${(c.last_name || "").trim()}`.trim().toLowerCase())
      );

      if (uniqueNames.size > 1) {
        const nameList = withNames.map(
          (c) => `${c.first_name || ""} ${c.last_name || ""} (id:${c.id.slice(0, 8)}, franchise:${c.franchise_id || "NULL"})`
        );
        results.manualReview.push(
          `${phone}: noms différents — ${nameList.join(" vs ")}`
        );
        // Still assign franchise_id to NULL ones, but don't merge
        for (const c of group) {
          if (!c.franchise_id) {
            // Check if assigning to Granby would collide with an existing one
            const hasGranby = group.some((g) => g.franchise_id === GRANBY_ID);
            if (!hasGranby) {
              if (!dryRun) {
                await supabaseAdmin
                  .from("contacts")
                  .update({ franchise_id: GRANBY_ID })
                  .eq("id", c.id);
              }
              results.orphansAssigned++;
            }
          }
        }
        continue;
      }

      // ── Merge logic ──
      // Pick the "keeper": prefer one with franchise_id, then oldest
      const withFranchise = group.filter((c) => c.franchise_id);
      const keeper = withFranchise[0] || group[0];
      const toDelete = group.filter((c) => c.id !== keeper.id);

      // Collect best name from all contacts
      let bestFirst = keeper.first_name;
      let bestLast = keeper.last_name;
      for (const c of group) {
        if (c.first_name && c.first_name !== "Lead Facebook" && (!bestFirst || bestFirst === "Lead Facebook")) {
          bestFirst = c.first_name;
        }
        if (c.last_name && (!bestLast || bestLast?.length <= 8)) {
          bestLast = c.last_name;
        }
      }

      // Ensure keeper has franchise_id
      const keeperFranchise = keeper.franchise_id || GRANBY_ID;

      if (!dryRun) {
        // Update keeper with best name and franchise_id
        await supabaseAdmin
          .from("contacts")
          .update({
            first_name: bestFirst,
            last_name: bestLast,
            franchise_id: keeperFranchise,
          })
          .eq("id", keeper.id);

        // Transfer all references from duplicates to keeper
        for (const dup of toDelete) {
          for (const table of CHILD_TABLES) {
            await supabaseAdmin
              .from(table)
              .update({ contact_id: keeper.id })
              .eq("contact_id", dup.id);
          }

          // Delete the duplicate
          await supabaseAdmin.from("contacts").delete().eq("id", dup.id);
        }
      }

      const dupIds = toDelete.map((d) => d.id.slice(0, 8)).join(", ");
      results.merged.push(
        `${phone}: gardé ${keeper.id.slice(0, 8)} (${bestFirst || "?"} ${bestLast || "?"}), supprimé ${dupIds}`
      );
    }

    // ── Step 3: Assign remaining NULL franchise_id contacts to Granby ────────
    const { data: nullContacts } = await supabaseAdmin
      .from("contacts")
      .select("id, phone")
      .is("franchise_id", null);

    if (nullContacts && nullContacts.length > 0) {
      for (const c of nullContacts) {
        // Check if assigning to Granby would cause a unique constraint violation
        if (c.phone) {
          const { data: existing } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("phone", c.phone)
            .eq("franchise_id", GRANBY_ID)
            .maybeSingle();

          if (existing) {
            // Collision: merge into existing
            if (!dryRun) {
              for (const table of CHILD_TABLES) {
                await supabaseAdmin
                  .from(table)
                  .update({ contact_id: existing.id })
                  .eq("contact_id", c.id);
              }
              await supabaseAdmin.from("contacts").delete().eq("id", c.id);
            }
            results.merged.push(
              `${c.phone}: collision NULL→Granby, fusionné ${c.id.slice(0, 8)} → ${existing.id.slice(0, 8)}`
            );
            continue;
          }
        }

        if (!dryRun) {
          await supabaseAdmin
            .from("contacts")
            .update({ franchise_id: GRANBY_ID })
            .eq("id", c.id);
        }
        results.orphansAssigned++;
      }
    }

    // ── Final count ──
    const { count } = await supabaseAdmin
      .from("contacts")
      .select("id", { count: "exact", head: true })
      .is("franchise_id", null);
    results.remainingNull = count ?? 0;

  } catch (err) {
    results.errors.push(String(err));
  }

  return NextResponse.json(results);
}
