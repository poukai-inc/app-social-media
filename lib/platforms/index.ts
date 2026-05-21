import type { IPlatformAdapter, PlatformType} from './types';
import { PLATFORM_CONFIGS } from './types';
import { linkedInAdapter } from './linkedin-adapter';
import { facebookAdapter } from './facebook-adapter';
import { twitterAdapter } from './twitter-adapter';

/**
 * Platform Registry
 * Central registry for all platform adapters
 */
class PlatformRegistry {
  private adapters: Map<PlatformType, IPlatformAdapter> = new Map();

  constructor() {
    // Register built-in adapters
    this.register(linkedInAdapter);
    this.register(facebookAdapter);
    this.register(twitterAdapter);
  }

  /**
   * Register a platform adapter
   */
  register(adapter: IPlatformAdapter): void {
    this.adapters.set(adapter.platform, adapter);
  }

  /**
   * Get an adapter by platform type
   */
  getAdapter(platform: PlatformType): IPlatformAdapter | undefined {
    return this.adapters.get(platform);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): IPlatformAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Get all supported platforms
   */
  getSupportedPlatforms(): PlatformType[] {
    return Array.from(this.adapters.keys());
  }

  /**
   * Check if a platform is supported
   */
  isSupported(platform: PlatformType): boolean {
    return this.adapters.has(platform);
  }

  /**
   * Get platform configuration
   */
  getConfig(platform: PlatformType) {
    return PLATFORM_CONFIGS[platform];
  }

  /**
   * Get all platform configurations
   */
  getAllConfigs() {
    return PLATFORM_CONFIGS;
  }
}

// Export singleton instance
export const platformRegistry = new PlatformRegistry();

// Export individual adapters for direct use
export { linkedInAdapter } from './linkedin-adapter';
export { facebookAdapter } from './facebook-adapter';
export { twitterAdapter } from './twitter-adapter';

// Export schedule optimizer
export * from './schedule-optimizer';

// Export types
export * from './types';
