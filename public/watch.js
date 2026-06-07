const tokenKey = "eisenhower-app-token";
let mediaRecorder = null;
let chunks = [];

function authHeaders(extra = {}) {
  const token = localStorage.getItem(tokenKey);
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

function setStatus(text) {
  document.getElementById("status").textContent = text;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: authHeaders(options.headers || {})
  });
  if (response.status === 401) {
    askForToken();
    throw new Error("Wpisz token.");
  }
  if (!response.ok) throw new Error("Błąd połączenia.");
  return response.json();
}

async function refreshCounts() {
  const payload = await api("/api/tasks");
  const tasks = payload.tasks || [];
  document.getElementById("countDo").textContent = tasks.filter((task) => task.zone === "do").length;
  document.getElementById("countPlan").textContent = tasks.filter((task) => task.zone === "plan").length;
  document.getElementById("countDelegate").textContent = tasks.filter((task) => task.zone === "delegate").length;
  document.getElementById("countDelete").textContent = tasks.filter((task) => task.zone === "delete").length;
  setStatus("Gotowe.");
}

function askForToken() {
  const token = prompt("APP_TOKEN");
  if (token) localStorage.setItem(tokenKey, token.trim());
}

document.getElementById("tokenButton").addEventListener("click", () => {
  askForToken();
  refreshCounts().catch((error) => setStatus(error.message));
});

document.getElementById("quickForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = document.getElementById("taskInput");
  const title = input.value.trim();
  const zone = document.getElementById("zoneInput").value;
  if (!title) return;
  setStatus("Dodaję...");
  await api("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, zone })
  });
  input.value = "";
  await refreshCounts();
});

async function toggleRecording() {
  const button = document.getElementById("recordButton");
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    button.classList.remove("recording");
    button.textContent = "Nagraj";
    setStatus("Wysyłam...");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    setStatus("Ten zegarek nie obsługuje nagrywania w przeglądarce. Użyj skrótu.");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.addEventListener("dataavailable", (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  });
  mediaRecorder.addEventListener("stop", async () => {
    stream.getTracks().forEach((track) => track.stop());
    try {
      const blob = new Blob(chunks, { type: mediaRecorder.mimeType || "audio/webm" });
      const response = await fetch("/api/intake/audio", {
        method: "POST",
        headers: authHeaders({
          "content-type": blob.type,
          "x-timezone": Intl.DateTimeFormat().resolvedOptions().timeZone,
          "x-now": new Date().toISOString()
        }),
        body: blob
      });
      if (!response.ok) throw new Error("Błąd wysyłki.");
      setStatus("Dodane z nagrania.");
      await refreshCounts();
    } catch (error) {
      setStatus(error.message);
    }
  });
  mediaRecorder.start();
  button.classList.add("recording");
  button.textContent = "Stop";
  setStatus("Nagrywam...");
}

document.getElementById("recordButton").addEventListener("click", () => {
  toggleRecording().catch((error) => setStatus(error.message));
});

refreshCounts().catch((error) => setStatus(error.message));
