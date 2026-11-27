// Server-only loader: binds the FRED fixtures to the story builder.
// Imported by Server Components only, so the full daily history never
// reaches the browser — client charts receive just the points they draw.
import 'server-only';
import type { SeriesFixture } from '@/lib/data/types';
import DGS10 from '@/data/fred/DGS10.json';
import DFII10 from '@/data/fred/DFII10.json';
import DFF from '@/data/fred/DFF.json';
import CPILFESL from '@/data/fred/CPILFESL.json';
import GDP from '@/data/fred/A191RL1Q225SBEA.json';
import { buildBondComeback, type BondComebackData } from './build';

let cached: BondComebackData | undefined;

export function getBondComebackData(): BondComebackData {
  cached ??= buildBondComeback({
    DGS10: DGS10 as SeriesFixture,
    DFII10: DFII10 as SeriesFixture,
    DFF: DFF as SeriesFixture,
    CPILFESL: CPILFESL as SeriesFixture,
    A191RL1Q225SBEA: GDP as SeriesFixture,
  });
  return cached;
}
