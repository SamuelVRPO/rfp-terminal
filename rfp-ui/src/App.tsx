import { useState, type FormEvent } from 'react'
import type { Filters } from './api'
import DraftView from './views/DraftView'
import IngestView from './views/IngestView'

export default function App() {
  // Global command + mode
  const [mode, setMode] = useState<'draft' | 'ingest'>('draft');
  const [cmd, setCmd] = useState('');

  // Draft mode state
  const [product, setProduct] = useState<string>('');
  const [jurisdiction, setJurisdiction] = useState<string>('');
  const [audience, setAudience] = useState<string>('');
  const [tags, setTags] = useState<string>('');

  const filters: Filters = {
    product: product || null,
    jurisdiction: jurisdiction || null,
    audience: audience ? (audience as any) : null
  };

  // ---- Command bar (top) ----
  function onCommandSubmit(e: FormEvent) {
    e.preventDefault();
    const c = cmd.trim().toLowerCase();
    if (c === 'ingest') setMode('ingest');
    else if (c === 'draft') setMode('draft');
    setCmd('');
  }

  return (
    <div>
      <div className="topbar">
        <div className="brand">
          <span className="title">GIA RFP TERMINAL</span>
          <span className="subtitle">MVP</span>
        </div>
        <form className="cmdline-container" onSubmit={onCommandSubmit} aria-label="Command bar">
          <input
            className="cmdline-input"
            placeholder="> Type a command (ingest, draft) and press Enter"
            value={cmd}
            onChange={e=>setCmd(e.target.value)}
          />
        </form>
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
          <div className="field">
            <label className="label">Tags (comma-separated)</label>
            <input className="input" value={tags} onChange={e=>setTags(e.target.value)} placeholder="e.g. ESG, liquidity" />
          </div>
        </aside>

        <main className="main">
          {mode === 'draft' && (<DraftView filters={filters} />)}
          {mode === 'ingest' && (
            <IngestView metaDefaults={{
              product,
              jurisdiction,
              audience,
              tags,
            }} />
          )}
        </main>
      </div>
    </div>
  );
}
