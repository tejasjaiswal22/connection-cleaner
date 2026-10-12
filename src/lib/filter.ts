import type { Recommendation, Result } from './types';

export type SortKey = 'name' | 'company' | 'position' | 'score' | 'recommendation' | 'confidence';
export interface Filters { q: string; rec: Recommendation | 'All'; min: number; max: number }

export function filterResults(rs: Result[], f: Filters): Result[] {
  const q = f.q.trim().toLowerCase();
  return rs.filter((r) =>
    (!q || `${r.name} ${r.company} ${r.position}`.toLowerCase().includes(q)) &&
    (f.rec === 'All' || r.recommendation === f.rec) && r.score >= f.min && r.score <= f.max);
}

export function sortResults(rs: Result[], key: SortKey, dir: 'asc' | 'desc'): Result[] {
  const m = dir === 'asc' ? 1 : -1;
  return [...rs].sort((a, b) => {
    const x = a[key], y = b[key];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * m;
  });
}
