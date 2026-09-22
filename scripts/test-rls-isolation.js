/**
 * PREUVE D'ISOLATION RLS — Phase 1 du portail vendeur.
 * À lancer APRÈS avoir exécuté supabase/vendeur-portal.sql dans le SQL Editor.
 *   node --env-file=.env.local scripts/test-rls-isolation.js
 *
 * Prouve, au niveau BASE DE DONNÉES (pas l'UI), qu'un closer signé en JWT ne
 * peut ni lire ni écrire les leads d'un autre closer — même en appelant
 * Supabase directement. Nettoie tout à la fin.
 */
const { createClient } = require("@supabase/supabase-js");

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FID = "00000000-0000-0000-0000-000000000001";

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });
const pass = "Test-Closer-2027!";
let ok = 0, fail = 0;
const check = (label, cond) => { console.log(`${cond ? "✅" : "❌"} ${label}`); cond ? ok++ : fail++; };

async function mkCloser(email, name) {
  const { data, error } = await admin.auth.admin.createUser({ email, password: pass, email_confirm: true });
  if (error && !/already/i.test(error.message)) throw error;
  let id = data?.user?.id;
  if (!id) { // déjà existant → retrouver
    const { data: list } = await admin.auth.admin.listUsers();
    id = list.users.find((u) => u.email === email)?.id;
  }
  await admin.from("profiles").upsert({ id, full_name: name, role: "closer", active: true, franchise_id: FID }, { onConflict: "id" });
  return id;
}

async function signedClient(email) {
  const c = createClient(URL, ANON, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password: pass });
  if (error) throw new Error("signin: " + error.message);
  return c;
}

(async () => {
  const emailA = "closer-a-test@altamar.test";
  const emailB = "closer-b-test@altamar.test";

  // Cleanup préalable
  const { data: prevA } = await admin.from("contacts").select("id").eq("phone", "+15550000001");
  const { data: prevB } = await admin.from("contacts").select("id").eq("phone", "+15550000002");
  for (const c of [...(prevA || []), ...(prevB || [])]) {
    await admin.from("call_logs").delete().eq("lead_id", c.id);
    await admin.from("contacts").delete().eq("id", c.id);
  }

  console.log("── Setup: 2 closers + 1 lead chacun ──");
  const idA = await mkCloser(emailA, "Closer A");
  const idB = await mkCloser(emailB, "Closer B");

  const { data: leadA } = await admin.from("contacts").insert({ phone: "+15550000001", first_name: "LeadDeA", franchise_id: FID, stage: "nouveau", assigned_to: idA, pipeline_status: "nouveau" }).select("id").single();
  const { data: leadB } = await admin.from("contacts").insert({ phone: "+15550000002", first_name: "LeadDeB", franchise_id: FID, stage: "nouveau", assigned_to: idB, pipeline_status: "nouveau" }).select("id").single();
  console.log(`   lead A=${leadA.id.slice(0,8)} (→A), lead B=${leadB.id.slice(0,8)} (→B)\n`);

  const A = await signedClient(emailA);

  console.log("── SELECT (lecture) ──");
  const { data: aSeesOwn } = await A.from("contacts").select("id, first_name").eq("id", leadA.id);
  check("Closer A LIT son propre lead", (aSeesOwn || []).length === 1);
  const { data: aSeesB } = await A.from("contacts").select("id").eq("id", leadB.id);
  check("Closer A NE VOIT PAS le lead de B (bloqué par Postgres)", (aSeesB || []).length === 0);
  const { data: aSeesAll } = await A.from("contacts").select("id");
  check("Closer A ne voit QUE ses leads dans un select global", (aSeesAll || []).every((r) => r.id === leadA.id));

  console.log("\n── UPDATE (écriture) ──");
  const { data: updOwn } = await A.from("contacts").update({ pipeline_status: "contacte" }).eq("id", leadA.id).select("id");
  check("Closer A MODIFIE son lead", (updOwn || []).length === 1);
  const { data: updB } = await A.from("contacts").update({ pipeline_status: "client" }).eq("id", leadB.id).select("id");
  check("Closer A NE PEUT PAS modifier le lead de B", (updB || []).length === 0);
  // confirmer via service role que B n'a pas bougé
  const { data: bStill } = await admin.from("contacts").select("pipeline_status").eq("id", leadB.id).single();
  check("Le lead de B est resté intact", bStill.pipeline_status === "nouveau");

  console.log("\n── DELETE (interdit à tout closer) ──");
  const { data: delOwn } = await A.from("contacts").delete().eq("id", leadA.id).select("id");
  check("Closer A NE PEUT PAS supprimer un lead (même le sien)", (delOwn || []).length === 0);

  console.log("\n── call_logs (insertion) ──");
  const { error: clOwn } = await A.from("call_logs").insert({ lead_id: leadA.id, closer_id: idA, outcome: "repondu", notes: "test", franchise_id: FID });
  check("Closer A journalise un appel sur son lead", !clOwn);
  const { error: clB } = await A.from("call_logs").insert({ lead_id: leadB.id, closer_id: idA, outcome: "repondu", notes: "vol", franchise_id: FID });
  check("Closer A NE PEUT PAS journaliser sur le lead de B", !!clB);
  const { error: clSpoof } = await A.from("call_logs").insert({ lead_id: leadA.id, closer_id: idB, outcome: "repondu", franchise_id: FID });
  check("Closer A NE PEUT PAS usurper closer_id (spoof)", !!clSpoof);

  console.log("\n── payments (lecture seule via son lead, pas de création directe) ──");
  const { error: payIns } = await A.from("payments").insert({ contact_id: leadA.id, amount: 1, status: "en_attente", franchise_id: FID });
  check("Closer A NE PEUT PAS créer un paiement en direct (pas de champ montant libre)", !!payIns);

  console.log("\n── Voies légitimes intactes ──");
  const anon = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: anonSees } = await anon.from("contacts").select("id").eq("id", leadB.id);
  check("CRM admin (anon, sans login) voit toujours les leads", (anonSees || []).length === 1);
  const { data: svcSees } = await admin.from("contacts").select("id").in("id", [leadA.id, leadB.id]);
  check("Service role (webhook/cron/bot) voit tout", (svcSees || []).length === 2);

  console.log("\n── Nettoyage ──");
  for (const id of [leadA.id, leadB.id]) { await admin.from("call_logs").delete().eq("lead_id", id); await admin.from("contacts").delete().eq("id", id); }
  await admin.from("profiles").delete().in("id", [idA, idB]);
  await admin.auth.admin.deleteUser(idA).catch(() => {});
  await admin.auth.admin.deleteUser(idB).catch(() => {});

  console.log(`\n${fail === 0 ? "🎉 ISOLATION PROUVÉE" : "⚠️ ÉCHECS"} — ${ok} ok, ${fail} échec(s)`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error("ERREUR:", e.message); process.exit(1); });
