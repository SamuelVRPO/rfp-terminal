import fs from "node:fs/promises";
import path from "node:path";
import ky from "ky";
import { v4 as uuidv4 } from "uuid";

const API = process.env.API_URL || "http://localhost:8080";

// ---- CLI args parsing (simple) ----
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const [k, v] = tok.slice(2).split("=");
      if (v !== undefined) {
        args[k] = v;
      } else {
        const next = argv[i + 1];
        if (next && !next.startsWith("--")) {
          args[k] = next; i++;
        } else {
          args[k] = true;
        }
      }
    } else {
      args._.push(tok);
    }
  }
  return args;
}

// ---- Utilities ----
function normalizeWhitespace(text) {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, " ")
    // de-hyphenate words broken across lines: e.g., "inves-\n\ntment" -> "investment"
    .replace(/-\n(?=[a-z])/g, "")
    .replace(/\u00A0/g, " ") // non-breaking space
    .replace(/[ \t]+/g, " ")
    .trim();
}

function splitParagraphs(text) {
  // Prefer splitting on 2+ newlines; if that yields a single blob,
  // fall back to splitting on any newline (common in PDF extraction).
  const byDouble = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (byDouble.length > 1) return byDouble;
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean);
}

function stripQuestionPrefix(s) {
  // Remove bullets, numbering, or Q: style prefixes
  return s
    .replace(/^\s*[-•–—]\s+/, "")
    .replace(/^\s*(?:Q(?:uestion)?\s*[:\.\-–—\)\]]\s*)/i, "")
    .replace(/^\s*\(?\d{1,3}[)\.:]\s+/, "")
    .trim();
}

function looksLikeQuestion(para) {
  const p = para.trim();
  if (!p) return false;
  // Allow a leading bullet before patterns
  const pb = p.replace(/^\s*[-•–—]\s+/, "");
  // Q: or Question: with various punctuations
  if (/^\s*(?:Q(?:uestion)?)\s*[:\.\-–—\)\]]\s*/i.test(pb)) return true;
  // numbered (1) or 1. or 1:
  if (/^\s*\(?\d{1,3}[)\.:]\s+/.test(pb)) return true;
  // end with a question mark within a reasonable length
  if (pb.length <= 240 && /\?$/.test(pb)) return true;
  return false;
}

function isLikelyNoise(para) {
  const p = para.trim();
  // Drop page numbers, solitary numbers, or tiny boilerplate fragments
  if (/^\s*(page\s+\d+(\s+of\s+\d+)?)\s*$/i.test(p)) return true;
  if (/^\s*\d+\s*$/.test(p)) return true;
  if (p.length <= 3) return true;
  return false;
}

function extractQAsFromParagraphs(paragraphs) {
  const qas = [];
  let curQ = null;
  let curA = [];

  const flush = () => {
    if (curQ) {
      const answer = curA.join("\n\n").trim();
      if (answer) qas.push({ question: curQ, answer });
    }
    curQ = null; curA = [];
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (isLikelyNoise(p)) continue;

    if (looksLikeQuestion(p)) {
      // finalize previous Q&A if present
      flush();
      curQ = stripQuestionPrefix(p);
      continue;
    }

    // otherwise, belongs to current answer if any
    if (curQ) {
      curA.push(p);
    }
  }
  flush();
  return qas;
}

function chunkAnswer(answer, targetWords = 100, overlap = 20) {
  const words = answer.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks = [];
  let i = 0;
  const step = Math.max(1, targetWords - overlap);
  while (i < words.length) {
    const block = words.slice(i, i + targetWords).join(" ").trim();
    if (block) chunks.push(block);
    i += step;
  }
  return chunks.length ? chunks : [answer];
}

async function readTextFromFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".txt") {
    return await fs.readFile(filePath, "utf8");
  }
  throw new Error(`Unsupported file extension: ${ext}. Only .txt is supported.`);
}

function normalizeAudience(aud) {
  if (!aud) return null;
  const v = String(aud).trim().toLowerCase();
  const allowed = new Set(["pension", "foundation", "consultant"]);
  return allowed.has(v) ? v : null;
}

