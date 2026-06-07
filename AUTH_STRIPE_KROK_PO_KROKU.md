# Auth + Stripe krok po kroku

## 1. Supabase

1. Utwórz projekt Supabase.
2. Wejdź w SQL Editor.
3. Uruchom:

```text
supabase/schema.sql
```

4. Wejdź w Authentication -> Providers.
5. Włącz Google.
6. Włącz Apple.
7. Dodaj URL aplikacji do redirect URLs:

```text
https://tasks.twojadomena.pl
https://tasks.twojadomena.pl/v2.html
```

## 2. Google OAuth

1. Utwórz projekt w Google Cloud.
2. Skonfiguruj OAuth consent screen.
3. Utwórz OAuth Client ID dla Web.
4. Dodaj redirect URL z Supabase Auth.
5. Wklej Client ID i Client Secret do Supabase Google Provider.

## 3. Apple OAuth

1. W Apple Developer utwórz Services ID.
2. Skonfiguruj Sign in with Apple.
3. Dodaj domenę aplikacji.
4. Dodaj callback URL z Supabase Auth.
5. Wklej dane Apple do Supabase Apple Provider.

Apple jest bardziej upierdliwe niż Google, więc zacznij od Google, a Apple zrób jako drugi provider.

## 4. Stripe

1. Utwórz produkt:

```text
Eisenhower Pro
```

2. Utwórz price:

```text
monthly
yearly
```

3. Użyj Stripe Checkout dla subskrypcji.
4. Backend tworzy Checkout Session.
5. Stripe redirectuje użytkownika do płatności.
6. Po płatności Stripe webhook aktualizuje tabelę `subscriptions`.

## 5. Stripe webhook events

Obsłuż minimum:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

## 6. Gating premium

Funkcje premium:

- dyktowanie audio,
- Google Calendar,
- smartwatch voice,
- n8n automations,
- więcej niż 50 aktywnych zadań.

Backend przed wykonaniem sprawdza:

```text
subscriptions.status in ('active', 'trialing')
```

## 7. Kolejność implementacji

1. Supabase schema.
2. Google login.
3. Przepięcie tasks z JSON na Supabase.
4. Stripe Checkout.
5. Stripe webhooks.
6. Apple login.
7. Premium gating.
8. Customer portal.

## 8. Zmiany w obecnej aplikacji

Obecne:

```text
data/tasks.json
APP_TOKEN
```

Docelowe:

```text
Supabase JWT
Supabase user_id
RLS
Stripe subscription status
```

`APP_TOKEN` może zostać tylko dla prywatnego admin/test mode, ale użytkownicy logują się przez Supabase.
