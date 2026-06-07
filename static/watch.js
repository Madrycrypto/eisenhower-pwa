const tasksKey = "eisenhower-static-tasks";
const configKey = "eisenhower-static-config";

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

function saveTasks(tasks) {
  localStorage.setItem(tasksKey, JSON.stringify(tasks));
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

function refreshCounts() {
  const tasks = getTasks();
  document.getElementById("countDo").textContent = tasks.filter((task) => task.zone === "do").length;
  document.getElementById("countPlan").textContent = tasks.filter((task) => task.zone === "plan").length;
  document.getElementById("countDelegate").textContent = tasks.filter((task) => task.zone === "delegate").length;
  document.getElementById("countDelete").textContent = tasks.filter((task) => task.zone === "delete").length;
  setStatus("Gotowe.");
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(configKey) || "{}");
  } catch {
    return {};
  }
}

function saveConfig(config) {
  localStorage.setItem(configKey, JSON.stringify(config));
}

document.getElementById("settingsButton").addEventListener("click", () => {
  const config = loadConfig();
  const url = prompt("Webhook n8n", config.n8nWebhookUrl || "https://n8n.maciejmostowski.pl/webhook/eisenhower-intake");
  if (url !== null) {
    saveConfig({ ...config, n8nWebhookUrl: url.trim() });
    setStatus("Ustawienia zapisane.");
  }
});

document.getElementById("quickForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  const zone = document.getElementById("zoneInput").value;
  if (!title) return;

  const tasks = getTasks();
  tasks.unshift(createTask(title, zone));
  saveTasks(tasks);
  input.value = "";
  refreshCounts();

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

document.getElementById("recordButton").addEventListener("click", () => {
  setStatus("Na watch użyj dyktowania systemowego w polu tekstowym albo Skrótów Apple/Android.");
  document.getElementById("taskInput").focus();
});

refreshCounts();
