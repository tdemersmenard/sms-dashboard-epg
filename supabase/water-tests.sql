-- Table des analyses d'eau — à exécuter dans Supabase (SQL Editor).
-- Alimente le cadran « Santé de ton eau » du portail client et le
-- formulaire d'analyses de la fiche client (qui échouait sans elle).

create table if not exists public.water_tests (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  franchise_id uuid references public.franchises(id),
  ph numeric(4,2),
  chlorine numeric(5,2),
  alkalinity numeric(6,1),
  calcium_hardness numeric(6,1),
  stabilizer numeric(6,1),
  notes text,
  tested_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists water_tests_contact_idx on public.water_tests (contact_id, tested_at desc);
