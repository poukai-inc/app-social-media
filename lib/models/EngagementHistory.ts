import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { PlatformType } from '../platforms/types';

/**
 * Individual metric snapshot at a point in time
 */
export interface MetricSnapshot {
  timestamp: Date;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  clicks: number;
  engagementRate: number;
}

/**
 * Platform-specific engagement data for a post
 */
export interface PlatformEngagement {
  platform: PlatformType;
  platformPostId: string;
  platformPostUrl?: string;
  publishedAt: Date;
  
  // Current metrics (latest snapshot)
  currentMetrics: {
    impressions: number;
    reach: number;
    likes: number;
    comments: number;
    shares: number;
    clicks: number;
    engagementRate: number;
  };
  
  // Historical snapshots for trend analysis
  metricHistory: MetricSnapshot[];
  
  // Timing analysis
  timing: {
    dayOfWeek: number;      // 0-6 (Sunday-Saturday)
    hourOfDay: number;      // 0-23
    timezone: string;
  };
  
  // Performance classification (calculated)
  performanceScore: number;  // 0-100 normalized score
  performanceTier: 'top' | 'above_average' | 'average' | 'below_average' | 'poor';
  
  lastUpdated: Date;
}

/**
 * Engagement history document - tracks all engagement for a post across platforms
 */
export interface IEngagementHistory extends Document {
  _id: mongoose.Types.ObjectId;
  postId: mongoose.Types.ObjectId;
  pageId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  
  // Original content metadata
  contentMetadata: {
    angle: string;
    topic: string;
    contentLength: number;
    hasMedia: boolean;
    mediaType?: 'image' | 'video' | 'none';
    hashtags: string[];
  };
  
  // Per-platform engagement data
  platforms: PlatformEngagement[];
  
  // Aggregate stats across all platforms
  aggregateStats: {
    totalImpressions: number;
    totalReactions: number;
    totalComments: number;
    totalShares: number;
    avgEngagementRate: number;
    bestPerformingPlatform?: PlatformType;
  };
  
  // Learning metadata
  isProcessedForLearning: boolean;
  learningProcessedAt?: Date;
  
  createdAt: Date;
  updatedAt: Date;
}

const MetricSnapshotSchema = new Schema<MetricSnapshot>(
  {
    timestamp: { type: Date, required: true },
    impressions: { type: Number, default: 0 },
    reach: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    engagementRate: { type: Number, default: 0 },
  },
  { _id: false }
);

const PlatformEngagementSchema = new Schema<PlatformEngagement>(
  {
    platform: {
      type: String,
      enum: ['linkedin', 'facebook', 'twitter', 'instagram'],
      required: true,
    },
    platformPostId: { type: String, required: true },
    platformPostUrl: { type: String },
    publishedAt: { type: Date, required: true },
    
    currentMetrics: {
      impressions: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      engagementRate: { type: Number, default: 0 },
    },
    
    metricHistory: [MetricSnapshotSchema],
    
    timing: {
      dayOfWeek: { type: Number, required: true },
      hourOfDay: { type: Number, required: true },
      timezone: { type: String, default: 'UTC' },
    },
    
    performanceScore: { type: Number, default: 0 },
    performanceTier: {
      type: String,
      enum: ['top', 'above_average', 'average', 'below_average', 'poor'],
      default: 'average',
    },
    
    lastUpdated: { type: Date, default: Date.now },
  },
  { _id: false }
);

const EngagementHistorySchema = new Schema<IEngagementHistory>(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    pageId: { type: Schema.Types.ObjectId, ref: 'Page', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    
    contentMetadata: {
      angle: { type: String },
      topic: { type: String },
      contentLength: { type: Number, default: 0 },
      hasMedia: { type: Boolean, default: false },
      mediaType: { type: String, enum: ['image', 'video', 'none'] },
      hashtags: [{ type: String }],
    },
    
    platforms: [PlatformEngagementSchema],
    
    aggregateStats: {
      totalImpressions: { type: Number, default: 0 },
      totalReactions: { type: Number, default: 0 },
      totalComments: { type: Number, default: 0 },
      totalShares: { type: Number, default: 0 },
      avgEngagementRate: { type: Number, default: 0 },
      bestPerformingPlatform: { type: String, enum: ['linkedin', 'facebook', 'twitter', 'instagram'] },
    },
    
    isProcessedForLearning: { type: Boolean, default: false },
    learningProcessedAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
EngagementHistorySchema.index({ pageId: 1, 'platforms.platform': 1 });
EngagementHistorySchema.index({ pageId: 1, 'platforms.performanceTier': 1 });
EngagementHistorySchema.index({ pageId: 1, 'platforms.timing.dayOfWeek': 1, 'platforms.timing.hourOfDay': 1 });
EngagementHistorySchema.index({ isProcessedForLearning: 1, createdAt: 1 });

const EngagementHistory: Model<IEngagementHistory> =
  mongoose.models.EngagementHistory || mongoose.model<IEngagementHistory>('EngagementHistory', EngagementHistorySchema);

export default EngagementHistory;
