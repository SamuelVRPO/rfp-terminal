import type { FastifyInstance } from "fastify";
import { query } from "../db.ts";
import { embed, toVec } from "../clients/ollama.ts";

export async function registerDebugRoutes(app: FastifyInstance) {
  app.post("/debug/search", {
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
  });
}

