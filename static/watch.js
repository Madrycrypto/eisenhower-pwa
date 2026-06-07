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

let activeZone = "do";
let isRecordingHint = false;
let supabase = null;
let currentUser = null;
let isSyncing = false;

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

function createTask(title, zone) {
  const now = new Date().toISOString();
  return {
    id: `task_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`,
    title,
    zone,
    status: "planowane",
    dueAt: "",
    notes: "Dodane z widoku watch.",
    calendarEventId: "",
    postponedCount: 0,
    createdAt: now,
    updatedAt: now
  };
}

function refresh() {
  const tasks = getTasks();
  document.getElementById("countDo").textContent = tasks.filter((task) => task.zone === "do").length;
  document.getElementById("countPlan").textContent = tasks.filter((task) => task.zone === "plan").length;
  document.getElementById("countDelegate").textContent = tasks.filter((task) => task.zone === "delegate").length;
  document.getElementById("countDelete").textContent = tasks.filter((task) => task.zone === "delete").length;

  document.querySelectorAll("[data-zone]").forEach((button) => {
    button.classList.toggle("active", button.dataset.zone === activeZone);
  });

  const visible = tasks.filter((task) => task.zone === activeZone);
  document.getElementById("activeZoneLabel").textContent = zoneNames[activeZone];
  document.getElementById("visibleCount").textContent = `${visible.length} zadań`;
  renderTasks(visible);
  setStatus("Dotknij kafla, żeby zobaczyć zadania.");
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
    zone: task.zone,
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
    zone: row.zone,
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
    setStatus("Tryb lokalny. Ustaw Supabase w Ustawieniach.");
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
  else setStatus("Supabase gotowy. Zaloguj email w Ustawieniach.");
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
    setStatus(`Sync: ${currentUser.email || "OK"}`);
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

async function deleteTaskFromSupabase(task) {
  const client = getSupabase();
  if (!client || !currentUser) return;
  await client.from("tasks").delete().eq("client_id", task.id);
}

function renderTasks(visible) {
  const list = document.getElementById("taskList");
  list.innerHTML = "";

  if (visible.length === 0) {
    const empty = document.createElement("div");
    empty.className = "task";
    empty.innerHTML = "<strong>Brak zadań w tym kwadracie.</strong>";
    list.appendChild(empty);
    return;
  }

  visible.forEach((task) => {
    const item = document.createElement("article");
    item.className = "task";

    const title = document.createElement("strong");
    title.textContent = task.title;

    const actions = document.createElement("div");
    actions.className = "task-actions";

    const done = document.createElement("button");
    done.type = "button";
    done.textContent = task.status === "zrobione" ? "Cofnij" : "Zrobione";
    done.addEventListener("click", () => updateTask(task.id, {
      status: task.status === "zrobione" ? "planowane" : "zrobione",
      completedAt: task.status === "zrobione" ? "" : new Date().toISOString()
    }));

    const move = document.createElement("button");
    move.type = "button";
    move.textContent = nextZoneLabel(task.zone);
    move.addEventListener("click", () => updateTask(task.id, { zone: nextZone(task.zone) }));

    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Usuń";
    remove.addEventListener("click", async () => {
      await deleteTaskFromSupabase(task).catch((error) => setStatus(`Delete: ${error.message}`));
      saveTasks(getTasks().filter((itemTask) => itemTask.id !== task.id));
      refresh();
    });

    actions.append(done, move, remove);
    item.append(title, actions);
    list.appendChild(item);
  });
}

function nextZone(zone) {
  if (zone === "do") return "plan";
  if (zone === "plan") return "delegate";
  if (zone === "delegate") return "delete";
  return "do";
}

function nextZoneLabel(zone) {
  return `Do ${zoneNames[nextZone(zone)]}`;
}

function updateTask(id, changes) {
  const tasks = getTasks().map((task) => (
    task.id === id ? { ...task, ...changes, updatedAt: new Date().toISOString() } : task
  ));
  saveTasks(tasks);
  refresh();
}

function loadConfig() {
  try {
    return { ...defaultConfig, ...JSON.parse(localStorage.getItem(configKey) || "{}") };
  } catch {
    return { ...defaultConfig };
  }
}

function saveConfig(config) {
  localStorage.setItem(configKey, JSON.stringify(config));
}

document.querySelectorAll("[data-zone]").forEach((button) => {
  button.addEventListener("click", () => {
    activeZone = button.dataset.zone;
    document.getElementById("zoneInput").value = activeZone;
    refresh();
  });
});

document.getElementById("settingsButton").addEventListener("click", () => {
  const config = loadConfig();
  const url = prompt("Webhook n8n", config.n8nWebhookUrl || "https://n8n.maciejmostowski.pl/webhook/eisenhower-intake");
  if (url === null) return;
  const supabaseUrl = prompt("Supabase URL", config.supabaseUrl || "");
  if (supabaseUrl === null) return;
  const supabaseAnonKey = prompt("Supabase anon key", config.supabaseAnonKey || "");
  if (supabaseAnonKey === null) return;
  const email = prompt("Email logowania Supabase", config.authEmail || "");
  saveConfig({ ...config, n8nWebhookUrl: url.trim(), supabaseUrl: supabaseUrl.trim(), supabaseAnonKey: supabaseAnonKey.trim(), authEmail: (email || "").trim() });
  supabase = null;
  currentUser = null;
  if (email) {
    const client = getSupabase();
    client?.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: location.href.split("#")[0] } })
      .then(({ error }) => setStatus(error ? `Login: ${error.message}` : "Link logowania wysłany."))
      .catch((error) => setStatus(`Login: ${error.message}`));
  } else {
    initSupabase().catch((error) => setStatus(`Supabase: ${error.message}`));
  }
});

document.getElementById("recordButton").addEventListener("click", () => {
  const button = document.getElementById("recordButton");
  const input = document.getElementById("taskInput");
  isRecordingHint = !isRecordingHint;
  button.classList.toggle("recording", isRecordingHint);
  input.focus();
  setStatus(isRecordingHint ? "Dyktuj w polu tekstowym, potem kliknij Dodaj." : "Dyktowanie zatrzymane.");
});

document.getElementById("quickForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  const zone = document.getElementById("zoneInput").value;
  if (!title) return;
  isRecordingHint = false;
  document.getElementById("recordButton").classList.remove("recording");

  const tasks = getTasks();
  tasks.unshift(createTask(title, zone));
  saveTasks(tasks);
  input.value = "";
  activeZone = zone;
  refresh();

  const config = loadConfig();
  if (config.n8nWebhookUrl) {
    try {
      await fetch(config.n8nWebhookUrl, {
        method: "POST",
        mode: "no-cors",
        headers: { "content-type": "text/plain" },
        body: JSON.stringify({
          text: title,
          forcedZone: zone,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          now: new Date().toISOString(),
          source: "watch"
        })
      });
      setStatus("Dodane lokalnie i wysłane do n8n.");
    } catch {
      setStatus("Dodane lokalnie. n8n niedostępny.");
    }
  }
});

refresh();
initSupabase().catch((error) => setStatus(`Supabase: ${error.message}`));
