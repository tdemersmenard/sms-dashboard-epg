-- ═══════════════════════════════════════════════════════════════════════════
-- PORTAIL VENDEUR — Phase 1 : fondation (schéma + RLS réelle)
-- À exécuter dans Supabase → SQL Editor. Idempotent (ré-exécutable sans danger).
--
-- MODÈLE DE SÉCURITÉ:
--  · Les closers sont des comptes Supabase Auth (auth.users). role dans profiles.
--  · Le portail /vendeur interroge avec le JWT du closer → rôle Postgres
--    « authenticated » → les policies auth.uid() ci-dessous s'appliquent VRAIMENT
--    au niveau base de données (un closer ne voit QUE ses leads, même par API directe).
--  · Le CRM admin (browser) utilise la clé ANON → rôle « anon » → policies
--    permissives conservées (comportement inchangé).
--  · Tout le back-end (webhook, cron, bot, routes API) utilise la clé SERVICE_ROLE
--    → contourne la RLS → flux automatisés intacts.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. PROFILES (identité des closers + admin, liée à auth.users) ──────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'closer' check (role in ('admin','closer')),
  active boolean not null default true,
  phone text,
  franchise_id uuid,                              -- franchise dont il travaille les leads
  commission_flat_cents integer not null default 10000,   -- 100$ fixe par contrat signé
  bonus_comptant_cents integer not null default 5000,     -- 50$ bonus si paiement comptant
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists profiles_self_read on public.profiles;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = auth.uid());
-- (aucune policy INSERT/UPDATE/DELETE pour authenticated → seul le service role gère les profils)

-- ─── 2. COLONNES SUR contacts (le "lead" = contact existant) ────────────────
alter table public.contacts add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.contacts add column if not exists assigned_at timestamptz;
alter table public.contacts add column if not exists pipeline_status text
  check (pipeline_status in ('nouveau','contacte','rappel_prevu','negociation','depot_paye','client','perdu'));
alter table public.contacts add column if not exists next_callback_at timestamptz;
create index if not exists contacts_assigned_idx on public.contacts (assigned_to);

-- ─── 3. COLONNES SUR payments (garde `amount` en dollars; ajoute le reste) ──
--     amount_cents n'est PAS ajouté: on garde la colonne `amount` (numeric, dollars)
--     déjà utilisée partout. La règle "montant calculé serveur" est appliquée
--     dans la route de création, jamais fourni par le client.
alter table public.payments add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.payments add column if not exists kind text
  check (kind in ('depot','saison_comptant','mensuel'));
alter table public.payments add column if not exists plan text
  check (plan in ('signature','essentiel'));
alter table public.payments add column if not exists pool_type text;
alter table public.payments add column if not exists stripe_payment_intent_id text;
alter table public.payments add column if not exists stripe_subscription_id text;
alter table public.payments add column if not exists currency text default 'cad';

-- ─── 4. CALL_LOGS ───────────────────────────────────────────────────────────
create table if not exists public.call_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.contacts(id) on delete cascade,
  closer_id uuid references public.profiles(id) on delete set null,
  called_at timestamptz not null default now(),
  outcome text check (outcome in ('repondu','message_vocal','pas_de_reponse','mauvais_numero')),
  notes text,
  objection text,                                 -- mots exacts du client (matière première pubs)
  next_callback_at timestamptz,
  franchise_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists call_logs_lead_idx on public.call_logs (lead_id, called_at desc);
create index if not exists call_logs_closer_idx on public.call_logs (closer_id);

-- ─── 5. ASSIGNMENT_HISTORY (audit des (ré)assignations) ─────────────────────
create table if not exists public.assignment_history (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.contacts(id) on delete cascade,
  from_closer uuid references public.profiles(id) on delete set null,
  to_closer uuid references public.profiles(id) on delete set null,
  assigned_by uuid,                               -- admin (admin_users.id) ou profile.id
  created_at timestamptz not null default now()
);
create index if not exists assignment_history_lead_idx on public.assignment_history (lead_id, created_at desc);

-- ─── 6. COMMISSIONS ─────────────────────────────────────────────────────────
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references public.payments(id) on delete set null,
  closer_id uuid references public.profiles(id) on delete set null,
  lead_id uuid references public.contacts(id) on delete set null,
  amount_cents integer not null,
  kind text not null check (kind in ('base','bonus_comptant')),
  status text not null default 'a_payer' check (status in ('a_payer','paye','annulee')),
  earned_at timestamptz not null default now(),
  paid_at timestamptz,
  cancelled_reason text,
  franchise_id uuid
);
create index if not exists commissions_closer_idx on public.commissions (closer_id, status);
-- Une seule commission de base par lead (les versements 2..12 ne regénèrent rien)
create unique index if not exists commissions_base_unique on public.commissions (lead_id, kind)
  where kind = 'base';

-- ─── 7. SECTOR_CAPACITY (places restantes par secteur, lecture au portail) ──
create table if not exists public.sector_capacity (
  id uuid primary key default gen_random_uuid(),
  secteur text not null unique,
  capacite integer not null default 0,
  places_prises integer not null default 0,
  franchise_id uuid,
  updated_at timestamptz not null default now()
);

