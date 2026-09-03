import { readFile, writeFile } from "node:fs/promises";

const revisions = {
  "b2b-saas-analytics-for-startups": [
    "You can have six dashboards open and still spend Monday morning arguing about last month’s pipeline. I’ve seen teams compare a product event, a CRM stage, and a finance total as if the three numbers describe the same thing. They don’t. Start with the decision behind the question.",
    "Pick one recent account and follow it by hand. Find the first visit, signup, workspace, opportunity, invoice, and renewal. If the trail breaks at the third screen, another dashboard won’t repair it.",
    "The first useful analytics deliverable is often a short glossary, not a dashboard.",
  ],
  "b2b-saas-growth-consultant-for-startups": [
    "Most founders don’t need more growth ideas. Their Slack history already contains enough ideas for a year. They need someone who can find the constraint, get four teams to make a decision, and stay long enough to see whether the work changed anything.",
    "Ask a candidate to walk through the first ten working days. A strong answer names the people they’ll interview, the records they’ll inspect, and the decision they expect you to make. A weak answer starts with a channel calendar.",
    "A consultant who promises quick wins before seeing your numbers is giving you a sales pitch, not a diagnosis.",
  ],
  "b2b-saas-lifecycle-marketing-for-startups": [
    "A customer doesn’t care that day seven arrived. They care that three teammates still can’t finish setup. Yet many lifecycle programs send the day-seven email anyway, followed by a day-fourteen message that assumes everyone made progress.",
    "Open the profile of one account that churned last month. Read every message in order. Compare each message with what the account had actually done in the product that day. You’ll usually spot the mismatch at once.",
    "Sometimes the right lifecycle message is no message. A customer who hit a product error needs help, not another tip.",
  ],
  "gtm-operating-model-for-startups": [
    "The marketing plan can look sensible. So can the sales plan, product roadmap, and customer success targets. Put them on one page and the math may still fail. Sales expects more opportunities than marketing can create, while product plans for a different customer segment.",
    "Run one monthly target backward on a whiteboard. Write the needed new revenue, deal size, wins, qualified opportunities, and leads. Put an owner’s name beside each number. Empty spaces tell you where people need to make a decision.",
    "A shared spreadsheet is not an operating model. People create the model when they use the same assumptions to make tradeoffs.",
  ],
  "linkedin-ads-for-saas-startups": [
    "LinkedIn can find a director of finance at a 200-person software company. That precision feels reassuring. It can also help you spend money on exactly the wrong people if the offer gives that director no reason to care today.",
    "Before you open Campaign Manager, show the ad and landing page to five people who match the audience. Ask what they think happens after the click. If their answers differ, fix the offer before you buy traffic.",
    "A high click rate can be bad news when curiosity, not buying intent, earns the click.",
  ],
  "answer-engine-optimization-for-startups": [
    "Buyers ask narrow questions. Company websites often answer with a paragraph about innovation. Search engines and answer tools can’t rescue a page that never states the answer, and a buyer won’t wait while the copy warms up.",
    "Take the last five questions a prospect asked on a sales call. Search your site for the answers. If a new buyer needs three pages and a demo to piece one answer together, you have a publishing problem.",
    "The best page for an answer engine often looks almost boring: a clear question, a direct answer, evidence, limits, and a date.",
  ],
  "free-trial-conversion-optimization-for-startups": [
    "A trial user can log in five times and learn nothing. Another can invite a teammate, import real data, and get a useful result in one session. If your team calls both users active, the final conversion rate won’t explain much.",
    "Watch ten recent trial sessions from start to finish. Note the first moment each person tries to use their own data. The awkward pause before an import, permission request, or empty screen often matters more than the tooltip your team planned to test.",
    "More trial conversions can leave you with less retained revenue when a discount pulls poor-fit customers across the line.",
  ],
  "product-led-growth-consulting-for-startups": [
    "Product-led growth gets messy at the account boundary. One user loves the product. Procurement has never heard of it. A sales rep sees usage but doesn’t know whether to call. Customer success joins after the team has already stalled.",
    "Put one expanding account and one churned account side by side. Mark the product actions, emails, sales calls, price changes, and handoffs. A useful consultant should help your team explain the difference without inventing a score nobody trusts.",
    "The product cannot own a revenue motion. People across product, marketing, sales, and customer success have to own their decisions in it.",
  ],
  "startup-crm-setup-for-startups": [
    "A CRM fails quietly. One rep keeps notes in a private document. Another changes opportunity stages at the end of the month. The founder exports a spreadsheet before the board meeting because the dashboard feels wrong.",
    "Sit beside a rep during a real follow-up. Count the clicks needed to learn who owns the account, what happened, and what comes next. Any field that doesn’t help that work needs a very good reason to exist.",
    "A CRM with twelve well-kept fields can tell you more than one with two hundred optional fields.",
  ],
  "ai-sales-automation-cost": [
    "The software quote is rarely the cost of AI sales automation. Someone still has to clean the data, connect the systems, review the output, correct mistakes, answer complaints, and notice when a vendor changes a model on Tuesday afternoon.",
    "Time one batch of fifty account briefs. Include the minutes a seller spends checking sources and fixing bad fields. A brief that costs pennies to generate can cost several dollars to approve.",
    "The cheapest automation can be the expensive one if your best seller becomes its unpaid quality-control team.",
  ],
};

