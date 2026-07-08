// Polymarket sports value model.
//
// Goal: find "value" picks on Polymarket by comparing each market's live price
// (the crowd's implied probability) against an independent "fair" probability
// derived from the sharp sportsbook consensus.
//
// Method (transparent, no black box):
//   1. Take the sportsbook consensus American odds for every outcome in a market.
//   2. Convert to raw implied probabilities.
//   3. De-vig: divide each by the market's total (which sums to >100% because of
//      the bookmaker margin) so the fair probabilities sum to 1. The de-vigged
//      number is the best available point estimate of the true probability.
//   4. Edge = fairProb - polymarketPrice. Positive edge => Polymarket is
//      UNDERpricing that outcome (buy YES is +EV). Negative => OVERpriced (fade).
//   5. Size with half-Kelly on the edge, capped, for a sane stake suggestion.
//
// IMPORTANT DATA CAVEAT: this environment cannot reach Polymarket's API, so the
// inputs below are hand-entered SNAPSHOTS researched on ~2026-07-07/08. Prices
// move constantly and sources disagree by a few points. Entries whose sportsbook
// number is a rough estimate are flagged `est: true`. Re-pull before acting.
//
// Run:  npx tsx polymarket-value-model.ts

type Outcome = {
  name: string;
  american: number; // sportsbook consensus American odds
  pm: number; // Polymarket price / implied prob (0..1), null-ish if unknown
  est?: boolean; // sportsbook number is an estimate, not a firm consensus line
  modelProb?: number; // independent projection-model prob (e.g. FanGraphs sim), no vig
  modelSrc?: string; // where modelProb came from
};

type Market = {
  title: string;
  note: string;
  resolves: string;
  outcomes: Outcome[];
};

// American odds -> raw implied probability
const impliedFromAmerican = (a: number): number =>
  a > 0 ? 100 / (a + 100) : -a / (-a + 100);

// Kelly fraction for a binary YES bet priced at `price` with true prob `p`.
// Payout if win = (1 - price)/price to 1. f* = (p*b - (1-p)) / b, b = (1-price)/price.
const kelly = (p: number, price: number): number => {
  const b = (1 - price) / price;
  const f = (p * b - (1 - p)) / b;
  return Math.max(0, f);
};

const markets: Market[] = [
  {
    title: "2026 World Cup — Winner",
    note: "8 teams left (quarterfinals). Full field, so de-vig is clean; the 4 non-favorites' book lines are estimates.",
    resolves: "~2026-07-19",
    outcomes: [
      { name: "France", american: 175, pm: 0.33 },
      { name: "Spain", american: 370, pm: 0.18 },
      { name: "Argentina", american: 450, pm: 0.19 },
      { name: "England", american: 480, pm: 0.14 },
      { name: "Norway", american: 1400, pm: 0.05, est: true },
      { name: "Belgium", american: 1600, pm: 0.04, est: true },
      { name: "Morocco", american: 2500, pm: 0.03, est: true },
      { name: "Switzerland", american: 5000, pm: 0.02, est: true },
    ],
  },
  {
    title: "MLB World Series — Champion 2026",
    note: "30-team futures. When available, FanGraphs sim odds (posted on X by MLB accts) are used as the fair anchor instead of large-field de-vig — no vig, no favorite-longshot distortion.",
    resolves: "~2026-11",
    outcomes: [
      // modelProb = FanGraphs 2026 WS sim snapshot via @MetsMuse on X (mid-2026).
      { name: "Dodgers", american: 200, pm: 0.31, modelProb: 0.284, modelSrc: "FanGraphs" },
      { name: "Yankees", american: 500, pm: 0.14, modelProb: 0.061, modelSrc: "FanGraphs" },
      { name: "Braves", american: 1100, pm: 0.05, modelProb: 0.102, modelSrc: "FanGraphs", est: true },
      { name: "Mariners", american: 1000, pm: 0.06, modelProb: 0.061, modelSrc: "FanGraphs", est: true },
      { name: "Phillies", american: 1100, pm: 0.055, est: true },
      { name: "Brewers", american: 1200, pm: 0.05, est: true },
      { name: "Rest of field", american: -107, pm: 0.335, est: true }, // ~24 teams lumped so total overround ~35% (typical 30-team futures)
    ],
  },
  {
    title: "Wimbledon 2026 — Men's Champion",
    note: "Alcaraz withdrew (wrist). Sinner heavy favorite. De-vig over top of field.",
    resolves: "~2026-07-12",
    outcomes: [
      { name: "Sinner", american: -190, pm: 0.57 },
      { name: "Djokovic", american: 500, pm: 0.14, est: true },
      { name: "Zverev", american: 900, pm: 0.09, est: true },
      { name: "Fritz", american: 1200, pm: 0.07, est: true },
      { name: "Draper", american: 1400, pm: 0.06, est: true },
      { name: "Rest of field", american: 900, pm: 0.07, est: true },
    ],
  },
];

