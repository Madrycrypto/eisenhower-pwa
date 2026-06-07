const labels = {
  do: ["Ważne", "Pilne"],
  plan: ["Ważne", "Mało pilne"],
  delegate: ["Mało ważne", "Pilne"],
  delete: ["Mało ważne", "Mało pilne"]
};

const zoneNames = {
  do: "Zrób teraz",
  plan: "Zaplanuj",
  delegate: "Deleguj",
  delete: "Usuń"
};

const zoneShortNames = {
  do: "First",
  plan: "Delay",
  delegate: "Deleguj",
  delete: "Usuń"
};

const tokenKey = "eisenhower-app-token";
let tasks = [];
let mediaRecorder = null;
let chunks = [];
let forcedRecordZone = "";
let speechRecognition = null;
let liveTranscript = "";
let lastFinalTranscript = "";

function authHeaders(extra = {}) {
  const token = localStorage.getItem(tokenKey);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  if (response.status === 401) {
    document.getElementById("settingsDialog").showModal();
    throw new Error("Podaj token aplikacji.");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Błąd API");
  }
  return response.json();
}

async function loadTasks() {
  const payload = await api("/api/tasks");
  tasks = payload.tasks || [];
  render();
}

function render() {
  renderDateStrip();

  document.querySelectorAll("[data-list]").forEach((list) => {
    list.innerHTML = "";
  });

  tasks.forEach((task) => {
    const list = document.querySelector(`[data-list="${task.zone}"]`);
    if (list) list.appendChild(createCard(task));
  });

  document.querySelectorAll(".quadrant").forEach((quad) => {
    const count = tasks.filter((task) => task.zone === quad.dataset.zone).length;
    quad.querySelector(".count").textContent = count;
  });

  renderInsights();
}

