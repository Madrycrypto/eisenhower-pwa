# n8n szybki start dla `n8n.maciejmostowski.pl`

## 1. Import workflow

W n8n wejdź w:

```text
Workflows -> Import from file
```

Wgraj plik:

```text
n8n/eisenhower-intake-workflow.maciejmostowski.json
```

## 2. Podepnij credentials

W workflow ustaw:

```text
OpenAI - Transcribe Audio -> OpenAI account
OpenAI - Parse Command -> OpenAI account
Google Calendar - Create Event -> Google Calendar account
```

## 3. Aktywuj workflow

Włącz przełącznik:

```text
Active
```

Production webhook powinien wyglądać tak:

```text
https://n8n.maciejmostowski.pl/webhook/eisenhower-intake
```

## 4. Ustaw aplikację PWA

W pliku `.env` aplikacji ustaw:

```bash
N8N_WEBHOOK_URL=https://n8n.maciejmostowski.pl/webhook/eisenhower-intake
APP_TOKEN=
PORT=8080
```

Potem zrestartuj aplikację:

```bash
npm start
```

## 5. Test tekstowy

W terminalu możesz sprawdzić webhook:

```bash
curl -X POST https://n8n.maciejmostowski.pl/webhook/eisenhower-intake \
  -H "Content-Type: application/json" \
  -d '{"text":"Zaplanuj spotkanie z Kasią jutro o 14 przypomnij 3 godziny wcześniej","timezone":"Europe/Warsaw"}'
```

Oczekiwany zwrot:

```json
{
  "task": {
    "title": "Spotkanie z Kasią",
    "zone": "plan"
  },
  "event": {
    "create": true
  }
}
```

