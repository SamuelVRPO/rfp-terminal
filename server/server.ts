import Fastify from "fastify";
import { Client } from "pg";
import ky from "ky";

const OLLAMA = ky.create({ prefixUrl: "http://localhost:11434"});

async function start() {
    const app = Fastify({ logger: true });
    const pg = new Client({
        connectionString: "postgres://postgres:postgres@localhost:5432/rfp",
    });
    await pg.connect();
    
    /** Helpers */
    async function embed(texts: string[]): Promise<number[][]> {
        // Ollama embeddings API: POST /api/embeddings {model, prompt}
        // We'll call one by one to keep it simple; you can batch later
        const out: number[][] = [];
        for (const t of texts) {
            const res: any = await OLLAMA.post("api/embeddings", {
                json: { model: "nomic-embed-text", prompt: t },
            }).json();
            out.push(res.embedding);
        }
        return out;
    }
    
    async function generate(system: string, prompt: string): Promise<string> {
        const res: any = await OLLAMA.post("api/generate", {
            json: {
                model: "llama3.1:8b-instruct-q4_K_M",
                prompt: `<|system|>\n${system}\n<|user|>\n${prompt}\n<|assistant|>\n`,
                stream: false,
                options: { temperature: 0.2, num_predict: 800 },
            },
        }).json();
        return res.response as string;
    }

    // helper to serialize a JS array into a pgvector literal
    const toVec = (v: number[]) => `[${v.join(",")}]`;

    /** ROUTES */
    
    // (1) Ingest: insert qa_units + embed chunks into qa_embeddings
    app.post("/ingest/chunks", async (req, reply) => {
        const body = req.body as {
            qa: {
                id: string;
                question: string;
                answer: string;
                meta?: {
                    product?: string;
                    strategy?: string;
                    audience?: string;
                    jurisdiction?: string;
                    tags?: string[];
                };
            };
            chunks: string[];
        };
    
        const { qa, chunks } = body;
    
        await pg.query(
            `INSERT INTO qa_units (id, question, answer, product, strategy, audience, jurisdiction, tags, is_active)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true)
             ON CONFLICT (id) DO UPDATE SET question=EXCLUDED.question, answer=EXCLUDED.answer,
                product=EXCLUDED.product, strategy=EXCLUDED.strategy, audience=EXCLUDED.audience,
                jurisdiction=EXCLUDED.jurisdiction, tags=EXCLUDED.tags`,
            [
                qa.id,
                qa.question,
                qa.answer,
                qa.meta?.product ?? null,
                qa.meta?.strategy ?? null,
                qa.meta?.audience ?? null,
                qa.meta?.jurisdiction ?? null,
                qa.meta?.tags ?? null,
            ]
        );
    
        const vecs = await embed(chunks);
    
        // bulk insert
        // NOTE: node-postgres doesn’t support vector type natively; pass as array -> cast in SQL
        // pgvector accepts JSON array -> use to_json for parameter then cast ::vector
        for (let i = 0; i < chunks.length; i++) {
            await pg.query(
                `INSERT INTO qa_embeddings (qa_id, chunk_id, text, embedding)
                VALUES ($1::uuid, $2::int, $3::text, $4::vector)
                ON CONFLICT (qa_id, chunk_id)
                DO UPDATE SET text=EXCLUDED.text, embedding=EXCLUDED.embedding`,
                [qa.id, i, chunks[i], toVec(vecs[i])]
            );
        }
    
        reply.send({ ok: true, chunks: chunks.length });
    });
    
    // (2) Suggest answer: vector search + generate
    app.post("/rfp/answer:suggest", async (req, reply) => {
        const { question, filters } = (req.body as any) ?? {};
        // 1) embed the question
        const [qvec] = await embed([question]);

        const qvecLit = `[${qvec.join(",")}]`;
    
        // 2) vector search with cosine distance (lower is closer). Limit 50, then apply simple keyword filter if provided.
        // Note: We filter by product/jurisdiction in the join.
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
            LIMIT 8
            `,
            [qvecLit, filters?.product ?? null, filters?.jurisdiction ?? null]
        );
    
        const top = res.rows as { qa_id: string; chunk_id: number; text: string; cosine_sim: number }[];
        if (top.length === 0) {
            return reply.send({
                draft:
                    "We do not have material on this in our knowledge base. Please provide guidance or upload relevant content.",
                citations: [], 
            });
        }
    
        // 3) facts (optional: keep simple)
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
            Include bracketed citations like [1], [2] where claims are supported.`;
    
        const context = top
            .map((r, i) => `[${i + 1}] ${r.text}`)
            .join("\n\n");
    
        const prompt = `Question: ${question}
        
        Context:
        ${context}
    
        Facts (authoritative):
        ${factsStr}
    
        Write a concise answer (120-220 words) with citations.`;
        
        const text = await generate(system, prompt);
    
        reply.send({
            draft: text,
            citations: top.map((r, i) => ({
                rank: i + 1,
                qa_id: r.qa_id,
                chunk_id: r.chunk_id,
                score: r.cosine_sim,
            })),
        });
    });
    
    await app.listen({ port: 8080 });
    app.log.info("API listening on http://localhost:8080");
}

start().catch((err) => {
    console.error(err);
    process.exit(1);
});


