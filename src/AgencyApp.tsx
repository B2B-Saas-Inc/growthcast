import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";

type PageView =
  | "home"
  | "why"
  | "how"
  | "baseline"
  | "forecast"
  | "deepdive"
  | "channels"
  | "methodology"
  | "terms"
  | "privacy"
  | "about"
  | "philosophy"
  | "careers"
  | "partners";

const pageMetadata: Record<PageView, { title: string; description: string; path: string }> = {
  home: { title: "GrowthCast | GTM Engineering for Growth", description: "One growth plan across marketing, product, sales, and data.", path: "/" },
  why: { title: "Why GrowthCast | One Plan for Revenue", description: "Why growth requires one operating plan across the whole customer path.", path: "/why-growthcast" },
  how: { title: "How We Work | GrowthCast",  description: "See how GrowthCast finds the revenue constraint, builds the model, and works beside your team.", path: "/how-it-works" },
  terms: { title: "Terms of Use | GrowthCast", description: "Terms for using GrowthCast and the Forecast tool.", path: "/terms" },
  privacy: { title: "Privacy Policy | GrowthCast", description: "How GrowthCast collects, uses, and protects information.", path: "/privacy" },
  about: { title: "About GrowthCast | Operator-Led Growth", description: "Meet the operator behind GrowthCast and review the experience that shaped the work.", path: "/company/about" },
  philosophy: { title: "GrowthCast Philosophy | AAARRR and Future Demand", description: "How GrowthCast connects the full customer journey with current and future demand.", path: "/company/philosophy" },
  careers: { title: "Careers | GrowthCast", description: "Future opportunities to work with GrowthCast.", path: "/company/careers" },
  partners: { title: "Partners | GrowthCast", description: "The technology partners GrowthCast uses to build modern growth systems.", path: "/company/partners" },
  baseline: { title: "GrowthCast Forecast | Build Your Growth Model", description: "Model traffic, conversion, customers, revenue, churn, and channel spend.", path: "/resources/tools/forecast" },
  forecast: { title: "Growth Forecast | GrowthCast", description: "Review your modeled growth forecast.", path: "/resources/tools/forecast" },
  deepdive: { title: "Growth Forecast Deep Dive | GrowthCast", description: "Explore the drivers behind your growth forecast.", path: "/resources/tools/forecast" },
  channels: { title: "Growth Channel Plan | GrowthCast", description: "Model channel timing, spend, traffic, conversion, and customer value.", path: "/resources/tools/forecast" },
  methodology: { title: "Forecast Methodology | GrowthCast", description: "Review the assumptions and calculations behind the GrowthCast Forecast.", path: "/resources/tools/forecast" },
};

const pageFromPath = (path: string): PageView => {
  if (path.startsWith("/resources/tools/forecast")) return "baseline";
  if (path.startsWith("/why-growthcast")) return "why";
  if (path.startsWith("/how-it-works")) return "how";
  if (path.startsWith("/terms")) return "terms";
  if (path.startsWith("/privacy")) return "privacy";
  if (path.startsWith("/company/about")) return "about";
  if (path.startsWith("/company/philosophy")) return "philosophy";
  if (path.startsWith("/company/careers")) return "careers";
  if (path.startsWith("/company/partners")) return "partners";
  return "home";
};

