// Shared by the Positioning Wizard browser UI and server validation so options and consent text never drift.
export const GENERATION_LIMIT = 3;
export const UPLOAD_MAX_BYTES = 3 * 1024 * 1024;
export const CONSENT_VERSION = "wizard-2026-10-10";
export const CONSENT_TEXT =
  "I agree that GrowthCast may store what I submit to run the Positioning Wizard and may contact me about GrowthCast services.";

export const UPLOAD_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".vtt", ".srt", ".json"];
export const URL_TYPES = ["Customer review", "Community thread", "Competitor page", "Interview or transcript", "Article or report", "Our own page", "Other"] as const;
export const RESEARCH_KINDS = [
  "Customer reviews (G2, Capterra, Trustpilot, app stores)",
  "Community discussions (Reddit, forums, Slack and Discord groups)",
  "Competitor websites, pricing, and positioning",
  "Category trends and market data",
  "Analyst and industry reports",
  "Job posts and hiring signals",
  "Our own site, docs, and changelog",
] as const;
export const WEBSITE_FORMATS = ["Homepage hero", "Full landing page", "Feature page", "Pricing page", "Navigation and microcopy"] as const;
export const AD_PLATFORMS = ["Google Search (responsive search ads)", "Meta (Facebook and Instagram)", "LinkedIn", "X", "Reddit"] as const;
export const FUNNEL_STAGES = ["Problem aware", "Solution aware", "Product aware", "Ready to act"] as const;
export const ANGLES = ["Let the strategy map decide", "Push-led", "Pull-led", "Anxiety-reducing", "Social job", "One variation per angle"] as const;
