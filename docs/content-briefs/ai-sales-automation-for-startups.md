# Content Brief

## Topic and reader

- Topic: AI sales automation for startups
- Audience: US B2B SaaS founders and growth leads at startups with early traction and a small go-to-market team
- Reader problem: The team wants to reduce repetitive sales work but does not know which workflow to automate, what controls it needs, or whether to build internally or hire help.
- Funnel stage: Bottom of funnel, commercial investigation
- Primary intent: Commercial investigation. This is an editorial judgment based on the supplied publishing plan. The reader wants to assess service fit while learning how to scope a safe first project.
- Concrete task: Select one suitable workflow, define its controls and measures, and decide who should implement it.
- Conversion goal: Start a growth conversation through `/?contact=1`.

## Search targeting

- Primary keyword: AI sales automation for startups
- Secondary terms: AI sales automation, sales workflow automation, sales automation tools, AI lead research, automated outbound, human review, CRM data quality, AI automation partner
- Entities: NIST, US House Office of the Law Revision Counsel, Google, OWASP, GrowthCast
- Data note: The supplied keyword universe and publishing plan contain estimated priority and difficulty, not measured search volume, CPC, or current rankings.

## Angle and promise

Angle: A decision guide that starts with workflow economics and controls, not a list of tools.

Differentiated value: Connect the automation decision to a measurable revenue constraint, then show a bounded pilot that a small startup team can operate safely.

Promise: By the end, the reader can identify a suitable first sales workflow, specify its guardrails, and choose an implementation path.

## Questions to answer

1. What does AI sales automation mean in a startup?
2. Which sales tasks are suitable for a first automation?
3. Which tasks should retain human judgment?
4. How should a team assess data, compliance, security, and deliverability?
5. How can a team test value without replacing its whole stack?
6. When should a startup build internally or hire a partner?
7. Which measures show whether the pilot helps?

## Metadata

- Proposed title: AI Sales Automation for Startups: A Practical Guide
- Slug: `ai-sales-automation-for-startups`
- Meta description: Learn how to choose, test, and measure AI sales automation for startups without weakening data quality, buyer trust, or team control during a bounded pilot.
- Page type: Commercial guide / blog post
- Schema: Existing `BlogPosting` and breadcrumb JSON-LD in the Astro article template. Do not add `FAQPage` because the post does not use a separate visible FAQ block.

## Outline

| Section | Purpose | Evidence need | Words |
|---|---|---|---:|
| Introduction | Give the decision frame within 120 words | None; editorial guidance | 110 |
| Define the category | Set a precise meaning and examples | None; clearly framed definition | 140 |
| Start with a constraint | Help the reader choose a business problem | GrowthCast internal methodology | 170 |
| Choose a first workflow | Give suitability criteria and examples | None; recommendations labeled as advice | 230 |
| Set controls | Cover governance, email rules, deliverability, and security | NIST, US Code, Google, OWASP | 300 |
| Run a pilot | Provide a staged implementation method | NIST plus practical advice | 190 |
| Measure results | Define operational and business measures | None; recommendations labeled as advice | 150 |
| Build or hire | Provide selection criteria | None; commercial decision guidance | 160 |
| CTA | Connect the decision to GrowthCast | Approved repository positioning | 50 |

## Evidence plan

| Claim | Ideal source | Freshness | URL | Status |
|---|---|---|---|---|
| AI risk work should include governance, context mapping, measurement, and management | NIST AI RMF | Stable framework; checked 2026-09-03 | https://www.nist.gov/itl/ai-risk-management-framework | Verified live |
| Commercial email senders must meet CAN-SPAM requirements | US House Office of the Law Revision Counsel | Current statute; checked 2026-09-03 | https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title15-section7704&num=0&edition=prelim | Verified live |
| Email senders should follow authentication and sending-practice requirements | Google Email sender guidelines | Current product guidance; checked 2026-09-03 | https://support.google.com/mail/answer/81126?hl=en | Verified live |
| AI applications need controls for prompt injection and sensitive-information disclosure | OWASP GenAI Security Project | Current security guidance; checked 2026-09-03 | https://genai.owasp.org/llm-top-10/ | Verified publisher and topic |

## Link plan

### Internal