function AgencyHome({
  onForecast,
  onContact,
}: {
  onForecast: () => void;
  onContact: () => void;
}) {
  return (
    <article className="homeCard agencyHome">
      <section className="agencyHero conversionHero">
        <div className="agencyHeroCopy">
          <span className="sectionLabel">GTM Engineering for Growth</span>
          <h1>You gave the board a growth target. Here&apos;s how you&apos;re going to crush it.</h1>
          <p>
            GrowthCast executes at the nexus of marketing, product, sales, and
            data to identify, prioritize, and build the Golden Path.
          </p>
          <div className="agencyActions">
            <button className="agencyPrimary" type="button" onClick={onContact}>
              Let's Talk Growth
            </button>
            <button type="button" onClick={onForecast}>Build a forecast</button>
          </div>
          <p className="heroReassurance">A direct conversation with the person who will lead the work. No sales team.</p>
        </div>
      </section>

      <section className="heroMetrics" aria-label="GrowthCast experience">
        <article><strong>$20M+</strong><span>annual recurring revenue built</span></article>
        <article><strong>1,000,000+</strong><span>users acquired</span></article>
        <article><strong>$50M+</strong><span>raised by teams</span></article>
      </section>

      <section className="investorProof" aria-label="Investor-backed company experience">
        <span>Trusted by teams backed by</span>
        <div>
          {['NEA', 'Lightspeed', 'Decibel', 'OMERS Ventures', 'Caffeinated Capital'].map((name) => (
            <strong key={name}>{name}</strong>
          ))}
        </div>
      </section>

      <section className="agencyProblem homePain">
        <div className="sectionIntro">
          <span className="sectionLabel">You are doing the work, but</span>
          <h2>Growth gets harder as the company adds more moving parts.</h2>
        </div>
        <div className="problemBody">
          <p className="problemLead">
            As the pace of work accelerates, if your GTM motion doesn&apos;t facilitate scale, it inhibits execution.
          </p>
          <div className="problemGrid">
            <article><b>01</b><h3>No shared model</h3><p>Marketing, product, and revenue plan from different assumptions. Leaders cannot see what must be true for the target to hold.</p></article>
            <article><b>02</b><h3>Activity hides the constraint</h3><p>Teams ship campaigns, features, reports, and automations. The point limiting growth stays unfixed.</p></article>
            <article><b>03</b><h3>Data does not guide action</h3><p>Dashboards explain what happened. They do not tell the team what to fund, stop, or change next.</p></article>
            <article><b>04</b><h3>More spend scales waste</h3><p>New channels and tools add cost before conversion, retention, handoffs, and ownership are ready.</p></article>
          </div>
        </div>
      </section>

      <section className="leadStory">
        <div className="leadStoryCopy">
          <span className="sectionLabel">What happens when growth has one owner</span>
          <h2>A newsletter platform grew from launch to more than $20M in ARR.</h2>
          <p>
            As the first growth employee, GrowthCast&apos;s founder helped build the
            path from product launch to repeatable acquisition and revenue. The work joined
            positioning, demand, conversion, lifecycle, data, and product around
            the same growth goal.
          </p>
        </div>
        <div className="leadStoryStats">
          <article><strong>$20M+</strong><span>annual recurring revenue built</span></article>
          <article><strong>1,000,000+</strong><span>users acquired</span></article>
          <article><strong>$50M+</strong><span>raised by teams</span></article>
        </div>
      </section>

      <section className="transformationSection">
        <div className="sectionIntro">
          <span className="sectionLabel">What changes</span>
          <h2>Stop managing disconnected growth work.</h2>
        </div>
        <div className="transformationGrid">
          <article className="beforeState">
            <span>What growth looks like now</span>
            <ul>
              <li>Each function works from a different plan</li>
              <li>Budget follows channels instead of constraints</li>
              <li>Reports arrive after decisions are made</li>
              <li>Short-term demand crowds out future demand</li>
              <li>Senior leaders fill gaps through manual work</li>
            </ul>
          </article>
          <article className="afterState">
            <span>What GrowthCast builds</span>
            <ul>
              <li>One model links demand, product use, revenue, and retention</li>
              <li>Investment follows the point limiting growth</li>
              <li>Measures support the next decision</li>
              <li>Current and future demand share one plan</li>
              <li>Clear systems, owners, and operating rhythms</li>
            </ul>
          </article>
        </div>
      </section>

      <section className="agencyResults supportingResults">
        <div className="sectionIntro">
          <span className="sectionLabel">Real results from the work</span>
          <h2>Built inside B2B software, AI tools, and consumer products.</h2>
        </div>
        <div className="resultGrid">
          <article><strong>200+</strong><h3>Enterprise clients</h3><p>A new private-equity motion helped an AI research platform close more than 200 enterprise clients in six months.</p></article>
          <article><strong>450%</strong><h3>More signups</h3><p>An integrated growth plan increased signups at a creative platform by 450% within two weeks.</p></article>
          <article><strong>$20M+</strong><h3>Annual recurring revenue</h3><p>Growth leadership helped a software company grow from launch to more than $20 million in ARR.</p></article>
        </div>
      </section>

      <section className="agencyFit">
        <div className="fitColumn fitYes">
          <span className="sectionLabel">You are a fit if</span>
          <h2>The product works. The growth system needs to catch up.</h2>
          <ul>
            <li>You have product-market fit and real customer traction.</li>
            <li>You face pressure to turn traction into repeatable revenue.</li>
            <li>There&apos;s no one orchestrating marketing, product, sales, and data.</li>
            <li>You want the experience of a senior operator who can advise, lead, and/or build without the overhead of a full-time hire.</li>
          </ul>
        </div>
        <div className="fitColumn fitNo">
          <span className="sectionLabel">Probably not a fit if</span>
          <h2>You still need to prove the core demand.</h2>
          <ul>
            <li>You are still choosing the customer or problem.</li>
            <li>You want isolated tactics instead of a shared growth plan.</li>
            <li>You cannot give the work access, support, or an owner.</li>
            <li>You need a low-cost execution vendor, not an embedded operator.</li>
          </ul>
        </div>
      </section>

      <section className="agencyClose conversionClose">
        <span className="sectionLabel">Find the constraint</span>
        <h2>Ready to engineer your go-to-market system?</h2>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}

function AgencyWhy({ onContact }: { onContact: () => void }) {
  return (
    <article className="homeCard agencyHome agencySubpage">
      <section className="subpageHero">
        <span className="sectionLabel">Why GrowthCast</span>
        <h1>The trendy “hack” you heard on that podcast is not a growth plan.</h1>
        <p>GrowthCast brings the judgment, experience, and discipline to execute sustainable, scalable strategies.</p>
        <div className="agencyActions">
          <button className="agencyPrimary" type="button" onClick={onContact}>Let's Talk Growth</button>
        </div>
      </section>
      <section className="agencyMethod whyArguments">
        <div className="sectionIntro">
          <span className="sectionLabel">What most companies get wrong</span>
          <h2>Growth is a company system, not a marketing channel.</h2>
          <p>GrowthCast works across the full path from demand to retention. That changes how the company sets priorities, uses data, and decides where to invest.</p>
        </div>
        <ol className="methodSteps">
          <li><b>01</b><div><h3>A revenue target is not a growth plan.</h3><p>A target says where the company wants to go. It does not show how many buyers, users, customers, and retained dollars the business needs each month. We turn the target into a model every team can use.</p></div></li>
          <li><b>02</b><div><h3>The biggest problem may not sit in marketing.</h3><p>More demand cannot fix weak activation, a broken sales handoff, poor retention, or pricing that limits revenue. We find the point that holds back the whole system before we add work or spend.</p></div></li>
          <li><b>03</b><div><h3>Dashboards do not make decisions.</h3><p>Teams often have more data than they can use. We define the few measures that reveal what changed, why it changed, and what the company should do next.</p></div></li>
          <li><b>04</b><div><h3>AI should remove work, not add another tool.</h3><p>We use automation when it shortens a process, improves a decision, or lets the team serve more customers. If it does none of those things, it does not belong in the plan.</p></div></li>
        </ol>
      </section>
      <section className="agencyClose">
        <span className="sectionLabel">One plan for revenue</span>
        <h2>Find what is holding growth back.</h2>
        <p>Start with the target, the customer path, and the facts already inside the business.</p>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}

function CompanyPage({ type }: { type: "about" | "philosophy" | "careers" | "partners" }) {
  if (type === "about") {
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero">
          <span className="sectionLabel">About GrowthCast</span>
          <h1>Builders without boundaries.</h1>
          <p>GrowthCast&apos;s DNA is rooted in strategy and execution, brand and data, product and revenue.</p>
        </section>
        <section className="companyNarrative">
          <div><h2>Curious enough to ask why. Practical enough to build the answer.</h2></div>
          <div>
            <p>The experience behind GrowthCast spans early-stage consumer products, D2C brands, B2B software, and enterprise AI. It also includes two agency stints at firms that were later acquired.</p>
            <p>Across those settings, the work has moved between positioning, product marketing, paid media, lifecycle, analytics, revenue operations, sales, customer success, software, and team building. The common thread is a willingness to cross boundaries and take responsibility for the result.</p>
            <p>GrowthCast brings that mindset to every engagement. Start with first principles. Stay close to customers. Use data without hiding behind it. Work beside the team. Leave behind a system that keeps working.</p>
            <a href="https://www.linkedin.com/in/edwardjwhiteiii" target="_blank" rel="noreferrer">Connect with our founder</a>
          </div>
        </section>
        <section className="aboutJourney">
          <div><h2>Experience across markets, stages, and business models.</h2></div>
          <div className="aboutJourneyGrid">
            <article><b>Agency foundation</b><p>Built cross-industry experience at two agencies that were later acquired, working across strategy, media, analytics, customer journeys, and organizational change.</p></article>
            <article><b>Early stage</b><p>Repeated first-team experience building brands, acquisition systems, customer journeys, and operating processes from zero.</p></article>
            <article><b>Scale</b><p>Helped a software company grow from launch to more than $30 million in revenue, 20,000 customers, and 500,000 users.</p></article>
            <article><b>AI-Native</b><p>Builds growth systems for AI companies and uses AI across research, decision-making, automation, product experiences, and go-to-market execution.</p></article>
          </div>
        </section>
      </article>
    );
  }
  if (type === "philosophy") {
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero">
          <span className="sectionLabel">Philosophy</span>
          <h1>Marketing is about people.</h1>
          <p>Whether a company sells to businesses, consumers, or both, growth depends on influencing people. We keep that principle at the center of every decision.</p>
        </section>
        <section className="peopleFramework">
          <span className="sectionLabel">Business to People</span>
          <h2>The label changes. The person making the decision does not.</h2>
          <p>B2B, B2C, and D2C describe how a company sells. They do not change who chooses, uses, recommends, or pays for the product. Every market is made of people with goals, habits, doubts, and competing demands on their attention.</p>
          <p>GrowthCast starts there. We ask what people need to believe, feel, and do before we decide what to build, say, measure, or fund.</p>
        </section>
        <section className="futureDemandFramework">
          <span className="sectionLabel">Future Demand</span>
          <h2>Understand how people decide before trying to persuade them.</h2>
          <p>Most potential buyers are not ready to buy today. They notice problems, learn categories, remember brands, and build preferences long before they enter a sales process.</p>
          <p>Future Demand builds memory before the need becomes urgent. Current Demand helps people act when they are ready. A sound growth plan must do both.</p>
        </section>
        <section className="frameworkSection">
          <div className="sectionIntro"><span className="sectionLabel">AAARRR</span><h2>Turn that understanding into a system.</h2><p>AAARRR applies what we know about people and decisions across the full customer journey.</p></div>
          <ol className="frameworkGrid">
            {[
              ["Awareness", "Make the right people aware of the problem and the company that can solve it."],
              ["Acquisition", "Turn attention into a visit, signup, lead, or other meaningful first step."],
              ["Activation", "Help people reach the first moment when the product proves its value."],
              ["Revenue", "Turn proven value into paid customer relationships and healthy unit economics."],
              ["Retention", "Keep delivering enough value for customers to stay and grow."],
              ["Referral", "Give successful customers a reason and a way to bring others with them."],
            ].map(([name, description], index) => <li key={name}><b>{String(index + 1).padStart(2, "0")}</b><h3>{name}</h3><p>{description}</p></li>)}
          </ol>
        </section>
      </article>
    );
  }

  if (type === "partners") {
    const partnerGroups = [
      ["Affiliate", [["Dub.co", "https://dub.co"]]],
      ["Analytics", [["PostHog", "https://posthog.com"], ["BlueAlpha", "https://bluealpha.ai"], ["Ahrefs", "https://ahrefs.com"]]],
      ["CRM", [["Attio", "https://attio.com"]]],
      ["Marketing Automation", [["Customer.io", "https://customer.io"]]],
      ["CMS", [["Sanity", "https://sanity.io"], ["Prismic", "https://prismic.io"]]],
      ["Content", [["beehiiv", "https://beehiiv.com"]]],
      ["AI", [["OpenRouter", "https://openrouter.ai"], ["ElevenLabs", "https://elevenlabs.io"], ["Clay", "https://clay.com"]]],
      ["Infra", [["Trigger.dev", "https://trigger.dev"], ["Hookdeck", "https://hookdeck.com"]]],
    ] as const;
    return (
      <article className="homeCard agencyHome agencySubpage companyPage">
        <section className="subpageHero"><span className="sectionLabel">Partners</span><h1>Tools chosen for the system they support.</h1><p>GrowthCast works with focused technology partners across data, content, customer relationships, automation, and AI.</p></section>
        <section className="partnersShowcase" aria-labelledby="partners-heading">
          <h2 id="partners-heading">The GrowthCast partner network.</h2>
          <div className="partnerGrid">
            {partnerGroups.map(([category, partners]) => (
              <article key={category}>
                <h3>{category}</h3>
                <ul>{partners.map(([partner, url]) => <li key={partner}><a href={url} target="_blank" rel="noreferrer">{partner}</a></li>)}</ul>
              </article>
            ))}
          </div>
        </section>
      </article>
    );
  }
  return (
    <article className="homeCard agencyHome agencySubpage companyPage">
      <section className="subpageHero"><span className="sectionLabel">Careers</span><h1>Build growth systems that teams can keep using.</h1><p>GrowthCast is not hiring right now. Future opportunities will appear here.</p></section>
    </article>
  );
}

