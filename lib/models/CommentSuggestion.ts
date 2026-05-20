import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';

export type CommentStatus = 'pending' | 'approved' | 'posted' | 'skipped';
export type CommentSource = 'feed' | 'target_profile' | 'engagement_reply';

export interface ICommentSuggestion extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  // Target post info
  linkedinPostUrl?: string;
  linkedinPostUrn?: string;
  postAuthor: string;
  postAuthorHeadline?: string;
  postContent: string;
  postContentSnippet: string;
  // Generated comment
  suggestedComment: string;
  alternativeComments?: string[];
  editedComment?: string;
  // AI analysis
  relevanceScore: number; // 0-1 how relevant to user's niche
  engagementPotential: 'low' | 'medium' | 'high';
  style: 'professional' | 'casual' | 'friendly' | 'thoughtful';
  // Status
  status: CommentStatus;
  source: CommentSource;
  // Tracking
  postedAt?: Date;
  skippedReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CommentSuggestionSchema = new Schema<ICommentSuggestion>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    linkedinPostUrl: String,
    linkedinPostUrn: String,
    postAuthor: {
      type: String,
      required: true,
    },
    postAuthorHeadline: String,
    postContent: {
      type: String,
      required: true,
    },
    postContentSnippet: {
      type: String,
      required: true,
    },
    suggestedComment: {
      type: String,
      required: true,
    },
    alternativeComments: [String],
    editedComment: String,
    relevanceScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0.5,
    },
    engagementPotential: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    style: {
      type: String,
      enum: ['professional', 'casual', 'friendly', 'thoughtful'],
      default: 'professional',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'posted', 'skipped'],
      default: 'pending',
    },
    source: {
      type: String,
      enum: ['feed', 'target_profile', 'engagement_reply'],
      default: 'feed',
    },
    postedAt: Date,
    skippedReason: String,
  },
  {
    timestamps: true,
  }
);

CommentSuggestionSchema.index({ userId: 1, status: 1 });
CommentSuggestionSchema.index({ userId: 1, createdAt: -1 });

const CommentSuggestion: Model<ICommentSuggestion> = 
  mongoose.models.CommentSuggestion || 
  mongoose.model<ICommentSuggestion>('CommentSuggestion', CommentSuggestionSchema);

export default CommentSuggestion;