| URL | Destination | Anchor concept | Placement |
|---|---|---|---|
| `/why-growthcast` | GrowthCast point of view | one operating plan | Constraint section |
| `/how-it-works` | Engagement method | how GrowthCast works | Partner section |
| `/company/partners` | Approved technology partners | technology partners | Partner section |
| `/resources/tools/forecast` | Local-first forecast tool | model the revenue effect | Measurement section |
| `/?contact=1` | Contact flow | talk with GrowthCast | Final CTA |

### External

- NIST AI RMF: governance and pilot risk process
- US Code, Title 15, Section 7704: commercial email obligations
- Google sender guidelines: authentication and deliverability practices
- OWASP GenAI Security Project: application security risks

## CTA plan

After the guide, invite the reader to discuss one bounded automation tied to a measurable go-to-market constraint. Make no performance guarantee.

## Risks and assumptions

- ASSUMPTION—CONFIRM: EJ White is the approved byline, based on the existing blog post.
- ASSUMPTION—CONFIRM: September 3, 2026 is the intended publication date.
- The article makes no pricing, search-volume, ranking, or guaranteed-outcome claim.
- The article does not claim that GrowthCast supports a specific integration beyond the approved partners page and general GTM Engineering positioning.

## Loop state

```yaml
loop_state:
  iteration: 1
  max_iterations: 4
  phase: draft
  brief_version: 1
  draft_version: 0
  last_score: null
  failed_gates: []
  open_issues:
    - Confirm byline and publication date
  changes_this_iteration:
    - Selected the first ranked topic from the supplied publishing plan
    - Matched the topic to approved repository context and verified links
  status: in_progress
```

# QA Report

- Iteration: 2 of 4
- Count method: Counted the rendered H1, headings, paragraphs, list items, and CTA; excluded front matter, this brief, and source notes.
- Article word count: 1,456 (1,448 body words plus the eight-word rendered H1)
- Final score: 94/100

| Category | Score | Notes |
|---|---:|---|
| Audience and intent fit | 15/15 | The opening gives a direct decision frame and the sections complete a founder or growth lead's evaluation task. |
| Accuracy and evidence | 18/20 | Four authoritative sources support governance, law, deliverability, and security claims. Advice is labeled as guidance. |
| Usefulness and depth | 15/15 | Includes selection criteria, controls, a pilot checklist, measures, and an implementation-partner decision. |
| Structure and completeness | 10/10 | Title, introduction, sections, conclusion, and CTA support one promise. |
| Keyword and topical relevance | 9/10 | The primary term appears naturally in the title, opening, meta description, and slug without repetition. |
| Plain English, active voice, human actors | 9/10 | Most sentences are short and name a responsible person or team. |
| Links and citations | 8/8 | Five internal destinations and four external sources were checked on 2026-09-03. |
| Metadata, FAQ, and schema notes | 5/5 | Title, 157-character meta description, slug, and existing BlogPosting schema are suitable. No repetitive FAQ was added. |
| Brand fit and CTA | 4/5 | GrowthCast claims match repository-approved context, and the CTA follows the practical guidance. |
| Mechanics and compliance | 1/2 | US English and heading hierarchy pass; editorial confirmation of byline and date remains an assumption. |

## Hard gates

1. Required inputs complete or assumptions marked: PASS
2. Published article is 1,200–1,500 words: PASS
3. Intent and title fulfilled: PASS
4. No unsupported material claim: PASS
5. No invented, broken, or misleading link: PASS
6. Product claims within approved context: PASS
7. One rendered H1 and logical heading hierarchy: PASS
8. Title, meta, slug, CTA, and schema notes present: PASS
9. No banned phrase: PASS
10. Final check follows final fix: PASS

Fixes in iteration 2:

- Replaced the inaccessible FTC guide link with the live official US Code source.
- Extended the meta description to the supplied editorial range.
- Rechecked the article count, banned phrases, link destinations, and approved GrowthCast claims.

Unresolved issues: Confirm the byline and publication date. Both follow the existing site convention and current date.

Final loop state: `done` — **PASS**

```yaml
loop_state:
  iteration: 2
  max_iterations: 4
  phase: done
  brief_version: 1
  draft_version: 2
  last_score: 94
  failed_gates: []
  open_issues:
    - Confirm byline and publication date
  changes_this_iteration:
    - Replaced inaccessible evidence URL with official US Code source
    - Extended meta description
    - Completed final count, style, evidence, and link checks
  status: passed
```
