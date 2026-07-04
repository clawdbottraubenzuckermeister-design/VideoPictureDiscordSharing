/*
 * Datei-Share – Discord-Umweg für Videos/Bilder.
 *
 * Hybrid-Speicher:
 *   • Dateien bis 100 MB  -> GitHub Contents-API, Ordner uploads/ (dauerhaft).
 *   • Dateien 100 MB–1 GB -> Litterbox (temporär, laufen nach 72 h ab).
 *
 * In beiden Fällen wird im Repo eine winzige Zeiger-Datei "current.json"
 * abgelegt, die auf die aktuelle Datei verweist. Die Seite liest nur diesen
 * Zeiger und zeigt immer die neueste Datei – so bleibt der Seiten-Link fest,
 * auch wenn die große Datei woanders liegt.
 *
 * Warum nicht direkt GitHub-Release-Assets (bis 2 GB)? uploads.github.com
 * erlaubt keine Browser-Uploads (kein CORS). Litterbox schon.
 */

const API = "https://api.github.com";
const UPLOAD_DIR = "uploads";
const POINTER = "current.json";

const GITHUB_MAX = 100 * 1024 * 1024;        // 100 MB – GitHub-Limit pro Datei
const LITTERBOX_MAX = 1024 * 1024 * 1024;    // 1 GB  – Litterbox-Limit
const LITTERBOX_API = "https://litterbox.catbox.moe/resources/internals/api.php";
const LITTERBOX_TIME = "72h";                // maximale Haltbarkeit
const LITTERBOX_TTL = 72 * 60 * 60 * 1000;

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

let currentItem = null;
let lastLoad = 0;

/* ---------- Konfiguration ---------- */

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

/* ---------- GitHub-Helfer ---------- */

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

function b64encodeUtf8(str) {
  return btoa(unescape(encodeURIComponent(str)));
}
function b64decodeUtf8(b64) {
  return decodeURIComponent(escape(atob(b64.replace(/\s/g, ""))));
}

// Zeiger lesen (funktioniert auch ohne Token – für Empfänger). Liefert sha zum
// späteren Überschreiben/Löschen.
async function readPointer() {
  const res = await fetch(contentsUrl(POINTER), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (res.status === 404) return { item: null, sha: null };
  if (!res.ok) throw new Error(`GitHub-API-Fehler (${res.status})`);
  const data = await res.json();
  try {
    return { item: JSON.parse(b64decodeUtf8(data.content)), sha: data.sha };
  } catch {
    return { item: null, sha: data.sha };
  }
}

async function writePointer(item, prevSha) {
  const body = {
    message: "Datei-Share: aktuelle Datei aktualisiert",
    content: b64encodeUtf8(JSON.stringify(item)),
  };
  if (prevSha) body.sha = prevSha;
  const res = await fetch(contentsUrl(POINTER), {
    method: "PUT",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error("Token ungültig oder ohne „Contents: Read and write“ – unter ⚙ prüfen.");
    }
    throw new Error(`Zeiger konnte nicht gespeichert werden (${res.status})`);
  }
}

async function deletePointer(sha) {
  if (!sha) return;
  await fetch(contentsUrl(POINTER), {
    method: "DELETE",
    headers: authHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ message: "Datei-Share: geleert", sha }),
  });
}

// Alle Dateien im uploads-Ordner (optional eine ausnehmen) löschen.
async function cleanUploads(keepPath) {
  const res = await fetch(contentsUrl(UPLOAD_DIR), {
    headers: authHeaders(),
    cache: "no-store",
  });
  if (!res.ok) return; // 404 = Ordner leer/fehlt
  const list = await res.json();
  const files = (Array.isArray(list) ? list : []).filter(
    (e) => e.type === "file" && e.path !== keepPath,
  );
  await Promise.allSettled(files.map((f) =>
    fetch(contentsUrl(f.path), {
      method: "DELETE",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ message: `Datei-Share: ${f.name} entfernt`, sha: f.sha }),
    }),
  ));
}

/* ---------- Anzeige ---------- */

function formatSize(bytes) {
  if (bytes >= 1024 ** 3) return (bytes / 1024 ** 3).toFixed(2) + " GB";
  if (bytes >= 1024 ** 2) return (bytes / 1024 ** 2).toFixed(1) + " MB";
  return Math.max(1, Math.round(bytes / 1024)) + " KB";
}

function inferType(name) {
  const ext = (name.split(".").pop() || "").toLowerCase();
  if (VIDEO_EXT.includes(ext)) return "video";
  if (IMAGE_EXT.includes(ext)) return "image";
  return "file";
}

function formatRemaining(ms) {
  const h = Math.floor(ms / 3600000);
  if (h >= 1) return `${h} h`;
  const m = Math.max(1, Math.floor(ms / 60000));
  return `${m} min`;
}

