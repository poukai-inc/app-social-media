/**
 * Individual Conversation Details API
 * 
 * Get detailed conversation history with full message thread.
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import ICPEngagement from '@/lib/models/ICPEngagement';
import { userOwnsPage } from '@/lib/page-access';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';

const log = logger.child('api:conversations:[id]');

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const { id: conversationId } = await params;
    
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json({ error: 'Invalid conversation ID' }, { status: 400 });
    }

    // Get conversation with full details
    const conversation = await ICPEngagement.findById(conversationId).lean();

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Authorization: confirm the caller owns the page this conversation belongs
    // to. Map mismatch to 404 to avoid leaking another tenant's data. (issue #17)
    if (!(await userOwnsPage(session, conversation.pageId))) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Format for frontend
    const formattedConversation = {
      id: conversation._id,
      targetPost: {
        id: conversation.targetPost.id,
        content: conversation.targetPost.content,
        url: conversation.targetPost.url,
        metrics: conversation.targetPost.metrics,
      },
      targetUser: {
        id: conversation.targetUser.id,
        username: conversation.targetUser.username,
        name: conversation.targetUser.name,
        bio: conversation.targetUser.bio,
        followersCount: conversation.targetUser.followersCount,
        isVerified: conversation.targetUser.isVerified,
      },
      ourReply: {
        id: conversation.ourReply.id,
        content: conversation.ourReply.content,
        url: conversation.ourReply.url,
      },
      conversation: {
        threadId: conversation.conversation?.threadId,
        autoResponseEnabled: conversation.conversation?.autoResponseEnabled,
        maxAutoResponses: conversation.conversation?.maxAutoResponses || 3,
        currentAutoResponseCount: conversation.conversation?.currentAutoResponseCount || 0,
        lastCheckedAt: conversation.conversation?.lastCheckedAt,
        messages: (conversation.conversation?.messages || []).map(msg => ({
          id: msg.id,
          authorId: msg.authorId,
          content: msg.content,
          timestamp: msg.timestamp,
          isFromUs: msg.isFromUs,
          url: msg.url,
        })),
      },
      icpMatch: {
        relevanceScore: conversation.icpMatch.relevanceScore,
        matchedPainPoints: conversation.icpMatch.matchedPainPoints,
        matchedTopics: conversation.icpMatch.matchedTopics,
        searchQuery: conversation.icpMatch.searchQuery,
      },
      status: conversation.status,
      followUp: conversation.followUp,
      engagedAt: conversation.engagedAt,
      platform: conversation.platform,
    };

    return NextResponse.json(formattedConversation);

  } catch (error) {
    log.error('Error fetching conversation details', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}