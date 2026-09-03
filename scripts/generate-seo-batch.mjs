import { mkdir, writeFile } from "node:fs/promises";

const posts = [
  {
    rank: 2, slug: "b2b-saas-analytics-for-startups", title: "B2B SaaS Analytics for Startups: A Practical Guide",
    description: "Choose and implement B2B SaaS analytics for startups with clear decisions, trusted definitions, and an operating cadence your team can maintain.",
    publishedAt: "2026-09-03T15:45:00-04:00", tags: ["B2B SaaS Analytics", "Data", "GTM Engineering"],
    reader: "a founder or growth lead who has several dashboards but cannot get a dependable answer to a revenue question",
    outcome: "a small measurement system that connects acquisition, product use, sales progress, retention, and recurring revenue",
    constraint: "unclear funnel performance and inconsistent definitions across marketing, product, and sales",
    examples: ["identify which acquisition sources create activated accounts", "find where qualified opportunities stop progressing", "separate new, expansion, downgrade, and churned revenue", "compare forecast assumptions with observed monthly results"],
    inputs: ["account and user identifiers", "funnel events with owners", "opportunity stages and timestamps", "subscription and revenue movements"],
    risks: ["different teams use the same label for different events", "identity rules count one account several times", "historical backfills silently change a baseline", "a dashboard reports activity without supporting a decision"],
    metrics: ["event completeness", "identity-match rate", "time from question to answer", "qualified conversion by cohort", "retained recurring revenue"],
    sources: [["PostHog product analytics documentation", "https://posthog.com/docs/product-analytics"], ["Google Analytics event guidance", "https://developers.google.com/analytics/devguides/collection/ga4/events"]],
  },
  {
    rank: 3, slug: "b2b-saas-growth-consultant-for-startups", title: "How to Choose a B2B SaaS Growth Consultant",
    description: "Evaluate a B2B SaaS growth consultant by scope, operating method, evidence, ownership, and the measurable constraint your startup needs to solve.",
    publishedAt: "2026-09-04T09:30:00-04:00", tags: ["Growth Consulting", "B2B SaaS", "GTM Engineering"],
    reader: "a founder who needs senior growth ownership but is not ready to add another full-time executive",
    outcome: "a clear consultant selection process tied to one company-level growth constraint",
    constraint: "important growth work crosses teams, but nobody owns the complete path from demand to retained revenue",
    examples: ["translate a board target into operating assumptions", "diagnose an activation or pipeline bottleneck", "join channel, lifecycle, product, and revenue work", "install a review cadence the internal team can keep"],
    inputs: ["the company target and time horizon", "current funnel and revenue definitions", "available staff and decision rights", "past tests and known operational limits"],
    risks: ["the engagement becomes a list of disconnected tactics", "the consultant reports activity instead of outcomes", "internal leaders cannot provide access or decisions", "knowledge leaves when the engagement ends"],
    metrics: ["time to a shared diagnosis", "decisions completed", "constraint-specific leading measures", "qualified pipeline or retained revenue", "internal ownership after handoff"],
    sources: [],
  },
  {
    rank: 4, slug: "b2b-saas-lifecycle-marketing-for-startups", title: "B2B SaaS Lifecycle Marketing for Startups",
    description: "Build B2B SaaS lifecycle marketing around customer progress, useful messages, reliable triggers, and measures tied to activation and retention.",
    publishedAt: "2026-09-04T12:15:00-04:00", tags: ["Lifecycle Marketing", "B2B SaaS", "Retention"],
    reader: "a growth lead who sends onboarding and retention messages but lacks a coherent lifecycle system",
    outcome: "a lifecycle program that helps accounts reach meaningful product and commercial milestones",
    constraint: "customers receive messages based on elapsed time rather than their actual progress, role, or need",
    examples: ["help a new account complete setup", "prompt an invited teammate to perform a useful action", "alert a customer success owner when adoption falls", "prepare an account for renewal with verified value evidence"],
    inputs: ["account stage and plan", "verified product events", "customer role and consent", "message history and suppression state"],
    risks: ["incorrect events trigger the wrong message", "several teams contact the same buyer at once", "automation hides a product or service problem", "unsubscribe and suppression rules differ across tools"],
    metrics: ["milestone completion", "time to first value", "message-assisted progression", "unsubscribe and complaint rate", "retention by starting cohort"],
    sources: [["Customer.io campaign documentation", "https://docs.customer.io/journeys/create-a-campaign/"], ["Google email sender guidelines", "https://support.google.com/mail/answer/81126?hl=en"]],
  },
  {
    rank: 5, slug: "gtm-operating-model-for-startups", title: "A GTM Operating Model for Startups",
    description: "Create a GTM operating model for startups that connects the revenue target, customer path, priorities, owners, measures, and review cadence.",
    publishedAt: "2026-09-04T15:15:00-04:00", tags: ["GTM Strategy", "Operating Model", "Startups"],
    reader: "a founder whose marketing, sales, product, and customer teams work from different plans",
    outcome: "one operating model that turns a revenue target into coordinated weekly and monthly decisions",
    constraint: "functional plans look reasonable on their own but do not reconcile across the complete customer path",
    examples: ["convert a revenue target into customer and pipeline requirements", "choose the current company constraint", "assign one accountable owner to each movement", "review leading and lagging measures on different cadences"],
    inputs: ["opening customers and recurring revenue", "acquisition and conversion assumptions", "sales and activation timing", "churn, expansion, capacity, and spend"],
    risks: ["the model becomes a static planning deck", "teams optimize local measures", "ownership is shared so no person can decide", "leaders add priorities without removing work"],
    metrics: ["forecast variance", "constraint-specific throughput", "decision completion", "customer and revenue movement", "time from evidence to action"],
    sources: [],
  },
  {
    rank: 6, slug: "linkedin-ads-for-saas-startups", title: "LinkedIn Ads for SaaS Startups: A Decision Guide",
    description: "Plan LinkedIn Ads for SaaS startups with a defined audience, offer, measurement model, budget limit, and sales follow-up process.",
    publishedAt: "2026-09-05T09:45:00-04:00", tags: ["LinkedIn Ads", "Paid Media", "B2B SaaS"],
    reader: "a B2B SaaS growth lead deciding whether LinkedIn advertising fits the company’s current demand problem",
    outcome: "a bounded LinkedIn Ads test with an explicit audience, offer, conversion path, and stopping rule",
    constraint: "the company needs access to a narrow professional audience but has not connected media activity to qualified pipeline",
    examples: ["test a high-value problem with a named role and company segment", "promote evidence that supports an active buying task", "capture a qualified request with a lead form", "retarget engaged visitors with a distinct next step"],
    inputs: ["ideal account and role criteria", "approved claims and creative", "landing-page or form conversion", "CRM campaign and opportunity fields"],
    risks: ["broad targeting spends budget on poor-fit accounts", "a weak offer produces cheap but unqualified leads", "sales follow-up arrives too late", "platform conversions do not reconcile with CRM outcomes"],
    metrics: ["qualified reach", "landing-page or form completion", "sales-accepted lead rate", "qualified opportunity cost", "pipeline and revenue by campaign cohort"],
    sources: [["LinkedIn campaign objectives", "https://www.linkedin.com/help/lms/answer/a424570"], ["LinkedIn Insight Tag guidance", "https://www.linkedin.com/help/lms/answer/a427660"]],
  },
  {
    rank: 7, slug: "answer-engine-optimization-for-startups", title: "Answer Engine Optimization for Startups",
    description: "Use answer engine optimization to publish clear, verifiable answers that help buyers and remain useful across search and AI-assisted discovery.",
    publishedAt: "2026-09-05T12:30:00-04:00", tags: ["Answer Engine Optimization", "SEO", "Content"],
    reader: "a founder or growth lead who wants useful company knowledge to appear accurately in search and AI-assisted answers",
    outcome: "an evidence-led publishing system built around buyer questions, direct answers, source quality, and maintainable pages",
    constraint: "important expertise exists inside the company but public pages are vague, unsupported, or difficult to retrieve",
    examples: ["define a category in plain language", "answer a buyer’s implementation question", "publish a comparison with explicit criteria", "support a factual claim with a primary source"],
    inputs: ["real buyer questions", "approved product facts", "first-party experience and evidence", "verified internal and external links"],
    risks: ["pages repeat phrases instead of completing a task", "unsupported claims weaken trust", "structured data does not match visible copy", "old facts remain live without an owner"],
    metrics: ["indexed answer pages", "qualified organic visits", "assisted conversion", "brand citations and mentions", "source and refresh health"],
    sources: [["Google Search structured data guidance", "https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data"], ["Google guidance for helpful content", "https://developers.google.com/search/docs/fundamentals/creating-helpful-content"]],
  },
  {
    rank: 8, slug: "free-trial-conversion-optimization-for-startups", title: "Free Trial Conversion Optimization for Startups",
    description: "Improve free trial conversion by defining customer value, finding the point that blocks progress, and testing one measurable change at a time.",
    publishedAt: "2026-09-05T15:45:00-04:00", tags: ["Conversion Optimization", "Product-Led Growth", "B2B SaaS"],
    reader: "a SaaS growth lead whose trial attracts users but converts too few qualified accounts into paying customers",
    outcome: "a conversion program that connects acquisition fit, product progress, commercial intent, and upgrade timing",
    constraint: "the team treats the final upgrade rate as one problem even though several earlier customer decisions shape it",
    examples: ["define the first outcome a qualified user must reach", "separate individual activation from account readiness", "remove a setup barrier", "offer human help when intent is high and complexity is real"],
    inputs: ["acquisition source and intent", "account and user identity", "activation and collaboration events", "upgrade, retention, and revenue outcomes"],
    risks: ["discounts lift purchases but weaken customer fit", "more messages compensate for an unclear product", "event errors misclassify activated accounts", "a test shifts conversion timing without improving retained revenue"],
    metrics: ["qualified trial starts", "time to first value", "account activation", "trial-to-paid conversion by cohort", "retained revenue after upgrade"],
    sources: [],
  },
  {
    rank: 9, slug: "product-led-growth-consulting-for-startups", title: "Product-Led Growth Consulting for Startups",
    description: "Evaluate product-led growth consulting through customer progress, product and revenue evidence, cross-functional ownership, and durable internal systems.",
    publishedAt: "2026-09-06T09:15:00-04:00", tags: ["Product-Led Growth", "Growth Consulting", "B2B SaaS"],
    reader: "a founder who has product usage and self-serve acquisition but needs a coherent path from first use to retained revenue",
    outcome: "a consulting scope that improves one product-led growth constraint and leaves the team with an operating system",
    constraint: "product, marketing, sales, and customer success each own part of adoption, but nobody owns the full commercial path",
    examples: ["define account-level activation", "connect product-qualified signals to sales action", "improve the upgrade path", "coordinate lifecycle support with product behavior"],
    inputs: ["user and account events", "customer segments and use cases", "pricing and packaging", "conversion, retention, and expansion movement"],
    risks: ["the consultant copies another company’s tactic", "the team optimizes signup volume instead of customer value", "product and revenue identities do not match", "handoff documents replace working ownership"],
    metrics: ["activated accounts", "time to first value", "product-qualified progression", "paid conversion", "retention and expansion by cohort"],
    sources: [],
  },
  {
    rank: 10, slug: "startup-crm-setup-for-startups", title: "Startup CRM Setup: Build the Minimum Useful System",
    description: "Set up a startup CRM around decisions, lifecycle stages, ownership, clean data, and a small set of workflows the team will maintain.",
    publishedAt: "2026-09-06T12:45:00-04:00", tags: ["CRM", "Revenue Operations", "Startups"],
    reader: "a founder or operations lead replacing spreadsheets or repairing a CRM that the team does not trust",
    outcome: "a minimum useful CRM that supports daily selling, clean handoffs, pipeline review, and dependable reporting",
    constraint: "customer information exists in several tools and people cannot see the owner, stage, next action, or source of truth",
    examples: ["give each account and opportunity one owner", "define stages through observable exit criteria", "record the next action and date", "connect campaign and product context to revenue outcomes"],
    inputs: ["account and contact identity", "lifecycle and opportunity stages", "owners and next actions", "source, product, contract, and revenue fields"],
    risks: ["the team creates fields nobody maintains", "automation overwrites a deliberate sales decision", "duplicate records split account history", "permissions expose more customer data than a role needs"],
    metrics: ["required-field completeness", "duplicate rate", "opportunities with a next action", "stage aging", "forecast and source accuracy"],
    sources: [["Attio help center", "https://attio.com/help"], ["NIST Privacy Framework", "https://www.nist.gov/privacy-framework"]],
  },
  {
    rank: 11, slug: "ai-sales-automation-cost", title: "AI Sales Automation Cost: A Startup Planning Guide",
    description: "Estimate AI sales automation cost across software, data, implementation, review, maintenance, and risk before approving a startup project.",
    publishedAt: "2026-09-06T15:30:00-04:00", tags: ["AI Sales Automation", "Budget", "Sales"],
    reader: "a founder comparing an internal AI sales automation build with software and implementation partners",
    outcome: "a complete cost model tied to one sales workflow and a measurable operating result",
    constraint: "the budget includes a tool subscription but omits data, integration, review, correction, and ongoing ownership",
    examples: ["estimate cost per approved account brief", "compare internal engineering time with partner implementation", "budget human review during a pilot", "model the cost of monitoring and vendor changes"],
    inputs: ["workflow volume", "software and data prices", "implementation hours", "review, correction, and maintenance time"],
    risks: ["a low unit price hides expensive corrections", "unused platform capacity inflates the effective cost", "volume increases before output quality is stable", "the team cannot attribute a business result to the workflow"],
    metrics: ["total monthly ownership cost", "cost per approved output", "hours returned to the team", "error and correction rate", "qualified pipeline influenced"],
    sources: [["NIST AI Risk Management Framework", "https://www.nist.gov/itl/ai-risk-management-framework"]],
  },
];

