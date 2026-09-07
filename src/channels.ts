import type { ChannelAssumption } from "./engine/forecast";

export type ChannelModel = "manual" | "cpc" | "cpm";
export type ChannelDefaults = {
  signupRate: number;
  purchaseRate: number;
  arpu: number;
  mqlRate: number;
  sqlRate: number;
  closeRate: number;
  acv: number;
};
export type EditableChannel = ChannelAssumption & ChannelDefaults & {
  model: ChannelModel;
  allocation: number;
  cpc: number;
  cpm: number;
  ctr: number;
  hidden: boolean;
  affiliateCommissionRate: number;
  affiliateCommissionMonths: number;
};

export const makeChannel = (
  name: string,
  model: ChannelModel,
  allocation = 0,
): EditableChannel => ({
  name,
  model,
  allocation,
  cpc: 2,
  cpm: 20,
  ctr: 0.008,
  visitors: 0,
  goLiveMonth: 1,
  signupRate: 0.137,
  purchaseRate: 0.008,
  arpu: 38,
  mqlRate: 0.05,
  sqlRate: 0.4,
  closeRate: 0.2,
  acv: 12000,
  hidden: false,
  affiliateCommissionRate: 0,
  affiliateCommissionMonths: 0,
});

// Fill legacy missing fields, never insert tactics or apply new library economics.
export const normalizeChannels = (channels: EditableChannel[] = []): EditableChannel[] =>
  channels.map((channel) => {
    const base = makeChannel(channel.name, channel.model, channel.allocation);
    if (channel.name === "Partners") {
      base.affiliateCommissionRate = 0.3;
      base.affiliateCommissionMonths = 12;
    }
    return {
      ...base,
      ...channel,
      mqlRate: channel.mqlRate ?? base.mqlRate,
      sqlRate: channel.sqlRate ?? base.sqlRate,
      closeRate: channel.closeRate ?? base.closeRate,
      acv: channel.acv ?? base.acv,
      affiliateCommissionRate: channel.affiliateCommissionRate ?? base.affiliateCommissionRate,
      affiliateCommissionMonths: channel.affiliateCommissionMonths ?? base.affiliateCommissionMonths,
    };
  });

export type ChannelPreset = {
  name: string;
  model: ChannelModel;
  group: string;
  description: string;
  assumptions: Partial<Pick<EditableChannel,
    "cpc" | "cpm" | "ctr" | "visitors" | "affiliateCommissionRate" | "affiliateCommissionMonths"
  >>;
};

const cpc = (name: string, group: string, description: string, cost: number): ChannelPreset =>
  ({ name, model: "cpc", group, description, assumptions: { cpc: cost } });
const cpm = (name: string, group: string, description: string, cost: number, ctr: number): ChannelPreset =>
  ({ name, model: "cpm", group, description, assumptions: { cpm: cost, ctr } });
const owned = (name: string, group: string, description: string, visitors = 500): ChannelPreset =>
  ({ name, model: "manual", group, description, assumptions: { visitors } });

