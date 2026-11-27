// Curated registry of commonly useful, reliable series — *hints* for data
// discovery, not a whitelist. Discovery also runs FRED's live series search
// for every requirement, so stories outside these themes still find data.
// Every id here was checked against the provider API (scripts/studio/check-registry.mjs).
export type RegistryEntry = { provider: 'fred' | 'tiingo' | 'eia'; id: string; title: string; tags: string[] };

const fred = (id: string, title: string, tags: string): RegistryEntry => ({ provider: 'fred', id, title, tags: tags.split(' ') });
const eia = (id: string, title: string, tags: string): RegistryEntry => ({ provider: 'eia', id, title, tags: tags.split(' ') });
const tiingo = (id: string, title: string, tags: string): RegistryEntry => ({ provider: 'tiingo', id, title, tags: tags.split(' ') });

export const REGISTRY: RegistryEntry[] = [
  // US rates and credit
  fred('DGS10', '10-Year Treasury yield', 'treasury yield bond rates interest us long'),
  fred('DGS2', '2-Year Treasury yield', 'treasury yield bond rates interest us short'),
  fred('DGS3MO', '3-Month Treasury bill yield', 'treasury bill yield rates interest us short cash'),
  fred('DFF', 'Effective federal funds rate', 'fed policy rate interest us monetary central bank'),
  fred('DFII10', '10-Year TIPS real yield', 'real yield tips inflation treasury bond us'),
  fred('T10YIE', '10-Year breakeven inflation rate', 'breakeven inflation expectations treasury us'),
  fred('T10Y2Y', '10-Year minus 2-Year Treasury spread', 'yield curve spread inversion recession treasury us'),
  fred('MORTGAGE30US', '30-Year fixed mortgage rate', 'mortgage housing rates interest us household'),
  // US inflation, growth, labour
  fred('CPIAUCSL', 'Consumer Price Index, all items (index)', 'inflation cpi prices consumer us'),
  fred('CPILFESL', 'Core CPI, ex food and energy (index)', 'inflation core cpi prices us'),
  fred('PCEPILFE', 'Core PCE price index', 'inflation pce core prices us fed'),
  fred('UNRATE', 'Unemployment rate', 'jobs labour labor unemployment employment us'),
  fred('PAYEMS', 'Nonfarm payrolls (thousands)', 'jobs payrolls employment labor us'),
  fred('A191RL1Q225SBEA', 'Real GDP growth (annualised q/q)', 'gdp growth economy output recession us'),
  fred('INDPRO', 'Industrial production index', 'industry manufacturing production output us'),
  fred('RSAFS', 'Retail sales (millions of dollars)', 'consumer spending retail sales demand us'),
  // FX
  fred('DEXJPUS', 'Japanese yen per US dollar', 'yen japan currency fx exchange dollar usdjpy'),
  fred('DEXUSEU', 'US dollars per euro', 'euro currency fx exchange dollar eurusd europe'),
  fred('DEXUSUK', 'US dollars per British pound', 'pound sterling currency fx exchange uk gbpusd'),
  fred('DEXCHUS', 'Chinese yuan per US dollar', 'yuan renminbi china currency fx exchange'),
  fred('DTWEXBGS', 'Broad trade-weighted US dollar index', 'dollar index currency fx trade weighted'),
  // Japan
  fred('IRLTLT01JPM156N', 'Japan 10-year government bond yield (monthly)', 'japan jgb yield bond rates interest boj long'),
  fred('IR3TIB01JPM156N', 'Japan 3-month interbank rate (monthly)', 'japan short rate interest boj money market'),
  fred('IRSTCI01JPM156N', 'Japan overnight call rate (monthly)', 'japan policy rate call boj monetary interest'),
  // Europe
  fred('IRLTLT01DEM156N', 'Germany 10-year government bond yield (monthly)', 'germany bund yield bond europe euro rates'),
  fred('ECBDFR', 'ECB deposit facility rate', 'ecb policy rate europe euro monetary central bank'),
  // Energy and commodities
  fred('DCOILWTICO', 'WTI crude oil spot price', 'oil crude wti energy price commodity'),
  fred('DCOILBRENTEU', 'Brent crude oil spot price', 'oil crude brent energy price commodity'),
  // EIA (used only when EIA_API_KEY is configured; FRED does not carry current EIA petroleum data)
  eia('PET.WCESTUS1.W', 'US commercial crude oil inventories ex SPR (weekly)', 'oil crude inventories stocks storage energy us eia'),
  eia('PET.WCRFPUS2.W', 'US crude oil field production (weekly)', 'oil crude production supply output energy us eia'),
  fred('GASREGW', 'US regular gasoline retail price (weekly)', 'gasoline petrol fuel energy price consumer'),
  fred('DHHNGSP', 'Henry Hub natural gas spot price', 'natural gas energy price commodity lng'),
  fred('PCOPPUSDM', 'Global copper price (monthly)', 'copper metals commodity industrial price'),
  // US equities and volatility
  fred('SP500', 'S&P 500 index (daily close)', 'equities stocks sp500 index market us shares'),
  fred('NASDAQCOM', 'NASDAQ Composite index', 'equities stocks nasdaq technology tech index market'),
  fred('NIKKEI225', 'Nikkei 225 stock average (daily close)', 'japan equities stocks nikkei index market shares tokyo'),
  fred('VIXCLS', 'CBOE VIX volatility index', 'volatility vix fear risk equities market'),
  // Exchange-traded funds (Tiingo, daily adjusted close)
  tiingo('SPY', 'SPDR S&P 500 ETF', 'equities stocks sp500 us market shares etf'),
  tiingo('QQQ', 'Invesco QQQ (Nasdaq-100) ETF', 'equities technology tech nasdaq growth etf'),
  tiingo('IWM', 'iShares Russell 2000 ETF', 'equities small cap stocks us etf'),
  tiingo('EWJ', 'iShares MSCI Japan ETF', 'japan equities stocks nikkei etf'),
  tiingo('DXJ', 'WisdomTree Japan Hedged Equity ETF', 'japan equities hedged yen exporters etf'),
  tiingo('FXY', 'Invesco CurrencyShares Japanese Yen Trust', 'yen japan currency etf'),
  tiingo('XLE', 'Energy Select Sector SPDR ETF', 'energy oil equities stocks sector etf'),
  tiingo('XOP', 'SPDR S&P Oil & Gas Exploration & Production ETF', 'oil gas producers equities shale etf'),
  tiingo('USO', 'United States Oil Fund', 'oil crude wti futures etf commodity'),
  tiingo('GLD', 'SPDR Gold Shares', 'gold precious metals commodity etf'),
  tiingo('TLT', 'iShares 20+ Year Treasury Bond ETF', 'treasury bonds long duration etf'),
  tiingo('XLF', 'Financial Select Sector SPDR ETF', 'banks financials equities sector etf'),
  tiingo('EEM', 'iShares MSCI Emerging Markets ETF', 'emerging markets equities etf'),
];

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9&]+/).filter((w) => w.length > 1);

/** Registry entries ranked by keyword overlap with a requirement description. */
export function registryMatches(query: string, limit = 4): RegistryEntry[] {
  const q = new Set(words(query));
  return REGISTRY.map((e) => ({ e, score: [...e.tags, ...words(e.title)].filter((t) => q.has(t)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.e);
}