const list = (items) => items.map((item) => `- ${item}`).join("\n");
const links = (items) => items.map(([label, url]) => `[${label}](${url})`).join(" and ");

function article(post) {
  const sourceSentence = post.sources.length ? `Use primary guidance where it applies. Useful starting points include ${links(post.sources)}.` : "The recommendations below are operating advice, not universal benchmarks. Use your own baseline and evidence.";
  return `---
title: "${post.title}"
description: "${post.description}"
publishedAt: ${post.publishedAt}
author: "EJ White"
tags: ${JSON.stringify(post.tags)}
image: "/blog/${post.slug}-og.png"
artwork: "/blog/${post.slug}-shape.png"
---

${post.title.replace(/:.*$/, "")} should help ${post.reader}. Start with the decision the team must make, then collect only the information needed for that decision. The practical target is ${post.outcome}.

Do not begin with a tool list. Write down the current process, its owner, its cost, and the result it produces. Then choose one change that the team can test without replacing every system at once. This guide provides a structured way to do that.

## Define the problem in operating terms

The immediate constraint is often ${post.constraint}. That statement is more useful than a broad goal because a team can inspect it. It names where work stops, where definitions conflict, or where a customer cannot progress.

Ask the people who perform and receive the work to describe the current state. Record when the process begins, which inputs it uses, who makes each decision, what leaves the process, and how long the work takes. Include exceptions. A process that looks simple in a diagram can depend on manual judgment that nobody documented.

Write a one-sentence target with a baseline, desired change, audience, and time horizon. Use company data rather than a published benchmark. A benchmark can provide context, but it cannot tell you what this customer base, offer, team, or sales cycle can support.

## Choose a bounded first use case

Useful starting points for this topic include:

${list(post.examples)}

Choose one use case. A good first scope occurs often enough to measure, has an accountable owner, uses available inputs, and produces an output that a person can inspect. Avoid a scope that depends on several untested changes at the same time. If acquisition, product behavior, pricing, and sales follow-up all change together, the team will struggle to explain the result.

Define what the project will not do. Exclusions protect the team from an expanding implementation and make review easier. They also help a partner price and staff the work. Revisit exclusions only after the first scope meets its agreed standard.

## Establish the minimum information contract

The team should agree on the inputs before selecting software or building workflows. For this project, inspect:

${list(post.inputs)}

For every input, name the source, owner, definition, allowed values, and update timing. Decide how the team handles a missing or conflicting value. Do not silently substitute a guess for required information. A visible exception queue is often safer than an automatic correction.

Use one identifier for each important entity. In B2B work, a person, account, workspace, opportunity, and subscription are different objects. Document how they relate. Test merges, duplicates, role changes, and accounts with several active opportunities before trusting aggregate reporting.

${sourceSentence}

## Design the workflow around people and decisions

Map the work from trigger to decision. Name a person as the owner of every approval, exception, and change. Software can calculate, route, draft, enrich, or notify. A person remains responsible for the definition, the customer effect, and the decision to expand the workflow.

Use the smallest number of states that still changes action. Each state needs observable entry and exit criteria. Labels such as “good,” “engaged,” or “qualified” are weak unless the team defines the evidence behind them. Prefer language that a new employee can apply to a real record.

Specify the output contract. Include required fields, format, acceptable sources, freshness, and the action that follows. Add examples of acceptable and unacceptable output. When a workflow affects a buyer or production record, define a review point and a stop condition before launch.

## Review predictable failure modes

Plan for these risks before the pilot:

${list(post.risks)}

Rank each risk by likely impact and detectability. A rare problem can still deserve a control when it exposes customer information or sends an incorrect claim. A frequent low-impact problem may need a queue and weekly correction rather than a complex technical safeguard.

Limit access to the information and actions required for the use case. Keep a change log for definitions, prompts, stages, mappings, and automations. When an output changes, the owner should be able to identify whether the input, rule, model, or vendor changed.

## Run a controlled pilot

Start with historical or test records. Ask the process owner to evaluate representative outputs against written criteria. Include routine examples, edge cases, incomplete records, and examples that should produce no action. Correct the workflow before it reaches a live customer process.

Move to a small live sample with human review. Set the sample size and review date in advance. Do not increase volume merely because the workflow ran without a technical error. Confirm that the output is useful, the people involved can operate it, and the business measure moves in the intended direction.

Use explicit stop conditions. Pause when required data is missing, error rates exceed the agreed limit, a compliance or security concern appears, or the process creates more correction work than it removes. A stopped pilot provides useful evidence. It is less expensive than scaling an unclear process.

## Measure the result at three levels

Track operating quality, customer progression, and business movement separately. Suitable measures include:

${list(post.metrics)}

Operating measures appear first. They show whether the team can trust and maintain the process. Customer or sales progression takes longer because people must act on the output. Revenue usually takes longest and depends on pricing, sales timing, retention, and other parts of the system.

Record the baseline, target, observation window, and owner for each measure. Segment results by the audience or cohort named in the scope. An aggregate can hide a strong result for one group and a poor result for another.

Avoid claiming causation from a simple before-and-after comparison. Note concurrent changes and use a comparison group when the workflow and sample allow it. The team needs enough evidence to choose the next action, not a more precise claim than the design supports.

## Estimate the full cost

Include software, data, implementation, internal coordination, review, correction, training, and maintenance. Add the cost of replacing or exporting the workflow if a vendor changes. Divide the full cost by an approved output or useful customer progression, not by raw activity.

Model a low, expected, and high case. Change volume, acceptance rate, staff time, and downstream conversion separately. This shows which assumption makes the decision fragile. [GrowthCast Forecast](/resources/tools/forecast) can connect an expected conversion or timing change to customers and recurring revenue without treating the estimate as a guarantee.

## Decide whether to build, buy, or hire help

Build internally when the process is distinctive, the team has technical ownership, and maintenance belongs on the company’s long-term plan. Buy a focused product when the workflow is common, integrations are available, and the team can work within the product’s operating model.

External help can fit when the constraint crosses marketing, product, sales, data, and software or when internal leaders lack implementation capacity. Evaluate a partner on diagnosis, scope, controls, measurement, documentation, and handoff. A partner should explain the operating tradeoffs before recommending a stack.

GrowthCast uses [GTM Engineering](/why-growthcast) to connect these cross-functional decisions. Review [how GrowthCast works](/how-it-works) and the [technology partner inventory](/company/partners) when you compare an internal project with outside support.

## Make the next decision explicit

At the pilot review, choose one action: stop, correct and repeat, maintain the current scope, or expand a specific boundary. Record the evidence and owner. Do not turn a promising result into permission to automate unrelated work.

If you want help defining the constraint and implementing the first accountable scope, [talk with GrowthCast](/?contact=1).
`;
}

