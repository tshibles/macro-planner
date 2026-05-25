const STRIP_ADJECTIVES = new Set([
  "ripe", "grilled", "cooked", "large", "fresh", "diced",
  "frozen", "day-old", "vanilla", "chocolate", "white",
]);

// OR-pattern aliases that can't be resolved by word stripping alone
const INGREDIENT_ALIASES: Record<string, string> = {
  "milk or unsweetened almond milk": "milk",
};

export function normalizeKey(raw: string): string {
  let s = raw
    .replace(/\([^)]*\)/g, "")   // strip parentheticals e.g. "(any color)"
    .replace(/,.*$/, "")          // strip everything after first comma e.g. ", diced"
    .trim()
    .toLowerCase();

  if (INGREDIENT_ALIASES[s]) return INGREDIENT_ALIASES[s];

  const words = s.split(/\s+/);
  let filtered = words.filter((w) => !STRIP_ADJECTIVES.has(w));
  if (filtered.length === 0) filtered = words;

  // Remove "or"/"and" connectors left dangling at a boundary after stripping flavour/prep adjectives.
  // Keeps interior connectors (e.g. "chicken or vegetable broth") intact.
  filtered = filtered.filter(
    (w, i, arr) => (w !== "or" && w !== "and") || (i > 0 && i < arr.length - 1)
  );
  if (filtered.length === 0) filtered = words;

  s = filtered.join(" ").trim();

  // Singularize: strip trailing 's' but skip 'ss' (hummus), 'us' (asparagus),
  // and cases where the remaining word would end in 'ie' (berries→berrie) or 'oe' (tomatoes→tomatoe).
  if (s.endsWith("s") && s.length > 3 && !s.endsWith("ss") && !s.endsWith("us")) {
    const candidate = s.slice(0, -1);
    if (!candidate.endsWith("ie") && !candidate.endsWith("oe")) {
      s = candidate;
    }
  }

  return s;
}
