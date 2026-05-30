import type { Document, Model } from 'mongoose';
import mongoose, { Schema } from 'mongoose';
import type { PostAngle } from './Post';
import type { PlatformType, PlatformAccountType } from '../platforms/types';

export type PageType = 'personal' | 'organization' | 'manual';

export interface ContentStrategy {
  persona: string;                    // "Founder building in public"
  topics: string[];                   // ["AI", "startups", "lessons learned"]
  tone: string;                       // "authentic, direct, no marketing fluff"
  targetAudience: string;             // "Technical founders, PMs, early-stage startup people"
  postingFrequency: number;           // Posts per week (e.g., 3)
  preferredAngles: PostAngle[];       // ['war_story', 'insight', 'problem_recognition']
  avoidTopics?: string[];             // Topics to never post about
  customInstructions?: string;        // Additional AI instructions
}

export interface ContentSources {
  blogUrls?: string[];                // Blog URLs to repurpose
  rssFeeds?: string[];                // RSS feeds to monitor
  keywords?: string[];                // Topics/keywords to track for inspiration
  competitorUrls?: string[];          // Competitors to monitor for trends
}

// Database source types
export type DatabaseType = 'mysql' | 'postgresql' | 'mongodb';

export interface DatabaseSource {
  id: string;                         // Unique identifier
  name: string;                       // Display name (e.g., "Sales CRM", "Product Analytics")
  type: DatabaseType;                 // Database type
  connectionString: string;           // Encrypted connection string
  query: string;                      // SQL/query to fetch data
  description?: string;               // What this data represents
  refreshInterval?: number;           // How often to refresh (minutes), 0 = manual only
  lastFetchedAt?: Date;              // Last time data was fetched
  isActive: boolean;                  // Whether to use this source
  fieldMapping?: {                    // Map database fields to content fields
    titleField?: string;              // Field to use as content title/hook
    bodyField?: string;               // Field to use as main content
    dateField?: string;               // Field for date/timestamp
    categoryField?: string;           // Field for categorization
    customFields?: string[];          // Additional fields to include
  };
}

export interface DataSources {
  databases: DatabaseSource[];        // Database connections
  apis?: {                            // Future: API endpoints
    url: string;
    method: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
    refreshInterval?: number;
  }[];
}

export interface PostingSchedule {
  timezone: string;                   // "America/New_York"
  preferredDays: number[];            // [1, 2, 3, 4, 5] = Mon-Fri
  preferredTimes: string[];           // ["09:00", "12:00", "17:00"]
  autoGenerate: boolean;              // Auto-generate posts based on schedule
  autoApprove: boolean;               // Auto-approve high-confidence posts
  minConfidenceForAutoApprove: number; // 0.8 = 80% confidence
}

// Stats aggregated across all platforms
export interface PageStats {
  totalPosts: number;
  publishedPosts: number;
  totalImpressions: number;
  totalReactions: number;
  totalComments: number;
  avgEngagementRate: number;
  lastPostAt?: Date;
  lastUpdated?: Date;
  // Per-platform breakdown
  platformStats?: {
    platform: PlatformType;
    posts: number;
    impressions: number;
    reactions: number;
    comments: number;
  }[];
}

// Platform connection schema for MongoDB
export interface IPlatformConnection {
  platform: PlatformType;
  platformId: string;                 // Platform-specific account/page ID
  platformUsername: string;           // Display name on platform
  accountType?: PlatformAccountType;
  avatarUrl?: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  scopes?: string[];
  isActive: boolean;
  connectedAt: Date;
  lastUsedAt?: Date;
  metadata?: Record<string, unknown>;
  // OAuth 1.0a tokens (required for Twitter media upload)
  oauthToken?: string;
  oauthTokenSecret?: string;
}

