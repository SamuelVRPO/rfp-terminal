-- CREATE EXTENSION IF NOT EXISTS vector;
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CREATE TABLE qa_units (
--   id UUID PRIMARY KEY,
--   question TEXT NOT NULL,
--   answer TEXT NOT NULL,
--   product TEXT,
--   strategy TEXT,
--   audience TEXT,
--   jurisdiction TEXT,
--   tags TEXT[],
--   effective_date DATE,
--   expires_on DATE,
--   source_doc_url TEXT,
--   version INTEGER DEFAULT 1,
--   is_active BOOLEAN DEFAULT TRUE,
--   created_by TEXT,
--   updated_at TIMESTAMP DEFAULT now()
-- );

-- -- bge-m3 dims = 1024
-- CREATE TABLE qa_embeddings (
--   qa_id UUID REFERENCES qa_units(id) ON DELETE CASCADE,
--   chunk_id INT,
--   text TEXT,
--   embedding VECTOR(1024),
--   PRIMARY KEY (qa_id, chunk_id)
-- );

-- CREATE INDEX qa_text_trgm ON qa_embeddings USING gin (text gin_trgm_ops);
-- CREATE INDEX qa_filter_idx ON qa_units (product, strategy, jurisdiction, is_active);

-- CREATE TABLE firm_facts (
--   key TEXT PRIMARY KEY,
--   value TEXT,
--   as_of DATE,
--   source TEXT
-- );

-- CREATE TABLE rfp_drafts (
--   id UUID PRIMARY KEY,
--   rfp_id UUID,
--   question TEXT,
--   suggested_answer TEXT,
--   citations JSONB,
--   status TEXT,
--   reviewer TEXT,
--   updated_at TIMESTAMP DEFAULT now()
-- );


-- TRY AGAIN
-- -- ensure extension
-- CREATE EXTENSION IF NOT EXISTS vector;

-- -- add cosine index for ANN search (optional but recommended once you have data)
-- -- pgvector >= 0.5 supports cosine with "vector_cosine_ops"
-- CREATE INDEX IF NOT EXISTS qa_emb_cosine_ivfflat
--   ON qa_embeddings USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);


-- DROP INDEX IF EXISTS qa_emb_cosine_ivfflat;
-- DROP TABLE IF EXISTS qa_embeddings;

-- CREATE TABLE qa_embeddings (
--   qa_id UUID REFERENCES qa_units(id) ON DELETE CASCADE,
--   chunk_id INT,
--   text TEXT,
--   embedding VECTOR(768),   -- <-- match 768
--   PRIMARY KEY (qa_id, chunk_id)
-- );

-- -- optional ANN index (cosine)
-- CREATE INDEX qa_emb_cosine_ivfflat
--   ON qa_embeddings USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);

-- -- 1) If you created this earlier, drop the old filter index that referenced strategy
-- DROP INDEX IF EXISTS qa_filter_idx;

-- -- 2) Drop the strategy column
-- ALTER TABLE qa_units DROP COLUMN IF EXISTS strategy;

-- -- 3) Create an enum for audience and migrate the column
-- DO $$
-- BEGIN
--   IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'audience_enum') THEN
--     CREATE TYPE audience_enum AS ENUM ('pension','foundation','consultant');
--   END IF;
-- END$$;

-- -- If qa_units.audience exists (TEXT), convert it to the enum (case-insensitive)
-- ALTER TABLE qa_units
--   ALTER COLUMN audience TYPE audience_enum
--   USING CASE
--     WHEN audience IS NULL THEN NULL
--     ELSE lower(audience)::audience_enum
--   END;

-- -- 4) Recreate a filter index without strategy
-- CREATE INDEX qa_filter_idx ON qa_units (product, jurisdiction, is_active);

-- -- (optional) keep tags index if you plan to query by tags frequently

-- Do we have embeddings at all?
SELECT COUNT(*) AS embedding_rows FROM qa_embeddings;

-- Are qa_units rows marked active and joined correctly?
SELECT COUNT(*) AS joinable_rows
FROM qa_embeddings e
JOIN qa_units u ON u.id = e.qa_id
WHERE u.is_active;

-- Peek one row to ensure text isn’t empty
SELECT e.qa_id, e.chunk_id, LEFT(e.text, 120) AS snippet
FROM qa_embeddings e
JOIN qa_units u ON u.id = e.qa_id
WHERE u.is_active
LIMIT 3;
