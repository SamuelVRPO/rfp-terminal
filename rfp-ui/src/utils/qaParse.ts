export function normalizeWhitespace(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/-\n(?=[a-z])/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function splitParagraphs(text: string) {
  const byDouble = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  if (byDouble.length > 1) return byDouble;
  return text.split(/\n+/).map(p => p.trim()).filter(Boolean);
}

export function stripQuestionPrefix(s: string) {
  return s
    .replace(/^\s*[-•–—]\s+/, '')
    .replace(/^\s*(?:Q(?:uestion)?)\s*[:\.\-–—\)\]]\s*/i, '')
    .replace(/^\s*\(?\d{1,3}[)\.:]\s+/, '')
    .trim();
}

export function looksLikeQuestion(para: string) {
  const p = para.trim();
  if (!p) return false;
  const pb = p.replace(/^\s*[-•–—]\s+/, '');
  if (/^\s*(?:Q(?:uestion)?)\s*[:\.\-–—\)\]]\s*/i.test(pb)) return true;
  if (/^\s*\(?\d{1,3}[)\.:]\s+/.test(pb)) return true;
  if (pb.length <= 240 && /\?$/.test(pb)) return true;
  return false;
}

export function isLikelyNoise(para: string) {
  const p = para.trim();
  if (/^\s*(page\s+\d+(\s+of\s+\d+)?)\s*$/i.test(p)) return true;
  if (/^\s*\d+\s*$/.test(p)) return true;
  if (p.length <= 3) return true;
  return false;
}

export function extractQAsFromParagraphs(paragraphs: string[]) {
  const qas: { question: string; answer: string }[] = [];
  let curQ: string | null = null;
  let curA: string[] = [];

  const flush = () => {
    if (curQ) {
      const answer = curA.join('\n\n').trim();
      if (answer) qas.push({ question: curQ, answer });
    }
    curQ = null; curA = [];
  };

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    if (isLikelyNoise(p)) continue;
    if (looksLikeQuestion(p)) { flush(); curQ = stripQuestionPrefix(p); continue; }
    if (curQ) curA.push(p);
  }
  flush();
  return qas;
}

export function chunkAnswer(answer: string, targetWords = 100, overlap = 20) {
  const words = answer.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [] as string[];
  const chunks: string[] = [];
  let i = 0;
  const step = Math.max(1, targetWords - overlap);
  while (i < words.length) {
    const block = words.slice(i, i + targetWords).join(' ').trim();
    if (block) chunks.push(block);
    i += step;
  }
  return chunks.length ? chunks : [answer];
}

