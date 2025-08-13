import ky from "ky";
import { v4 as uuidv4 } from "uuid";
import fs from "node:fs/promises";

const API = "http://localhost:8080";

// tiny word-based chunker (≈300–800 tokens) with overlap
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
  // Usage:
  // node add_qa.mjs "Question here" "Answer here" --product "Core Bond" --jurisdiction "US" --tags "risk,duration"
  // or:
  // node add_qa.mjs "Question here" --answer-file ./answer.txt --product "Core Bond"
  const args = process.argv.slice(2);
  if (!args.length) {
    console.log(`Usage:
  node add_qa.mjs "Question" "Answer"
  node add_qa.mjs "Question" --answer-file ./answer.txt --product "Core Bond" --jurisdiction "US" --tags "risk,duration"`);
    process.exit(1);
  }

  const question = args[0];
  let answer = "";
  let product, strategy, audience, jurisdiction, tags;

  // parse rest
  for (let i = 1; i < args.length; i++) {
    const k = args[i];
    const v = args[i + 1];
    if (k === "--answer-file") { answer = await fs.readFile(v, "utf8"); i++; }
    else if (!answer && !k.startsWith("--")) { answer = k; }
    else if (k === "--product") { product = v; i++; }
    else if (k === "--strategy") { strategy = v; i++; }
    else if (k === "--audience") { audience = v; i++; }
    else if (k === "--jurisdiction") { jurisdiction = v; i++; }
    else if (k === "--tags") { tags = v.split(",").map(s => s.trim()).filter(Boolean); i++; }
  }

  if (!answer) {
    console.error("No answer provided (use a second positional arg or --answer-file).");
    process.exit(1);
  }

  const id = uuidv4();
  const chunks = chunkAnswer(answer);

  const payload = {
    qa: {
      id,
      question,
      answer,
      meta: { product, strategy, audience, jurisdiction, tags }
    },
    chunks
  };

  const res = await ky.post(`${API}/ingest/chunks`, { json: payload }).json();
  console.log("Inserted:", id, res);
}

main().catch(e => { console.error(e); process.exit(1); });
