/**
 * Pre-built ICP Personas
 *
 * Derived from the ICP-and-Content-Writing doc (Chris Do framework).
 * These are research-backed, high-budget buyer archetypes that serve as:
 *
 * 1. Reference personas — the ICP analyzer can compare a generated profile against these
 *    to enrich missing psychographic fields.
 * 2. Direct targeting — a page can pin one or more personas to guide both
 *    Twitter engagement and content generation without needing historical posts.
 * 3. Content strategy seeds — pick personas when setting up a new page so the
 *    system writes with psychographic precision from day one.
 *
 * Each persona conforms to a subset of ICPProfile that covers the psychographic,
 * hunger, and empathy layers — the fields the base AI analysis sometimes misses.
 */

export interface ICPPersona {
  id: string;
  personaName: string;

  // Biographics
  title: string;
  industry: string;
  incomeBracket: string;
  titleTier: string;
  stabilitySignals: string;

  // Psychographics (the "Why they buy" layer)
  values: string;
  beliefSystem: string;
  fears: string;
  spendingLogic: string;

  // Empathy layer
  theHunger: string;
  theCrapTheyDealWith: string;

  // Content hooks derived from this persona
  contentAngles: string[];          // Best angles for this persona
  painPointKeywords: string[];      // Twitter search terms that reach this persona
  icpMatchSignals: string[];        // Bio/tweet signals that confirm ICP match
}

