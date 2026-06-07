# SaaS architecture: baza, logowanie, Stripe

Docelowy produkt:

```text
Laptop / Mobile / Smartwatch
  -> PWA Eisenhower
  -> Supabase Auth + Postgres
  -> n8n voice/calendar automation
  -> Stripe subscriptions
```

## Rekomendowany stack

### Supabase

Używamy Supabase do:

- bazy Postgres,
- logowania Google,
- logowania Apple,
- magic link/email jako fallback,
- Row Level Security, żeby użytkownik widział tylko swoje zadania,
- opcjonalnie realtime sync.

Supabase Auth obsługuje social login, w tym Google i Apple, oraz integruje się z bazą przez JWT i RLS.

### Stripe

Używamy Stripe do:

- subskrypcji,
- triala,
- płatności kartą,
- customer portal,
- webhooków `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Najprościej użyć Stripe Checkout, czyli hostowanej strony płatności Stripe.

### n8n

Używamy n8n do:

- transkrypcji audio,
- parsera komend,
- Google Calendar,
- ewentualnie email/push reminderów,
- MCP dla Claude/Codex.

## Dlaczego nie lokalny `data/tasks.json`

Obecna wersja zapisuje dane w:

```text
data/tasks.json
```

To jest OK dla prywatnego prototypu, ale nie dla SaaS.

Problem:

- brak użytkowników,
- brak izolacji danych,
- brak backupów,
- brak subskrypcji,
- brak synchronizacji wielu urządzeń,
- ryzyko konfliktów przy wielu requestach.

Docelowo `tasks.json` zamieniamy na Supabase.

## Modele danych

Minimalne tabele:

```text
profiles
subscriptions
tasks
voice_intakes
calendar_events
focus_sessions
```

## Uprawnienia

Każda tabela użytkownika musi mieć:

```text
user_id uuid references auth.users(id)
```

RLS:

```text
user_id = auth.uid()
```

Dzięki temu użytkownik widzi tylko własne zadania.

## Plany płatne

Propozycja:

### Free

- 50 zadań aktywnych,
- ręczne dodawanie,
- bez Google Calendar,
- bez smartwatch voice.

### Pro

- nielimitowane zadania,
- dyktowanie,
- Google Calendar,
- smartwatch,
- n8n automation,
- recurring reminders.

### Family / Team

- współdzielone projekty,
- delegowanie między osobami,
- role.

## Gating funkcji

Backend powinien sprawdzać subskrypcję przed:

- `/api/intake/audio`,
- `/api/intake/text`,
- Google Calendar creation,
- smartwatch voice,
- większym limitem zadań.

Przykład:

```text
if subscription.status not in ['active', 'trialing']:
  block premium automation
```

## Proponowany etap wdrożenia

1. Założyć Supabase project.
2. Wykonać SQL z `supabase/schema.sql`.
3. Włączyć Google Auth.
4. Włączyć Apple Auth.
5. Utworzyć Stripe products/prices.
6. Dodać Stripe webhook do backendu albo n8n.
7. Przepiąć frontend z `/api/tasks` na Supabase albo backend Supabase-aware.
8. Usunąć lokalne `tasks.json` z produkcji.

## Najważniejsza decyzja

Są dwie ścieżki techniczne:

### Ścieżka A: frontend gada bezpośrednio z Supabase

Plusy:

- szybciej,
- mniej backendu,
- Supabase SDK robi auth i RLS.

Minusy:

- trzeba dobrze ustawić RLS,
- Stripe i n8n i tak wymagają backend/webhooków.

### Ścieżka B: backend Node jest API gateway

Plusy:

- pełna kontrola,
- łatwiejsze gating płatności,
- n8n/Stripe po jednej stronie.

Minusy:

- więcej kodu.

Moja rekomendacja: **Ścieżka B** dla SaaS, bo masz n8n, Stripe i smartwatch. Frontend może używać Supabase Auth, ale operacje premium idą przez backend.
