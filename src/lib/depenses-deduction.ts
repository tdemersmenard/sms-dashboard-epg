import { supabaseAdmin } from "@/lib/supabase";

// VERSION SYNCHRONE — fallback saisonnier (utilisé partout)
export function getVehicleDeduction(dateStr: string): number {
  const date = new Date(dateStr + "T12:00:00");
  const month = date.getMonth() + 1;

  if (month >= 5 && month <= 9) return 95;
  if (month === 4 || month === 10) return 80;
  return 40;
}

// VERSION ASYNC — utilise les logs d'odomètre si dispos (à utiliser dans le rapport fiscal)
export async function getVehicleDeductionPrecise(dateStr: string): Promise<number> {
  const { data: log } = await supabaseAdmin
    .from("odometer_logs")
    .select("business_pct")
    .eq("date", dateStr)
    .single();

  if (log?.business_pct) {
    return Math.round(parseFloat(String(log.business_pct)));
  }

  // Fallback synchrone
  return getVehicleDeduction(dateStr);
}

export function getDeductionLabel(month: number): string {
  if (month >= 5 && month <= 9) return "Saison estivale (95%)";
  if (month === 4 || month === 10) return "Transition (80%)";
  return "Hors saison (40%)";
}
