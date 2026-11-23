// Shared logic for the announcement list: validation and generation of
// api/<variant>/announcement_list_v1.json from src/announcements.json.
// Used by both scripts/build.js (Node) and editor/index.html (browser),
// so the two always produce byte-identical output.
//
// Written as a plain script (no import/export) so the editor also works when
// opened straight from disk (file://), where browsers block module imports.
// It sets globalThis.AnnouncementsLib.

(function () {
  "use strict";

  const VARIANTS = ["debug", "qa", "prelive", "release"];
  const LANGS = ["en", "ms", "in"];
  const LANG_NAMES = { en: "English", ms: "Malay", in: "Indonesian" };

  const SOURCE_PATH = "src/announcements.json";
  const outputPath = (variant) => `api/${variant}/announcement_list_v1.json`;

  // 2611019 -> "v2026.11.019"
  function versionLabel(code) {
    const s = String(code);
    if (!/^\d{7}$/.test(s)) return `#${s}`;
    return `v20${s.slice(0, 2)}.${s.slice(2, 4)}.${s.slice(4)}`;
  }

  // "v2026.11.019" / "2026.11.19" / "2611019" -> 2611019 (or null)
  function parseVersion(text) {
    const t = String(text).trim();
    if (/^\d{7}$/.test(t)) return Number(t);
    const m = t.match(/^v?(?:20)?(\d{2})\.(\d{1,2})\.(\d{1,3})$/i);
    if (!m) return null;
    return Number(m[1] + m[2].padStart(2, "0") + m[3].padStart(3, "0"));
  }

  const isText = (v) => typeof v === "string" && v.trim() !== "";

  // Returns { errors: [{index, id, message}], warnings: [...] }.
  // Any error means the output must not be generated.
  function validate(source) {
    const errors = [];
    const warnings = [];
    const add = (list, index, id, message) => list.push({ index, id, message });

    if (!source || typeof source !== "object" || !Array.isArray(source.announcements)) {
      add(errors, -1, null, "Source must be an object with an \"announcements\" array.");
      return { errors, warnings };
    }

    const seen = new Map();
    source.announcements.forEach((a, i) => {
      const id = a && typeof a.id === "string" ? a.id : null;
      const err = (m) => add(errors, i, id, m);
      const warn = (m) => add(warnings, i, id, m);

      if (!a || typeof a !== "object") return err("Entry is not an object.");

      if (!isText(a.id)) err("Missing \"id\".");
      else seen.set(a.id, [...(seen.get(a.id) || []), i]);
      if (isText(a.id) && !/^[A-Za-z0-9_.-]+$/.test(a.id)) warn("Id should only use letters, digits, _ . -");

      if (!Number.isInteger(a.versionCode) || a.versionCode <= 0) err("\"versionCode\" must be a positive whole number, e.g. 2611019.");
      else if (!/^\d{7}$/.test(String(a.versionCode))) warn(`versionCode ${a.versionCode} is not the usual 7-digit form (YYMMNNN).`);

      if (!Array.isArray(a.variants)) err("\"variants\" must be a list, e.g. [\"debug\", \"qa\"].");
      else {
        a.variants.filter((v) => !VARIANTS.includes(v)).forEach((v) => err(`Unknown variant "${v}".`));
        if (new Set(a.variants).size !== a.variants.length) err("A variant is listed twice.");
        if (a.variants.length === 0) warn("Not published to any variant.");
      }

      for (const field of ["title", "body"]) {
        const t = a[field];
        if (!t || typeof t !== "object") { err(`Missing "${field}".`); continue; }
        if (!isText(t.en)) err(`English ${field} is required (the app falls back to it).`);
        for (const k of Object.keys(t)) {
          if (!LANGS.includes(k)) warn(`${field} has unknown language "${k}" (expected ${LANGS.join(", ")}).`);
          else if (typeof t[k] !== "string") err(`${field}.${k} must be text.`);
        }
        for (const k of LANGS.slice(1)) {
          if (!isText(t[k])) warn(`${LANG_NAMES[k]} ${field} missing - users see English.`);
        }
      }
    });

    for (const [id, at] of seen) {
      if (at.length < 2) continue;
      for (const i of at) {
        const others = at.filter((j) => j !== i).map((j) => `#${j + 1}`).join(", ");
        add(errors, i, id, `Duplicate id (also entry ${others}). Ids must be unique and never reused.`);
      }
    }

    return { errors, warnings };
  }

  function texts(t) {
    const out = {};
    for (const k of LANGS) if (isText(t[k])) out[k] = t[k];
    return out;
  }

  // Returns { [variant]: fileContentString }. Throws if the source has errors.
  // Entries keep their order from the source file (the app relies on it
  // within one version). Only the fields the app reads are written.
  function generate(source) {
    const { errors } = validate(source);
    if (errors.length) throw new Error(`Source has ${errors.length} error(s); fix them first.`);
    const files = {};
    for (const variant of VARIANTS) {
      const announcements = source.announcements
        .filter((a) => a.variants.includes(variant))
        .map((a) => ({ id: a.id, versionCode: a.versionCode, title: texts(a.title), body: texts(a.body) }));
      files[variant] = JSON.stringify({ announcements }, null, 2) + "\n";
    }
    return files;
  }

  // Source file text, in a stable format so diffs stay small.
  function serializeSource(source) {
    const announcements = source.announcements.map((a) => ({
      id: a.id,
      versionCode: a.versionCode,
      variants: VARIANTS.filter((v) => a.variants.includes(v)),
      title: texts(a.title),
      body: texts(a.body),
    }));
    return JSON.stringify({ announcements }, null, 2) + "\n";
  }

  globalThis.AnnouncementsLib = {
    VARIANTS, LANGS, LANG_NAMES, SOURCE_PATH, outputPath, versionLabel, parseVersion, validate, generate, serializeSource,
  };
})();
