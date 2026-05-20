/**
 * ICP Analyzer Service
 * 
 * Analyzes a page's content strategy, data sources, and historical posts
 * to understand the Ideal Customer Profile and generate search queries
 * for finding ICP posts on social platforms.
 * 
 * Based on ICP principles:
 * - Urgent + Important problem
 * - Has budget (decision makers)
 * - Underserved market
 * - 10x better positioning
 */

import type { ContentStrategy, DatabaseSource } from '../models/Page';
import Page, { IPage } from '../models/Page';
import Post from '../models/Post';
import { fetchContentForGeneration } from '../data-sources/database';
import { createChatCompletion } from '../ai-client';
import { findMatchingPersona } from './icp-personas';
import { logger } from '@/lib/logger';

const log = logger.child('engagement:icp-analyzer');

// ============================================
// Types
// ============================================

export interface ICPProfile {
  // Core ICP components
  targetAudience: {
    roles: string[];           // "SaaS founders", "Technical PMs", "Startup CTOs"
    industries: string[];      // "B2B SaaS", "Fintech", "Developer Tools"
    companySize: string[];     // "Seed to Series A", "10-50 employees"
    seniority: string[];       // "Founders", "VPs", "Directors"
  };

  // Biographic signals — used to qualify ICP match from bios/tweets
  biographics?: {
    incomeBracket: string;     // e.g. "$300k–$600k total comp"
    titleTier: string;         // e.g. "C-suite / VP-level decision maker"
    stabilitySignals: string;  // e.g. "established career, long tenures, family-oriented"
  };

  // Psychographic profile — the "Why they buy" layer (Chris Do framework)
  psychographics?: {
    values: string;            // What they hold sacred professionally
    beliefSystem: string;      // Their core worldview / operating philosophy
    fears: string;             // Their #1 professional fear
    spendingLogic: string;     // How they justify purchasing internally (ROI framing)
  };

  // The desperate desire — what they are STARVING for (Chris Do's "hunger")
  theHunger?: string;

  // Past vendor frustrations — used to build empathy and differentiate in replies
  theCrapTheyDealWith?: string;

  // Pain points they talk about (for search)
  painPoints: {
    problem: string;
    urgency: 'high' | 'medium' | 'low';
    keywords: string[];        // Search terms for this pain point
  }[];
  
  // Topics they engage with
  topicsOfInterest: string[];
  
  // How we can add value (for reply generation)
  valueProposition: {
    expertise: string[];       // What we know that can help
    uniqueAngle: string;       // Our 10x better angle
    avoidTopics: string[];     // What NOT to engage on
  };
  
  // Search queries to find ICPs
  searchQueries: {
    query: string;
    intent: 'problem_awareness' | 'seeking_solution' | 'discussing_topic' | 'sharing_experience';
    priority: number;          // 1-10
  }[];
  
  // Engagement guidelines
  engagementStyle: {
    tone: string;
    doThis: string[];
    avoidThis: string[];
    exampleReplies: string[];
  };
}

export interface ICPAnalysisInput {
  pageId: string;
  includeDataSources?: boolean;
  includeHistoricalPosts?: boolean;
  maxHistoricalPosts?: number;
}

export interface ICPAnalysisResult {
  success: boolean;
  profile?: ICPProfile;
  error?: string;
  analyzedAt: Date;
  inputSummary: {
    contentStrategy: boolean;
    dataSources: number;
    historicalPosts: number;
  };
}

// ============================================
// ICP Analysis Functions
// ============================================

/**
 * Analyze a page to extract/infer the ICP profile
 */
