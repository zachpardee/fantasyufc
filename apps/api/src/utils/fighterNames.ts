// Fighter names differ across data sources: ESPN gives "Saint Denis" where
// The Odds API gives "Saint-Denis", suffixes like "Kamaka III" are dropped by
// bookmakers, and accents vary ("Benoît"/"Benoit"). Normalize both sides
// before comparing so those variants still match.
export function normalizeFighterName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ') // punctuation (hyphens, apostrophes, periods) → spaces
    .replace(/\b(jr|sr|ii|iii|iv)\b/g, ' ') // generational suffixes
    .replace(/\s+/g, ' ')
    .trim();
}

// Whole-word containment on normalized names, so "kamaka" matches
// "kai kamaka" but a short last name can't match inside a longer word.
export function fighterNameContains(haystack: string, lastName: string): boolean {
  const h = ` ${normalizeFighterName(haystack)} `;
  const n = ` ${normalizeFighterName(lastName)} `;
  return n.trim().length > 0 && h.includes(n);
}
