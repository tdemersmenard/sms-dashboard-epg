import { getCurrentUser } from "@/lib/auth";
import { cookies, headers } from "next/headers";
import { isMasterUser, extractFranchiseId, GRANBY_FRANCHISE_ID } from "@/lib/franchise";

export const IMPERSONATE_COOKIE = "chlore_impersonate";

/**
 * Returns the active franchise_id to use for all data queries.
 *
 * Resolution order:
 * 1. x-franchise-id header (set by FranchiseProvider fetch interceptor — multi-tab safe)
 * 2. Impersonation cookie (legacy, single-tab)
 * 3. User's own franchise_id
 */
export async function getActiveFranchiseId(): Promise<string> {
  // 1. Check x-franchise-id header (from client-side fetch wrapper)
  const headerStore = await headers();
  const headerFranchiseId = headerStore.get("x-franchise-id");
  if (headerFranchiseId && isValidUUID(headerFranchiseId)) {
    // Validate that the user has access to this franchise
    const user = await getCurrentUser();
    if (user) {
      const u = user as Record<string, unknown>;
      if (isMasterUser(u)) return headerFranchiseId; // master can access any
      const userFranchise = extractFranchiseId(u);
      if (userFranchise === headerFranchiseId) return headerFranchiseId; // owner accessing own
    }
    // If no user or no access, fall through to other methods
  }

  // 2. Fallback to existing logic
  const user = await getCurrentUser();
  if (!user) return GRANBY_FRANCHISE_ID;

  const u = user as Record<string, unknown>;

  if (isMasterUser(u)) {
    const cookieStore = await cookies();
    const impersonate = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impersonate) return impersonate;
  }

  return extractFranchiseId(u);
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