export async function analyzePageICP(
  input: ICPAnalysisInput
): Promise<ICPAnalysisResult> {
  const { pageId, includeDataSources = true, includeHistoricalPosts = true, maxHistoricalPosts = 20 } = input;
  
  try {
    // Fetch page with content strategy
    const page = await Page.findById(pageId);
    if (!page) {
      return {
        success: false,
        error: 'Page not found',
        analyzedAt: new Date(),
        inputSummary: { contentStrategy: false, dataSources: 0, historicalPosts: 0 },
      };
    }
    
    // Gather context for analysis
    const context: string[] = [];
    let dataSourceCount = 0;
    let historicalPostCount = 0;
    
    // 1. Content Strategy
    if (page.contentStrategy) {
      const strategy = page.contentStrategy as ContentStrategy;
      context.push(`## Content Strategy
- Persona: ${strategy.persona || 'Not specified'}
- Topics: ${strategy.topics?.join(', ') || 'Not specified'}
- Tone: ${strategy.tone || 'Not specified'}
- Target Audience: ${strategy.targetAudience || 'Not specified'}
- Avoid Topics: ${strategy.avoidTopics?.join(', ') || 'None'}
- Custom Instructions: ${strategy.customInstructions || 'None'}`);
    }
    
    // 2. Data Sources (sample content)
    if (includeDataSources && page.dataSources?.databases?.length > 0) {
      const activeSources = page.dataSources.databases.filter((db: DatabaseSource) => db.isActive);
      dataSourceCount = activeSources.length;
      
      for (const source of activeSources.slice(0, 3)) { // Max 3 sources
        try {
          const fetchResult = await fetchContentForGeneration(source, { limit: 5, randomize: true });
          if (fetchResult.success && fetchResult.items?.length) {
            const sampleContent = fetchResult.items
              .slice(0, 3)
              .map(item => `- ${item.title}: ${item.body?.slice(0, 200)}...`)
              .join('\n');
            context.push(`## Data Source: ${source.name}
Sample Content:
${sampleContent}`);
          }
        } catch (e) {
          log.warn('Could not fetch from data source', { sourceName: source.name, error: e instanceof Error ? e.message : String(e) });
        }
      }
    }
    
    // 3. Historical Posts (top performing)
    if (includeHistoricalPosts) {
      const posts = await Post.find({
        pageId: page._id,
        status: 'published',
      })
        .sort({ 'metrics.engagementRate': -1 })
        .limit(maxHistoricalPosts)
        .select('content aiAnalysis metrics');
      
      historicalPostCount = posts.length;
      
      if (posts.length > 0) {
        const postSummaries = posts.slice(0, 10).map((post, i) => 
          `${i + 1}. [${post.aiAnalysis?.angle || 'unknown'}] ${post.content?.slice(0, 150)}...`
        ).join('\n');
        context.push(`## Top Performing Historical Posts
${postSummaries}`);
      }
    }
    
    // If no context available, return error
    if (context.length === 0) {
      return {
        success: false,
        error: 'No content strategy, data sources, or historical posts found',
        analyzedAt: new Date(),
        inputSummary: { contentStrategy: false, dataSources: 0, historicalPosts: 0 },
      };
    }
    
    // Generate ICP Profile using AI
    const profile = await generateICPProfile(context.join('\n\n'));

    // Enrich psychographic fields from pre-built personas if AI left them sparse
    const hasPsychoData = profile.psychographics?.fears && profile.theHunger && profile.theCrapTheyDealWith;
    if (!hasPsychoData) {
      const matchedPersona = findMatchingPersona({
        industries: profile.targetAudience?.industries,
        roles: profile.targetAudience?.roles,
        keywords: profile.painPoints?.flatMap(p => p.keywords),
      });
      if (matchedPersona) {
        log.info('Enriching sparse psychographics from pre-built persona', { personaName: matchedPersona.personaName });
        profile.biographics ??= {
          incomeBracket: matchedPersona.incomeBracket,
          titleTier: matchedPersona.titleTier,
          stabilitySignals: matchedPersona.stabilitySignals,
        };
        profile.psychographics ??= {
          values: matchedPersona.values,
          beliefSystem: matchedPersona.beliefSystem,
          fears: matchedPersona.fears,
          spendingLogic: matchedPersona.spendingLogic,
        };
        profile.theHunger ??= matchedPersona.theHunger;
        profile.theCrapTheyDealWith ??= matchedPersona.theCrapTheyDealWith;
      }
    }
    
    return {
      success: true,
      profile,
      analyzedAt: new Date(),
      inputSummary: {
        contentStrategy: !!page.contentStrategy,
        dataSources: dataSourceCount,
        historicalPosts: historicalPostCount,
      },
    };
  } catch (error) {
    log.error('Error analyzing page ICP', { error: error instanceof Error ? error.message : String(error) });
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      analyzedAt: new Date(),
      inputSummary: { contentStrategy: false, dataSources: 0, historicalPosts: 0 },
    };
  }
}

