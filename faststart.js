/*
 * MP4-Faststart im Browser.
 *
 * Handy-Kameras legen den "moov"-Block – die Inhaltsangabe eines Videos mit
 * Auflösung, Länge und Bildindex – ans Dateiende, hinter die Rohdaten. Wer eine
 * Vorschau bauen will (Discord etwa) lädt nur den Dateianfang, findet dort keine
 * Metadaten und zeigt statt eines Players nur einen Link.
 *
 * Dieses Modul schiebt den Block nach vorne. Neu kodiert wird nichts: nur die
 * paar Kilobyte des moov-Blocks werden umgeschrieben, die Rohdaten werden als
 * Blob-Ausschnitt durchgereicht und nie in den Arbeitsspeicher geladen.
 *
 * Der Haken beim Verschieben: im moov stehen absolute Byte-Positionen (stco für
 * 32 Bit, co64 für 64 Bit), die auf die Rohdaten zeigen. Rückt moov nach vorne,
 * verschieben sich diese Daten um genau die Länge des moov-Blocks – jede
 * Position muss also mitkorrigiert werden. Genau das tut qt-faststart, nur eben
 * hier im Browser.
 *
 * Fehlschläge sind nie fatal: dann kommt die unveränderte Datei zurück.
 */

// Atome, in die hineingestiegen werden muss, um an stco/co64 zu kommen.
// Der Pfad lautet moov > trak > mdia > minf > stbl > stco.
const FS_CONTAINER = new Set(["moov", "trak", "mdia", "minf", "stbl", "edts"]);

// Über dieser Größe wird der moov-Block nicht mehr in den Speicher geladen.
// Echte moov-Blöcke liegen bei wenigen hundert Kilobyte; alles darüber deutet
// auf eine Datei hin, die wir besser nicht anfassen.
const FS_MOOV_MAX = 64 * 1024 * 1024;

/** Liest den Kopf des Atoms an Position `pos`. Liefert null, wenn er unbrauchbar ist. */
async function fsAtomKopf(blob, pos) {
  const buf = await blob.slice(pos, pos + 16).arrayBuffer();
  if (buf.byteLength < 8) return null;

  const dv = new DataView(buf);
  const typ = String.fromCharCode(dv.getUint8(4), dv.getUint8(5), dv.getUint8(6), dv.getUint8(7));
  let size = dv.getUint32(0);
  let kopf = 8;

  if (size === 1) {
    // Erweiterte 64-Bit-Länge. Number genügt: Blobs bleiben weit unter 2^53.
    if (buf.byteLength < 16) return null;
    size = Number(dv.getBigUint64(8));
    kopf = 16;
  } else if (size === 0) {
    size = blob.size - pos;   // läuft bis zum Dateiende
  }

  if (size < kopf || pos + size > blob.size) return null;
  return { typ, size, kopf, start: pos };
}

/** Liest die Kette der obersten Atome. Deckt sie die Datei nicht lückenlos ab, ist sie für uns unbrauchbar. */
async function fsTopLevel(blob) {
  const atome = [];
  let pos = 0;
  while (pos < blob.size) {
    const a = await fsAtomKopf(blob, pos);
    if (!a) return null;
    atome.push(a);
    pos += a.size;
  }
  return pos === blob.size ? atome : null;
}

/**
 * Addiert `delta` auf jede Rohdaten-Position im moov-Puffer.
 *
 * Positionen hinter dem alten moov-Anfang bleiben unangetastet: was schon hinter
 * moov lag, behält seine Adresse, weil moov ja von dort verschwindet. Liefert
 * die Anzahl der korrigierten Einträge.
 */
function fsKorrigiereOffsets(buf, moovKopf, moovStart, delta) {
  const dv = new DataView(buf);
  const grenze = BigInt(moovStart);
  const delta64 = BigInt(delta);
  let korrigiert = 0;

  function gehe(von, bis) {
    let p = von;
    while (p + 8 <= bis) {
      const typ = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
      let size = dv.getUint32(p);
      let kopf = 8;

      if (size === 1) {
        if (p + 16 > bis) return;
        size = Number(dv.getBigUint64(p + 8));
        kopf = 16;
      } else if (size === 0) {
        size = bis - p;
      }
      if (size < kopf || p + size > bis) return;   // kaputt – hier abbrechen

      if (typ === "stco" || typ === "co64") {
        // Aufbau: version(1) flags(3) anzahl(4) dann die Positionen
        const tabelle = p + kopf + 4;
        if (tabelle + 4 > bis) return;
        const anzahl = dv.getUint32(tabelle);
        const breite = typ === "stco" ? 4 : 8;
        let q = tabelle + 4;
        if (q + anzahl * breite > p + size) return;   // Tabelle passt nicht ins Atom

        for (let i = 0; i < anzahl; i++, q += breite) {
          if (breite === 4) {
            const o = dv.getUint32(q);
            if (o < moovStart) dv.setUint32(q, o + delta);
          } else {
            const o = dv.getBigUint64(q);
            if (o < grenze) dv.setBigUint64(q, o + delta64);
          }
          korrigiert++;
        }
      } else if (FS_CONTAINER.has(typ)) {
        gehe(p + kopf, p + size);
      }

      p += size;
    }
  }

  gehe(moovKopf, buf.byteLength);
  return korrigiert;
}

