import { calculateRoutes, confirmRoutes } from "./calculator";
import { supabaseAdmin } from "@/lib/supabase";

// Vérifie s'il y a de nouveaux clients sans entretiens planifiés et recalcule tout
export async function autoAssignNewClients(): Promise<string[]> {
  const { data: contacts } = await supabaseAdmin
    .from("contacts")
    .select("id, services, address, ouverture_date")
    .not("services", "is", null);

  const needsAssign = (contacts || []).filter(c => {
    const svcs = c.services || [];
    return svcs.some((s: string) => s.toLowerCase().includes("entretien")) && c.address && c.ouverture_date;
  });

  if (needsAssign.length === 0) return [];

  const newClients = [];
  for (const c of needsAssign) {
    const { data: existing } = await supabaseAdmin.from("jobs").select("id").eq("contact_id", c.id).eq("job_type", "entretien").limit(1);
    if (!existing || existing.length === 0) newClients.push(c.id);
  }

  if (newClients.length === 0) return [];

  // Recalcule et confirme tout
  const result = await calculateRoutes();
  return await confirmRoutes(result.routes, false);
}
