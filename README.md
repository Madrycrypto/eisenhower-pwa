# Macierz Eisenhowera PWA + n8n

To jest gotowy start pod VPS + Hostinger n8n:

- czysta tablica 2x2 jako PWA,
- synchronizacja zadań przez prosty backend Node,
- nagrywanie z telefonu,
- wysyłka tekstu/audio do n8n,
- n8n robi transkrypcję, parsowanie komendy i Google Calendar.

## Zacznij tutaj

Główna instrukcja krok po kroku:

```text
START_TUTAJ_KROK_PO_KROKU.md
```

## Lokalny test

```bash
cd ~/Desktop/eisenhower-pwa
PORT=8080 node server.js
```

Otwórz:

```text
http://localhost:8080
```

Bez `N8N_WEBHOOK_URL` działa ręczne dodawanie i przeciąganie. Dyktowanie wymaga n8n.

## Deploy na VPS Contabo

1. Wrzuć folder `eisenhower-pwa` na VPS, np. do `/opt/eisenhower-pwa`.
2. Utwórz plik `.env` na podstawie `.env.example`.
3. Uruchom:

```bash
cd /opt/eisenhower-pwa
set -a
. ./.env
set +a
node server.js
```

Najprościej podpiąć to potem pod `systemd` i reverse proxy Nginx/Caddy z HTTPS.

Przykład `systemd`:

```ini
[Unit]
Description=Eisenhower PWA
After=network.target

[Service]
WorkingDirectory=/opt/eisenhower-pwa
EnvironmentFile=/opt/eisenhower-pwa/.env
ExecStart=/usr/bin/node /opt/eisenhower-pwa/server.js
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

## n8n

1. W n8n wybierz **Import from file**.
2. Zaimportuj:

```text
n8n/eisenhower-intake-workflow.template.json
```

3. Ustaw credentials:

- OpenAI API w node `OpenAI - Transcribe Audio`
- OpenAI API w node `OpenAI - Parse Command`
- Google Calendar OAuth w node `Google Calendar - Create Event`

4. Aktywuj workflow.
5. Skopiuj produkcyjny webhook, np.:

```text
https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

6. Wstaw go do `.env` na VPS:

```bash
N8N_WEBHOOK_URL=https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

7. Zrestartuj aplikację.

## Komendy głosowe

Przykłady:

```text
Zrób teraz zadzwoń do Pawła jutro o 14 przypomnij godzinę wcześniej
Zaplanuj trening w piątek o 18
Deleguj przygotowanie raportu na jutro rano
Zaplanuj wizyta u dentysty 12 czerwca o 10
```

Domyślne przypomnienia, jeśli nie powiesz inaczej:

- 3 godziny przed,
- 1 godzinę przed,
- dla ważniejszych wydarzeń parser może oznaczyć przypomnienia codziennie o 7:00 przez 3 dni przed.

Uwaga: Google Calendar API wspiera standardowe przypomnienia minutowe przy wydarzeniu. Seria „codziennie o 7:00 przez 3 dni przed” najlepiej działa jako dodatkowe osobne reminder-eventy albo osobny workflow w n8n. Ten szablon ma przygotowane pole `dailyAt7For3Days`, ale finalny node trzeba rozbudować po Twojej decyzji, czy mają to być osobne wydarzenia, czy np. powiadomienia push/email.

## Telefon

Po wejściu na domenę aplikacji:

- iPhone: Safari → Udostępnij → Do ekranu początkowego.
- Android: Chrome → menu → Dodaj do ekranu głównego.

Mikrofon działa tylko na HTTPS albo localhost.

## Desktop widget

Na Windows:

- Lively Wallpaper: dodaj URL aplikacji jako web wallpaper.
- Wallpaper Engine: dodaj stronę jako web wallpaper.

Na macOS:

- Plash: dodaj URL aplikacji.

## SaaS: baza, logowanie, Stripe

Kolejny etap projektu jest opisany tutaj:

```text
SAAS_ARCHITECTURE.md
AUTH_STRIPE_KROK_PO_KROKU.md
supabase/schema.sql
```

Rekomendowany stack:

- Supabase Auth + Postgres,
- Google/Apple login,
- Stripe Checkout/Billing,
- n8n dla automatyzacji i Google Calendar.
