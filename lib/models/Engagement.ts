import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

// ============================================
// Engagement Target - Posts from others to engage with
// ============================================

export type EngagementType = 'like' | 'comment' | 'both';
export type EngagementStatus = 'pending' | 'approved' | 'engaged' | 'failed' | 'skipped';

export interface IEngagementTarget extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  postUrl: string;
  postUrn?: string;
  postAuthor?: string;
  postContent?: string;
  engagementType: EngagementType;
  aiGeneratedComment?: string;
  userEditedComment?: string;
  status: EngagementStatus;
  scheduledFor?: Date;
  engagedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EngagementTargetSchema = new Schema<IEngagementTarget>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    postUrl: {
      type: String,
      required: true,
    },
    postUrn: {
      type: String,
    },
    postAuthor: {
      type: String,
    },
    postContent: {
      type: String,
    },
    engagementType: {
      type: String,
      enum: ['like', 'comment', 'both'],
      default: 'both',
    },
    aiGeneratedComment: {
      type: String,
    },
    userEditedComment: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'engaged', 'failed', 'skipped'],
      default: 'pending',
    },
    scheduledFor: {
      type: Date,
    },
    engagedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
EngagementTargetSchema.index({ userId: 1, status: 1 });
EngagementTargetSchema.index({ scheduledFor: 1, status: 1 });
EngagementTargetSchema.index({ status: 1, scheduledFor: 1, userId: 1 }); // engage cron distinct + scheduled scan (issue #28)

export const EngagementTarget: Model<IEngagementTarget> =
  mongoose.models.EngagementTarget ||
  mongoose.model<IEngagementTarget>('EngagementTarget', EngagementTargetSchema);

// ============================================
// Comment Reply - Replies to comments on YOUR posts
// ============================================

export type ReplyStatus = 'pending' | 'approved' | 'replied' | 'skipped' | 'failed';

export interface ICommentReply extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  linkedinPostUrn: string;
  commentUrn: string;
  commenterName: string;
  commenterProfileUrl?: string;
  commentText: string;
  aiGeneratedReply?: string;
  userEditedReply?: string;
  status: ReplyStatus;
  repliedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommentReplySchema = new Schema<ICommentReply>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    postId: {
      type: Schema.Types.ObjectId,
      ref: 'Post',
      required: true,
    },
    linkedinPostUrn: {
      type: String,
      required: true,
    },
    commentUrn: {
      type: String,
      required: true,
      unique: true,
    },
    commenterName: {
      type: String,
      required: true,
    },
    commenterProfileUrl: {
      type: String,
    },
    commentText: {
      type: String,
      required: true,
    },
    aiGeneratedReply: {
      type: String,
    },
    userEditedReply: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'replied', 'skipped', 'failed'],
      default: 'pending',
    },
    repliedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying
CommentReplySchema.index({ userId: 1, status: 1 });
CommentReplySchema.index({ postId: 1 });
// Note: commentUrn already has unique:true in schema which creates an index

export const CommentReply: Model<ICommentReply> =
  mongoose.models.CommentReply ||
  mongoose.model<ICommentReply>('CommentReply', CommentReplySchema);

// ============================================
// Engagement Settings - User preferences
// ============================================

export interface IEngagementSettings extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  autoReplyEnabled: boolean;
  autoEngageEnabled: boolean;
  requireApproval: boolean;
  dailyEngagementLimit: number;
  dailyReplyLimit: number;
  engagementDelay: number; // Minutes between engagements
  engagementStyle: 'professional' | 'casual' | 'friendly' | 'thoughtful';
  createdAt: Date;
  updatedAt: Date;
}

const EngagementSettingsSchema = new Schema<IEngagementSettings>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    autoReplyEnabled: {
      type: Boolean,
      default: false,
    },
    autoEngageEnabled: {
      type: Boolean,
      default: false,
    },
    requireApproval: {
      type: Boolean,
      default: true,
    },
    dailyEngagementLimit: {
      type: Number,
      default: 20,
    },
    dailyReplyLimit: {
      type: Number,
      default: 30,
    },
    engagementDelay: {
      type: Number,
      default: 15, // 15 minutes between engagements
    },
    engagementStyle: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'thoughtful'],
      default: 'professional',
    },
  },
  {
    timestamps: true,
  }
);

export const EngagementSettings: Model<IEngagementSettings> =
  mongoose.models.EngagementSettings ||
  mongoose.model<IEngagementSettings>('EngagementSettings', EngagementSettingsSchema);

// Default settings factory
export async function getOrCreateEngagementSettings(
  userId: mongoose.Types.ObjectId
): Promise<IEngagementSettings> {
  let settings = await EngagementSettings.findOne({ userId });
  if (!settings) {
    settings = await EngagementSettings.create({ userId });
  }
  return settings;
}