type Row = {
  market: string;
  outcome: string;
  pm: number;
  devig: number; // de-vigged sportsbook fair
  fair: number; // anchor used for the pick (model prob if present, else de-vig)
  anchor: string; // "FanGraphs" | "book"
  edge: number;
  halfKelly: number;
  est: boolean;
};

const rows: Row[] = [];

for (const m of markets) {
  const rawSum = m.outcomes.reduce(
    (s, o) => s + impliedFromAmerican(o.american),
    0
  );
  console.log(`\n=== ${m.title} ===`);
  console.log(`    ${m.note}`);
  console.log(
    `    book overround: ${((rawSum - 1) * 100).toFixed(1)}%  | resolves ${m.resolves}`
  );
  for (const o of m.outcomes) {
    const devig = impliedFromAmerican(o.american) / rawSum; // de-vigged book
    const fair = o.modelProb ?? devig; // prefer an independent model when we have one
    const edge = fair - o.pm;
    const hk = 0.5 * kelly(fair, o.pm); // half-Kelly, only meaningful for +edge YES bets
    rows.push({
      market: m.title,
      outcome: o.name,
      pm: o.pm,
      devig,
      fair,
      anchor: o.modelProb != null ? o.modelSrc ?? "model" : "book",
      edge,
      halfKelly: edge > 0 ? Math.min(hk, 0.1) : 0, // cap 10% bankroll
      est: !!o.est,
    });
  }
}

// Rank by absolute edge, but report direction.
const ranked = [...rows]
  .filter((r) => r.outcome !== "Rest of field")
  .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge));

console.log("\n\n===================== RANKED BY |EDGE| =====================");
console.log(
  "outcome".padEnd(22) +
    "PM%".padStart(7) +
    "fair%".padStart(8) +
    "anchor".padStart(11) +
    "edge".padStart(8) +
    "  action".padEnd(10) +
    "½Kelly"
);
for (const r of ranked) {
  const dir = r.edge > 0 ? "BUY YES" : "FADE";
  const flag = r.est ? " *" : "";
  console.log(
    `${(r.outcome + flag).padEnd(22)}${(r.pm * 100).toFixed(1).padStart(7)}${(
      r.fair * 100
    )
      .toFixed(1)
      .padStart(8)}${r.anchor.padStart(11)}${((r.edge > 0 ? "+" : "") + (r.edge * 100).toFixed(1) + "pp").padStart(
      8
    )}  ${dir.padEnd(9)}${r.halfKelly > 0 ? (r.halfKelly * 100).toFixed(1) + "%" : "-"}`
  );
}

console.log(
  "\n* = sportsbook input is an estimate; treat that row's edge as low-confidence."
);
console.log(
  "anchor = what 'fair%' is based on: 'FanGraphs' = independent sim model (posted on\n" +
    "X by MLB accounts); 'book' = de-vigged sportsbook consensus."
);
console.log(
  "CAVEAT 1: proportional de-vig over a large field (30-team MLB, ~35% overround)\n" +
    "understates heavy favorites (favorite-longshot bias) — which is exactly why the\n" +
    "MLB rows now anchor on FanGraphs instead of the book where available."
);
console.log(
  "CAVEAT 2: it's early July, before the trade deadline. Projection models price the\n" +
    "CURRENT roster, so big-market buyers (Yankees/Dodgers) can look 'overpriced' vs a\n" +
    "model that hasn't baked in the upgrades they'll make. Discount the Yankees fade."
);
console.log(
  "Edge is in probability points (pp). A +Xpp 'BUY YES' means PM is that many\n" +
    "points cheaper than the sharp fair price; 'FADE' means PM is that much richer."
);

export {};
