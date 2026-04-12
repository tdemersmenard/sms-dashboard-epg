// Calcule le % déductible véhicule selon la date
// Été (mai-sept)         : 95% business (saison pleine)
// Printemps/Automne (avr, oct) : 80% (ouvertures/fermetures)
// Hiver (nov-mars)       : 40% (spas occasionnels seulement)

export function getVehicleDeduction(dateStr: string): number {
  const month = new Date(dateStr + "T12:00:00").getMonth() + 1; // 1-12
  if (month >= 5 && month <= 9) return 95;
  if (month === 4 || month === 10) return 80;
  return 40;
}

export function getDeductionLabel(month: number): string {
  if (month >= 5 && month <= 9) return "Saison estivale (95%)";
  if (month === 4 || month === 10) return "Transition (80%)";
  return "Hors saison (40%)";
}
