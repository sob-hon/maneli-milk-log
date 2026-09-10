import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { createClient } from "@supabase/supabase-js";

const inputPath = process.argv.find((argument) => argument.endsWith(".json"));
const shouldCommit = process.argv.includes("--commit");

if (!inputPath) {
  console.error(
    "Usage: npm run import:feedings -- private/feedings.json [--commit]",
  );
  process.exit(1);
}

const requiredEnvironment = [
  "VITE_SUPABASE_URL",
  "SUPABASE_SECRET_KEY",
  "MANELI_HOUSEHOLD_ID",
  "MANELI_BABY_ID",
  "MANELI_CREATED_BY_USER_ID",
];

const missingEnvironment = requiredEnvironment.filter(
  (name) => !process.env[name],
);
if (shouldCommit && missingEnvironment.length) {
  console.error(`Missing environment values: ${missingEnvironment.join(", ")}`);
  process.exit(1);
}

const source = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(source)) {
  console.error("The import file must contain a JSON array.");
  process.exit(1);
}

const normalized = [];
const issues = [];
const seen = new Set();

for (const [index, item] of source.entries()) {
  const amountMl = Number(item.amount_ml ?? item.amountMl);
  const date = new Date(item.fed_at ?? item.fedAt);
  if (!Number.isInteger(amountMl) || amountMl < 1 || amountMl > 1000) {
    issues.push(`Row ${index + 1}: invalid amount`);
    continue;
  }
  if (Number.isNaN(date.getTime())) {
    issues.push(`Row ${index + 1}: invalid or missing date/time`);
    continue;
  }

  const fedAt = date.toISOString();
  const fingerprint = `${fedAt}|${amountMl}`;
  if (seen.has(fingerprint)) {
    issues.push(`Row ${index + 1}: duplicate ${amountMl} ml at ${fedAt}`);
    continue;
  }
  seen.add(fingerprint);

  const digest = createHash("sha256")
    .update(`maneli-feeding|${fingerprint}`)
    .digest("hex");
  const id = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
  normalized.push({
    id,
    household_id: process.env.MANELI_HOUSEHOLD_ID,
    baby_id: process.env.MANELI_BABY_ID,
    amount_ml: amountMl,
    fed_at: fedAt,
    created_by: process.env.MANELI_CREATED_BY_USER_ID,
    created_at: fedAt,
    updated_at: fedAt,
    deleted_at: null,
  });
}

normalized.sort((a, b) => a.fed_at.localeCompare(b.fed_at));
const total = normalized.reduce((sum, item) => sum + item.amount_ml, 0);
console.log("Import preview");
console.log(`Valid records: ${normalized.length}`);
console.log(`Total milk: ${total.toLocaleString()} ml`);
console.log(
  `Date range: ${normalized[0]?.fed_at ?? "—"} to ${normalized.at(-1)?.fed_at ?? "—"}`,
);
console.log(`Issues: ${issues.length}`);
for (const issue of issues) console.log(`- ${issue}`);

if (!shouldCommit) {
  console.log("Dry run only. Add --commit after reviewing this preview.");
  process.exit(issues.length ? 2 : 0);
}

if (issues.length) {
  console.error("Resolve every issue before importing. Nothing was written.");
  process.exit(2);
}

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

for (let index = 0; index < normalized.length; index += 250) {
  const batch = normalized.slice(index, index + 250);
  const { error } = await supabase.from("feedings").upsert(batch);
  if (error) {
    console.error(`Import failed at batch ${index / 250 + 1}: ${error.message}`);
    process.exit(1);
  }
}

console.log(`Imported ${normalized.length} records successfully.`);