export interface IPage extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  
  // Page Identity - This is now the "Brand" identity
  name: string;                       // Brand/persona name
  description?: string;
  avatar?: string;
  
  // Platform Connections - Multiple platforms can be connected
  connections: IPlatformConnection[];
  
  // Legacy LinkedIn fields (for backward compatibility during migration)
  /** @deprecated Use connections array instead */
  type?: PageType;
  /** @deprecated Use connections array instead */
  linkedinId?: string;
  /** @deprecated Use connections array instead */
  organizationId?: string;
  /** @deprecated Use connections array instead */
  vanityName?: string;
  
  // Content Strategy (platform-agnostic, will be adapted per platform)
  contentStrategy: ContentStrategy;
  
  // Content Sources (blogs, RSS, etc.)
  contentSources: ContentSources;
  
  // Data Sources (databases, APIs)
  dataSources: DataSources;
  
  // Scheduling (applies to all connected platforms)
  schedule: PostingSchedule;
  
  // Publishing preferences
  publishTo: {
    platforms: PlatformType[];        // Which platforms to publish to by default
    adaptContent: boolean;            // Whether to adapt content per platform
  };
  
  // Stats (aggregated across all platforms)
  stats: PageStats;
  
  // State
  isActive: boolean;
  isSetupComplete: boolean;
  isManual: boolean;  // True if page was created manually without platform connection
  
  // Page type determines voice in content generation (I vs We)
  pageType: PageType;  // 'personal' = I voice, 'organization' = We voice
  
  createdAt: Date;
  updatedAt: Date;
}

const PlatformConnectionSchema = new Schema<IPlatformConnection>(
  {
    platform: { 
      type: String, 
      enum: ['linkedin', 'facebook', 'twitter', 'instagram'],
      required: true 
    },
    platformId: { type: String, required: true },
    platformUsername: { type: String, required: true },
    accountType: { 
      type: String, 
      enum: ['personal', 'page', 'group'],
      default: 'personal'
    },
    avatarUrl: { type: String },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    tokenExpiresAt: { type: Date },
    scopes: [{ type: String }],
    isActive: { type: Boolean, default: true },
    connectedAt: { type: Date, default: Date.now },
    lastUsedAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
    // OAuth 1.0a tokens (required for Twitter media upload)
    oauthToken: { type: String },
    oauthTokenSecret: { type: String },
  },
  { _id: false }
);

const ContentStrategySchema = new Schema<ContentStrategy>(
  {
    persona: { type: String, required: true },
    topics: [{ type: String }],
    tone: { type: String, required: true },
    targetAudience: { type: String, required: true },
    postingFrequency: { type: Number, default: 3 },
    preferredAngles: [{
      type: String,
      enum: ['problem_recognition', 'war_story', 'opinionated_take', 'insight', 'how_to', 'case_study'],
    }],
    avoidTopics: [{ type: String }],
    customInstructions: { type: String },
  },
  { _id: false }
);

const ContentSourcesSchema = new Schema<ContentSources>(
  {
    blogUrls: [{ type: String }],
    rssFeeds: [{ type: String }],
    keywords: [{ type: String }],
    competitorUrls: [{ type: String }],
  },
  { _id: false }
);

const DatabaseSourceSchema = new Schema<DatabaseSource>(
  {
    id: { type: String, required: true },
    name: { type: String, required: true },
    type: { 
      type: String, 
      enum: ['mysql', 'postgresql', 'mongodb'],
      required: true 
    },
    connectionString: { type: String, required: true },
    query: { type: String, required: true },
    description: { type: String },
    refreshInterval: { type: Number, default: 0 },
    lastFetchedAt: { type: Date },
    isActive: { type: Boolean, default: true },
    fieldMapping: {
      titleField: { type: String },
      bodyField: { type: String },
      dateField: { type: String },
      categoryField: { type: String },
      customFields: [{ type: String }],
    },
  },
  { _id: false }
);

const DataSourcesSchema = new Schema<DataSources>(
  {
    databases: { type: [DatabaseSourceSchema], default: [] },
    apis: [{
      url: { type: String },
      method: { type: String, enum: ['GET', 'POST'] },
      headers: { type: Schema.Types.Mixed },
      body: { type: String },
      refreshInterval: { type: Number },
    }],
  },
  { _id: false }
);

const PostingScheduleSchema = new Schema<PostingSchedule>(
  {
    timezone: { type: String, default: 'UTC' },
    preferredDays: [{ type: Number, min: 0, max: 6 }],
    preferredTimes: [{ type: String }],
    autoGenerate: { type: Boolean, default: false },
    autoApprove: { type: Boolean, default: false },
    minConfidenceForAutoApprove: { type: Number, default: 0.8, min: 0, max: 1 },
  },
  { _id: false }
);

const PlatformStatSchema = new Schema(
  {
    platform: { type: String, enum: ['linkedin', 'facebook', 'twitter', 'instagram'] },
    posts: { type: Number, default: 0 },
    impressions: { type: Number, default: 0 },
    reactions: { type: Number, default: 0 },
    comments: { type: Number, default: 0 },
  },
  { _id: false }
);