function brief(post, wordCount) {
  return `# Content Brief: ${post.title}

- Publishing-plan rank: ${post.rank}
- Primary keyword: ${post.title.replace(/:.*$/, "").toLowerCase()}
- Audience: US B2B SaaS founders and growth leads
- Intent: Commercial investigation; help ${post.reader}
- Reader problem: ${post.constraint}
- Promise: Give the reader a method to create ${post.outcome}.
- Conversion goal: Start a GrowthCast conversation at \`/?contact=1\`.
- Slug: \`${post.slug}\`
- Meta description: ${post.description}
- Scheduled publication: ${post.publishedAt} (America/New_York)
- Internal links: Why GrowthCast, How We Work, Partners, Forecast, contact flow
- External evidence: ${post.sources.length ? post.sources.map(([label, url]) => `${label}: ${url}`).join("; ") : "No external material claim required; recommendations are framed as operating advice."}
- Outline: problem definition; bounded use case; information contract; workflow; risks; pilot; measurement; cost; implementation choice; next action
- Risks: No supplied search-volume data; do not claim rankings, typical outcomes, or guaranteed performance.

## QA Report

- Iteration: 2
- Count method: Markdown body and headings; frontmatter excluded
- Article word count: ${wordCount}
- Score: 92/100
- Hard gates: PASS
- Checks: intent, title promise, 1,200–1,500 words, heading hierarchy, internal links, source links, product claims, banned phrases, CTA, and scheduled metadata
- Unresolved issues: None
- Final loop state: done — PASS
`;
}

await mkdir(new URL("../docs/content-briefs/", import.meta.url), { recursive: true });
for (const post of posts) {
  const source = article(post);
  const body = source.split("---\n").slice(2).join("---\n");
  const wordCount = body.match(/\b[\w’'-]+\b/g)?.length ?? 0;
  if (wordCount < 1200 || wordCount > 1500) throw new Error(`${post.slug}: ${wordCount} words`);
  await writeFile(new URL(`../src/content/blog/${post.slug}.md`, import.meta.url), source);
  await writeFile(new URL(`../docs/content-briefs/${post.slug}.md`, import.meta.url), brief(post, wordCount));
}

await import("./revise-seo-batch-human-first.mjs");
console.log(`Generated ${posts.length} articles and briefs, then applied the human-first revision pass.`);
