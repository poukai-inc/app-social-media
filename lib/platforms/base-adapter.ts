import type {
  IPlatformAdapter,
  PlatformContent,
  PlatformPublishResult,
  PlatformMetrics,
  MediaUploadResult,
  ContentStrategyInput,
  PlatformType} from './types';
import {
  PLATFORM_CONFIGS,
} from './types';
import type { IPlatformConnection } from '../models/Page';

/**
 * Base class for platform adapters
 * Provides common functionality and enforces the adapter interface
 */
export abstract class BasePlatformAdapter implements IPlatformAdapter {
  abstract platform: PlatformType;

  /**
   * Get the platform configuration
   */
  get config() {
    return PLATFORM_CONFIGS[this.platform];
  }

  /**
   * Adapt content for this platform
   * Can be overridden by specific adapters for custom behavior
   */
  abstract adaptContent(
    baseContent: string,
    strategy?: ContentStrategyInput
  ): Promise<PlatformContent>;

  /**
   * Publish content to the platform
   */
  abstract publish(
    connection: IPlatformConnection,
    content: PlatformContent,
    media?: MediaUploadResult[]
  ): Promise<PlatformPublishResult>;

  /**
   * Upload media to the platform (optional)
   */
  uploadMedia?(
    connection: IPlatformConnection,
    mediaUrl: string,
    mediaType: 'image' | 'video'
  ): Promise<MediaUploadResult>;

  /**
   * Fetch post metrics from the platform (optional)
   */
  fetchMetrics?(
    connection: IPlatformConnection,
    postId: string
  ): Promise<PlatformMetrics>;

  /**
   * Refresh the access token (optional)
   */
  refreshToken?(connection: IPlatformConnection): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>;

  /**
   * Validate that the connection is still valid
   */
  abstract validateConnection(connection: IPlatformConnection): Promise<boolean>;

  /**
   * Helper to truncate content to platform limits
   */
  protected truncateContent(content: string, maxLength?: number): string {
    const limit = maxLength || this.config.maxCharacters;
    if (content.length <= limit) return content;
    
    // Try to truncate at a sentence boundary
    const truncated = content.substring(0, limit - 3);
    const lastSentence = truncated.lastIndexOf('.');
    const lastNewline = truncated.lastIndexOf('\n');
    const breakPoint = Math.max(lastSentence, lastNewline);
    
    if (breakPoint > limit * 0.7) {
      return truncated.substring(0, breakPoint + 1);
    }
    
    return truncated + '...';
  }

  /**
   * Helper to extract hashtags from content
   */
  protected extractHashtags(content: string): string[] {
    const hashtagRegex = /#[\w]+/g;
    return content.match(hashtagRegex) || [];
  }

  /**
   * Helper to remove hashtags from content
   */
  protected removeHashtags(content: string): string {
    return content.replace(/#[\w]+/g, '').trim();
  }

  /**
   * Helper to add hashtags to content
   */
  protected addHashtags(content: string, hashtags: string[]): string {
    const cleanContent = this.removeHashtags(content).trim();
    if (hashtags.length === 0) return cleanContent;
    return `${cleanContent}\n\n${hashtags.join(' ')}`;
  }

  /**
   * Helper to check if token is expired
   */
  protected isTokenExpired(connection: IPlatformConnection): boolean {
    if (!connection.tokenExpiresAt) return false;
    return new Date(connection.tokenExpiresAt) <= new Date();
  }

  /**
   * Helper to make API requests with error handling
   */
  protected async makeRequest<T>(
    url: string,
    options: RequestInit,
    connection: IPlatformConnection
  ): Promise<T> {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${connection.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`${this.platform} API error (${response.status}): ${error}`);
    }

    return response.json();
  }
}
