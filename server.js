const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const publicDir = path.join(root, "public");
const dataDir = path.join(root, "data");
const tasksFile = path.join(dataDir, "tasks.json");

const port = Number(process.env.PORT || 8080);
const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || "";
const authToken = process.env.APP_TOKEN || "";
const appVersion = process.env.GITHUB_SHA || process.env.APP_VERSION || "local";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(tasksFile)) {
    fs.writeFileSync(tasksFile, JSON.stringify({ tasks: seedTasks() }, null, 2));
  }
}

function seedTasks() {
  return [
    createTask("Zrób teraz - przykład", "do"),
    createTask("Zaplanuj - przykład", "plan"),
    createTask("Deleguj - przykład", "delegate"),
    createTask("Usuń - przykład", "delete")
  ];
}

function createTask(title, zone = "do", extras = {}) {
  return {
    id: cryptoRandomId(),
    title,
    zone,
    status: extras.status || "planowane",
    dueAt: extras.dueAt || "",
    notes: extras.notes || "",
    calendarEventId: extras.calendarEventId || "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function cryptoRandomId() {
  return "task_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 25_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendText(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(text);
}

function requireAuth(req, res) {
  if (!authToken) return true;
  const header = req.headers.authorization || "";
  if (header === `Bearer ${authToken}`) return true;
  sendJson(res, 401, { error: "Unauthorized" });
  return false;
}

function loadTasks() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(tasksFile, "utf8")).tasks || [];
}

function saveTasks(tasks) {
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks }, null, 2));
}

function normalizeZone(zone) {
  if (["do", "plan", "delegate", "delete"].includes(zone)) return zone;
  return "do";
}

function validZone(zone) {
  return ["do", "plan", "delegate", "delete"].includes(zone);
}

function inferZoneFromText(text) {
  if (/zaplanuj|zaplanowane|kalendarz|termin|jutro|dzisiaj|spotkanie|wizyta/i.test(text)) return "plan";
  if (/deleguj|delegować|delegowane|przekaż|przekaz/i.test(text)) return "delegate";
  if (/usuń|usun|kasuj|wyrzuć|wyrzuc|nie robić|nie robic/i.test(text)) return "delete";
  return "do";
}

function cleanTaskTitle(text) {
  return String(text || "")
    .replace(/^(zrób teraz|zrob teraz|zaplanuj|deleguj|usuń|usun)\s*[-:]?\s*/i, "")
    .trim();
}

function upsertTaskFromParsed(parsed) {
  const tasks = loadTasks();
  const now = new Date().toISOString();
  const task = createTask(parsed.title || parsed.task || "Nowe zadanie", normalizeZone(parsed.zone || parsed.quadrant), {
    status: parsed.status || "planowane",
    dueAt: parsed.dueAt || parsed.eventStart || "",
    notes: parsed.notes || "",
    calendarEventId: parsed.calendarEventId || ""
  });
  task.createdAt = parsed.createdAt || now;
  task.updatedAt = now;
  tasks.unshift(task);
  saveTasks(tasks);
  return task;
}

async function proxyToN8n(req, res, mode) {
  const contentType = req.headers["content-type"] || "application/json";
  let forcedZone = validZone(req.headers["x-forced-zone"] || "") ? req.headers["x-forced-zone"] : "";
  let body;
  let json = {};

  if (mode === "raw") {
    body = await readRawBody(req);
  } else {
    json = await readJsonBody(req);
    forcedZone = validZone(json.forcedZone || forcedZone) ? (json.forcedZone || forcedZone) : "";
    body = Buffer.from(JSON.stringify(json));
  }

  if (!n8nWebhookUrl) {
    if (mode === "raw") {
      sendJson(res, 500, { error: "N8N_WEBHOOK_URL is not configured. Audio transcription needs n8n or another speech-to-text service." });
      return;
    }

    const text = String(json.text || json.title || "").trim();
    const task = upsertTaskFromParsed({
      title: cleanTaskTitle(text) || "Nowe zadanie",
      zone: forcedZone || inferZoneFromText(text),
      notes: "Dodane lokalnie bez n8n."
    });
    sendJson(res, 200, { localTask: task, fallback: "local-text" });
    return;
  }

  const response = await fetch(n8nWebhookUrl, {
    method: "POST",
    headers: {
      "content-type": contentType,
      "x-eisenhower-source": "pwa"
    },
    body
  });

  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = { raw: text };
  }

  if (payload && payload.task) {
    if (forcedZone) payload.task.zone = forcedZone;
    payload.localTask = upsertTaskFromParsed(payload.task);
  }

  sendJson(res, response.ok ? 200 : response.status, payload);
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(url.pathname === "/" ? "/v2.html" : url.pathname);
  const filePath = path.normalize(path.join(publicDir, pathname));

  if (!filePath.startsWith(publicDir)) {
    sendText(res, 403, "Forbidden");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      sendText(res, 404, "Not found");
      return;
    }

    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (url.pathname === "/api/config" && req.method === "GET") {
      sendJson(res, 200, { authRequired: Boolean(authToken), n8nEnabled: Boolean(n8nWebhookUrl) });
      return;
    }

    if (url.pathname === "/api/health" && req.method === "GET") {
      sendJson(res, 200, {
        ok: true,
        service: "eisenhower-pwa",
        version: appVersion,
        n8nEnabled: Boolean(n8nWebhookUrl),
        authRequired: Boolean(authToken),
        time: new Date().toISOString()
      });
      return;
    }

    if (url.pathname === "/api/tasks" && req.method === "GET") {
      if (!requireAuth(req, res)) return;
      sendJson(res, 200, { tasks: loadTasks() });
      return;
    }

    if (url.pathname === "/api/tasks" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      const body = await readJsonBody(req);
      const task = createTask(body.title, normalizeZone(body.zone), body);
      const tasks = loadTasks();
      tasks.unshift(task);
      saveTasks(tasks);
      sendJson(res, 201, { task });
      return;
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "PATCH") {
      if (!requireAuth(req, res)) return;
      const id = url.pathname.split("/").pop();
      const body = await readJsonBody(req);
      const tasks = loadTasks();
      const task = tasks.find((item) => item.id === id);
      if (!task) {
        sendJson(res, 404, { error: "Task not found" });
        return;
      }
      Object.assign(task, body, { zone: body.zone ? normalizeZone(body.zone) : task.zone, updatedAt: new Date().toISOString() });
      saveTasks(tasks);
      sendJson(res, 200, { task });
      return;
    }

    if (url.pathname.startsWith("/api/tasks/") && req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      const id = url.pathname.split("/").pop();
      const tasks = loadTasks().filter((item) => item.id !== id);
      saveTasks(tasks);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === "/api/intake/text" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      await proxyToN8n(req, res, "json");
      return;
    }

    if (url.pathname === "/api/intake/audio" && req.method === "POST") {
      if (!requireAuth(req, res)) return;
      await proxyToN8n(req, res, "raw");
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

ensureDataFile();
server.listen(port, () => {
  console.log(`Eisenhower PWA running on http://localhost:${port}`);
});
