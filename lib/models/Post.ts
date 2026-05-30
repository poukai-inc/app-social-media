import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { PlatformType } from '../platforms/types';

export type PostStatus = 'draft' | 'pending_approval' | 'scheduled' | 'published' | 'partially_published' | 'failed' | 'rejected';
export type PostMode = 'manual' | 'structured' | 'ai' | 'blog_repurpose';
export type RiskLevel = 'low' | 'medium' | 'high';
export type ApprovalDecision = 'pending' | 'approved' | 'rejected' | 'edited';
export type PostAngle = 'problem_recognition' | 'war_story' | 'opinionated_take' | 'insight' | 'how_to' | 'case_study';
export type PlatformPublishStatus = 'pending' | 'publishing' | 'published' | 'failed' | 'skipped';

export interface StructuredInput {
  title?: string;
  problem?: string;
  solution?: string;
  tech?: string[];
  outcome?: string;
  cta?: string;
  customFields?: Record<string, string>;
}

export interface MediaItem {
  id: string;
  url: string;
  type: 'image' | 'video';
  filename: string;
  mimeType: string;
  size: number;
}

// AI scoring and analysis
export interface AIAnalysis {
  confidence: number; // 0-1 score
  riskLevel: RiskLevel;
  riskReasons?: string[];
  angle: PostAngle;
  estimatedEngagement: 'low' | 'medium' | 'high';
  suggestedTiming?: string;
  aiReasoning?: string; // Why AI thinks this will work
}

// Approval workflow
export interface ApprovalInfo {
  decision: ApprovalDecision;
  decidedAt?: Date;
  decidedBy?: string; // 'auto' or user email
  approvalToken?: string; // For email approval links
  tokenExpiresAt?: Date;
  feedbackNote?: string;
}

// Performance tracking
export interface PostPerformance {
  impressions?: number;
  reactions?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  profileViews?: number; // Correlated profile views after post
  clarityPageVisits?: number; // Tracked via UTM
  lastUpdated?: Date;
}

// Blog source tracking
export interface BlogSource {
  url: string;
  title?: string;
  extractedInsights?: string[];
  generatedAngles?: string[];
}

// Database/API source content tracking
export interface SourceContent {
  id: string;           // ID from the source database
  title: string;        // Title of the source content
  type: 'database' | 'api' | 'rss';  // Type of data source
  sourceId?: string;    // ID of the data source configuration
  fetchedAt?: Date;     // When the content was fetched
}

// Platform-specific content version
export interface PlatformContent {
  platform: PlatformType;
  content: string;
  adaptedAt: Date;
  hashtags?: string[];
  charCount: number;
}

// Platform publish result tracking
export interface PlatformPublishResult {
  platform: PlatformType;
  status: PlatformPublishStatus;
  postId?: string; // Platform-specific post ID
  postUrl?: string;
  publishedAt?: Date;
  error?: string;
  retryCount: number;
  lastRetryAt?: Date;
  // Platform-specific metrics
  metrics?: {
    impressions?: number;
    reactions?: number;
    comments?: number;
    shares?: number;
    clicks?: number;
    lastUpdated?: Date;
  };
}

export interface IPost extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  pageId?: mongoose.Types.ObjectId; // Reference to the Page this post belongs to
  mode: PostMode;
  content: string;
  generatedContent?: string; // AI-generated content before user edits
  structuredInput?: StructuredInput;
  aiPrompt?: string;
  media: MediaItem[];
  scheduledFor?: Date;
  publishedAt?: Date;
  status: PostStatus;
  // Concurrency claim marker for the publish cron: set when a worker begins
  // publishing a scheduled post so overlapping/post-lock-TTL runs skip it.
  // Cleared on terminal status. (issue #16)
  publishStartedAt?: Date;
  linkedinPostId?: string; // DEPRECATED: Use platformResults instead
  error?: string;
  // Organization posting support
  postAs: 'person' | 'organization';
  organizationId?: string;
  organizationName?: string;
  // AI Analysis & Scoring
  aiAnalysis?: AIAnalysis;
  // Approval workflow
  approval?: ApprovalInfo;
  requiresApproval: boolean;
  // Content flags
  includesLink: boolean;
  linkUrl?: string;
  // Blog repurposing
  blogSource?: BlogSource;
  // Database/API source content
  sourceContent?: SourceContent;
  // Performance tracking (DEPRECATED: Use platformResults.metrics instead)
  performance?: PostPerformance;
  // Learning loop
  outcomeRating?: 'poor' | 'average' | 'good' | 'excellent'; // Manual rating for learning
  
  // Multi-platform support
  targetPlatforms: PlatformType[]; // Which platforms to publish to
  platformContent?: PlatformContent[]; // Platform-adapted versions of content
  platformResults?: PlatformPublishResult[]; // Publishing results per platform
  
  // Learning metadata - tracks if/how learning was used
  learningMetadata?: {
    usedLearning: boolean;
    platform: PlatformType;
    recommendedAngle?: string;
    timingSource?: 'learned' | 'default';
    learningDataPoints?: number; // How many data points were used
  };
  
  // AI Review - autonomous quality review for auto-publishing
  aiReview?: {
    decision: 'publish' | 'needs_revision' | 'reject';
    overallScore: number; // 0-100
    confidence: number; // 0-1
    criteria: {
      contentQuality: number; // 0-10
      brandAlignment: number; // 0-10
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      riskConcerns: string[];
      engagementPotential: number; // 0-10
      platformFit: number; // 0-10
    };
    reasoning: string;
    suggestedRevisions?: string[];
    reviewedAt: Date;
  };
  
  createdAt: Date;
  updatedAt: Date;
}

