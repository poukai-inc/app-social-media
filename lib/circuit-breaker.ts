/**
 * Circuit Breaker Pattern for External API Calls
 * 
 * Prevents hammering APIs that are returning errors (403, 429, ETIMEDOUT, etc.)
 * States:
 *   CLOSED  → normal operation, requests pass through
 *   OPEN    → all requests fail fast without calling the API
 *   HALF_OPEN → allow one probe request to test if API is healthy again
 * 
 * Usage:
 *   const breaker = CircuitBreaker.for('linkedin:comments');
 *   if (!breaker.allowRequest()) return { success: false, error: breaker.getRejectionReason() };
 *   try { ... breaker.recordSuccess(); } catch { breaker.recordFailure(error); }
 */

import { logger } from '@/lib/logger';

export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in ms the circuit stays open before transitioning to half-open (default: 15 min) */
  resetTimeoutMs?: number;
  /** Time in ms before the failure counter resets if no new failures occur (default: 60 min) */
  failureWindowMs?: number;
  /** HTTP status codes that should always trip the breaker immediately (e.g. 403) */
  instantTripCodes?: number[];
}

interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureAt: number;
  openedAt: number;
  lastError?: string;
  /**
   * How long the circuit stays OPEN for THIS trip, in ms. Set per-trip so an
   * instant-trip (e.g. 403 → 1h) does not permanently overwrite the breaker's
   * configured resetTimeoutMs. Falls back to options.resetTimeoutMs when unset.
   * (issue #20)
   */
  openTimeoutMs?: number;
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  resetTimeoutMs: 15 * 60 * 1000,    // 15 minutes
  failureWindowMs: 60 * 60 * 1000,   // 1 hour
  instantTripCodes: [403],
};

// Global registry of circuit breakers (survives across requests in the same process)
const breakers = new Map<string, { state: CircuitState; options: Required<CircuitBreakerOptions> }>();

export class CircuitBreaker {
  private key: string;
  private options: Required<CircuitBreakerOptions>;

  private constructor(key: string, options: CircuitBreakerOptions = {}) {
    this.key = key;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    if (!breakers.has(key)) {
      breakers.set(key, {
        state: { state: 'CLOSED', failureCount: 0, lastFailureAt: 0, openedAt: 0 },
        options: this.options,
      });
    }
  }

  /**
   * Get or create a circuit breaker by key.
   * Same key always returns the same underlying state.
   */
  static for(key: string, options?: CircuitBreakerOptions): CircuitBreaker {
    return new CircuitBreaker(key, options);
  }

  private get entry() {
    return breakers.get(this.key)!;
  }

  private get s(): CircuitState {
    return this.entry.state;
  }

  /** Open-duration for the current trip, falling back to the configured default. */
  private get openTimeoutMs(): number {
    return this.s.openTimeoutMs ?? this.options.resetTimeoutMs;
  }

  /**
   * Check whether a request is allowed to proceed.
   */
  allowRequest(): boolean {
    const now = Date.now();

    // If failure window has elapsed since last failure, reset
    if (
      this.s.state === 'CLOSED' &&
      this.s.failureCount > 0 &&
      now - this.s.lastFailureAt > this.options.failureWindowMs
    ) {
      this.s.failureCount = 0;
    }

    switch (this.s.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if enough time has passed to transition to HALF_OPEN
        if (now - this.s.openedAt >= this.openTimeoutMs) {
          this.s.state = 'HALF_OPEN';
          logger.info('circuit-breaker', 'Transitioning to HALF_OPEN — allowing probe request', { key: this.key });
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // Only one probe request at a time
        return true;

      default:
        return true;
    }
  }

  /**
   * Human-readable reason when a request is blocked.
   */
  getRejectionReason(): string {
    const waitSec = Math.ceil(
      (this.openTimeoutMs - (Date.now() - this.s.openedAt)) / 1000
    );
    return `Circuit breaker OPEN for "${this.key}": ${this.s.lastError || 'too many failures'}. ` +
      `Retry in ~${waitSec}s. (${this.s.failureCount} failures)`;
  }

  /**
   * Record a successful API call — resets the breaker to CLOSED.
   */
  recordSuccess(): void {
    if (this.s.state === 'HALF_OPEN') {
      logger.info('circuit-breaker', 'Probe succeeded — closing circuit', { key: this.key });
    }
    this.s.state = 'CLOSED';
    this.s.failureCount = 0;
    this.s.lastError = undefined;
    this.s.openTimeoutMs = undefined;
  }

  /**
   * Record a failed API call.
   * @param error  The error or HTTP status code
   */
  recordFailure(error: string | number | Error): void {
    const now = Date.now();
    const errorMsg = error instanceof Error ? error.message : String(error);
    const statusCode = typeof error === 'number' ? error : undefined;

    this.s.failureCount++;
    this.s.lastFailureAt = now;
    this.s.lastError = errorMsg;

    // Instant trip for specific status codes (e.g. 403 = wrong permissions, won't fix itself)
    if (statusCode && this.options.instantTripCodes.includes(statusCode)) {
      this.s.state = 'OPEN';
      this.s.openedAt = now;
      // For permission errors, use a longer timeout (1 hour) for THIS trip only.
      // Stored on state, not options, so the breaker's configured resetTimeoutMs
      // is not permanently overwritten for every future trip. (issue #20)
      this.s.openTimeoutMs = 60 * 60 * 1000;
      logger.info('circuit-breaker', 'INSTANT TRIP — circuit OPEN for 1 hour', { key: this.key, statusCode });
      return;
    }

    if (this.s.state === 'HALF_OPEN') {
      // Probe failed — go back to OPEN
      this.s.state = 'OPEN';
      this.s.openedAt = now;
      this.s.openTimeoutMs = this.options.resetTimeoutMs;
      logger.info('circuit-breaker', 'Probe failed — circuit back to OPEN', { key: this.key });
      return;
    }

    if (this.s.failureCount >= this.options.failureThreshold) {
      this.s.state = 'OPEN';
      this.s.openedAt = now;
      this.s.openTimeoutMs = this.options.resetTimeoutMs;
      logger.info('circuit-breaker', 'Failure threshold reached — circuit OPEN', { key: this.key, threshold: this.options.failureThreshold });
    }
  }

  /**
   * Get current state for diagnostics.
   */
  getState(): CircuitState & { key: string } {
    return { ...this.s, key: this.key };
  }

  /**
   * Force-reset to CLOSED (e.g. after user reconnects an account).
   */
  reset(): void {
    this.s.state = 'CLOSED';
    this.s.failureCount = 0;
    this.s.lastFailureAt = 0;
    this.s.openedAt = 0;
    this.s.lastError = undefined;
    this.s.openTimeoutMs = undefined;
    logger.info('circuit-breaker', 'Manually reset to CLOSED', { key: this.key });
  }
}

/**
 * Helper: wrap a fetch call with a timeout (AbortController).
 * Node 18+ has native AbortSignal.timeout but we provide a fallback.
 */
export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return response;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request to ${typeof url === 'string' ? url : url.toString()} timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
