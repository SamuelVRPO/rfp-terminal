import { useState } from 'react'
import { suggestAnswer, debugSearch, type Filters } from './api'

type Hit = { qa_id: string; chunk_id: number; snippet: string; cosine_sim: number };

export default function App() {
  const [question, setQuestion] = useState('');
  const [product, setProduct] = useState<string>('');
  const [jurisdiction, setJurisdiction] = useState<string>('');
  const [audience, setAudience] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<string>('');
  const [citations, setCitations] = useState<{ rank:number; qa_id:string; chunk_id:number; score:number }[]>([]);
  const [hits, setHits] = useState<Hit[]>([]);
  const [error, setError] = useState<string>('');

  const filters: Filters = {
    product: product || null,
    jurisdiction: jurisdiction || null,
    audience: audience ? (audience as any) : null
  };

  async function onSuggest() {
    setLoading(true); setError('');
    try {
      const [dbg, sug] = await Promise.all([
        debugSearch(question, filters),
        suggestAnswer(question, filters),
      ]);
      setHits(dbg.hits);
      setDraft(sug.draft);
      setCitations(sug.citations);
    } catch (e:any) {
      setError(e?.message ?? 'Request failed');
      setDraft(''); setCitations([]); setHits([]);
    } finally {
      setLoading(false);
    }
  }

  function copyMarkdown() {
    const md = `**Question:** ${question}\n\n${draft}\n\n` +
      (citations.length ? `_Citations:_ ${citations.map(c=>`[${c.rank}]`).join(' ')}` : '');
    navigator.clipboard.writeText(md);
  }

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span className="title">RFP TERMINAL</span>
          <span className="subtitle">MVP</span>
        </div>
        <div className="status"><span className="dot" style={{background: '#00e676'}} />Connected</div>
      </div>

      <div className="workspace">
        <aside className="sidebar">
          <div className="field">
            <label className="label">Product</label>
            <input className="input" value={product} onChange={e=>setProduct(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field">
            <label className="label">Jurisdiction</label>
            <input className="input" value={jurisdiction} onChange={e=>setJurisdiction(e.target.value)} placeholder="Optional" />
          </div>
          <div className="field">
            <label className="label">Audience</label>
            <select className="select" value={audience} onChange={e=>setAudience(e.target.value)}>
              <option value="">Any</option>
              <option value="pension">Pension</option>
              <option value="foundation">Foundation</option>
              <option value="consultant">Consultant</option>
            </select>
          </div>
        </aside>

        <main className="main">
          <div className="command-bar">
            <textarea
              className="cmd-input"
              placeholder="Type a question or command…"
              value={question}
              onChange={e=>setQuestion(e.target.value)}
              rows={3}
            />
            <div>
              <button onClick={onSuggest} disabled={!question || loading} className="btn-primary">
                {loading ? 'Working…' : 'Suggest'}
              </button>
            </div>
          </div>

          {error && <div className="error">Error: {error}</div>}

          <div className="grid-panels">
            <section className="panel">
              <header className="panel-header">
                <h3 className="panel-title">Draft</h3>
                <div style={{display:'flex', gap:8}}>
                  <button onClick={copyMarkdown} disabled={!draft} className="btn-secondary">Copy</button>
                </div>
              </header>
              <div className="panel-body">
                <div className="draft-text">
                  {draft || <span className="placeholder">Draft will appear here…</span>}
                </div>
              </div>
              {citations.length > 0 && (
                <footer className="panel-footer">
                  <div className="badges">
                    {citations.map(c => (
                      <span key={`${c.qa_id}-${c.chunk_id}`} title={`qa_id=${c.qa_id}\nchunk=${c.chunk_id}\nscore=${c.score.toFixed(3)}`} className="badge">
                        [{c.rank}]
                      </span>
                    ))}
                  </div>
                </footer>
              )}
            </section>

            <section className="panel">
              <header className="panel-header">
                <h3 className="panel-title">Retrieved snippets</h3>
              </header>
              <div className="panel-body">
                {!hits.length && <div className="placeholder">Run a query to see the top matches.</div>}
                {!!hits.length && (
                  <ol className="list">
                    {hits.map((h) => (
                      <li key={`${h.qa_id}-${h.chunk_id}`} className="list-item">
                        <div className="meta">qa:{h.qa_id.slice(0,8)}… • chunk:{h.chunk_id} • sim:{h.cosine_sim.toFixed(3)}</div>
                        <div style={{whiteSpace:'pre-wrap'}}>{h.snippet}</div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