function LegalPage({ type }: { type: "terms" | "privacy" }) {
  const isPrivacy = type === "privacy";
  return (
    <article className="homeCard agencyHome legalPage">
      <section className="subpageHero">
        <span className="sectionLabel">GrowthCast</span>
        <h1>{isPrivacy ? "Privacy Policy" : "Terms of Use"}</h1>
        <p>Last updated September 1, 2026.</p>
      </section>
      <section className="legalBody">
        {isPrivacy ? (
          <>
            <h2>Information we collect</h2>
            <p>When you submit a contact or Growth Plan form, we collect the information you provide. This can include your name, company, business email, title, baseline, and forecast assumptions.</p>
            <p>We also use PostHog to understand how people use this site. PostHog can collect device, browser, page, and interaction data.</p>
            <h2>How we use information</h2>
            <p>We use this information to respond to requests, provide GrowthCast services, improve the site, and understand product use. We do not sell personal information.</p>
            <h2>Local model data</h2>
            <p>The Forecast tool stores model progress in your browser. GrowthCast does not receive that model data unless you submit a Growth Plan request.</p>
            <h2>Service providers</h2>
            <p>We use service providers, including PostHog and our website host, to operate and measure the site. They process information on our behalf.</p>
            <h2>Your choices</h2>
            <p>You can clear locally stored Forecast data through your browser. To ask about, correct, or delete information you submitted, contact GrowthCast.</p>
          </>
        ) : (
          <>
            <h2>Using this site</h2>
            <p>You may use the GrowthCast site and Forecast tool for lawful business purposes. Do not misuse the site, interfere with its operation, or attempt to access systems or data without permission.</p>
            <h2>Forecasts are estimates</h2>
            <p>The Forecast tool produces estimates from the assumptions you provide. Its output is not financial, legal, tax, or investment advice. You are responsible for decisions based on the output.</p>
            <h2>Ownership</h2>
            <p>GrowthCast owns the site, its design, and its original content. You retain ownership of information and assumptions you enter.</p>
            <h2>No warranty</h2>
            <p>The site is provided as available. GrowthCast does not promise that it will always be available, error-free, or suitable for a specific purpose.</p>
            <h2>Limitation of liability</h2>
            <p>To the extent allowed by law, GrowthCast is not liable for indirect, incidental, or consequential loss arising from use of the site or Forecast tool.</p>
            <h2>Changes</h2>
            <p>We may update these terms. Continued use of the site after an update means you accept the revised terms.</p>
          </>
        )}
      </section>
    </article>
  );
}

