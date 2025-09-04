import ky from "ky";
import {
  OLLAMA_BASE_URL,
  OLLAMA_EMBED_MODEL,
  OLLAMA_GEN_MODEL,
  GEN_TEMPERATURE,
  GEN_NUM_PREDICT,
  GEN_STOP,
} from "../config.ts";

const OLLAMA = ky.create({
  prefixUrl: OLLAMA_BASE_URL,
  timeout: 120_000,
});

export async function embed(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    const res = await OLLAMA.post("api/embeddings", {
      json: { model: OLLAMA_EMBED_MODEL, prompt: t },
    }).json<{ embedding: number[] }>();
    out.push(res.embedding);
  }
  return out;
}

export async function generate(system: string, prompt: string): Promise<string> {
  const res = await OLLAMA.post("api/generate", {
    json: {
      model: OLLAMA_GEN_MODEL,
      prompt: `<|system|>\n${system}\n<|user|>\n${prompt}\n<|assistant|>\n`,
      stream: false,
      options: { temperature: GEN_TEMPERATURE, num_predict: GEN_NUM_PREDICT, stop: GEN_STOP },
    },
  }).json<{ response: string }>();
  return res.response;
}

// serialize a number[] into a pgvector literal string
export const toVec = (v: number[]) => `[${v.join(",")}]`;

