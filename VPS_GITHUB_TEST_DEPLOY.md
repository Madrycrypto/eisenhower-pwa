# VPS + GitHub deploy + test urządzeń

Docelowy układ:

```text
GitHub main branch
  -> GitHub Actions
  -> VPS /opt/eisenhower-pwa
  -> systemd eisenhower-pwa
  -> Caddy HTTPS
  -> laptop / telefon / smartwatch

PWA
  -> https://n8n.maciejmostowski.pl/webhook/eisenhower-intake
  -> OpenAI transcription/parser
  -> Google Calendar
```

## 1. DNS

Ustaw rekord `A`:

```text
tasks.maciejmostowski.pl -> IP_TWOJEGO_VPS
```

`n8n.maciejmostowski.pl` zostaje dla n8n.

Jeśli chcesz inną domenę aplikacji, użyj jej wszędzie zamiast `tasks.maciejmostowski.pl`.

## 2. Pierwsza instalacja na VPS

Zaloguj się na VPS:

```bash
ssh root@IP_TWOJEGO_VPS
```

Zainstaluj Node.js 20, git, rsync i Caddy:

```bash
apt update
apt install -y curl git rsync openssl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

Wgraj tymczasowo projekt do `/tmp/eisenhower-pwa` albo po pierwszym pushu z GitHuba. Następnie uruchom setup:

```bash
cd /tmp/eisenhower-pwa
APP_DOMAIN=tasks.maciejmostowski.pl \
N8N_WEBHOOK_URL=https://n8n.maciejmostowski.pl/webhook/eisenhower-intake \
./scripts/vps-first-setup.sh
```

Skrypt wypisze `APP_TOKEN`. Zachowaj go.

## 3. GitHub repo

Na laptopie w folderze projektu:

```bash
cd /Users/maciejmostowski/Desktop/eisenhower-pwa
git init
git add .
git commit -m "Initial Eisenhower PWA deploy"
git branch -M main
git remote add origin git@github.com:TWOJ_LOGIN/eisenhower-pwa.git
git push -u origin main
```

Jeśli GitHub repo ma być prywatne, też jest OK. GitHub Actions nadal zadziała.

## 4. GitHub Secrets

W GitHub wejdź:

```text
Repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Dodaj:

```text
VPS_HOST=IP_TWOJEGO_VPS
VPS_PORT=22
VPS_USER=root
VPS_SSH_KEY=PRYWATNY_KLUCZ_SSH_DEPLOY
APP_DOMAIN=tasks.maciejmostowski.pl
```

Najprościej utworzyć osobny klucz:

```bash
ssh-keygen -t ed25519 -C "github-eisenhower-deploy" -f ~/.ssh/eisenhower_deploy
```

Publiczny klucz dodaj na VPS do:

```bash
~/.ssh/authorized_keys
```

Prywatny klucz `~/.ssh/eisenhower_deploy` wklej jako `VPS_SSH_KEY`.

Test połączenia z MacBooka:

```bash
ssh -i ~/.ssh/eisenhower_deploy root@IP_TWOJEGO_VPS "hostname && node -v"
```

## 5. Automatyczne wdrożenie

Każdy push na `main` uruchomi:

```text
.github/workflows/deploy-vps.yml
```

Workflow:

```text
1. sprawdza składnię JS,
2. wysyła pliki na VPS,
3. nie nadpisuje .env,
4. nie nadpisuje data/tasks.json,
5. restartuje systemd,
6. sprawdza /api/health.
```

Po każdej poprawce lokalnie:

```bash
git add .
git commit -m "Opis poprawki"
git push
```

Po `git push` wejdź w:

```text
GitHub repo -> Actions -> Deploy Eisenhower PWA to VPS
```

Jeśli workflow jest zielony, VPS ma aktualną wersję.

## 6. Test n8n

Najpierw aktywuj workflow w n8n.

Test bez aplikacji:

```bash
curl -X POST https://n8n.maciejmostowski.pl/webhook/eisenhower-intake \
  -H "Content-Type: application/json" \
  -d '{"text":"Zaplanuj spotkanie z Kasią jutro o 14 przypomnij 3 godziny wcześniej","timezone":"Europe/Warsaw"}'
```

Powinieneś dostać JSON z `task` i opcjonalnie `event`.

## 7. Test aplikacji po deployu

Health:

```bash
curl https://tasks.maciejmostowski.pl/api/health
```

Oczekiwane:

```json
{
  "ok": true,
  "service": "eisenhower-pwa",
  "n8nEnabled": true
}
```

Test dodania zadania:

```bash
curl -X POST https://tasks.maciejmostowski.pl/api/intake/text \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer APP_TOKEN_Z_VPS" \
  -d '{"text":"Do First oddzwonić do Pawła dzisiaj","timezone":"Europe/Warsaw","forcedZone":"do"}'
```

Pełny smoke test z MacBooka:

```bash
cd /Users/maciejmostowski/Desktop/eisenhower-pwa
APP_URL=https://tasks.maciejmostowski.pl \
N8N_URL=https://n8n.maciejmostowski.pl/webhook/eisenhower-intake \
APP_TOKEN=APP_TOKEN_Z_VPS \
./scripts/test-production.sh
```

## 8. Test na laptopie

Otwórz:

```text
https://tasks.maciejmostowski.pl/v2.html
```

Sprawdź:

```text
- dodawanie ręczne,
- przesuwanie kart,
- mikrofon główny,
- mikrofon w kwadracie,
- /watch.html.
```

## 9. Test na telefonie

Otwórz:

```text
https://tasks.maciejmostowski.pl/v2.html
```

Potem:

```text
Safari/Chrome -> Add to Home Screen
```

Sprawdź:

```text
- mikrofon pyta o pozwolenie,
- tekst pojawia się w polu,
- zadanie trafia do wybranego kwadratu,
- po odświeżeniu zadanie nadal istnieje.
```

## 10. Test na smartwatchu

Otwórz na zegarku:

```text
https://tasks.maciejmostowski.pl/watch.html
```

Najpewniejsze wejście:

```text
telefon -> wyślij link do siebie -> otwórz link na zegarku
```

Sprawdź:

```text
- liczniki kwadratów,
- szybkie dodanie notatki,
- token jeśli APP_TOKEN jest ustawiony.
```

Na Apple Watch prawdziwe dyktowanie najlepiej zrobić przez Apple Shortcuts:

```text
Dictate Text
POST https://tasks.maciejmostowski.pl/api/intake/text
Authorization: Bearer APP_TOKEN
Body: {"text":"<dyktowany tekst>","timezone":"Europe/Warsaw"}
```

URL dla zegarka:

```text
https://tasks.maciejmostowski.pl/watch.html
```

URL dla telefonu i laptopa:

```text
https://tasks.maciejmostowski.pl/v2.html
```

## 11. Gdy coś nie działa

Na VPS:

```bash
systemctl status eisenhower-pwa
journalctl -u eisenhower-pwa -f
curl http://127.0.0.1:8080/api/health
```

W n8n:

```text
Executions -> ostatnie wykonanie -> sprawdź node, który się wysypał.
```
