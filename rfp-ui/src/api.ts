import ky from 'ky';

export const http = ky.create({
    prefixUrl: '/api',
    timeout: 120_000
});

export type Filters = {
    product?: string | null;
    jurisdiction?: string | null;
    audience?: 'pension' | 'foundation' | 'consultant' | null;
};

export type SuggestResponse = {
    draft: string;
    citations: { rank: number; qa_id: string; chunk_id: number; score: number }[];
};

export type DebugSearchResponse = {
    hits: { qa_id: string; chunk_id: number; snippet: string; cosine_sim: number }[];
};

export type IngestMeta = {
    product?: string | null;
    audience?: 'pension' | 'foundation' | 'consultant' | null;
    jurisdiction?: string | null;
    tags?: string[] | null;
};

export type IngestPayload = {
    qa: { id: string; question: string; answer: string; meta?: IngestMeta };
    chunks: string[];
};

export async function suggestAnswer(question: string, filters?: Filters) {
    return http.post('rfp/answer:suggest', { json: { question, filters } }).json<SuggestResponse>();
}

export async function debugSearch(question: string, filters?: Filters) {
    return http.post('debug/search', { json: { question, filters } }).json<DebugSearchResponse>();
}

export async function ingestChunks(payload: IngestPayload) {
    return http.post('ingest/chunks', { json: payload }).json<{ ok: boolean; chunks: number }>();
}