const closings = {
  "b2b-saas-analytics-for-startups": "If your team has plenty of reports but still can’t agree on what happened, [connect with GrowthCast](/?contact=1). We’ll look at the decisions, data, and ownership gaps with you and see whether our services fit the problem.",
  "b2b-saas-growth-consultant-for-startups": "If you’re deciding whether to hire a consultant, [connect with GrowthCast](/?contact=1). We can talk through the constraint and the work your team needs, then decide together whether GrowthCast is the right fit.",
  "b2b-saas-lifecycle-marketing-for-startups": "If your lifecycle messages don’t match what customers are doing, [connect with GrowthCast](/?contact=1). We’ll help you find the operating problem first and see whether our services fit what your team needs next.",
  "gtm-operating-model-for-startups": "If your teams have separate plans that don’t add up to one revenue plan, [connect with GrowthCast](/?contact=1). We can review where the numbers and ownership break down and see whether our services are right for your company.",
  "linkedin-ads-for-saas-startups": "If you’re unsure whether LinkedIn belongs in your growth plan, [connect with GrowthCast](/?contact=1). We’ll pressure-test the audience, offer, economics, and follow-up with you, then see whether our services fit.",
  "answer-engine-optimization-for-startups": "If your company has real expertise but buyers struggle to find clear answers, [connect with GrowthCast](/?contact=1). We can look at the questions, evidence, and publishing work with you and see whether our services are a good fit.",
  "free-trial-conversion-optimization-for-startups": "If trial users arrive but too few qualified accounts become lasting customers, [connect with GrowthCast](/?contact=1). We’ll help you find where people get stuck and see whether our services fit the work required.",
  "product-led-growth-consulting-for-startups": "If product use, sales action, and retained revenue don’t yet connect, [connect with GrowthCast](/?contact=1). We can examine the handoffs with your team and decide whether GrowthCast is the right partner for the work.",
  "startup-crm-setup-for-startups": "If your team works around the CRM instead of through it, [connect with GrowthCast](/?contact=1). We’ll discuss the decisions and handoffs the system needs to support and see whether our services fit.",
  "ai-sales-automation-cost": "If you’re pricing an AI sales workflow and want a second set of eyes on the real cost, [connect with GrowthCast](/?contact=1). We can review the assumptions, risks, and expected return with you and see whether our services are right for the project.",
};

