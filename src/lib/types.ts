export type Recommendation = 'Keep' | 'Review' | 'Potential Removal';
export interface Connection { id: string; name: string; company: string; position: string; url: string; email: string }
export interface Criteria { titles: string; industries: string; companies: string; keep: string; lessRelevant: string; custom: string }
export interface Result extends Connection { score: number; recommendation: Recommendation; explanation: string; confidence: number }
export type CleanupStatus = 'queued' | 'confirmed' | 'removed';

export const EXAMPLE_CRITERIA: Criteria = {
  titles: 'Founder, CEO, GTM Engineer, Growth, Revenue Operations, VP Sales, Account Executive, Recruiter',
  industries: 'SaaS, Software, Startup, B2B, Sales Tech, Venture Capital',
  companies: 'Early-stage startups, SaaS companies, GTM agencies, recruiting firms',
  keep: 'Founders, GTM engineers, B2B sales leaders, recruiters hiring for GTM roles',
  lessRelevant: 'MLM, crypto trading, students with no company, unrelated retail',
  custom: 'I am a GTM Engineer building a network of startup founders and B2B sales leaders.',
};
