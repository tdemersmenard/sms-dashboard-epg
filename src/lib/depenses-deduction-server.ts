import { supabaseAdmin } from "@/lib/supabase";
import { getVehicleDeduction } from "./depenses-deduction";

// VERSION SERVEUR ASYNC — utilise les logs d'odomètre si dispos
// À utiliser UNIQUEMENT côté serveur (API routes)
export async function getVehicleDeductionPrecise(dateStr: string): Promise<number> {
  const { data: log } = await supabaseAdmin
    .from("odometer_logs")
    .select("business_pct")
    .eq("date", dateStr)
    .single();

  if (log?.business_pct) {
    return Math.round(parseFloat(String(log.business_pct)));
  }

  return getVehicleDeduction(dateStr);
}
