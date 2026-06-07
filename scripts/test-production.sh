#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-https://tasks.maciejmostowski.pl}"
N8N_URL="${N8N_URL:-https://n8n.maciejmostowski.pl/webhook/eisenhower-intake}"
APP_TOKEN="${APP_TOKEN:-}"

auth_header=()
if [[ -n "$APP_TOKEN" ]]; then
  auth_header=(-H "Authorization: Bearer $APP_TOKEN")
fi

echo "1. App health: $APP_URL/api/health"
curl -fsS "$APP_URL/api/health"
echo
echo

echo "2. Main app HTML"
curl -fsSI "$APP_URL/v2.html" | head -n 1
echo

echo "3. Watch HTML"
curl -fsSI "$APP_URL/watch.html" | head -n 1
echo

echo "4. Task API"
curl -fsS "${auth_header[@]}" "$APP_URL/api/tasks" >/dev/null
echo "Task API OK"
echo

echo "5. n8n text parser"
curl -fsS -X POST "$N8N_URL" \
  -H "Content-Type: application/json" \
  -d '{"text":"Zaplanuj test techniczny jutro o 14 przypomnij 3 godziny wcześniej","timezone":"Europe/Warsaw"}'
echo
echo

echo "6. App -> n8n intake"
curl -fsS -X POST "$APP_URL/api/intake/text" \
  "${auth_header[@]}" \
  -H "Content-Type: application/json" \
  -d '{"text":"Do First test produkcyjny z MacBooka","timezone":"Europe/Warsaw","forcedZone":"do"}'
echo
echo

echo "OK. Production smoke test finished."
