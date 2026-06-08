import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

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

const tasksKey = "eisenhower-static-tasks";
const configKey = "eisenhower-static-config";
const defaultConfig = {
  n8nWebhookUrl: "https://n8n.maciejmostowski.pl/webhook/eisenhower-intake",
  supabaseUrl: "https://sjepixyhdbvdxkggwppr.supabase.co",
  supabaseAnonKey: "sb_publishable_HLnCI6TdBL3H9Q4r6orpGQ_dUNS4VcG"
};
let tasks = [];
let supabase = null;
let currentUser = null;
let isSyncing = false;
let forcedRecordZone = "";
let speechRecognition = null;
let mediaRecorder = null;
let audioChunks = [];
let recordingStream = null;
let isRecording = false;
let liveTranscript = "";
let finalTranscript = "";

function loadConfig() {
  try {
    return normalizeConfig(JSON.parse(localStorage.getItem(configKey) || "{}"));
  } catch {
    return { ...defaultConfig };
  }
}

function normalizeConfig(saved = {}) {
  return {
    ...defaultConfig,
    ...saved,
    n8nWebhookUrl: saved.n8nWebhookUrl?.trim() || defaultConfig.n8nWebhookUrl,
    supabaseUrl: saved.supabaseUrl?.trim() || defaultConfig.supabaseUrl,
    supabaseAnonKey: saved.supabaseAnonKey?.trim() || defaultConfig.supabaseAnonKey
  };
}

function saveConfig(config) {
  localStorage.setItem(configKey, JSON.stringify(normalizeConfig(config)));
}

async function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(tasksKey) || "[]");
    tasks = Array.isArray(saved) ? saved : [];
  } catch {
    tasks = [];
  }

  if (tasks.length === 0) {
    tasks = [
      createTask("Zrób teraz - przykład", "do"),
      createTask("Zaplanuj - przykład", "plan"),
      createTask("Deleguj - przykład", "delegate"),
      createTask("Usuń - przykład", "delete")
    ];
    saveTasks();
  }

  render();
  await initSupabase();
}

function saveTasks({ sync = true } = {}) {
  localStorage.setItem(tasksKey, JSON.stringify(tasks));
  if (sync) syncTasksToSupabase().catch((error) => setRecordStatus(`Sync Supabase: ${error.message}`));
}

