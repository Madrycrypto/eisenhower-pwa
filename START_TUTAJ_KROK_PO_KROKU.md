# Start tutaj: instrukcja krok po kroku

To jest główna instrukcja wdrożenia aplikacji Eisenhower jako SaaS.

Docelowo masz:

```text
https://tasks.twojadomena.pl   -> aplikacja
https://n8n.twojadomena.pl     -> automatyzacje
Supabase                       -> baza + logowanie Google/Apple
Stripe                         -> płatności
```

## Etap 0: co musisz mieć

- [ ] Konto Hostinger albo VPS.
- [ ] Działające n8n.
- [ ] Konto Supabase.
- [ ] Konto Stripe.
- [ ] Konto Google Cloud.
- [ ] Opcjonalnie Apple Developer, jeśli chcesz Sign in with Apple.
- [ ] Domenę albo subdomenę, np. `tasks.twojadomena.pl`.

## Etap 1: Supabase - baza danych

### 1.1 Utwórz projekt Supabase

1. Wejdź na Supabase.
2. Kliknij **New project**.
3. Wybierz nazwę, np.:

```text
eisenhower-saas
```

4. Zapisz:

```text
Project URL
anon public key
service role key
```

Service role key trzymaj tylko po stronie backendu/n8n. Nigdy w frontendzie.

### 1.2 Wgraj schemat bazy

1. Supabase -> SQL Editor.
2. Otwórz lokalny plik:

```text
supabase/schema.sql
```

3. Skopiuj całość.
4. Wklej w SQL Editor.
5. Kliknij **Run**.

Po tym powinny powstać tabele:

```text
profiles
subscriptions
tasks
voice_intakes
calendar_events
focus_sessions
```

## Etap 2: Supabase Auth - Google login

### 2.1 Google Cloud

1. Wejdź do Google Cloud Console.
2. Utwórz projekt.
3. Wejdź w **APIs & Services -> OAuth consent screen**.
4. Skonfiguruj nazwę aplikacji.
5. Wejdź w **Credentials**.
6. Utwórz **OAuth Client ID**.
7. Typ:

```text
Web application
```

8. Dodaj authorized redirect URI z Supabase.

Znajdziesz go w:

```text
Supabase -> Authentication -> Providers -> Google
```

Wygląda mniej więcej tak:

```text
https://TWOJ-PROJEKT.supabase.co/auth/v1/callback
```

9. Skopiuj:

```text
Google Client ID
Google Client Secret
```

### 2.2 Supabase Google Provider

1. Supabase -> Authentication -> Providers.
2. Włącz **Google**.
3. Wklej Client ID.
4. Wklej Client Secret.
5. Zapisz.

### 2.3 Redirect URLs

Supabase -> Authentication -> URL Configuration.

Dodaj:

```text
https://tasks.twojadomena.pl
https://tasks.twojadomena.pl/v2.html
https://tasks.twojadomena.pl/watch.html
```

Na czas testów lokalnych możesz dodać:

```text
http://localhost:8080
http://localhost:8080/v2.html
```

## Etap 3: Apple login

Ten etap możesz zrobić później. Najpierw uruchom Google.

Jeśli chcesz Apple:

1. Wejdź do Apple Developer.
2. Utwórz **Services ID**.
3. Włącz **Sign in with Apple**.
4. Dodaj domenę:

```text
tasks.twojadomena.pl
```

5. Dodaj callback Supabase:

```text
https://TWOJ-PROJEKT.supabase.co/auth/v1/callback
```

6. W Supabase -> Authentication -> Providers -> Apple wklej dane Apple.

## Etap 4: Stripe - płatności

### 4.1 Utwórz produkt

1. Wejdź do Stripe Dashboard.
2. Products -> Add product.
3. Nazwa:

```text
Eisenhower Pro
```

4. Dodaj ceny:

```text
Monthly
Yearly
```

Zapisz:

```text
STRIPE_PRICE_MONTHLY
STRIPE_PRICE_YEARLY
```

### 4.2 Przygotuj webhook Stripe

Docelowy webhook:

```text
https://tasks.twojadomena.pl/api/stripe/webhook
```

Eventy do włączenia:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

Zapisz:

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
```

## Etap 5: n8n - dyktowanie i Google Calendar

### 5.1 Import workflow

W n8n:

1. Workflows.
2. Import from file.
3. Wybierz:

```text
n8n/eisenhower-intake-workflow.template.json
```

### 5.2 Podłącz credentials

W workflow ustaw:

- OpenAI credentials w node transkrypcji.
- OpenAI credentials w node parsera.
- Google Calendar OAuth w node kalendarza.

### 5.3 Aktywuj workflow

1. Kliknij **Active**.
2. Skopiuj Production URL webhooka:

```text
https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

