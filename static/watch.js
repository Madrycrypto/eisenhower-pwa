import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const tasksKey = "eisenhower-static-tasks";
const configKey = "eisenhower-static-config";
const defaultConfig = {
  n8nWebhookUrl: "https://n8n.maciejmostowski.pl/webhook/eisenhower-intake",
  supabaseUrl: "https://sjepixyhdbvdxkggwppr.supabase.co",
  supabaseAnonKey: "sb_publishable_HLnCI6TdBL3H9Q4r6orpGQ_dUNS4VcG"
};

const zoneNames = {
  do: "Zrób teraz",
  plan: "Zaplanuj",
  delegate: "Deleguj",
  delete: "Usuń"
};

let supabase = null;
let currentUser = null;
let isSyncing = false;
let mediaRecorder = null;
let recordingStream = null;
let audioChunks = [];
let isRecording = false;
let activeRecordButton = null;
let activeRecordZone = "";
let speechRecognition = null;
let liveTranscript = "";

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

function getTasks() {
  try {
    return JSON.parse(localStorage.getItem(tasksKey) || "[]");
  } catch {
    return [];
  }
}

function saveTasks(tasks, { sync = true } = {}) {
  localStorage.setItem(tasksKey, JSON.stringify(tasks));
  if (sync) syncTasksToSupabase().catch((error) => setStatus(`Sync: ${error.message}`));
}