/**
 * Use AI to generate a detailed ICP profile from page context
 */
async function generateICPProfile(pageContext: string): Promise<ICPProfile> {
  const systemPrompt = `You build deep Ideal Customer Profiles (ICPs) rooted in the Chris Do framework.

IMPORTANT: Output ONLY valid JSON. No explanations, no markdown code blocks, no text before or after the JSON. Do NOT use <think> tags. Just the raw JSON object.

An effective ICP has five layers:
1. BIOGRAPHICS - Who they are on paper (title, income, stability)
2. PSYCHOGRAPHICS - How they think, what they fear, how they justify spending (deeper than demographics)
3. THE HUNGER - The urgent, burning desire they are STARVING to solve right now
4. THE CRAP THEY DEAL WITH - Past vendor failures and current frustrations (builds empathy)
5. URGENT PROBLEM + BUDGET + UNDERSERVED market position

Spending logic insight: the bigger the problem in the CLIENT's mind, the bigger the budget. Decode their spending logic to understand what ROI framing they respond to.

Analyze the content strategy and posts to extract all five layers.`;

  const userPrompt = `Analyze this page's content to build an ICP profile:

${pageContext}

Generate a detailed ICP profile in this EXACT JSON format:
{
  "targetAudience": {
    "roles": ["specific job titles"],
    "industries": ["specific industries"],
    "companySize": ["company stages/sizes"],
    "seniority": ["decision-making levels"]
  },
  "biographics": {
    "incomeBracket": "estimated total comp range e.g. $300k-$600k",
    "titleTier": "decision-making seniority e.g. C-suite / VP-level",
    "stabilitySignals": "lifestyle/career markers e.g. established career, long tenures"
  },
  "psychographics": {
    "values": "what they hold sacred professionally (1-2 sentences)",
    "beliefSystem": "their core worldview or operating philosophy (1-2 sentences)",
    "fears": "their #1 professional fear - what keeps them up at night (1 sentence)",
    "spendingLogic": "how they justify a purchase internally - what ROI framing resonates (1-2 sentences)"
  },
  "theHunger": "the urgent burning desire they are STARVING to solve right now — not just a problem, but a desperate want (1-2 sentences)",
  "theCrapTheyDealWith": "specific past vendor failures, internal politics, and current frustrations that make them cynical about new solutions (2-3 sentences)",
  "painPoints": [
    {
      "problem": "specific problem description",
      "urgency": "high|medium|low",
      "keywords": ["search terms for this pain point"]
    }
  ],
  "topicsOfInterest": ["topics they care about"],
  "valueProposition": {
    "expertise": ["what we know that can help them"],
    "uniqueAngle": "our 10x better positioning — why we're different from the vendors they've been burned by",
    "avoidTopics": ["topics to NOT engage on"]
  },
  "searchQueries": [
    {
      "query": "Twitter search query",
      "intent": "problem_awareness|seeking_solution|discussing_topic|sharing_experience",
      "priority": 1-10
    }
  ],
  "engagementStyle": {
    "tone": "how to sound — match their worldview, not our brand voice",
    "doThis": ["engagement best practices"],
    "avoidThis": ["things to never do — especially the patterns that remind them of bad vendors"],
    "exampleReplies": ["2-3 example replies that resonate with their hunger and fears"]
  }
}

Generate 10-15 search queries covering different intents. Use NATURAL language people actually tweet.

CRITICAL - Twitter Search Query Rules:
- Use BROAD, natural phrases people actually say (not marketing jargon)
- Start with common problems/questions: "how do I", "struggling with", "anyone know"
- Use 2-4 word phrases WITHOUT quotes or hashtags for better reach
- Simple keywords only: hiring developers, shipping too slow, agency costs
- Mix problem statements with questions
- NO complex syntax, NO hashtags, NO quotes - just natural search terms
- Examples: 
  ✅ struggling to hire engineers
  ✅ product taking too long
  ✅ looking for CTO
  ✅ need help with deployment
  ❌ "struggling with scalability" #startup
  ❌ "slow product development" #SaaS
  ❌ (hiring AND developers)
`;

  const response = await createChatCompletion({
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    maxTokens: 3000,
  });

  const content = response.content;
  if (!content) {
    throw new Error('Failed to generate ICP profile');
  }

  // Extract JSON from response
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Could not parse ICP profile JSON');
  }

  try {
    const profile = JSON.parse(jsonMatch[0]) as ICPProfile;
    return profile;
  } catch (e) {
    throw new Error(`Invalid JSON in ICP profile: ${e}`);
  }
}

