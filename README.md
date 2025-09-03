RFP AI — AI‑Assisted RFP Drafting (MVP)

End‑to‑end system to ingest firm Q&A knowledge, retrieve the most relevant content for an RFP question, and generate a concise draft answer with bracketed citations.

- Stack: React (Vite) UI, Fastify + TypeScript API, Postgres + pgvector, Ollama for local embeddings + text generation, optional Hugging Face cross‑encoder reranker.
- Focus: Practical RAG with transparent retrieval, tight feedback loop, and local‑first privacy.

Features
- Retrieval‑Augmented Generation: Embed Q&A chunks, vector search, optional cross‑encoder rerank, then generation with [1], [2]-style citations.
- Ingestion two ways:
  - UI: paste/upload .txt, auto‑extract Q&As, chunk, ingest.
  - CLI: .mjs scripts for documents and CSV.
- Controls: Filter by product, jurisdiction, audience; inject firm facts to keep numbers consistent.
- Local‑First: All inference runs locally via Ollama; Postgres via Docker.

Architecture
- Frontend (`rfp-ui/`): React + Vite app with two modes:
  - Draft: ask a question, view draft + citations and the underlying retrieved snippets.
  - Ingest: upload/paste .txt, auto‑extract Q&As, review, ingest all.
- Backend (`server/`): Fastify + TypeScript service exposing:
  - `POST /ingest/chunks`: upsert Q&A metadata and embeddings.
  - `POST /rfp/answer:suggest`: retrieve → (optional rerank) → generate draft with citations.
  - `POST /debug/search`: inspect top matches without involving the LLM.
- Data: Postgres with `pgvector` for embeddings. Firm facts are read from `firm_facts` and injected at generation time.
- Models: Ollama provides `nomic-embed-text` for embeddings and `llama3.1:8b-instruct-q4_K_M` for drafting. Optional rerank via `@huggingface/transformers` using `cross-encoder/ms-marco-MiniLM-L-6-v2` (can be toggled off).

Ingest Data
- UI:
  - In top command bar, type `ingest`.
  - Upload/paste `.txt`, click Parse, review, Ingest All.
- CLI:
  - TXT: `node server/ingest_doc.mjs test-rfp.txt --product=Core+ --audience=pension --jurisdiction=US --no-confirm`
  - CSV: `node server/ingest_csv.mjs server/qas_ingest.csv`

Ask a Question
- In Draft mode (default), type a question and click Suggest.
- Review the draft + citations and the “Retrieved snippets” panel. Copy, edit, ship.

API Surface
- POST `/ingest/chunks`
  - Body: `{ qa: { id, question, answer, meta? }, chunks: string[] }`
- POST `/rfp/answer:suggest`
  - Body: `{ question: string, filters?: { product?, jurisdiction?, audience? } }`
  - Returns: `{ draft: string, citations: [{ rank, qa_id, chunk_id, score }] }`
- POST `/debug/search`
  - Body: `{ question: string, filters? }`
  - Returns: `{ hits: [{ qa_id, chunk_id, snippet, cosine_sim }] }`

Key Files
- `server/server.ts`: API routes, embedding/generation helpers, optional reranker.
- `server/ingest_doc.mjs`: Parse `.txt` into Q&As and ingest (CLI).
- `server/ingest_csv.mjs`: Bulk ingest from CSV.
- `rfp-ui/src/views/DraftView.tsx`: Drafting UX + retrieved snippets.
- `rfp-ui/src/views/IngestView.tsx`: Ingest UX with parsing/preview.
- `schema.sql`: Reference schema and diagnostic queries.
- `docker-compose.yml`: Postgres (pgvector) and MinIO (future file storage).

Roadmap
- Inline source preview and jump‑to‑QA.
- Human‑in‑the‑loop editing workflow and approvals.
- Richer filters (tags), draft history, and audit trails.
- Document storage (MinIO/S3) and PDF extraction pipeline.
