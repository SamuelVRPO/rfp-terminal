import { useState, type ChangeEvent } from 'react';
import { ingestChunks, type IngestMeta } from '../api';
import {
  normalizeWhitespace,
  splitParagraphs,
  extractQAsFromParagraphs,
  chunkAnswer,
} from '../utils/qaParse';

type Props = {
  metaDefaults: {
    product?: string;
    jurisdiction?: string;
    audience?: string; // 'pension' | 'foundation' | 'consultant'
    tags?: string;     // comma-separated
  };
};

export default function IngestView({ metaDefaults }: Props) {
  const [ingText, setIngText] = useState<string>('');
  const [ingFileName, setIngFileName] = useState<string>('');
  const [ingQAs, setIngQAs] = useState<{ question: string; answer: string; chunks: string[] }[]>([]);
  const [ingTargetWords, setIngTargetWords] = useState<number>(100);
  const [ingOverlap, setIngOverlap] = useState<number>(20);
  const [ingesting, setIngesting] = useState<boolean>(false);
  const [ingLog, setIngLog] = useState<string[]>([]);
  const [error, setError] = useState<string>('');

  async function onPickFile(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.name.toLowerCase().endsWith('.txt')) {
      setError('Only .txt files are supported.');
      return;
    }
    setError('');
    setIngFileName(f.name);
    const text = await f.text();
    setIngText(text);
  }

  function onParseText() {
    setError('');
    const norm = normalizeWhitespace(ingText);
    const paras = splitParagraphs(norm);
    const qas = extractQAsFromParagraphs(paras);
    const prepared = qas.map(({ question, answer }) => ({
      question: question.trim(),
      answer: answer.trim(),
      chunks: chunkAnswer(answer, ingTargetWords, ingOverlap),
    }));
    setIngQAs(prepared);
  }

  async function onIngestAll() {
    if (!ingQAs.length) return;
    setIngesting(true);
    setIngLog([]);
    setError('');
    try {
      const meta: IngestMeta = {
        product: metaDefaults.product || null,
        audience: metaDefaults.audience ? (metaDefaults.audience as any) : null,
        jurisdiction: metaDefaults.jurisdiction || null,
        tags: metaDefaults.tags ? metaDefaults.tags.split(',').map(s=>s.trim()).filter(Boolean) : null,
      };
      for (let i = 0; i < ingQAs.length; i++) {
        const qa = ingQAs[i];
        const id = (crypto as any)?.randomUUID ? (crypto as any).randomUUID() : `${Date.now()}-${i}`;
        await ingestChunks({ qa: { id, question: qa.question, answer: qa.answer, meta }, chunks: qa.chunks });
        setIngLog(prev => [...prev, `Inserted ${id} [${i+1}/${ingQAs.length}]`]);
      }
      setIngLog(prev => [...prev, 'All chunks ingested.']);
    } catch (e: any) {
      setError(e?.message ?? 'Ingest failed');
    } finally {
      setIngesting(false);
    }
  }

  return (
    <>
      <div className="command-bar">
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <input type="file" accept=".txt" onChange={onPickFile} className="btn-secondary" />
          <button className="btn-primary" onClick={onParseText} disabled={!ingText}>Parse</button>
        </div>
        <div style={{display:'flex', gap:10, alignItems:'center'}}>
          <label className="label" style={{margin:0}}>Target words</label>
          <input type="number" className="input" style={{width:90}} value={ingTargetWords} onChange={e=>setIngTargetWords(Math.max(1, Number(e.target.value)||100))} />
          <label className="label" style={{margin:0}}>Overlap</label>
          <input type="number" className="input" style={{width:90}} value={ingOverlap} onChange={e=>setIngOverlap(Math.max(0, Number(e.target.value)||20))} />
        </div>
      </div>

      {error && <div className="error">Error: {error}</div>}

      <div className="grid-panels">
        <section className="panel">
          <header className="panel-header">
            <h3 className="panel-title">Input Text {ingFileName ? `(${ingFileName})` : ''}</h3>
            <div style={{display:'flex', gap:8}}>
              <button onClick={onParseText} disabled={!ingText} className="btn-secondary">Parse</button>
            </div>
          </header>
          <div className="panel-body no-overflow">
            <textarea className="textpane" placeholder="Paste .txt content here…" value={ingText} onChange={e=>setIngText(e.target.value)} />
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h3 className="panel-title">Detected Q&As</h3>
            <div style={{display:'flex', gap:8}}>
              <button onClick={onIngestAll} disabled={!ingQAs.length || ingesting} className="btn-primary">{ingesting ? 'Ingesting…' : 'Ingest All'}</button>
            </div>
          </header>
          <div className="panel-body">
            {!ingQAs.length && <div className="placeholder">Load a .txt and click Parse to extract Q&As.</div>}
            {!!ingQAs.length && (
              <ol className="list">
                {ingQAs.map((qa, i) => (
                  <li key={i} className="list-item">
                    <div className="meta">Q{String(i+1).padStart(2,'0')} • chunks:{qa.chunks.length}</div>
                    <div style={{whiteSpace:'pre-wrap', fontWeight:700}}>{qa.question}</div>
                    <div style={{whiteSpace:'pre-wrap', opacity:0.9, marginTop:4}}>{qa.answer.slice(0, 240)}{qa.answer.length>240?'…':''}</div>
                  </li>
                ))}
              </ol>
            )}
          </div>
          {ingLog.length>0 && (
            <footer className="panel-footer">
              <div className="draft-text" style={{fontSize:12}}>{ingLog.join('\n')}</div>
            </footer>
          )}
        </section>
      </div>
    </>
  );
}

