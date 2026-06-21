import { getCurrentUser } from "@/lib/auth";
import { cookies } from "next/headers";
import { isMasterUser, extractFranchiseId, GRANBY_FRANCHISE_ID } from "@/lib/franchise";

export const IMPERSONATE_COOKIE = "chlore_impersonate";

/**
 * Returns the active franchise_id to use for all data queries.
 * - Master user + impersonation cookie → returns impersonated franchise_id
 * - Otherwise → returns the user's own franchise_id
 */
export async function getActiveFranchiseId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) return GRANBY_FRANCHISE_ID;

  if (isMasterUser(user as Record<string, unknown>)) {
    const cookieStore = await cookies();
    const impersonate = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impersonate) return impersonate;
  }

  return extractFranchiseId(user as Record<string, unknown>);
}
