import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import type { PageContentStrategy } from '@/lib/openai';
import { generateLinkedInPost, improvePost, generatePostWithStrategy } from '@/lib/openai';
import type { StructuredInput, PostAngle } from '@/lib/models/Post';
import connectToDatabase from '@/lib/mongodb';
import Post from '@/lib/models/Post';
import User from '@/lib/models/User';
import type { DatabaseSource } from '@/lib/models/Page';
import mongoose from 'mongoose';
import type { ContentItem } from '@/lib/data-sources/database';
import { fetchContentForGeneration } from '@/lib/data-sources/database';
import { logger } from '@/lib/logger';

const log = logger.child('api:generate');

interface GenerateRequest {
  mode: 'structured' | 'ai';
  structuredInput?: StructuredInput;
  aiPrompt?: string;
  tone?: 'professional' | 'casual' | 'inspirational' | 'educational';
  includeEmojis?: boolean;
  includeHashtags?: boolean;
  targetAudience?: string;
}

interface GenerateWithPageRequest {
  pageId: string;
  usePageStrategy: true;
  topic?: string;
  angle?: string;
  inspiration?: string;
  createDraft?: boolean;
  useDataSource?: boolean;  // Use content from data sources
  dataSourceId?: string;    // Specific data source to use
  contentItemId?: string;   // Specific content item to repurpose
}

interface ImproveRequest {
  content: string;
  instructions: string;
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    // Handle page strategy generation
    if (body.usePageStrategy && body.pageId) {
      await connectToDatabase();
      
      const { pageId, topic, angle, inspiration, createDraft, useDataSource, dataSourceId, contentItemId } = body as GenerateWithPageRequest;
      
      // Fetch the page using native MongoDB to get dataSources
      const page = await mongoose.connection.db?.collection('pages').findOne({
        _id: new mongoose.Types.ObjectId(pageId),
      });

      if (!page) {
        return NextResponse.json({ error: 'Page not found' }, { status: 404 });
      }

      if (!page.contentStrategy) {
        return NextResponse.json({ error: 'Page content strategy not configured' }, { status: 400 });
      }

      // Determine the inspiration content
      let finalInspiration = inspiration || '';
      let sourceContentItem: ContentItem | null = null;
      
      // If using data source, fetch content
      if (useDataSource) {
        const dataSources = page.dataSources?.databases || [];
        
        if (dataSources.length === 0) {
          return NextResponse.json({ error: 'No data sources configured for this page' }, { status: 400 });
        }
        
        // Find the specific data source or use the first active one
        const source = dataSourceId 
          ? dataSources.find((ds: DatabaseSource) => ds.id === dataSourceId)
          : dataSources.find((ds: DatabaseSource) => ds.isActive);
          
        if (!source) {
          return NextResponse.json({ error: 'No active data source found' }, { status: 400 });
        }
        
        // Fetch content from the data source
        const fetchResult = await fetchContentForGeneration(source as DatabaseSource, {
          limit: 10,
          randomize: !contentItemId, // Don't randomize if specific item requested
        });
        
        if (!fetchResult.success || !fetchResult.items?.length) {
          return NextResponse.json({ 
            error: fetchResult.error || 'No content found in data source' 
          }, { status: 400 });
        }
        
        // Find specific content item or pick first
        if (contentItemId) {
          sourceContentItem = fetchResult.items.find(item => item.id === contentItemId) || fetchResult.items[0];
        } else {
          sourceContentItem = fetchResult.items[0];
        }
        
        // Build inspiration from the content item
        finalInspiration = `
## Source Blog Post to Repurpose:

**Title:** ${sourceContentItem.title}

**Content:**
${sourceContentItem.body.slice(0, 3000)}

---
Transform this blog post into an engaging LinkedIn post. Extract the key insight or takeaway and present it in a way that's valuable for a LinkedIn audience. Don't just summarize - find the most interesting angle and lead with that.
`.trim();
      }

      // Generate content using page strategy
      const result = await generatePostWithStrategy({
        strategy: page.contentStrategy as PageContentStrategy,
        topic: topic || (sourceContentItem?.title ? `Repurposing: ${sourceContentItem.title}` : undefined),
        angle,
        inspiration: finalInspiration,
        pageId: page._id.toString(),
        platform: 'linkedin', // Legacy field - actual platforms determined by connections
      });

      // Get active platform connections to determine target platforms
      const activeConnections = page.connections?.filter((c: { isActive: boolean; platform: string }) => c.isActive) || [];
      const targetPlatforms = activeConnections.map((c: { isActive: boolean; platform: string }) => c.platform);
      
      // Default to LinkedIn if no connections (shouldn't happen, but safety)
      if (targetPlatforms.length === 0) {
        targetPlatforms.push('linkedin');
      }

      // Optionally create a draft post
      if (createDraft !== false) {
        // Lookup user by email to get MongoDB ObjectId
        const user = await User.findOne({ email: session.user.email });
        if (!user) {
          return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        const post = await Post.create({
          userId: user._id,
          pageId: page._id,
          content: result.content,
          status: 'pending_approval',
          mode: 'ai',
          postAs: page.type === 'organization' ? 'organization' : 'person',
          organizationId: page.organizationId,
          targetPlatforms: targetPlatforms,
          aiAnalysis: {
            angle: result.angle as PostAngle,
          },
          // Store source content reference if from data source
          ...(sourceContentItem && {
            sourceContent: {
              id: sourceContentItem.id,
              title: sourceContentItem.title,
              type: 'database',
            },
          }),
        });

        return NextResponse.json({
          content: result.content,
          angle: result.angle,
          topic: result.topic,
          sourceContent: sourceContentItem ? {
            id: sourceContentItem.id,
            title: sourceContentItem.title,
          } : undefined,
          post: {
            _id: post._id,
            content: post.content,
            status: post.status,
          },
        });
      }

      return NextResponse.json({
        content: result.content,
        angle: result.angle,
        topic: result.topic,
        sourceContent: sourceContentItem ? {
          id: sourceContentItem.id,
          title: sourceContentItem.title,
        } : undefined,
      });
    }

    if (action === 'generate') {
      const { mode, structuredInput, aiPrompt, tone, includeEmojis, includeHashtags, targetAudience } = body as GenerateRequest & { action: string };

      if (mode === 'structured' && !structuredInput) {
        return NextResponse.json({ error: 'Structured input is required for structured mode' }, { status: 400 });
      }

      if (mode === 'ai' && !aiPrompt) {
        return NextResponse.json({ error: 'AI prompt is required for AI mode' }, { status: 400 });
      }

      const content = await generateLinkedInPost({
        mode,
        structuredInput,
        aiPrompt,
        tone,
        includeEmojis,
        includeHashtags,
        targetAudience,
      });

      return NextResponse.json({ content });
    }

    if (action === 'improve') {
      const { content, instructions } = body as ImproveRequest & { action: string };

      if (!content || !instructions) {
        return NextResponse.json({ error: 'Content and instructions are required' }, { status: 400 });
      }

      const improvedContent = await improvePost(content, instructions);

      return NextResponse.json({ content: improvedContent });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    log.error('Error generating content', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate content' },
      { status: 500 }
    );
  }
}
