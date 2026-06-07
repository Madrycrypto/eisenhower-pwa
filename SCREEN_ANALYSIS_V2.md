# Screen analysis - co przeniosłem do naszego pomysłu

Screenshot pokazuje aplikację produktywności w lekkim, mobilnym stylu. Najważniejsze elementy, które warto przenieść:

## 1. Pastelowa paleta

Kolory ze screena:

- kremowe tło,
- coral/orange dla najpilniejszych akcji,
- teal dla planowania,
- lime/green dla delegowania/habitów,
- soft yellow dla rzeczy mniej ważnych.

Wdrożone w:

```text
public/v2.css
```

## 2. Mobile-first app shell

Na screenie każdy ekran wygląda jak natywna aplikacja telefonu, nie jak desktopowy dashboard.

Wdrożone:

```text
public/v2.html
```

## 3. Duże karty Eisenhowera

Na screenie widać układ:

```text
Do First
Delay
Delegate
Don't Do
```

U nas to mapuje się na:

```text
Do First   -> Zrób teraz
Delay      -> Zaplanuj
Delegate   -> Deleguj
Don't Do   -> Usuń
```

## 4. Calendar strip

W screenie jest poziomy pasek dni/miesiąca. Dodałem go jako element UI w `v2.html`.

Docelowo można go podłączyć do Google Calendar i filtrować zadania po dniu.

## 5. Focus timer / pomodoro

Na screenie widać okrągły timer. Dodałem wizualny `25 min` focus timer.

Docelowo można zrobić:

- start/pauza,
- sesje focus,
- automatyczne wpisy do time trackera,
- powiązanie z zadaniem.

## 6. Time tracker i habit tracker

Na screenie pojawiają się osobne zakładki:

- Time Tracker,
- Habit Tracker,
- Calendar.

Dodałem dolny panel trackerów jako zaczątek.

## 7. Pionowe zakładki

Screen ma pionowe podpisy/sekcje przy krawędzi. W `v2.html` dodałem boczny rail:

- Macierz,
- Watch,
- Classic.

## Co warto zaimplementować dalej

1. Prawdziwy focus timer start/pauza.
2. Widok `Calendar` z Google Calendar.
3. Widok `Time Tracker` z historią sesji.
4. Widok `Habit Tracker`.
5. Onboarding/login w tym pastelowym stylu.
6. Przełącznik motywów: Classic / Pastel.
7. Mini ilustracje przy pustych stanach.