/**
 * Generate additional search queries for a specific pain point
 */
export async function expandSearchQueries(
  profile: ICPProfile,
  painPointIndex: number
): Promise<string[]> {
  const painPoint = profile.painPoints[painPointIndex];
  if (!painPoint) return [];

  const prompt = `Given this ICP pain point:
"${painPoint.problem}"

And these existing keywords: ${painPoint.keywords.join(', ')}

Generate 10 more Twitter search queries that would find people discussing this pain point.
Include:
- Frustrated tweets ("so tired of...", "why is it so hard to...")
- Questions ("how do you handle...", "anyone know how to...")
- Sharing failures ("just spent 3 hours...", "our X broke again")

Return just the queries, one per line.`;

  const response = await createChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    maxTokens: 500,
    preferFast: true,
  });

  const content = response.content;
  if (!content) return [];

  return content.split('\n').filter(line => line.trim().length > 0);
}

/**
 * Validate and refine ICP based on engagement results
 */
export async function refineICPFromResults(
  currentProfile: ICPProfile,
  engagementResults: {
    query: string;
    tweetsFound: number;
    repliesSent: number;
    repliesGotEngagement: number;
  }[]
): Promise<ICPProfile> {
  // Find high-performing queries
  const goodQueries = engagementResults
    .filter(r => r.repliesGotEngagement > 0)
    .map(r => r.query);

  // Find low-performing queries  
  const badQueries = engagementResults
    .filter(r => r.repliesSent > 5 && r.repliesGotEngagement === 0)
    .map(r => r.query);

  if (goodQueries.length === 0 && badQueries.length === 0) {
    return currentProfile; // Not enough data
  }

  const prompt = `Adjust ICP search queries based on engagement results.

IMPORTANT: Output ONLY a valid JSON array. No explanations, no markdown, no code blocks. Do NOT use <think> tags. Just the raw JSON array.

Current ICP search queries:
${currentProfile.searchQueries.map(q => `- "${q.query}" (priority: ${q.priority})`).join('\n')}

Queries that got engagement:
${goodQueries.join('\n') || 'None yet'}

Queries with no engagement:
${badQueries.join('\n') || 'None'}

Increase priority of queries similar to good ones. Decrease or remove queries similar to bad ones.

Output format (JSON array only):
[{"query": "search term", "intent": "problem_awareness", "priority": 8}]`;

  const response = await createChatCompletion({
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.5,
    maxTokens: 1000,
    preferFast: true,
  });

  const content = response.content;
  if (!content) return currentProfile;

  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const newQueries = JSON.parse(jsonMatch[0]);
      return {
        ...currentProfile,
        searchQueries: newQueries,
      };
    }
  } catch {
    // Keep current profile if parsing fails
  }

  return currentProfile;
}

export default {
  analyzePageICP,
  expandSearchQueries,
  refineICPFromResults,
};
