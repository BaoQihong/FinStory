const STYLES: Record<string, [string, string]> = {
  generating: ['Generating', 'bg-[#e5ebf6] text-ev-context'],
  draft: ['Ready for review', 'bg-[#e3f1ec] text-ev-documented'],
  needs_attention: ['Needs attention', 'bg-[#fff4ec] text-[#9a3412]'],
  generation_failed: ['Generation failed', 'bg-[#fbe9e7] text-[#9f1239]'],
};

export function StatusBadge({ status, job }: { status: string; job?: { status: string; stage: string } }) {
  const running = job && (job.status === 'queued' || job.status === 'running');
  const [label, cls] = running ? ['Generating', STYLES.generating[1]] : (STYLES[status] ?? [status, 'bg-cream-200 text-ink-soft']);
  return <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>;
}