function createTask(title, zone = "do", extras = {}) {
  const now = new Date().toISOString();
  return {
    id: extras.id || `task_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    title: title || "Nowe zadanie",
    zone: normalizeZone(zone),
    status: extras.status || "planowane",
    dueAt: extras.dueAt || "",
    notes: extras.notes || "",
    calendarEventId: extras.calendarEventId || "",
    postponedCount: Number(extras.postponedCount || 0),
    lastPostponedAt: extras.lastPostponedAt || "",
    completedAt: extras.completedAt || "",
    createdAt: extras.createdAt || now,
    updatedAt: now
  };
}

function normalizeZone(zone) {
  return ["do", "plan", "delegate", "delete"].includes(zone) ? zone : "do";
}

function getSupabaseConfig() {
  const config = loadConfig();
  if (!config.supabaseUrl || !config.supabaseAnonKey) return null;
  return config;
}

function getSupabase() {
  const config = getSupabaseConfig();
  if (!config) return null;
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
  return supabase;
}

async function initSupabase() {
  const client = getSupabase();
  updateAuthStatus();
  if (!client) return;

  const { data, error } = await client.auth.getSession();
  if (error) {
    setRecordStatus(`Supabase auth: ${error.message}`);
    return;
  }

  currentUser = data.session?.user || null;
  updateAuthStatus();

  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    updateAuthStatus();
    if (currentUser) await syncTasksFromSupabase();
  });

  if (currentUser) {
    await syncTasksFromSupabase();
  }
}

function updateAuthStatus() {
  const status = document.getElementById("authStatus");
  if (!status) return;
  const config = getSupabaseConfig();
  if (!config) {
    status.textContent = "Tryb lokalny. Wpisz Supabase URL i anon key, aby włączyć sync.";
  } else if (currentUser) {
    status.textContent = `Zalogowano: ${currentUser.email || currentUser.id}`;
  } else {
    status.textContent = "Supabase skonfigurowany. Zaloguj się linkiem email.";
  }
}

async function signInWithEmail() {
  const client = getSupabase();
  if (!client) {
    setRecordStatus("Najpierw wpisz Supabase URL i anon key.");
    return;
  }

  const email = document.getElementById("authEmailInput").value.trim();
  if (!email) {
    setRecordStatus("Wpisz email logowania.");
    return;
  }

  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: location.href.split("#")[0]
    }
  });

  if (error) throw error;
  setRecordStatus("Wysłano link logowania na email.");
}

async function signOut() {
  const client = getSupabase();
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) throw error;
  currentUser = null;
  updateAuthStatus();
  setRecordStatus("Wylogowano. Zostaje lokalny cache.");
}

function toDbTask(task) {
  return {
    client_id: task.id,
    user_id: currentUser.id,
    title: task.title,
    zone: normalizeZone(task.zone),
    status: task.status || "planowane",
    due_at: task.dueAt || null,
    notes: task.notes || "",
    calendar_event_id: task.calendarEventId || null,
    postponed_count: Number(task.postponedCount || 0),
    last_postponed_at: task.lastPostponedAt || null,
    completed_at: task.completedAt || null,
    source: task.source || "pwa-static",
    created_at: task.createdAt || new Date().toISOString(),
    updated_at: task.updatedAt || new Date().toISOString()
  };
}

function fromDbTask(row) {
  return {
    id: row.client_id || row.id,
    dbId: row.id,
    title: row.title,
    zone: normalizeZone(row.zone),
    status: row.status || "planowane",
    dueAt: row.due_at || "",
    notes: row.notes || "",
    calendarEventId: row.calendar_event_id || "",
    postponedCount: Number(row.postponed_count || 0),
    lastPostponedAt: row.last_postponed_at || "",
    completedAt: row.completed_at || "",
    source: row.source || "supabase",
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mergeTasks(localTasks, remoteTasks) {
  const merged = new Map();
  [...localTasks, ...remoteTasks].forEach((task) => {
    const existing = merged.get(task.id);
    if (!existing || new Date(task.updatedAt || task.createdAt) >= new Date(existing.updatedAt || existing.createdAt)) {
      merged.set(task.id, task);
    }
  });
  return Array.from(merged.values()).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
}

async function syncTasksFromSupabase() {
  const client = getSupabase();
  if (!client || !currentUser || isSyncing) return;
  isSyncing = true;
  try {
    const { data, error } = await client
      .from("tasks")
      .select("*")
      .order("updated_at", { ascending: false });
    if (error) throw error;
    tasks = mergeTasks(tasks, (data || []).map(fromDbTask));
    saveTasks({ sync: false });
    render();
    await syncTasksToSupabase();
    setRecordStatus("Synchronizacja Supabase gotowa.");
  } finally {
    isSyncing = false;
  }
}

async function syncTasksToSupabase() {
  const client = getSupabase();
  if (!client || !currentUser || isSyncing || tasks.length === 0) return;
  const payload = tasks.map(toDbTask);
  const { error } = await client
    .from("tasks")
    .upsert(payload, { onConflict: "user_id,client_id" });
  if (error) throw error;
}

async function deleteTaskFromSupabase(task) {
  const client = getSupabase();
  if (!client || !currentUser) return;
  await client.from("tasks").delete().eq("client_id", task.id);
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
    button.addEventListener("click", () => updateTask(task.id, { zone }));
    moveButtons.appendChild(button);
  });

  const done = document.createElement("button");
  done.type = "button";
  done.textContent = task.status === "zrobione" ? "Cofnij" : "Zrobione";
  done.addEventListener("click", () => {
    const isDone = task.status === "zrobione";
    updateTask(task.id, {
      status: isDone ? "planowane" : "zrobione",
      completedAt: isDone ? "" : new Date().toISOString()
    });
  });

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "Usuń";
  remove.addEventListener("click", async () => {
    await deleteTaskFromSupabase(task).catch((error) => setRecordStatus(`Supabase delete: ${error.message}`));
    tasks = tasks.filter((item) => item.id !== task.id);
    saveTasks();
    render();
  });

  actions.append(moveButtons, done);

  if (task.zone !== "plan") {
    const postpone = document.createElement("button");
    postpone.type = "button";
    postpone.textContent = "Odrocz";
    postpone.addEventListener("click", () => {
      updateTask(task.id, {
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

function updateTask(id, changes) {
  tasks = tasks.map((task) => (
    task.id === id ? { ...task, ...changes, zone: changes.zone ? normalizeZone(changes.zone) : task.zone, updatedAt: new Date().toISOString() } : task
  ));
  saveTasks();
  render();
}

function formatDue(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
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
  if (total === 0) signals.push("Dodaj kilka zadań, a panel zacznie pokazywać wzorce pracy.");
  if (planned >= 4 || planned > urgent + 2) signals.push("Dużo zadań siedzi w „Zaplanuj”. To może oznaczać realne planowanie albo odkładanie decyzji bez terminu.");
  if (postponed >= 3) signals.push("Widać powtarzające się odraczanie. Pomaga zmniejszyć zadanie do pierwszego ruchu na 5 minut.");
  if (noDue >= 5 || (active.length > 0 && noDue / active.length > 0.65)) signals.push("Wiele aktywnych zadań nie ma terminu. Brak daty często rozmywa priorytet.");
  if (stale >= 3) signals.push("Kilka zadań nie zmieniało się od 3+ dni. To dobry moment na decyzję: zrobić, zaplanować konkretnie albo usunąć.");
  if (done === 0 && total >= 4) signals.push("Masz zadania, ale brak zamkniętych pozycji. Warto dziś domknąć jedną małą rzecz.");
  if (signals.length === 0) signals.push("Wzorzec wygląda zdrowo: zadania są rozłożone bez mocnego sygnału odkładania.");

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

document.querySelectorAll(".quadrant").forEach((quad) => {
  quad.addEventListener("dragover", (event) => {
    event.preventDefault();
    quad.classList.add("drag-over");
  });
  quad.addEventListener("dragleave", () => quad.classList.remove("drag-over"));
  quad.addEventListener("drop", () => {
    const dragging = document.querySelector(".card.dragging");
    if (!dragging) return;
    quad.classList.remove("drag-over");
    updateTask(dragging.dataset.id, { zone: quad.dataset.zone });
  });
});

document.getElementById("taskForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  const zone = document.getElementById("zoneInput").value;
  if (!title) return;

  if (looksLikeVoiceCommand(title)) {
    await intakeText(title, zone);
  } else {
    tasks.unshift(createTask(title, zone));
    saveTasks();
    render();
  }

  input.value = "";
});

function looksLikeVoiceCommand(text) {
  return /zrób teraz|zrob teraz|zaplanuj|deleguj|usuń|usun|jutro|dzisiaj|o \d{1,2}|spotkanie|wizyta|call/i.test(text);
}

async function intakeText(text, fallbackZone = "do") {
  const config = loadConfig();
  const forcedZone = forcedRecordZone || fallbackZone;
  setRecordStatus("Analizuję tekst...");

  let parsed = null;
  if (config.n8nWebhookUrl) {
    parsed = await sendToN8n(config.n8nWebhookUrl, text, forcedZone);
  }

  const taskData = parsed?.task || parseLocalCommand(text, forcedZone);
  if (forcedRecordZone) taskData.zone = forcedRecordZone;
  tasks.unshift(createTask(taskData.title, taskData.zone, {
    dueAt: taskData.dueAt || "",
    notes: taskData.notes || "",
    calendarEventId: taskData.calendarEventId || ""
  }));
  saveTasks();
  render();
  setRecordStatus(parsed ? "Dodane przez n8n." : "Dodane lokalnie. n8n możesz ustawić w ustawieniach.");
}

async function sendToN8n(url, text, forcedZone) {
  const payload = {
    text,
    forcedZone,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    now: new Date().toISOString()
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    if (!response.ok) throw new Error("n8n response failed");
    return await response.json();
  } catch {
    try {
      await fetch(url, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify(payload)
      });
      setRecordStatus("Wysłane do n8n bez odczytu odpowiedzi. Zadanie dodaję lokalnie.");
    } catch {
      setRecordStatus("n8n niedostępny. Zadanie dodaję lokalnie.");
    }
    return null;
  }
}

async function sendAudioToN8n(url, blob, forcedZone) {
  const formData = new FormData();
  formData.append("data", blob, "recording.webm");
  formData.append("file", blob, "recording.webm");
  formData.append("forcedZone", forcedZone || "");
  formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  formData.append("now", new Date().toISOString());
  formData.append("source", "static-pwa-audio");

  const response = await fetch(url, {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "n8n nie przyjął nagrania.");
  }

  return response.json();
}

function addTaskFromParsed(parsed, fallbackText, forcedZone) {
  const taskData = parsed?.task || parseLocalCommand(fallbackText || "Nagranie audio", forcedZone);
  if (forcedZone) taskData.zone = forcedZone;
  tasks.unshift(createTask(taskData.title, taskData.zone, {
    dueAt: taskData.dueAt || "",
    notes: taskData.notes || parsed?.transcript || "",
    calendarEventId: taskData.calendarEventId || ""
  }));
  saveTasks();
  render();
}

function parseLocalCommand(text, forcedZone) {
  const clean = text
    .replace(/^(zrób teraz|zrob teraz|zaplanuj|deleguj|usuń|usun|do first|delay|delegate|don't do|dont do)\s*[-:]?\s*/i, "")
    .trim();
  return {
    title: clean || text,
    zone: forcedZone || inferZone(text),
    notes: "Dodane w wersji statycznej.",
    dueAt: ""
  };
}

function inferZone(text) {
  if (/zaplanuj|delay|jutro|dzisiaj|spotkanie|wizyta|termin|o \d{1,2}/i.test(text)) return "plan";
  if (/deleguj|delegate|przekaż|przekaz/i.test(text)) return "delegate";
  if (/usuń|usun|don't do|dont do|kasuj|wyrzuć|wyrzuc/i.test(text)) return "delete";
  return "do";
}

async function toggleRecording() {
  const button = document.getElementById("recordButton");
  if (isRecording) {
    stopSpeechPreview();
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
    isRecording = false;
    button.classList.remove("recording");
    button.textContent = "Nagraj";
    setRecordStatus("Wysyłam nagranie do n8n...");
    return;
  }

  const config = loadConfig();
  if (!config.n8nWebhookUrl) {
    setRecordStatus("Najpierw wpisz webhook n8n w ustawieniach MM.");
    return;
  }

  if (!canRecordAudio()) {
    setRecordStatus("Mikrofon wymaga HTTPS i przeglądarki z MediaRecorder.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setRecordStatus(`Nie mam dostępu do mikrofonu: ${error.message || error.name}`);
    return;
  }

  liveTranscript = "";
  finalTranscript = "";
  audioChunks = [];
  isRecording = true;
  button.classList.add("recording");
  button.textContent = "Stop";
  startSpeechPreviewIfAvailable();
  mediaRecorder = new MediaRecorder(recordingStream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;
    try {
      const forcedZone = forcedRecordZone || document.getElementById("zoneInput").value;
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const parsed = await sendAudioToN8n(config.n8nWebhookUrl, blob, forcedZone);
      const transcript = parsed?.transcript || liveTranscript || "";
      if (transcript) document.getElementById("taskInput").value = transcript;
      addTaskFromParsed(parsed, transcript, forcedZone);
      setRecordStatus(transcript ? `Dodane z nagrania: ${transcript}` : "Dodane z nagrania.");
    } catch (error) {
      const text = liveTranscript.trim();
      if (text) {
        document.getElementById("taskInput").value = text;
        setRecordStatus(`Audio nie przeszło do n8n: ${error.message}. Tekst zostawiłem w polu, ale nie dodałem zadania.`);
      } else {
        setRecordStatus(`Nie udało się wysłać audio: ${error.message}`);
      }
    }
  });
  mediaRecorder.start();
  setRecordStatus(forcedRecordZone ? `Nagrywam do: ${zoneNames[forcedRecordZone]}. Mów teraz...` : "Nagrywam. Mów teraz...");
}

function canRecordAudio() {
  return Boolean(
    window.isSecureContext
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
    && typeof window.MediaRecorder === "function"
  );
}

function startSpeechPreviewIfAvailable() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "pl-PL";
  speechRecognition.interimResults = true;
  speechRecognition.continuous = true;
  speechRecognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0].transcript.trim();
      if (event.results[index].isFinal) finalTranscript = `${finalTranscript} ${transcript}`.trim();
      else interim = transcript;
    }
    liveTranscript = `${finalTranscript} ${interim}`.trim();
    if (liveTranscript) {
      document.getElementById("taskInput").value = liveTranscript;
      setRecordStatus(`Słyszę: ${liveTranscript}`);
    }
  };
  speechRecognition.onerror = () => {
    if (!liveTranscript) setRecordStatus("Nie udało się rozpoznać mowy. Sprawdź uprawnienia mikrofonu.");
  };
  speechRecognition.onend = () => {
    if (isRecording) {
      try {
        speechRecognition.start();
      } catch {
        // Browser may throttle restart; the current transcript is still kept.
      }
    }
  };
  speechRecognition.start();
}

function stopSpeechPreview() {
  if (!speechRecognition) return;
  try {
    speechRecognition.stop();
  } catch {
    // Already stopped.
  }
  speechRecognition = null;
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
  const config = loadConfig();
  setRecordStatus(config.n8nWebhookUrl ? "Google Calendar obsługuje n8n webhook przy dyktowaniu." : "Wpisz webhook n8n w ustawieniach.");
});

document.getElementById("settingsButton").addEventListener("click", () => {
  const config = loadConfig();
  document.getElementById("authEmailInput").value = currentUser?.email || config.authEmail || "";
  document.getElementById("n8nWebhookInput").value = config.n8nWebhookUrl || "";
  document.getElementById("supabaseUrlInput").value = config.supabaseUrl || "";
  document.getElementById("supabaseAnonInput").value = config.supabaseAnonKey || "";
  updateAuthStatus();
  document.getElementById("settingsDialog").showModal();
});

document.getElementById("loginButton").addEventListener("click", () => {
  signInWithEmail().catch((error) => setRecordStatus(`Login: ${error.message}`));
});

document.getElementById("logoutButton").addEventListener("click", () => {
  signOut().catch((error) => setRecordStatus(`Logout: ${error.message}`));
});

document.getElementById("saveSettings").addEventListener("click", () => {
  saveConfig({
    authEmail: document.getElementById("authEmailInput").value.trim(),
    n8nWebhookUrl: document.getElementById("n8nWebhookInput").value.trim(),
    supabaseUrl: document.getElementById("supabaseUrlInput").value.trim(),
    supabaseAnonKey: document.getElementById("supabaseAnonInput").value.trim()
  });
  supabase = null;
  currentUser = null;
  initSupabase().catch((error) => setRecordStatus(`Supabase: ${error.message}`));
  setRecordStatus("Ustawienia zapisane lokalnie.");
});

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

loadTasks().catch((error) => setRecordStatus(error.message));
