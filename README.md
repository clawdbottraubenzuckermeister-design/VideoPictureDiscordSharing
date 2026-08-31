# 📤 File-Share – a Discord workaround for videos & images

A tiny GitHub Pages site that lets you share **files up to 1 GB** – far above Discord's
free upload limit (only ~10 MB), so your phone photos and clips go through.

**What it does:**
- The page always shows **only the newest uploaded file** – playable and downloadable right there.
- Uploading a new file **automatically deletes the old one** (no clutter).
- Upload by **button or drag & drop**, from any device (phone included). **Every file format** is accepted.
- A **🗑 Clear** button wipes the current file instantly.
- A **🔗 Copy Discord link** button gives you a direct link (images embed right in the chat).

### Where files are stored (automatic – you don't choose)

The page picks the storage automatically based on file size:

| File size | Stored on | Kept |
|---|---|---|
| **up to 95 MB** | your GitHub repo (`uploads/` folder) | permanently (until replaced/cleared) |
| **95 MB – 1 GB** | [Litterbox](https://litterbox.catbox.moe) (a free temporary host) | **auto-deletes after 72 hours** |

Either way, a tiny pointer file (`current.json`) is written to your repo so the page always
knows the newest file. That's why **your page link never changes**, even for big files.

> **Why two backends?** A browser can only upload to services that allow it (CORS). GitHub's
> Contents API allows it but caps files at 100 MB (we stop at 95 MB, since the Base64
> encoding the API requires inflates the request by ~33 %). GitHub's 2 GB "release asset" path refuses
> browser uploads (no CORS on `uploads.github.com`). Litterbox allows browser uploads up to
> 1 GB, but only temporarily. Combining them gives permanent small files **and** big files.
> If you ever need permanent multi-GB files, that requires your own storage (e.g. a free
> Cloudflare R2 bucket) – ask and it can be added.

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
- **Limits:** max 1 GB per file. Files up to 95 MB stay in your repo permanently; larger
  files go to Litterbox and **auto-delete after 72 hours** – so share big videos soon after
  uploading. Images embed directly in Discord.
- **Storage target:** a switch under the upload area picks where a file goes. It sits on
  **Auto** on every page load (GitHub while the file fits, Litterbox above that). Set it by
  hand when one of the two services is having an outage.
- **Video players in Discord** need three things to line up:
  1. *Correct headers.* Litterbox serves `video/mp4` and honours range requests;
     `raw.githubusercontent.com` serves every video as `application/octet-stream` with
     `X-Content-Type-Options: nosniff`. **A video stored on GitHub can never get a player** –
     only a download link. Pick Litterbox if the player matters more than permanence.
  2. *Metadata at the front.* Phone cameras put the `moov` block at the end of the file, so a
     player reading only the beginning finds nothing. `faststart.js` moves it to the front
     before uploading – without re-encoding, and it leaves the file byte-length identical.
  3. *A codec browsers can decode.* H.265/HEVC (`hvc1`) plays in no browser, so no player will
     ever appear for it. The page detects this on upload and says so. Fix it at the source:
     Samsung camera settings → turn off *"High efficiency video"* to record H.264 instead.
- **Executables:** Litterbox blocks program files (`.exe`, `.jar`, `.scr`, …) with a
  "Bad file type" error. To share one that's over 95 MB, put it in a `.zip` first – zip
  archives are allowed. (Under 95 MB it goes to GitHub and any type is fine.)
- **After changes, hard-refresh:** if the page ever behaves like an old version, press
  **Ctrl+F5** once to bypass the browser cache.
- **Big files & privacy:** Litterbox is a third-party host; a big file sits at a random
  public URL until it expires. Same "public if you have the link" level as the repo, but on
  someone else's server – don't upload anything truly sensitive there.
- **Token:** If it expires or you leak it by accident, delete/recreate it in GitHub
  Developer settings and paste the new one under ⚙.
- **Phone:** Just open the site in your phone's browser – the 📁 button opens the
  gallery/camera. Enter your token once under ⚙ first.
