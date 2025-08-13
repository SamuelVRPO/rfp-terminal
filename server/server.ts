// server/server.ts
import Fastify from "fastify";
import { Client } from "pg";
import ky from "ky";

// ====== Config ======
const OLLAMA = ky.create({ 
    prefixUrl: "http://localhost:11434",
    timeout: 120_000 // 120s for local generation
 });
const DB_URL = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/rfp";

// ====== Helpers ======
async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    const res = await OLLAMA.post("api/embeddings", {
      json: { model: "nomic-embed-text", prompt: t },
    }).json<{ embedding: number[] }>();
    out.push(res.embedding);
  }
  return out;
}

async function generate(system: string, prompt: string): Promise<string> {
  const res = await OLLAMA.post("api/generate", {
    json: {
      model: "llama3.1:8b-instruct-q4_K_M",
      prompt: `<|system|>\n${system}\n<|user|>\n${prompt}\n<|assistant|>\n`,
      stream: false,
      options: { temperature: 0.2, num_predict: 300, stop: ["\n\n\n"] },
    },
  }).json<{ response: string }>();
  return res.response;
}

// serialize a JS number[] into a pgvector literal string
const toVec = (v: number[]) => `[${v.join(",")}]`;

function logAndReplyErr(reply: any, err: any) {
  console.error("Route error:", {
    name: err?.name,
    message: err?.message,
    code: err?.code,
    detail: err?.detail,
    stack: err?.stack,
  });
  reply.code(500).send({ error: err?.message, code: err?.code, detail: err?.detail });
}

// ====== Server startup ======
async function start() {
  const app = Fastify({ logger: true });
  const pg = new Client({ connectionString: DB_URL });
  await pg.connect();

  // ---- Route: Ingest Q&A (Step A: question-as-chunk-0) ----
  app.post("/ingest/chunks", async (req, reply) => {
    try {
      const body = req.body as {
        qa: {
          id: string;
          question: string;
          answer: string;
          meta?: {
            product?: string;
            audience?: string;          // 'pension' | 'foundation' | 'consultant' | null
            jurisdiction?: string;
            tags?: string[];
          };
        };
        chunks: string[];               // answer chunks (we'll prepend the question)
      };

      const { qa, chunks } = body;

      // Upsert qa_units (no 'strategy' column)
      await pg.query(
        `INSERT INTO qa_units (id, question, answer, product, audience, jurisdiction, tags, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,true)
         ON CONFLICT (id) DO UPDATE SET
           question=EXCLUDED.question,
           answer=EXCLUDED.answer,
           product=EXCLUDED.product,
           audience=EXCLUDED.audience,
           jurisdiction=EXCLUDED.jurisdiction,
           tags=EXCLUDED.tags`,
        [
          qa.id,
          qa.question,
          qa.answer,
          qa.meta?.product ?? null,
          qa.meta?.audience ? qa.meta.audience.toLowerCase() : null,
          qa.meta?.jurisdiction ?? null,
          qa.meta?.tags ?? null,
        ]
      );

      // Prepend the question as chunk 0 to improve recall
      const allChunks = [`Q: ${qa.question}`, ...chunks];

      // Embed all chunks and upsert into qa_embeddings
      const vecs = await embed(allChunks);
      for (let i = 0; i < allChunks.length; i++) {
        await pg.query(
          `INSERT INTO qa_embeddings (qa_id, chunk_id, text, embedding)
           VALUES ($1::uuid, $2::int, $3::text, $4::vector)
           ON CONFLICT (qa_id, chunk_id)
           DO UPDATE SET text=EXCLUDED.text, embedding=EXCLUDED.embedding`,
          [qa.id, i, allChunks[i], toVec(vecs[i])]
        );
      }

      reply.send({ ok: true, chunks: allChunks.length });
    } catch (err: any) {
      logAndReplyErr(reply, err);
    }
  });

  // ---- Route: Suggest answer (Step B: cosine-only retrieval) ----
  app.post("/rfp/answer:suggest", async (req, reply) => {
    try {
      const { question, filters } = (req.body as any) ?? {};
      const [qvec] = await embed([question]);
      const qvecLit = toVec(qvec);

      // Cosine-only (pgvector <=> with normalized embeddings behaves as cosine distance)
      const res = await pg.query(
        `
        SELECT e.qa_id, e.chunk_id, e.text,
               1 - (e.embedding <=> $1::vector) AS cosine_sim
        FROM qa_embeddings e
        JOIN qa_units u ON u.id = e.qa_id
        WHERE u.is_active
          AND ($2::text IS NULL OR u.product = $2)
          AND ($3::text IS NULL OR u.jurisdiction = $3)
        ORDER BY e.embedding <=> $1::vector
        LIMIT 6
        `,
        [qvecLit, filters?.product ?? null, filters?.jurisdiction ?? null]
      );

      const rows = res.rows as { qa_id: string; chunk_id: number; text: string; cosine_sim: number }[];
      app.log.info({ rows: rows.length }, "cosine search results");

      if (rows.length === 0) {
        return reply.send({
          draft: "We do not have material on this in our knowledge base. Please provide guidance or upload relevant content.",
          citations: [],
        });
      }

      const topRows = rows.slice(0, 4);

      // (Optional) facts injection demo
      const facts = await pg.query(
        `SELECT key, value, as_of FROM firm_facts WHERE key IN ('AUM_USD_BILLIONS','TEAM_COUNT','INCEPTION_DATE')`
      );
      const factsStr = facts.rows
        .map(
          (r: any) =>
            `- ${r.key}: ${r.value}${r.as_of ? ` (as of ${r.as_of.toISOString().slice(0, 10)})` : ""}`
        )
        .join("\n");

      const system = `You are the firm's RFP writer. Use ONLY the provided context and facts.
Do not invent numbers. If missing, say "We do not disclose this." Keep tone professional.
Include bracketed citations like [1], [2].`;

      const context = topRows.map((r, i) => `[${i + 1}] ${r.text}`).join("\n\n");

      const prompt = `Question: ${question}

Context:
${context}

Facts (authoritative):
${factsStr}

Write a concise answer (120–220 words) with citations.`;

      const draft = await generate(system, prompt);

      reply.send({
        draft,
        citations: topRows.map((r, i) => ({
          rank: i + 1,
          qa_id: r.qa_id,
          chunk_id: r.chunk_id,
          score: r.cosine_sim,
        })),
      });
    } catch (err: any) {
      logAndReplyErr(reply, err);
    }
  });

  // ---- Route: Debug search (Step C: inspect retrieval without LLM) ----
  app.post("/debug/search", async (req, reply) => {
    try {
      const { question, filters } = (req.body as any) ?? {};
      const [qvec] = await embed([question]);
      const qvecLit = toVec(qvec);

      const res = await pg.query(
        `
        SELECT e.qa_id, e.chunk_id, LEFT(e.text, 200) AS snippet,
               1 - (e.embedding <=> $1::vector) AS cosine_sim
        FROM qa_embeddings e
        JOIN qa_units u ON u.id = e.qa_id
        WHERE u.is_active
          AND ($2::text IS NULL OR u.product = $2)
          AND ($3::text IS NULL OR u.jurisdiction = $3)
        ORDER BY e.embedding <=> $1::vector
        LIMIT 10
        `,
        [qvecLit, filters?.product ?? null, filters?.jurisdiction ?? null]
      );

      reply.send({ hits: res.rows });
    } catch (err: any) {
      logAndReplyErr(reply, err);
    }
  });

  await app.listen({ port: 8080 });
  app.log.info("API listening on http://localhost:8080");
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
