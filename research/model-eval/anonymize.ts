// Produce anonymised samples for blind review: final-answer text only (no
// reasoning, no model names), one file per response, labelled by a random
// letter per case. The key lives in a separate file so reviewers can be blind.
//
//   node research/model-eval/anonymize.ts <runId> [<runId> …] --suites B,C,E --out samples/pilot
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadDone, safe } from './lib/runner.ts';
import type { RecordRow } from './lib/types.ts';

const HERE = import.meta.dirname;
const args = process.argv.slice(2);
const opt = (n: string) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const suites = (opt('suites') ?? 'A,B,C,D,E').split(',');
const out = join(HERE, opt('out') ?? 'samples');
const runs = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--'));
const onlyRep = opt('rep') ? Number(opt('rep')) : null; // --rep 2: blind-score one repetition on its own
const rows: (RecordRow & { run: string })[] = runs
  .flatMap((r) => [...loadDone(join(HERE, 'results', r)).values()].map((x) => ({ ...x, run: r })))
  .filter((x) => onlyRep === null || x.rep === onlyRep);

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const key: Record<string, Record<string, string>> = {};
for (const caseId of [...new Set(rows.filter((r) => suites.includes(r.suite) && r.result.ok).map((r) => `${r.suite}/${r.case}`))]) {
  const rs = rows.filter((r) => `${r.suite}/${r.case}` === caseId && r.result.ok);
  // Deterministic shuffle per case (hash of case + key), so reruns keep labels stable.
  const order = [...rs].sort((a, b) => createHash('sha1').update(caseId + a.key).digest('hex').localeCompare(createHash('sha1').update(caseId + b.key).digest('hex')));
  const dir = join(out, safe(caseId));
  mkdirSync(dir, { recursive: true });
  key[caseId] = {};
  order.forEach((r, i) => {
    const label = `${LETTERS[i % 26]}${i >= 26 ? Math.floor(i / 26) : ''}`;
    const text = readFileSync(join(HERE, 'results', r.run, 'outputs', `${safe(r.key)}.txt`), 'utf8').replace(/<<<REASONING[\s\S]*?<<<END REASONING>>>\s*/g, '');
    writeFileSync(join(dir, `response-${label}.md`), `<!-- ${caseId} · response ${label} · blind sample -->\n\n${text}\n`);
    key[caseId][label] = `${r.config} (rep ${r.rep})`;
  });
}
writeFileSync(join(out, 'KEY-do-not-open-before-review.json'), JSON.stringify(key, null, 1));
console.log(`anonymised ${Object.values(key).reduce((a, k) => a + Object.keys(k).length, 0)} responses → ${out}`);
