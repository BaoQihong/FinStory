// Simple line icons for asset classes (hand-built SVG geometry).
export type AssetIconKind = 'bonds' | 'cash' | 'stocks' | 'property' | 'currency' | 'commodities';

export function AssetIcon({ kind, className }: { kind: AssetIconKind; className?: string }) {
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
      {kind === 'currency' && (
        <g {...common}>
          <circle cx="12" cy="13" r="6.5" />
          <circle cx="20" cy="19" r="6.5" />
          <path d="M12 10v6M10 11.5h4" />
        </g>
      )}
      {kind === 'commodities' && (
        <g {...common}>
          <path d="M16 5c4 5.5 7 9.3 7 13a7 7 0 0 1-14 0c0-3.7 3-7.5 7-13z" />
          <path d="M13 19a3 3 0 0 0 3 3" />
        </g>
      )}
    </svg>
  );
}
