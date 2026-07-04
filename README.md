# 📤 File-Share – a Discord workaround for videos & images

A tiny GitHub Pages site that lets you share **any file up to 100 MB** – far above
Discord's free upload limit (only ~10 MB), so your phone photos and clips go through.

**What it does:**
- The page always shows **only the newest uploaded file** – playable and downloadable right there.
- Uploading a new file **automatically deletes the old one** (no clutter).
- Upload by **button or drag & drop**, from any device (phone included). **Every file format** is accepted.
- A **🗑 Clear** button wipes the current file instantly.
- A **🔗 Copy Discord link** button gives you a direct link (images embed right in the chat).

Files are stored as normal files in the `uploads/` folder of your repository, uploaded
straight from the browser via GitHub's Contents API.

> **Why 100 MB and not more?** A browser can only upload to GitHub through the Contents
> API, and GitHub blocks any single file over 100 MB. The bigger "release asset" path
> (up to 2 GB) refuses uploads from a browser (no CORS on `uploads.github.com`), so it
> can't be used from a plain static page. 100 MB still covers phone photos and short
> videos comfortably. If you regularly need multi-hundred-MB videos, you'd need a small
> helper service (e.g. a free Cloudflare Worker) as an upload proxy – ask and it can be added.

---

## 🛠 One-time setup (about 5 minutes)

Your repository already exists:
`https://github.com/clawdbottraubenzuckermeister-design/VideoPictureDiscordSharing`

### Step 1 – Make sure the files are in the repo

The site files (`index.html`, `style.css`, `app.js`, `.nojekyll`, `README.md`) are pushed
to the `main` branch. Open the repo on GitHub and check they are listed. Done ✔

### Step 2 – Turn on GitHub Pages

1. In your repository, click **Settings** (top menu).
2. In the left sidebar, click **Pages**.
3. Under **Build and deployment**:
   - **Source:** *Deploy from a branch*
   - **Branch:** *main*  ·  Folder: **/ (root)**
   - Click **Save**.
4. Wait 1–2 minutes, then refresh the Pages page. Your site is live at:

   **`https://clawdbottraubenzuckermeister-design.github.io/VideoPictureDiscordSharing/`**

That URL is the link you give people. Anyone who opens it always sees the newest file.

### Step 3 – Create your upload token (only for you)

So that **only you** can upload and delete, you need a GitHub token:

1. Click your **profile picture** (top right) → **Settings**.
2. Scroll all the way down → **Developer settings** (left sidebar).
3. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
4. Fill in:
   - **Token name:** e.g. `file-share`
   - **Expiration:** e.g. 90 days or 1 year (when it expires, just make a new one)
   - **Repository access:** *Only select repositories* → pick
     **VideoPictureDiscordSharing**
   - **Permissions** → **Repository permissions** → **Contents** → set to
     **Read and write**
5. Click **Generate token** and **copy** the token (`github_pat_…`). You won't see it again.

### Step 4 – Paste the token into the site

1. Open your site: `https://clawdbottraubenzuckermeister-design.github.io/VideoPictureDiscordSharing/`
2. Click the **⚙** (gear) in the top-right corner.
3. Paste your token into the **GitHub token** field → **Save**.

Do this **once per device you upload from** (PC, phone, …). The token is stored only in
that device's browser and is never published on the site or in the repo.

---

## 🚀 How to use it

1. Open the site → drag a video/image onto it, or click **📁 Choose file**.
2. Wait for the progress bar to finish. The old file is deleted automatically.
3. Click **🔗 Copy Discord link** and paste it into Discord → images show inline; for a
   video, click the link to open/download it.
4. After the chat: click **🗑 Clear** and the page is empty again.

### Two kinds of links – quick explanation

| Link | What it's for |
|---|---|
| **Page link** (`…github.io/VideoPictureDiscordSharing/`) | Send it to a person once – in a browser it always shows the newest file. |
| **Discord link** (the button on the page) | Copy it **fresh for each new file** and paste into Discord – it points straight at that file, so images embed inline. |

**Why two links?** Discord permanently caches the preview of a link. If you always posted
the same page link, Discord would keep showing the *old* file forever. The Discord link is
unique per file – one click on the button, paste, done.

---

## ⚠️ Good to know

- **Privacy:** The repository is public. There are no passwords – anyone who has the link
  (or browses your GitHub profile) can see the current file. That's usually fine for phone
  videos sent to one person, but don't upload anything truly sensitive. The **🗑 Clear**
  button removes the file immediately and permanently.
- **Limits:** max 100 MB per file (GitHub's hard limit for browser uploads). Images embed
  directly in Discord; for videos Discord may show a download link instead of an inline
  player – downloading always works either way.
- **Token:** If it expires or you leak it by accident, delete/recreate it in GitHub
  Developer settings and paste the new one under ⚙.
- **Phone:** Just open the site in your phone's browser – the 📁 button opens the
  gallery/camera. Enter your token once under ⚙ first.
