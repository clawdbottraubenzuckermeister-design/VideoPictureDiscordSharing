/*
 * Datei-Share – Discord-Umweg für große Videos/Bilder.
 *
 * Speicherprinzip: Die Dateien liegen als Assets eines GitHub-Releases
 * (Tag "media") im eigenen Repo. Release-Assets dürfen bis zu 2 GB groß
 * sein. Die Seite zeigt immer nur das neueste Asset; beim Upload werden
 * alle älteren Assets gelöscht.
 */

const API = "https://api.github.com";
const TAG = "media";
const MAX_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB (GitHub-Limit für Release-Assets)

const els = {};
[
  "mediaBox", "emptyState", "metaLine", "actionRow", "btnDownload",
  "btnCopyDiscord", "btnClear", "btnRefresh", "btnSettings", "btnPick",
  "fileInput", "dropZone", "dropOverlay", "progressWrap", "progressBar",
  "progressText", "toast", "settingsDialog", "settingsForm", "inpOwner",
  "inpRepo", "inpToken", "btnRemoveToken", "ownerHint", "uploadCard",
].forEach((id) => (els[id] = document.getElementById(id)));

let currentAsset = null;
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

function apiHeaders(token, extra = {}) {
  const h = { Accept: "application/vnd.github+json", ...extra };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function apiFetch(path, { method = "GET", body } = {}) {
  const { token } = getConfig();
  const res = await fetch(API + path, {
    method,
    headers: apiHeaders(token, body ? { "Content-Type": "application/json" } : {}),
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return res;
}

async function getRelease() {
  const { owner, repo } = getConfig();
  const res = await apiFetch(`/repos/${owner}/${repo}/releases/tags/${TAG}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`GitHub-API-Fehler (${res.status})`);
  return res.json();
}

async function ensureRelease() {
  const existing = await getRelease();
  if (existing) return existing;
  const { owner, repo } = getConfig();
  const res = await apiFetch(`/repos/${owner}/${repo}/releases`, {
    method: "POST",
    body: {
      tag_name: TAG,
      name: "Geteilte Datei",
      body: "Wird automatisch von der Datei-Share-Seite verwaltet.",
    },
  });
  if (!res.ok) throw new Error(`Release konnte nicht angelegt werden (${res.status})`);
  return res.json();
}

async function deleteAsset(id) {
  const { owner, repo } = getConfig();
  const res = await apiFetch(`/repos/${owner}/${repo}/releases/assets/${id}`, {
    method: "DELETE",
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

function displayName(assetName) {
  // Uploads bekommen einen Zeitstempel-Präfix, damit Namen eindeutig sind.
  return assetName.replace(/^\d{10,}-/, "");
}

function render(asset) {
  currentAsset = asset;
  els.mediaBox.querySelectorAll("video, img, .file-card").forEach((n) => n.remove());

  if (!asset) {
    els.emptyState.hidden = false;
    els.metaLine.hidden = true;
    els.actionRow.hidden = true;
    return;
  }

  els.emptyState.hidden = true;
  const url = asset.browser_download_url;
  const type = asset.content_type || "";

  if (type.startsWith("video/")) {
    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = url;
    els.mediaBox.appendChild(v);
  } else if (type.startsWith("image/")) {
    const img = document.createElement("img");
    img.alt = displayName(asset.name);
    img.src = url;
    els.mediaBox.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "file-card";
    div.style.padding = "40px 16px";
    div.textContent = `📄 ${displayName(asset.name)}`;
    els.mediaBox.appendChild(div);
  }

  const when = new Date(asset.created_at).toLocaleString("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  els.metaLine.textContent = `${displayName(asset.name)} · ${formatSize(asset.size)} · hochgeladen ${when}`;
  els.metaLine.hidden = false;
  els.actionRow.hidden = false;
  els.btnDownload.href = url;
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
    const release = await getRelease();
    const assets = (release?.assets || []).slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    render(assets[0] || null);
  } catch (err) {
    if (!silent) toast(err.message, "error");
  }
}

/* ---------- Upload ---------- */

function sanitizeName(name) {
  return name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
}

function uploadAsset(uploadUrlTemplate, file, assetName, onProgress) {
  // XHR statt fetch, weil nur XHR Upload-Fortschritt liefert.
  const url =
    uploadUrlTemplate.replace(/\{.*\}$/, "") +
    `?name=${encodeURIComponent(assetName)}`;
  const { token } = getConfig();

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Accept", "application/vnd.github+json");
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status === 201) {
        resolve(JSON.parse(xhr.responseText));
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error("Token ungültig oder ohne Berechtigung – unter ⚙ prüfen."));
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
    xhr.send(file);
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
    toast("Datei ist größer als 2 GB – das erlaubt GitHub leider nicht.", "error");
    return;
  }

  els.progressWrap.hidden = false;
  setProgress(0);

  try {
    const release = await ensureRelease();
    const assetName = `${Date.now()}-${sanitizeName(file.name)}`;

    const newAsset = await uploadAsset(release.upload_url, file, assetName, setProgress);
    setProgress(1);

    // Alte Dateien entfernen – es soll immer nur die neueste existieren.
    const fresh = await getRelease();
    const old = (fresh?.assets || []).filter((a) => a.id !== newAsset.id);
    await Promise.allSettled(old.map((a) => deleteAsset(a.id)));

    render(newAsset);
    toast("✅ Hochgeladen! „Discord-Link kopieren“ drücken und in Discord einfügen.", "success", 5000);
  } catch (err) {
    toast(err.message, "error", 6000);
  } finally {
    setTimeout(() => (els.progressWrap.hidden = true), 800);
  }
}

function setProgress(frac) {
  const pct = Math.round(frac * 100);
  els.progressBar.style.width = pct + "%";
  els.progressText.textContent = pct + " %";
}

/* ---------- Leeren ---------- */

async function clearAll() {
  if (!confirm("Aktuelle Datei wirklich löschen?")) return;
  try {
    const release = await getRelease();
    const assets = release?.assets || [];
    await Promise.allSettled(assets.map((a) => deleteAsset(a.id)));
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
  // Auf GitHub Pages sind Benutzer/Repo durch die URL vorgegeben.
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
  if (!currentAsset) return;
  const ok = await copyText(currentAsset.browser_download_url);
  toast(ok
    ? "🔗 Link kopiert! In Discord einfügen – das Video wird dort direkt abgespielt."
    : "Kopieren fehlgeschlagen – Link: " + currentAsset.browser_download_url,
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
