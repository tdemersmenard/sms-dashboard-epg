import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser, extractFranchiseId } from "@/lib/franchise";
import { supabaseAdmin } from "@/lib/supabase";

export default async function Root() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const u = user as Record<string, unknown>;

  // Master users go to /master
  if (isMasterUser(u)) {
    redirect("/master");
  }

  // Franchise owners go to their franchise slug
  const franchiseId = extractFranchiseId(u);
  if (franchiseId) {
    const { data: franchise } = await supabaseAdmin
      .from("franchises")
      .select("slug")
      .eq("id", franchiseId)
      .single();

    if (franchise?.slug) {
      redirect(`/${franchise.slug}`);
    }
  }

  // Fallback
  redirect("/granby");
}
