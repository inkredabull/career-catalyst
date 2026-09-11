/**
 * Company Targets — companies whose job boards we poll directly.
 *
 * These hit the ATS's own public JSON API rather than a web search, so each
 * entry is free to add: it costs no search credits, and it returns structured
 * title/location/publish-date instead of a regex-parsed page title.
 *
 * Adding a company:
 *   1. Find the board token — the slug in the careers-page URL, e.g.
 *      jobs.ashbyhq.com/openai → ashby + "openai".
 *   2. VERIFY IT LIVE before committing. Tokens rot, and companies migrate
 *      between ATS vendors without changing their careers URL:
 *        curl -s -o /dev/null -w '%{http_code}\n' \
 *          https://boards-api.greenhouse.io/v1/boards/<token>/jobs
 *          https://api.ashbyhq.com/posting-api/job-board/<token>
 *          https://api.lever.co/v0/postings/<token>?mode=json
 *      A 200 with an empty `jobs` array means wrong vendor, not "not hiring".
 */
export type AtsProvider = "greenhouse" | "lever" | "ashby";

export interface CompanyTarget {
  /**
   * Display name, and the exact suffix of the `Target/{name}` search label.
   * notify.ts geoLabel() does `search.slice(7)` and matches this verbatim,
   * so it must be unique and must not contain "/".
   */
  name: string;
  ats: AtsProvider;
  /** Board token, verified live against the provider's API. */
  token: string;
  /** Email section routing only: "sf" → San Francisco / Bay Area, "us" → Remote US. */
  geo: "sf" | "us";
}

export const COMPANY_TARGETS: CompanyTarget[] = [
  // --- Frontier labs -------------------------------------------------------
  { name: "Anthropic", ats: "greenhouse", token: "anthropic", geo: "sf" },
  { name: "OpenAI", ats: "ashby", token: "openai", geo: "sf" },
  { name: "Perplexity", ats: "ashby", token: "perplexity", geo: "sf" },
  { name: "ElevenLabs", ats: "ashby", token: "elevenlabs", geo: "sf" },

  // --- AI application layer ------------------------------------------------
  { name: "Cursor", ats: "ashby", token: "cursor", geo: "sf" },
  { name: "Sierra", ats: "ashby", token: "sierra", geo: "sf" },
  { name: "Harvey", ats: "ashby", token: "harvey", geo: "sf" },
  { name: "Glean", ats: "greenhouse", token: "gleanwork", geo: "sf" },
  { name: "LangChain", ats: "ashby", token: "langchain", geo: "sf" },
  { name: "Scale AI", ats: "greenhouse", token: "scaleai", geo: "sf" },

  // --- Developer infrastructure --------------------------------------------
  { name: "Vercel", ats: "greenhouse", token: "vercel", geo: "sf" },
  { name: "Replit", ats: "ashby", token: "replit", geo: "sf" },
  { name: "Baseten", ats: "ashby", token: "baseten", geo: "sf" },
  { name: "Databricks", ats: "greenhouse", token: "databricks", geo: "sf" },
  { name: "Modal", ats: "ashby", token: "modal", geo: "us" },

  // --- Product / fintech ---------------------------------------------------
  { name: "Stripe", ats: "greenhouse", token: "stripe", geo: "sf" },
  { name: "Figma", ats: "greenhouse", token: "figma", geo: "sf" },
  { name: "Notion", ats: "ashby", token: "notion", geo: "sf" },
  { name: "Ramp", ats: "ashby", token: "ramp", geo: "us" },
  { name: "Linear", ats: "ashby", token: "linear", geo: "us" },
];

/**
 * Verified dead as of the 2026-09 seeding pass — these 404 or return an empty
 * board, usually because the company migrated vendors. Listed so the next
 * person doesn't re-add them from a stale careers URL:
 *   greenhouse: openai, notion, retool, hashicorp, sourcegraph, docker, perplexityai
 *   ashby:      vercel, anysphere, modallabs, flyio, togetherai, mistral, rippling
 *   lever:      mistral, sourcegraph, pinecone, temporal, cohere, wandb, dbtlabs
 *
 * No Lever board is seeded: the live Lever boards in this segment are not
 * relevant to this search. The Lever normalizer ships tested against a
 * captured fixture so the path is ready when a target does use it.
 */
