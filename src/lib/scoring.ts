import type { Connection, Criteria, Recommendation, Result } from './types';

const terms = (s: string) => s.split(/[,\n;]/).map((x) => x.trim().toLowerCase()).filter((x) => x.length > 1);
const hit = (hay: string, list: string[]) => list.filter((t) => hay.includes(t) || t.split(/\s+/).some((w) => w.length > 4 && hay.includes(w.replace(/s$/, ''))));

export function recommend(score: number): Recommendation {
  return score < 35 ? 'Potential Removal' : score < 60 ? 'Review' : 'Keep';
}

/** Transparent heuristic scoring used by demo mode. Deterministic, no external calls. */
export function scoreConnection(c: Connection, cr: Criteria): Result {
  const pos = c.position.toLowerCase(), co = c.company.toLowerCase(), hay = `${pos} ${co}`;
  const titles = hit(pos, terms(cr.titles));
  const inds = hit(hay, terms(cr.industries));
  const comps = hit(hay, terms(cr.companies));
  const keepers = hit(`${c.name.toLowerCase()} ${hay}`, terms(cr.keep));
  const lows = hit(`${hay}`, terms(cr.lessRelevant));
  const empty = !c.position && !c.company;
  let score = 30;
  const why: string[] = [];
  if (titles.length) { score += 30; why.push(`title matches "${titles[0]}"`); }
  if (inds.length) { score += 15; why.push(`industry signal "${inds[0]}"`); }
  if (comps.length) { score += 10; why.push(`company fits "${comps[0]}"`); }
  if (keepers.length) { score += 20; why.push(`matches keep list "${keepers[0]}"`); }
  if (lows.length) { score -= 25; why.push(`matches less-relevant "${lows[0]}"`); }
  if (empty) { score -= 10; why.push('no company or position listed'); }
  if (!why.length) why.push('no overlap with your criteria');
  score = Math.max(0, Math.min(100, score));
  const known = [c.position, c.company, c.url].filter(Boolean).length;
  const confidence = Math.min(95, 35 + known * 15 + (why.length > 1 ? 10 : 0));
  const recommendation = recommend(score);
  return { ...c, score, recommendation, confidence, explanation: `Demo heuristic: ${why.join('; ')}.` };
}

export const scoreAll = (cs: Connection[], cr: Criteria): Result[] =>
  cs.map((c) => scoreConnection(c, cr)).sort((a, b) => a.score - b.score);
