/**
 * Warmup email template tokens — mirrors the Gmail draft used by mail-merge.
 *
 * Static body (role pitch, blurb, Calendly, signature) lives in the Gmail draft.
 * The agent fills dynamic tokens at generation time.
 */
export const WARMUP_TEMPLATE_SUBJECT_DEFAULT = 'Catching up + a quick ask';

export const WARMUP_TEMPLATE_TOKENS = [
  'First',
  'Zeitgeisty',
  'Personalization',
  'Reciprocate',
  'Valediction',
  'ContactURL',
] as const;

export type WarmupTemplateToken = (typeof WARMUP_TEMPLATE_TOKENS)[number];

/** Reference body shape (static portion from Gmail draft) */
export const WARMUP_TEMPLATE_BODY_REFERENCE = `Hi {{First}},

{{Zeitgeisty}}{{Personalization}}

I'm looking for a new fractional (or even full-time) hands-on player/coach role. I build from zero and rescues companies from the brink, connecting fragmented signals across customers, product, engineering, and operations into alignment, then scaling small, senior full-stack teams into predictable delivery engines.

Seeking seed–Series A companies (roughly $2M–$15M raised) that have strong product-market signal but are struggling to ship consistently — where the technical leadership gap is the constraint on growth. eCommerce experience and/or practical GenAI integration are a plus; mission-driven consumer or B2B commerce is my sweet spot.

If anyone you know - yourself, other founders you know, board members, etc. - is currently hiring/about to hire for this, I'd love an intro. To make it easy, here's a quick blurb about me:

"Anthony is a VP of Engineering and CTO who has scaled products from early traction to millions in ARR. He's the kind of leader who can hold the technical vision and still sit down with the team. Happy to connect you."

{{Reciprocate}} I'm always up for quick catch-up, I'd love to hear what you've been up to.

https://calendly.com/bluxomelabs/30min

FWIW, here's my Linkedin if useful: https://www.linkedin.com/in/anthony-bull

{{Valediction}} {{ContactURL}}

--
Anthony Bull | C: (415)-269-4893 | Linkedin | Calendly`;
