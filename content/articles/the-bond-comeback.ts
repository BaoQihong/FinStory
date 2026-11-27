import type { PublishedArticle } from '@/lib/content/types';

// Demonstration article for Phase 2A. Numbers are written as fact tokens
// ({y10Peak}, {y10Peak.date} …) and resolved from FRED fixtures at build time
// — see lib/stories/bond-comeback/build.ts for how each one is calculated.
// Copy drafted for product-owner editorial review.

export const theBondComeback: PublishedArticle = {
  status: 'published',
  slug: 'the-bond-comeback',
  section: 'markets',
  kicker: 'Markets',
  headline: 'The Bond Comeback: Why Higher Yields Have Made Bonds Worth Owning Again',
  shortHeadline: 'The Bond Comeback',
  dek: 'This autumn the 10-year Treasury yield touched its highest level since 2002 — and almost all of the rise showed up in the real return bonds pay, not in inflation expectations. Here is what changed, and what it could mean for your money.',
  byline: { name: 'Seshat Editorial', role: 'Markets & Macro' },
  publishedAt: '2026-11-26',
  dataModule: 'bond-comeback',
  dataCutoff: '2026-11-24',

  keyPoints: [
    'The 10-year Treasury yield climbed from {y10Low} on {y10Low.date} to {y10Peak} on {y10Peak.date} — its highest close since {y10PeakPrevSince}.',
    'Inflation expectations barely moved. The “real” yield — the return above inflation — accounted for {realRise:short} of the {y10Rise:short} rise.',
    'For savers, bonds once again pay a meaningful return after inflation. For borrowers and stock valuations, that same shift raises the bar.',
  ],

  // ── Layer 2 — Narrative ─────────────────────────────────────────────
  narrative: {
    id: 'story',
    label: 'The Story',
    title: 'The story',
    blocks: [
      {
        type: 'p',
        text: 'For most of the last fifteen years, bonds were the dull, dutiful corner of a portfolio — and for a while, not even that. On {y10Low2020.date}, the 10-year US Treasury yield closed at just {y10Low2020}. Lend the government your money for a decade and inflation would quietly eat more than you earned.',
      },
      {
        type: 'p',
        text: 'That world is gone. On {y10Peak.date}, the 10-year yield closed at {y10Peak}, the highest since {y10PeakPrevSince}. It has eased since, to {y10Latest} on {y10Latest.date} — still well above the {y10YearAgo} it stood at a year earlier.',
      },
      { type: 'h3', text: 'Not where you’d expect' },
      {
        type: 'p',
        text: 'When yields jump, the usual suspect is inflation: lenders want more to make up for rising prices. This time, the inflation story is quiet. Core inflation — which strips out volatile food and energy prices — ran at {coreYoyLatest} over the twelve months to {coreYoyLatest.date}, down from {coreYoyYearAgo} a year before.',
      },
      {
        type: 'p',
        text: 'The bond market says the same thing. Every 10-year yield can be split into two parts: the “real” yield paid on inflation-protected Treasuries, and the remainder, known as breakeven inflation, which reflects the inflation investors are pricing in. Between {y10Low.date} and {y10Peak.date} the 10-year yield rose {y10Rise}. The real yield rose {realRise}. Breakeven inflation moved just {beChange}.',
      },
      {
        type: 'pullquote',
        text: 'The rise showed up in the real return bonds pay — not in the inflation investors expect.',
      },
      {
        type: 'p',
        text: 'At {realPeak} on {realPeak.date}, the real yield reached its highest level since {realPeakPrevSince}, in the depths of the financial crisis. Compare that with 2020 and 2021, when the real yield averaged below zero in {negativeRealMonths} of 24 months: investors were effectively paying the government to hold their money safely.',
      },
      { type: 'h3', text: 'A faster economy, and a Fed that moved the other way' },
      {
        type: 'p',
        text: 'Two things happened alongside the climb. The economy picked up speed: real GDP grew at a {gdpLatest} annual rate in {gdpLatest.date}, up from {gdpPrev} the quarter before. And on {ffHikeDate}, the Federal Reserve’s benchmark rate rose for the first time since {ffPrevHike}, with the effective rate moving from {ffHikeFrom} to {ffHikeTo}.',
      },
      {
        type: 'p',
        text: 'The twelve-month inflation figure looks calm, but the most recent months have run warmer. Over the three months to {core3m.date}, core prices rose at an annualized pace of {core3m}. If that pace persists, it would help explain why the Fed chose to tighten rather than ease — though the Fed’s own reasoning is beyond what this data can show.',
      },
      { type: 'h3', text: 'Why this is a comeback' },
      {
        type: 'p',
        text: 'Rising yields hurt on the way up: when yields climb, the prices of bonds people already own fall. But once yields are higher, the maths changes for anyone buying now. A 10-year Treasury bought on {y10Latest.date} pays {y10Latest} a year for a decade. An inflation-protected Treasury pays {realLatest} on top of inflation.',
      },
      {
        type: 'p',
        text: 'There is a second shift. Throughout 2023 and 2024, cash paid more than bonds: measured as monthly averages, the Fed’s overnight rate was above the 10-year yield in {cashBeatBondsMonths} of those 24 months. Today the 10-year pays {y10OverFf:short} more than the overnight rate. Committing money for longer is being rewarded again.',
      },
      {
        type: 'p',
        text: 'That is the comeback — not a rally, but a return to bonds paying people to own them. Whether it lasts depends on growth, inflation and the Fed. The rest of this story walks through the evidence, how higher yields ripple through the economy, and three ways the next chapter could unfold.',
      },
    ],
  },

  // ── Layer 3 — Macro ─────────────────────────────────────────────────
  macro: {
    id: 'macro',
    label: 'Macro',
    title: 'The big picture: what the numbers say',
    intro: 'Four indicators carry most of this story. Yields are up, the return above inflation is up most of all, inflation itself is steady, and the economy grew strongly in the third quarter.',
    indicators: [
      { key: 'y10', note: 'The benchmark that mortgages and corporate borrowing are priced against.' },
      { key: 'real', note: 'What bonds pay above inflation — where most of 2026’s rise happened.' },
      { key: 'core', note: 'Lower than a year ago, though recent months ran warmer.' },
      { key: 'gdp', note: 'Growth picked up from {gdpPrev} the quarter before.' },
    ],
    charts: [
      {
        type: 'chart',
        chartId: 'longView',
        question: 'How high are bond yields compared with the past twenty years?',
        takeaway: 'After more than a decade near the floor, yields are back where they were around the 2008 financial crisis. The 10-year’s 2026 high was its highest close since {y10PeakPrevSince}; the real yield’s was its highest since {realPeakPrevSince}.',
      },
      {
        type: 'chart',
        chartId: 'thisYear',
        question: 'Where did 2026’s rise in yields come from?',
        takeaway: 'The real yield rose almost step for step with the 10-year yield, while breakeven inflation — the market’s inflation expectation — barely moved.',
      },
    ],
    explainers: [
      {
        title: 'Yields: up {y10Rise:short} from the 2026 low',
        text: 'From {y10Low} on {y10Low.date} to {y10Peak} on {y10Peak.date}. The yield has since eased by {y10OffPeak:short}.',
        evidence: 'documented',
      },
      {
        title: 'Inflation: calmer than a year ago',
        text: 'Core inflation was {coreYoyLatest} over the year to {coreYoyLatest.date}, versus {coreYoyYearAgo} a year earlier. The latest three months ran warmer, at a {core3m} annualized pace.',
        evidence: 'documented',
      },
      {
        title: 'Growth: a strong {gdpLatest.date}',
        text: 'Real GDP grew at a {gdpLatest} annual rate in {gdpLatest.date}. Stronger growth is one plausible reason investors want a higher real return, though this data cannot prove the link.',
        evidence: 'interpretation',
      },
    ],
  },

  // ── Layer 4 — Analytics ─────────────────────────────────────────────
  analytics: {
    id: 'analytics',
    label: 'Analytics',
    title: 'From cause to consequence',
    intro: 'A Treasury yield is the price of safe money. When it moves, it changes the price of almost everything else — but the links run through several steps, and some are firmer than others. We label each one.',
    split: {
      question: 'What is the 10-year yield made of?',
      takeaway: 'Between the 2026 low and high, {realRise:short} of the {y10Rise:short} rise came from the real yield and {beChange:short} from breakeven inflation.',
      note: 'This split is arithmetic, not a causal estimate: the 10-year yield equals the real (TIPS) yield plus breakeven inflation by definition. It shows where the rise appeared, not what caused it.',
    },
    chain: {
      title: 'How higher yields travel',
      steps: [
        {
          title: 'Real yields rise',
          text: 'The 10-year real yield went from {realAtLow} to {realAtPeak} between {y10Low.date} and {y10Peak.date}.',
          evidence: 'documented',
        },
        {
          title: 'Borrowing gets dearer',
          text: 'Mortgages, corporate bonds and many loans are priced off Treasury yields, so higher yields tend to mean costlier credit for households and companies.',
          evidence: 'context',
        },
        {
          title: 'Future profits are worth less today',
          text: 'Investors value companies by discounting future earnings. A higher safe return raises that discount rate, which weighs most on firms whose profits lie far ahead.',
          evidence: 'context',
        },
        {
          title: 'Money gets choosier',
          text: 'With safe assets paying a real return, riskier assets have to work harder to attract money. We expect that to keep valuations more sensitive to bad news.',
          evidence: 'interpretation',
        },
      ],
    },
    chart: {
      type: 'chart',
      chartId: 'policy',
      question: 'Is the Fed pressing on the brakes?',
      takeaway: 'On {ffLatest.date} the Fed’s rate was {ffLatest}, {realPolicy:short} above the latest twelve-month core inflation rate ({coreYoyLatest}, {coreYoyLatest.date}). In 2022 it was the other way round, with inflation far above the Fed’s rate.',
    },
    implications: {
      title: 'What it means for your money',
      intro: 'What the data shows, and what we think it could mean. These are general observations, not personal advice.',
      items: [
        {
          asset: 'Bonds',
          icon: 'bonds',
          shows: 'A new 10-year Treasury yields {y10Latest}; the inflation-protected version pays {realLatest} above inflation.',
          showsEvidence: 'documented',
          couldMean: 'Far higher starting income than buyers were offered in 2020–21. But long-dated bonds still lose value if yields climb again.',
        },
        {
          asset: 'Cash & savings',
          icon: 'cash',
          shows: 'The Fed’s overnight rate is {ffLatest}; the 10-year yield is {y10OverFf:short} higher.',
          showsEvidence: 'documented',
          couldMean: 'Cash still pays, but locking in longer-term rates now earns more — the reverse of 2023–24. Cash rates would fall quickly if the Fed cut.',
        },
        {
          asset: 'Stocks',
          icon: 'stocks',
          shows: 'The real yield reached {realPeak} on {realPeak.date}, its highest since {realPeakPrevSince}.',
          showsEvidence: 'documented',
          couldMean: 'A higher risk-free return raises the bar for shares, especially richly valued growth companies. Strong economic growth can offset some of that pressure.',
        },
        {
          asset: 'Property & mortgages',
          icon: 'property',
          shows: 'Mortgage rates typically track the 10-year Treasury yield. Mortgage rates themselves are not measured in this article.',
          showsEvidence: 'context',
          couldMean: 'Home-buying costs are likely to stay elevated while the 10-year yield remains near current levels.',
        },
      ],
    },
  },

  // ── Layer 5 — Outlook ───────────────────────────────────────────────
  outlook: {
    id: 'outlook',
    label: 'Outlook',
    title: 'What happens next: three scenarios',
    intro: 'Nobody knows where yields go from here. What we can do is lay out the conditions that would push them one way or the other — and the signposts that would tell you which path is unfolding.',
    disclaimer: 'These are editorial scenarios, not forecasts. They are not produced by a forecasting model and carry no probabilities. Nothing here is investment advice.',
    scenarios: [
      {
        key: 'higher-for-longer',
        name: 'Higher for longer',
        summary: 'Growth stays firm and recent price pressures persist, so real yields stay high.',
        conditions: [
          'Growth stays close to the third quarter’s {gdpLatest} pace.',
          'Core inflation’s recent three-month pace ({core3m}) stays above the twelve-month rate.',
          'The Fed holds its rate or raises it again.',
        ],
        whyItMatters: 'Bond income would stay attractive, but anyone holding long-dated bonds remains exposed to further price falls. Pressure on borrowing costs would persist.',
        assets: [
          { asset: 'Bonds', effect: 'High income; long-dated prices stay vulnerable.' },
          { asset: 'Cash', effect: 'Rates stay competitive.' },
          { asset: 'Stocks', effect: 'Valuations remain under pressure.' },
          { asset: 'Property', effect: 'Mortgage costs stay elevated.' },
        ],
        watch: [
          'Monthly core inflation readings',
          'Fed rate decisions and guidance',
          'Whether the real yield revisits its 2026 high of {realPeak}',
        ],
      },
      {
        key: 'cooldown',
        name: 'The cooldown',
        summary: 'Growth slows, inflation eases and the Fed signals it is done tightening.',
        conditions: [
          'GDP growth slows meaningfully from {gdpLatest}.',
          'Monthly core inflation cools back toward the twelve-month rate of {coreYoyLatest}.',
          'The Fed signals a pause or future cuts.',
        ],
        whyItMatters: 'Real yields would likely fall as investors anticipate lower rates. That is the scenario in which today’s bond buyers benefit twice: from income, and from rising prices.',
        assets: [
          { asset: 'Bonds', effect: 'Prices of existing bonds would rise.' },
          { asset: 'Cash', effect: 'Savings rates would drift lower.' },
          { asset: 'Stocks', effect: 'Relief on valuations, offset by slower profit growth.' },
          { asset: 'Property', effect: 'Some easing in borrowing costs.' },
        ],
        watch: ['The next quarterly GDP release', 'The three-month pace of core inflation', 'Fed communication on future rate moves'],
      },
      {
        key: 'inflation-returns',
        name: 'Inflation returns',
        summary: 'Price pressures broaden and investors start demanding inflation protection, not just a real return.',
        conditions: [
          'Core inflation accelerates on a sustained basis.',
          'Breakeven inflation, now {beLatest}, rises meaningfully.',
          'The Fed responds with further increases.',
        ],
        whyItMatters: 'Yields could climb even if real yields hold steady — a less benign kind of rise, because it erodes the purchasing power of ordinary bond income.',
        assets: [
          { asset: 'Ordinary bonds', effect: 'Hurt by rising yields and inflation.' },
          { asset: 'Inflation-protected bonds', effect: 'Better insulated.' },
          { asset: 'Cash', effect: 'Rates may rise with Fed policy.' },
          { asset: 'Stocks', effect: 'Pressure on profit margins and valuations.' },
        ],
        watch: ['Breakeven inflation (10-year yield minus real yield)', 'Core inflation, three-month annualized', 'Fed statements on inflation risks'],
      },
    ],
  },

  methodology: [
    'All figures come from Federal Reserve Economic Data (FRED), retrieved on the date shown in Sources. Daily data run through {dataCutoff}; core CPI through {coreIndexLatest}; GDP through {gdpLatest.date}.',
    'Core inflation is calculated from the core CPI index as the 12-month percentage change: (index this month ÷ index twelve months earlier − 1) × 100. The three-month annualized pace is ((index ÷ index three months earlier)^4 − 1) × 100.',
    'FRED holds no core CPI observation for {cpiMissing}. We do not estimate it: twelve-month rates that depend on that month are left blank.',
    'Breakeven inflation is the 10-year Treasury yield minus the 10-year TIPS (real) yield on the same day.',
    '“Highest since” statements compare daily closes with every earlier observation back to January 2000 (10-year yield) or January 2003 (real yield, the start of the FRED series).',
    'Chart lines spanning many years use monthly averages of daily data; single-day highs are quoted separately in the text.',
  ],
  citations: [],
};
