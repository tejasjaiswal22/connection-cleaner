import type { CleanupStatus, Connection, Result } from './types';

export type Field = 'firstName' | 'lastName' | 'fullName' | 'url' | 'email' | 'company' | 'position';
export type Mapping = Partial<Record<Field, number>>;

const ALIASES: Record<Field, string[]> = {
  firstName: ['first name', 'firstname', 'given name'],
  lastName: ['last name', 'lastname', 'surname', 'family name'],
  fullName: ['name', 'full name'],
  url: ['url', 'profile url', 'linkedin url', 'profile', 'linkedin'],
  email: ['email address', 'email', 'e-mail'],
  company: ['company', 'organization', 'organisation', 'employer', 'current company'],
  position: ['position', 'title', 'job title', 'headline', 'role'],
};
export const FIELD_LABELS: Record<Field, string> = {
  firstName: 'First name', lastName: 'Last name', fullName: 'Full name', url: 'Profile URL',
  email: 'Email', company: 'Company', position: 'Position',
};

/** RFC 4180-style parser: quotes, escaped quotes, CRLF, BOM, newlines inside quotes. */
export function parseCSV(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); f = ''; rows.push(row); row = [];
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function detectColumns(headers: string[]): Mapping {
  const m: Mapping = {};
  const h = headers.map(norm);
  (Object.keys(ALIASES) as Field[]).forEach((field) => {
    const i = h.findIndex((x) => ALIASES[field].includes(x));
    if (i >= 0) m[field] = i;
  });
  return m;
}

/** LinkedIn exports start with a "Notes:" preamble; find the real header row. */
export function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    if (Object.keys(detectColumns(rows[i])).length >= 2) return i;
  }
  return 0;
}

export function hasNameMapping(m: Mapping): boolean {
  return m.fullName !== undefined || m.firstName !== undefined || m.lastName !== undefined;
}

const clean = (s: string | undefined) => (s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, 300);

export function buildConnections(rows: string[][], headerIdx: number, m: Mapping) {
  const seen = new Set<string>();
  const connections: Connection[] = [];
  let skipped = 0, duplicates = 0;
  for (const r of rows.slice(headerIdx + 1)) {
    const get = (f: Field) => (m[f] === undefined ? '' : clean(r[m[f] as number]));
    const name = get('fullName') || [get('firstName'), get('lastName')].filter(Boolean).join(' ');
    if (!name) { skipped++; continue; }
    const url = get('url'), company = get('company'), position = get('position');
    const key = url ? url.toLowerCase().replace(/\/+$/, '') : `${name}|${company}`.toLowerCase();
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    connections.push({ id: `c${connections.length}`, name, company, position, url, email: get('email') });
  }
  return { connections, skipped, duplicates };
}

/** Escapes quotes/commas/newlines and neutralises spreadsheet formula injection. */
export function escapeCell(v: string | number): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCSV = (rows: (string | number)[][]) => rows.map((r) => r.map(escapeCell).join(',')).join('\r\n');

export function exportResultsCSV(results: Result[]): string {
  return toCSV([
    ['Name', 'Company', 'Position', 'Score', 'Recommendation', 'Confidence', 'Explanation', 'Profile URL'],
    ...results.map((r) => [r.name, r.company, r.position, r.score, r.recommendation, r.confidence, r.explanation, r.url]),
  ]);
}

export function exportChecklistCSV(results: Result[], status: Record<string, CleanupStatus>): string {
  return toCSV([
    ['Name', 'Company', 'Position', 'Status', 'Profile URL'],
    ...results.filter((r) => status[r.id]).map((r) => [r.name, r.company, r.position, status[r.id] === 'removed' ? 'Removed' : status[r.id] === 'confirmed' ? 'To remove' : 'Queued', r.url]),
  ]);
}
