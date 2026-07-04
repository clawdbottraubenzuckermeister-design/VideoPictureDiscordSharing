# 📤 Datei-Share – Discord-Umweg für große Videos & Bilder

Eine kleine GitHub-Pages-Seite, mit der du **Videos und Bilder bis 2 GB** teilen kannst,
ohne am Discord-Upload-Limit zu scheitern.

**So funktioniert es:**
- Die Seite zeigt **immer nur die neueste hochgeladene Datei** – direkt abspielbar und herunterladbar.
- Beim Hochladen wird die **alte Datei automatisch gelöscht** (kein Datenmüll).
- Upload per **Button oder Drag & Drop**, von jedem Gerät (auch Handy).
- **🗑 Leeren**-Knopf löscht die aktuelle Datei sofort.
- **🔗 Discord-Link kopieren** gibt dir einen Link, den Discord **direkt als Video abspielt**.

Die Dateien werden als *Release-Assets* in deinem GitHub-Repository gespeichert –
deshalb funktionieren auch große Dateien (GitHub erlaubt dort bis 2 GB pro Datei).

---

## 🛠 Einmalige Einrichtung (ca. 5 Minuten)

### 1. GitHub-Repository erstellen

1. Auf [github.com](https://github.com) einloggen (ggf. kostenloses Konto erstellen).
2. Oben rechts **+** → **New repository**.
3. Name z. B. `datei-share`, Sichtbarkeit **Public** (nötig für GitHub Pages im Gratis-Tarif).
4. **Create repository** klicken.

### 2. Diese Dateien hochladen

Entweder über die GitHub-Webseite: **uploading an existing file** anklicken und
`index.html`, `style.css`, `app.js`, `.nojekyll` und `README.md` hineinziehen → **Commit changes**.

Oder per Git aus diesem Ordner (das lokale Repo ist schon vorbereitet):

```
git remote add origin https://github.com/DEIN-NAME/datei-share.git
git push -u origin main
```

### 3. GitHub Pages aktivieren

1. Im Repository: **Settings** → **Pages** (linke Seitenleiste).
2. Unter *Build and deployment*: Source = **Deploy from a branch**,
   Branch = **main**, Ordner = **/ (root)** → **Save**.
3. Nach 1–2 Minuten ist deine Seite erreichbar unter:
   `https://DEIN-NAME.github.io/datei-share/`

**Das ist der Link, den du weitergibst.** Wer ihn öffnet, sieht immer die neueste Datei.

### 4. Upload-Token erstellen (nur für dich)

Damit **nur du** hochladen und löschen kannst, brauchst du ein GitHub-Token:

1. GitHub → Profilbild oben rechts → **Settings** → ganz unten **Developer settings**.
2. **Personal access tokens** → **Fine-grained tokens** → **Generate new token**.
3. Einstellungen:
   - **Token name:** z. B. `datei-share`
   - **Expiration:** z. B. 1 Jahr (danach einfach neues Token erstellen)
   - **Repository access:** *Only select repositories* → dein `datei-share`-Repo auswählen
   - **Permissions → Repository permissions → Contents:** **Read and write**
4. **Generate token** und das Token (`github_pat_…`) kopieren.
5. Deine Seite öffnen → **⚙** oben rechts → Token einfügen → **Speichern**.

Das machst du **einmal pro eigenem Gerät** (PC, Handy, …). Das Token bleibt nur im
Browser deines Geräts gespeichert und landet nie auf der Seite oder im Repo.

---

## 🚀 Benutzung

1. Seite öffnen → Video/Bild per **Drag & Drop** hineinziehen oder **📁 Datei auswählen**.
2. Warten, bis der Fortschrittsbalken durch ist. Die alte Datei wird dabei automatisch gelöscht.
3. **🔗 Discord-Link kopieren** drücken und den Link in Discord einfügen →
   das Video wird dort direkt abgespielt.
4. Nach dem Chat: **🗑 Leeren** drücken, dann ist die Seite wieder leer.

### Zwei Arten von Links – kurz erklärt

| Link | Wofür |
|---|---|
| **Seiten-Link** (`…github.io/datei-share/`) | Einmal an eine Person schicken – zeigt im Browser **immer die neueste Datei**. |
| **Discord-Link** (Button auf der Seite) | Für jedes neue Video **neu kopieren** und in Discord posten – nur so spielt Discord das Video direkt im Chat ab. |

**Warum zwei Links?** Discord speichert die Vorschau eines Links dauerhaft im Cache.
Würde immer derselbe Link gepostet, würde Discord ewig das *alte* Video zeigen.
Der Discord-Link ist deshalb für jede Datei einzigartig – ein Klick auf den Button,
einfügen, fertig.

---

## ⚠️ Gut zu wissen

- **Privatsphäre:** Das Repository ist öffentlich. Es gibt keine Passwörter – wer den
  Link kennt (oder dein GitHub-Profil durchstöbert), kann die aktuelle Datei sehen.
  Für private Handyvideos an eine Person ist das meist okay, aber lade nichts wirklich
  Sensibles hoch. Der **🗑 Leeren**-Knopf entfernt die Datei sofort und endgültig.
- **Limits:** max. 2 GB pro Datei (GitHub-Limit). Bei sehr großen Videos zeigt Discord
  eventuell nur einen Download-Link statt des eingebetteten Players – herunterladen
  geht aber immer.
- **Token:** Falls das Token abläuft oder du es versehentlich teilst: In den GitHub
  Developer settings löschen/neu erstellen und unter ⚙ neu eintragen.
- **Handy:** Einfach die Seite im Handy-Browser öffnen – der 📁-Button öffnet die
  Galerie/Kamera. Token vorher einmal unter ⚙ eintragen.
