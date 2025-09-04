import { pipeline, env as hfenv } from "@huggingface/transformers";
import { USE_RERANK } from "../config.ts";

hfenv.useBrowserCache = false;

let rerankPipe: any | null = null;

async function getRerankPipeline() {
  if (!rerankPipe) {
    rerankPipe = await pipeline("text-classification", "cross-encoder/ms-marco-MiniLM-L-6-v2");
  }
  return rerankPipe;
}

/**
 * Rerank candidate passages for a query.
 * Returns indices of `passages` sorted by descending relevance.
 */
export async function rerank(query: string, passages: string[]): Promise<number[]> {
  if (!USE_RERANK) {
    return passages.map((_, i) => i); // identity
  }

  const pipe = await getRerankPipeline();
  const inputs = passages.map((p) => ({ text: query, text_pair: p }));
  const raw = await pipe(inputs, { topk: 1 });

  const arr = Array.isArray(raw) ? raw : [raw];
  const norm = arr.map((res: any) => {
    const first = Array.isArray(res) ? res[0] : res;
    const score = typeof first?.score === "number" ? first.score : 0;
    return { score };
  });

  const N = Math.min(norm.length, passages.length);
  const scored = Array.from({ length: N }, (_, i) => ({ i, score: norm[i].score }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.i);
}

