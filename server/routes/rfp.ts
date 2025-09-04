import type { FastifyInstance } from "fastify";
import { query } from "../db.ts";
import { embed, generate, toVec } from "../clients/ollama.ts";
import { rerank } from "../services/reranker.ts";

export async function registerRfpRoutes(app: FastifyInstance) {
  app.post("/rfp/answer:suggest", {
    schema: {
      body: {
        type: "object",
        required: ["question"],
        properties: {
          question: { type: "string" },
          filters: {
            type: "object",
            additionalProperties: true,
            properties: {
              product: { type: ["string", "null"] },
              jurisdiction: { type: ["string", "null"] },
            },
          },
        },
      },
    },
  }, async (req, reply) => {
    const { question, filters } = (req.body as any) ?? {};
    const [qvec] = await embed([question]);
    const qvecLit = toVec(qvec);

    const res = await query(
      `
      SELECT e.qa_id, e.chunk_id, e.text,
             1 - (e.embedding <=> $1::vector) AS cosine_sim
      FROM qa_embeddings e
      JOIN qa_units u ON u.id = e.qa_id
      WHERE u.is_active
        AND ($2::text IS NULL OR u.product = $2)
        AND ($3::text IS NULL OR u.jurisdiction = $3)
      ORDER BY e.embedding <=> $1::vector
      LIMIT 20
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

    const answerCandidates = rows.filter((r) => r.chunk_id !== 0);
    const pool = answerCandidates.length ? answerCandidates : rows;

    let topRows: typeof pool = [];
    const order = await rerank(question, pool.map((r) => r.text));
    topRows = order.slice(0, 4).map((i) => pool[i]);
    if (topRows.length === 0) {
      topRows = rows.slice(0, 4);
    }

    const facts = await query(
      `SELECT key, value, as_of FROM firm_facts WHERE key IN ('AUM_USD_BILLIONS','TEAM_COUNT','INCEPTION_DATE')`
    );
    const factsStr = facts.rows
      .map(
        (r: any) => `- ${r.key}: ${r.value}${r.as_of ? ` (as of ${r.as_of.toISOString().slice(0, 10)})` : ""}`
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
  });
}

