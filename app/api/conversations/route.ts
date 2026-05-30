/**
 * Conversation Management API
 * 
 * Provides endpoints for viewing and managing Twitter conversations
 * from ICP engagement activities.
 */

import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import ICPEngagement from '@/lib/models/ICPEngagement';
import { getConversationStats, disableAutoResponse } from '@/lib/engagement/conversation-manager';
import { userOwnsPage } from '@/lib/page-access';
import mongoose from 'mongoose';
import { logger } from '@/lib/logger';

const log = logger.child('api:conversations');

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const url = new URL(request.url);
    const pageId = url.searchParams.get('pageId');
    const showActive = url.searchParams.get('active') !== 'false'; // Default to true
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') || '0');

    if (!pageId) {
      return NextResponse.json({ error: 'pageId is required' }, { status: 400 });
    }

    // Authorization: the page must belong to the caller. Map any failure to 404
    // so we never reveal whether another tenant's page exists. (issue #17)
    if (!(await userOwnsPage(session, pageId))) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 });
    }

    // Build query for conversations
    const query: Record<string, unknown> = {
      pageId: new mongoose.Types.ObjectId(pageId),
      platform: 'twitter',
      'conversation.threadId': { $exists: true },
    };

    if (showActive) {
      query['conversation.autoResponseEnabled'] = true;
    }

    // Get conversations with details
    const conversations = await ICPEngagement.find(query)
      .sort({ 'conversation.lastCheckedAt': -1, engagedAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    // Get conversation statistics
    const stats = await getConversationStats(pageId);

    // Format conversations for frontend
    const formattedConversations = conversations.map(conv => ({
      id: conv._id,
      targetPost: {
        id: conv.targetPost.id,
        content: conv.targetPost.content.slice(0, 200), // Truncate for list view
        url: conv.targetPost.url,
      },
      targetUser: {
        id: conv.targetUser.id,
        username: conv.targetUser.username,
        name: conv.targetUser.name,
        followersCount: conv.targetUser.followersCount,
      },
      ourReply: {
        content: conv.ourReply.content,
        url: conv.ourReply.url,
      },
      conversation: {
        threadId: conv.conversation?.threadId,
        autoResponseEnabled: conv.conversation?.autoResponseEnabled,
        maxAutoResponses: conv.conversation?.maxAutoResponses || 3,
        currentAutoResponseCount: conv.conversation?.currentAutoResponseCount || 0,
        messageCount: conv.conversation?.messages?.length || 0,
        lastCheckedAt: conv.conversation?.lastCheckedAt,
      },
      status: conv.status,
      followUp: conv.followUp,
      icpMatch: {
        relevanceScore: conv.icpMatch.relevanceScore,
      },
      engagedAt: conv.engagedAt,
    }));

    return NextResponse.json({
      conversations: formattedConversations,
      stats,
      pagination: {
        limit,
        offset,
        hasMore: conversations.length === limit,
      },
    });

  } catch (error) {
    log.error('Error fetching conversations', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectToDatabase();

    const body = await request.json();
    const { action, conversationId } = body;

    if (!action || !conversationId) {
      return NextResponse.json(
        { error: 'action and conversationId are required' },
        { status: 400 }
      );
    }

    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    // Authorization: resolve the conversation's owning page and confirm the
    // caller owns it before mutating auto-response settings. (issue #17)
    const engagement = await ICPEngagement.findById(conversationId)
      .select('pageId')
      .lean<{ pageId: mongoose.Types.ObjectId }>();
    if (!engagement || !(await userOwnsPage(session, engagement.pageId))) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    switch (action) {
      case 'disable_auto_response':
        await disableAutoResponse(conversationId);
        return NextResponse.json({ success: true, message: 'Auto-response disabled' });

      case 'enable_auto_response':
        await ICPEngagement.updateOne(
          { _id: conversationId },
          { $set: { 'conversation.autoResponseEnabled': true } }
        );
        return NextResponse.json({ success: true, message: 'Auto-response enabled' });

      case 'reset_response_count':
        await ICPEngagement.updateOne(
          { _id: conversationId },
          { $set: { 'conversation.currentAutoResponseCount': 0 } }
        );
        return NextResponse.json({ success: true, message: 'Response count reset' });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }

  } catch (error) {
    log.error('Error managing conversation', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}