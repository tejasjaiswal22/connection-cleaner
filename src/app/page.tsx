'use client';
import { Fragment, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Download, ExternalLink, FileText, ListChecks, Loader2, RotateCcw, Search, ShieldCheck, Undo2, Upload } from 'lucide-react';
import { buildConnections, detectColumns, exportChecklistCSV, exportResultsCSV, FIELD_LABELS, findHeaderRow, hasNameMapping, parseCSV, type Field, type Mapping } from '@/lib/csv';
import { filterResults, sortResults, type SortKey } from '@/lib/filter';
import { EXAMPLE_CRITERIA, type CleanupStatus, type Connection, type Criteria, type Recommendation, type Result } from '@/lib/types';

type Stage = 'upload' | 'criteria' | 'analyzing' | 'results' | 'cleanup';
const BATCH = 100;
const badge: Record<Recommendation, string> = {
  Keep: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  Review: 'bg-amber-50 text-amber-800 ring-amber-200',
  'Potential Removal': 'bg-rose-50 text-rose-700 ring-rose-200',
};
const btn = 'inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50';
const primary = `${btn} bg-indigo-600 text-white hover:bg-indigo-700`;
const ghost = `${btn} border border-stone-300 bg-white text-stone-700 hover:bg-stone-100`;
const input = 'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500';

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u : '');

