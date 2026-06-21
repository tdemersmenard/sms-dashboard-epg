import { supabaseAdmin } from "@/lib/supabase";
import { getCurrentUser } from "@/lib/auth";
import { isMasterUser, extractFranchiseId } from "@/lib/franchise";
import { notFound, redirect } from "next/navigation";

// Known non-slug routes that should NOT be matched by [slug]
const RESERVED_SLUGS = new Set([
  "api", "login", "master", "portail", "employe", "_next", "favicon.ico",
]);

export default async function SlugLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  // Don't intercept reserved routes
  if (RESERVED_SLUGS.has(slug)) {
    return notFound();
  }

  // Verify the franchise exists
  const { data: franchise } = await supabaseAdmin
    .from("franchises")
    .select("id, name, slug")
    .eq("slug", slug)
    .single();

  if (!franchise) {
    return notFound();
  }

  // Check user authentication and access
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/${slug}`);
  }

  const u = user as Record<string, unknown>;
  const isMaster = isMasterUser(u);
  const userFranchiseId = extractFranchiseId(u);

  // Access control: franchise owners can only access their own franchise
  if (!isMaster && userFranchiseId !== franchise.id) {
    // Find the user's own franchise slug and redirect there
    const { data: ownFranchise } = await supabaseAdmin
      .from("franchises")
      .select("slug")
      .eq("id", userFranchiseId)
      .single();

    if (ownFranchise?.slug) {
      redirect(`/${ownFranchise.slug}`);
    }
    redirect("/login");
  }

  return <>{children}</>;
}
