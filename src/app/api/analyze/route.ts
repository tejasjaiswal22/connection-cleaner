import { NextResponse } from 'next/server';
import { getProvider, ProviderUnavailable } from '@/lib/providers';
import type { Connection, Criteria } from '@/lib/types';

export const runtime = 'nodejs';
const s = (v: unknown, n = 300) => (typeof v === 'string' ? v.slice(0, n) : '');

export async function POST(req: Request) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 }); }
  if (!Array.isArray(body?.connections) || body.connections.length === 0 || body.connections.length > 200) {
    return NextResponse.json({ error: 'Send 1–200 connections per batch.' }, { status: 400 });
  }
  const connections: Connection[] = body.connections.map((c: any, i: number) => ({
    id: s(c?.id, 40) || `c${i}`, name: s(c?.name), company: s(c?.company), position: s(c?.position), url: s(c?.url), email: s(c?.email),
  }));
  const k = body.criteria ?? {};
  const criteria: Criteria = { titles: s(k.titles, 2000), industries: s(k.industries, 2000), companies: s(k.companies, 2000), keep: s(k.keep, 2000), lessRelevant: s(k.lessRelevant, 2000), custom: s(k.custom, 4000) };
  const provider = getProvider(body.mode);
  if (provider.external && body.consent !== true) {
    return NextResponse.json({ error: 'Consent is required before data is sent to an external AI service.' }, { status: 400 });
  }
  try {
    const results = await provider.analyze(connections, criteria);
    return NextResponse.json({ results });
  } catch (e) {
    const unavailable = e instanceof ProviderUnavailable;
    return NextResponse.json({ error: unavailable ? (e as Error).message : 'Analysis failed. Please retry.' }, { status: unavailable ? 501 : 502 });
  }
}