-- ═══ RLS ════════════════════════════════════════════════════════════════════

-- Helper: le lead appartient-il au closer courant ? (SECURITY DEFINER pour
-- lire contacts sans être bloqué par la RLS de contacts)
create or replace function public.closer_owns_contact(c_id uuid)
returns boolean language sql security definer stable
set search_path = public as $$
  select exists (
    select 1 from public.contacts
    where id = c_id and assigned_to = auth.uid()
  );
$$;

-- ── contacts: re-scoper le permissif vers ANON, ajouter les policies closer ──
-- On réinitialise TOUTES les policies de contacts pour un état propre et sûr.
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='contacts'
  loop execute format('drop policy if exists %I on public.contacts', pol.policyname); end loop;
end $$;
alter table public.contacts enable row level security;

-- anon (CRM admin browser) : accès complet, comportement inchangé
create policy contacts_anon_all on public.contacts
  for all to anon using (true) with check (true);
-- closer authentifié : lecture/écriture UNIQUEMENT sur ses leads assignés
create policy contacts_closer_select on public.contacts
  for select to authenticated using (assigned_to = auth.uid());
create policy contacts_closer_update on public.contacts
  for update to authenticated using (assigned_to = auth.uid()) with check (assigned_to = auth.uid());
-- (pas d'INSERT ni DELETE pour authenticated → un closer ne crée ni ne supprime un lead)

-- ── messages: idem (le closer voit/écrit le fil de SES leads) ───────────────
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='messages'
  loop execute format('drop policy if exists %I on public.messages', pol.policyname); end loop;
end $$;
alter table public.messages enable row level security;
create policy messages_anon_all on public.messages
  for all to anon using (true) with check (true);
create policy messages_closer_select on public.messages
  for select to authenticated using (closer_owns_contact(contact_id));
-- (les SMS du closer partent via une route API service-role, pas d'INSERT direct requis)

-- ── call_logs ───────────────────────────────────────────────────────────────
alter table public.call_logs enable row level security;
drop policy if exists call_logs_closer_select on public.call_logs;
drop policy if exists call_logs_closer_insert on public.call_logs;
create policy call_logs_closer_select on public.call_logs
  for select to authenticated using (closer_owns_contact(lead_id));
create policy call_logs_closer_insert on public.call_logs
  for insert to authenticated with check (closer_owns_contact(lead_id) and closer_id = auth.uid());

-- ── payments (lecture closer sur ses leads; création via route service-role) ─
alter table public.payments enable row level security;
do $$
declare pol record;
begin
  for pol in select policyname from pg_policies where schemaname='public' and tablename='payments'
  loop execute format('drop policy if exists %I on public.payments', pol.policyname); end loop;
end $$;
create policy payments_anon_all on public.payments
  for all to anon using (true) with check (true);
create policy payments_closer_select on public.payments
  for select to authenticated using (closer_owns_contact(contact_id));

-- ── commissions (le closer LIT les siennes, ne modifie rien) ────────────────
alter table public.commissions enable row level security;
drop policy if exists commissions_closer_select on public.commissions;
create policy commissions_closer_select on public.commissions
  for select to authenticated using (closer_id = auth.uid());

-- ── call_logs / assignment_history / sector_capacity : lecture secteur ──────
alter table public.sector_capacity enable row level security;
drop policy if exists sector_capacity_read on public.sector_capacity;
create policy sector_capacity_read on public.sector_capacity
  for select to authenticated using (true);   -- places restantes = lecture seule pour tous les closers

alter table public.assignment_history enable row level security;
-- (aucune policy authenticated → un closer ne voit pas l'historique d'assignation; service role seulement)

-- ═══ NOTES ══════════════════════════════════════════════════════════════════
-- · Le service_role contourne toutes ces policies → cron, webhook, bot, routes
--   admin continuent de tout voir/écrire sans changement.
-- · profiles.role = 'admin' n'est PAS utilisé pour la RLS (Thomas passe par
--   l'auth custom + service role). Il documente juste le type de compte.
-- · Un closer ne peut jamais: supprimer un lead (pas de policy DELETE),
--   changer un prix (aucune écriture sur payments/pricing_config),
--   voir un autre closer (policies auth.uid()).

-- ─── 8. AUTEUR DES SMS (identifier bot vs closer vs admin dans le même fil) ──
--     Ajouté en Phase 2. Ré-exécuter ce fichier (idempotent) applique juste ça.
alter table public.messages add column if not exists sent_by_closer uuid references public.profiles(id) on delete set null;
alter table public.messages add column if not exists sent_via text;   -- 'bot' | 'closer' | 'admin' | null (legacy)
alter table public.contacts add column if not exists lost_reason text;

-- ─── 9. STATUTS DE PAIEMENT: autoriser remboursé/échoué (Phase 4 commissions) ──
alter table public.payments drop constraint if exists payments_status_check;
alter table public.payments add constraint payments_status_check
  check (status in ('en_attente','reçu','en_retard','rembourse','echoue'));
