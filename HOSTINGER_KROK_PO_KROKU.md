# Wdrożenie na Hostinger krok po kroku

Masz tutaj dwa tory:

1. **Aplikacja PWA**: tablica Eisenhowera online, działa na telefonie i pulpicie.
2. **n8n**: workflow do dyktowania, Google Calendar i opcjonalnie MCP dla Claude/Codex.

Najprostszy setup:

```text
tasks.twojadomena.pl        -> aplikacja PWA
n8n.twojadomena.pl          -> Hostinger n8n
```

## Co wrzucasz na Hostinger

Wrzucasz cały folder:

```text
eisenhower-pwa
```

Najważniejsze pliki:

```text
server.js
package.json
.env.example
public/
data/
n8n/eisenhower-intake-workflow.template.json
```

## Opcja A: Hostinger Node.js App przez hPanel

Wybierz tę opcję, jeśli w hPanel masz funkcję **Node.js application**.

### 1. Przygotuj plik `.env`

Na podstawie `.env.example` utwórz `.env`:

```bash
PORT=8080
APP_TOKEN=wpisz-tu-dlugi-losowy-token
N8N_WEBHOOK_URL=https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

`APP_TOKEN` chroni API aplikacji. Po wejściu w aplikację kliknij ustawienia i wpisz ten sam token.

### 2. Wgraj pliki

W hPanel użyj jednej z metod:

- GitHub deployment, jeśli wrzucisz folder do repozytorium.
- File Manager / upload ZIP, jeśli chcesz wgrać ręcznie.

Katalog startowy aplikacji musi wskazywać na folder z `server.js`.

### 3. Ustaw komendę startową

W Hostinger Node.js App ustaw:

```bash
npm start
```

albo:

```bash
node server.js
```

### 4. Ustaw domenę/subdomenę

Przykład:

```text
tasks.twojadomena.pl
```

Mikrofon w telefonie będzie działał tylko przez HTTPS, więc upewnij się, że SSL jest aktywny.

### 5. Test

Otwórz:

```text
https://tasks.twojadomena.pl/api/tasks
```

Jeśli masz ustawiony `APP_TOKEN`, zobaczysz `Unauthorized`; to dobrze. Sama aplikacja poprosi Cię o token.

## Opcja B: Hostinger VPS z n8n

Wybierz tę opcję, jeśli masz VPS z n8n i chcesz trzymać aplikację na tym samym serwerze.

Hostinger ma szablon **Ubuntu 24.04 with n8n**, gdzie n8n działa w Dockerze. Aplikację PWA możesz uruchomić obok, np. w `/opt/eisenhower-pwa`.

### 1. Połącz się przez SSH

```bash
ssh root@IP_SERWERA
```

### 2. Wgraj folder

Na swoim komputerze:

```bash
scp -r ~/Desktop/eisenhower-pwa root@IP_SERWERA:/opt/eisenhower-pwa
```

### 3. Utwórz `.env`

Na VPS:

```bash
cd /opt/eisenhower-pwa
cp .env.example .env
nano .env
```

Ustaw:

```bash
PORT=8080
APP_TOKEN=wpisz-tu-dlugi-losowy-token
N8N_WEBHOOK_URL=https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

### 4. Uruchom testowo

```bash
cd /opt/eisenhower-pwa
set -a
. ./.env
set +a
node server.js
```

W drugim terminalu:

```bash
curl http://127.0.0.1:8080/api/config
```

### 5. Systemd

Skopiuj service:

```bash
cp /opt/eisenhower-pwa/eisenhower-pwa.service.example /etc/systemd/system/eisenhower-pwa.service
systemctl daemon-reload
systemctl enable eisenhower-pwa
systemctl start eisenhower-pwa
systemctl status eisenhower-pwa
```

### 6. Reverse proxy

Jeśli używasz Caddy, użyj:

```text
Caddyfile.example
```

Jeśli używasz Nginx, użyj:

```text
nginx.example.conf
```

Docelowo aplikacja ma być pod:

```text
https://tasks.twojadomena.pl
```

## Import workflow n8n

### 1. Import

W n8n:

```text
Workflows -> Import from file
```

Importuj:

```text
n8n/eisenhower-intake-workflow.template.json
```

### 2. Podłącz credentials

W node’ach ustaw:

- OpenAI credentials w `OpenAI - Transcribe Audio`
- OpenAI credentials w `OpenAI - Parse Command`
- Google Calendar OAuth w `Google Calendar - Create Event`

### 3. Aktywuj workflow

Po aktywacji skopiuj **Production URL** webhooka:

```text
https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

Wklej go do `.env` aplikacji jako:

```bash
N8N_WEBHOOK_URL=https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

Zrestartuj aplikację:

```bash
systemctl restart eisenhower-pwa
```

## Instalacja na telefonie

### iPhone

1. Otwórz `https://tasks.twojadomena.pl` w Safari.
2. Kliknij udostępnianie.
3. Wybierz **Do ekranu początkowego**.

### Android

1. Otwórz `https://tasks.twojadomena.pl` w Chrome.
2. Menu.
3. **Dodaj do ekranu głównego**.

## Smartwatch

Dodałem mini ekran dla zegarka:

```text
https://tasks.twojadomena.pl/watch.html
```

Pełna instrukcja jest tutaj:

```text
SMARTWATCH_KROK_PO_KROKU.md
```

Najpewniejsza opcja to Apple Shortcuts albo Tasker/AutoWear, które wysyłają dyktowany tekst prosto do webhooka n8n.

## Test komendy głosowej

Powiedz:

```text
Zrób teraz spotkanie z Pawłem jutro o 14 przypomnij godzinę wcześniej
```

Oczekiwany efekt:

- karta trafia do `Zrób teraz`,
- jeśli parser wykryje termin, n8n tworzy wydarzenie w Google Calendar,
- przypomnienie idzie według komendy albo domyślnie.

## Najczęstsze problemy

### Mikrofon nie działa

Powód: brak HTTPS. Użyj domeny z SSL, nie gołego IP.

### Aplikacja pokazuje `Unauthorized`

Wpisz token w ustawieniach aplikacji. To ten sam token co `APP_TOKEN` w `.env`.

### Dyktowanie nie dodaje zadania

Sprawdź:

- czy workflow n8n jest aktywny,
- czy `N8N_WEBHOOK_URL` jest production URL, nie test URL,
- czy credentials OpenAI działają,
- czy Google Calendar credentials są połączone.

### Google Calendar nie tworzy wydarzenia

Najczęściej parser nie wykrył konkretnej daty/godziny. Przetestuj komendę:

```text
Zaplanuj wizyta u dentysty 12 czerwca 2026 o 10:00
```

## MCP dla Claude/Codex

Webhook aplikacji i MCP to dwa różne wejścia.

- Webhook: używa aplikacja PWA.
- MCP: używa Claude/Codex jako zestawu narzędzi.

Dla MCP zobacz:

```text
N8N_MCP_KROK_PO_KROKU.md
```
