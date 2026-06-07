# n8n MCP dla Claude/Codex krok po kroku

Ten plik jest dla sytuacji, gdy chcesz, żeby Claude albo Codex mogły wywoływać Twoje workflow n8n jako narzędzia MCP.

To jest osobny tor od aplikacji PWA.

```text
PWA/telefon -> Webhook n8n
Claude/Codex -> MCP Server Trigger n8n
```

## Cel

Docelowo agent ma mieć narzędzia:

```text
add_eisenhower_task
list_eisenhower_tasks
move_eisenhower_task
create_calendar_event
parse_voice_command
```

## Krok 1: Utwórz workflow MCP w n8n

W n8n utwórz nowy workflow:

```text
Eisenhower MCP Tools
```

Dodaj node:

```text
MCP Server Trigger
```

Ustaw tryb produkcyjny i włącz autoryzację bearer token, jeśli jest dostępna w Twojej wersji n8n.

Zapisz:

```text
Production MCP URL
Bearer token
```

## Krok 2: Dodaj narzędzie `add_eisenhower_task`

Opis narzędzia:

```text
Adds a task to the Eisenhower matrix. Use this when the user asks to create, capture, dictate, or schedule a task.
```

Input JSON:

```json
{
  "title": "Zadzwonić do Pawła",
  "zone": "do",
  "notes": "",
  "dueAt": "2026-06-07T14:00:00+02:00"
}
```

Dozwolone `zone`:

```text
do        -> Zrób teraz
plan      -> Zaplanuj
delegate  -> Deleguj
delete    -> Usuń
```

Najprościej w środku workflow użyj node **HTTP Request**:

```text
POST https://tasks.twojadomena.pl/api/tasks
Authorization: Bearer APP_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "title": "={{$json.title}}",
  "zone": "={{$json.zone}}",
  "notes": "={{$json.notes || ''}}",
  "dueAt": "={{$json.dueAt || ''}}"
}
```

## Krok 3: Dodaj narzędzie `list_eisenhower_tasks`

Opis:

```text
Lists current Eisenhower tasks from the PWA backend.
```

HTTP Request:

```text
GET https://tasks.twojadomena.pl/api/tasks
Authorization: Bearer APP_TOKEN
```

## Krok 4: Dodaj narzędzie `move_eisenhower_task`

Opis:

```text
Moves an existing task to another Eisenhower quadrant or updates its work status.
```

Input:

```json
{
  "id": "task_123",
  "zone": "plan",
  "status": "w trakcie"
}
```

HTTP Request:

```text
PATCH https://tasks.twojadomena.pl/api/tasks/{{$json.id}}
Authorization: Bearer APP_TOKEN
Content-Type: application/json
```

Body:

```json
{
  "zone": "={{$json.zone}}",
  "status": "={{$json.status || undefined}}"
}
```

## Krok 5: Dodaj narzędzie `create_calendar_event`

Opis:

```text
Creates a Google Calendar event with default reminders unless the user specified different reminders.
```

Input:

```json
{
  "summary": "Spotkanie z Pawłem",
  "start": "2026-06-07T14:00:00+02:00",
  "end": "2026-06-07T15:00:00+02:00",
  "location": "",
  "description": "",
  "remindersMinutesBefore": [180, 60]
}
```

Użyj node:

```text
Google Calendar -> Create Event
```

Domyślne przypomnienia:

```text
180 minut przed
60 minut przed
```

Wariant „codziennie o 7:00 przez 3 dni przed wydarzeniem” zrób jako dodatkowe 3 osobne eventy/remindery albo osobny workflow cronowy. Najczyściej: osobne reminder-eventy w kalendarzu.

## Krok 6: Dodaj narzędzie `parse_voice_command`

Opis:

```text
Parses a Polish spoken or typed command into an Eisenhower task and optional calendar event.
```

Input:

```json
{
  "text": "Zrób teraz spotkanie z Pawłem jutro o 14 przypomnij godzinę wcześniej",
  "timezone": "Europe/Warsaw",
  "now": "2026-06-06T10:00:00+02:00"
}
```

Użyj node OpenAI z promptem:

```text
Jesteś parserem polskich komend do macierzy Eisenhowera.
Zwróć tylko JSON.
Mapuj:
- "zrób teraz" -> zone "do"
- "zaplanuj" -> zone "plan"
- "deleguj" -> zone "delegate"
- "usuń" -> zone "delete"

Jeśli wykryjesz datę lub godzinę, ustaw event.create=true.
Jeśli użytkownik nie poda przypomnienia, użyj [180, 60] minut przed.
Jeśli użytkownik poda inne przypomnienie, respektuj je.
```

Oczekiwany JSON:

```json
{
  "task": {
    "title": "Spotkanie z Pawłem",
    "zone": "do",
    "notes": "",
    "dueAt": "2026-06-07T14:00:00+02:00"
  },
  "event": {
    "create": true,
    "summary": "Spotkanie z Pawłem",
    "start": "2026-06-07T14:00:00+02:00",
    "end": "2026-06-07T15:00:00+02:00",
    "location": "",
    "description": "",
    "remindersMinutesBefore": [60]
  }
}
```

## Krok 7: Podłączenie w Claude

W Claude dodaj n8n MCP tak jak dotychczas:

```text
URL: Production MCP URL z n8n
Authorization: Bearer TWOJ_TOKEN
```

Po podłączeniu Claude powinien widzieć narzędzia z workflow.

## Krok 8: Podłączenie w Codex

W `~/.codex/config.toml` dodaj:

```toml
[mcp_servers.n8n_eisenhower]
url = "https://n8n.twojadomena.pl/mcp/TWOJ_PRODUCTION_MCP_PATH"
bearer_token_env_var = "N8N_MCP_TOKEN"
tool_timeout_sec = 60
enabled = true
```

W terminalu przed uruchomieniem Codexa:

```bash
export N8N_MCP_TOKEN="twoj-token-z-n8n"
codex
```

W Codex TUI możesz sprawdzić:

```text
/mcp
```

## Krok 9: Test MCP

Poproś Claude albo Codex:

```text
Dodaj do macierzy: "Zrób teraz oddzwonić do Pawła jutro o 14".
```

Oczekiwany efekt:

1. Agent wywoła `parse_voice_command` albo `add_eisenhower_task`.
2. Zadanie pojawi się w PWA.
3. Jeśli jest data/godzina, agent lub workflow utworzy event w Google Calendar.

## Bezpieczne minimum narzędzi

Na start wystaw tylko:

```text
add_eisenhower_task
list_eisenhower_tasks
create_calendar_event
```

Dopiero potem dodaj:

```text
move_eisenhower_task
parse_voice_command
delete_task
gmail
notion
```

Mniej narzędzi na początku oznacza mniej chaosu i mniej przypadkowych zmian.