function render(item) {
  currentItem = item;
  els.mediaBox.querySelectorAll("video, img, .file-card").forEach((n) => n.remove());

  if (!item) {
    els.emptyState.hidden = false;
    els.metaLine.hidden = true;
    els.actionRow.hidden = true;
    return;
  }

  els.emptyState.hidden = true;
  const type = inferType(item.name);

  if (type === "video") {
    const v = document.createElement("video");
    v.controls = true;
    v.playsInline = true;
    v.preload = "metadata";
    v.src = item.url;
    els.mediaBox.appendChild(v);
  } else if (type === "image") {
    const img = document.createElement("img");
    img.alt = item.name;
    img.src = item.url;
    els.mediaBox.appendChild(img);
  } else {
    const div = document.createElement("div");
    div.className = "file-card";
    div.style.padding = "40px 16px";
    div.textContent = `📄 ${item.name}`;
    els.mediaBox.appendChild(div);
  }

  let meta = `${item.name} · ${formatSize(item.size)}`;
  if (item.ts) {
    meta += " · " + new Date(item.ts).toLocaleString("de-DE", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }
  if (item.kind === "litterbox" && item.expires) {
    const left = item.expires - Date.now();
    meta += left > 0 ? ` · läuft in ${formatRemaining(left)} ab` : " · abgelaufen";
  }
  els.metaLine.textContent = meta;
  els.metaLine.hidden = false;
  els.actionRow.hidden = false;
  els.btnDownload.href = item.url;
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
    const { item } = await readPointer();
    if (item?.kind === "litterbox" && item.expires && Date.now() > item.expires) {
      render(null); // abgelaufen – nichts mehr anzeigen
      return;
    }
    render(item || null);
  } catch (err) {
    if (!silent) toast(err.message, "error");
  }
}

/* ---------- Upload ---------- */

function sanitizeName(name) {
  const clean = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+/, "");
  return (clean || "datei").slice(-120);
}

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

// PUT einer Datei über die Contents-API mit Upload-Fortschritt.
function putFile(path, base64, message, onProgress) {
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
        reject(new Error("Datei zu groß für GitHub (Grenze 100 MB)."));
      } else {
        reject(new Error(`Upload fehlgeschlagen (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Upload."));
    xhr.send(JSON.stringify({ message, content: base64 }));
  });
}

// Upload zu Litterbox (temporär) mit Fortschritt. Liefert die Direkt-URL.
function uploadLitterbox(file, onProgress) {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("reqtype", "fileupload");
    fd.append("time", LITTERBOX_TIME);
    fd.append("fileToUpload", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", LITTERBOX_API);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      const body = (xhr.responseText || "").trim();
      if (xhr.status === 200 && /^https?:\/\//.test(body)) resolve(body);
      else reject(new Error(`Litterbox-Upload fehlgeschlagen (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Netzwerkfehler beim Litterbox-Upload."));
    xhr.send(fd);
  });
}

async function handleUpload(file) {
  const { owner, repo, token } = getConfig();
  if (!owner || !repo || !token) {
    els.settingsDialog.showModal();
    toast("Zum Hochladen bitte unter ⚙ dein GitHub-Token eintragen.", "error");
    return;
  }
  if (file.size > LITTERBOX_MAX) {
    toast(`Datei ist ${formatSize(file.size)} groß – maximal 1 GB möglich.`, "error", 6000);
    return;
  }

  const useLitterbox = file.size > GITHUB_MAX;
  els.progressWrap.hidden = false;
  setProgress(0, "Vorbereiten");

  try {
    const { sha: prevSha } = await readPointer().catch(() => ({ sha: null }));
    const ts = Date.now();
    let item;

    if (useLitterbox) {
      const url = await uploadLitterbox(file, (p) => setProgress(p, "Hochladen"));
      item = { kind: "litterbox", name: file.name, url, size: file.size, ts, expires: ts + LITTERBOX_TTL };
    } else {
      const base64 = await fileToBase64(file, (p) => setProgress(p * 0.35, "Vorbereiten"));
      const path = `${UPLOAD_DIR}/${ts}-${sanitizeName(file.name)}`;
      const created = await putFile(
        path, base64, `Datei-Share: ${file.name} hochgeladen`,
        (p) => setProgress(0.35 + p * 0.65, "Hochladen"),
      );
      item = { kind: "github", name: file.name, url: created.download_url, size: file.size, ts, path };
    }

    setProgress(1, "Fertig");
    await writePointer(item, prevSha);
    // Alte GitHub-Dateien aufräumen (bei Litterbox alle, bei GitHub alle außer der neuen).
    await cleanUploads(item.kind === "github" ? item.path : null);

    render(item);
    const extra = item.kind === "litterbox"
      ? " (läuft in 72 h automatisch ab)"
      : "";
    toast(`✅ Hochgeladen${extra}! „Discord-Link kopieren“ drücken.`, "success", 5000);
  } catch (err) {
    toast(err.message, "error", 6000);
  } finally {
    setTimeout(() => (els.progressWrap.hidden = true), 800);
  }
}

function setProgress(frac, label) {
  const pct = Math.round(frac * 100);
  els.progressBar.style.width = pct + "%";
  els.progressText.textContent = label ? `${label} ${pct} %` : pct + " %";
}

/* ---------- Leeren ---------- */

async function clearAll() {
  if (!confirm("Aktuelle Datei wirklich löschen?")) return;
  try {
    const { sha } = await readPointer();
    await deletePointer(sha);
    await cleanUploads(null);
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
  if (!currentItem) return;
  const ok = await copyText(currentItem.url);
  toast(ok
    ? "🔗 Link kopiert! In Discord einfügen – Bilder werden dort direkt angezeigt."
    : "Kopieren fehlgeschlagen – Link: " + currentItem.url,
    ok ? "success" : "error", 5000);
});

els.btnPick.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", () => {
  if (els.fileInput.files[0]) handleUpload(els.fileInput.files[0]);
  els.fileInput.value = "";
});

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

window.addEventListener("focus", () => {
  if (Date.now() - lastLoad > 15000) loadLatest({ silent: true });
});

/* ---------- Start ---------- */

applyOwnerMode();
loadLatest({ silent: true });
