# Statyczna PWA: Etap 1 i Etap 2

## Cel

```text
Etap 1:
GitHub Pages albo Hostinger static
localStorage na zadania
n8n webhook do dyktowania i Google Calendar
bez VPS dla aplikacji

Etap 2:
Supabase Auth + Supabase tasks
synchronizacja laptop / telefon / smartwatch
n8n dalej jako automatyzacje
```

## Pliki statycznej aplikacji

```text
static/index.html
static/v2.html
static/v2.css
static/app.js
static/watch.html
static/watch.js
static/manifest.webmanifest
static/sw.js
static/icon.svg
```

## Etap 1: GitHub Pages

1. Utwórz repo na GitHub.
2. W folderze projektu:

```bash
cd /Users/maciejmostowski/Desktop/eisenhower-pwa
git init
git add .
git commit -m "Static Eisenhower PWA"
git branch -M main
git remote add origin git@github.com:TWOJ_LOGIN/eisenhower-pwa.git
git push -u origin main
```

3. W GitHub:

```text
Repo -> Settings -> Pages -> Build and deployment -> GitHub Actions
```

4. Workflow:

```text
.github/workflows/deploy-static-pages.yml
```

uruchomi deploy folderu:

```text
static/
```

Po deployu dostaniesz adres GitHub Pages.

## Etap 1: Hostinger static

Jeśli wolisz Hostinger:

1. Wejdź w File Manager / FTP.
2. Wgraj zawartość folderu:

```text
static/
```

do katalogu strony, np.:

```text
public_html/
```

3. Otwórz domenę lub subdomenę.

## Konfiguracja n8n w aplikacji

W aplikacji kliknij avatar/ustawienia `MM`.

Wpisz:

```text
https://n8n.maciejmostowski.pl/webhook/eisenhower-intake
```

Od tego momentu dyktowanie tekstowe będzie próbowało wysłać komendę do n8n.

Jeśli chcesz prawdziwą transkrypcję audio, w n8n użyj pełnego workflow:

```text
n8n/eisenhower-intake-workflow.maciejmostowski.json
```

Ścieżka audio musi działać tak:

```text
Webhook -> Normalize Input -> Audio?
true  -> OpenAI - Transcribe Audio -> Audio Text -> OpenAI - Parse Command
false -> Typed Text -> OpenAI - Parse Command
```

Node `OpenAI - Transcribe Audio` uruchamiaj tylko wtedy, gdy wejście ma `hasBinary=true`.
Jeśli wejście ma sam tekst (`hasBinary=false`), transkrypcja audio zwróci błąd typu `you must provide a model parameter` albo błąd braku pliku/modelu, bo nie ma pliku audio do wysłania.

Jeśli n8n nie odpowie albo CORS zablokuje odczyt odpowiedzi, aplikacja spróbuje użyć lokalnego podglądu tekstu, jeśli przeglądarka go poda.

## Test laptop

```text
otwórz index.html przez HTTPS
dodaj zadanie ręcznie
przenieś kartę między kwadratami
kliknij mikrofon przy kwadracie
sprawdź czy tekst trafia do localStorage
```

## Test telefon

```text
otwórz stronę w Safari/Chrome
dodaj do ekranu głównego
pozwól na mikrofon
powiedz komendę
sprawdź czy zadanie pojawiło się w kwadracie
```

## Test smartwatch

```text
otwórz /watch.html
dodaj krótką notatkę
sprawdź liczniki
```

Na zegarku dyktowanie najlepiej działa przez systemowe dyktowanie w polu tekstowym albo Skróty Apple/Android.

## Etap 2: Supabase

Do synchronizacji między urządzeniami potrzebujemy:

```text
Supabase project
Supabase Auth
tabela tasks
RLS policies
logowanie w aplikacji
adapter localStorage -> Supabase
```

Schemat startowy jest tutaj:

```text
supabase/schema.sql
```

## Etap 2: kroki Supabase

1. Utwórz projekt w Supabase.
2. Wejdź w SQL Editor.
3. Wklej i uruchom:

```text
supabase/schema.sql
```

4. Wejdź w:

```text
Project Settings -> API
```

Skopiuj:

```text
Project URL
anon public key
```

5. Wejdź w:

```text
Authentication -> URL Configuration
```

Dodaj do redirect URLs:

```text
https://madrycrypto.github.io/eisenhower-pwa/
https://madrycrypto.github.io/eisenhower-pwa/index.html
https://madrycrypto.github.io/eisenhower-pwa/watch.html
```

6. W aplikacji kliknij `MM` i wpisz:

```text
Webhook n8n
Supabase URL
Supabase anon key
Email logowania
```

7. Kliknij `Zapisz`, potem `Wyślij link`.

Po zalogowaniu localStorage działa jako offline cache, a Supabase synchronizuje zadania między laptopem, telefonem i widokiem watch.

Ważne: `anon public key` może być w przeglądarce. Bezpieczeństwo zapewniają RLS policies z `supabase/schema.sql`.
