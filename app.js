/*
 * Datei-Share – Discord-Umweg für große Videos/Bilder.
 *
 * Speicherprinzip: Die Datei wird über die GitHub-"Contents"-API als normale
 * Datei im Ordner "uploads/" des Repos abgelegt. Dieser Weg funktioniert – im
 * Gegensatz zum Release-Upload (uploads.github.com) – direkt aus dem Browser,
 * weil api.github.com CORS erlaubt. Grenze: 100 MB pro Datei (GitHub-Limit).
 *
 * Die Seite zeigt immer nur die neueste Datei; beim Upload werden alle älteren
 * Dateien im uploads-Ordner gelöscht.
 */

const API = "https://api.github.com";
const UPLOAD_DIR = "uploads";
const MAX_SIZE = 100 * 1024 * 1024; // 100 MB (GitHub-Limit pro Datei)

// Formate, die der Browser direkt anzeigen/abspielen kann. Alles andere wird
// als Download-Karte dargestellt (hochladen lässt sich trotzdem jedes Format).
const VIDEO_EXT = ["mp4", "webm", "ogv", "ogg", "mov", "m4v"];
const IMAGE_EXT = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "avif"];

const els = {};
[
  "mediaBox", "emptyState", "metaLine", "actionRow", "btnDownload",
  "btnCopyDiscord", "btnClear", "btnRefresh", "btnSettings", "btnPick",
  "fileInput", "dropZone", "dropOverlay", "progressWrap", "progressBar",
  "progressText", "toast", "settingsDialog", "settingsForm", "inpOwner",
  "inpRepo", "inpToken", "btnRemoveToken", "ownerHint", "uploadCard",
].forEach((id) => (els[id] = document.getElementById(id)));

let currentFile = null;
let lastLoad = 0;

/* ---------- Konfiguration ---------- */

// Auf GitHub Pages lassen sich Benutzer und Repo direkt aus der URL ablesen,
// damit Empfänger ohne jede Einrichtung zuschauen können.
function configFromUrl() {
  const host = location.hostname;
  if (!host.endsWith(".github.io")) return null;
  const owner = host.split(".")[0];
  const seg = location.pathname.split("/").filter(Boolean)[0];
  return { owner, repo: seg || `${owner}.github.io` };
}

function getConfig() {
  const fromUrl = configFromUrl();
  const owner = fromUrl?.owner || localStorage.getItem("ds_owner") || "";
  const repo = fromUrl?.repo || localStorage.getItem("ds_repo") || "";
  const token = localStorage.getItem("ds_token") || "";
  return { owner, repo, token };
}

/* ---------- API-Helfer ---------- */

function contentsUrl(path) {
  const { owner, repo } = getConfig();
  const enc = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${owner}/${repo}/contents/${enc}`;
}

function authHeaders(extra = {}) {
  const { token } = getConfig();
  const h = { Accept: "application/vnd.github+json", ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

// Liste der Dateien im uploads-Ordner (neueste zuerst). Leer, falls Ordner fehlt.
async function listFiles() {
  const res = await fetch(contentsUrl(UPLOAD_DIR), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`GitHub-API-Fehler (${res.status})`);
  const data = await res.json();
  const arr = Array.isArray(data) ? data : [data];
  return arr
    .filter((e) => e.type === "file")
    .map(normalize)
    .sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

function normalize(entry) {
  const m = entry.name.match(/^(\d{10,})-/);
  return {
    name: entry.name,
    path: entry.path,
    sha: entry.sha,
    size: entry.size,
    url: entry.download_url,
    type: inferType(entry.name),
    ts: m ? Number(m[1]) : 0,
  };
}

function inferType(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  return "file";
}

async function deleteFile(file) {
  const res = await fetch(contentsUrl(file.path), {
    method: "DELETE",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message: `Datei-Share: ${file.name} entfernt`, sha: file.sha }),
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Löschen fehlgeschlagen (${res.status})`);
  }
}

/* ---------- Anzeige ---------- */

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function displayName(name) {
  return name.replace(/^\d{10,}-/, "");
}