function createCard(task) {
  const card = document.createElement("article");
  card.className = "card";
  card.draggable = true;
  card.dataset.id = task.id;

  const title = document.createElement("div");
  title.className = "card-title";
  title.textContent = task.title;

  const meta = document.createElement("div");
  meta.className = "card-meta";
  labels[task.zone].forEach((label) => meta.appendChild(tag(label)));
  if (task.status) meta.appendChild(tag(task.status));
  if (task.dueAt) meta.appendChild(tag(formatDue(task.dueAt)));

  const actions = document.createElement("div");
  actions.className = "card-actions";

  const moveButtons = document.createElement("div");
  moveButtons.className = "move-buttons";
  Object.entries(zoneShortNames).forEach(([zone, name]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = name;
    button.disabled = task.zone === zone;
    button.className = task.zone === zone ? "active" : "";
    button.addEventListener("click", async () => {
      if (task.zone !== zone) await updateTask(task.id, { zone });
    });
    moveButtons.appendChild(button);
  });

  const move = document.createElement("select");
  move.className = "move-select";
  move.setAttribute("aria-label", "Przenieś do kwadrantu");
  Object.entries(zoneNames).forEach(([zone, name]) => {
    const option = document.createElement("option");
    option.value = zone;
    option.textContent = name;
    option.selected = task.zone === zone;
    move.appendChild(option);
  });
  move.addEventListener("change", async () => {
    await updateTask(task.id, { zone: move.value });
  });

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = task.status === "zrobione" ? "Cofnij" : "Zrobione";
  done.addEventListener("click", async () => {
    const isDone = task.status === "zrobione";
    await updateTask(task.id, {
      status: isDone ? "planowane" : "zrobione",
      completedAt: isDone ? "" : new Date().toISOString()
    });
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Usuń";
  remove.addEventListener("click", async () => {
    await api(`/api/tasks/${task.id}`, { method: "DELETE" });
    tasks = tasks.filter((item) => item.id !== task.id);
    render();
  });

  actions.append(moveButtons, move, done);

  if (task.zone !== "plan") {
    const postpone = document.createElement("button");
    postpone.type = "button";
    postpone.textContent = "Odrocz";
    postpone.addEventListener("click", async () => {
      await updateTask(task.id, {
        zone: "plan",
        postponedCount: Number(task.postponedCount || 0) + 1,
        lastPostponedAt: new Date().toISOString()
      });
    });
    actions.append(postpone);
  }

  actions.append(remove);
  card.append(title, meta, actions);

  card.addEventListener("dragstart", () => card.classList.add("dragging"));
  card.addEventListener("dragend", () => card.classList.remove("dragging"));

  return card;
}

function tag(text) {
  const element = document.createElement("span");
  element.className = "tag";
  element.textContent = text;
  return element;
}

function formatDue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
}

function renderInsights() {
  const doneEl = document.getElementById("statDone");
  const postponedEl = document.getElementById("statPostponed");
  const noDueEl = document.getElementById("statNoDue");
  const plannedEl = document.getElementById("statPlanned");
  const riskBadge = document.getElementById("riskBadge");
  const insightList = document.getElementById("insightList");
  if (!doneEl || !postponedEl || !noDueEl || !plannedEl || !riskBadge || !insightList) return;

  const total = tasks.length;
  const done = tasks.filter((task) => task.status === "zrobione").length;
  const active = tasks.filter((task) => task.status !== "zrobione");
  const planned = active.filter((task) => task.zone === "plan").length;
  const urgent = active.filter((task) => task.zone === "do").length;
  const noDue = active.filter((task) => !task.dueAt).length;
  const postponed = tasks.reduce((sum, task) => sum + Number(task.postponedCount || 0), 0);
  const stale = active.filter((task) => daysSince(task.updatedAt || task.createdAt) >= 3).length;

  doneEl.textContent = done;
  postponedEl.textContent = postponed;
  noDueEl.textContent = noDue;
  plannedEl.textContent = planned;

  const signals = [];
  if (total === 0) {
    signals.push("Dodaj kilka zadań, a panel zacznie pokazywać wzorce pracy.");
  }
  if (planned >= 4 || planned > urgent + 2) {
    signals.push("Dużo zadań siedzi w „Zaplanuj”. To może oznaczać realne planowanie albo odkładanie decyzji bez terminu.");
  }
  if (postponed >= 3) {
    signals.push("Widać powtarzające się odraczanie. Pomaga zmniejszyć zadanie do pierwszego ruchu na 5 minut.");
  }
  if (noDue >= 5 || (active.length > 0 && noDue / active.length > 0.65)) {
    signals.push("Wiele aktywnych zadań nie ma terminu. Brak daty często rozmywa priorytet i zwiększa odkładanie.");
  }
  if (stale >= 3) {
    signals.push("Kilka zadań nie zmieniało się od 3+ dni. To dobry moment na decyzję: zrobić, zaplanować konkretnie albo usunąć.");
  }
  if (done === 0 && total >= 4) {
    signals.push("Masz zadania, ale brak zamkniętych pozycji. Warto dziś domknąć jedną małą rzecz dla momentum.");
  }
  if (signals.length === 0) {
    signals.push("Wzorzec wygląda zdrowo: zadania są rozłożone, bez mocnego sygnału przeciążenia lub odkładania.");
  }

  const risk = calculateProcrastinationRisk({ planned, postponed, noDue, stale, active: active.length, done });
  riskBadge.className = risk.className;
  riskBadge.textContent = risk.label;

  insightList.innerHTML = "";
  signals.slice(0, 4).forEach((signal) => {
    const item = document.createElement("li");
    item.textContent = signal;
    insightList.appendChild(item);
  });
}

function renderDateStrip() {
  const strip = document.getElementById("dateStrip");
  const month = document.getElementById("calendarMonth");
  if (!strip) return;

  const today = startOfDay(new Date());
  const formatter = new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric" });
  const weekdayFormatter = new Intl.DateTimeFormat("pl-PL", { weekday: "short" });
  if (month) month.textContent = formatter.format(today);

  strip.innerHTML = "";
  for (let index = 0; index < 7; index += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const count = tasks.filter((task) => isSameDay(task.dueAt, date)).length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `date-pill${index === 0 ? " selected" : ""}`;
    button.title = count ? `${count} terminów` : "Brak terminów";
    button.innerHTML = `
      <span class="weekday">${weekdayFormatter.format(date)}</span>
      <span class="day">${date.getDate()}</span>
      <span class="events">${count ? `${count} termin` : " "}</span>
    `;
    strip.appendChild(button);
  }
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(value, date) {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getFullYear() === date.getFullYear()
    && parsed.getMonth() === date.getMonth()
    && parsed.getDate() === date.getDate();
}

function daysSince(value) {
  if (!value) return 0;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 0;
  return Math.floor((Date.now() - date.getTime()) / 86_400_000);
}

function calculateProcrastinationRisk(stats) {
  let score = 0;
  if (stats.postponed >= 3) score += 2;
  if (stats.planned >= 4) score += 1;
  if (stats.active > 0 && stats.noDue / stats.active > 0.65) score += 1;
  if (stats.stale >= 3) score += 2;
  if (stats.done === 0 && stats.active >= 4) score += 1;

  if (score >= 4) return { label: "Wysoki sygnał", className: "high" };
  if (score >= 2) return { label: "Do obserwacji", className: "medium" };
  return { label: "OK", className: "" };
}

async function updateTask(id, changes) {
  const payload = await api(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(changes)
  });
  tasks = tasks.map((task) => (task.id === id ? payload.task : task));
  render();
}

document.querySelectorAll(".quadrant").forEach((quad) => {
  quad.addEventListener("dragover", (event) => {
    event.preventDefault();
    quad.classList.add("drag-over");
  });
  quad.addEventListener("dragleave", () => quad.classList.remove("drag-over"));
  quad.addEventListener("drop", async () => {
    const dragging = document.querySelector(".card.dragging");
    if (!dragging) return;
    quad.classList.remove("drag-over");
    await updateTask(dragging.dataset.id, { zone: quad.dataset.zone });
  });
});

document.getElementById("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  const zone = document.getElementById("zoneInput").value;
  if (!title) return;

  if (looksLikeVoiceCommand(title)) {
    await intakeText(title);
  } else {
    const payload = await api("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, zone })
    });
    tasks.unshift(payload.task);
    render();
  }

  input.value = "";
});