export const BUILT_IN_ICP_PERSONAS: ICPPersona[] = [
  {
    id: 'modernizing-michael',
    personaName: 'Modernizing Michael',
    title: 'VP of Engineering at a Global Logistics Firm',
    industry: 'Enterprise Logistics / Supply Chain',
    incomeBracket: '$450k + $200k performance bonus',
    titleTier: 'VP-level decision maker with budget authority',
    stabilitySignals: 'First marriage (stable), 2 kids, long tenure at current company',

    values: 'Integrity and measuring 100 times before cutting. Hates cutting corners.',
    beliefSystem: 'Technical debt is a silent killer of legacy businesses. Velocity is a competitive moat.',
    fears: 'Public failure of a migration that halts the global supply chain — losing credibility with the board.',
    spendingLogic: 'Will spend $250k on a consultant to avoid a $2M internal dev mistake. Frames it as insurance, not cost.',

    theHunger: 'Starving for velocity. His board wants "AI integration" now but his legacy stack is a black box holding him back. He needs a safe path forward that does not break production.',
    theCrapTheyDealWith: 'Has been burned by "AI wrapper" agencies that did not understand his .NET monolith. Tired of vendors who over-promise and under-deliver, then disappear when the migration breaks.',

    contentAngles: ['cost_of_inaction', 'war_story', 'dollarize_value', 'opinionated_take'],
    painPointKeywords: [
      'legacy modernization',
      'migrating monolith',
      'technical debt enterprise',
      'AI integration existing codebase',
      'modernize .NET stack',
      'board wants AI',
      'legacy system migration',
    ],
    icpMatchSignals: [
      'VP Engineering in bio',
      'mentions legacy stack or migration',
      'talks about technical debt at scale',
      'tweets about board pressure for AI',
      'frustrated with agency quality',
    ],
  },

  {
    id: 'compliance-driven-clara',
    personaName: 'Compliance-Driven Clara',
    title: 'CTO of a Mid-Tier Regional Bank',
    industry: 'FinTech / Banking',
    incomeBracket: '$550k total comp',
    titleTier: 'C-suite with direct board reporting and final budget sign-off',
    stabilitySignals: 'Married, kids in Ivy League colleges, 10+ year career in financial tech',

    values: 'Precision and security. Hates "move fast and break things" — that philosophy does not exist in her world.',
    beliefSystem: 'AI is a tool for efficiency, not a replacement for human judgment. Security is non-negotiable, not a feature.',
    fears: 'A data leak originating from an unvetted LLM integration — the kind that makes the news and ends careers.',
    spendingLogic: 'Happily pays a premium for engineering-first partners who lead with security, not buzzwords. ROI = compliance cost avoided + regulatory fines prevented.',

    theHunger: 'Automating manual KYC/AML processes that currently cost the bank $10M/year in wasted labor — without creating a new security surface area.',
    theCrapTheyDealWith: 'Dealing with internal IT teams resistant to change and "security consultants" who only offer generic compliance checklists, not real engineering solutions.',

    contentAngles: ['cost_of_inaction', 'opinionated_take', 'dollarize_value', 'insight'],
    painPointKeywords: [
      'bank compliance automation',
      'KYC automation fintech',
      'LLM security risk',
      'AI in banking regulation',
      'legacy banking software',
      'financial data security',
      'AML process inefficiency',
    ],
    icpMatchSignals: [
      'CTO or CISO in banking bio',
      'tweets about compliance burden',
      'mentions KYC or AML',
      'concerned about AI data exposure',
      'frustrated with slow internal IT',
    ],
  },

  {
    id: 'director-david',
    personaName: 'Director David',
    title: 'Director of Property Development (Commercial Real Estate)',
    industry: 'Commercial Real Estate',
    incomeBracket: '$400k + significant equity in developments',
    titleTier: 'Director-level with capex sign-off on tech modernization',
    stabilitySignals: 'Married 15 years, 3 kids, owns multiple properties',

    values: 'Visual beauty and operational efficiency. Wants bespoke solutions, not off-the-shelf.',
    beliefSystem: 'Successful people own their time. Technology should serve the property, not create new management headaches.',
    fears: 'Looking outdated compared to competitors already using smart-building AI — tenants noticing and leaving.',
    spendingLogic: 'Views $150k for a custom tenant-management AI as an investment in asset value — a capital improvement, not an operational expense.',

    theHunger: 'A seamless AI-driven interface that predicts tenant churn and automates facility maintenance requests before they become complaints.',
    theCrapTheyDealWith: 'Salespeople selling off-the-shelf CRMs that do not talk to his legacy building-management software. Every "integration" requires custom dev work he was never warned about.',

    contentAngles: ['dollarize_value', 'hungry_buyer', 'war_story', 'cost_of_inaction'],
    painPointKeywords: [
      'property management software',
      'tenant churn prediction',
      'smart building automation',
      'CRM for real estate',
      'facility management AI',
      'commercial real estate tech',
    ],
    icpMatchSignals: [
      'Real estate or property development in bio',
      'tweets about tenant or building management',
      'frustrated with off-the-shelf CRMs',
      'interested in PropTech',
    ],
  },

  {
    id: 'saas-founder-sarah',
    personaName: 'SaaS Founder Sarah',
    title: 'Founder of an Exit-Ready HealthTech SaaS',
    industry: 'HealthTech SaaS',
    incomeBracket: '$300k salary + $20M in paper wealth (pre-exit)',
    titleTier: 'Founder with full acquisition decision authority',
    stabilitySignals: 'Divorced, focused on stability and exit, 1 child, Stanford network',

    values: 'Velocity and cleanliness. Wants her code to be "acquisition-ready" — clean, documented, domain-driven.',
    beliefSystem: 'You are only as good as your domain boundaries. Spaghetti code is a liability on a term sheet.',
    fears: 'Due diligence failing because of technical debt in the legacy backend — losing a $30M exit over code quality.',
    spendingLogic: 'Spends money to "buy back" her exit timeline. Any investment that accelerates the Series B or acquisition is justified by the equity upside.',

    theHunger: 'A top-to-bottom modernization of her .NET frontend to a clean Next.js stack that boosts valuation and passes technical due diligence.',
    theCrapTheyDealWith: 'Junior-heavy dev shops that hack features together without considering Core Web Vitals, SEO continuity, or clean domain architecture. "Agencies" that make technical debt worse.',

    contentAngles: ['hungry_buyer', 'cost_of_inaction', 'war_story', 'dollarize_value'],
    painPointKeywords: [
      'SaaS exit readiness',
      'Series B technical due diligence',
      'legacy code acquisition',
      'Next.js migration from .NET',
      'code quality for investors',
      'startup technical debt',
      'acquisition ready codebase',
    ],
    icpMatchSignals: [
      'Founder or CEO in bio',
      'mentions exit, Series B, or acquisition',
      'tweets about technical debt costs',
      'HealthTech or SaaS product',
      'Stanford or top-tier network signals',
    ],
  },

  {
    id: 'operations-owen',
    personaName: 'Operations Owen',
    title: 'Head of Ops at a Fortune 500 Retailer',
    industry: 'Enterprise Retail / Supply Chain',
    incomeBracket: '$480k total comp',
    titleTier: 'VP/Head-of-level with ops modernization budget',
    stabilitySignals: 'Married, kids in college, 15+ years in operations',

    values: 'Reliability. Hates vague AI promises — only cares about "how does it help me ship on time?"',
    beliefSystem: 'Systems run the business, people run the systems. If the system cannot be trusted, nothing can be trusted.',
    fears: 'Losing seasonal peak revenue (Black Friday, Q4) due to system lag or outage during the highest-stakes window of the year.',
    spendingLogic: 'Will pay $200k for a dashboard that "just works" 100% of the time because one hour of downtime during peak costs more than the entire project.',

    theHunger: 'Integrating AI to predict inventory shortages before they happen — displayed in a low-latency, real-time UI that warehouse managers can actually use.',
    theCrapTheyDealWith: 'Marketing teams giving blurry requirements and dev teams that do not understand physical logistics. Every "real-time" solution they have bought has had a 30-second lag.',

    contentAngles: ['dollarize_value', 'cost_of_inaction', 'war_story', 'how_to'],
    painPointKeywords: [
      'retail operations AI',
      'inventory prediction',
      'real-time warehouse dashboard',
      'supply chain visibility',
      'peak season system reliability',
      'ops tooling enterprise',
    ],
    icpMatchSignals: [
      'Head of Ops or VP Ops in bio',
      'works in retail or supply chain',
      'mentions peak season or inventory',
      'frustrated with laggy dashboards',
      'interested in real-time data',
    ],
  },

  {
    id: 'innovating-isabella',
    personaName: 'Innovating Isabella',
    title: 'Chief Innovation Officer at a Pharma Giant',
    industry: 'Pharmaceutical / Life Sciences',
    incomeBracket: '$600k+ total comp',
    titleTier: 'C-suite with innovation budget autonomy',
    stabilitySignals: 'Married, 2 kids, PhD pedigree, based across Basel and Boston',

    values: 'Innovation that solves human problems. Science first, technology second.',
    beliefSystem: 'AI should augment human scientists, not replace them. The bottleneck is data access, not intelligence.',
    fears: 'Missing a breakthrough because critical research data is siloed in a 10-year-old system nobody can query.',
    spendingLogic: 'Will pay whatever it takes for a partner who understands RAG, data visualization, and can speak "Science." ROI = accelerated drug discovery timeline.',

    theHunger: 'A custom internal AI tool that lets researchers "talk" to their proprietary clinical trial data — natural language queries on structured scientific databases.',
    theCrapTheyDealWith: 'Agencies that know React but cannot visualize complex chemical data. Vendors who build beautiful UIs on top of data pipelines that cannot handle the query volume.',

    contentAngles: ['insight', 'hungry_buyer', 'cost_of_inaction', 'opinionated_take'],
    painPointKeywords: [
      'RAG for scientific data',
      'clinical trial data analysis',
      'pharma AI tools',
      'data silos research',
      'internal AI tools enterprise',
      'AI drug discovery',
    ],
    icpMatchSignals: [
      'CIO or Chief Innovation in pharma bio',
      'tweets about research data access',
      'mentions RAG or internal AI tools',
      'frustrated with data silos',
    ],
  },

  {
    id: 'retaining-robert',
    personaName: 'Retaining Robert',
    title: 'Director of Customer Success (Enterprise Telecom)',
    industry: 'Enterprise Telecom',
    incomeBracket: '$350k total comp',
    titleTier: 'Director-level with CX tooling budget',
    stabilitySignals: 'Stable marriage, grandchildren, long career in telecom',

    values: 'Stability and human connection. Believes customer retention is the only metric that matters long-term.',
    beliefSystem: 'Technology should make customers feel more human, not less. If the support feels robotic, you will lose the relationship.',
    fears: 'Churn skyrocketing because their support technology feels "1990s" — losing contracts because competitors have better tooling.',
    spendingLogic: 'Wants to "trade up" to a world-class engineering partner. A $150k AI voice assistant is small compared to the $2M in annual churn it stops.',

    theHunger: 'A custom AI voice/video assistant for tier-1 support that actually sounds human and empathetic — not a scripted IVR.',
    theCrapTheyDealWith: 'Internal hobbyist dev teams that build internal tools that are hard to use and constantly break. Every "AI chatbot" vendor has delivered something that frustrated customers more.',

    contentAngles: ['dollarize_value', 'cost_of_inaction', 'war_story', 'hungry_buyer'],
    painPointKeywords: [
      'customer churn telecom',
      'AI support assistant',
      'voice AI customer service',
      'CX modernization enterprise',
      'tier 1 support automation',
      'customer retention technology',
    ],
    icpMatchSignals: [
      'Director of CS or VP Customer Success in bio',
      'works in telecom or enterprise services',
      'tweets about churn or retention',
      'frustrated with current support tools',
    ],
  },

  {
    id: 'visionary-victor',
    personaName: 'Visionary Victor',
    title: 'Head of Digital at a Luxury Fashion Brand',
    industry: 'Luxury Fashion / E-commerce',
    incomeBracket: '$500k total comp',
    titleTier: 'VP/Head-of with digital experience budget authority',
    stabilitySignals: 'Married, no kids, bicoastal Paris/NYC lifestyle',

    values: 'Aesthetics and brand continuity. The website IS the digital flagship store. It must be perfect.',
    beliefSystem: 'In luxury, the digital experience is the brand. Any performance compromise is a brand compromise.',
    fears: 'Slow page loads (LCP > 2.5s) hurting the luxury feel — customers who associate the brand with Hermès not tolerating a slow checkout.',
    spendingLogic: 'Spends money on Next.js 15 expertise to ensure the digital fabric matches the physical one. ROI = brand premium maintained and conversion uplift.',

    theHunger: 'Modernizing a legacy Laravel/e-commerce backend to a headless Next.js setup with AI-driven personalized shopping experiences that feel bespoke.',
    theCrapTheyDealWith: 'Devs who focus only on functionality and ruin the "vibe" of the design with clunky transitions. Agencies that do not understand luxury brand standards.',

    contentAngles: ['opinionated_take', 'insight', 'war_story', 'hungry_buyer'],
    painPointKeywords: [
      'headless commerce performance',
      'luxury brand website speed',
      'Next.js e-commerce migration',
      'Core Web Vitals luxury',
      'headless Shopify or Magento',
      'AI personalization e-commerce',
    ],
    icpMatchSignals: [
      'Head of Digital or VP Digital in luxury/fashion bio',
      'tweets about brand experience or LCP',
      'frustrated with legacy e-commerce platforms',
      'interested in headless commerce',
    ],
  },

  {
    id: 'secure-samuel',
    personaName: 'Secure Samuel',
    title: 'CISO of a Defense Tech Subcontractor',
    industry: 'Defense / Government Tech',
    incomeBracket: '$500k total comp',
    titleTier: 'C-suite with security architecture authority',
    stabilitySignals: 'Married, 2 kids, DC suburb lifestyle, security clearance',

    values: 'Confidentiality above all. A hostile witness to cloud-first pitches that cannot answer basic security questions.',
    beliefSystem: 'If it is on the open web, it is vulnerable. Zero trust is not a product — it is a discipline.',
    fears: 'A national security breach originating from a poorly secured web dashboard or an LLM integration with inadequate data controls.',
    spendingLogic: 'Pays a premium for senior full-stack consultants who understand domain-driven security and PostgreSQL hardening — not cloud-only vendors.',

    theHunger: 'A secure, on-prem or VPC-isolated AI assistant for analyzing intelligence reports — with full data sovereignty and audit trails.',
    theCrapTheyDealWith: 'AI hype-men pushing cloud-only LLM solutions that violate security protocols. Vendors who cannot explain where the data goes or how models are isolated.',

    contentAngles: ['opinionated_take', 'insight', 'cost_of_inaction', 'war_story'],
    painPointKeywords: [
      'on-prem AI deployment',
      'LLM security compliance',
      'VPC isolated AI',
      'government AI security',
      'data sovereignty AI',
      'CISO AI risk',
      'defense tech software',
    ],
    icpMatchSignals: [
      'CISO or Security Architect in defense/gov bio',
      'tweets about AI security risks',
      'mentions on-prem or VPC isolation',
      'skeptical of cloud-first AI',
    ],
  },

  {
    id: 'architectural-arthur',
    personaName: 'Architectural Arthur',
    title: 'Principal Architect at a Top-Tier Insurance Company',
    industry: 'Insurance / Enterprise FinServ',
    incomeBracket: '$450k total comp',
    titleTier: 'Principal-level with 20-year architecture roadmap authority',
    stabilitySignals: 'Married, 3 kids, nearing later career stage, legacy-conscious mindset',

    values: 'Legacy and longevity. Builds things to last 20 years. Documentation and system boundaries are sacred.',
    beliefSystem: 'A system is only as good as its documentation and domain boundaries. Speed without structure is entropy.',
    fears: 'Retiring and leaving behind an unmaintainable mess — a 30-year COBOL system nobody can touch or a Next.js codebase that became spaghetti in two years.',
    spendingLogic: 'Spends $200k+ on a partner who will "do it right" (Node.js/TypeScript/PostgreSQL with strict domain boundaries) instead of "doing it fast." Justifies it as generational investment.',

    theHunger: 'A full-scale migration plan to strangle their 30-year COBOL/VB6 system with a modern Next.js/Node.js API layer — executed with the discipline of a principal architect, not a dev shop.',
    theCrapTheyDealWith: 'Offshore teams that write unreadable code and internal managers who push for features over foundation. Every "modern" system they have built is already becoming the next legacy problem.',

    contentAngles: ['opinionated_take', 'war_story', 'insight', 'cost_of_inaction'],
    painPointKeywords: [
      'COBOL modernization',
      'legacy insurance system migration',
      'strangler pattern architecture',
      'mainframe to cloud migration',
      'domain driven design enterprise',
      'long term software architecture',
    ],
    icpMatchSignals: [
      'Principal Architect or Enterprise Architect in bio',
      'works in insurance or financial services',
      'tweets about legacy modernization',
      'concerned about future maintainability',
      'mentions COBOL, mainframe, or VB6',
    ],
  },
];

