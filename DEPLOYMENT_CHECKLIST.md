# Checklist przed wdrożeniem

## Domena

- [ ] Mam domenę albo subdomenę dla aplikacji, np. `tasks.twojadomena.pl`.
- [ ] Mam domenę albo subdomenę dla n8n, np. `n8n.twojadomena.pl`.
- [ ] SSL/HTTPS działa na obu domenach.

## Aplikacja PWA

- [ ] Folder `eisenhower-pwa` jest wgrany na Hostinger.
- [ ] `server.js` jest plikiem startowym.
- [ ] `npm start` albo `node server.js` uruchamia aplikację.
- [ ] `.env` zawiera `APP_TOKEN`.
- [ ] `.env` zawiera `N8N_WEBHOOK_URL`.
- [ ] `https://tasks.twojadomena.pl` otwiera tablicę.
- [ ] Na telefonie aplikacja dodana do ekranu głównego.
- [ ] Mikrofon działa przez HTTPS.

## n8n Webhook

- [ ] Workflow `Eisenhower Intake` jest zaimportowany.
- [ ] Workflow jest aktywny.
- [ ] Używam Production URL, nie Test URL.
- [ ] OpenAI credentials są podpięte.
- [ ] Google Calendar credentials są podpięte.
- [ ] Test tekstowy tworzy zadanie.
- [ ] Test z datą tworzy event w Google Calendar.

## n8n MCP

- [ ] Osobny workflow MCP istnieje.
- [ ] MCP Server Trigger jest aktywny.
- [ ] Mam Production MCP URL.
- [ ] Mam bearer token, jeśli włączona autoryzacja.
- [ ] Claude widzi narzędzia MCP.
- [ ] Codex ma wpis w `~/.codex/config.toml`, jeśli chcesz używać tego też tutaj.

## Test końcowy

Powiedz do telefonu:

```text
Zrób teraz spotkanie z Pawłem jutro o 14 przypomnij godzinę wcześniej
```

Oczekiwane:

- [ ] karta pojawia się w `Zrób teraz`,
- [ ] event pojawia się w Google Calendar,
- [ ] przypomnienie jest zgodne z komendą.

## Smartwatch

- [ ] `https://tasks.twojadomena.pl/watch.html` otwiera mini ekran.
- [ ] Liczniki zadań pokazują dane.
- [ ] Skrót Apple Watch albo Tasker/AutoWear wysyła tekst do n8n.
- [ ] Komenda z zegarka tworzy zadanie.
- [ ] Komenda z datą/godziną tworzy wydarzenie Google Calendar.
