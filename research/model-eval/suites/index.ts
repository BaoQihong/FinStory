// Suite loader for the bench command.
import type { Case } from '../lib/types.ts';
import { analysisCases } from './analysis.ts';
import { writingCases } from './writing.ts';
import { seshatCases } from './seshat.ts';

export async function loadSuite(s: string, o: { subject?: string; cases?: string[]; reps?: number }): Promise<Case[]> {
  let cases: Case[];
  if (s === 'F') cases = seshatCases(o.subject ?? 'households-feel-poorer');
  else if (s === 'E') cases = writingCases();
  else if (['A', 'B', 'C', 'D'].includes(s)) cases = analysisCases().filter((c) => c.suite === s);
  else throw new Error(`unknown suite ${s}`);
  if (o.cases) cases = cases.filter((c) => o.cases!.some((x) => c.id === x || c.id.startsWith(x)));
  if (o.reps) cases = cases.map((c) => ({ ...c, reps: o.reps }));
  return cases;
}
