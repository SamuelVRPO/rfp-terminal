import fs from "node:fs/promises";
import ky from "ky";
import { v4 as uuidv4 } from "uuid";

const API = "http://localhost:8080";


function parseCSV(text) {
  // super-light CSV parser (handles quoted fields with commas)
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines.shift().split(",").map(h => h.trim());
  const rows = [];
  for (const line of lines) {
    const cols = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cols.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    cols.push(cur.trim());
    const obj = Object.fromEntries(headers.map((h, i) => [h, cols[i] ?? ""]));
    rows.push(obj);
  }
  return rows;
}

function chunkAnswer(answer, maxWords = 600, overlap = 90) {
  const words = answer.split(/\s+/);
  const chunks = [];
  let i = 0;
  while (i < words.length) {
    const block = words.slice(i, i + maxWords).join(" ").trim();
    if (block) chunks.push(block);
    i += Math.max(1, maxWords - overlap);
  }
  return chunks.length ? chunks : [answer];
}

async function main() {
  const csvPath = process.argv[2] || "qas.csv";
  const text = await fs.readFile(csvPath, "utf8");
  const rows = parseCSV(text);

  for (const r of rows) {
    const id = uuidv4();
    const question = r.question;
    const answer = r.answer;
    // normalize audience to the allowed set (case-insensitive)
    const allowed = new Set(["pension","foundation","consultant"]);
    let audience = r.audience ? String(r.audience).trim().toLowerCase() : null;
    if (audience && !allowed.has(audience)) {
        console.warn(`Row with question "${r.question}" has invalid audience "${r.audience}". Setting to NULL.`);
        audience = null;
    }
    const meta = {
        product: r.product || null,
        audience,                                // enum or null
        jurisdiction: r.jurisdiction || null,
        tags: (r.tags || "").split(",").map(s => s.trim()).filter(Boolean)
    };
    const chunks = chunkAnswer(answer);

    const payload = { qa: { id, question, answer, meta }, chunks };
    const resp = await ky.post("http://localhost:8080/ingest/chunks", { json: payload }).json();
    console.log("Inserted:", id, resp);
  }
}

main().catch(e => { console.error(e); process.exit(1); });