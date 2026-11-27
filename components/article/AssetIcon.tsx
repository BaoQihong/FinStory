// Simple line icons for asset classes (hand-built SVG geometry).
export function AssetIcon({ kind, className }: { kind: 'bonds' | 'cash' | 'stocks' | 'property'; className?: string }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      {kind === 'bonds' && (
        <g {...common}>
          <rect x="6" y="5" width="20" height="22" rx="1.5" />
          <path d="M10 11h12M10 15h12M10 19h7" />
          <circle cx="22" cy="22" r="2.5" />
        </g>
      )}
      {kind === 'cash' && (
        <g {...common}>
          <rect x="4" y="9" width="24" height="14" rx="1.5" />
          <circle cx="16" cy="16" r="3.5" />
          <path d="M8 13v6M24 13v6" />
        </g>
      )}
      {kind === 'stocks' && (
        <g {...common}>
          <path d="M5 26h22" />
          <path d="M6 21l6-6 5 4 9-10" />
          <path d="M21 9h5v5" />
        </g>
      )}
      {kind === 'property' && (
        <g {...common}>
          <path d="M5 15L16 6l11 9" />
          <path d="M8 13v13h16V13" />
          <path d="M14 26v-7h4v7" />
        </g>
      )}
    </svg>
  );
}
