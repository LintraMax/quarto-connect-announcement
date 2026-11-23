// Generates api/<variant>/announcement_list_v1.json from src/announcements.json.
//
//   node scripts/build.js           validate and write the 4 variant files
//   node scripts/build.js --check   validate and fail if the variant files are out of date (used by CI)

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import "./announcements-lib.js";
const { SOURCE_PATH, VARIANTS, outputPath, validate, generate } = globalThis.AnnouncementsLib;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");

let source;
try {
  source = JSON.parse(readFileSync(join(root, SOURCE_PATH), "utf8"));
} catch (e) {
  console.error(`✖ Cannot read ${SOURCE_PATH}: ${e.message}`);
  process.exit(1);
}

const { errors, warnings } = validate(source);
const where = (p) => (p.index >= 0 ? `#${p.index + 1}${p.id ? ` (${p.id})` : ""}: ` : "");
warnings.forEach((w) => console.warn(`⚠ ${where(w)}${w.message}`));
if (errors.length) {
  errors.forEach((e) => console.error(`✖ ${where(e)}${e.message}`));
  console.error(`\n${errors.length} error(s) in ${SOURCE_PATH}. Nothing written.`);
  process.exit(1);
}

const files = generate(source);
let stale = 0;
for (const variant of VARIANTS) {
  const path = join(root, outputPath(variant));
  let current = null;
  try { current = readFileSync(path, "utf8").replace(/\r\n/g, "\n"); } catch {}
  const count = (files[variant].match(/"versionCode"/g) || []).length;
  if (current === files[variant]) {
    console.log(`  ${outputPath(variant)}  up to date (${count})`);
  } else if (check) {
    stale++;
    console.error(`✖ ${outputPath(variant)}  out of date`);
  } else {
    writeFileSync(path, files[variant]);
    console.log(`✔ ${outputPath(variant)}  written (${count})`);
  }
}

if (stale) {
  console.error(`\nThe api/ files do not match ${SOURCE_PATH}. Run "node scripts/build.js" and commit the result.`);
  console.error("(Do not edit api/*/announcement_list_v1.json by hand - edit the source instead.)");
  process.exit(1);
}