function createTask(title, zone = "do", extras = {}) {
  const now = new Date().toISOString();
  return {
    id: `task_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    title,
    zone: normalizeZone(zone),
    status: "planowane",
    dueAt: extras.dueAt || "",
    notes: extras.notes || "Dodane z widoku watch.",
    calendarEventId: extras.calendarEventId || "",
    postponedCount: Number(extras.postponedCount || 0),
    createdAt: now,
    updatedAt: now
  };
}

function normalizeZone(zone) {
  return ["do", "plan", "delegate", "delete"].includes(zone) ? zone : "do";
}

function refresh() {
  const tasks = getTasks();
  document.getElementById("countDo").textContent = tasks.filter((task) => task.zone === "do").length;
  document.getElementById("countPlan").textContent = tasks.filter((task) => task.zone === "plan").length;
  document.getElementById("countDelegate").textContent = tasks.filter((task) => task.zone === "delegate").length;
  document.getElementById("countDelete").textContent = tasks.filter((task) => task.zone === "delete").length;
}

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
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });
  }
  return supabase;
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
    source: task.source || "watch",
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

async function initSupabase() {
  const client = getSupabase();
  if (!client) {
    setStatus("Tryb lokalny.");
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  currentUser = data.session?.user || null;
  client.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user || null;
    if (currentUser) await syncTasksFromSupabase();
  });
  if (currentUser) await syncTasksFromSupabase();
  else setStatus("Gotowe.");
}

async function syncTasksFromSupabase() {
  const client = getSupabase();
  if (!client || !currentUser || isSyncing) return;
  isSyncing = true;
  try {
    const { data, error } = await client.from("tasks").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    const merged = mergeTasks(getTasks(), (data || []).map(fromDbTask));
    saveTasks(merged, { sync: false });
    refresh();
    await syncTasksToSupabase();
    setStatus("Sync OK.");
  } finally {
    isSyncing = false;
  }
}

async function syncTasksToSupabase() {
  const client = getSupabase();
  if (!client || !currentUser || isSyncing) return;
  const tasks = getTasks();
  if (tasks.length === 0) return;
  const { error } = await client.from("tasks").upsert(tasks.map(toDbTask), { onConflict: "user_id,client_id" });
  if (error) throw error;
}

function addTaskFromParsed(parsed, fallbackText, forcedZone) {
  const taskData = parsed?.task || parseLocalCommand(fallbackText || "Nagranie audio", forcedZone);
  if (forcedZone) taskData.zone = forcedZone;
  const tasks = getTasks();
  tasks.unshift(createTask(taskData.title, taskData.zone, {
    dueAt: taskData.dueAt || "",
    notes: taskData.notes || parsed?.transcript || "",
    calendarEventId: taskData.calendarEventId || ""
  }));
  saveTasks(tasks);
  refresh();
}

function parseLocalCommand(text, forcedZone) {
  const clean = text
    .replace(/^(zrób teraz|zrob teraz|zaplanuj|deleguj|usuń|usun|do first|delay|delegate|don't do|dont do)\s*[-:]?\s*/i, "")
    .trim();
  return {
    title: clean || text,
    zone: forcedZone || inferZone(text),
    notes: "Dodane lokalnie z widoku watch.",
    dueAt: ""
  };
}

function inferZone(text) {
  if (/zrób teraz|zrob teraz|do first|dzisiaj|dziś|dzis|teraz|natychmiast|asap|pilne/i.test(text)) return "do";
  if (/zaplanuj|delay|jutro|pojutrze|za kilka dni|przyszły|przyszly|spotkanie|wizyta|termin|o \d{1,2}/i.test(text)) return "plan";
  if (/deleguj|delegate|przekaż|przekaz/i.test(text)) return "delegate";
  if (/usuń|usun|don't do|dont do|kasuj|wyrzuć|wyrzuc/i.test(text)) return "delete";
  return "do";
}

async function sendAudioToN8n(url, blob, forcedZone) {
  const formData = new FormData();
  const filename = getAudioFilename(blob.type);
  formData.append("data", blob, filename);
  formData.append("file", blob, filename);
  formData.append("forcedZone", forcedZone || "");
  formData.append("timezone", Intl.DateTimeFormat().resolvedOptions().timeZone);
  formData.append("now", new Date().toISOString());
  formData.append("source", "watch-audio");

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

function getPreferredAudioMimeType() {
  if (!window.MediaRecorder || typeof window.MediaRecorder.isTypeSupported !== "function") return "";
  return [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/mp4",
    "audio/mpeg"
  ].find((type) => window.MediaRecorder.isTypeSupported(type)) || "";
}

function getAudioFilename(mimeType = "") {
  const type = mimeType.toLowerCase();
  if (type.includes("webm")) return "recording.webm";
  if (type.includes("mp4") || type.includes("m4a")) return "recording.m4a";
  if (type.includes("mpeg") || type.includes("mp3")) return "recording.mp3";
  if (type.includes("wav")) return "recording.wav";
  return "recording.webm";
}

function canRecordAudio() {
  return Boolean(
    window.isSecureContext
    && navigator.mediaDevices
    && typeof navigator.mediaDevices.getUserMedia === "function"
    && typeof window.MediaRecorder === "function"
  );
}

async function toggleRecording(forcedZone, button) {
  if (isRecording) {
    stopSpeechPreview();
    if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
    return;
  }

  const config = loadConfig();
  if (!config.n8nWebhookUrl) {
    setStatus("Brak webhooka n8n.");
    return;
  }

  if (!canRecordAudio()) {
    setStatus("Mikrofon wymaga HTTPS.");
    return;
  }

  try {
    recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (error) {
    setStatus(`Brak mikrofonu: ${error.message || error.name}`);
    return;
  }

  audioChunks = [];
  liveTranscript = "";
  isRecording = true;
  activeRecordButton = button;
  activeRecordZone = forcedZone || "";
  button.classList.add("recording");
  if (button.id === "recordButton") button.textContent = "Stop";
  startSpeechPreviewIfAvailable();

  const preferredMimeType = getPreferredAudioMimeType();
  mediaRecorder = preferredMimeType
    ? new MediaRecorder(recordingStream, { mimeType: preferredMimeType })
    : new MediaRecorder(recordingStream);

  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) audioChunks.push(event.data);
  });

  mediaRecorder.addEventListener("stop", async () => {
    const stoppedButton = activeRecordButton;
    const stoppedZone = activeRecordZone;
    isRecording = false;
    stoppedButton?.classList.remove("recording");
    if (stoppedButton?.id === "recordButton") stoppedButton.textContent = "Nagraj";
    activeRecordButton = null;
    activeRecordZone = "";
    recordingStream?.getTracks().forEach((track) => track.stop());
    recordingStream = null;
    setStatus("Wysyłam...");

    try {
      const blob = new Blob(audioChunks, { type: mediaRecorder.mimeType || preferredMimeType || "audio/webm" });
      const parsed = await sendAudioToN8n(config.n8nWebhookUrl, blob, stoppedZone);
      const transcript = parsed?.transcript || liveTranscript || "";
      addTaskFromParsed(parsed, transcript, stoppedZone);
      setStatus(stoppedZone ? `Dodane do: ${zoneNames[stoppedZone]}.` : "Dodane.");
    } catch (error) {
      const text = liveTranscript.trim();
      if (text) {
        addTaskFromParsed(null, text, stoppedZone);
        setStatus("Audio nie przeszło. Dodałem tekst.");
      } else {
        setStatus(`Błąd: ${error.message}`);
      }
    }
  });

  mediaRecorder.start();
  setStatus(forcedZone ? `Nagrywam: ${zoneNames[forcedZone]}.` : "Nagrywam.");
}

function startSpeechPreviewIfAvailable() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  speechRecognition = new SpeechRecognition();
  speechRecognition.lang = "pl-PL";
  speechRecognition.interimResults = true;
  speechRecognition.continuous = true;
  speechRecognition.addEventListener("result", (event) => {
    liveTranscript = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join(" ")
      .trim();
  });
  speechRecognition.start();
}

function stopSpeechPreview() {
  if (!speechRecognition) return;
  speechRecognition.stop();
  speechRecognition = null;
}

document.querySelectorAll("[data-record-zone]").forEach((button) => {
  button.addEventListener("click", () => {
    if (isRecording && activeRecordButton !== button) {
      setStatus("Najpierw zatrzymaj obecne nagranie.");
      return;
    }
    toggleRecording(button.dataset.recordZone || "", button).catch((error) => setStatus(`Record: ${error.message}`));
  });
});

refresh();
initSupabase().catch((error) => setStatus(`Supabase: ${error.message}`));
