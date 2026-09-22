import { firstNameFrom } from "@/lib/name";

/** Tests unitaires de l'extraction du prénom — `npx tsx --tsconfig tsconfig.json scripts/test-name.ts` */

const CASES: [string | null | undefined, string | null][] = [
  ["Jonathan Tardif", "Jonathan"],
  ["jonathan tardif", "Jonathan"],
  ["Patrick-Emanuel Roy", "Patrick-Emanuel"],
  ["patrick-emanuel roy", "Patrick-Emanuel"],
  ["MARIE-CLAUDE ST-PIERRE", "Marie-Claude"],
  ["éric côté", "Éric"],
  ["ÉRIC", "Éric"],
  ["  jean  ", "Jean"],
  ["jean-françois lemieux-tremblay", "Jean-François"],
  ["", null],
  ["   ", null],
  [null, null],
  [undefined, null],
];

let failed = 0;
for (const [input, expected] of CASES) {
  const got = firstNameFrom(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "✅" : "❌"} firstNameFrom(${JSON.stringify(input)}) → ${JSON.stringify(got)}${ok ? "" : ` (attendu ${JSON.stringify(expected)})`}`);
}
if (failed) { console.error(`\n${failed} test(s) échoué(s)`); process.exit(1); }
console.log("\ntous les tests passent");
