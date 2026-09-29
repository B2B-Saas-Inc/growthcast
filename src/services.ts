import { serviceNavigation } from "./serviceNavigation";

export type Service = {
  slug: string;
  name: string;
  summary: string;
  headline: string;
  intro: string;
  problem: string;
  capabilities: { name: string; description: string }[];
  deliverables: string[];
  measures: string;
  related: string[];
};

export const services: Service[] = [
  {
    ...serviceNavigation[0],
    summary: "Connect your growth strategy, data, tools, and execution around one revenue plan.",
    headline: "Build the system behind your next stage of growth.",
    intro: "GrowthCast turns revenue goals into a working plan across marketing, sales, product, and customer success. We find the constraint, build what is missing, and work beside your team to improve it.",
    problem: "Your teams are busy, but their plans do not add up to the same target. More campaigns will not fix a broken handoff or a product journey that loses customers. GTM Engineering connects the work so each investment supports the next step toward revenue.",
    capabilities: [
      { name: "Growth modeling", description: "Translate the revenue target into acquisition, conversion, retention, and budget assumptions your team can review together." },
      { name: "Customer journey design", description: "Map the path from first contact to renewal, find where progress stalls, and give each handoff a clear owner." },
      { name: "Systems and automation", description: "Connect your tools and data, remove repetitive work, and build workflows with clear checks and exception handling." },
      { name: "Experimentation and execution", description: "Prioritize tests by the constraint they address, ship the work, and use the results to decide what comes next." },
    ],
    deliverables: ["A shared growth model and prioritized execution roadmap", "Working integrations and documented workflows", "An experiment backlog with owners and success criteria", "A review cadence tied to revenue and customer outcomes"],
    measures: "We track the customer journey from acquisition through retention, then focus on the conversion, speed, and cost measures that reveal whether the current constraint is improving.",
    related: ["strategy", "ai-enablement", "fractional-growth-leadership"],
  },
  {
    ...serviceNavigation[1],
    summary: "Plan, launch, and improve paid acquisition with creative and measurement connected to revenue.",
    headline: "Make your media budget answer to the business.",
    intro: "GrowthCast manages paid media across search, social, creator content, and newsletters. We connect audience, message, landing experience, and conversion data so you can see what deserves more investment.",
    problem: "Clicks and platform conversions can look healthy while customer acquisition stays expensive. We start with the offer, unit economics, and quality of the customer journey, then choose the channels and tests that fit.",
    capabilities: [
      { name: "Google Ads", description: "Build and manage search campaigns around buyer intent, with keyword strategy, account structure, bidding, creative, and landing-page testing." },
      { name: "Meta Ads", description: "Test audiences, offers, and creative across Facebook and Instagram, with acquisition and retargeting connected to downstream results." },
      { name: "LinkedIn Ads", description: "Reach relevant companies and decision-makers, develop offers for each buying stage, and review lead quality with sales." },
      { name: "Reddit Ads", description: "Match campaigns to relevant communities and interests, with creative that respects the context in which people see it." },
      { name: "Performance UGC", description: "Develop creator briefs, coordinate production and usage rights, and test user-generated content through distinct hooks, messages, and edits." },
      { name: "Newsletter Ads", description: "Identify relevant publications, coordinate sponsorship placements, and track responses from the click through to the customer." },
    ],
    deliverables: ["A channel plan and budget tied to acquisition economics", "Campaign setup, conversion tracking checks, and ongoing management", "A creative testing plan with clear briefs and learning records", "Reporting on spend, customer quality, and revenue contribution"],
    measures: "We review acquisition cost, conversion quality, pipeline or customer revenue, and payback where data supports it. Platform metrics help diagnose performance; attribution limits stay visible.",
    related: ["analytics-reporting", "lifecycle-marketing", "content-marketing"],
  },
  {
    ...serviceNavigation[2],
    summary: "Help buyers discover and understand your business through search engines and AI answers.",
    headline: "Show up when buyers are looking for answers.",
    intro: "GrowthCast connects search engine optimization and answer engine optimization with the questions your customers ask. We improve the technical foundation, content, and clarity of your site so useful information is easier to find and understand.",
    problem: "A growing library of articles does little if it misses buyer intent or search engines cannot reliably access it. We identify gaps across technical health, topic coverage, and the path from a search visit to a meaningful action.",
    capabilities: [
      { name: "Technical SEO", description: "Review crawlability, indexability, internal linking, page structure, and site performance, then prioritize fixes by their business impact." },
      { name: "Search strategy", description: "Map customer questions and buying intent to the pages you need, including service, comparison, educational, and conversion content." },
      { name: "Answer engine optimization", description: "Make key facts, expertise, and answers explicit through clear writing, consistent business information, and appropriate structured data." },
      { name: "Content improvement", description: "Refresh existing pages, close coverage gaps, and strengthen the links between helpful information and your offer." },
    ],
    deliverables: ["A prioritized technical and content audit", "A topic map and page-level briefs grounded in buyer intent", "On-page improvements and appropriate structured data", "A measurement plan for organic discovery and conversions"],
    measures: "We review qualified organic visits, search visibility, conversion paths, and observed AI referrals or mentions. Rankings and inclusion in AI answers are outside any agency's control; we report what we can actually observe.",
    related: ["content-marketing", "analytics-reporting", "gtm-engineering"],
  },
  {
    ...serviceNavigation[3],
    summary: "Turn scattered data into reliable measures and reports that support growth decisions.",
    headline: "Know what changed. Decide what to do next.",
    intro: "GrowthCast designs measurement around the decisions your team needs to make. We connect acquisition, product, sales, and revenue data so reporting explains the customer journey and gives teams a shared view of performance.",
    problem: "When dashboards disagree, every review becomes a debate about the numbers. We define the metrics, trace the data, and test the collection process before building another chart.",
    capabilities: [
      { name: "Measurement planning", description: "Define your funnel, events, conversion goals, and metric owners in a tracking plan that engineering and business teams can both use." },
      { name: "Implementation and validation", description: "Configure analytics and conversion tracking, verify event properties, and check key journeys for missing or duplicate data." },
      { name: "Reporting and dashboards", description: "Build views for leadership and operators that connect channel performance, product behavior, pipeline, and revenue." },
      { name: "Analysis and decisions", description: "Investigate funnel drop-off, cohorts, retention, and campaign performance, then turn findings into specific next actions." },
    ],
    deliverables: ["A measurement plan and shared metric dictionary", "Validated tracking with documented data limitations", "Dashboards organized around recurring decisions", "A reporting cadence with findings, actions, and owners"],
    measures: "We assess data completeness, consistency, and usefulness alongside the business metrics themselves. Each report should make a decision easier and show where the evidence is incomplete.",
    related: ["gtm-engineering", "paid-media-management", "crm-revenue-ops"],
  },
  {
    ...serviceNavigation[4],
    summary: "Connect people, pipeline, and customer data so revenue teams can follow through.",
    headline: "Give every opportunity a clear next step.",
    intro: "GrowthCast builds CRM processes around how your team actually sells and serves customers. We connect marketing, sales, and customer success with shared definitions, reliable records, and accountable handoffs.",
    problem: "Leads disappear between systems, stages mean different things to different people, and reporting depends on manual cleanup. We fix the process and the data together so your CRM supports the work.",
    capabilities: [
      { name: "CRM architecture", description: "Define people, companies, opportunities, properties, and relationships around your sales motion and reporting needs." },
      { name: "Pipeline and handoffs", description: "Set clear stage criteria, ownership, lead routing, follow-up tasks, and transitions into onboarding or customer success." },
      { name: "Data quality and integrations", description: "Connect source systems, map fields, manage duplicates, and establish rules for keeping customer records useful." },
      { name: "Revenue reporting", description: "Make pipeline movement, conversion, deal velocity, and forecast assumptions visible to the people making revenue decisions." },
    ],
    deliverables: ["A documented CRM data model and lifecycle definitions", "Configured pipelines, routing, and handoff workflows", "A data cleanup and integration plan", "Revenue dashboards and practical team documentation"],
    measures: "We review lead response, stage conversion, time in stage, pipeline quality, and record completeness. The goal is a process your team can trust and use consistently.",
    related: ["marketing-ops", "analytics-reporting", "lifecycle-marketing"],
  },
  {
    ...serviceNavigation[5],
    summary: "Build the tools, processes, and data flows that help your marketing team execute consistently.",
    headline: "Make good marketing easier to ship.",
    intro: "GrowthCast helps marketing teams spend less time coordinating tools and repairing workflows. We organize the stack, standardize campaign operations, and connect the data behind each launch.",
    problem: "Every campaign requires another spreadsheet, manual import, or last-minute tracking fix. As the team grows, that friction multiplies. We build repeatable operations with clear ownership and checks before work goes live.",
    capabilities: [
      { name: "Marketing stack design", description: "Review the tools you use, identify overlapping functions and missing connections, and define what each system should own." },
      { name: "Campaign operations", description: "Standardize intake, briefs, naming, tracking parameters, launch checks, and reporting so campaigns follow a repeatable process." },
      { name: "Data and integrations", description: "Connect forms, audiences, campaign platforms, and your CRM with documented field mappings and consent handling." },
      { name: "Workflow automation", description: "Automate repetitive coordination and data tasks, with monitoring and clear paths for exceptions that need a person." },
    ],
    deliverables: ["A stack audit and systems ownership map", "Campaign templates and launch checklists", "Configured integrations and operational automations", "Documentation and team handover for day-to-day use"],
    measures: "We review launch lead time, manual effort, tracking coverage, and workflow failures. Reliable operations should make execution faster and leave fewer gaps to repair later.",
    related: ["crm-revenue-ops", "lifecycle-marketing", "analytics-reporting"],
  },
  {
    ...serviceNavigation[6],
    summary: "Help prospects and customers take the next useful step with relevant, timely communication.",
    headline: "Keep the customer journey moving after the first click.",
    intro: "GrowthCast builds lifecycle programs around customer intent and behavior. From lead nurture and onboarding to retention and expansion, we connect the message, timing, and next action to the customer's stage.",
    problem: "Acquisition brings people in, but generic follow-ups leave them to figure out the next step. We find where prospects or customers lose momentum and design communication that helps them make progress.",
    capabilities: [
      { name: "Lead nurture", description: "Create segmented journeys that address buying questions, respond to intent, and hand qualified prospects to sales." },
      { name: "Onboarding and activation", description: "Guide new users toward meaningful product use with behavior-based messages and clear next steps." },
      { name: "Retention and expansion", description: "Build programs for adoption, renewal, re-engagement, and relevant upgrades using customer context." },
      { name: "Automation and testing", description: "Implement triggers, segments, exclusions, consent preferences, and tests so messages reach the right people without colliding." },
    ],
    deliverables: ["A lifecycle map with prioritized journey gaps", "Audience definitions, message plans, and campaign copy", "Configured and tested automated journeys", "A measurement and iteration plan for each program"],
    measures: "We focus on stage progression, activation, retained customers, and expansion where relevant. Engagement metrics help explain the journey, while holdouts or controlled tests help assess incremental impact when feasible.",
    related: ["crm-revenue-ops", "marketing-ops", "content-marketing"],
  },
  {
    ...serviceNavigation[7],
    summary: "Turn your expertise into useful content, podcast conversations, and newsletters buyers want to follow.",
    headline: "Give your audience a reason to listen. And come back.",
    intro: "GrowthCast builds content programs around the questions, ideas, and conversations that matter to your buyers. We connect editorial planning with distribution so the work has a clear audience and a purpose.",
    problem: "Publishing more does not help if the content lacks a point of view or a way to reach the right people. We draw on your team's expertise and build a practical plan for earning attention over time.",
    capabilities: [
      { name: "Content strategy and production", description: "Define themes, interview subject-matter experts, and create useful content that supports discovery, evaluation, and customer education." },
      { name: "Podcast guesting opportunities", description: "Find relevant shows for your founders and experts, develop compelling topics, and coordinate pitches and preparation for guest appearances." },
      { name: "Securing podcast guests", description: "Identify and approach guests for your own show, coordinate scheduling, and prepare briefs that help hosts lead useful conversations." },
      { name: "Newsletters", description: "Develop the editorial premise, plan issues, write and produce editions, and build a distribution and audience-development rhythm." },
      { name: "Distribution and repurposing", description: "Turn interviews, episodes, and long-form ideas into supporting pieces for your site, email, and social channels." },
    ],
    deliverables: ["An editorial strategy and practical publishing calendar", "Content briefs, expert interviews, and finished assets", "Podcast target or guest lists with outreach and preparation materials", "A newsletter format and repeatable production workflow"],
    measures: "We review relevant audience reach, returning readers, subscriber engagement, qualified visits, and conversations influenced by content. Podcast placements and guest participation depend on the other party's interest and availability.",
    related: ["seo-aeo", "lifecycle-marketing", "paid-media-management"],
  },
  {
    ...serviceNavigation[8],
    summary: "Choose where to compete, what to prioritize, and how to turn your growth target into an actionable plan.",
    headline: "Give your growth target a strategy the team can execute.",
    intro: "GrowthCast helps leadership teams make the choices behind sustainable growth. We connect customer insight, positioning, acquisition economics, and team capacity in one plan with clear priorities.",
    problem: "A revenue target is not a strategy. When every channel and customer segment looks like an opportunity, teams spread their effort too thin. We identify the growth constraint, test the assumptions, and decide where to focus first.",
    capabilities: [
      { name: "Growth diagnosis", description: "Review your customer journey, performance data, and team priorities to find the constraints that matter most to the next stage of growth." },
      { name: "Customer and market focus", description: "Define the customers you can serve best, examine their buying decisions, and sharpen your positioning and offer." },
      { name: "GTM and channel strategy", description: "Choose acquisition and retention priorities based on customer behavior, unit economics, and the resources your team can commit." },
      { name: "Growth planning", description: "Translate the target into scenarios, budget choices, and a sequenced roadmap with owners and explicit assumptions." },
    ],
    deliverables: ["A growth diagnosis with prioritized constraints and opportunities", "Customer, positioning, and go-to-market recommendations", "A growth model with budget scenarios and testable assumptions", "A 90-day roadmap with owners, milestones, and decision criteria"],
    measures: "We review progress against agreed revenue, acquisition, conversion, and retention goals. We track which assumptions the team has validated and use those findings to revise the plan.",
    related: ["fractional-growth-leadership", "gtm-engineering", "analytics-reporting"],
  },
  {
    ...serviceNavigation[9],
    summary: "Put AI to work in your growth workflows with practical implementation, team training, and measurable results.",
    headline: "Make AI useful in the work your team does every day.",
    intro: "GrowthCast helps marketing and revenue teams turn AI experiments into working processes. We find useful applications, connect them to your tools and data, and help your team use them with confidence.",
    problem: "Individual AI tools can save time while leaving the wider workflow unchanged. We start with the task, the quality standard, and the people who own the result, then build a process the team can actually rely on.",
    capabilities: [
      { name: "Workflow and opportunity assessment", description: "Map repetitive research, content, sales, and reporting tasks. Prioritize AI applications by expected value, data readiness, and the cost of mistakes." },
      { name: "AI workflow implementation", description: "Build and connect AI-assisted workflows for tasks such as research synthesis, content preparation, lead qualification, and reporting, with clear inputs and outputs." },
      { name: "Quality and human review", description: "Define evaluation examples, data access boundaries, review checkpoints, and fallback steps before a workflow becomes part of daily operations." },
      { name: "Team training and adoption", description: "Train the people who will use and maintain each workflow, document the process, and improve it using feedback from real work." },
    ],
    deliverables: ["A prioritized AI opportunity map and implementation plan", "Working pilots connected to agreed tools and data sources", "Quality checks, human review steps, and workflow documentation", "Practical team training and an adoption review cadence"],
    measures: "We compare task completion time, output quality, rework, and operating cost against the original process. Adoption and exception rates show whether a workflow is ready for broader use.",
    related: ["strategy", "marketing-ops", "gtm-engineering"],
  },
  {
    ...serviceNavigation[10],
    summary: "Bring experienced growth leadership into your team to set direction, lead execution, and develop your growth function.",
    headline: "Give growth a leader who owns the plan and the follow-through.",
    intro: "GrowthCast provides fractional growth leadership for companies that need senior direction and hands-on operating support. We work with your founders and functional leads to align priorities, lead the growth cadence, and build the team's capabilities.",
    problem: "Growth decisions often sit with a founder who already owns too much, or across teams without a shared owner. A fractional growth leader gives the work direction and accountability while you build the right long-term team.",
    capabilities: [
      { name: "Growth function leadership", description: "Set the growth agenda with leadership, align marketing, sales, product, and customer success, and establish clear decision rights." },
      { name: "Planning and budget ownership", description: "Build the growth plan, recommend resource allocation, and review tradeoffs with the people accountable for the business." },
      { name: "Execution and team development", description: "Lead regular performance and experiment reviews, coach team members, coordinate partners, and help define hiring needs." },
      { name: "Executive communication and transition", description: "Turn performance into clear leadership updates and document the operating model for a future full-time growth leader." },
    ],
    deliverables: ["An agreed leadership remit, decision rights, and working cadence", "A growth plan, budget recommendations, and accountable owners", "Regular performance reviews and executive updates", "A team development and hiring plan with transition documentation"],
    measures: "We assess progress against the agreed growth plan, the speed and quality of decisions, and the team's ability to execute. Revenue, pipeline, acquisition cost, and retention measures depend on your business model and engagement scope.",
    related: ["strategy", "gtm-engineering", "ai-enablement"],
  },
];