const MediaItemSchema = new Schema<MediaItem>(
  {
    id: { type: String, required: true },
    url: { type: String, required: true },
    type: { type: String, enum: ['image', 'video'], required: true },
    filename: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const StructuredInputSchema = new Schema<StructuredInput>(
  {
    title: String,
    problem: String,
    solution: String,
    tech: [String],
    outcome: String,
    cta: String,
    customFields: { type: Map, of: String },
  },
  { _id: false }
);

const AIAnalysisSchema = new Schema<AIAnalysis>(
  {
    confidence: { type: Number, min: 0, max: 1 },
    riskLevel: { type: String, enum: ['low', 'medium', 'high'] },
    riskReasons: [String],
    angle: { 
      type: String, 
      enum: ['problem_recognition', 'war_story', 'opinionated_take', 'insight', 'how_to', 'case_study'] 
    },
    estimatedEngagement: { type: String, enum: ['low', 'medium', 'high'] },
    suggestedTiming: String,
    aiReasoning: String,
  },
  { _id: false }
);

const ApprovalInfoSchema = new Schema<ApprovalInfo>(
  {
    decision: { 
      type: String, 
      enum: ['pending', 'approved', 'rejected', 'edited'],
      default: 'pending'
    },
    decidedAt: Date,
    decidedBy: String,
    approvalToken: String,
    tokenExpiresAt: Date,
    feedbackNote: String,
  },
  { _id: false }
);

const PostPerformanceSchema = new Schema<PostPerformance>(
  {
    impressions: Number,
    reactions: Number,
    comments: Number,
    shares: Number,
    clicks: Number,
    profileViews: Number,
    clarityPageVisits: Number,
    lastUpdated: Date,
  },
  { _id: false }
);

const BlogSourceSchema = new Schema<BlogSource>(
  {
    url: { type: String, required: true },
    title: String,
    extractedInsights: [String],
    generatedAngles: [String],
  },
  { _id: false }
);

const SourceContentSchema = new Schema<SourceContent>(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    type: { type: String, enum: ['database', 'api', 'rss'], required: true },
    sourceId: String,
    fetchedAt: Date,
  },
  { _id: false }
);

const PlatformContentSchema = new Schema<PlatformContent>(
  {
    platform: { 
      type: String, 
      enum: ['linkedin', 'facebook', 'twitter', 'instagram'],
      required: true 
    },
    content: { type: String, required: true },
    adaptedAt: { type: Date, default: Date.now },
    hashtags: [String],
    charCount: { type: Number, required: true },
  },
  { _id: false }
);

const PlatformMetricsSchema = new Schema(
  {
    impressions: Number,
    reactions: Number,
    comments: Number,
    shares: Number,
    clicks: Number,
    lastUpdated: Date,
  },
  { _id: false }
);

const PlatformPublishResultSchema = new Schema<PlatformPublishResult>(
  {
    platform: { 
      type: String, 
      enum: ['linkedin', 'facebook', 'twitter', 'instagram'],
      required: true 
    },
    status: { 
      type: String, 
      enum: ['pending', 'publishing', 'published', 'failed', 'skipped'],
      default: 'pending' 
    },
    postId: String,
    postUrl: String,
    publishedAt: Date,
    error: String,
    retryCount: { type: Number, default: 0 },
    lastRetryAt: Date,
    metrics: PlatformMetricsSchema,
  },
  { _id: false }
);

const PostSchema = new Schema<IPost>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    pageId: {
      type: Schema.Types.ObjectId,
      ref: 'Page',
    },
    mode: {
      type: String,
      enum: ['manual', 'structured', 'ai', 'blog_repurpose'],
      default: 'manual',
    },
    content: {
      type: String,
      required: true,
      maxlength: 3000, // LinkedIn character limit
    },
    generatedContent: {
      type: String,
    },
    structuredInput: StructuredInputSchema,
    aiPrompt: {
      type: String,
    },
    media: {
      type: [MediaItemSchema],
      default: [],
    },
    scheduledFor: {
      type: Date,
    },
    publishedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_approval', 'scheduled', 'published', 'partially_published', 'failed', 'rejected'],
      default: 'draft',
    },
    // Publish-cron concurrency claim marker (issue #16)
    publishStartedAt: {
      type: Date,
    },
    linkedinPostId: {
      type: String,
    },
    error: {
      type: String,
    },
    postAs: {
      type: String,
      enum: ['person', 'organization'],
      default: 'person',
    },
    organizationId: {
      type: String,
    },
    organizationName: {
      type: String,
    },
    // AI Analysis & Scoring
    aiAnalysis: AIAnalysisSchema,
    // Approval workflow
    approval: ApprovalInfoSchema,
    requiresApproval: {
      type: Boolean,
      default: false,
    },
    // Content flags
    includesLink: {
      type: Boolean,
      default: false,
    },
    linkUrl: {
      type: String,
    },
    // Blog repurposing
    blogSource: BlogSourceSchema,
    // Database/API source content
    sourceContent: SourceContentSchema,
    // Performance tracking
    performance: PostPerformanceSchema,
    // Learning loop
    outcomeRating: {
      type: String,
      enum: ['poor', 'average', 'good', 'excellent'],
    },
    // Multi-platform support
    targetPlatforms: {
      type: [String],
      enum: ['linkedin', 'facebook', 'twitter', 'instagram'],
      default: ['linkedin'], // Default to LinkedIn for backward compatibility
    },
    platformContent: {
      type: [PlatformContentSchema],
      default: [],
    },
    platformResults: {
      type: [PlatformPublishResultSchema],
      default: [],
    },
    // Learning metadata
    learningMetadata: {
      type: {
        usedLearning: { type: Boolean, default: false },
        platform: { type: String, enum: ['linkedin', 'facebook', 'twitter', 'instagram'] },
        recommendedAngle: { type: String },
        timingSource: { type: String, enum: ['learned', 'default'] },
        learningDataPoints: { type: Number },
      },
      default: undefined,
    },
    // AI Review - autonomous quality assessment
    aiReview: {
      type: {
        decision: { 
          type: String, 
          enum: ['publish', 'needs_revision', 'reject'],
          required: true 
        },
        overallScore: { type: Number, min: 0, max: 100, required: true },
        confidence: { type: Number, min: 0, max: 1, required: true },
        criteria: {
          type: {
            contentQuality: { type: Number, min: 0, max: 10 },
            brandAlignment: { type: Number, min: 0, max: 10 },
            riskLevel: { type: String, enum: ['low', 'medium', 'high', 'critical'] },
            riskConcerns: [String],
            engagementPotential: { type: Number, min: 0, max: 10 },
            platformFit: { type: Number, min: 0, max: 10 },
          },
          required: true,
        },
        reasoning: { type: String, required: true },
        suggestedRevisions: [String],
        reviewedAt: { type: Date, default: Date.now },
      },
      default: undefined,
    },
  },
  {
    timestamps: true,
  }
);

// Index for efficient querying of scheduled posts
PostSchema.index({ status: 1, scheduledFor: 1 });
PostSchema.index({ userId: 1, createdAt: -1 });
PostSchema.index({ pageId: 1, status: 1 }); // For page-specific post queries
PostSchema.index({ pageId: 1, createdAt: -1 }); // For page post listing
PostSchema.index({ 'approval.approvalToken': 1 }); // For email approval lookups
PostSchema.index({ status: 1, requiresApproval: 1 }); // For pending approvals
PostSchema.index({ 'platformResults.platform': 1, 'platformResults.status': 1 }); // For platform status queries
PostSchema.index({ targetPlatforms: 1 }); // For filtering by target platforms

const Post: Model<IPost> = mongoose.models.Post || mongoose.model<IPost>('Post', PostSchema);

export default Post;