function AgencyHow({ onContact }: { onContact: () => void }) {
  return (
    <article className="homeCard agencyHome agencySubpage">
      <section className="subpageHero">
        <span className="sectionLabel">How We Work</span>
        <h1>Build the foundation to reach your loftiest goals.</h1>
        <p>We use a proven, adaptable playbook grounded in first principles.</p>
        <div className="agencyActions">
          <button className="agencyPrimary" type="button" onClick={onContact}>Let's Talk Growth</button>
        </div>
      </section>
      <section className="agencyMethod">
        <div className="sectionIntro">
          <span className="sectionLabel">The first 90 days</span>
          <h2>From uncertainty to clear conviction.</h2>
        </div>
        <ol className="methodSteps">
          <li><b>Weeks 1–2</b><div><h3>Find what holds back revenue</h3><p>Review the revenue target, customer journey, conversion, retention, channels, data, tools, and team. Leave with a clear diagnosis and an agreed order of work.</p></div></li>
          <li><b>Weeks 3–4</b><div><h3>Build the growth model</h3><p>Connect demand, product use, customers, revenue, and retention. Set the measures, owners, and monthly assumptions behind the plan.</p></div></li>
          <li><b>Days 31–60</b><div><h3>Fix the first constraint</h3><p>Work with the team to change the process, message, product path, data, or channel that limits growth. Ship the work and measure the result.</p></div></li>
          <li><b>Days 61–90</b><div><h3>Make the system repeatable</h3><p>Keep what works. Remove what does not. Put the reviews, dashboards, automations, and ownership in place so the team can keep improving.</p></div></li>
        </ol>
      </section>
      <section className="deliverySection">
        <div className="sectionIntro">
          <span className="sectionLabel">What we take on</span>
          <h2>Senior growth leadership without another layer to manage.</h2>
        </div>
        <div className="deliveryGrid">
          <article><b>Diagnosis</b><p>We bring the facts together and identify the first problem worth solving.</p></article>
          <article><b>Priorities</b><p>We turn the revenue target into a clear order of work across teams.</p></article>
          <article><b>Execution</b><p>We work inside the tools and processes needed to make the change real.</p></article>
          <article><b>Operating rhythm</b><p>We give leaders a regular way to review results and choose what happens next.</p></article>
        </div>
      </section>
      <section className="agencyClose">
        <span className="sectionLabel">Start with the facts</span>
        <h2>See what the next 90 days should change.</h2>
        <p>No pitch deck. No handoff to a junior team.</p>
        <button type="button" onClick={onContact}>Let's Talk Growth</button>
      </section>
    </article>
  );
}