function looksLikeVoiceCommand(text) {
  return /zrób teraz|zrob teraz|zaplanuj|deleguj|usuń|usun|jutro|dzisiaj|o \d{1,2}|spotkanie|wizyta|call/i.test(text);
}

async function intakeText(text) {
  if (location.protocol === "file:") {
    document.getElementById("taskInput").value = text;
    setRecordStatus("Widzę tekst, ale otwórz aplikację przez http://localhost:8080/v2.html, żeby zapisać zadanie.");
    return;
  }

  setRecordStatus("Analizuję tekst...");
  const payload = await api("/api/intake/text", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      now: new Date().toISOString(),
      forcedZone: forcedRecordZone || null
    })
  });
  if (payload.localTask) {
    tasks.unshift(payload.localTask);
    render();
  } else {
    await loadTasks();
  }
  setRecordStatus("Dodane.");
}

async function toggleRecording() {
  const button = document.getElementById("recordButton");
  if (mediaRecorder && mediaRecorder.state === "recording") {
    stopSpeechPreview();
    mediaRecorder.stop();
    button.classList.remove("recording");
    button.textContent = "Nagraj";
    setRecordStatus(liveTranscript ? `Tekst: ${liveTranscript}` : "Wysyłam nagranie do n8n...");
    return;
  }

  if (location.protocol === "file:") {
    setRecordStatus("Ta strona jest otwarta jako plik. Wejdź przez http://localhost:8080/v2.html, inaczej zapis i wysyłka nagrania nie zadziałają.");
    return;
  }

  if (!canRecordAudio()) {
    setRecordStatus("Mikrofon wymaga HTTPS. Lokalnie na telefonie użyj wdrożonej domeny z SSL albo skrótu n8n.");
    return;
  }

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setRecordStatus(`Nie mam dostępu do mikrofonu: ${friendlyMediaError(error)}`);
    return;
  }

  chunks = [];
  liveTranscript = "";
  lastFinalTranscript = "";
  startSpeechPreview();
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    try {
      const dictatedText = liveTranscript.trim();
      if (dictatedText) {
        document.getElementById("taskInput").value = dictatedText;
        await intakeText(dictatedText);
        return;
      }

      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const response = await fetch("/api/intake/audio", {
        method: "POST",
        headers: authHeaders({
          "content-type": blob.type,
          "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
          "x-now": new Date().toISOString(),
          "x-forced-zone": forcedRecordZone || ""
        }),
        body: blob
      });
      if (!response.ok) throw new Error("Nie udało się wysłać nagrania.");
      const payload = await response.json();
      if (payload.localTask) {
        tasks.unshift(payload.localTask);
        render();
      } else {
        await loadTasks();
      }
      setRecordStatus("Dodane z nagrania.");
    } catch (error) {
      setRecordStatus(error.message);
    }
  });
  mediaRecorder.start();
  button.classList.add("recording");
  button.textContent = "Stop";
  setRecordStatus(forcedRecordZone ? `Nagrywam do: ${zoneNames[forcedRecordZone]}. Mów teraz...` : "Nagrywam. Mów teraz...");
}

