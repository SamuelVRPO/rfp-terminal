import type { FastifyInstance } from "fastify";
import { query } from "../db.ts";
import { embed, toVec } from "../clients/ollama.ts";

export async function registerIngestRoutes(app: FastifyInstance) {
  app.post("/ingest/chunks", {
    schema: {
      body: {
        type: "object",
        required: ["qa", "chunks"],
        properties: {
          qa: {
            type: "object",
            required: ["id", "question", "answer"],
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              answer: { type: "string" },
              meta: {
                type: "object",
                additionalProperties: true,
                properties: {
                  product: { type: ["string", "null"] },
                  audience: { type: ["string", "null"], enum: ["pension", "foundation", "consultant", null] },
                  jurisdiction: { type: ["string", "null"] },
                  tags: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
          chunks: { type: "array", items: { type: "string" } },
        },
      },
    },
  }, async (req, reply) => {
    const body = req.body as {
      qa: {
        id: string;
        question: string;
        answer: string;
        meta?: {
          product?: string | null;
          audience?: string | null;
          jurisdiction?: string | null;
          tags?: string[] | null;
        };
      };
      chunks: string[];
    };

    const { qa, chunks } = body;

    await query(
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

    const allChunks = [`Q: ${qa.question}`, ...chunks];
    const vecs = await embed(allChunks);
    for (let i = 0; i < allChunks.length; i++) {
      await query(
        `INSERT INTO qa_embeddings (qa_id, chunk_id, text, embedding)
         VALUES ($1::uuid, $2::int, $3::text, $4::vector)
         ON CONFLICT (qa_id, chunk_id)
         DO UPDATE SET text=EXCLUDED.text, embedding=EXCLUDED.embedding`,
        [qa.id, i, allChunks[i], toVec(vecs[i])]
      );
    }

    reply.send({ ok: true, chunks: allChunks.length });
  });
}