// Codecs, die kein Browser und damit auch kein Discord-Player abspielen kann.
// Samsung-Handys nehmen ab Werk oft in H.265 auf ("Videos mit hoher Effizienz").
const FS_CODECS_OHNE_PLAYER = ["hvc1", "hev1", "dvh1", "dvhe"];

/** Liest die Codec-Kennungen aus dem moov-Block. Leeres Feld, wenn nichts lesbar ist. */
async function mp4Codecs(datei) {
  const atome = await fsTopLevel(datei);
  if (!atome) return [];
  const moov = atome.find((a) => a.typ === "moov");
  if (!moov || moov.size > FS_MOOV_MAX) return [];

  const buf = await datei.slice(moov.start, moov.start + moov.size).arrayBuffer();
  const dv = new DataView(buf);
  const codecs = [];

  function gehe(von, bis) {
    let p = von;
    while (p + 8 <= bis) {
      const typ = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
      let size = dv.getUint32(p);
      let kopf = 8;
      if (size === 1) {
        if (p + 16 > bis) return;
        size = Number(dv.getBigUint64(p + 8));
        kopf = 16;
      } else if (size === 0) {
        size = bis - p;
      }
      if (size < kopf || p + size > bis) return;

      if (typ === "stsd") {
        // version(1) flags(3) anzahl(4), dann je Eintrag: groesse(4) code(4)
        const anzahl = dv.getUint32(p + kopf + 4);
        let q = p + kopf + 8;
        for (let i = 0; i < anzahl && q + 8 <= p + size; i++) {
          codecs.push(String.fromCharCode(dv.getUint8(q + 4), dv.getUint8(q + 5), dv.getUint8(q + 6), dv.getUint8(q + 7)));
          const eintrag = dv.getUint32(q);
          if (eintrag < 8) break;
          q += eintrag;
        }
      } else if (FS_CONTAINER.has(typ)) {
        gehe(p + kopf, p + size);
      }
      p += size;
    }
  }

  gehe(moov.kopf, buf.byteLength);
  return codecs;
}

/** Trifft zu, wenn das Video in einem Codec vorliegt, den Player nicht anzeigen können. */
function mp4OhnePlayer(codecs) {
  return codecs.some((c) => FS_CODECS_OHNE_PLAYER.includes(c.toLowerCase()));
}

/**
 * Bereitet eine MP4-Datei für Vorschauen vor.
 *
 * Liefert { file, veraendert, grund }. `file` ist im Zweifel die Originaldatei –
 * ein Upload darf an dieser Optimierung nie scheitern.
 */
async function mp4Faststart(datei) {
  const unveraendert = (grund) => ({ file: datei, veraendert: false, grund });

  const atome = await fsTopLevel(datei);
  if (!atome || !atome.length) return unveraendert("kein durchgehender MP4-Aufbau");
  if (atome[0].typ !== "ftyp") return unveraendert("kein ftyp am Dateianfang");

  const moovNr = atome.findIndex((a) => a.typ === "moov");
  const mdatNr = atome.findIndex((a) => a.typ === "mdat");
  if (moovNr < 0) return unveraendert("kein moov gefunden");
  if (mdatNr < 0) return unveraendert("kein mdat gefunden");
  if (moovNr < mdatNr) return unveraendert("moov liegt bereits vorne");

  const moov = atome[moovNr];
  if (moov.size > FS_MOOV_MAX) return unveraendert("moov zu groß");

  const buf = await datei.slice(moov.start, moov.start + moov.size).arrayBuffer();
  const korrigiert = fsKorrigiereOffsets(buf, moov.kopf, moov.start, moov.size);
  if (!korrigiert) return unveraendert("keine Positionstabellen gefunden");

  // Neuer Aufbau: ftyp, dann moov, dann der Rest in alter Reihenfolge.
  const ftyp = atome[0];
  const teile = [datei.slice(0, ftyp.size), buf];
  for (let i = 1; i < atome.length; i++) {
    if (i === moovNr) continue;
    teile.push(datei.slice(atome[i].start, atome[i].start + atome[i].size));
  }

  const neu = new File(teile, datei.name, {
    type: datei.type || "video/mp4",
    lastModified: datei.lastModified,
  });

  // Sicherheitsnetz: es wurde nur umsortiert, die Länge muss stimmen.
  if (neu.size !== datei.size) return unveraendert("Länge weicht ab – verworfen");

  return { file: neu, veraendert: true, grund: `${korrigiert} Positionen korrigiert` };
}
