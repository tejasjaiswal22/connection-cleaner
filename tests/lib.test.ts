import { describe, expect, it } from 'vitest';
import { buildConnections, detectColumns, escapeCell, exportResultsCSV, findHeaderRow, parseCSV } from '../src/lib/csv';
import { scoreAll, scoreConnection } from '../src/lib/scoring';
import { filterResults, sortResults } from '../src/lib/filter';
import { EXAMPLE_CRITERIA } from '../src/lib/types';

const csv = `Notes:\n"preamble"\n\nFirst Name,Last Name,URL,Company,Position\nA,B,https://x/in/a,Acme,"Founder, CEO"\nA,B,https://x/in/a/,Acme,Founder\n,,,,\nC,D,,Zed,Crypto Trader\n`;

describe('csv', () => {
  const rows = parseCSV(csv);
  const h = findHeaderRow(rows);
  it('skips preamble and parses quoted commas', () => {
    expect(rows[h][0]).toBe('First Name');
    expect(rows[h + 1][4]).toBe('Founder, CEO');
  });
  it('dedupes and skips blanks', () => {
    const r = buildConnections(rows, h, detectColumns(rows[h]));
    expect(r.connections).toHaveLength(2);
    expect(r.duplicates).toBe(1);
  });
  it('escapes cells and formula injection', () => {
    expect(escapeCell('a"b,c')).toBe('"a""b,c"');
    expect(escapeCell('=SUM(A1)')).toBe("'=SUM(A1)");
  });
});

describe('scoring, filtering, export', () => {
  const cs = [
    { id: '1', name: 'A', company: 'Acme SaaS', position: 'Founder', url: 'u1', email: '' },
    { id: '2', name: 'B', company: 'Zed', position: 'Crypto Trader', url: '', email: '' },
  ];
  const rs = scoreAll(cs, EXAMPLE_CRITERIA);
  it('ranks lowest relevance first', () => {
    expect(rs[0].name).toBe('B');
    expect(rs[0].recommendation).toBe('Potential Removal');
    expect(rs[1].recommendation).toBe('Keep');
  });
  it('works with empty criteria', () => {
    const r = scoreConnection(cs[0], { titles: '', industries: '', companies: '', keep: '', lessRelevant: '', custom: '' });
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
  it('filters and sorts', () => {
    expect(filterResults(rs, { q: 'acme', rec: 'All', min: 0, max: 100 })).toHaveLength(1);
    expect(filterResults(rs, { q: '', rec: 'Keep', min: 0, max: 100 })[0].name).toBe('A');
    expect(sortResults(rs, 'score', 'desc')[0].name).toBe('A');
  });
  it('exports csv with header', () => {
    expect(exportResultsCSV(rs).split('\r\n')[0]).toContain('Recommendation');
  });
});
