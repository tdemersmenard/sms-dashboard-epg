/**
 * Santé de l'eau — plages standards piscine résidentielle, codées
 * vert/jaune/rouge comme les meilleurs rapports de l'industrie
 * (le client comprend sans interpréter des chiffres).
 */

export type ParamRating = "green" | "yellow" | "red";

export interface WaterParam {
  key: string;
  label: string;
  unit: string;
  /** plage idéale affichée */
  ideal: string;
  value: number | null;
  rating: ParamRating | null;
}

interface Range {
  label: string;
  unit: string;
  ideal: string;
  green: [number, number];
  yellow: [number, number];
}

const RANGES: Record<string, Range> = {
  ph: { label: "pH", unit: "", ideal: "7,2 – 7,6", green: [7.2, 7.6], yellow: [7.0, 7.8] },
  chlorine: { label: "Chlore libre", unit: "ppm", ideal: "1 – 3", green: [1, 3], yellow: [0.5, 5] },
  alkalinity: { label: "Alcalinité", unit: "ppm", ideal: "80 – 120", green: [80, 120], yellow: [60, 140] },
  calcium_hardness: { label: "Dureté calcique", unit: "ppm", ideal: "200 – 400", green: [200, 400], yellow: [150, 500] },
  stabilizer: { label: "Stabilisant", unit: "ppm", ideal: "30 – 50", green: [30, 50], yellow: [20, 80] },
};

function rate(key: string, value: number): ParamRating {
  const r = RANGES[key];
  if (value >= r.green[0] && value <= r.green[1]) return "green";
  if (value >= r.yellow[0] && value <= r.yellow[1]) return "yellow";
  return "red";
}

const RATING_POINTS: Record<ParamRating, number> = { green: 100, yellow: 68, red: 30 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function analyzeTest(test: Record<string, any> | null | undefined): { score: number | null; params: WaterParam[] } {
  const params: WaterParam[] = [];
  const points: number[] = [];

  for (const key of Object.keys(RANGES)) {
    const raw = test?.[key];
    const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
    if (value === null || Number.isNaN(value)) {
      params.push({ key, label: RANGES[key].label, unit: RANGES[key].unit, ideal: RANGES[key].ideal, value: null, rating: null });
      continue;
    }
    const rating = rate(key, value);
    points.push(RATING_POINTS[rating]);
    params.push({ key, label: RANGES[key].label, unit: RANGES[key].unit, ideal: RANGES[key].ideal, value, rating });
  }

  // Score seulement si on a au moins pH + chlore (les deux essentiels)
  const hasCore = params.find((p) => p.key === "ph")?.value != null && params.find((p) => p.key === "chlorine")?.value != null;
  const score = hasCore && points.length > 0 ? Math.round(points.reduce((a, b) => a + b, 0) / points.length) : null;
  return { score, params };
}

export function scoreColor(score: number): string {
  if (score >= 85) return "var(--green)";
  if (score >= 60) return "var(--yellow)";
  return "var(--red)";
}

export function scoreLabel(score: number): string {
  if (score >= 85) return "Ton eau est en pleine forme";
  if (score >= 60) return "Correcte — on ajuste au prochain passage";
  return "On s'en occupe en priorité";
}
