// Decorative geometry for navy hero bands — pure vector shapes, no imagery.
// Concentric arcs and a measuring scale nod to Seshat as the goddess of
// measurement and to the sun-disc motifs of Egyptian art, kept restrained.
export function HeroPattern({ className, scale = true }: { className?: string; scale?: boolean }) {
  const ticks = Array.from({ length: 41 }, (_, i) => i);
  return (
    <svg viewBox="0 0 600 420" className={className} aria-hidden="true" fill="none" preserveAspectRatio="xMaxYMid slice">
      <defs>
        <radialGradient id="hp-glow" cx="70%" cy="55%" r="55%">
          <stop offset="0%" stopColor="#d4a94f" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#d4a94f" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="600" height="420" fill="url(#hp-glow)" />
      <g stroke="#d4a94f" strokeOpacity="0.35">
        {[60, 105, 150, 195, 240, 285].map((r, i) => (
          <circle key={r} cx="420" cy="430" r={r} strokeWidth={i === 2 ? 1.4 : 0.8} strokeDasharray={i % 2 ? '2 6' : undefined} />
        ))}
      </g>
      {/* rays from the disc */}
      <g stroke="#e6c37a" strokeOpacity="0.28" strokeWidth="0.8">
        {Array.from({ length: 13 }, (_, i) => {
          const a = Math.PI + (i * Math.PI) / 12;
          return (
            <line
              key={i}
              x1={420 + 70 * Math.cos(a)}
              y1={430 + 70 * Math.sin(a)}
              x2={420 + 330 * Math.cos(a)}
              y2={430 + 330 * Math.sin(a)}
            />
          );
        })}
      </g>
      {/* measuring scale */}
      {scale ? (
      <g stroke="#e6c37a" strokeOpacity="0.45" className="hidden md:inline">
        <line x1="120" y1="60" x2="600" y2="60" strokeWidth="0.8" />
        {ticks.map((i) => (
          <line key={i} x1={120 + i * 12} y1="60" x2={120 + i * 12} y2={i % 5 === 0 ? 72 : 66} strokeWidth="0.8" />
        ))}
      </g>
      ) : null}
    </svg>
  );
}
