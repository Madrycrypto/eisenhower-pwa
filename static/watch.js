const tasksKey = "eisenhower-static-tasks";
const configKey = "eisenhower-static-config";

const zoneNames = {
  do: "Zrób teraz",
  plan: "Zaplanuj",
  delegate: "Deleguj",
  delete: "Usuń"
};

let activeZone = "do";

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
    remove.addEventListener("click", () => {
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
    return JSON.parse(localStorage.getItem(configKey) || "{}");
  } catch {
    return {};
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
