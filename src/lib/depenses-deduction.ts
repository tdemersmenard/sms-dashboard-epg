// VERSION SYNCHRONE — fallback saisonnier (utilisable côté client)
export function getVehicleDeduction(dateStr: string): number {
  const date = new Date(dateStr + "T12:00:00");
  const month = date.getMonth() + 1;

  if (month >= 5 && month <= 9) return 95;
  if (month === 4 || month === 10) return 80;
  return 40;
}

export function getDeductionLabel(month: number): string {
  if (month >= 5 && month <= 9) return "Saison estivale (95%)";
  if (month === 4 || month === 10) return "Transition (80%)";
  return "Hors saison (40%)";
}