const PageStatsSchema = new Schema<PageStats>(
  {
    totalPosts: { type: Number, default: 0 },
    publishedPosts: { type: Number, default: 0 },
    totalImpressions: { type: Number, default: 0 },
    totalReactions: { type: Number, default: 0 },
    totalComments: { type: Number, default: 0 },
    avgEngagementRate: { type: Number, default: 0 },
    lastPostAt: { type: Date },
    lastUpdated: { type: Date },
    platformStats: [PlatformStatSchema],
  },
  { _id: false }
);

const PageSchema = new Schema<IPage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    avatar: {
      type: String,
    },
    
    // Platform connections array
    connections: {
      type: [PlatformConnectionSchema],
      default: [],
    },
    
    // Legacy fields for backward compatibility
    type: {
      type: String,
      enum: ['personal', 'organization', 'manual'],
    },
    linkedinId: {
      type: String,
    },
    organizationId: {
      type: String,
    },
    vanityName: {
      type: String,
    },
    
    contentStrategy: {
      type: ContentStrategySchema,
      required: true,
    },
    contentSources: {
      type: ContentSourcesSchema,
      default: {},
    },
    dataSources: {
      type: DataSourcesSchema,
      default: { databases: [], apis: [] },
    },
    schedule: {
      type: PostingScheduleSchema,
      default: {
        timezone: 'UTC',
        preferredDays: [1, 2, 3, 4, 5],
        preferredTimes: ['09:00', '17:00'],
        autoGenerate: false,
        autoApprove: false,
        minConfidenceForAutoApprove: 0.8,
      },
    },
    publishTo: {
      type: {
        platforms: [{ type: String, enum: ['linkedin', 'facebook', 'twitter', 'instagram'] }],
        adaptContent: { type: Boolean, default: true },
      },
      default: {
        platforms: ['linkedin', 'facebook', 'twitter'],
        adaptContent: true,
      },
    },
    stats: {
      type: PageStatsSchema,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isSetupComplete: {
      type: Boolean,
      default: false,
    },
    isManual: {
      type: Boolean,
      default: false,
    },
    pageType: {
      type: String,
      enum: ['personal', 'organization', 'manual'],
      default: 'personal',
    },
  },
  {
    timestamps: true,
  }
);

// Defense-in-depth: strip OAuth secrets from any serialized Page document.
// NOTE: Mongoose `.lean()` queries bypass these transforms — client-facing
// routes that use `.lean()` must also call `stripPageSecrets` from
// `lib/sanitize-page.ts`. (issue #15)
const stripConnectionSecretsInPlace = (ret: Record<string, unknown>): void => {
  const connections = ret.connections;
  if (Array.isArray(connections)) {
    for (const conn of connections) {
      if (conn && typeof conn === 'object') {
        delete (conn as Record<string, unknown>).accessToken;
        delete (conn as Record<string, unknown>).refreshToken;
        delete (conn as Record<string, unknown>).oauthToken;
        delete (conn as Record<string, unknown>).oauthTokenSecret;
      }
    }
  }
};

PageSchema.set('toJSON', {
  transform: (_doc, ret) => {
    stripConnectionSecretsInPlace(ret as unknown as Record<string, unknown>);
    return ret;
  },
});
PageSchema.set('toObject', {
  transform: (_doc, ret) => {
    stripConnectionSecretsInPlace(ret as unknown as Record<string, unknown>);
    return ret;
  },
});

// Indexes
PageSchema.index({ userId: 1 });
PageSchema.index({ userId: 1, isActive: 1 });
PageSchema.index({ 'connections.platform': 1, 'connections.accountId': 1 });
PageSchema.index({ 'schedule.autoGenerate': 1, isActive: 1 });

// Legacy index - keep for migration period
PageSchema.index({ linkedinId: 1 }, { unique: true, sparse: true });

// Helper methods
PageSchema.methods.getConnection = function(platform: PlatformType): IPlatformConnection | undefined {
  return this.connections.find((c: IPlatformConnection) => c.platform === platform && c.isActive);
};

PageSchema.methods.hasConnection = function(platform: PlatformType): boolean {
  return this.connections.some((c: IPlatformConnection) => c.platform === platform && c.isActive);
};

PageSchema.methods.getActiveConnections = function(): IPlatformConnection[] {
  return this.connections.filter((c: IPlatformConnection) => c.isActive);
};

const Page: Model<IPage> = mongoose.models.Page || mongoose.model<IPage>('Page', PageSchema);

export default Page;
