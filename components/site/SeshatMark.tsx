// The Seshat emblem, drawn as vector geometry (no imagery): a seven-pointed
// star — the goddess's traditional symbol — beneath an arc, standing on a
// measuring staff. Purely decorative unless a title is provided.
export function SeshatMark({ className, title }: { className?: string; title?: string }) {
  const points = Array.from({ length: 7 }, (_, i) => {
    const a = (-90 + (i * 360) / 7) * (Math.PI / 180);
    return [20 + 9 * Math.cos(a), 19 + 9 * Math.sin(a)];
  });
  return (
    <svg
      viewBox="0 0 40 48"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      {title ? <title>{title}</title> : null}
      {/* arc (the inverted bow above the star) */}
      <path d="M7 6.5 C 13 13, 27 13, 33 6.5" />
      {/* seven rays */}
      {points.map(([x, y], i) => (
        <line key={i} x1="20" y1="19" x2={x.toFixed(2)} y2={y.toFixed(2)} />
      ))}
      <circle cx="20" cy="19" r="2.2" fill="currentColor" stroke="none" />
      {/* staff with measuring notches */}
      <line x1="20" y1="28" x2="20" y2="46" />
      <line x1="16.5" y1="34" x2="23.5" y2="34" />
      <line x1="17.5" y1="40" x2="22.5" y2="40" />
    </svg>
  );
}
