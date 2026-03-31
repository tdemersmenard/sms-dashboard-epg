# CHLORE — CRM Entretien Piscine Granby

CRM custom pour la gestion de leads, clients, rendez-vous et entretien de piscines — Granby, Québec.

## Features

- **Pipeline Kanban** — 7 stages drag-and-drop (Nouveau → Perdu), temps réel Supabase Realtime
- **SMS Dashboard** — messagerie temps réel façon iMessage, templates avec variables, notifications toast
- **Fiche client** — informations éditables inline, piscine, services, historique messages/jobs/paiements
- **Calendrier** — vue semaine sans librairie externe, blocs de jobs positionnés par heure, création au clic
- **Templates SMS** — bibliothèque avec catégories, variables dynamiques (`{{prénom}}`, `{{date}}`, etc.)
- **Automations** — relances automatiques, rappels RDV, suivi post-job, demandes avis Google (cron 15 min)
- **Dashboard** — stats revenu, tableau de facturation éditable, prochains RDV, derniers messages
- **Webhook Facebook** — réception automatique des leads Facebook Lead Ads

## Stack

- **Framework** : Next.js 14 (App Router)
- **Base de données** : Supabase (PostgreSQL + Realtime WebSockets)
- **SMS** : Twilio
- **UI** : Tailwind CSS, Lucide React
- **Drag & drop** : @hello-pangea/dnd
- **Dates** : date-fns
- **Déploiement** : Vercel (cron toutes les 15 min pour les automations)

## Variables d'environnement

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=
FACEBOOK_VERIFY_TOKEN=   # token pour vérification webhook FB
CRON_SECRET=             # optionnel — sécurise l'endpoint cron
```

## Setup Supabase

Rouler dans cet ordre dans le SQL Editor :

1. `supabase/migration.sql` — schéma principal + tables + Realtime
2. `supabase/fix-conversations.sql` — fonction `get_conversations_v2()`
3. `supabase/saison-clients.sql` — table `saison_clients` + seed 18 clients

## Automations (Vercel Cron — toutes les 15 min)

| Automation | Déclencheur | Action |
|---|---|---|
| Relance nouveau lead | Lead sans réponse 24h | SMS Premier contact |
| Relance soumission | Soumission sans réponse 72h | SMS Relance soumission |
| Rappel paiement | Paiement dû dans 7 jours | SMS Rappel paiement |
| Paiement en retard | Paiement en retard 3+ jours | SMS urgent + marque en retard |
| Rappel RDV | Job planifié demain | SMS Rappel RDV veille |
| Suivi job complété | Job complété il y a 24h | SMS Job complété |
| Demande avis Google | Job complété il y a 7 jours | SMS Demande avis |

## Webhooks

- **Twilio** : `POST /api/webhook` — réception SMS entrants
- **Facebook Lead Ads** : `GET /api/leads/webhook` (vérification) + `POST /api/leads/webhook` (leads)

## Développement

```bash
npm install
npm run dev
```