/**
 * Find the best-matching pre-built persona for a given set of signals.
 * Useful for enriching a generated ICPProfile with psychographic depth
 * when the page has limited historical data.
 */
export function findMatchingPersona(signals: {
  industries?: string[];
  roles?: string[];
  keywords?: string[];
}): ICPPersona | null {
  const { industries = [], roles = [], keywords = [] } = signals;
  const allSignals = [
    ...industries.map(s => s.toLowerCase()),
    ...roles.map(s => s.toLowerCase()),
    ...keywords.map(s => s.toLowerCase()),
  ];

  if (allSignals.length === 0) return null;

  let bestMatch: ICPPersona | null = null;
  let bestScore = 0;

  for (const persona of BUILT_IN_ICP_PERSONAS) {
    let score = 0;
    const personaSignals = [
      persona.industry.toLowerCase(),
      persona.title.toLowerCase(),
      ...persona.icpMatchSignals.map(s => s.toLowerCase()),
      ...persona.painPointKeywords.map(s => s.toLowerCase()),
    ];

    for (const signal of allSignals) {
      for (const ps of personaSignals) {
        if (ps.includes(signal) || signal.includes(ps.split(' ')[0] ?? ps)) {
          score++;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = persona;
    }
  }

  return bestScore > 0 ? bestMatch : null;
}

/**
 * Convert a pre-built persona into an ICPPersonaSnapshot for content generation.
 */
export function personaToSnapshot(persona: ICPPersona) {
  return {
    name: persona.personaName,
    fears: persona.fears,
    theHunger: persona.theHunger,
    spendingLogic: persona.spendingLogic,
    theCrapTheyDealWith: persona.theCrapTheyDealWith,
  };
}

export default BUILT_IN_ICP_PERSONAS;