const loadAnalytics = () => import("./posthog");

export default function AgencyApp({ initialPath = "/" }: { initialPath?: string }) {
  const [pageView, setPageView] = useState<PageView>(() => pageFromPath(initialPath));
  const [showContactForm, setShowContactForm] = useState(false);
  const [contactSubmitted, setContactSubmitted] = useState(false);
  const [contactStatus, setContactStatus] = useState("");
  const contactDialog = useRef<HTMLElement>(null);
  const contactTrigger = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const metadata = pageMetadata[pageView];
    const canonicalUrl = `https://growthcast.app${metadata.path}`;
    document.title = metadata.title;
    const setMeta = (selector: string, attribute: "name" | "property", key: string, content: string) => {
      let element = document.head.querySelector<HTMLMetaElement>(selector);
      if (!element) {
        element = document.createElement("meta");
        element.setAttribute(attribute, key);
        document.head.appendChild(element);
      }
      element.content = content;
    };
    setMeta('meta[name="description"]', "name", "description", metadata.description);
    setMeta('meta[property="og:title"]', "property", "og:title", metadata.title);
    setMeta('meta[property="og:description"]', "property", "og:description", metadata.description);
    setMeta('meta[property="og:url"]', "property", "og:url", canonicalUrl);
    setMeta('meta[name="twitter:title"]', "name", "twitter:title", metadata.title);
    setMeta('meta[name="twitter:description"]', "name", "twitter:description", metadata.description);
    const canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const structuredData = document.getElementById("structured-data");
    if (structuredData) structuredData.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "WebPage", name: metadata.title,
      description: metadata.description, url: canonicalUrl,
      isPartOf: { "@type": "WebSite", name: "GrowthCast", url: "https://growthcast.app/" },
    });
  }, [pageView]);

  useEffect(() => {
    const handleHistory = () => setPageView(pageFromPath(window.location.pathname));
    window.addEventListener("popstate", handleHistory);
    return () => window.removeEventListener("popstate", handleHistory);
  }, []);

  useEffect(() => {
    let loaded = false;
    const initializeAnalytics = () => {
      if (loaded) return;
      loaded = true;
      void loadAnalytics();
      window.removeEventListener("pointerdown", initializeAnalytics);
      window.removeEventListener("keydown", initializeAnalytics);
    };
    window.addEventListener("pointerdown", initializeAnalytics, { passive: true, once: true });
    window.addEventListener("keydown", initializeAnalytics, { once: true });
    return () => {
      window.removeEventListener("pointerdown", initializeAnalytics);
      window.removeEventListener("keydown", initializeAnalytics);
    };
  }, []);

  const closeSiteMenus = (except?: HTMLDetailsElement) => {
    document.querySelectorAll<HTMLDetailsElement>(".siteNav details[open]").forEach((menu) => {
      if (menu !== except) menu.removeAttribute("open");
    });
  };
  const navigate = (target: PageView, path: string) => {
    closeSiteMenus();
    window.history.pushState({}, "", path);
    setPageView(target);
    window.scrollTo({ top: 0 });
  };
  const openContact = useCallback(() => {
    contactTrigger.current = document.activeElement as HTMLElement | null;
    setContactStatus("");
    setShowContactForm(true);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("contact") !== "1") return;
    url.searchParams.delete("contact");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    const frame = window.requestAnimationFrame(openContact);
    return () => window.cancelAnimationFrame(frame);
  }, [openContact]);
  const closeContact = useCallback(() => {
    setShowContactForm(false);
    window.requestAnimationFrame(() => contactTrigger.current?.focus());
  }, []);
  useEffect(() => {
    if (!showContactForm || !contactDialog.current) return;
    const dialog = contactDialog.current;
    const selector = 'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
    dialog.querySelector<HTMLElement>(selector)?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeContact();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(selector));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [closeContact, showContactForm]);
  const requestGrowthConversation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const firstName = String(data.get("firstName") || "").trim();
    const lastName = String(data.get("lastName") || "").trim();
    const company = String(data.get("company") || "").trim();
    const email = String(data.get("email") || "").trim().toLowerCase();
    const title = String(data.get("title") || "").trim();
    if (!firstName || !lastName || !company || !email || !title) return;
    if (!navigator.onLine) {
      setContactStatus("Contact submission is temporarily unavailable. Please connect with our founder instead.");
      return;
    }
    try {
      const { default: posthog, isPostHogEnabled } = await loadAnalytics();
      if (!isPostHogEnabled) {
        setContactStatus("Contact submission is temporarily unavailable. Please connect with our founder instead.");
        return;
      }
      const contact = { email, first_name: firstName, last_name: lastName, company, title };
      posthog.identify(email, contact);
      posthog.capture("growth_conversation_requested", { source: "agency_contact_form", ...contact }, {
        $set: contact, send_instantly: true, transport: "fetch",
      });
      setContactSubmitted(true);
      setContactStatus("");
    } catch {
      setContactStatus("Your request could not be submitted. Please try again.");
    }
  };

  const content = pageView === "why" ? <AgencyWhy onContact={openContact} />
    : pageView === "how" ? <AgencyHow onContact={openContact} />
    : pageView === "terms" || pageView === "privacy" ? <LegalPage type={pageView} />
    : pageView === "about" || pageView === "philosophy" || pageView === "careers" || pageView === "partners" ? <CompanyPage type={pageView} />
    : <AgencyHome onForecast={() => window.location.assign("/resources/tools/forecast")} onContact={openContact} />;

  return (
    <main className="marketingHome">
      <header className="siteHeader">
        <button className="siteBrand" type="button" onClick={() => navigate("home", "/")}><span>GrowthCast</span></button>
        <nav className="siteNav" aria-label="Main navigation">
          <button className={pageView === "why" ? "active" : ""} type="button" onClick={() => navigate("why", "/why-growthcast")}>Why GrowthCast</button>
          <button className={pageView === "how" ? "active" : ""} type="button" onClick={() => navigate("how", "/how-it-works")}>How We Work</button>
          <details className="resourceNav companyNav" onToggle={(event) => { if (event.currentTarget.open) closeSiteMenus(event.currentTarget); }}>
            <summary>Company</summary><div>
              <button type="button" onClick={() => navigate("about", "/company/about")}>About</button>
              <button type="button" onClick={() => navigate("philosophy", "/company/philosophy")}>Philosophy</button>
              <button type="button" onClick={() => navigate("partners", "/company/partners")}>Partners</button>
              <button type="button" onClick={() => navigate("careers", "/company/careers")}>Careers</button>
            </div>
          </details>
          <details className="resourceNav" onToggle={(event) => { if (event.currentTarget.open) closeSiteMenus(event.currentTarget); }}>
            <summary>Resources</summary><div>
              <span>Tools</span><button type="button" onClick={() => window.location.assign("/resources/tools/forecast")}>Forecast</button>
              <span>Publishing</span><p>Newsletter <small>Coming soon</small></p><a href="/blog">Blog</a><p>Case Studies <small>Coming soon</small></p>
            </div>
          </details>
          <button className="siteNavCta" type="button" onClick={openContact}>Let's Talk Growth</button>
        </nav>
      </header>
      {content}
      {showContactForm && <div className="contactModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeContact(); }}>
        <section ref={contactDialog} className="contactModal" role="dialog" aria-modal="true" aria-labelledby="contact-title">
          <button className="contactModalClose" type="button" aria-label="Close contact form" onClick={closeContact}>×</button>
          <h2 id="contact-title">Let&apos;s talk growth.</h2>
          {contactSubmitted ? <p className="contactSuccess" role="status">Thanks. We will be in touch.</p> :
            <form onSubmit={requestGrowthConversation}>
              <label>First name<input name="firstName" autoComplete="given-name" required /></label>
              <label>Last name<input name="lastName" autoComplete="family-name" required /></label>
              <label>Company<input name="company" autoComplete="organization" required /></label>
              <label>Business email<input name="email" type="email" autoComplete="email" required /></label>
              <label>Title<input name="title" autoComplete="organization-title" required /></label>
              <button type="submit">Let&apos;s Talk Growth</button>
              {contactStatus && <p className="contactError" role="alert">{contactStatus}</p>}
            </form>}
        </section>
      </div>}
      <footer className="agencyFooter h-card">
        <div className="footerBrand"><a className="u-url p-name" href="/">GrowthCast</a></div>
        <nav aria-label="GrowthCast links"><a href="/blog">Read the Blog</a><span title="Email address coming soon">Email Our Founder</span><a href="https://linkedin.com/in/edwardjwhiteiii" target="_blank" rel="noreferrer">Connect With Our Founder</a><span title="Social profile coming soon">Follow GrowthCast</span></nav>
        <nav aria-label="Legal and site links"><button type="button" onClick={() => navigate("terms", "/terms")}>Terms</button><button type="button" onClick={() => navigate("privacy", "/privacy")}>Privacy</button><a href="/sitemap-index.xml">Sitemap</a></nav>
      </footer>
    </main>
  );
}