function render(file) {
  currentFile = file;
  els.mediaBox.querySelectorAll("video, img, .file-card").forEach((n) => n.remove());

  if (!file) {
    els.emptyState.hidden = false;
    els.metaLine.hidden = true;
    els.actionRow.hidden = true;
    return;
  }

  els.emptyState.hidden = true;

  if (file.type === "video") {
    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = file.url;
    els.mediaBox.appendChild(v);
  } else if (file.type === "image") {
    const img = document.createElement("img");
    img.alt = displayName(file.name);
    img.src = file.url;
    els.mediaBox.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "file-card";
    div.style.padding = "40px 16px";
    div.textContent = `📄 ${displayName(file.name)}`;
    els.mediaBox.appendChild(div);
  }

  let meta = `${displayName(file.name)} · ${formatSize(file.size)}`;
  if (file.ts) {
    const when = new Date(file.ts).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    meta += ` · hochgeladen ${when}`;
  }
  els.metaLine.textContent = meta;
  els.metaLine.hidden = false;
  els.actionRow.hidden = false;
  els.btnDownload.href = file.url;
}

async function loadLatest({ silent = false } = {}) {
  const { owner, repo } = getConfig();
  if (!owner || !repo) {
    if (!silent) {
      toast("Bitte zuerst unter ⚙ GitHub-Benutzer und Repository eintragen.", "error");
      els.settingsDialog.showModal();
    }
    return;
  }
  lastLoad = Date.now();
  try {
    const files = await listFiles();
    render(files[0] || null);
  } catch (err) {
    if (!silent) toast(err.message, "error");
  }
}

/* ---------- Upload ---------- */

function sanitizeName(name) {
  const clean = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "");
  return (clean || "datei").slice(-120);
}

// Datei als Base64 einlesen (ohne data:-Präfix). Liefert Lese-Fortschritt.
function fileToBase64(file, onProgress) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    reader.onload = () => {
      const res = String(reader.result);
      resolve(res.slice(res.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("Datei konnte nicht gelesen werden."));
    reader.readAsDataURL(file);
  });
}

// PUT über die Contents-API mit Upload-Fortschritt (XHR statt fetch).
function putContent(path, base64, message, onProgress) {
  const { token } = getConfig();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", contentsUrl(path));
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201 || xhr.status === 200) {
        resolve(JSON.parse(xhr.responseText).content);
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error("Token ungültig oder ohne „Contents: Read and write“ – unter ⚙ prüfen."));
      } else if (xhr.status === 413 || xhr.status === 422) {
        reject(new Error("Datei zu groß für diesen Weg (Grenze 100 MB)."));
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
    xhr.send(JSON.stringify({ message, content: base64 }));
  });
}

async function handleUpload(file) {
  const { owner, repo, token } = getConfig();
  if (!owner || !repo || !token) {
    els.settingsDialog.showModal();
    toast("Zum Hochladen bitte unter ⚙ dein GitHub-Token eintragen.", "error");
    return;
  }
  if (file.size > MAX_SIZE) {
    toast(`Datei ist ${formatSize(file.size)} groß – GitHub erlaubt hier max. 100 MB.`, "error", 6000);
    return;
  }

  els.progressWrap.hidden = false;
  setProgress(0, "Vorbereiten");

  try {
    // Ältere Dateien schon einmal merken, um sie nachher zu entfernen.
    const existing = await listFiles().catch(() => []);

    const base64 = await fileToBase64(file, (p) => setProgress(p * 0.35, "Vorbereiten"));

    const fileName = `${Date.now()}-${sanitizeName(file.name)}`;
    const path = `${UPLOAD_DIR}/${fileName}`;
    const created = await putContent(
      path,
      base64,
      `Datei-Share: ${displayName(fileName)} hochgeladen`,
      (p) => setProgress(0.35 + p * 0.65, "Hochladen"),
    );
    setProgress(1, "Fertig");

    // Alte Dateien entfernen – es soll immer nur die neueste existieren.
    await Promise.allSettled(
      existing.filter((f) => f.path !== path).map((f) => deleteFile(f)),
    );

    render(normalize(created));
    toast("✅ Hochgeladen! „Discord-Link kopieren“ drücken und in Discord einfügen.", "success", 5000);
  } catch (err) {
    toast(err.message, "error", 6000);
  } finally {
    setTimeout(() => (els.progressWrap.hidden = true), 800);
  }
}

