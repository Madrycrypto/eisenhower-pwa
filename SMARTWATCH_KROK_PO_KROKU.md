# Smartwatch krok po kroku

Masz dwa praktyczne warianty.

## Wariant 1: skrót z zegarka

To polecam na start. Zegarek nie musi odpalać pełnej strony. Klikasz skrót, dyktujesz, a skrót wysyła tekst do n8n.

```text
Smartwatch -> dyktowanie systemowe -> n8n webhook -> OpenAI parser -> zadanie + Google Calendar
```

## Wariant 2: mini-aplikacja na zegarku

Dodałem mini ekran:

```text
https://tasks.twojadomena.pl/watch.html
```

Pokazuje:

- przycisk `Nagraj`,
- licznik zadań w 4 kwadrantach,
- szybkie dodanie krótkiej notatki,
- token logowania.

Nagrywanie przez przeglądarkę na zegarku zależy od modelu i systemu. Dlatego skrót z Wariantu 1 jest pewniejszy.

## Apple Watch + iPhone Shortcuts

### 1. Przygotuj URL webhooka

Użyj production webhooka z n8n:

```text
https://n8n.twojadomena.pl/webhook/eisenhower-intake
```

Możesz też iść przez backend PWA:

```text
https://tasks.twojadomena.pl/api/intake/text
```

Wtedy dodaj header:

```text
Authorization: Bearer APP_TOKEN
```

Na start najprościej wysyłać bezpośrednio do n8n.

### 2. Utwórz skrót na iPhonie

Otwórz **Skróty** i dodaj nowy skrót:

```text
Nazwa: Dodaj do Macierzy
```

Dodaj akcje:

1. **Dyktuj tekst**
   - język: polski
   - zakończ po pauzie

2. **Pobierz zawartość URL**
   - URL: `https://n8n.twojadomena.pl/webhook/eisenhower-intake`
   - metoda: `POST`
   - request body: `JSON`

Body JSON:

```json
{
  "text": "Dyktowany tekst",
  "timezone": "Europe/Warsaw",
  "source": "apple_watch_shortcut"
}
```

W polu `text` wstaw wynik akcji **Dyktowany tekst**.

3. Opcjonalnie: **Pokaż powiadomienie**

```text
Dodane do macierzy
```

### 3. Włącz skrót na Apple Watch

W szczegółach skrótu włącz:

```text
Pokaż na Apple Watch
```

Na zegarku:

```text
Skróty -> Dodaj do Macierzy -> dyktujesz -> gotowe
```

## Wear OS / Android

### Opcja A: Tasker + AutoWear

Zainstaluj na telefonie:

- Tasker
- AutoWear

Utwórz Tasker Task:

```text
Nazwa: Dodaj do Macierzy
```

Kroki:

1. **Get Voice**
   - language: `pl-PL`

2. **HTTP Request**
   - method: `POST`
   - URL: `https://n8n.twojadomena.pl/webhook/eisenhower-intake`
   - content type: `application/json`
   - body:

```json
{
  "text": "%VOICE",
  "timezone": "Europe/Warsaw",
  "source": "wear_os_tasker"
}
```

3. **Flash / Notification**

```text
Dodane do macierzy
```

W AutoWear dodaj przycisk/komendę na zegarku, która odpala ten Tasker Task.

### Opcja B: Wear OS Browser

Jeśli zegarek ma przeglądarkę:

```text
https://tasks.twojadomena.pl/watch.html
```

Ten ekran jest uproszczony pod mały wyświetlacz.

## Przykładowe komendy

```text
Zrób teraz zadzwoń do Pawła jutro o 14
Zaplanuj trening w piątek o 18
Deleguj przygotowanie raportu na jutro rano
Zaplanuj wizyta u dentysty 12 czerwca o 10 przypomnij 30 minut przed
```

## Przypomnienia i kalendarz

Reguły zostają takie same:

- jeśli komenda ma konkretną datę/godzinę, n8n tworzy event w Google Calendar,
- jeśli nie powiesz inaczej, domyślnie: 3 godziny przed i 1 godzinę przed,
- jeśli powiesz „przypomnij 30 minut przed”, parser ma użyć Twojej komendy.

## Co polecam

Najpierw uruchom:

```text
Apple Watch / Wear OS -> skrót -> n8n webhook
```

Dopiero potem testuj:

```text
/watch.html
```

Skrót systemowy jest szybszy, stabilniejszy i lepiej działa z mikrofonem zegarka.
