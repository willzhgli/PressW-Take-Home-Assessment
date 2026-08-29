/**
 * Compliance helpers: the allergen disclosure footer, and a keyword backstop
 * that scans a reply for a user's stored allergens.
 *
 * The scan is defense-in-depth, not a guarantee — the primary mechanism is the
 * allergy line in the system prompt. On a hit the UI shows a warning banner
 * rather than blocking the reply, to limit the damage from false positives.
 */

// Placeholder wording — legal offered to workshop the exact language.
export const ALLERGEN_FOOTER =
  "Always check ingredient labels and packaging yourself for allergens and anything you need to avoid. PantryPal can be wrong, and isn't a substitute for medical or food-safety advice.";

// Curated groups: an allergen -> terms that signal its presence in a recipe.
const ALLERGEN_TERMS: Record<string, string[]> = {
  shellfish: [
    "shellfish", "shrimp", "prawn", "crab", "lobster", "crawfish", "crayfish",
    "langoustine", "scampi", "clam", "mussel", "oyster", "scallop", "squid",
    "calamari", "octopus", "crustacean", "mollusk",
  ],
  fish: [
    "fish", "anchovy", "anchovies", "salmon", "tuna", "cod", "haddock",
    "halibut", "tilapia", "trout", "sardine", "mackerel", "sea bass", "snapper",
    "fish sauce", "worcestershire",
  ],
  peanut: ["peanut", "groundnut", "goober"],
  "tree nut": [
    "almond", "walnut", "pecan", "cashew", "pistachio", "hazelnut", "macadamia",
    "brazil nut", "pine nut", "chestnut", "praline", "marzipan", "frangipane",
    "nutella", "amaretto", "nougat", "gianduja",
  ],
  dairy: [
    "milk", "butter", "cheese", "cream", "yogurt", "yoghurt", "ghee", "casein",
    "whey", "buttermilk", "curd", "paneer", "ricotta", "mozzarella", "parmesan",
    "mascarpone", "custard",
  ],
  egg: ["egg", "mayonnaise", "mayo", "meringue", "aioli", "albumen"],
  soy: ["soy", "soya", "soybean", "tofu", "edamame", "tempeh", "miso", "tamari"],
  wheat: [
    "wheat", "flour", "bread", "pasta", "couscous", "bulgur", "semolina",
    "farro", "seitan", "breadcrumb", "cracker",
  ],
  gluten: [
    "wheat", "barley", "rye", "malt", "flour", "bread", "pasta", "couscous",
    "bulgur", "semolina", "farro", "seitan", "breadcrumb", "beer",
  ],
  sesame: ["sesame", "tahini", "benne", "gomashio", "halva"],
};

const ALIASES: Record<string, string> = {
  nut: "tree nut", nuts: "tree nut", "tree nuts": "tree nut", treenut: "tree nut",
  peanuts: "peanut", "ground nut": "peanut",
  milk: "dairy", lactose: "dairy", "dairy products": "dairy",
  shrimp: "shellfish", prawns: "shellfish", crustaceans: "shellfish",
  mollusks: "shellfish", eggs: "egg", soya: "soy", soybeans: "soy",
  "sesame seed": "sesame", "sesame seeds": "sesame",
};

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Which curated groups a stored allergy string maps to (may be none). */
function resolveGroups(raw: string): string[] {
  const n = raw.toLowerCase().trim().replace(/\s+/g, " ");
  if (!n) return [];
  if (n === "seafood") return ["fish", "shellfish"];
  const direct = Object.keys(ALLERGEN_TERMS).find((k) => n === k || n.includes(k));
  if (direct) return [direct];
  if (ALIASES[n]) return [ALIASES[n]!];
  const singular = n.endsWith("s") ? n.slice(0, -1) : n;
  if (ALIASES[singular]) return [ALIASES[singular]!];
  if (ALLERGEN_TERMS[singular]) return [singular];
  return [];
}

/** Whole-word match for `term`, skipping obvious negations ("nut-free", "no shrimp"). */
function mentions(haystack: string, term: string): boolean {
  // trailing (e)s so a singular term still matches "eggs", "almonds", "clams"
  const re = new RegExp(`\\b${escapeRegex(term)}(?:e?s)?\\b`, "g");
  for (let m = re.exec(haystack); m; m = re.exec(haystack)) {
    const end = m.index + m[0].length;
    const after = haystack.slice(end, end + 6);
    const before = haystack.slice(Math.max(0, m.index - 26), m.index);
    if (/^[-\s]?free/.test(after)) continue; // "nut-free", "dairy free"
    if (/free[-\s]*$/.test(before)) continue; // "dairy-free milk", "gluten free bread"
    if (/\b(no|without|skip|omit|sans|hold the|free of|instead of|sub(?:stitute)? for)\b[\w\s,]{0,20}$/.test(before)) {
      continue; // "no shrimp", "without any shellfish", "skip the cheese"
    }
    return true;
  }
  return false;
}

export interface AllergenHit {
  /** The user's stored allergy that matched. */
  allergy: string;
  /** The terms found in the text. */
  terms: string[];
}

/**
 * Scan `text` for anything that looks like one of the user's stored allergens.
 * Returns one hit per matching allergy.
 */
export function scanForAllergens(
  text: string,
  allergies: string[],
): AllergenHit[] {
  const haystack = text.toLowerCase();
  const hits: AllergenHit[] = [];

  for (const allergy of allergies) {
    const terms = new Set<string>();
    const literal = allergy.toLowerCase().trim();
    if (literal.length >= 3) terms.add(literal);
    for (const group of resolveGroups(allergy)) {
      for (const t of ALLERGEN_TERMS[group] ?? []) terms.add(t);
    }

    const matched = [...terms].filter((t) => mentions(haystack, t));
    if (matched.length > 0) hits.push({ allergy, terms: matched });
  }

  return hits;
}
