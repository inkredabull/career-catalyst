/**
 * Geo filter for ATS results.
 *
 * The Serper searches this layer replaces carried geo in the query itself
 * (`site:… "San Francisco"`, `after:… , US`). Board APIs have no such filter —
 * they return the company's entire global req list — so without this a single
 * multinational like Databricks floods the digest with Singapore, Bengaluru and
 * Munich postings.
 *
 * Deliberately an allowlist: a location must show positive evidence of being US
 * or Bay Area to survive. Anything unrecognised is assumed foreign, because the
 * failure mode we care about is noise, not the occasional missed posting — and
 * a missed posting still shows up via the LinkedIn and discovery sources.
 */

/** Two-letter state codes, only ever matched immediately after a comma. */
const STATE_CODES =
  "AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC";

const US_SIGNALS: RegExp[] = [
  /\bunited states\b/i,
  /\bu\.?s\.?a?\b/i,
  /\bnorth america\b/i,
  // "Boston, MA", "Columbia, MD; Washington, DC". Anchoring on the comma and
  // requiring a trailing boundary keeps ", India" / ", Delhi" / ", Oregon"
  // from matching IN / DE / OR.
  new RegExp(`,\\s*(${STATE_CODES})\\b`),
  /\b(California|New York|Washington State|Massachusetts|Texas|Colorado|Illinois|Georgia|Florida|Virginia|Maryland|Oregon|Utah|Arizona|Pennsylvania|North Carolina|New Jersey|Minnesota|Michigan|Ohio|Tennessee)\b/i,
  // Metros that commonly appear without a state qualifier.
  /\b(San Francisco|Bay Area|Silicon Valley|NYC|New York City|Seattle|Boston|Austin|Denver|Chicago|Los Angeles|San Jose|Palo Alto|Mountain View|Menlo Park|Sunnyvale|Bellevue|Redmond|Atlanta|Miami|Dallas|Houston|Philadelphia|San Diego|Pittsburgh|Portland)\b/i,
];

/**
 * True when a board's location string is plausibly US or Bay Area.
 *
 * An empty location is kept: the provider simply gave us nothing, and dropping
 * those would silently discard whole boards. A bare "Remote" is kept for the
 * same reason — unqualified remote roles are usually US-inclusive.
 */
export function isUsOrBayArea(location: string): boolean {
  const loc = location.trim();
  if (!loc) return true;
  if (/^remote$/i.test(loc)) return true;
  return US_SIGNALS.some((re) => re.test(loc));
}
