-- ═══════════════════════════════════════════════════════════════════════════
-- PROGRAMME VOISIN — référencement automatisé (crédit référent + promo prolongée)
-- À exécuter dans Supabase → SQL Editor. Idempotent.
--
-- RÈGLE: ce n'est PAS un rabais. Le prix affiché ne bouge jamais.
--  · Référent (client signé) : 150$ de CRÉDIT par voisin qui réserve+paie
--    (75$ si hors rue). Cumulable, sans plafond.
--  · Voisin référé : garde le prix promo -10% MÊME APRÈS le 1er novembre.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Colonnes sur contacts ───────────────────────────────────────────────────
alter table public.contacts add column if not exists referral_code text unique;
alter table public.contacts add column if not exists referred_by_code text;
alter table public.contacts add column if not exists keeps_promo_price boolean not null default false;
create index if not exists contacts_referred_by_idx on public.contacts (referred_by_code);

-- ── referrals ───────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_client_id uuid references public.contacts(id) on delete set null,
  referred_lead_id uuid references public.contacts(id) on delete set null,
  code text not null,
  distance_type text check (distance_type in ('meme_rue','moins_1km','hors_rue')),
  credit_cents integer not null default 15000,
  status text not null default 'en_attente' check (status in ('en_attente','confirme','credite','annule')),
  confirmed_at timestamptz,
  credited_at timestamptz,
  cancelled_reason text,
  franchise_id uuid,
  created_at timestamptz not null default now()
);
-- Un lead ne peut avoir qu'UN seul référent (dédoublonnage dur)
create unique index if not exists referrals_one_per_lead on public.referrals (referred_lead_id)
  where referred_lead_id is not null and status <> 'annule';
create index if not exists referrals_referrer_idx on public.referrals (referrer_client_id, status);

-- ── credits ─────────────────────────────────────────────────────────────────
create table if not exists public.credits (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.contacts(id) on delete cascade,
  referral_id uuid references public.referrals(id) on delete set null,
  amount_cents integer not null,
  kind text not null check (kind in ('credit_facture','remboursement')),
  status text not null default 'a_appliquer' check (status in ('a_appliquer','applique','rembourse')),
  applied_at timestamptz,
  franchise_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists credits_client_idx on public.credits (client_id, status);

-- ── Journal des changements de statut d'un referral ─────────────────────────
create table if not exists public.referral_events (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid references public.referrals(id) on delete cascade,
  from_status text,
  to_status text,
  reason text,
  created_at timestamptz not null default now()
);

-- ── RLS: lecture anon (CRM admin browser) + closer sur ses leads ────────────
alter table public.referrals enable row level security;
alter table public.credits enable row level security;
alter table public.referral_events enable row level security;

drop policy if exists referrals_anon_all on public.referrals;
create policy referrals_anon_all on public.referrals for all to anon using (true) with check (true);
drop policy if exists credits_anon_all on public.credits;
create policy credits_anon_all on public.credits for all to anon using (true) with check (true);
drop policy if exists referral_events_anon_all on public.referral_events;
create policy referral_events_anon_all on public.referral_events for all to anon using (true) with check (true);

-- Closer authentifié: voit les referrals/credits de SES leads (via helper existant)
drop policy if exists referrals_closer_select on public.referrals;
create policy referrals_closer_select on public.referrals for select to authenticated
  using (closer_owns_contact(referrer_client_id) or closer_owns_contact(referred_lead_id));
drop policy if exists credits_closer_select on public.credits;
create policy credits_closer_select on public.credits for select to authenticated
  using (closer_owns_contact(client_id));

-- Le service_role (webhook/cron/bot/routes) contourne tout — flux intacts.
