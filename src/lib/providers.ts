import { recommend, scoreAll } from './scoring';
import type { Connection, Criteria, Result } from './types';

export interface AnalysisProvider {
  id: 'demo' | 'jev';
  external: boolean;
  analyze(batch: Connection[], criteria: Criteria): Promise<Result[]>;
}
export class ProviderUnavailable extends Error {}

export const demoProvider: AnalysisProvider = {
  id: 'demo', external: false,
  analyze: async (batch, criteria) => scoreAll(batch, criteria),
};

const URL_ = process.env.JEV_API_URL || 'https://api.typesafe.ai/v1/systemone';
const MODEL = process.env.JEV_MODEL || 'jev-latest';

async function askJev(c: Connection, cr: Criteria, key: string): Promise<Result> {
  const instructions = [
    "Is this LinkedIn connection relevant to the user's ideal professional network?",
    `Target titles: ${cr.titles}`, `Target industries: ${cr.industries}`,
    `Target companies: ${cr.companies}`, `People to keep: ${cr.keep}`,
    `Less relevant types: ${cr.lessRelevant}`, `Notes: ${cr.custom}`,
  ].join('\n');

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(URL_, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        model: MODEL,
        state: { name: c.name, company: c.company, position: c.position },
        questions: { relevant: { type: 'noul', instructions } },
      }),
    });
    if (res.status === 401 || res.status === 403) throw new ProviderUnavailable('Jev rejected the API key. Check JEV_API_KEY.');
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1000 * (attempt + 1))); continue; }
    if (!res.ok) throw new Error('Jev request failed');
    const data = await res.json();
    const p = data?.answers?.relevant?.noul;
    if (typeof p !== 'number') throw new Error('Unexpected Jev response');
    const score = Math.round(p * 100);
    return {
      ...c, score, recommendation: recommend(score),
      confidence: Math.round(Math.abs(p - 0.5) * 200),
      explanation: `Jev: ${score}% probability this connection fits your criteria.`,
    };
  }
  throw new Error('Jev is busy or rate limited. Please retry.');
}

export const jevProvider: AnalysisProvider = {
  id: 'jev', external: true,
  analyze: async (batch, criteria) => {
    const key = process.env.JEV_API_KEY;
    if (!key) throw new ProviderUnavailable('Jev is not configured. Set JEV_API_KEY in .env.local.');
    const out: Result[] = [];
    for (let i = 0; i < batch.length; i += 5) {
      out.push(...(await Promise.all(batch.slice(i, i + 5).map((c) => askJev(c, criteria, key)))));
    }
    return out.sort((a, b) => a.score - b.score);
  },
};

export const getProvider = (mode: string): AnalysisProvider => (mode === 'jev' ? jevProvider : demoProvider);