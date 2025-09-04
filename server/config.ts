// Centralized configuration
export const PORT = Number(process.env.PORT || 8080);

export const DATABASE_URL = process.env.DATABASE_URL ||
  "postgres://postgres:postgres@localhost:5432/rfp";

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ||
  "http://localhost:11434";

export const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ||
  "nomic-embed-text";

export const OLLAMA_GEN_MODEL = process.env.OLLAMA_GEN_MODEL ||
  "llama3.1:8b-instruct-q4_K_M";

export const USE_RERANK = (process.env.USE_RERANK ?? "1") === "1";

// Generation defaults
export const GEN_TEMPERATURE = Number(process.env.GEN_TEMPERATURE || 0.2);
export const GEN_NUM_PREDICT = Number(process.env.GEN_NUM_PREDICT || 300);
export const GEN_STOP = (process.env.GEN_STOP || "\n\n\n").split("||");