// Illustrative USD planning inputs, not sourced performance benchmarks.
// Group by the existing traffic formula, not a promise of attribution or intent.
export const channelLibrary: ChannelPreset[] = [
  cpc("Branded Search", "Search", "Capture searches for your brand on Google.", 1),
  cpc("Non-Brand Search", "Search", "Reach category and solution searches on Google.", 4),
  cpc("Competitor Search", "Search", "Bid on searches for competing products.", 5),
  cpc("Microsoft / Bing Search", "Search", "Search ads across Microsoft's network.", 3),
  cpc("Shopping / Product Listing Ads", "Search", "Product-feed ads for purchase intent.", 1.5),
  cpc("Performance Max", "Search", "Plan cross-network traffic using a blended CPC.", 2.5),
  cpc("Apple Search Ads", "Search", "App Store acquisition; use store visits as launch traffic.", 2),
  cpc("Meta", "Paid social", "Facebook and Instagram traffic campaigns.", 1.5),
  cpc("LinkedIn", "Paid social", "Professional audiences and B2B demand capture.", 8),
  cpc("TikTok", "Paid social", "Short-form video campaigns optimized for clicks.", 1),
  cpc("Reddit", "Paid social", "Interest and community-targeted traffic campaigns.", 1.5),
  cpc("Pinterest", "Paid social", "Visual discovery and shopping traffic.", 1),
  cpc("Snapchat", "Paid social", "Mobile-first creative and traffic campaigns.", 1),
  cpc("X / Twitter", "Paid social", "Promoted posts optimized for website visits.", 1.5),
  cpc("Quora", "Paid social", "Reach people researching relevant questions.", 2),
  cpc("Retargeting", "Retargeting & discovery", "Bring prior visitors back; avoid double-counting baseline traffic.", 1.5),
  cpc("Native Ads", "Retargeting & discovery", "Content discovery through Taboola, Outbrain, and similar networks.", 0.8),
  cpc("Review Sites / Comparison Listings", "Retargeting & discovery", "Paid placements on G2, Capterra, and comparison sites.", 6),
  cpc("Marketplace Ads", "Retargeting & discovery", "Sponsored marketplace and app-directory listings.", 2),
  cpc("Custom Direct Response", "Custom", "Any other tactic priced or estimated per click.", 2),

  cpm("YouTube", "Video & streaming", "Video reach translated into site visits with CPM and CTR.", 12, 0.005),
  cpm("CTV (Vibe.co / Quantcast)", "Video & streaming", "Connected TV; CTR is an estimated site-response rate, not literal clicks.", 25, 0.001),
  cpm("Streaming Video / OTT", "Video & streaming", "Streaming placements using an estimated site-response rate.", 22, 0.002),
  cpm("Twitch / Livestream Ads", "Video & streaming", "Video and display around live creator content.", 10, 0.004),
  cpm("Meta Awareness", "Social reach", "Facebook and Instagram reach or awareness campaigns.", 10, 0.008),
  cpm("LinkedIn Awareness", "Social reach", "Professional audience awareness campaigns.", 35, 0.004),
  cpm("TikTok Awareness", "Social reach", "Short-form video reach campaigns.", 8, 0.006),
  cpm("Display", "Display & native", "Programmatic banners across relevant websites.", 5, 0.003),
  cpm("Premium Publisher Display", "Display & native", "Direct publisher buys and high-context placements.", 18, 0.005),
  cpm("Native Content Sponsorship", "Display & native", "Sponsored editorial distribution on an impression basis.", 12, 0.006),
  cpm("Podcast Ads", "Audio", "Host-read or inserted audio; CTR estimates listener-to-site response.", 25, 0.003),
  cpm("Streaming Audio / Spotify", "Audio", "Audio reach with an estimated listener-to-site response rate.", 15, 0.002),
  cpm("Newsletter Sponsorships", "Sponsorship & offline", "Use impressions or opens consistently when estimating CPM.", 30, 0.015),
  cpm("Creator / Influencer Sponsorships", "Sponsorship & offline", "Convert a flat creator fee and expected views into CPM.", 20, 0.01),
  cpm("Digital Out-of-Home", "Sponsorship & offline", "Estimated exposure-to-site response, not view-through attribution.", 8, 0.001),
  cpm("Custom Demand Gen", "Custom", "Any other reach tactic modeled with CPM and site-response rate.", 20, 0.008),

  owned("SEO / organic", "Organic discovery", "Incremental search visits from new content and technical SEO.", 1000),
  owned("Content Marketing", "Organic discovery", "Articles, guides, and original research distributed organically."),
  owned("AI Search / AEO", "Organic discovery", "Estimated referral visits from AI answers and search assistants.", 250),
  owned("Organic Social", "Social & community", "Incremental visits from unpaid brand social posts."),
  owned("Founder / Employee Advocacy", "Social & community", "Website referrals from personal and employee audiences.", 250),
  owned("Organic Video / YouTube", "Social & community", "Website visits from evergreen videos, not video views."),
  owned("Community / Forums", "Social & community", "Relevant participation in Reddit, Slack, Discord, and forums.", 250),
  owned("Organic Podcast", "Social & community", "Site referrals from an owned podcast or guest appearances.", 250),
  owned("Email Newsletter", "Lifecycle & product", "Incremental website visits from your opted-in audience."),
  owned("Lifecycle Email", "Lifecycle & product", "Acquisition visits from nurture or reactivation; not a retention-lift model.", 250),
  owned("SMS / Push", "Lifecycle & product", "Incremental visits from permission-based messages.", 250),
  owned("Product-Led Referrals", "Lifecycle & product", "New visitors from invitations, sharing, and product loops."),
  owned("Free Tools / Calculators", "Lifecycle & product", "Acquisition traffic from useful free resources."),
  owned("Templates / Lead Magnets", "Lifecycle & product", "New visitors attracted by templates and downloadable resources."),
  {
    ...owned("Partners", "Partnerships", "Affiliate and reseller referrals with editable recurring commission."),
    assumptions: { visitors: 500, affiliateCommissionRate: 0.3, affiliateCommissionMonths: 12 },
  },
  owned("Co-Marketing", "Partnerships", "Shared content and cross-promotion with complementary brands."),
  owned("Integrations / Ecosystem", "Partnerships", "Referrals from integration partners and app ecosystems."),
  owned("Customer Referrals / Word of Mouth", "Partnerships", "Incremental visits from customer recommendations.", 250),
  owned("Webinars / Virtual Events", "Events & PR", "Site visits from owned or co-hosted online events."),
  owned("Conferences / Trade Shows", "Events & PR", "Translate event contacts into estimated site visits.", 300),
  owned("Meetups / Field Events", "Events & PR", "Website visits from dinners, workshops, and local events.", 100),
  owned("PR / Earned Media", "Events & PR", "Referral traffic from press coverage and editorial mentions."),
  owned("Product Launch / Directories", "Events & PR", "Launch traffic from Product Hunt and relevant directories.", 1000),
  owned("Outbound Email", "Outbound & sales", "Estimated site visits from targeted outreach, not emails sent.", 250),
  owned("Social Selling", "Outbound & sales", "Website visits from one-to-one professional outreach.", 200),
  owned("Cold Calling / SDR", "Outbound & sales", "Convert outbound activity into equivalent site visits.", 100),
  owned("Direct Mail", "Outbound & sales", "Estimate site visits from mail response or QR scans.", 100),
  owned("Enterprise / B2B", "Outbound & sales", "Sales-led acquisition represented as traffic through the selected funnel.", 100),
  owned("Custom", "Custom", "Any other tactic with a manually estimated launch visitor count.", 0),
];

export function addChannelFromLibrary(
  channels: EditableChannel[],
  preset: ChannelPreset,
  defaults: ChannelDefaults,
): EditableChannel[] {
  const existing = channels.find((channel) => channel.name === preset.name);
  if (existing) {
    // Restore hidden rows without replacing any saved assumptions.
    return channels.map((channel) => channel === existing ? { ...channel, hidden: false } : channel);
  }
  const allocated = channels.reduce((total, channel) =>
    total + (channel.model !== "manual" && channel.goLiveMonth > 0 ? channel.allocation : 0), 0);
  const allocation = preset.model === "manual" ? 0 : Math.max(0, Math.min(1, 1 - allocated));
  return [...channels, {
    ...makeChannel(preset.name, preset.model, allocation),
    ...preset.assumptions,
    ...defaults,
  }];
}