const replacements = [
  [/The immediate constraint is often /g, "Many teams face the same problem: "],
  [/That statement is more useful than a broad goal because a team can inspect it\. It names where work stops, where definitions conflict, or where a customer cannot progress\./g, "Name the people involved and the point where their work stops. Skip broad goals that nobody can inspect or own."],
  [/Write a one-sentence target with a baseline, desired change, audience, and time horizon\./g, "Write a one-sentence target with a baseline, desired change, audience, and deadline."],
  [/Define what the project will not do\. Exclusions protect the team from an expanding implementation and make review easier\. They also help a partner price and staff the work\./g, "Write down what the project won’t do. Your team can review a small scope, explain the result, and price the work."],
  [/The team should agree on the inputs before selecting software or building workflows\./g, "Agree on the inputs before anyone selects software or builds a workflow."],
  [/Do not silently substitute a guess for required information\. A visible exception queue is often safer than an automatic correction\./g, "Don’t let a tool replace required information with a guess. Give a person an exception list to review."],
  [/Software can calculate, route, draft, enrich, or notify\. A person remains responsible/g, "A tool can calculate, route, draft, enrich, or notify. A person remains responsible"],
  [/Use the smallest number of states that still changes action\./g, "Use the fewest states that still change what someone does."],
  [/Move to a small live sample with human review\./g, "Then use a small live sample with a person checking every result."],
  [/Do not increase volume merely because the workflow ran without a technical error\./g, "Don’t raise the volume just because the software ran."],
  [/A stopped pilot provides useful evidence\. It is less expensive than scaling an unclear process\./g, "Stopping isn’t failure. Your team learns before the mistake reaches more customers."],
  [/An aggregate can hide a strong result for one group and a poor result for another\./g, "A single total can hide a good result for one group and a bad result for another."],
  [/This shows which assumption makes the decision fragile\./g, "You’ll see which guess can change the decision."],
  [/Do not turn a promising result into permission to automate unrelated work\./g, "One promising result doesn’t give your team a reason to automate unrelated work."],
];

for (const [slug, [opening, detail, surprise]] of Object.entries(revisions)) {
  const articleUrl = new URL(`../src/content/blog/${slug}.md`, import.meta.url);
  let source = await readFile(articleUrl, "utf8");
  source = source.replaceAll(`\n\n${detail}`, "").replaceAll(`\n\n${surprise}`, "");
  source = source.replace(/---\n\n[\s\S]*?\n\n## Define the problem in operating terms/, `---\n\n${opening}\n\nIf this sounds familiar, start with the decision your team can’t make today. Don’t begin with a tool list. Write down who owns the current work, what it costs, and what happens next.\n\n## Define the problem in operating terms`);
  source = source.replace(/(Ask the people who perform and receive the work[\s\S]*?nobody documented\.)/, `$1\n\n${detail}`);
  source = source.replace(/(Revisit exclusions only after the first scope meets its agreed standard\.)/, `$1\n\n${surprise}`);
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  source = source.replace(/If you want help defining the constraint and implementing the first accountable scope, \[talk with GrowthCast\]\(\/\?contact=1\)\./, closings[slug]);
  await writeFile(articleUrl, source);
  const body = source.replace(/^---\n[\s\S]*?\n---\n/, "");
  const wordCount = body.match(/\b[\w’'-]+\b/g)?.length ?? 0;
  const briefUrl = new URL(`../docs/content-briefs/${slug}.md`, import.meta.url);
  let brief = await readFile(briefUrl, "utf8");
  brief = brief.replace(/- Article word count: \d+/, `- Article word count: ${wordCount}`);
  brief = brief.replace(/- Checks: .*/, "- Checks: search intent, title promise, length, links, evidence, human-first agency, AI-signature, rhythm, specificity, read-aloud review, CTA, and scheduled metadata");
  await writeFile(briefUrl, brief);
}

console.log(`Revised ${Object.keys(revisions).length} scheduled articles.`);