Ten URL wpiszesz do aplikacji jako `N8N_WEBHOOK_URL`.

## Etap 6: Hostinger - wgranie aplikacji

Masz dwie opcje.

## Opcja A: Hostinger Node.js app

Jeśli hPanel ma Node.js App:

1. Wgraj ZIP:

```text
eisenhower-pwa-hostinger.zip
```

2. Rozpakuj.
3. Folder aplikacji:

```text
eisenhower-pwa
```

4. Start command:

```bash
npm start
```

albo:

```bash
node server.js
```

5. Ustaw domenę:

```text
tasks.twojadomena.pl
```

6. Włącz SSL.

## Opcja B: VPS

Na swoim komputerze:

```bash
scp -r ~/Desktop/eisenhower-pwa root@IP_SERWERA:/opt/eisenhower-pwa
```

Na VPS:

```bash
cd /opt/eisenhower-pwa
cp .env.example .env
nano .env
```

## Etap 7: plik `.env`

Na Hostinger/VPS ustaw:

```bash
PORT=8080
APP_TOKEN=wpisz-tu-dlugi-losowy-token
N8N_WEBHOOK_URL=https://n8n.twojadomena.pl/webhook/eisenhower-intake

SUPABASE_URL=https://TWOJ-PROJEKT.supabase.co
SUPABASE_ANON_KEY=twoj-anon-public-key
SUPABASE_SERVICE_ROLE_KEY=twoj-service-role-key

STRIPE_SECRET_KEY=sk_live_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_MONTHLY=price_xxx
STRIPE_PRICE_YEARLY=price_xxx
```

Uwaga: obecna paczka ma gotowe pliki architektury i SQL. Pełne przepięcie kodu z `tasks.json` na Supabase/Stripe to następny etap implementacyjny. Ten `.env` przygotowuje środowisko.

## Etap 8: uruchom aplikację

Na VPS:

```bash
cd /opt/eisenhower-pwa
set -a
. ./.env
set +a
node server.js
```

Test:

```text
https://tasks.twojadomena.pl
https://tasks.twojadomena.pl/v2.html
https://tasks.twojadomena.pl/watch.html
```

## Etap 9: testy ręczne

### 9.1 Laptop

Otwórz:

```text
https://tasks.twojadomena.pl/v2.html
```

Sprawdź:

- [ ] widzisz dashboard,
- [ ] możesz dodać zadanie,
- [ ] możesz przeciągać między kwadrantami,
- [ ] działa `Zrobione`,
- [ ] działa `Usuń`.

### 9.2 Telefon

Otwórz w Safari/Chrome:

```text
https://tasks.twojadomena.pl/v2.html
```

Dodaj do ekranu głównego.

Sprawdź:

- [ ] aplikacja otwiera się jak PWA,
- [ ] możesz dodać zadanie,
- [ ] przycisk `Nagraj` prosi o mikrofon,
- [ ] HTTPS działa.

### 9.3 Smartwatch

Otwórz:

```text
https://tasks.twojadomena.pl/watch.html
```

Sprawdź:

- [ ] licznik zadań działa,
- [ ] możesz dodać krótką notatkę,
- [ ] możesz kliknąć `Nagraj`, jeśli zegarek obsługuje nagrywanie w przeglądarce.

## Etap 10: Apple Watch / Wear OS przez skróty

Najpewniejsza metoda:

```text
smartwatch -> dyktowanie systemowe -> webhook n8n
```

Instrukcja szczegółowa:

```text
SMARTWATCH_KROK_PO_KROKU.md
```

## Etap 11: MCP n8n dla Claude/Codex

Jeśli chcesz sterować aplikacją z Claude/Codex przez MCP:

```text
N8N_MCP_KROK_PO_KROKU.md
```

## Etap 12: co robimy dalej

Po wykonaniu powyższego są dwa możliwe kolejne kroki:

### Opcja 1: prywatne narzędzie

Zostawiamy:

```text
APP_TOKEN
tasks.json
n8n webhook
```

To jest szybkie i wystarczy dla Ciebie.

### Opcja 2: prawdziwy SaaS

Robimy implementację:

```text
Supabase Auth
Supabase tasks
Stripe Checkout
Stripe webhooks
premium gating
```

To jest następna większa praca kodowa.

## Najkrótsza kolejność

Jeśli chcesz iść bez chaosu:

1. Uruchom aplikację na Hostinger.
2. Uruchom n8n webhook.
3. Przetestuj dyktowanie.
4. Załóż Supabase i wgraj SQL.
5. Włącz Google login.
6. Dopiero potem Stripe.
7. Na końcu Apple login i MCP.
