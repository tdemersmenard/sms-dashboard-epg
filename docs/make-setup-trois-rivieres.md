# Configurer Make pour les leads Trois-Rivières

## Contexte

L'endpoint `/api/leads/webhook` est multi-franchise. Il suffit d'envoyer `franchise_slug: "trois-rivieres"` dans le payload pour que les leads atterrissent dans le bon CRM.

---

## Étape 1 — Créer les publicités Facebook Lead Ads pour TR

Dans le Facebook Business Manager:
1. Créer une nouvelle campagne Lead Ads ciblant la région de Trois-Rivières
2. Inclure les champs de formulaire: **Prénom**, **Nom**, **Téléphone**, **Email**
3. Garder ce formulaire séparé de celui de Granby

---

## Étape 2 — Créer le scénario Make

### Structure du scénario

```
[Facebook Lead Ads] → [HTTP POST vers CHLORE]
```

### Configuration du module Facebook Lead Ads

- Connecter le même compte Business que pour Granby
- Sélectionner la **page Facebook de Trois-Rivières** (ou la campagne TR)
- Déclencher sur: **New Lead**

### Configuration du module HTTP POST

| Champ | Valeur |
|-------|--------|
| URL | `https://chlore.vercel.app/api/leads/webhook` |
| Method | `POST` |
| Content-Type | `application/json` |

**Body (JSON):**

```json
{
  "franchise_slug": "trois-rivieres",
  "first_name": "{{1.first_name}}",
  "last_name": "{{1.last_name}}",
  "phone": "{{1.phone_number}}",
  "email": "{{1.email}}"
}
```

> Remplacer `{{1.first_name}}` etc. par les variables du module Facebook Lead Ads de Make.
> Le champ `phone_number` peut s'appeler `phone` selon la config du formulaire Facebook — vérifier dans Make.

---

## Étape 3 — Mettre à jour le scénario Granby existant (optionnel mais recommandé)

Ajouter `"franchise_slug": "granby"` au body du scénario Granby existant:

```json
{
  "franchise_slug": "granby",
  "first_name": "{{1.first_name}}",
  "last_name": "{{1.last_name}}",
  "phone": "{{1.phone_number}}",
  "email": "{{1.email}}"
}
```

Sans ce champ, le fallback Granby s'applique automatiquement — le scénario existant continue de fonctionner sans modification.

---

## Étape 4 — Configurer Twilio pour Trois-Rivières (requis pour le 1er SMS)

Dans CHLORE > Master > Franchises > Trois-Rivières, configurer:
- **Twilio Account SID** (compte TR ou sous-compte)
- **Twilio Auth Token**
- **Numéro Twilio** (le numéro SMS de Trois-Rivières)

Sans cette configuration, les leads TR sont créés correctement dans le CRM mais **aucun SMS de bienvenue n'est envoyé** (comportement intentionnel — le système ne envoie jamais depuis le numéro de Granby).

---

## Validation

Tester avec un payload curl:

```bash
# Test Trois-Rivières
curl -X POST https://chlore.vercel.app/api/leads/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "franchise_slug": "trois-rivieres",
    "first_name": "Jean",
    "last_name": "Test",
    "phone": "8195550001",
    "email": "jean.test@example.com"
  }'

# Test Granby (avec slug explicite)
curl -X POST https://chlore.vercel.app/api/leads/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "franchise_slug": "granby",
    "first_name": "Marie",
    "last_name": "Test",
    "phone": "4505550002",
    "email": "marie.test@example.com"
  }'
```

**Résultats attendus:**
- Contact TR visible dans `/trois-rivieres/conversations` avec son nom
- Contact Granby visible dans `/granby/conversations` avec son nom
- Aucun contact avec `franchise_id = NULL`
- Numéros normalisés en E.164 (`+1...`)
- Si même numéro soumis deux fois → mise à jour (pas de doublon)