function setProgress(frac, label) {
  const pct = Math.round(frac * 100);
  els.progressBar.style.width = pct + "%";
  els.progressText.textContent = label ? `${label} ${pct} %` : pct + " %";
}

/* ---------- Leeren ---------- */

async function clearAll() {
  if (!confirm("Aktuelle Datei wirklich löschen?")) return;
  try {
    const files = await listFiles();
    if (!files.length) {
      render(null);
      toast("Ist bereits leer.");
      return;
    }
    await Promise.allSettled(files.map((f) => deleteFile(f)));
    render(null);
    toast("🗑 Gelöscht – die Seite ist jetzt leer.", "success");
  } catch (err) {
    toast(err.message, "error");
  }
}

/* ---------- Kopieren & Toast ---------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

let toastTimer;
function toast(msg, kind = "", ms = 3500) {
  els.toast.textContent = msg;
  els.toast.className = kind;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (els.toast.hidden = true), ms);
}

/* ---------- Einstellungen ---------- */

function openSettings() {
  const fromUrl = configFromUrl();
  const cfg = getConfig();
  els.inpOwner.value = cfg.owner;
  els.inpRepo.value = cfg.repo;
  els.inpToken.value = cfg.token;
  els.inpOwner.disabled = !!fromUrl;
  els.inpRepo.disabled = !!fromUrl;
  els.settingsDialog.showModal();
}

function saveSettings() {
  if (!els.inpOwner.disabled) {
    localStorage.setItem("ds_owner", els.inpOwner.value.trim());
    localStorage.setItem("ds_repo", els.inpRepo.value.trim());
  }
  const token = els.inpToken.value.trim();
  if (token) localStorage.setItem("ds_token", token);
  else localStorage.removeItem("ds_token");
  applyOwnerMode();
  toast("Gespeichert.", "success");
  loadLatest({ silent: true });
}

function applyOwnerMode() {
  const isOwner = !!getConfig().token;
  document.body.classList.toggle("is-owner", isOwner);
  els.ownerHint.hidden = isOwner;
}

/* ---------- Events ---------- */

els.btnSettings.addEventListener("click", openSettings);
els.settingsForm.addEventListener("submit", saveSettings);
els.btnRemoveToken.addEventListener("click", () => {
  localStorage.removeItem("ds_token");
  els.inpToken.value = "";
  applyOwnerMode();
  toast("Token entfernt.");
});

els.btnRefresh.addEventListener("click", () => loadLatest());
els.btnClear.addEventListener("click", clearAll);

els.btnCopyDiscord.addEventListener("click", async () => {
  if (!currentFile) return;
  const ok = await copyText(currentFile.url);
  toast(ok
    ? "🔗 Link kopiert! In Discord einfügen – Bilder werden dort direkt angezeigt."
    : "Kopieren fehlgeschlagen – Link: " + currentFile.url,
    ok ? "success" : "error", 5000);
});

els.btnPick.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files[0]) handleUpload(els.fileInput.files[0]);
  els.fileInput.value = "";
});

// Drag & Drop auf der ganzen Seite
let dragDepth = 0;
window.addEventListener("dragenter", (e) => {
  e.preventDefault();
  if (!getConfig().token) return;
  dragDepth++;
  els.dropOverlay.hidden = false;
  els.dropZone.classList.add("armed");
});
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("dragleave", (e) => {
  e.preventDefault();
  if (--dragDepth <= 0) {
    dragDepth = 0;
    els.dropOverlay.hidden = true;
    els.dropZone.classList.remove("armed");
  }
});
window.addEventListener("drop", (e) => {
  e.preventDefault();
  dragDepth = 0;
  els.dropOverlay.hidden = true;
  els.dropZone.classList.remove("armed");
  const file = e.dataTransfer?.files?.[0];
  if (file) handleUpload(file);
});

// Beim Zurückkehren zum Tab automatisch aktualisieren (max. alle 15 s)
window.addEventListener("focus", () => {
  if (Date.now() - lastLoad > 15000) loadLatest({ silent: true });
});

/* ---------- Start ---------- */

applyOwnerMode();
loadLatest({ silent: true });
