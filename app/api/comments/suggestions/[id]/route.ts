import type { NextRequest} from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import connectToDatabase from '@/lib/mongodb';
import User from '@/lib/models/User';
import CommentSuggestion from '@/lib/models/CommentSuggestion';
import { logger } from '@/lib/logger';

const log = logger.child('api:comments:suggestions:[id]');

// POST /api/comments/suggestions/[id]/action - Approve, skip, or mark as posted
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { action, editedComment, skippedReason } = body;

    if (!action || !['approve', 'skip', 'posted', 'regenerate'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const suggestion = await CommentSuggestion.findOne({
      _id: id,
      userId: user._id,
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    switch (action) {
      case 'approve':
        suggestion.status = 'approved';
        if (editedComment) {
          suggestion.editedComment = editedComment;
        }
        break;

      case 'skip':
        suggestion.status = 'skipped';
        suggestion.skippedReason = skippedReason || 'Manually skipped';
        break;

      case 'posted':
        suggestion.status = 'posted';
        suggestion.postedAt = new Date();
        if (editedComment) {
          suggestion.editedComment = editedComment;
        }
        break;

      case 'regenerate':
        // Re-generate comment with potentially different style
        const { generateComment } = await import('@/lib/openai');
        const newComment = await generateComment({
          postContent: suggestion.postContent,
          postAuthor: suggestion.postAuthor,
          style: body.style || suggestion.style,
        });
        suggestion.suggestedComment = newComment;
        suggestion.editedComment = undefined;
        suggestion.status = 'pending';
        break;
    }

    await suggestion.save();

    return NextResponse.json({
      success: true,
      suggestion,
    });
  } catch (error) {
    log.error('Suggestion action error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}

// GET /api/comments/suggestions/[id] - Get a single suggestion
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const suggestion = await CommentSuggestion.findOne({
      _id: id,
      userId: user._id,
    });

    if (!suggestion) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    return NextResponse.json({ suggestion });
  } catch (error) {
    log.error('Suggestion fetch error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to fetch suggestion' }, { status: 500 });
  }
}

// DELETE /api/comments/suggestions/[id] - Delete a suggestion
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    await connectToDatabase();

    const user = await User.findOne({ email: session.user.email });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const result = await CommentSuggestion.deleteOne({
      _id: id,
      userId: user._id,
    });

    if (result.deletedCount === 0) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    log.error('Suggestion delete error', { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ error: 'Failed to delete suggestion' }, { status: 500 });
  }
}