function startSpeechPreview() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    setRecordStatus("Nagrywam audio. Ta przeglądarka nie pokazuje tekstu na żywo.");
    return;
  }

  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "pl-PL";
  speechRecognition.interimResults = true;
  speechRecognition.continuous = true;
  speechRecognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) {
        lastFinalTranscript = `${lastFinalTranscript} ${transcript}`.trim();
      } else {
        interim = transcript;
      }
    }
    liveTranscript = `${lastFinalTranscript} ${interim}`.trim();
    if (liveTranscript) {
      document.getElementById("taskInput").value = liveTranscript;
      setRecordStatus(`Słyszę: ${liveTranscript}`);
    }
  };
  speechRecognition.onerror = () => {
    if (!liveTranscript) setRecordStatus("Nagrywam audio, ale przeglądarka nie podała tekstu na żywo.");
  };
  speechRecognition.start();
}

function stopSpeechPreview() {
  if (!speechRecognition) return;
  try {
    speechRecognition.stop();
  } catch {
    // Recognition may already be stopped by the browser.
  }
  speechRecognition = null;
}

function canRecordAudio() {
  return Boolean(
    window.isSecureContext
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
    && typeof window.MediaRecorder === "function"
  );
}

function friendlyMediaError(error) {
  if (!error?.name) return "sprawdź uprawnienia przeglądarki";
  if (error.name === "NotAllowedError") return "odmówiono uprawnień";
  if (error.name === "NotFoundError") return "nie wykryto mikrofonu";
  if (error.name === "NotReadableError") return "mikrofon jest zajęty";
  if (error.name === "SecurityError") return "strona musi działać przez HTTPS";
  return error.message || error.name;
}

function setRecordStatus(text) {
  document.getElementById("recordStatus").textContent = text;
}

document.getElementById("recordButton").addEventListener("click", () => {
  forcedRecordZone = "";
  toggleRecording().catch((error) => setRecordStatus(error.message));
});

document.querySelectorAll("[data-record-zone]").forEach((button) => {
  button.addEventListener("click", () => {
    forcedRecordZone = button.dataset.recordZone || "";
    toggleRecording().catch((error) => setRecordStatus(error.message));
  });
});

document.getElementById("syncCalendarButton")?.addEventListener("click", () => {
  setRecordStatus("Google Calendar sync będzie podpięty przez n8n po wdrożeniu OAuth.");
});

document.getElementById("settingsButton").addEventListener("click", () => {
  document.getElementById("tokenInput").value = localStorage.getItem(tokenKey) || "";
  document.getElementById("settingsDialog").showModal();
});

document.getElementById("saveSettings").addEventListener("click", () => {
  const token = document.getElementById("tokenInput").value.trim();
  if (token) localStorage.setItem(tokenKey, token);
  else localStorage.removeItem(tokenKey);
  loadTasks().catch((error) => setRecordStatus(error.message));
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

loadTasks().catch((error) => setRecordStatus(error.message));