function summarize(text, max = 24) {
  const words = text.split(/\s+/).filter(Boolean);
  const head = words.slice(0, max).join(" ");
  return words.length > max ? head + " …" : head;
}

async function main() {
  const argv = parseArgs(process.argv.slice(2));
  const file = argv._[0];
  if (!file) {
    console.error("Usage: node server/ingest_doc.mjs <file.txt> [--product=...] [--audience=...] [--jurisdiction=...] [--tags=a,b] [--dry-run] [--no-confirm] [--out=extracted.json] [--target-words=100] [--overlap=20] [--preview=summary|full]");
    process.exit(1);
  }

  const targetWords = argv["target-words"] ? Number(argv["target-words"]) : 100;
  const overlap = argv["overlap"] ? Number(argv["overlap"]) : 20;
  const previewMode = (argv["preview"] || "summary").toString();
  const meta = {
    product: argv.product || null,
    audience: normalizeAudience(argv.audience),
    jurisdiction: argv.jurisdiction || null,
    tags: (argv.tags || "").split(",").map(s => s.trim()).filter(Boolean),
  };

  const raw = await readTextFromFile(file);
  const normalized = normalizeWhitespace(raw);

  // Split into paras and extract QAs
  const paragraphs = splitParagraphs(normalized);
  const qas = extractQAsFromParagraphs(paragraphs);

  if (qas.length === 0) {
    console.error("No Q&As detected. You may try providing a .txt export or check document formatting.");
    process.exit(1);
  }

  // Chunk answers ~100 words
  const prepared = qas.map(({ question, answer }) => ({
    question: question.trim(),
    answer: answer.trim(),
    chunks: chunkAnswer(answer, targetWords, overlap),
  }));

  // Optional JSON dump
  if (argv.out) {
    const out = {
      file: path.resolve(file),
      meta,
      targetWords,
      overlap,
      qas: prepared,
    };
    await fs.writeFile(argv.out, JSON.stringify(out, null, 2), "utf8");
    console.log(`Wrote preview to ${argv.out}`);
  }

  // Console preview
  console.log(`\nExtracted ${prepared.length} Q&As from ${path.basename(file)} (targetWords=${targetWords}, overlap=${overlap})`);
  for (let i = 0; i < prepared.length; i++) {
    const qa = prepared[i];
    console.log(`\n[${i + 1}] Q: ${qa.question}`);
    console.log(`   A: ${summarize(qa.answer, 30)}`);
    console.log(`   Chunks: ${qa.chunks.length}`);
    if (previewMode === "full") {
      qa.chunks.forEach((c, j) => {
        const wc = c.split(/\s+/).filter(Boolean).length;
        console.log(`     - #${j} (${wc} words): ${summarize(c, 36)}`);
      });
    }
  }

  // Confirmation
  const dryRun = !!argv["dry-run"];
  const needConfirm = !argv["no-confirm"];
  if (dryRun) {
    console.log("\nDry run complete. No data posted.");
    process.exit(0);
  }

  let proceed = true;
  if (needConfirm) {
    process.stdout.write("\nProceed to ingest all chunks? [y/N] ");
    proceed = await new Promise((resolve) => {
      process.stdin.setEncoding("utf8");
      process.stdin.once("data", (d) => {
        const ans = String(d).trim().toLowerCase();
        resolve(ans === "y" || ans === "yes");
      });
    });
    // Ensure stdin doesn't keep the event loop alive
    if (typeof process.stdin.pause === "function") {
      try { process.stdin.pause(); } catch {}
    }
  }

  if (!proceed) {
    console.log("Aborted by user.");
    process.exit(0);
  }

  // Post to API
  for (const qa of prepared) {
    const id = uuidv4();
    const payload = { qa: { id, question: qa.question, answer: qa.answer, meta }, chunks: qa.chunks };
    const resp = await ky.post(`${API}/ingest/chunks`, { json: payload }).json();
    console.log(`Inserted ${id}:`, resp);
  }

  console.log("All chunks ingested.");
  // Explicitly terminate to avoid lingering handles (e.g., keep-alive sockets)
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
