/**
 * ICP Engagement Model
 * 
 * Tracks all engagement activities with ICP prospects on social platforms.
 * Used for:
 * - Preventing duplicate engagement (cooldown)
 * - Tracking what works (learning loop)
 * - Measuring ROI of engagement efforts
 */

import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// ============================================
// Types
// ============================================

export interface IICPEngagement extends Document {
  pageId: mongoose.Types.ObjectId;
  platform: 'twitter' | 'linkedin';
  
  // The post we engaged with
  targetPost: {
    id: string;
    content: string;
    url?: string;
    metrics?: {
      likes: number;
      retweets?: number;
      replies?: number;
      comments?: number;
    };
  };
  
  // The user we engaged with
  targetUser: {
    id: string;
    username?: string;
    name?: string;
    bio?: string;
    followersCount?: number;
    isVerified?: boolean;
  };
  
  // Our engagement
  ourReply: {
    id?: string;
    content: string;
    url?: string;
  };
  
  // ICP match data
  icpMatch: {
    relevanceScore: number;           // 0-10
    matchedPainPoints: string[];
    matchedTopics: string[];
    searchQuery?: string;             // Query that found this post
  };
  
  // Status & outcomes
  status: 'sent' | 'got_reply' | 'got_like' | 'got_follow' | 'conversation' | 'ignored';
  
  // Follow-up tracking
  followUp?: {
    theyReplied: boolean;
    theyLiked: boolean;
    theyFollowed: boolean;
    weRepliedAgain: boolean;
    conversationLength: number;
  };
  
  // Conversation tracking for bidirectional engagement
  conversation?: {
    threadId: string;                     // Twitter conversation_id or LinkedIn comment thread
    lastCheckedAt?: Date;                 // When we last checked for new replies
    autoResponseEnabled: boolean;          // Whether to automatically respond to new replies
    maxAutoResponses: number;             // Max auto-responses to prevent spam (default: 3)
    currentAutoResponseCount: number;     // How many auto-responses we've sent
    messages: {
      id: string;                         // Tweet/comment ID
      authorId: string;                   // Who sent it (us or them)
      content: string;                    // Message content
      timestamp: Date;                    // When it was sent
      isFromUs: boolean;                  // true if we sent it, false if they did
      url?: string;                       // Link to the message
    }[];
  };
  
  // Timestamps
  engagedAt: Date;
  lastCheckedAt?: Date;
  
  // Metadata
  dryRun?: boolean;
  agentVersion?: string;
}

// ============================================
// Schema
// ============================================

const ICPEngagementSchema = new Schema<IICPEngagement>(
  {
    pageId: {
      type: Schema.Types.ObjectId,
      ref: 'Page',
      required: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ['twitter', 'linkedin'],
      required: true,
    },
    targetPost: {
      id: { type: String, required: true },
      content: { type: String, required: true },
      url: String,
      metrics: {
        likes: Number,
        retweets: Number,
        replies: Number,
        comments: Number,
      },
    },
    targetUser: {
      id: { type: String, required: true, index: true },
      username: String,
      name: String,
      bio: String,
      followersCount: Number,
      isVerified: Boolean,
    },
    ourReply: {
      id: String,
      content: { type: String, required: true },
      url: String,
    },
    icpMatch: {
      relevanceScore: { type: Number, required: true },
      matchedPainPoints: [String],
      matchedTopics: [String],
      searchQuery: String,
    },
    status: {
      type: String,
      enum: ['sent', 'got_reply', 'got_like', 'got_follow', 'conversation', 'ignored'],
      default: 'sent',
    },
    followUp: {
      theyReplied: { type: Boolean, default: false },
      theyLiked: { type: Boolean, default: false },
      theyFollowed: { type: Boolean, default: false },
      weRepliedAgain: { type: Boolean, default: false },
      conversationLength: { type: Number, default: 1 },
    },
    conversation: {
      threadId: String,
      lastCheckedAt: Date,
      autoResponseEnabled: { type: Boolean, default: true },
      maxAutoResponses: { type: Number, default: 3 },
      currentAutoResponseCount: { type: Number, default: 0 },
      messages: [{
        id: { type: String, required: true },
        authorId: { type: String, required: true },
        content: { type: String, required: true },
        timestamp: { type: Date, required: true },
        isFromUs: { type: Boolean, required: true },
        url: String,
      }],
    },
    engagedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    lastCheckedAt: Date,
    dryRun: Boolean,
    agentVersion: String,
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
ICPEngagementSchema.index({ pageId: 1, 'targetUser.id': 1, engagedAt: -1 });
ICPEngagementSchema.index({ pageId: 1, platform: 1, engagedAt: -1 });
ICPEngagementSchema.index({ pageId: 1, status: 1 });
ICPEngagementSchema.index({ 'targetPost.id': 1 }, { unique: true });

// ============================================
// Statics
// ============================================

ICPEngagementSchema.statics.getEngagementStats = async function(
  pageId: mongoose.Types.ObjectId,
  days: number = 30
): Promise<{
  total: number;
  gotReply: number;
  gotLike: number;
  gotFollow: number;
  conversations: number;
  avgRelevanceScore: number;
  topPerformingQueries: { query: string; engagements: number; responses: number }[];
}> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  
  const stats = await this.aggregate([
    { $match: { pageId, engagedAt: { $gte: cutoff } } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        gotReply: { $sum: { $cond: ['$followUp.theyReplied', 1, 0] } },
        gotLike: { $sum: { $cond: ['$followUp.theyLiked', 1, 0] } },
        gotFollow: { $sum: { $cond: ['$followUp.theyFollowed', 1, 0] } },
        conversations: { $sum: { $cond: [{ $gte: ['$followUp.conversationLength', 2] }, 1, 0] } },
        avgRelevanceScore: { $avg: '$icpMatch.relevanceScore' },
      },
    },
  ]);

  const queryStats = await this.aggregate([
    { $match: { pageId, engagedAt: { $gte: cutoff }, 'icpMatch.searchQuery': { $exists: true } } },
    {
      $group: {
        _id: '$icpMatch.searchQuery',
        engagements: { $sum: 1 },
        responses: { $sum: { $cond: ['$followUp.theyReplied', 1, 0] } },
      },
    },
    { $sort: { responses: -1 } },
    { $limit: 10 },
  ]);

  const result = stats[0] || {
    total: 0,
    gotReply: 0,
    gotLike: 0,
    gotFollow: 0,
    conversations: 0,
    avgRelevanceScore: 0,
  };

  return {
    ...result,
    topPerformingQueries: queryStats.map(q => ({
      query: q._id,
      engagements: q.engagements,
      responses: q.responses,
    })),
  };
};

// ============================================
// Model
// ============================================

interface ICPEngagementModel extends Model<IICPEngagement> {
  getEngagementStats(
    pageId: mongoose.Types.ObjectId,
    days?: number
  ): Promise<{
    total: number;
    gotReply: number;
    gotLike: number;
    gotFollow: number;
    conversations: number;
    avgRelevanceScore: number;
    topPerformingQueries: { query: string; engagements: number; responses: number }[];
  }>;
}

const ICPEngagement = (mongoose.models.ICPEngagement as ICPEngagementModel) ||
  mongoose.model<IICPEngagement, ICPEngagementModel>('ICPEngagement', ICPEngagementSchema);

export default ICPEngagement;