export default function Page() {
  const [stage, setStage] = useState<Stage>('upload');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<string[][]>([]);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [criteria, setCriteria] = useState<Criteria>(EXAMPLE_CRITERIA);
  const [mode, setMode] = useState<'demo' | 'jev'>('demo');
  const [consent, setConsent] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<Result[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const [rec, setRec] = useState<Recommendation | 'All'>('All');
  const [min, setMin] = useState(0);
  const [max, setMax] = useState(100);
  const [sortKey, setSortKey] = useState<SortKey>('score');
  const [dir, setDir] = useState<'asc' | 'desc'>('asc');
  const [cleanup, setCleanup] = useState<Record<string, CleanupStatus>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (rows.length ? buildConnections(rows, headerIdx, mapping) : null), [rows, headerIdx, mapping]);
  const nameOk = hasNameMapping(mapping);
  const headers = rows[headerIdx] ?? [];

  async function handleFile(f: File | undefined) {
    setError('');
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== 'text/csv') return setError('Please upload a .csv file.');
    if (f.size > 20 * 1024 * 1024) return setError('File is larger than 20 MB.');
    try {
      const r = parseCSV(await f.text());
      if (r.length < 2) return setError('That file looks empty. Export your connections from LinkedIn and try again.');
      const h = findHeaderRow(r);
      setRows(r); setHeaderIdx(h); setMapping(detectColumns(r[h])); setFileName(f.name);
      setStage('criteria');
    } catch { setError('Could not read that file.'); }
  }

  async function post(batch: Connection[], attempt = 0): Promise<Result[]> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 30000);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal, body: JSON.stringify({ connections: batch, criteria, mode, consent }) });
      if (res.status === 429 && attempt < 2) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); return post(batch, attempt + 1); }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed.');
      return data.results as Result[];
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new Error('Request timed out. Please retry.');
      throw e;
    } finally { clearTimeout(t); }
  }

  async function analyze() {
    if (!parsed || !parsed.connections.length) return;
    setError(''); setProgress(0); setStage('analyzing');
    try {
      const all: Result[] = [];
      for (let i = 0; i < parsed.connections.length; i += BATCH) {
        all.push(...(await post(parsed.connections.slice(i, i + BATCH))));
        setProgress(Math.min(100, Math.round(((i + BATCH) / parsed.connections.length) * 100)));
      }
      setResults(all.sort((a, b) => a.score - b.score));
      setSelected(new Set()); setCleanup({}); setStage('results');
    } catch (e) { setError((e as Error).message); setStage('criteria'); }
  }

  function reset() {
    setRows([]); setResults([]); setSelected(new Set()); setCleanup({}); setFileName(''); setError(''); setConsent(false); setStage('upload');
  }

  const counts = useMemo(() => ({
    Keep: results.filter((r) => r.recommendation === 'Keep').length,
    Review: results.filter((r) => r.recommendation === 'Review').length,
    'Potential Removal': results.filter((r) => r.recommendation === 'Potential Removal').length,
  }), [results]);
  const visible = useMemo(() => sortResults(filterResults(results, { q, rec, min, max }), sortKey, dir), [results, q, rec, min, max, sortKey, dir]);
  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  const queue = results.filter((r) => cleanup[r.id]);
  const done = queue.filter((r) => cleanup[r.id] === 'removed').length;
  const setSort = (k: SortKey) => { if (k === sortKey) setDir(dir === 'asc' ? 'desc' : 'asc'); else { setSortKey(k); setDir('asc'); } };

  const Head = ({ k, children }: { k: SortKey; children: string }) => (
    <th scope="col" className="px-3 py-2 text-left font-medium" aria-sort={sortKey === k ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort(k)} className="inline-flex items-center gap-1 hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{children}{sortKey === k && <span aria-hidden>{dir === 'asc' ? '↑' : '↓'}</span>}</button>
    </th>
  );
  const Area = ({ id, label, hint }: { id: keyof Criteria; label: string; hint?: string }) => (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <textarea id={id} rows={id === 'custom' ? 3 : 2} className={input} value={criteria[id]} placeholder={hint} onChange={(e) => setCriteria({ ...criteria, [id]: e.target.value })} />
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Connection Cleaner</h1>
          <p className="text-stone-600">Keep your network relevant. Clean up the noise.</p>
        </div>
        {stage !== 'upload' && <button className={ghost} onClick={reset}><RotateCcw size={16} />Start over</button>}
      </header>

      {error && <div role="alert" className="mb-6 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      {stage === 'upload' && (
        <section className="grid gap-6 md:grid-cols-5">
          <div className="md:col-span-3">
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]); }}
              className={`flex flex-col items-center rounded-2xl border-2 border-dashed bg-white p-10 text-center ${drag ? 'border-indigo-500 bg-indigo-50' : 'border-stone-300'}`}>
              <Upload className="mb-3 text-stone-400" size={32} />
              <p className="font-medium">Drag and drop your connections CSV</p>
              <p className="mb-4 text-sm text-stone-500">Parsed in your browser. Nothing is uploaded yet.</p>
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Choose CSV file" onChange={(e) => handleFile(e.target.files?.[0])} />
              <button className={primary} onClick={() => fileRef.current?.click()}><FileText size={16} />Browse file</button>
              <a href="/sample-connections.csv" download className="mt-4 text-sm text-indigo-700 underline">Download a sample CSV to try it</a>
            </div>
            <p className="mt-3 flex items-center gap-2 text-sm text-stone-500"><ShieldCheck size={16} />We never ask for your LinkedIn password, cookies, or tokens.</p>
          </div>
          <aside className="rounded-2xl border border-stone-200 bg-white p-6 text-sm md:col-span-2">
            <h2 className="mb-3 font-semibold">How it works</h2>
            <ol className="list-decimal space-y-2 pl-5 text-stone-600">
              <li>On LinkedIn: Settings → Data privacy → Get a copy of your data → Connections.</li>
              <li>Upload the CSV here.</li>
              <li>Describe your ideal network.</li>
              <li>Review the ranked suggestions, then remove people yourself on LinkedIn.</li>
            </ol>
            <h3 className="mb-1 mt-5 font-semibold">Expected columns</h3>
            <p className="text-stone-600">First Name, Last Name, URL, Email Address, Company, Position. Other names are mapped automatically, or you can pick them manually.</p>
          </aside>
        </section>
      )}

      {stage === 'criteria' && parsed && (
        <section className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-2 font-medium"><FileText size={16} />{fileName}</span>
              <span>{parsed.connections.length} unique connections</span>
              {parsed.duplicates > 0 && <span className="text-stone-500">{parsed.duplicates} duplicates ignored</span>}
              {parsed.skipped > 0 && <span className="text-stone-500">{parsed.skipped} malformed rows skipped</span>}
              <span className="text-emerald-700">Ready</span>
            </div>
            <details className="mt-3 text-sm" open={!nameOk}>
              <summary className="cursor-pointer text-indigo-700">Column mapping{!nameOk && ' (name column needed)'}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {(Object.keys(FIELD_LABELS) as Field[]).map((f) => (
                  <label key={f} className="text-xs text-stone-600">{FIELD_LABELS[f]}
                    <select className={`${input} mt-1`} value={mapping[f] ?? -1} onChange={(e) => { const v = Number(e.target.value); setMapping((m) => { const n = { ...m }; if (v < 0) delete n[f]; else n[f] = v; return n; }); }}>
                      <option value={-1}>— none —</option>
                      {headers.map((h, i) => <option key={i} value={i}>{h || `Column ${i + 1}`}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-6">
            <h2 className="text-lg font-semibold">Your ideal network</h2>
            <p className="mb-4 text-sm text-stone-600">Pre-filled with an example for a GTM Engineer. Edit freely; every field is optional.</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Area id="titles" label="Target job titles" /><Area id="industries" label="Target industries" />
              <Area id="companies" label="Target companies or company types" /><Area id="keep" label="People to keep" />
              <Area id="lessRelevant" label="Less relevant connection types" />
              <Area id="custom" label="Custom instructions" hint="Anything else Jev should know" />
            </div>
          </div>

          <fieldset className="rounded-2xl border border-stone-200 bg-white p-6 text-sm">
            <legend className="px-1 font-semibold">Analysis engine</legend>
            <label className="flex items-start gap-2"><input type="radio" name="mode" checked={mode === 'demo'} onChange={() => setMode('demo')} className="mt-1" /><span><b>Demo mode</b> – transparent keyword scoring on this app’s own server. No external AI service is contacted.</span></label>
            <label className="mt-3 flex items-start gap-2"><input type="radio" name="mode" checked={mode === 'jev'} onChange={() => setMode('jev')} className="mt-1" /><span><b>Jev</b> – requires server credentials; the Jev adapter is not implemented yet (see README).</span></label>
            {mode === 'jev' && <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" /><span>I understand my connections’ names, companies, positions and profile URLs will be sent to an external AI service.</span></label>}
          </fieldset>

          <div className="flex gap-3">
            <button className={primary} disabled={!nameOk || !parsed.connections.length || (mode === 'jev' && !consent)} onClick={analyze}>Analyze with {mode === 'jev' ? 'Jev' : 'demo mode'}</button>
            <button className={ghost} onClick={() => setCriteria({ titles: '', industries: '', companies: '', keep: '', lessRelevant: '', custom: '' })}>Clear criteria</button>
          </div>
        </section>
      )}

      {stage === 'analyzing' && (
        <section className="mx-auto max-w-md rounded-2xl border border-stone-200 bg-white p-8 text-center" aria-live="polite">
          <Loader2 className="mx-auto mb-4 animate-spin text-indigo-600" />
          <p className="mb-3 font-medium">Analyzing your connections… {progress}%</p>
          <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-2 overflow-hidden rounded-full bg-stone-200"><div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} /></div>
        </section>
      )}

      {(stage === 'results' || stage === 'cleanup') && (
        <section className="space-y-6">
          <nav className="flex gap-2" aria-label="Views">
            <button className={stage === 'results' ? primary : ghost} onClick={() => setStage('results')}>Results</button>
            <button className={stage === 'cleanup' ? primary : ghost} onClick={() => setStage('cleanup')}><ListChecks size={16} />Cleanup queue ({queue.length - done} left)</button>
          </nav>
          <p className="rounded-lg bg-stone-100 p-3 text-sm text-stone-600">Scores are suggestions based on your criteria, not proof a connection is worthless. Nothing is removed automatically; you decide and remove people yourself on LinkedIn.</p>
        </section>
      )}

      {stage === 'results' && (
        <section className="mt-6 space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {([['Analyzed', results.length, ''], ['Keep', counts.Keep, 'Keep'], ['Review', counts.Review, 'Review'], ['Potential Removal', counts['Potential Removal'], 'Potential Removal']] as const).map(([l, n, r]) => (
              <button key={l} onClick={() => setRec(r === '' ? 'All' : (r as Recommendation))} className="rounded-xl border border-stone-200 bg-white p-4 text-left hover:border-indigo-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
                <div className="text-2xl font-semibold">{n}</div><div className="text-sm text-stone-500">{l}</div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <label className="relative min-w-[200px] flex-1 text-xs text-stone-600">Search
              <Search size={14} className="absolute left-3 top-[30px] text-stone-400" />
              <input className={`${input} mt-1 pl-8`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, company, or title" />
            </label>
            <label className="text-xs text-stone-600">Recommendation
              <select className={`${input} mt-1`} value={rec} onChange={(e) => setRec(e.target.value as Recommendation | 'All')}><option>All</option><option>Keep</option><option>Review</option><option>Potential Removal</option></select>
            </label>
            <label className="text-xs text-stone-600">Min score<input type="number" min={0} max={100} className={`${input} mt-1 w-20`} value={min} onChange={(e) => setMin(Number(e.target.value) || 0)} /></label>
            <label className="text-xs text-stone-600">Max score<input type="number" min={0} max={100} className={`${input} mt-1 w-20`} value={max} onChange={(e) => setMax(e.target.value === '' ? 100 : Number(e.target.value))} /></label>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-stone-500">{selected.size} selected</span>
            <button className={ghost} disabled={!selected.size} onClick={() => { setCleanup((c) => { const n = { ...c }; selected.forEach((id) => { if (!n[id]) n[id] = 'queued'; }); return n; }); setSelected(new Set()); setStage('cleanup'); }}><ListChecks size={16} />Add to cleanup queue</button>
            <button className={ghost} disabled={!selected.size} onClick={() => download('connection-recommendations.csv', exportResultsCSV(results.filter((r) => selected.has(r.id))))}><Download size={16} />Export selected</button>
            <button className={ghost} onClick={() => setSelected(new Set(results.filter((r) => r.recommendation === 'Potential Removal').map((r) => r.id)))}>Select all Potential Removal</button>
          </div>

          <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-sm">
              <thead className="border-b border-stone-200 bg-stone-50 text-xs text-stone-500">
                <tr>
                  <th className="w-10 px-3 py-2"><input type="checkbox" aria-label="Select all visible" checked={allVisibleSelected} onChange={() => setSelected((s) => { const n = new Set(s); visible.forEach((r) => (allVisibleSelected ? n.delete(r.id) : n.add(r.id))); return n; })} /></th>
                  <Head k="name">Name</Head><Head k="company">Company</Head><Head k="position">Position</Head><Head k="score">Score</Head><Head k="recommendation">Recommendation</Head><Head k="confidence">Confidence</Head>
                  <th className="px-3 py-2"><span className="sr-only">Details</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={8} className="p-10 text-center text-stone-500">No connections match these filters.</td></tr>}
                {visible.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="px-3 py-2"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(r.id)} onChange={() => setSelected(toggle(selected, r.id))} /></td>
                      <td className="px-3 py-2 font-medium">{safeUrl(r.url) ? <a className="inline-flex items-center gap-1 hover:underline" href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer">{r.name}<ExternalLink size={12} /></a> : r.name}</td>
                      <td className="px-3 py-2 text-stone-600">{r.company || '—'}</td>
                      <td className="px-3 py-2 text-stone-600">{r.position || '—'}</td>
                      <td className="px-3 py-2 tabular-nums">{r.score}</td>
                      <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${badge[r.recommendation]}`}>{r.recommendation}</span></td>
                      <td className="px-3 py-2 tabular-nums text-stone-600">{r.confidence}%</td>
                      <td className="px-3 py-2"><button aria-expanded={open.has(r.id)} aria-label={`Explanation for ${r.name}`} onClick={() => setOpen(toggle(open, r.id))} className="rounded p-1 hover:bg-stone-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{open.has(r.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</button></td>
                    </tr>
                    {open.has(r.id) && <tr className="bg-stone-50"><td /><td colSpan={7} className="px-3 py-3 text-stone-600">{r.explanation}</td></tr>}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {stage === 'cleanup' && (
        <section className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600"><b>{done}</b> removed · <b>{queue.length - done}</b> remaining</p>
            <button className={ghost} disabled={!queue.length} onClick={() => download('cleanup-checklist.csv', exportChecklistCSV(results, cleanup))}><Download size={16} />Export checklist</button>
          </div>
          {queue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">Your queue is empty. Select connections in Results and add them here.</div>
          ) : (
            <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200 bg-white">
              {queue.map((r) => {
                const st = cleanup[r.id];
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className={st === 'removed' ? 'opacity-50 line-through' : ''}>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-sm text-stone-500">{[r.position, r.company].filter(Boolean).join(' · ') || 'No details'} · score {r.score}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs text-stone-500">{st === 'queued' ? 'Needs confirmation' : st === 'confirmed' ? 'Confirmed' : 'Removed'}</span>
                      {safeUrl(r.url) && <a className={ghost} href={safeUrl(r.url)} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} />Open profile</a>}
                      {st === 'queued' && <button className={primary} onClick={() => setCleanup({ ...cleanup, [r.id]: 'confirmed' })}><Check size={14} />Confirm</button>}
                      {st === 'confirmed' && <button className={primary} onClick={() => setCleanup({ ...cleanup, [r.id]: 'removed' })}><Check size={14} />Mark removed</button>}
                      <button className={ghost} onClick={() => { const n = { ...cleanup }; delete n[r.id]; setCleanup(n); }}><Undo2 size={14} />{st === 'removed' ? 'Undo' : 'Remove from queue'}</button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-xs text-stone-500">Removals must be done manually on LinkedIn. This app never logs in or disconnects anyone for you.</p>
        </section>
      )}
    </main>
  );
}
