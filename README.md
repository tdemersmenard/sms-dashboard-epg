# SMS Dashboard — Entretien Piscine Granby

Dashboard de messagerie SMS pour gérer les conversations avec tes leads piscine via Twilio.

## Features

- 💬 Interface style iMessage avec conversations et messages
- 📩 Réception en temps réel des SMS entrants (webhook Twilio)
- 📤 Envoi de SMS direct depuis le dashboard
- 🔍 Recherche par nom, numéro ou contenu
- ✏️ Modification des noms et notes de contacts
- 🔴 Badges de messages non lus
- 📱 Responsive (mobile + desktop)

## Stack

- **Frontend**: Next.js 14, React, Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **SMS**: Twilio API

## Setup

### 1. Supabase

1. Crée un nouveau projet sur [supabase.com](https://supabase.com)
2. Va dans SQL Editor et exécute le contenu de `supabase/schema.sql`
3. Copie ton URL et tes clés (anon + service role) depuis Settings → API

### 2. Twilio

1. Tu as déjà ton compte Twilio — récupère ton Account SID et Auth Token
2. Note ton numéro Twilio (celui que t'utilises pour les leads)

### 3. Variables d'environnement

Copie `.env.local.example` en `.env.local` et remplis les valeurs :

```bash
cp .env.local.example .env.local
```

### 4. Installation

```bash
npm install
npm run dev
```

Le dashboard sera disponible sur `http://localhost:3000`

### 5. Déploiement Vercel

```bash
# Push sur GitHub
git init
git add .
git commit -m "Initial commit - SMS Dashboard"
git remote add origin https://github.com/tdemersmenard/sms-dashboard-epg.git
git push -u origin main

# Déploie via Vercel
# 1. Va sur vercel.com, importe le repo
# 2. Ajoute tes variables d'environnement
# 3. Deploy!
```

### 6. Webhook Twilio (IMPORTANT)

Après le déploiement, configure le webhook dans Twilio :

1. Va dans **Phone Numbers → Manage → Active Numbers**
2. Clique sur ton numéro
3. Dans **Messaging → A message comes in**, mets :
   ```
   https://ton-domaine.vercel.app/api/webhook
   ```
   Method: **HTTP POST**
4. Sauvegarde

### 7. Connecter à Make.com (optionnel)

Dans ton scénario Make existant qui envoie le SMS au lead, tu peux ajouter un module HTTP pour créer le contact dans Supabase en même temps :

- **URL**: `https://ton-url-supabase.supabase.co/rest/v1/contacts`
- **Method**: POST
- **Headers**:
  - `apikey`: ta clé anon Supabase
  - `Authorization`: `Bearer [ta clé service role]`
  - `Content-Type`: `application/json`
- **Body**: `{"phone": "+1XXXXXXXXXX", "name": "Nom du lead"}`

Comme ça, quand un lead rentre dans Make, le contact est déjà créé dans ton dashboard avec son nom.

## Structure

```
src/
├── app/
│   ├── api/
│   │   ├── contacts/     # PATCH - modifier un contact
│   │   ├── conversations/ # GET - liste des conversations
│   │   ├── messages/      # GET messages, POST envoyer
│   │   └── webhook/       # POST - réception SMS Twilio
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx           # Dashboard principal
├── lib/
│   ├── supabase.ts        # Client Supabase
│   ├── twilio.ts          # Client Twilio
│   ├── types.ts           # TypeScript types
│   └── utils.ts           # Formatage, helpers
└── supabase/
    └── schema.sql         # Schéma de la DB
```

## Notes

- Le polling est à 5 secondes — suffisant pour un usage normal
- Les messages sont marqués comme "lus" quand tu ouvres la conversation
- Le webhook retourne un TwiML vide (pas d'auto-reply)
- RLS est activé mais permissif (service role only) — ajoute une auth si tu veux sécuriser
